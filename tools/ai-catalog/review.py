"""Reviewed results export separately from replaceable Registry facts."""
import json,pathlib,os,tempfile,shutil
from schema import VERSIONS,digest,validate,canonical,flags
from store import stamp

def atomic_json(path,value):
 path=pathlib.Path(path);path.parent.mkdir(parents=True,exist_ok=True)
 fd,temp=tempfile.mkstemp(prefix='.'+path.name,dir=path.parent)
 try:
  with os.fdopen(fd,'w') as stream:stream.write(canonical(value)+'\n');stream.flush();os.fsync(stream.fileno())
  os.replace(temp,path)
 finally:
  if os.path.exists(temp):os.unlink(temp)

def _export_files(store,directory):
 root=pathlib.Path(directory);byid={}
 if (root/'meta.json').exists():
  previous=json.loads((root/'meta.json').read_text())
  for ident in previous['records']:
   if not __import__('re').fullmatch(r'gh:[0-9]+',ident):raise ValueError('Invalid prior manifest ID')
   value=json.loads((root/'records'/(ident[3:]+'.json')).read_text());byid[ident]=value
  if digest(sorted(byid.values(),key=lambda r:r['id']))!=previous['revision']:raise ValueError('Prior export checksum mismatch')
 for row in store.db.execute("SELECT * FROM tasks WHERE current=1 AND status='approved' ORDER BY id"):
  value=json.loads(row['output']);prepared=json.loads(row['payload']);source=json.loads(row['source'])
  errors=validate(value,prepared)
  if errors:raise ValueError(f'Approved output no longer valid: {row["id"]}')
  record={'schemaVersion':1,'id':row['id'],'inputHash':row['input_hash'],'input':prepared,'versions':json.loads(row['versions']),'source':source,'output':value,'review':{'level':row['review_level'],'reason':row['review_reason'],'at':row['reviewed_at']}}
  ident=row['id'].removeprefix('gh:');atomic_json(root/'records'/f'{ident}.json',record);byid[row['id']]=record
  local_override=store.path.parent/'overrides'/(ident+'-'+row['input_hash'][7:]+'.json')
  if local_override.exists():
   manual=json.loads(local_override.read_text())
   if manual['inputHash']!=row['input_hash'] or manual['output']!=value:raise ValueError('Local manual override conflict')
   atomic_json(root/'overrides'/f'{ident}.json',manual)
 # Keep historic files: composer only accepts listed records in this generation.
 records=sorted(byid.values(),key=lambda r:r['id'])
 meta={'schemaVersion':1,'revision':digest(records),'recordCount':len(records),'records':[r['id'] for r in records]}
 atomic_json(root/'meta.json',meta)
 return meta

def export(store,directory):
 root=pathlib.Path(directory);root.parent.mkdir(parents=True,exist_ok=True)
 backup=root.with_name(root.name+'.export-backup')
 # Recover a crash between directory renames before validating the previous generation.
 if not root.exists() and backup.exists():os.replace(backup,root)
 staging=pathlib.Path(tempfile.mkdtemp(prefix='.'+root.name+'-export-',dir=root.parent))
 try:
  if root.exists():shutil.copytree(root,staging,dirs_exist_ok=True)
  meta=_export_files(store,staging)
  if backup.exists():shutil.rmtree(backup)
  had_root=root.exists()
  if had_root:os.replace(root,backup)
  try:os.replace(staging,root)
  except BaseException:
   if had_root:os.replace(backup,root)
   raise
  if backup.exists():shutil.rmtree(backup)
  return meta
 finally:
  if staging.exists():shutil.rmtree(staging)

def override(store,ident,value,reason,directory):
 row=store.current(ident)
 if not row or row['status']=='in_flight':raise ValueError('No editable current task')
 errors=validate(value,json.loads(row['payload']))
 if errors:raise ValueError('Invalid override: '+','.join(errors))
 if not reason.strip():raise ValueError('Review reason required')
 with store.db:store.db.execute("UPDATE tasks SET output=?,status='candidate',flags='[]',errors='[]' WHERE id=? AND input_hash=?",(canonical(value),ident,row['input_hash']))
 store.approve(ident,reason)
 atomic_json(store.path.parent/'overrides'/(ident.removeprefix('gh:')+'-'+row['input_hash'][7:]+'.json'),{'id':ident,'inputHash':row['input_hash'],'output':value,'reason':reason,'at':stamp()})


