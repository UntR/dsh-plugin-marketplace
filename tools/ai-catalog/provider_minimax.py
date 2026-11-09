"""One paid attempt; only explicit rate rejection may be retried by scheduler."""
import json,time,urllib.error,urllib.request
from schema import SYSTEM,VERSIONS,canonical,validate,flags,resolve_evidence
from minimax_validate import NoRedirect,retry_delay
ENDPOINT='https://api.minimax.cn/v1/chat/completions'
MAX_OUTPUT=2048

def output_limit(repair=None):return 4096 if repair and 'finish_reason' in repair else MAX_OUTPUT

def payload(prepared,repair=None):
 messages=[{'role':'system','content':SYSTEM},{'role':'user','content':canonical(prepared)}]
 if repair:messages.append({'role':'user','content':'上次校验失败；重新生成完整对象。evidence本次只选1至2条，每个编号必须从实际输入列表复制，不得推算或补造编号。保持摘要简洁，limitations最多3条。错误：'+canonical(repair)})
 return {'model':VERSIONS['model'],'reasoning_effort':'low','max_completion_tokens':output_limit(repair),'stream':False,'messages':messages}

def reserve(prepared,repair=None):
 # UTF-8 bytes are a pessimistic proxy, not a provider tokenizer.
 input_bound=len((SYSTEM+canonical(prepared)).encode())+1024
 output=output_limit(repair)
 return input_bound+output,0.04*(input_bound+4*output)/3647

def request(prepared,key,repair=None):
 body=canonical(payload(prepared,repair)).encode();req=None
 try:
  req=urllib.request.Request(ENDPOINT,data=body,headers={'Authorization':'Bearer '+key,'Content-Type':'application/json','User-Agent':'DSH-AI-Catalog/1'},method='POST')
  with urllib.request.build_opener(NoRedirect()).open(req,timeout=120) as response:
   raw=response.read(1_000_001)
  if len(raw)>1_000_000:return {'outcome':'uncertain','error':'Response exceeds limit'}
  result=json.loads(raw.decode().replace(key,'[REDACTED]'))
  code=result.get('base_resp',{}).get('status_code',0)
  if code in {1002,1045,2062}:return {'outcome':'rate_limited','delay':60,'error':f'Provider rate rejection {code}'}
  if code:return {'outcome':'fatal','error':f'Provider rejection {code}'}
  usage={k:v for k,v in result.get('usage',{}).items() if k in ('prompt_tokens','completion_tokens','total_tokens') and type(v) is int and v>=0}
  content=result['choices'][0]['message'].get('content','')
  text=content.strip()
  if text.startswith('```') and text.endswith('```'):text=text[text.find('\n')+1:-3].strip()
  try:output=json.loads(text)
  except (ValueError,TypeError):output=None
  raw_output=output
  output,selection_errors=resolve_evidence(output,prepared)
  errors=selection_errors+validate(output,prepared)
  if result['choices'][0].get('finish_reason')!='stop':errors.append('finish_reason')
  if result.get('model')!=VERSIONS['model']:return {'outcome':'fatal','output':output,'usage':usage,'error':'Unexpected model; stop without retry'}
  if set(usage)!={'prompt_tokens','completion_tokens','total_tokens'}:return {'outcome':'uncertain','error':'Missing usage','output':{'raw_content':content},'usage':usage}
  if usage['total_tokens']!=usage['prompt_tokens']+usage['completion_tokens']:return {'outcome':'uncertain','error':'Inconsistent usage','usage':usage}
  return {'outcome':'invalid' if errors else 'success','output':output if output is not None else {'raw_content':content},'raw_output':raw_output if raw_output is not None else {'raw_content':content},'errors':errors,'flags':flags(output,prepared) if not errors else [],'usage':usage}
 except urllib.error.HTTPError as error:
  if error.code==429:return {'outcome':'rate_limited','delay':retry_delay(error.headers.get('Retry-After'),0),'error':'HTTP 429'}
  if error.code in (401,403):return {'outcome':'fatal','error':f'HTTP {error.code} authentication rejected'}
  return {'outcome':'uncertain','error':f'HTTP {error.code}; paid outcome not assumed'}
 except Exception as error:return {'outcome':'uncertain','error':type(error).__name__+'; paid outcome uncertain'}
 finally:req=None
