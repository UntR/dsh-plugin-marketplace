"""Inspect exact npm tarballs without extracting or executing package content."""
import argparse,base64,hashlib,io,json,pathlib,re,tarfile,time,urllib.parse,urllib.request
from source import NoRedirect
from review import atomic_json

def get(url,limit):
 parsed=urllib.parse.urlparse(url)
 if parsed.scheme!='https' or parsed.hostname!='registry.npmjs.org' or parsed.username or parsed.password:raise ValueError('Only public npm registry HTTPS is allowed')
 with urllib.request.build_opener(NoRedirect()).open(urllib.request.Request(url,headers={'User-Agent':'DSH-Native-Metadata-Verifier/1'}),timeout=40) as response:data=response.read(limit+1)
 if len(data)>limit:raise ValueError('Metadata or archive exceeds limit')
 return data

def inspect_archive(data,name,version):
 with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as archive:
  size=0
  for count,member in enumerate(archive,1):
   size+=max(0,member.size)
   if count>5000 or size>100_000_000:raise ValueError('Archive expansion exceeds inspection limit')
  manifest_member=archive.getmember('package/package.json')
  if not manifest_member.isfile() or manifest_member.size>1_000_000:raise ValueError('Invalid package manifest')
  manifest=json.loads(archive.extractfile(manifest_member).read())
  if manifest.get('name')!=name or manifest.get('version')!=version:raise ValueError('Tarball identity mismatch')
  if any(manifest.get('scripts',{}).get(k) for k in ('preinstall','install','postinstall','prepare')):raise ValueError('Lifecycle scripts need separate review')
  dsh=manifest.get('dsh',{});bundle=dsh.get('bundle') if isinstance(dsh,dict) else None
  patch=bundle.get('patch') if isinstance(bundle,dict) else None
  if not isinstance(patch,str) or not patch.strip():raise ValueError('No declared bundle patch')
  normalized=patch.removeprefix('./')
  if normalized.startswith('/') or '..' in normalized.split('/') or '\\' in normalized:raise ValueError('Patch path escapes package')
  member=archive.getmember('package/'+normalized)
  if not member.isfile() or member.size>1_000_000:raise ValueError('Bundle patch is not an archive file')
  patch_bytes=archive.extractfile(member).read()
  if not isinstance(manifest.get('engines',{}).get('dsh'),str):raise ValueError('engines.dsh required')
  return manifest,hashlib.sha256(patch_bytes).hexdigest()

def verify(entry,version):
 name=entry['install']['packageName']
 if not isinstance(name,str) or not isinstance(version,str):raise ValueError('Exact npm package and version required')
 packument=json.loads(get('https://registry.npmjs.org/'+urllib.parse.quote(name,safe=''),20_000_000))
 release=packument['versions'][version];dist=release['dist'];data=get(dist['tarball'],20_000_000)
 integrity=dist.get('integrity','');expected='sha512-'+base64.b64encode(hashlib.sha512(data).digest()).decode()
 if integrity!=expected:raise ValueError('Exact SHA512 integrity required')
 manifest,patch_hash=inspect_archive(data,name,version)
 repo=manifest.get('repository');repo=repo.get('url') if isinstance(repo,dict) else repo
 if not isinstance(repo,str):raise ValueError('Published repository identity required')
 normalized=repo.removeprefix('git+').removesuffix('.git').rstrip('/')
 if normalized.lower()!=entry['repositoryUrl'].lower():raise ValueError('Published repository differs from directory identity')
 return {'schemaVersion':1,'id':entry['id'],'source':{'type':'npm'},'version':version,'manifest':manifest,'publishTime':packument['time'][version],'integrity':integrity,'archiveSha256':hashlib.sha256(data).hexdigest(),'patchSha256':patch_hash,'verifiedAt':time.time(),'verificationLevel':'metadata-verified','distTags':{k:v for k,v in packument.get('dist-tags',{}).items() if v==version}}


def github_get(url,limit=2_000_000):
 import os
 parsed=urllib.parse.urlparse(url)
 if parsed.scheme!='https' or parsed.hostname not in ('api.github.com','raw.githubusercontent.com'):raise ValueError('Unexpected Git source')
 headers={'User-Agent':'DSH-Native-Verifier/1'}
 if parsed.hostname=='api.github.com' and os.environ.get('GH_TOKEN'):headers['Authorization']='Bearer '+os.environ['GH_TOKEN']
 with urllib.request.build_opener(NoRedirect()).open(urllib.request.Request(url,headers=headers),timeout=30) as response:data=response.read(limit+1)
 if len(data)>limit:raise ValueError('Git metadata exceeds size limit')
 return data