def import_approved(store,directory):
 root=pathlib.Path(directory);meta=json.loads((root/'meta.json').read_text());records=[]
 for ident in meta['records']:
  if not __import__('re').fullmatch(r'gh:[0-9]+',ident):raise ValueError('Invalid stable ID')
  records.append(json.loads((root/'records'/(ident[3:]+'.json')).read_text()))
 if len(records)!=meta['recordCount'] or len({r['id'] for r in records})!=len(records) or digest(sorted(records,key=lambda r:r['id']))!=meta['revision']:raise ValueError('AI manifest integrity failure')
 count=0
 for r in records:
  if r['id']!=r['input']['metadata']['id'] or r['inputHash']!=digest({'input':r['input'],'versions':r['versions']}) or r['source']['metadataHash']!=digest(r['input']['metadata']) or validate(r['output'],r['input']):raise ValueError('Invalid approved record')
  old=store.current(r['id'])
  if old:continue  # Never replace an existing local task or manual decision.
  store.put(r['id'],r['inputHash'],r['input'],r['source'],0,r['versions'])
  with store.db:
   store.db.execute("UPDATE tasks SET status='candidate',output=?,flags=? WHERE id=? AND input_hash=?",(canonical(r['output']),canonical(flags(r['output'],r['input'])),r['id'],r['inputHash']))
  store.approve(r['id'],r['review']['reason'],r['review']['level'])
  with store.db:store.db.execute('UPDATE tasks SET reviewed_at=? WHERE id=? AND input_hash=?',(r['review']['at'],r['id'],r['inputHash']))
  manual=root/'overrides'/(r['id'][3:]+'.json')
  if manual.exists():
   value=json.loads(manual.read_text())
   if value['inputHash']==r['inputHash']:
    if value['output']!=r['output']:raise ValueError('Manual override conflict')
    atomic_json(store.path.parent/'overrides'/(r['id'][3:]+'-'+r['inputHash'][7:]+'.json'),value)
  count+=1
 return count

def sample(store,destination,seed):
 import math
 candidates=store.db.execute("SELECT * FROM tasks WHERE current=1 AND status='candidate' ORDER BY id").fetchall()
 ranked=sorted(candidates,key=lambda r:digest({'seed':seed,'id':r['id'],'hash':r['input_hash']}))
 selected={r['id'] for r in ranked[:max(1,math.ceil(len(ranked)*.1))]}
 # Cover every represented category, thin/condition cases and long tail explicitly.
 seen=set()
 for r in ranked:
  category=json.loads(r['output'])['category']
  if category not in seen:selected.add(r['id']);seen.add(category)
  if json.loads(r['flags']):selected.add(r['id'])
 for r in sorted(candidates,key=lambda r:(r['stars'],r['id']))[:max(1,len(candidates)//20)]:selected.add(r['id'])
 value={'seed':seed,'members':{r['id']:r['input_hash'] for r in candidates},'mustReview':sorted(selected),'created':stamp()}
 atomic_json(destination,value);return value

def approve_batch(store,sampling,reason):
 if not reason.strip():raise ValueError('Batch review reason required')
 if not set(sampling['mustReview'])<=set(sampling['members']):raise ValueError('Invalid sampling membership')
 for ident,h in sampling['members'].items():
  row=store.current(ident)
  if not row or row['input_hash']!=h:raise ValueError('Batch input changed after sampling')
 for ident in sampling['mustReview']:
  row=store.current(ident)
  if row['status']!='approved' or row['review_level']!='human-reviewed':raise ValueError('Sample and risk cases must be individually approved first')
 count=0
 for ident in sampling['members']:
  row=store.current(ident)
  if row['status']=='approved':continue
  if row['status']!='candidate' or json.loads(row['flags']):raise ValueError('Batch contains unresolved risk cases')
  store.approve(ident,reason+'; sampling seed '+sampling['seed'],'batch-approved');count+=1
 return count
