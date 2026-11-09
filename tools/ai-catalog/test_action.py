import contextlib,json,pathlib,tempfile,time,unittest
from unittest.mock import patch
from action import auto_export,checkpoint,deduplicate,execute,prepare,restore,window_events
from schema import canonical,digest
from store import Store
from review import atomic_json
from test_pipeline import ENTRY,RAW,fixture

class ActionTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.tmp.name);self.store=Store(self.root/'state.sqlite3');self.p,self.h,self.o,self.source=fixture()
 def tearDown(self):self.store.close();self.tmp.cleanup()
 def task(self):self.store.put(ENTRY['id'],self.h,self.p,self.source,12)
 def test_dedupe_id_and_canonical_repository_retains_distinct_projects(self):
  e={**ENTRY,'state':{'fork':False},'repositoryUrl':'https://github.com/example/plugin'}
  other={**e,'id':'gh:2','repositoryUrl':'https://github.com/EXAMPLE/PLUGIN.git/'}
  distinct={**e,'id':'gh:3','repositoryUrl':'https://github.com/another/plugin'}
  unique,aliases=deduplicate([e,other,distinct]);self.assertEqual(len(unique),2);self.assertEqual(len(aliases),1)
 def test_checkpoint_crashed_lease_does_not_repeat_paid_calls(self):
  self.task();state=self.root/'json-state';checkpoint(self.store,state)
  atomic_json(state/'lease.json',{'tasks':[{'id':ENTRY['id'],'inputHash':self.h}]})
  other=Store(self.root/'restored.sqlite3')
  try:restore(other,state);self.assertEqual(other.current(ENTRY['id'])['status'],'uncertain');self.assertEqual(other.pending(10),[])
  finally:other.close()
 def test_automatic_export_is_honestly_labelled(self):
  self.task();a=self.store.begin(self.store.current(ENTRY['id']),0,0);self.store.finish(a,'success',output=self.o)
  data=auto_export(self.store,self.root/'ai');self.assertEqual(data['recordCount'],1)
  r=json.loads((self.root/'ai/records/123456789.json').read_text());self.assertEqual(r['review']['level'],'automated')
 def test_bounded_action_end_to_end_without_network(self):
  self.task();state=self.root/'state';atomic_json(state/'lease.json',{'tasks':[{'id':ENTRY['id'],'inputHash':self.h}]})
  def fake(*args):return {'outcome':'success','output':self.o,'usage':{'prompt_tokens':100,'completion_tokens':10,'total_tokens':110},'flags':[]}
  with patch('action.request',side_effect=fake):result=execute(self.store,state,'FAKE',1,100000)
  self.assertEqual(result['attempts'],1);self.assertEqual(self.store.counts(),{'candidate':1});self.assertFalse((state/'lease.json').exists())
  self.task();atomic_json(state/'lease.json',{'tasks':[]})
  with patch('action.request',side_effect=AssertionError('Must not call twice in same five-hour budget window')):result=execute(self.store,state,'FAKE',1,100000)
  self.assertEqual(result['attempts'],0)
 def test_six_hour_budget_migrates_previous_run(self):
  state=self.root/'state';atomic_json(state/'last-run.json',{'completedAt':time.time(),'attempts':14,'weightedTokens':100937})
  self.assertEqual(sum(e['attempts'] for e in window_events(state)),14)
 def test_manual_rerun_respects_shared_800_attempt_window(self):
  self.task();state=self.root/'state';atomic_json(state/'lease.json',{'tasks':[{'id':ENTRY['id'],'inputHash':self.h}]})
  atomic_json(state/'window-usage.json',{'events':[{'id':'prior','completedAt':time.time(),'attempts':799,'weightedTokens':1}]})
  def fake(*args):return {'outcome':'success','output':self.o,'usage':{'prompt_tokens':100,'completion_tokens':10,'total_tokens':110},'flags':[]}
  with patch('action.request',side_effect=fake):result=execute(self.store,state,'FAKE',800,100000)
  self.assertEqual(result['attempts'],1);self.assertEqual(result['allowedAttemptLimit'],1);self.assertEqual(result['windowAttempts'],800)
  atomic_json(state/'lease.json',{'tasks':[]})
  with patch('action.request',side_effect=AssertionError('Window exhausted')):result=execute(self.store,state,'FAKE',800,100000)
  self.assertEqual(result['attempts'],0);self.assertEqual(result['stopReason'],'six_hour_window_limit')
 def test_six_hour_usage_expires(self):
  state=self.root/'state';atomic_json(state/'window-usage.json',{'events':[{'id':'expired','completedAt':time.time()-21601,'attempts':800,'weightedTokens':4000000}]})
  self.assertEqual(window_events(state),[])
 def test_insufficient_source_does_not_auto_publish(self):
  self.task();a=self.store.begin(self.store.current(ENTRY['id']),0,0);self.store.finish(a,'success',output={**self.o,'insufficient_evidence':True})
  self.assertEqual(auto_export(self.store,self.root/'ai')['recordCount'],0)

if __name__=='__main__':unittest.main()
