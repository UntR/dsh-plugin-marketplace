"""Pinned public GitHub README acquisition. Repository text is never executed."""
import base64,hashlib,json,pathlib,re,time,urllib.error,urllib.request
from schema import canonical
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):raise ValueError('Redirect blocked')

def read_readme(entry,detail,cache,token=None):
 sha=detail['github']['headSha'];slug=entry['slug']
 if not isinstance(sha,str) or not re.fullmatch('[0-9a-f]{40}',sha):raise ValueError('Pinned head SHA required')
 if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',slug):raise ValueError('Invalid GitHub slug')
 cache=pathlib.Path(cache);cache.mkdir(parents=True,exist_ok=True)
 pointer=cache/(hashlib.sha256((entry['id']+sha).encode()).hexdigest()+'.json')
 if pointer.exists():
  source=json.loads(pointer.read_text());raw=(cache/(source['rawHash']+'.txt')).read_text()
  if hashlib.sha256(raw.encode()).hexdigest()!=source['rawHash']:raise ValueError('Source cache checksum mismatch')
  return raw,source
 url=f'https://api.github.com/repos/{slug}/readme?ref={sha}'
 headers={'User-Agent':'DSH-AI-Catalog/1','Accept':'application/vnd.github+json'}
 if token:headers['Authorization']='Bearer '+token
 request=urllib.request.Request(url,headers=headers)
 for attempt in range(3):
  try:
   with urllib.request.build_opener(NoRedirect()).open(request,timeout=40) as response:
    body=response.read(3_000_001)
   if len(body)>3_000_000:raise ValueError('README exceeds source limit')
   value=json.loads(body)
   if value.get('encoding')!='base64':raise ValueError('Unsupported content encoding')
   raw=base64.b64decode(value['content'],validate=False).decode('utf-8',errors='replace');path=value['path']
   if len(raw.encode())>2_000_000:raise ValueError('README exceeds source limit')
   break
  except urllib.error.HTTPError as error:
   if error.code==404:raw='';path=None;break
   if error.code not in (429,500,502,503,504) or attempt==2:raise
   delay=max(2**attempt,float(error.headers.get('Retry-After','0')))
   if delay>60:raise ValueError('GitHub cooldown exceeds one minute; resume later') from None
   time.sleep(delay)
 h=hashlib.sha256(raw.encode()).hexdigest();(cache/(h+'.txt')).write_text(raw)
 source={'headSha':sha,'path':path,'rawHash':h}
 pointer.write_text(canonical(source))
 return raw,source
