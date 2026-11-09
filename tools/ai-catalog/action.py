#!/usr/bin/env python3
"""Bounded GitHub Actions enrichment. Public JSON checkpoints survive runner loss."""
import argparse,collections,concurrent.futures,json,os,pathlib,time,uuid,urllib.error
from schema import VERSIONS,canonical,digest,make_input,metadata,validate
from source import read_readme
from store import Store,stamp
from review import atomic_json,export
from provider_minimax import request,reserve,payload
from minimax_validate import Limiter


def deduplicate(entries):
 selected=[];seen_id=set();seen_repo=set();aliases=[]
 for e in sorted(entries,key=lambda e:(e['state'].get('fork',False),-e['stats']['stars'],e['id'])):
  repo=e['repositoryUrl'].lower().rstrip('/').removesuffix('.git')
  if e['id'] in seen_id or repo in seen_repo:aliases.append({'id':e['id'],'repository':repo});continue
  selected.append(e);seen_id.add(e['id']);seen_repo.add(repo)
 return selected,aliases

WINDOW_SECONDS=6*3600
WINDOW_ATTEMPTS=800

def window_events(root,now=None):
 now=time.time() if now is None else now;root=pathlib.Path(root);path=root/'window-usage.json'
 if path.exists():events=json.loads(path.read_text())['events']
 else:
  previous=root/'last-run.json';r=json.loads(previous.read_text()) if previous.exists() else {}
  events=[{'id':'legacy:'+str(r['completedAt']),'completedAt':r['completedAt'],'attempts':r.get('attempts',0),'weightedTokens':r.get('weightedTokens',0)}] if r.get('completedAt') else []
 return [e for e in events if e['completedAt']>=now-WINDOW_SECONDS]

def save_window(root,events):atomic_json(pathlib.Path(root)/'window-usage.json',{'windowHours':6,'maxAttempts':800,'events':events})

def checkpoint(store,directory):
 root=pathlib.Path(directory)
 for row in store.db.execute('SELECT * FROM tasks WHERE current=1'):
  ident=row['id'];task=dict(row)
  attempts=[dict(a) for a in store.db.execute('SELECT * FROM attempts WHERE id=? AND input_hash=? ORDER BY started',(ident,row['input_hash']))]
  atomic_json(root/'tasks'/(ident[3:]+'.json'),{'task':task,'attempts':attempts})

def restore(store,directory):
 root=pathlib.Path(directory)
 for path in sorted((root/'tasks').glob('*.json')):
  value=json.loads(path.read_text());r=value['task']
  if not __import__('re').fullmatch(r'gh:[0-9]+',r['id']) or path.stem!=r['id'][3:]:raise ValueError('Checkpoint identity mismatch')
  if digest({'input':json.loads(r['payload']),'versions':json.loads(r['versions'])})!=r['input_hash']:raise ValueError('Checkpoint input checksum mismatch')
  if store.current(r['id']):continue
  store.put(r['id'],r['input_hash'],json.loads(r['payload']),json.loads(r['source']),r['stars'],json.loads(r['versions']))
  allowed_columns={c['name'] for c in store.db.execute('PRAGMA table_info(tasks)')}
  columns=[k for k in r if k in allowed_columns and k not in ('id','input_hash','current')]
  with store.db:
   store.db.execute('UPDATE tasks SET '+','.join(k+'=?' for k in columns)+' WHERE id=? AND input_hash=?',[r[k] for k in columns]+[r['id'],r['input_hash']])
   for a in value['attempts']:
    keys=[k for k in a if k in {c['name'] for c in store.db.execute('PRAGMA table_info(attempts)')}]
    store.db.execute('INSERT OR IGNORE INTO attempts('+','.join(keys)+') VALUES('+','.join('?' for _ in keys)+')',[a[k] for k in keys])
 # A durable lease was pushed before paid calls. If the runner vanished, never
 # silently replay possibly paid requests. Results saved by the always step win.
 lease=root/'lease.json'
 if lease.exists():
  abandoned=json.loads(lease.read_text());unresolved=0
  for r in abandoned['tasks']:
   row=store.current(r['id'])
   if row and row['input_hash']==r['inputHash'] and row['status']=='prepared':
    unresolved+=1
    with store.db:store.db.execute("UPDATE tasks SET status='uncertain',errors='[\"previous_runner_lease_unresolved\"]' WHERE id=? AND input_hash=?",(r['id'],r['inputHash']))
  if unresolved:
   events=window_events(root);ident=abandoned.get('run','unknown-lease')
   events=[e for e in events if e['id']!=ident]
   events.append({'id':ident,'completedAt':time.time(),'attempts':len(abandoned['tasks']),'weightedTokens':4000000,'uncertain':True});save_window(root,events)
 store.recover()

