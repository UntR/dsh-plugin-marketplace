#!/usr/bin/env python3
"""Offline by default; paid operations require a hidden subscription key."""
import argparse,getpass,json,os,pathlib,re,sys,time,warnings
from schema import make_input,metadata,digest,canonical
from source import read_readme
from store import Store
from scheduler import run,process_lock
from review import export,override,atomic_json,import_approved,sample,approve_batch
from quota import record,from_file,from_mmx,epoch
from credentials import load_subscription_key

ROOT=pathlib.Path(__file__).resolve().parents[2]

def main():
 p=argparse.ArgumentParser();p.add_argument('--state',type=pathlib.Path,default=ROOT/'.local/ai-catalog/state.sqlite3')
 sub=p.add_subparsers(dest='command',required=True)
 plan=sub.add_parser('plan');plan.add_argument('--registry',type=pathlib.Path,default=ROOT/'dsh-plugin-registry/registry/v1');plan.add_argument('--limit',type=int,default=100);plan.add_argument('--dry-run',action='store_true');plan.add_argument('--retry-sources',action='store_true');plan.add_argument('--trial',type=pathlib.Path);plan.add_argument('--trial-sources',type=pathlib.Path)
 for name in ('run','resume'):
  r=sub.add_parser(name);r.add_argument('--limit',type=int,default=100);r.add_argument('--env-file',type=pathlib.Path);r.add_argument('--batches',type=int,default=1);r.add_argument('--wait-windows',action='store_true');r.add_argument('--concurrency',type=int,default=3);r.add_argument('--rpm',type=int,default=30);r.add_argument('--tpm',type=int,default=180000);r.add_argument('--quota-file',type=pathlib.Path);r.add_argument('--mmx-quota',action='store_true')
 sub.add_parser('status');sub.add_parser('review-list')
 sam=sub.add_parser('sample');sam.add_argument('output',type=pathlib.Path);sam.add_argument('--seed')
 batch=sub.add_parser('approve-batch');batch.add_argument('sample',type=pathlib.Path);batch.add_argument('--reason',required=True)
 imp=sub.add_parser('import-approved');imp.add_argument('--input',type=pathlib.Path,default=ROOT/'ai-data/v1')
 q=sub.add_parser('quota');q.add_argument('--file',type=pathlib.Path);q.add_argument('--mmx',action='store_true');q.add_argument('--used5',type=float);q.add_argument('--used-week',type=float);q.add_argument('--reset5');q.add_argument('--reset-week');q.add_argument('--week-ratio',type=float);q.add_argument('--weekly-unlimited',action='store_true')
 a=sub.add_parser('approve');a.add_argument('id');a.add_argument('--reason',required=True);a.add_argument('--level',choices=['human-reviewed','batch-approved'],default='human-reviewed')
 for name in ('repair','retry-uncertain'):
  a=sub.add_parser(name);a.add_argument('id');a.add_argument('--reason',required=True)
 e=sub.add_parser('export');e.add_argument('--output',type=pathlib.Path,default=ROOT/'ai-data/v1')
 o=sub.add_parser('override');o.add_argument('id');o.add_argument('file',type=pathlib.Path);o.add_argument('--reason',required=True);o.add_argument('--output',type=pathlib.Path,default=ROOT/'ai-data/v1')
 a=p.parse_args()
 with process_lock(a.state.with_suffix('.lock')):
  store=Store(a.state)
  try:
   if a.command=='plan':
    if not 1<=a.limit<=30000:raise ValueError('Plan limit must be1–30000')
    index=json.loads((a.registry/'index.json').read_text());entries=index['plugins'];byid={e['id']:e for e in entries};count=0;failed=[];candidates=[]
    if a.trial:
     manifest=json.loads((a.trial/'samples.json').read_text());selected=[(byid[r['input']['id']],r) for r in manifest['samples'] if r['input']['id'] in byid]
    else:selected=[(e,None) for e in sorted(entries,key=lambda e:(-e['stats']['stars'],e['id']))]
    for entry,trial in selected:
     if count>=a.limit:break
     detail=json.loads((a.registry/entry['detailPath']).read_text());head=detail['github']['headSha'];old=store.current(entry['id'])
     if old and not trial:
      previous=json.loads(old['source'])
      if previous['headSha']==head and previous['metadataHash']==digest(metadata(entry)) and not (a.retry_sources and old['status']=='source_failed'):continue
     if a.dry_run:
      candidates.append({'id':entry['id'],'headSha':head,'reason':'new_or_source_changed'});count+=1;continue
     try:
      if trial:
       if head!=trial['head_sha']:raise ValueError('Trial source SHA differs from current facts; replan without trial')
       source_dir=a.trial_sources or a.trial/'sources';raw=(source_dir/(entry['id'][3:]+'-README.txt')).read_text()
       import hashlib
       source={'headSha':head,'path':'README.md','rawHash':hashlib.sha256(raw.encode()).hexdigest()}
      else:raw,source=read_readme(entry,detail,a.state.parent/'sources',os.environ.get('REGISTRY_GITHUB_TOKEN') or os.environ.get('GH_TOKEN'))
      payload,input_hash=make_input(entry,raw);source['metadataHash']=digest(metadata(entry));source['registryRevision']=index['revision']
      store.put(entry['id'],input_hash,payload,source,entry['stats']['stars']);count+=1
      if not any(len(p['text'])>=20 for p in payload['paragraphs']):
       with store.db:store.db.execute("UPDATE tasks SET status='source_failed',errors='[\"no_citable_source\"]' WHERE id=? AND input_hash=?",(entry['id'],input_hash))
      atomic_json(a.state.parent/'requests'/(input_hash.removeprefix('sha256:')+'.json'),payload)
     except Exception as error:
      failed.append({'id':entry['id'],'error':type(error).__name__+': '+str(error)[:160]})
      # Persist failed sources so a permanently bad high-star repository cannot
      # starve every subsequent plan. Rate/auth failures stop without losing the retry.
      import urllib.error
      if isinstance(error,urllib.error.HTTPError) and error.code in (401,403,429):break
      payload,input_hash=make_input(entry,'')
      source={'headSha':head,'path':None,'rawHash':__import__('hashlib').sha256(b'').hexdigest(),'metadataHash':digest(metadata(entry)),'registryRevision':index['revision']}
      store.put(entry['id'],input_hash,payload,source,entry['stats']['stars']);count+=1
      with store.db:store.db.execute("UPDATE tasks SET status='source_failed',errors=? WHERE id=? AND input_hash=?",(canonical([type(error).__name__]),entry['id'],input_hash))
    if not a.dry_run:store.remove_missing(set(byid))
    atomic_json(a.state.parent/'plan-report.json',{'prepared':0 if a.dry_run else count,'candidates':candidates,'source_failed':failed,'states':store.counts()});print(canonical({'prepared':0 if a.dry_run else count,'candidates':candidates,'source_failed':failed,'states':store.counts()}))
   elif a.command in ('run','resume'):
    if not 1<=a.batches<=100:raise ValueError('Batches must be1–100')
    if a.batches>1 and not (a.quota_file or a.mmx_quota):raise ValueError('Multiple batches require a refreshed quota source')
    if a.env_file is None and not sys.stdin.isatty():raise ValueError('Run in your own Terminal; hidden input required')
    refresh=(lambda s:from_file(s,a.quota_file)) if a.quota_file else from_mmx if a.mmx_quota else None
    if refresh:refresh(store)
    from scheduler import budget
    blocked=budget(store,.2)
    if blocked:raise ValueError('Cannot start paid batch: '+blocked)
    print(f'MiniMax订阅Key仅进程内存；本批最多{a.limit}次尝试，可能扣已有积分包。不充值、升级或切换按量。')
    if a.env_file is not None:key=load_subscription_key(a.env_file)
    else:
     with warnings.catch_warnings():
      warnings.simplefilter('error',getpass.GetPassWarning);key=getpass.getpass('订阅Key（隐藏，不发到聊天）：').strip()
    if not key.startswith('sk-cp-') or len(key)<17 or any(c.isspace() for c in key):raise ValueError('Subscription key required')
    try:
     for batch in range(a.batches):
      result=run(store,key,a.limit,a.concurrency,a.rpm,a.tpm,quota_refresh=refresh)
      atomic_json(a.state.parent/'last-run.json',{'batch':batch+1,'requested_attempt_limit':a.limit,**result})
      print(canonical({'batch':batch+1,**result}))
      if result['stop_reason']:print(f"本批暂停：{result['stop_reason']}；仍有{result['states'].get('prepared',0)}条未发送。不是全批完成；已返回结果已保存，续跑不会重发。",flush=True)
      stop=result['stop_reason']
      if stop:
       if a.wait_windows and stop in ('five_hour_budget_reached','weekly_budget_reached','pipeline_budget_reached','quota_refresh_required') and refresh:
        q=store.quota();reset=q['reset_week'] if stop=='weekly_budget_reached' else q['reset5']
        print('Waiting for observed quota window reset; key remains in process memory.',flush=True)
        while time.time()<reset:time.sleep(min(30,reset-time.time()))
        refresh(store)
       else:break
      if not store.pending(1):break
    finally:key=None
   elif a.command=='quota':
    if a.file:from_file(store,a.file)
    elif a.mmx:from_mmx(store)
    elif a.used5 is not None and a.reset5 is not None and (a.weekly_unlimited or (a.used_week is not None and a.reset_week is not None)):
     record(store,{'used5':a.used5,'used_week':a.used_week,'reset5':a.reset5,'reset_week':a.reset_week,'week_ratio':a.week_ratio,'weekly_unlimited':a.weekly_unlimited},'manual-user-observation')
    else:raise ValueError('Provide file, mmx, or both window observations and reset times')
    print(canonical(dict(store.quota())))
   elif a.command=='status':
    q=store.quota();print(canonical({'tasks':store.counts(),'quota':dict(q) if q else None,'attempts':store.db.execute('SELECT COUNT(*) FROM attempts').fetchone()[0],'usage':[dict(r) for r in store.db.execute('SELECT outcome,COUNT(*) AS count FROM attempts GROUP BY outcome')]}))
   elif a.command=='review-list':
    print(canonical([{'id':r['id'],'inputHash':r['input_hash'],'status':r['status'],'output':json.loads(r['output']) if r['output'] else None,'flags':json.loads(r['flags']),'errors':json.loads(r['errors'])} for r in store.db.execute("SELECT * FROM tasks WHERE current=1 AND status IN ('candidate','invalid','uncertain') ORDER BY id")]))
   elif a.command=='approve':store.approve(a.id,a.reason,a.level);print('Approved '+a.id)
   elif a.command in ('repair','retry-uncertain'):store.retry(a.id,a.reason,a.command=='retry-uncertain');print('Queued explicit retry '+a.id)
   elif a.command=='sample':
    import secrets
    print(canonical(sample(store,a.output,a.seed or secrets.token_hex(16))))
   elif a.command=='approve-batch':print(canonical({'batchApproved':approve_batch(store,json.loads(a.sample.read_text()),a.reason)}))
   elif a.command=='import-approved':print(canonical({'imported':import_approved(store,a.input)}))
   elif a.command=='export':print(canonical(export(store,a.output)))
   elif a.command=='override':override(store,a.id,json.loads(a.file.read_text()),a.reason,a.output);export(store,a.output);print('Saved manual override '+a.id)
  finally:store.close()

if __name__=='__main__':
 try:main()
 except KeyboardInterrupt:raise SystemExit('Stopped; resume checks uncertain attempts before new requests.')
 except Exception as error:raise SystemExit(type(error).__name__+': '+str(error))
