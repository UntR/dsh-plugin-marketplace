"""Quota snapshots are explicit observations, not inferred account access."""
import datetime,json,pathlib,subprocess,time

def epoch(value):
 if isinstance(value,(int,float)):return float(value)
 return datetime.datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()

def record(store,value,source):
 observed=epoch(value.get('observed_at',time.time()))
 if observed>time.time()+30 or time.time()-observed>300:raise ValueError('Quota observation must be within5 minutes')
 unlimited=value.get('weekly_unlimited',False)
 if type(unlimited) is not bool:raise ValueError('weekly_unlimited must be a boolean')
 if unlimited:
  store.record_quota(value['used5'],value.get('used_week'),epoch(value['reset5']),value.get('reset_week'),source,value.get('week_ratio'),observed,weekly_unlimited=True)
  return
 ratio=value.get('week_ratio');previous=store.quota()
 if ratio is None and previous and not previous['weekly_unlimited'] and previous['reset5']==epoch(value['reset5']) and previous['reset_week']==epoch(value['reset_week']):
  delta5=value['used5']-previous['used5'];deltaweek=value['used_week']-previous['used_week']
  if delta5>0 and deltaweek>0:ratio=deltaweek/delta5
  else:ratio=previous['week_ratio']
 store.record_quota(value['used5'],value['used_week'],epoch(value['reset5']),epoch(value['reset_week']),source,ratio,observed)

def from_file(store,path):record(store,json.loads(pathlib.Path(path).read_text()),'manual-file')

def from_mmx(store):
 # No login, credential extraction, or undocumented API. Accept only a verified
 # normalized JSON schema; unknown CLI versions fail closed, use manual entry.
 result=subprocess.run(['mmx','quota'],capture_output=True,text=True,timeout=30,check=True)
 value=json.loads(result.stdout)
 if not isinstance(value,dict) or not {'used5','reset5','observed_at'}<=set(value):raise ValueError('Unsupported mmx quota output; use explicit manual snapshot')
 record(store,value,'official-mmx-normalized-json')