def auto_export(store,directory):
 for row in store.db.execute("SELECT * FROM tasks WHERE current=1 AND status='candidate'").fetchall():
  output=json.loads(row['output']);prepared=json.loads(row['payload'])
  if not validate(output,prepared) and not output['insufficient_evidence']:
   store.approve(row['id'],'Automated schema/evidence checks; AI-generated, not manually reviewed','automated')
 return export(store,directory)

def prepare(store,registry,state,limit):
 root=pathlib.Path(registry);index=json.loads((root/'index.json').read_text());entries,aliases=deduplicate(index['plugins']);failures=[];count=0
 restore(store,state)
 for e in entries:
  if len(store.pending(limit))>=limit:break
  if count>=limit:break
  detail=json.loads((root/e['detailPath']).read_text());sha=detail['github']['headSha'];old=store.current(e['id']);mh=digest(metadata(e))
  if old:
   source=json.loads(old['source'])
   if source['headSha']==sha and source['metadataHash']==mh:
    # Existing valid output remains usable across prompt revisions. Retry only
    # one invalid response for the exact input, never uncertain outcomes.
    if old['status']=='invalid' and json.loads(old['versions'])==VERSIONS:
     tries=store.db.execute("SELECT COUNT(*) FROM attempts WHERE id=? AND input_hash=? AND outcome='invalid'",(old['id'],old['input_hash'])).fetchone()[0]
     if tries<2:store.retry(e['id'],'One bounded automated content repair')
    if old['status']=='source_failed':continue
    if not (old['status']=='prepared' and json.loads(old['versions'])!=VERSIONS):continue
  failure_path=pathlib.Path(state)/'source-failures'/(e['id'][3:]+'.json')
  if failure_path.exists():
   prior=json.loads(failure_path.read_text())
   if prior['headSha']==sha and prior['metadataHash']==mh and prior['retryAfter']>time.time():continue
  count+=1
  try:
   raw,source=read_readme(e,detail,store.path.parent/'sources',os.environ.get('GH_TOKEN'))
   prepared,h=make_input(e,raw);source.update({'metadataHash':mh,'registryRevision':index['revision']})
   store.put(e['id'],h,prepared,source,e['stats']['stars'])
   if failure_path.exists():failure_path.unlink()
   if not any(len(p['text'])>=20 for p in prepared['paragraphs']):
    with store.db:store.db.execute("UPDATE tasks SET status='source_failed' WHERE id=? AND input_hash=?",(e['id'],h))
  except Exception as error:
   failures.append({'id':e['id'],'kind':type(error).__name__})
   # Rate/auth failures pause planning. A single oversized or malformed source
   # must not starve the rest of the catalog on every scheduled run.
   if isinstance(error,urllib.error.HTTPError) and error.code in (401,403,429):break
   atomic_json(failure_path,{'id':e['id'],'headSha':sha,'metadataHash':mh,'kind':type(error).__name__,'reason':str(error)[:160],'retryAfter':time.time()+86400})
   continue
 store.remove_missing({e['id'] for e in entries})
 selected=[r for r in store.pending(limit) if json.loads(r['versions'])==VERSIONS]
 checkpoint(store,state)
 lease={'run':str(uuid.uuid4()),'created':stamp(),'tasks':[{'id':r['id'],'inputHash':r['input_hash']} for r in selected]}
 atomic_json(pathlib.Path(state)/'lease.json',lease)
 report={'total':len(index['plugins']),'unique':len(entries),'aliases':aliases,'selected':len(selected),'sourceFailures':failures}
 atomic_json(pathlib.Path(state)/'plan.json',report);return report

