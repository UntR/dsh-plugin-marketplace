"""Bounded adaptive worker with account quota, persisted reservations and rate control."""
import concurrent.futures,contextlib,fcntl,json,math,pathlib,random,time
from provider_minimax import request,reserve,payload as model_payload

@contextlib.contextmanager
def process_lock(path):
 path=pathlib.Path(path);path.parent.mkdir(parents=True,exist_ok=True)
 with path.open('a') as stream:
  try:fcntl.flock(stream,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:raise RuntimeError('Another AI worker holds the process lock') from None
  try:yield
  finally:fcntl.flock(stream,fcntl.LOCK_UN)

def budget(store,reserve5,now=None):
 now=time.time() if now is None else now;q=store.quota()
 if not q:return 'quota_snapshot_required'
 if now-q['observed']>300:return 'quota_snapshot_stale'
 if now>=q['reset5'] or (not q['weekly_unlimited'] and now>=q['reset_week']):return 'quota_refresh_required'
 if not q['weekly_unlimited'] and q['week_ratio'] is None:return 'weekly_calibration_required'
 after=store.db.execute('''SELECT SUM(COALESCE(spent5,reserve5)),SUM(COALESCE(spent_week,reserve_week)) FROM attempts WHERE (started>=? OR finished>=? OR outcome IN ('in_flight','uncertain')) AND outcome!='rate_limited' ''',(q['observed'],q['observed'])).fetchone()
 spent5=after[0] or 0;spentweek=after[1] or 0
 if q['used5']+spent5+reserve5>80:return 'five_hour_budget_reached'
 if not q['weekly_unlimited'] and q['used_week']+spentweek+reserve5*q['week_ratio']>80:return 'weekly_budget_reached'
 # Pipeline itself gets at most80 points per actual window, independent of snapshots.
 begin5=q['reset5']-5*3600
 used=store.db.execute("SELECT SUM(COALESCE(spent5,reserve5)) FROM attempts WHERE started>=? AND outcome!='rate_limited'",(begin5,)).fetchone()[0] or 0
 if used+reserve5>80:return 'pipeline_budget_reached'
 return None

def run(store,key,limit=100,concurrency=3,rpm=30,tpm=180000,send=request,quota_refresh=None):
 if not 1<=limit<=100:raise ValueError('Each run is capped at100 attempts; observe quota between batches')
 if not 1<=concurrency<=6 or not 1<=rpm<=60 or not 15072<=tpm<=300000:raise ValueError('Invalid rate configuration')
 store.recover();events=[];active={};sent=0;reason=None;cooldown=0;retries={};tokens={}
 with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
  try:
   while True:
    for future in list(active):
     if not future.done():continue
     attempt,row,r5,ratio=active.pop(future)
     try:result=future.result()
     except Exception as error:result={'outcome':'uncertain','error':type(error).__name__}
     outcome=result['outcome'];usage=result.get('usage',{})
     spent=0.04*(usage['prompt_tokens']+4*usage['completion_tokens'])/3647 if set(usage)=={'prompt_tokens','completion_tokens','total_tokens'} else None
     store.finish(attempt,outcome,output=result.get('output'),errors=result.get('errors'),flags=result.get('flags'),usage=usage,error=result.get('error'),raw_output=result.get('raw_output'),spent5=spent,spent_week=spent*ratio if spent is not None else None)
     if spent is not None and spent>r5:reason='actual_usage_exceeded_reservation'
     tokens[attempt]=usage.get('total_tokens',tokens[attempt])
     if outcome=='rate_limited':
      retries[row['id']]=store.db.execute("SELECT COUNT(*) FROM attempts WHERE id=? AND input_hash=? AND outcome='rate_limited'",(row['id'],row['input_hash'])).fetchone()[0]
      delay=max(60*2**(retries[row['id']]-1),result.get('delay',60))
      if retries[row['id']]>2 or delay>600:reason='rate_retry_limit'
      else:cooldown=time.time()+delay+random.uniform(.2,1.5);concurrency=max(1,concurrency//2);rpm=max(3,rpm//2);tpm=max(30000,tpm//2)
      tokens[attempt]=0
     elif outcome in ('uncertain','fatal','quota'):reason=outcome
    if not reason and sent<limit and len(active)<concurrency and time.time()>=cooldown:
     if quota_refresh:
      try:quota_refresh(store)
      except Exception:reason='quota_query_failed'
     pending=store.pending(limit-sent)
     for row in pending:
      if reason or len(active)>=concurrency or sent>=limit:break
      prepared=json.loads(row['payload'])
      from schema import VERSIONS
      if json.loads(row['versions'])!=VERSIONS:reason='input_version_outdated_replan_required';break
      repair_errors=json.loads(row['errors']) or None
      reserved,r5=reserve(prepared,repair_errors);reason=budget(store,r5)
      if reason:break
      ts=time.time();events=[e for e in events if ts-e[0]<60]
      if len(events)>=rpm or sum(tokens[a] for _,a in events)+reserved>tpm:break
      ratio=store.quota()['week_ratio'];attempt=store.begin(row,r5,r5*ratio,model_payload(prepared,repair_errors));sent+=1;tokens[attempt]=reserved;events.append((ts,attempt))
      future=executor.submit(send,prepared,key,repair_errors);active[future]=(attempt,row,r5,ratio)
      print(f'{sent}/{limit} sent {row["id"]}',flush=True)
     if not pending and not active:break
    if not active and (reason or sent>=limit):break
    if active:concurrent.futures.wait(active,timeout=1,return_when=concurrent.futures.FIRST_COMPLETED)
    else:time.sleep(1)
  except BaseException:
   # Finish already submitted work; leave unresolved attempts marked uncertain on resume.
   for future,(attempt,row,r5,ratio) in list(active.items()):
    try:
     result=future.result();usage=result.get('usage',{});spent=.04*(usage['prompt_tokens']+4*usage['completion_tokens'])/3647 if set(usage)=={'prompt_tokens','completion_tokens','total_tokens'} else None
     store.finish(attempt,result['outcome'],output=result.get('output'),errors=result.get('errors'),flags=result.get('flags'),usage=usage,error=result.get('error'),raw_output=result.get('raw_output'),spent5=spent,spent_week=spent*ratio if spent is not None else None)
    except Exception:pass
   raise
 store.backup(store.path.parent/'backups'/'latest.sqlite3')
 return {'attempts':sent,'stop_reason':reason,'states':store.counts()}
