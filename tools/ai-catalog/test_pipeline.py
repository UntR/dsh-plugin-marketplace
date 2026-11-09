import contextlib,copy,io,json,pathlib,tempfile,time,unittest
from unittest.mock import patch
from schema import VERSIONS,digest,make_input,metadata,validate,flags,resolve_evidence
from store import Store
from scheduler import budget,run,process_lock
from review import export,override,import_approved,sample,approve_batch
from quota import record
from verify_native import inspect_archive

ENTRY={'id':'gh:123456789','name':'dsh-memory','slug':'example/dsh-memory','description':'A deterministic DSH memory plugin fixture.','topics':['dsh-plugin'],'language':'TypeScript','stats':{'stars':12},'install':{'available':True}}
RAW='# Features\n\nThe plugin stores conversation memories in a knowledge database. Search saved memories across sessions using explicit commands.\n\n# Limitations\n\nVersion <0.3.0 requires an external model provider. No installation or security test has been run.'

def fixture():
 payload,h=make_input(ENTRY,RAW)
 quote='The plugin stores conversation memories in a knowledge database.'
 paragraph=next(p for p in payload['paragraphs'] if quote in p['text'])
 value={'id':ENTRY['id'],'summary_zh':'为跨会话检索保存对话记忆，支持通过明确命令查找知识库中的内容。','category':'knowledge-memory','tags':['记忆','检索'],'confidence':.8,'insufficient_evidence':False,'evidence':[{'paragraph_id':paragraph['id'],'quote':quote,'fact':'保存对话记忆到知识库。'}],'limitations':[]}
 source={'headSha':'a'*40,'path':'README.md','rawHash':__import__('hashlib').sha256(RAW.encode()).hexdigest(),'metadataHash':digest(metadata(ENTRY)),'registryRevision':'sha256:'+'b'*64}
 return payload,h,value,source