def execute(store,state,key,limit,weighted_budget):
 root=pathlib.Path(state);events=window_events(root);requested=limit
 used=sum(e['attempts'] for e in events);prior_tokens=sum(e['weightedTokens'] for e in events)
 limit=min(limit,max(0,WINDOW_ATTEMPTS-used));weighted_budget=max(0,weighted_budget-prior_tokens)
 if not limit or not weighted_budget:
  (root/'lease.json').unlink(missing_ok=True)
  return {'attempts':0,'stopReason':'six_hour_window_limit','windowAttempts':used,'states':store.counts()}
 lease=json.loads((pathlib.Path(state)/'lease.json').read_text());allowed={(r['id'],r['inputHash']) for r in lease['tasks']}
 rows=[r for r in store.pending(limit) if (r['id'],r['input_hash']) in allowed];queue=collections.deque(rows)
 limiter=Limiter();active={};spent=0;attempts=0;stop=None;run_started=time.monotonic();event_id=lease.get('run',str(uuid.uuid4()))
 def record_window():
  save_window(root,events+[{'id':event_id,'completedAt':time.time(),'attempts':attempts,'weightedTokens':spent+sum(v[2] for v in active.values())}])
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
  while queue or active:
   for future in list(active):
    if not future.done():continue
    ident,row,reserved=active.pop(future)
    try:result=future.result()
    except Exception:result={'outcome':'uncertain','error':'Worker failed; outcome unknown'}
    usage=result.get('usage',{});actual=usage.get('prompt_tokens',0)+4*usage.get('completion_tokens',0) if 'total_tokens' in usage else reserved
    spent+=actual
    store.finish(ident,result['outcome'],output=result.get('output'),raw_output=result.get('raw_output'),errors=result.get('errors'),flags=result.get('flags'),usage=usage,error=result.get('error'))
    limiter.settle(ident,{'usage':usage,'rate_limited':result['outcome']=='rate_limited'})
    if result['outcome']=='rate_limited':
     limiter.throttle(time.monotonic(),min(600,max(60,result.get('delay',60))));stop='rate_limited_pause_until_next_schedule'
    elif result['outcome'] in ('uncertain','fatal','quota'):stop=result['outcome']
    checkpoint(store,state);record_window()
   if not stop:
    while queue and len(active)<limiter.concurrency and attempts<limit:
     row=queue[0];prepared=json.loads(row['payload']);repair=json.loads(row['errors']) or None;tokens,_=reserve(prepared,repair)
     # Conservative byte reservation plus output budget; this is a PIPELINE cap,
     # not fabricated account quota or an assertion about remaining subscription.
     reservation=len(canonical(payload(prepared,repair)).encode())+4*payload(prepared,repair)['max_completion_tokens']
     if spent+sum(v[2] for v in active.values())+reservation>weighted_budget:stop='configured_pipeline_budget';break
     ts=time.monotonic()
     if limiter.wait(ts,tokens)>0:break
     queue.popleft();ident=store.begin(row,0,0,payload(prepared,repair));attempts+=1;limiter.add(ident,ts,tokens)
     save_window(root,events+[{'id':event_id,'completedAt':time.time(),'attempts':attempts,'weightedTokens':spent+sum(v[2] for v in active.values())+reservation}])
     active[executor.submit(request,prepared,key,repair)]=(ident,row,reservation)
   if stop or attempts>=limit:queue.clear()
   if active:concurrent.futures.wait(active,timeout=1,return_when=concurrent.futures.FIRST_COMPLETED)
   elif queue:time.sleep(min(2,max(.1,limiter.wait(time.monotonic(),reserve(json.loads(queue[0]['payload']))[0]))))
 checkpoint(store,state)
 (pathlib.Path(state)/'lease.json').unlink(missing_ok=True)
 record_window()
 report={'requestedAttemptLimit':requested,'allowedAttemptLimit':limit,'windowAttempts':used+attempts,'completedAt':time.time(),'attempts':attempts,'weightedTokens':spent,'stopReason':stop,'elapsedSeconds':round(time.monotonic()-run_started,2),'states':store.counts()}
 atomic_json(pathlib.Path(state)/'last-run.json',report);return report


def main():
 p=argparse.ArgumentParser();p.add_argument('phase',choices=['prepare','run','save']);p.add_argument('--registry',type=pathlib.Path,default=pathlib.Path('dsh-plugin-registry/registry/v1'));p.add_argument('--state-dir',type=pathlib.Path,default=pathlib.Path('ai-state'));p.add_argument('--db',type=pathlib.Path,default=pathlib.Path('.local/ai-action/state.sqlite3'));p.add_argument('--output',type=pathlib.Path,default=pathlib.Path('ai-data/v1'));p.add_argument('--limit',type=int,default=800);p.add_argument('--weighted-budget',type=int,default=4000000);a=p.parse_args()
 if not 1<=a.limit<=800 or not 20000<=a.weighted_budget<=6000000:raise ValueError('Invalid bounded batch settings')
 store=Store(a.db)
 try:
  if a.phase=='prepare':result=prepare(store,a.registry,a.state_dir,a.limit)
  elif a.phase=='run':
   key=os.environ.get('MINIMAX_API_KEY','')
   if not key.startswith('sk-cp-') or len(key)<17:raise ValueError('Configure MINIMAX_API_KEY subscription secret; never use PAYG')
   try:result=execute(store,a.state_dir,key,a.limit,a.weighted_budget)
   finally:key=None
   auto_export(store,a.output)
  else:
   store.recover();checkpoint(store,a.state_dir);auto_export(store,a.output)
   # Saving completed/uncertain task statuses resolves the pre-run lease.
   (a.state_dir/'lease.json').unlink(missing_ok=True);result=store.counts()
  print(canonical(result))
 finally:store.close()

if __name__=='__main__':main()
