"""Durable per-attempt journal; unknown outcomes are never retried implicitly."""
import contextlib,datetime,json,math,pathlib,sqlite3,time,uuid
from schema import canonical,VERSIONS,digest

def stamp():return datetime.datetime.now(datetime.timezone.utc).isoformat()
class Store:
 def __init__(self,path):
  self.path=pathlib.Path(path);self.path.parent.mkdir(parents=True,exist_ok=True)
  self.db=sqlite3.connect(self.path);self.db.row_factory=sqlite3.Row
  self.db.executescript('''PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
  CREATE TABLE IF NOT EXISTS tasks(id TEXT,input_hash TEXT,payload TEXT,source TEXT,stars INTEGER,status TEXT,current INTEGER DEFAULT 1,output TEXT,errors TEXT DEFAULT '[]',flags TEXT DEFAULT '[]',review_level TEXT,review_reason TEXT,reviewed_at TEXT,updated TEXT,PRIMARY KEY(id,input_hash));
  CREATE UNIQUE INDEX IF NOT EXISTS one_current ON tasks(id) WHERE current=1;
  CREATE TABLE IF NOT EXISTS attempts(attempt_id TEXT PRIMARY KEY,id TEXT,input_hash TEXT,started REAL,finished REAL,outcome TEXT,reserve5 REAL,reserve_week REAL,spent5 REAL,spent_week REAL,usage TEXT,response TEXT,error TEXT);
  CREATE TABLE IF NOT EXISTS quota(seq INTEGER PRIMARY KEY AUTOINCREMENT,observed REAL,used5 REAL,used_week REAL,reset5 REAL,reset_week REAL,week_ratio REAL,source TEXT);
  CREATE TABLE IF NOT EXISTS approvals(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT,input_hash TEXT,level TEXT,reason TEXT,created TEXT);
  ''')
  if 'versions' not in {r['name'] for r in self.db.execute('PRAGMA table_info(tasks)')}:
   self.db.execute("ALTER TABLE tasks ADD COLUMN versions TEXT NOT NULL DEFAULT '{}'")
   self.db.commit()
  if 'weekly_unlimited' not in {r['name'] for r in self.db.execute('PRAGMA table_info(quota)')}:
   self.db.execute('ALTER TABLE quota ADD COLUMN weekly_unlimited INTEGER NOT NULL DEFAULT 0')
   self.db.commit()
  if 'raw_response' not in {r['name'] for r in self.db.execute('PRAGMA table_info(attempts)')}:
   self.db.execute('ALTER TABLE attempts ADD COLUMN raw_response TEXT')
   self.db.commit()
  for column in ('request_hash','request_body'):
   if column not in {r['name'] for r in self.db.execute('PRAGMA table_info(attempts)')}:
    self.db.execute('ALTER TABLE attempts ADD COLUMN '+column+' TEXT')
    self.db.commit()
 def close(self):self.db.close()
 def put(self,ident,input_hash,payload,source,stars,versions=None):
  with self.db:
   self.db.execute('UPDATE tasks SET current=0 WHERE id=?',(ident,))
   self.db.execute('''INSERT INTO tasks(id,input_hash,payload,source,stars,status,current,updated,versions) VALUES(?,?,?,?,?,'prepared',1,?,?) ON CONFLICT(id,input_hash) DO UPDATE SET current=1,source=excluded.source,stars=excluded.stars,updated=excluded.updated,status=CASE WHEN tasks.status='source_failed' THEN 'prepared' ELSE tasks.status END''',(ident,input_hash,canonical(payload),canonical(source),stars,stamp(),canonical(versions or VERSIONS)))
 def remove_missing(self,ids):
  with self.db:
   for row in self.db.execute('SELECT id FROM tasks WHERE current=1').fetchall():
    if row['id'] not in ids:self.db.execute('UPDATE tasks SET current=0 WHERE id=?',(row['id'],))
 def current(self,ident):return self.db.execute('SELECT * FROM tasks WHERE id=? AND current=1',(ident,)).fetchone()
 def pending(self,limit):
  rows=self.db.execute("SELECT * FROM tasks WHERE current=1 AND status='prepared' ORDER BY updated, id").fetchall()
  # Reserve 20% for oldest entries; fill remaining slots by stars.
  oldest=rows[:max(1,limit//5)];chosen={(r['id'],r['input_hash']) for r in oldest}
  rest=sorted((r for r in rows if (r['id'],r['input_hash']) not in chosen),key=lambda r:(-r['stars'],r['id']))
  return (oldest+rest)[:limit]
 def recover(self):
  with self.db:
   self.db.execute("UPDATE tasks SET status='uncertain',updated=? WHERE status='in_flight'",(stamp(),))
   self.db.execute("UPDATE attempts SET outcome='uncertain',error='Process ended with request intent unresolved' WHERE outcome='in_flight'")
 def begin(self,row,reserve5,reserve_week,request_body=None):
  attempt=str(uuid.uuid4())
  with self.db:
   changed=self.db.execute("UPDATE tasks SET status='in_flight',updated=? WHERE id=? AND input_hash=? AND current=1 AND status='prepared'",(stamp(),row['id'],row['input_hash'])).rowcount
   if changed!=1:raise RuntimeError('Task is not available')
   self.db.execute('INSERT INTO attempts(attempt_id,id,input_hash,started,outcome,reserve5,reserve_week) VALUES(?,?,?,?,?,?,?)',(attempt,row['id'],row['input_hash'],time.time(),'in_flight',reserve5,reserve_week))
   if request_body is not None:self.db.execute('UPDATE attempts SET request_hash=?,request_body=? WHERE attempt_id=?',(digest(request_body),canonical(request_body),attempt))
  return attempt
 def finish(self,attempt,outcome,output=None,errors=None,flags=None,usage=None,error=None,spent5=None,spent_week=None,raw_output=None):
  with self.db:
   a=self.db.execute('SELECT * FROM attempts WHERE attempt_id=?',(attempt,)).fetchone()
   if a is None or a['outcome']!='in_flight':raise RuntimeError('Attempt already settled or missing')
   self.db.execute('UPDATE attempts SET finished=?,outcome=?,spent5=?,spent_week=?,usage=?,response=?,error=?,raw_response=? WHERE attempt_id=?',(time.time(),outcome,spent5,spent_week,canonical(usage or {}),canonical(output),error,canonical(raw_output) if raw_output is not None else None,attempt))
   status={'success':'candidate','invalid':'invalid','rate_limited':'prepared','uncertain':'uncertain','quota':'prepared','fatal':'blocked'}.get(outcome)
   if status is None:raise ValueError('Unknown outcome')
   self.db.execute('UPDATE tasks SET status=?,output=?,errors=?,flags=?,updated=? WHERE id=? AND input_hash=?',(status,canonical(output) if output is not None else None,canonical(errors or []),canonical(flags or []),stamp(),a['id'],a['input_hash']))
 def approve(self,ident,reason,level='human-reviewed'):
  row=self.current(ident)
  if not row or row['status']!='candidate':raise ValueError('Only current, valid candidates may be approved')
  if level not in ('human-reviewed','batch-approved','automated'):raise ValueError('Invalid review level')
  if level=='batch-approved' and json.loads(row['flags']):raise ValueError('Risk flags require individual review')
  if not reason.strip():raise ValueError('Review reason is required')
  with self.db:
   self.db.execute("UPDATE tasks SET status='approved',review_level=?,review_reason=?,reviewed_at=?,updated=? WHERE id=? AND input_hash=?",(level,reason,stamp(),stamp(),ident,row['input_hash']))
   self.db.execute('INSERT INTO approvals(id,input_hash,level,reason,created) VALUES(?,?,?,?,?)',(ident,row['input_hash'],level,reason,stamp()))
 def retry(self,ident,reason,uncertain=False):
  row=self.current(ident)
  allowed=('uncertain',) if uncertain else ('invalid','blocked')
  if not reason.strip() or not row or row['status'] not in allowed:raise ValueError('Explicit retry requires matching state and reason')
  # One content repair only; rate rejections do not consume this repair allowance.
  if not uncertain:
   count=self.db.execute("SELECT COUNT(*) FROM attempts WHERE id=? AND input_hash=? AND outcome='invalid'",(ident,row['input_hash'])).fetchone()[0]
   if count>=2:raise ValueError('One content repair already consumed')
  with self.db:
   self.db.execute("UPDATE tasks SET status='prepared',updated=? WHERE id=? AND input_hash=?",(stamp(),ident,row['input_hash']))
   self.db.execute('INSERT INTO approvals(id,input_hash,level,reason,created) VALUES(?,?,?,?,?)',(ident,row['input_hash'],'retry-uncertain' if uncertain else 'repair',reason,stamp()))
 def counts(self):return {r['status']:r['n'] for r in self.db.execute('SELECT status,COUNT(*) AS n FROM tasks WHERE current=1 GROUP BY status')}
 def backup(self,destination):
  destination=pathlib.Path(destination);destination.parent.mkdir(parents=True,exist_ok=True)
  with contextlib.closing(sqlite3.connect(destination)) as backup:self.db.backup(backup)
 def quota(self):return self.db.execute('SELECT * FROM quota ORDER BY seq DESC LIMIT 1').fetchone()
 def record_quota(self,used5,used_week,reset5,reset_week,source,ratio=None,now=None,weekly_unlimited=False):
  now=time.time() if now is None else now
  if type(weekly_unlimited) is not bool:raise ValueError('weekly_unlimited must be explicit boolean')
  if not all(isinstance(v,(int,float)) and math.isfinite(v) for v in (used5,reset5,now)):raise ValueError('Non-finite quota value')
  if not 0<=used5<=100 or reset5<=now:raise ValueError('Invalid5-hour percentage or reset time')
  if weekly_unlimited:
   if used_week is not None or reset_week is not None or ratio not in (None,0):raise ValueError('Unlimited weekly quota must not include percentage, reset or ratio')
   ratio=0
  else:
   if not all(isinstance(v,(int,float)) and math.isfinite(v) for v in (used_week,reset_week)):raise ValueError('Finite weekly quota observation required')
   if not 0<=used_week<=100 or reset_week<=now:raise ValueError('Invalid weekly percentage or reset time')
   if ratio is not None and (not math.isfinite(ratio) or not 0<ratio<=100):raise ValueError('Invalid week-to-5-hour ratio')
  with self.db:self.db.execute('INSERT INTO quota(observed,used5,used_week,reset5,reset_week,week_ratio,source,weekly_unlimited) VALUES(?,?,?,?,?,?,?,?)',(now,used5,used_week,reset5,reset_week,ratio,source,int(weekly_unlimited)))
