#!/usr/bin/env python3
"""User-started 100-record validation. No saved key, no production writes."""
import collections,concurrent.futures,datetime,email.utils,getpass,hashlib,json,math,pathlib,random,sys,time,urllib.error,urllib.request,warnings
from schema_v2 import SYSTEM,validate,quality_flags,compatibility_note
from clean_readme import excerpt
ROOT=pathlib.Path(__file__).resolve().parent
ENDPOINT='https://api.minimax.cn/v1/chat/completions'
MODEL='MiniMax-M3.1-Flash'
LIMIT=100;MAX_ATTEMPTS=120;MAX_RETRIES=2
RATE_CODES={1002,1045,2062}
MAX_OUTPUT=2048;MAX_INPUT_BYTES=12000;OVERHEAD_RESERVE=1024
INITIAL_CONCURRENCY=3;INITIAL_RPM=30;INITIAL_TPM=180000
STATUS=ROOT/'status.json';RESULTS=ROOT/'results.json';REPORT=ROOT/'report.md';LOCK=ROOT/'run-started.json'

def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def atomic_json(path,value):
 tmp=path.with_suffix(path.suffix+'.tmp');tmp.write_text(json.dumps(value,ensure_ascii=False,indent=2));tmp.replace(path)
def state(name,**kw):atomic_json(STATUS,{'state':name,'updated_at':now(),**kw})
def key_ok(key):return key.startswith('sk-cp-') and len(key)>16 and not any(c.isspace() for c in key)
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,req,fp,code,msg,headers,newurl):
  raise urllib.error.HTTPError(req.full_url,code,'Redirect blocked',headers,fp)

def payload_for(row):
 item=dict(row['input']);item['compatibility_note_template']=compatibility_note(item['install_available']);raw=item['readme_text'];budget=len(raw.encode())
 while len((SYSTEM+json.dumps(item,ensure_ascii=False)).encode())>MAX_INPUT_BYTES:
  budget-=250
  if budget<250:raise ValueError('Metadata exceeds input cap')
  item['readme_text']=excerpt(raw,budget);item['readme_excerpt_truncated']=True
 return {'model':MODEL,'reasoning_effort':'low','max_completion_tokens':MAX_OUTPUT,'stream':False,'messages':[{'role':'system','content':SYSTEM},{'role':'user','content':json.dumps(item,ensure_ascii=False)}]}

def reserve_tokens(payload):
 # Byte-count budget deliberately conservative, NOT a provider tokenizer or limit.
 return sum(len(m['content'].encode()) for m in payload['messages'])+OVERHEAD_RESERVE+MAX_OUTPUT

def parse_content(text):
 text=text.strip()
 if text.startswith('```json') and text.endswith('```'):text=text[7:-3].strip()
 elif text.startswith('```') and text.endswith('```'):text=text[3:-3].strip()
 return json.loads(text)

def retry_delay(header,try_index,walltime=None):
 base=min(300,60*(2**try_index));walltime=time.time() if walltime is None else walltime
 if header:
  try:parsed=float(header)
  except (TypeError,ValueError):
   try:parsed=email.utils.parsedate_to_datetime(header).timestamp()-walltime
   except (TypeError,ValueError,OverflowError):parsed=base
  if math.isfinite(parsed):base=max(base,parsed)
 # Do not silently ignore an unusually long server wait or hold key indefinitely.
 return max(0,base)