def verify_git(entry,detail):
 sha=detail['github']['headSha'];slug=entry['slug']
 if not re.fullmatch(r'[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+',slug) or not re.fullmatch('[0-9a-f]{40}',sha or ''):raise ValueError('Pinned public GitHub source required')
 base=f'https://raw.githubusercontent.com/{slug}/{sha}/'
 manifest_bytes=github_get(base+'package.json');manifest=json.loads(manifest_bytes)
 if manifest.get('name')!=entry['install']['packageName'] or manifest.get('version')!=entry['install']['version']:raise ValueError('Git manifest identity mismatch')
 if any(manifest.get('scripts',{}).get(k) for k in ('prepare','preinstall','install','postinstall')):raise ValueError('Lifecycle scripts need separate approval')
 bundle=manifest.get('dsh',{}).get('bundle',{});patch=bundle.get('patch') if isinstance(bundle,dict) else None
 def file(path):
  if not isinstance(path,str):raise ValueError('Ready package file required')
  path=path.removeprefix('./')
  if not path or path.startswith('/') or '..' in path.split('/') or '\\' in path:raise ValueError('Invalid package file path')
  return github_get(base+urllib.parse.quote(path,safe='/'))
 patch_bytes=file(patch)
 main=manifest.get('main');exports=manifest.get('exports')
 if not main:
  main=exports if isinstance(exports,str) else exports.get('.') if isinstance(exports,dict) else None
  if isinstance(main,dict):main=next((main[k] for k in ('default','import','require') if isinstance(main.get(k),str)),None)
 file(main)
 if not isinstance(manifest.get('engines',{}).get('dsh'),str):raise ValueError('Declared engines.dsh required')
 commit=json.loads(github_get(f'https://api.github.com/repos/{slug}/commits/{sha}'))
 if commit.get('sha')!=sha:raise ValueError('Commit identity mismatch')
 return {'schemaVersion':1,'id':entry['id'],'source':{'type':'git','url':entry['repositoryUrl'],'commit':sha},'version':manifest['version'],'manifest':manifest,'publishTime':commit['commit']['committer']['date'],'archiveSha256':hashlib.sha256(manifest_bytes).hexdigest(),'patchSha256':hashlib.sha256(patch_bytes).hexdigest(),'verifiedAt':time.time(),'verificationLevel':'metadata-verified','distTags':{'latest':manifest['version']}}

def main():
 import concurrent.futures
 p=argparse.ArgumentParser();p.add_argument('registry',type=pathlib.Path);p.add_argument('output',type=pathlib.Path);p.add_argument('--limit',type=int,default=100);a=p.parse_args();work=[]
 if not 1<=a.limit<=500:raise ValueError('Native verification batch must be1–500')
 for e in sorted(json.loads((a.registry/'index.json').read_text())['plugins'],key=lambda e:(-e['stats']['stars'],e['id'])):
  if len(work)>=a.limit:break
  if not e['install']['available'] or e['install']['requiresBuildApproval']:continue
  detail=json.loads((a.registry/e['detailPath']).read_text());target=a.output/(e['id'][3:]+'.json');failed=a.output/'excluded'/(e['id'][3:]+'.json')
  identity={'version':e['install']['version'],'headSha':detail['github']['headSha'],'metadata':hashlib.sha256(json.dumps(detail['install'],sort_keys=True).encode()).hexdigest()}
  if target.exists():
   previous=json.loads(target.read_text())
   if time.time()-previous['verifiedAt']<6*86400 and previous['version']==e['install']['version'] and (previous['source']['type']=='npm' or previous['source'].get('commit')==detail['github']['headSha']):continue
  if failed.exists():
   previous=json.loads(failed.read_text())
   if previous.get('identity')==identity and time.time()-previous['checkedAt']<86400:continue
  work.append((e,detail,target,failed,identity))
 def inspect(item):
  e,detail,target,failed,identity=item
  try:
   proof=verify(e,e['install']['version']) if detail['install']['preferred']=='npm' else verify_git(e,detail)
   atomic_json(target,proof)
   if failed.exists():failed.unlink()
   return None
  except Exception as error:
   reason=type(error).__name__+': '+str(error)[:160]
   atomic_json(failed,{'id':e['id'],'identity':identity,'checkedAt':time.time(),'reason':reason})
   return {'id':e['id'],'reason':reason}
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:results=list(executor.map(inspect,work))
 diagnostics=[r for r in results if r is not None]
 atomic_json(a.output/'verification-report.json',{'attempted':len(work),'accepted':len(work)-len(diagnostics),'excluded':diagnostics})
 print(json.dumps({'attempted':len(work),'accepted':len(work)-len(diagnostics),'excluded':len(diagnostics)}))

if __name__=='__main__':main()