class Pipeline(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.temp.name);self.store=Store(self.root/'state.sqlite3');self.payload,self.h,self.value,self.source=fixture()
  self.store.put(ENTRY['id'],self.h,self.payload,self.source,12)
 def tearDown(self):self.store.close();self.temp.cleanup()
 def quota(self,used5=0,used_week=0,ratio=.2):
  now=time.time();self.store.record_quota(used5,used_week,now+3600,now+86400,'test',ratio,now-1)
 def candidate(self):
  attempt=self.store.begin(self.store.current(ENTRY['id']),.2,.04)
  self.store.finish(attempt,'success',output=self.value,spent5=.04,spent_week=.008)
  return attempt
 def test_content_identity_ignores_stars_and_commit(self):
  changed=copy.deepcopy(ENTRY);changed['stats']['stars']=999
  self.assertEqual(make_input(changed,RAW)[1],self.h)
  changed['description']='Changed useful description'
  self.assertNotEqual(make_input(changed,RAW)[1],self.h)
 def test_source_rebind_preserves_approval(self):
  self.candidate();self.store.approve(ENTRY['id'],'Checked original README')
  self.store.put(ENTRY['id'],self.h,self.payload,{**self.source,'headSha':'c'*40},999)
  self.assertEqual(self.store.current(ENTRY['id'])['status'],'approved')
  self.assertEqual(json.loads(self.store.current(ENTRY['id'])['source'])['headSha'],'c'*40)
 def test_semantic_change_queues_new_input(self):
  self.candidate();self.store.approve(ENTRY['id'],'Checked')
  payload,h=make_input({**ENTRY,'description':'Different core use'},RAW)
  self.store.put(ENTRY['id'],h,payload,self.source,12)
  self.assertEqual(self.store.current(ENTRY['id'])['status'],'prepared')
  self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM tasks WHERE status='approved'").fetchone()[0],1)
 def test_crash_intent_is_uncertain_no_automatic_retry(self):
  self.store.begin(self.store.current(ENTRY['id']),.2,.04);self.store.recover()
  self.assertEqual(self.store.current(ENTRY['id'])['status'],'uncertain');self.assertEqual(self.store.pending(100),[])
  self.quota();self.assertIsNone(budget(self.store,.2))
  self.store.retry(ENTRY['id'],'Possible duplicate billing understood',uncertain=True)
  self.assertEqual(len(self.store.pending(100)),1)
 def test_settlement_is_idempotent(self):
  attempt=self.candidate()
  with self.assertRaises(RuntimeError):self.store.finish(attempt,'success',output=self.value)
 def test_daily_and_weekly_gates(self):
  self.quota(79.9,0);self.assertEqual(budget(self.store,.2),'five_hour_budget_reached')
  self.quota(0,79.99);self.assertEqual(budget(self.store,.2),'weekly_budget_reached')
 def test_quota_missing_stale_or_reset_blocks(self):
  self.assertEqual(budget(self.store,.2),'quota_snapshot_required');self.quota()
  q=self.store.quota();self.assertEqual(budget(self.store,.2,q['observed']+301),'quota_snapshot_stale')
  self.quota(ratio=None);self.assertEqual(budget(self.store,.2),'weekly_calibration_required')
 def test_inflight_reservation_counts(self):
  self.quota(79.6,0);self.store.begin(self.store.current(ENTRY['id']),.3,.06)
  self.assertEqual(budget(self.store,.2),'five_hour_budget_reached')
 def test_shared_usage_observation_takes_effect(self):
  self.quota();self.assertIsNone(budget(self.store,.2));self.quota(90,10)
  self.assertEqual(budget(self.store,.2),'five_hour_budget_reached')
 def test_one_repair_only(self):
  for i in range(2):
   attempt=self.store.begin(self.store.current(ENTRY['id']),.2,.04);self.store.finish(attempt,'invalid',errors=['summary_length'])
   if i==0:self.store.retry(ENTRY['id'],'Repair invalid output')
  with self.assertRaises(ValueError):self.store.retry(ENTRY['id'],'No unbounded repairs')
 def test_evidence_and_shape_validation(self):
  self.assertEqual(validate(self.value,self.payload),[])
  wrong=copy.deepcopy(self.value);wrong['evidence'][0]['quote']='Fabricated sentence that is not in the given source.'
  self.assertIn('evidence_anchor',validate(wrong,self.payload))
  wrong['summary_zh']='长'*141;self.assertIn('summary_length',validate(wrong,self.payload))
 def test_batch_approval_risk_guard(self):
  self.candidate()
  with self.store.db:self.store.db.execute("UPDATE tasks SET flags='[\"conditions_or_security\"]'")
  with self.assertRaises(ValueError):self.store.approve(ENTRY['id'],'Batch checked','batch-approved')
  self.store.approve(ENTRY['id'],'Individually verified')
 def test_export_preserves_prior_results_and_overrides(self):
  self.candidate();self.store.approve(ENTRY['id'],'Checked');directory=self.root/'ai-data';meta=export(self.store,directory)
  other=Store(self.root/'other.sqlite3')
  try:self.assertEqual(export(other,directory)['revision'],meta['revision'])
  finally:other.close()
  value={**self.value,'summary_zh':'手工校正的摘要，说明该插件保存对话记忆并支持跨会话检索。'}
  override(self.store,ENTRY['id'],value,'Manually corrected',directory);export(self.store,directory)
  self.assertEqual(json.loads((directory/'overrides/123456789.json').read_text())['inputHash'],self.h)
 def test_successful_scheduler_persists_and_skips_candidates(self):
  self.quota();calls=[]
  def send(prepared,key,repair):
   calls.append(prepared);return {'outcome':'success','output':self.value,'usage':{'prompt_tokens':100,'completion_tokens':20,'total_tokens':120},'flags':[]}
  with contextlib.redirect_stdout(io.StringIO()):result=run(self.store,'FICTITIOUS',limit=2,send=send)
  self.assertEqual(result['attempts'],1);self.assertEqual(self.store.counts(),{'candidate':1});self.assertTrue((self.root/'backups/latest.sqlite3').exists())
  with contextlib.redirect_stdout(io.StringIO()):run(self.store,'FICTITIOUS',limit=2,send=send)
  self.assertEqual(len(calls),1)
 def test_uncertain_network_result_stops(self):
  self.quota()
  with contextlib.redirect_stdout(io.StringIO()):result=run(self.store,'FICTITIOUS',limit=2,send=lambda *a:{'outcome':'uncertain','error':'timeout'})
  self.assertEqual(result['stop_reason'],'uncertain');self.assertEqual(self.store.counts(),{'uncertain':1})
 def test_write_failure_never_sends(self):
  self.quota();calls=[]
  with patch.object(self.store,'begin',side_effect=OSError('disk full')):
   with self.assertRaises(OSError):run(self.store,'FICTITIOUS',send=lambda *a:calls.append(a))
  self.assertEqual(calls,[])
 def test_worker_lock(self):
  with process_lock(self.root/'worker.lock'):
   with self.assertRaises(RuntimeError):
    with process_lock(self.root/'worker.lock'):pass
 def test_manual_quota_calibration(self):
  now=time.time();record(self.store,{'used5':4,'used_week':1,'reset5':now+3600,'reset_week':now+86400,'observed_at':now},'test')
  record(self.store,{'used5':8,'used_week':2,'reset5':now+3600,'reset_week':now+86400,'observed_at':now},'test')
  self.assertEqual(self.store.quota()['week_ratio'],.25)
 def test_restore_after_state_loss(self):
  self.candidate();self.store.approve(ENTRY['id'],'Checked');directory=self.root/'ai-data';meta=export(self.store,directory)
  restored=Store(self.root/'restored.sqlite3')
  try:
   self.assertEqual(import_approved(restored,directory),1)
   self.assertEqual(restored.current(ENTRY['id'])['status'],'approved')
   self.assertEqual(export(restored,directory)['revision'],meta['revision'])
   self.assertEqual(import_approved(restored,directory),0)
  finally:restored.close()
 def test_export_crash_keeps_prior_generation(self):
  self.candidate();self.store.approve(ENTRY['id'],'Checked');directory=self.root/'ai-data';before=export(self.store,directory)
  changed={**self.value,'summary_zh':'修改后的摘要用于验证导出中断时仍能保留上一份有效的审核成果。'}
  with self.store.db:self.store.db.execute('UPDATE tasks SET output=?',(json.dumps(changed),))
  import review
  original=review.atomic_json
  def fail(path,value):
   if pathlib.Path(path).name=='meta.json':raise OSError('disk full')
   return original(path,value)
  with patch.object(review,'atomic_json',side_effect=fail):
   with self.assertRaises(OSError):export(self.store,directory)
  self.assertEqual(json.loads((directory/'meta.json').read_text())['revision'],before['revision'])
  self.assertEqual(json.loads((directory/'records/123456789.json').read_text())['output'],self.value)
 def test_batch_requires_persisted_individual_sample_reviews(self):
  self.candidate()
  for i in range(2,12):
   payload=copy.deepcopy(self.payload);payload['metadata']['id']='gh:'+str(i)
   h=digest({'input':payload,'versions':VERSIONS});value={**self.value,'id':'gh:'+str(i)}
   self.store.put(value['id'],h,payload,self.source,i)
   attempt=self.store.begin(self.store.current(value['id']),.2,.04);self.store.finish(attempt,'success',output=value)
  sampling=sample(self.store,self.root/'sample.json','deterministic-test-seed')
  with self.assertRaises(ValueError):approve_batch(self.store,sampling,'Batch looked good')
  for ident in sampling['mustReview']:self.store.approve(ident,'Individual source check')
  self.assertEqual(approve_batch(self.store,sampling,'Batch reviewed'),11-len(sampling['mustReview']))
 def test_provider_network_and_explicit_rate_rejection(self):
  import provider_minimax as provider,urllib.error
  class Failing:
   def __init__(self,error):self.error=error
   def open(self,*a,**kw):raise self.error
  fakekey='sk-cp-FICTITIOUS_TEST_ONLY'
  with patch.object(provider.urllib.request,'build_opener',return_value=Failing(TimeoutError())):
   self.assertEqual(provider.request(self.payload,fakekey)['outcome'],'uncertain')
  error=urllib.error.HTTPError(provider.ENDPOINT,429,'Rate',{'Retry-After':'90'},None)
  with patch.object(provider.urllib.request,'build_opener',return_value=Failing(error)):
   result=provider.request(self.payload,fakekey);self.assertEqual(result['outcome'],'rate_limited');self.assertEqual(result['delay'],90)
 def test_bad_source_does_not_starve_remaining_plan(self):
  import cli
  registry=self.root/'registry';(registry/'plugins').mkdir(parents=True)
  entries=[]
  for i in (2,3):
   e=copy.deepcopy(ENTRY);e['id']='gh:'+str(i);e['detailPath']='./plugins/'+str(i)+'.json';entries.append(e)
   (registry/'plugins'/(str(i)+'.json')).write_text(json.dumps({'github':{'headSha':'a'*40}}))
  (registry/'index.json').write_text(json.dumps({'revision':'sha256:'+'b'*64,'plugins':entries}))
  with patch('sys.argv',['cli','--state',str(self.store.path),'plan','--registry',str(registry),'--limit','2']):
   with patch.object(cli,'read_readme',side_effect=[ValueError('oversized source'),(RAW,{'headSha':'a'*40,'path':'README.md','rawHash':'c'*64})]):
    with contextlib.redirect_stdout(io.StringIO()):cli.main()
  self.assertEqual(self.store.counts(),{'prepared':1,'source_failed':1})
 def test_explicit_unlimited_week_skips_only_weekly_gate(self):
  now=time.time();record(self.store,{'used5':4,'weekly_unlimited':True,'reset5':now+2200,'observed_at':now},'user-screenshot')
  q=self.store.quota();self.assertTrue(q['weekly_unlimited']);self.assertIsNone(q['used_week']);self.assertIsNone(q['reset_week']);self.assertEqual(q['week_ratio'],0)
  self.assertIsNone(budget(self.store,.2));self.assertEqual(budget(self.store,77),'five_hour_budget_reached')
  self.assertEqual(budget(self.store,.2,now+301),'quota_snapshot_stale')
 def test_unlimited_does_not_mean_zero_percent_week(self):
  now=time.time();record(self.store,{'used5':4,'used_week':0,'reset5':now+2200,'reset_week':now+86400,'observed_at':now},'test')
  self.assertFalse(self.store.quota()['weekly_unlimited']);self.assertEqual(budget(self.store,.2),'weekly_calibration_required')
 def test_unlimited_snapshot_rejects_ambiguous_week_values(self):
  now=time.time()
  for extra in [{'used_week':0},{'week_ratio':.2},{'reset_week':now+86400},{'weekly_unlimited':'true'}]:
   with self.assertRaises(ValueError):record(self.store,{'used5':4,'weekly_unlimited':True,'reset5':now+2200,'observed_at':now,**extra},'test')
 def test_unlimited_flag_does_not_survive_switch_to_limited_plan(self):
  now=time.time();record(self.store,{'used5':4,'weekly_unlimited':True,'reset5':now+2200,'observed_at':now},'test')
  record(self.store,{'used5':4,'used_week':20,'reset5':now+2200,'reset_week':now+86400,'observed_at':now},'test')
  self.assertFalse(self.store.quota()['weekly_unlimited']);self.assertIsNone(self.store.quota()['week_ratio']);self.assertEqual(budget(self.store,.2),'weekly_calibration_required')
 def test_evidence_ids_materialize_exact_source_without_mutating_model_output(self):
  paragraph=next(p for p in self.payload['paragraphs'] if 20<=len(p['text'])<=120)
  wire={**self.value,'evidence':[{'paragraph_id':paragraph['id'],'fact':'该片段支持的事实。'}]};before=copy.deepcopy(wire)
  resolved,errors=resolve_evidence(wire,self.payload)
  self.assertEqual(errors,[]);self.assertEqual(resolved['evidence'][0]['quote'],paragraph['text']);self.assertEqual(wire,before)
  self.assertEqual(validate(resolved,self.payload),[])
 def test_evidence_ids_reject_unknown_duplicate_and_freehand_quotes(self):
  ident=next(p['id'] for p in self.payload['paragraphs'] if len(p['text'])>=20)
  for evidence in [[{'paragraph_id':'not-present','fact':'事实'}],[{'paragraph_id':ident,'fact':'事实','quote':'不能偷偷改写'}],[{'paragraph_id':ident,'fact':'事实'}]*4,[{'paragraph_id':ident,'fact':'事实'}]*2]:
   self.assertTrue(resolve_evidence({**self.value,'evidence':evidence},self.payload)[1])
 def test_source_snippets_stay_bounded_and_original(self):
  payload,_=make_input(ENTRY,RAW)
  self.assertTrue(all(len(p['text'])<=120 for p in payload['paragraphs']))
  self.assertEqual(len({p['id'] for p in payload['paragraphs']}),len(payload['paragraphs']))
  self.assertTrue(all(p['text'] in RAW or p['text'] in ENTRY['description'] for p in payload['paragraphs']))
 def test_raw_and_resolved_model_output_are_both_retained(self):
  attempt=self.store.begin(self.store.current(ENTRY['id']),.2,.04);wire={'evidence':[{'paragraph_id':'p1','fact':'raw fact'}]}
  self.store.finish(attempt,'success',output=self.value,raw_output=wire)
  row=self.store.db.execute('SELECT response,raw_response FROM attempts WHERE attempt_id=?',(attempt,)).fetchone()
  self.assertEqual(json.loads(row['response']),self.value);self.assertEqual(json.loads(row['raw_response']),wire)
 def test_authorized_dotenv_only_reads_named_literal(self):
  from credentials import load_subscription_key
  path=self.root/'minimax.env';fake='sk-cp-FICTITIOUS_TEST_ONLY'
  for text in ['MINIMAX_API_KEY='+fake,'export MINIMAX_API_KEY="'+fake+'" # comment',"MINIMAX_API_KEY='"+fake+"'",'UNRELATED=ignored\nMINIMAX_API_KEY='+fake]:
   path.write_text(text);self.assertEqual(load_subscription_key(path),fake)
 def test_dotenv_rejects_duplicates_payg_and_shell_expressions(self):
  from credentials import load_subscription_key
  path=self.root/'minimax.env'
  for text in ['MINIMAX_API_KEY=sk-PAYG_FICTITIOUS','MINIMAX_API_KEY=one\nMINIMAX_API_KEY=two','MINIMAX_API_KEY=$(touch SHOULD_NOT_EXIST)','OTHER_KEY=value']:
   path.write_text(text)
   with self.assertRaises(ValueError):load_subscription_key(path)
  self.assertFalse((self.root/'SHOULD_NOT_EXIST').exists())
 def test_only_truncated_output_gets_larger_repair_budget(self):
  from provider_minimax import payload,reserve
  self.assertEqual(payload(self.payload)['max_completion_tokens'],2048)
  self.assertEqual(payload(self.payload,['evidence'])['max_completion_tokens'],2048)
  self.assertEqual(payload(self.payload,['finish_reason'])['max_completion_tokens'],4096)
  self.assertGreater(reserve(self.payload,['finish_reason'])[1],reserve(self.payload)[1])
 def test_attempt_records_exact_public_request_without_credentials(self):
  from provider_minimax import payload
  request=payload(self.payload,['finish_reason']);attempt=self.store.begin(self.store.current(ENTRY['id']),.2,.04,request)
  row=self.store.db.execute('SELECT request_hash,request_body FROM attempts WHERE attempt_id=?',(attempt,)).fetchone()
  self.assertEqual(row['request_hash'],digest(request));self.assertEqual(json.loads(row['request_body']),request)
  self.assertNotIn('Authorization',row['request_body']);self.assertNotIn('Bearer',row['request_body'])
 def test_archive_inspection_does_not_extract(self):
  import tarfile
  manifest={'name':'test','version':'1.0.0','engines':{'dsh':'*'},'dsh':{'bundle':{'patch':'./bundle.yml'}}}
  stream=io.BytesIO()
  with tarfile.open(fileobj=stream,mode='w:gz') as archive:
   for name,content in [('package/package.json',json.dumps(manifest).encode()),('package/bundle.yml',b'plugins: []')]:
    info=tarfile.TarInfo(name);info.size=len(content);archive.addfile(info,io.BytesIO(content))
  inspected,checksum=inspect_archive(stream.getvalue(),'test','1.0.0');self.assertEqual(inspected,manifest)
  with self.assertRaises(ValueError):inspect_archive(stream.getvalue(),'other','1.0.0')

if __name__=='__main__':unittest.main()