class Limiter:
 def __init__(self):self.events=[];self.concurrency=INITIAL_CONCURRENCY;self.rpm=INITIAL_RPM;self.tpm=INITIAL_TPM;self.cooldown=0
 def wait(self,ts,reserve):
  self.events=[e for e in self.events if ts-e['t']<60]
  wait=max(0,self.cooldown-ts)
  active=list(self.events)
  if len(active)>=self.rpm:wait=max(wait,active[-self.rpm]['t']+60.1-ts)
  while active and sum(e['tokens'] for e in active)+reserve>self.tpm:
   e=active.pop(0);wait=max(wait,e['t']+60.1-ts)
  if reserve>self.tpm:raise ValueError('Single request exceeds client token budget')
  return max(0,wait)
 def add(self,seq,ts,reserve):self.events.append({'seq':seq,'t':ts,'tokens':reserve})
 def settle(self,seq,rec):
  for e in self.events:
   if e['seq']==seq:
    if rec.get('rate_limited'):e['tokens']=0
    elif rec.get('usage',{}).get('total_tokens') is not None:e['tokens']=rec['usage']['total_tokens']
 def throttle(self,ts,delay):
  self.concurrency=max(1,self.concurrency//2);self.rpm=max(3,self.rpm//2);self.tpm=max(30000,self.tpm//2);self.cooldown=max(self.cooldown,ts+delay)
 def info(self):return {'concurrency':self.concurrency,'rpm':self.rpm,'tpm_reservation_budget':self.tpm,'cooldown_remaining_seconds':round(max(0,self.cooldown-time.monotonic()),1)}

def request_one(row,payload,key,seq,try_index,start_offset):
 rec={'sequence':seq,'id':row['input']['id'],'slug':row['input']['slug'],'existing_category':row['existing_category'],'stratum':row['stratum'],'try_index':try_index,'started_at':now(),'start_offset_seconds':round(start_offset,3),'ok':False,'reserved_tokens':reserve_tokens(payload)}
 body=json.dumps(payload,ensure_ascii=False).encode();rec['request_bytes']=len(body);start=time.monotonic();req=None
 try:
  req=urllib.request.Request(ENDPOINT,data=body,headers={'Authorization':'Bearer '+key,'Content-Type':'application/json','User-Agent':'DSH-public-metadata-validation/2.0'},method='POST')
  # Each worker owns its own opener. No redirects, cookies, or persistent credentials.
  with urllib.request.build_opener(NoRedirect()).open(req,timeout=120) as response:
   rec['http_status']=response.status
   text=response.read(1_000_001)
   if len(text)>1_000_000:raise ValueError('Response too large')
   result=json.loads(text.decode().replace(key,'[REDACTED]'))
  code=result.get('base_resp',{}).get('status_code',0)
  if code!=0:
   rec['provider_status_code']=code
   if code in RATE_CODES:
    rec['rate_limited']=True;rec['retry_after_seconds']=retry_delay(None,try_index);rec['error']='Documented provider rate rejection; bounded backoff only'
   else:rec['error']='Provider error: stop without retry'
   return rec
  u=result.get('usage',{});rec['usage']={k:v for k,v in u.items() if k in {'prompt_tokens','completion_tokens','total_tokens'} and type(v) is int and v>=0}
  rec['response_model']=result.get('model');answer=result['choices'][0]['message'].get('content','')
  rec['raw_content']=answer;rec['finish_reason']=result['choices'][0].get('finish_reason')
  # Do not persist reasoning_content or complete response / authentication headers.
  try:rec['output']=parse_content(answer)
  except (ValueError,TypeError):rec['validation_errors']=['invalid_json']
  else:rec['validation_errors']=validate(rec['output'],row['input']['id'],row['input']['install_available'])
  rec['ok']=not rec['validation_errors'] and rec['finish_reason']=='stop'
  rec['quality_flags']=quality_flags(rec.get('output'),row)
  if set(rec['usage'])!={'prompt_tokens','completion_tokens','total_tokens'}:rec['error']='Usage missing: stop for review'
  elif rec['usage']['total_tokens']>rec['reserved_tokens']:rec['error']='Actual tokens exceed reservation: stop for review'
  elif rec['response_model']!=MODEL:rec['error']='Unexpected model: stop for review'
 except urllib.error.HTTPError as e:
  rec['http_status']=e.code
  if e.code==429:rec['rate_limited']=True;rec['retry_after_seconds']=retry_delay(e.headers.get('Retry-After'),try_index);rec['error']='HTTP 429: request rejected; bounded backoff only'
  else:rec['error']='HTTP '+str(e.code)+': stop without retry'
 except Exception as e:
  rec['error']=type(e).__name__+': request failed or outcome uncertain; never automatically retry'
 finally:
  req=None;rec['elapsed_seconds']=round(time.monotonic()-start,3);rec['finished_at']=now()
 return rec

def report(records,elapsed,attempts,pending,limiter,reason=None):
 byid={}
 for r in sorted(records,key=lambda r:r['sequence']):
  if not r.get('rate_limited'):byid[r['id']]=r
 usage={k:sum(r.get('usage',{}).get(k,0) for r in records) for k in ('prompt_tokens','completion_tokens','total_tokens')}
 allrec=sorted(records,key=lambda r:r['sequence']);peaktokens=peakrpm=0
 for r in allrec:
  window=[x for x in allrec if 0<=r['start_offset_seconds']-x['start_offset_seconds']<60]
  peaktokens=max(peaktokens,sum(x.get('usage',{}).get('total_tokens',0) for x in window));peakrpm=max(peakrpm,len(window))
 data={'model':MODEL,'reasoning_effort':'low','endpoint':ENDPOINT,'sample_count':LIMIT,'attempts':attempts,'completed_unique_records':len(byid),'http_success':sum(r.get('http_status')==200 and not r.get('provider_status_code') for r in allrec),'schema_valid':sum(r.get('ok',False) for r in byid.values()),'throttled_requests':sum(bool(r.get('rate_limited')) for r in allrec),'elapsed_seconds':round(elapsed,3),'usage':usage,'catalog_value_cny':round((usage['prompt_tokens']+4*usage['completion_tokens'])/1_000_000,6),'usage_complete':len(allrec)==attempts and all(r.get('rate_limited') or set(r.get('usage',{}))=={'prompt_tokens','completion_tokens','total_tokens'} for r in allrec),'unaccounted_attempts':attempts-sum(bool(r.get('rate_limited')) or set(r.get('usage',{}))=={'prompt_tokens','completion_tokens','total_tokens'} for r in allrec),'observed_peak_rolling_rpm':peakrpm,'observed_peak_rolling_tokens_by_request_start':peaktokens,'client_limits':limiter.info(),'stop_reason':reason,'pending_count':LIMIT-len(byid),'billing_note':'Catalog value is not an invoice. Subscription allowance first, then existing credit packs may be deducted automatically; no recharge, upgrade or PAYG key. Account-specific subscription limit and balance are not inspected.','limitations':'Balanced targeted validation plus 10 regression cases, not a random population accuracy estimate. Existing categories are not ground truth. Client TPM is a byte-count reservation budget, not a confirmed provider limit; actual usage recorded. Other clients on the same account share limits. No plugin execution, installation or production edits.','records':allrec}
 atomic_json(RESULTS,data)
 lines=['# DSH MiniMax 修订样本分层验证','',f'已尝试 {attempts}/{MAX_ATTEMPTS} 次，获得 {len(byid)}/修订样本非限流响应；字段校验通过 {data["schema_valid"]} 条。',f'模型：{MODEL} / low；耗时 {elapsed:.1f} 秒；输入/输出/总 tokens：{usage["prompt_tokens"]}/{usage["completion_tokens"]}/{usage["total_tokens"]}。',f'429：{data["throttled_requests"]} 次；停止原因：{reason or "无"}。',f'公开目录价等值：¥{data["catalog_value_cny"]:.6f}，不等于实际账单。',data['billing_note'],data['limitations'],'']
 for r in byid.values():
  o=r.get('output');o=o if isinstance(o,dict) else {};lines.extend(['## '+r['slug'],f'分层：{r["stratum"]}；旧分类：{r["existing_category"]}；AI：{o.get("category","无")}。',str(o.get('summary_zh',r.get('error',''))),'人工复核标记：'+', '.join(r.get('quality_flags',[])),''])
 temp=REPORT.with_suffix('.md.tmp');temp.write_text('\n'.join(lines));temp.replace(REPORT)
 return data

def load_inputs():
 raw=(ROOT/'samples.json').read_bytes();expected=(ROOT/'manifest-sha256.txt').read_text().strip()
 if hashlib.sha256(raw).hexdigest()!=expected:raise ValueError('Manifest checksum mismatch')
 rows=json.loads(raw)['samples']
 if len(rows)!=LIMIT or len({r['input']['id'] for r in rows})!=LIMIT:raise ValueError('Unexpected sample count or duplicate IDs')
 return rows,[payload_for(r) for r in rows]

def main():
 rows,payloads=load_inputs()
 if sys.argv[1:]==['--dry-run']:
  atomic_json(ROOT/'requests-preview.json',payloads)
  stats={'model_calls':0,'samples':len(rows),'max_input_bytes':max(sum(len(m['content'].encode()) for m in p['messages']) for p in payloads),'max_reserved_tokens':max(reserve_tokens(p) for p in payloads),'initial_concurrency':INITIAL_CONCURRENCY,'initial_rpm':INITIAL_RPM,'client_tpm_budget':INITIAL_TPM,'max_attempts':MAX_ATTEMPTS,'no_key_needed':True}
  atomic_json(ROOT/'dry-run.json',stats);print(json.dumps(stats,ensure_ascii=False,indent=2));return
 if sys.argv[1:]:raise SystemExit('Only --dry-run is supported; no key in arguments.')
 if not sys.stdin.isatty():raise SystemExit('Run in your own Terminal; hidden interactive input required.')
 if LOCK.exists():raise SystemExit('本轮已有启动记录，禁止重复启动。查看 status.json / results.json；不要删除锁重跑。')
 print('MiniMax 修订样本公开目录验证，仅本次运行。模型 MiniMax-M3.1-Flash，low。')
 print('并发 3，最多 30 RPM，客户端 180k TPM 预算；这是本次限速，不是已确认的订阅限额。')
 print(f'本轮{LIMIT}条，最多{MAX_ATTEMPTS}次尝试；仅明确限流可退避重试，不确定结果不重试。')
 print(f'仅发送{LIMIT}个公开仓库的名称、描述、主题和清洗后的README。固定地址：'+ENDPOINT)
 print('不会读取现有凭据或配置；Key只放进程内存，不写文件、环境变量、命令历史或日志。')
 print('Key泄露可能让别人使用你的API账户。只在下方隐藏输入，绝不要发到聊天。')
 print('订阅额度不足时可能自动消耗已有积分包；不扣普通API余额，不充值/升级/购买新积分。')
 print('实际套餐/剩余额度未读取，其他工具也共享账户限额。运行前可自行检查套餐用量。')
 print('目录价估值不等于实际扣款；本次请求体和数量见 requests-preview.json。')
 print('修订样本个人验证，不做全量生产处理，不安装或执行仓库代码。Ctrl+C可停止新请求，已发送请求可能仍计量。')
 state('waiting_for_user_key',api_calls=0)
 with warnings.catch_warnings():
  warnings.simplefilter('error',getpass.GetPassWarning);key=getpass.getpass('请自行粘贴中国站订阅Key（sk-cp-开头，隐藏）：').strip()
 if not key_ok(key):key=None;state('invalid_key_type',api_calls=0);raise SystemExit('不是订阅Key，未发送。')
 state('waiting_for_user_confirmation',api_calls=0)
 print('确认仅向上述MiniMax地址传输Key作本次鉴权及修订样本公开资料；知悉并允许不足时扣已有积分。')
 if input('同意请输入 RUNREVISION（其他输入取消）：').strip()!='RUNREVISION':key=None;state('cancelled',api_calls=0);return
 try:
  with LOCK.open('x') as f:json.dump({'started_at':now(),'user_confirmed':'RUNREVISION','max_unique_records':LIMIT,'max_attempts':MAX_ATTEMPTS},f)
 except FileExistsError:key=None;raise SystemExit('已有运行，停止。')
 limiter=Limiter();queue=collections.deque((i,0) for i in range(LIMIT));active={};records=[];attempts=0;started=time.monotonic();stop=None
 executor=concurrent.futures.ThreadPoolExecutor(max_workers=INITIAL_CONCURRENCY)
 try:
  while queue or active:
   for future in list(active):
    if not future.done():continue
    idx,tries,seq=active.pop(future);rec=future.result();records.append(rec);limiter.settle(seq,rec)
    print(f'[{len({r["id"] for r in records if not r.get("rate_limited")})}/{LIMIT}] {rec["slug"]}: HTTP {rec.get("http_status","?")} / '+('通过' if rec['ok'] else '需检查'),flush=True)
    if rec.get('rate_limited'):
     delay=rec['retry_after_seconds']
     if delay>600:stop='Server Retry-After exceeds 10 minutes; inspect before continuing'
     elif tries>=MAX_RETRIES:stop='429 retry limit reached'
     else:
      limiter.throttle(time.monotonic(),delay+random.uniform(0.2,1.5));queue.appendleft((idx,tries+1))
      print(f'429：全局暂停至少{delay:.0f}秒，降至并发{limiter.concurrency}、{limiter.rpm}RPM。',flush=True)
    elif rec.get('error'):stop=rec['error']
   if stop:queue.clear()
   while queue and len(active)<limiter.concurrency and not stop:
    idx,tries=queue[0];reserve=reserve_tokens(payloads[idx]);ts=time.monotonic()
    if limiter.wait(ts,reserve)>0:break
    if attempts>=MAX_ATTEMPTS:stop='Maximum total attempts reached';queue.clear();break
    queue.popleft();attempts+=1;seq=attempts;limiter.add(seq,ts,reserve)
    # Record intent before sending. A crash / uncertain in-flight request is never resumed automatically.
    state('running',api_calls=attempts,recorded_attempts=len(records),active=len(active)+1,current=rows[idx]['input']['slug'],client_limits=limiter.info())
    future=executor.submit(request_one,rows[idx],payloads[idx],key,seq,tries,ts-started);active[future]=(idx,tries,seq)
   data=report(records,time.monotonic()-started,attempts,len(queue),limiter,stop)
   state('stopping' if stop else 'running',api_calls=attempts,recorded_attempts=len(records),unique_records=data['completed_unique_records'],schema_valid=data['schema_valid'],active=len(active),client_limits=limiter.info(),stop_reason=stop)
   if active:concurrent.futures.wait(active,timeout=1,return_when=concurrent.futures.FIRST_COMPLETED)
   elif queue:time.sleep(min(2,max(0.1,limiter.wait(time.monotonic(),reserve_tokens(payloads[queue[0][0]])))))
 except KeyboardInterrupt:
  stop='User interrupted; no further requests. In-flight requests may still complete.';queue.clear()
  report(records,time.monotonic()-started,attempts,0,limiter,stop)
  state('interrupted_waiting_for_inflight',api_calls=attempts,recorded_attempts=len(records),uncertain_inflight=len(active),stop_reason=stop)
  print('\n停止发送新请求，等已发送请求返回以保留用量。',flush=True)
 finally:
  while True:
   try:executor.shutdown(wait=True,cancel_futures=True);break
   except KeyboardInterrupt:
    state('interrupted_waiting_for_inflight',api_calls=attempts,recorded_attempts=len(records),uncertain_inflight=len(active),stop_reason=stop)
    print('已停止新请求，正在等已发送请求返回。当前记录已保存；强制结束进程会留下用量不确定的请求。',flush=True)
  for future,(idx,tries,seq) in active.items():
   if not future.cancelled():
    rec=future.result();records.append(rec);limiter.settle(seq,rec)
  key=None;active.clear()
  data=report(records,time.monotonic()-started,attempts,len(queue),limiter,stop)
  state('completed' if data['completed_unique_records']==LIMIT and not stop else 'stopped',api_calls=attempts,unique_records=data['completed_unique_records'],schema_valid=data['schema_valid'],usage=data['usage'],stop_reason=stop,elapsed_seconds=data['elapsed_seconds'])
 print('结果：'+str(REPORT));print('请回到本对话告知：修订样本测试跑完了。')

if __name__=='__main__':
 try:main()
 except KeyboardInterrupt:print('已取消；如已启动请先查看status.json，不要重跑。')
