"""Rebuild frozen smoke inputs offline; never modify original audit artifacts."""
import argparse, hashlib, json, pathlib, re
from clean_readme import clean_readme, excerpt, CLEANER_VERSION
from schema_v2 import PROMPT_VERSION, SCHEMA_VERSION, validate
from minimax_validate import payload_for, atomic_json

CONTENT_REVIEW = {
 'DSH-Raising-Plan/dsh-context-budget', 'xby-skill/xby-classify',
 'linxichen/dsh-rigorquant', 'derek2035/dsh-social',
 'gongfpp/dsh-thanks-carl', 'AndyYJF/dsh-lan-web-auth', 'CREAIT-nl/dsh-plugins',
 # Additional caveats called out by the audit.
 'huashu/huashu-design', 'DSH-Raising-Plan/dsh-im',
}

def prepare(source, destination):
 source=source.resolve();destination=destination.resolve()
 if destination.exists():raise ValueError('Use a new output directory; evidence is immutable')
 original=json.loads((source/'samples.json').read_text())
 results=json.loads((source/'results.json').read_text())
 old={r['id']:r for r in results['records'] if not r.get('rate_limited')}
 rows=[];queue=[];diffs=[]
 for original_row in original['samples']:
  row=json.loads(json.dumps(original_row));item=row['input'];ident=item['id'].removeprefix('gh:')
  raw=(source/'sources'/f'{ident}-README.txt').read_text()
  previous=(source/'sources'/f'{ident}-cleaned.txt').read_text()
  cleaned=clean_readme(raw);item['readme_text']=excerpt(cleaned)
  item['readme_excerpt_truncated']=item['readme_text']!=cleaned or row.get('readme_download_truncated',False)
  row['readme_clean_chars']=len(cleaned);row['readme_input_bytes']=len(item['readme_text'].encode())
  row['readme_raw_sha256']=hashlib.sha256(raw.encode()).hexdigest()
  row['versions']={'cleaner':CLEANER_VERSION,'prompt':PROMPT_VERSION,'schema':SCHEMA_VERSION}
  row['cache_key']=hashlib.sha256(json.dumps({'id':item['id'],'head_sha':row['head_sha'],'input':item,'versions':row['versions']},sort_keys=True,ensure_ascii=False).encode()).hexdigest()
  rows.append(row);reasons=[]
  record=old.get(item['id'],{});errors=validate(record.get('output'),item['id'])
  if errors:reasons.append('prior_structure_failure:'+','.join(errors))
  if item['slug'] in CONTENT_REVIEW or item['name'] in {'dsh-im','huashu-design'}:reasons.append('audit_content_review')
  # Old broad regex matched a non-HTML less-than expression: protect against input loss.
  lossy=[]
  for match in re.finditer(r'<[^>]+>',raw):
   fragment=match.group(0)
   if re.match(r'<(?:\d|=)',fragment):lossy.append(fragment[:100])
  if lossy:reasons.append('comparison_input_loss')
  if item['readme_text']!=original_row['input']['readme_text']:
   diffs.append({'id':item['id'],'slug':item['slug'],'old_chars':len(previous),'new_chars':len(cleaned),'old_input_bytes':original_row['readme_input_bytes'],'new_input_bytes':row['readme_input_bytes'],'comparison_fragments':lossy})
   reasons.append('cleaned_request_changed')
  if reasons:queue.append({'id':item['id'],'slug':item['slug'],'reasons':reasons,'cache_key':row['cache_key']})
 destination.mkdir(parents=True)
 manifest={**{k:v for k,v in original.items() if k!='samples'},'source_manifest_sha256':hashlib.sha256((source/'samples.json').read_bytes()).hexdigest(),'versions':{'cleaner':CLEANER_VERSION,'prompt':PROMPT_VERSION,'schema':SCHEMA_VERSION},'samples':rows}
 atomic_json(destination/'all-samples.json',manifest)
 queued={q['id'] for q in queue};manifest['samples']=[r for r in rows if r['input']['id'] in queued]
 atomic_json(destination/'samples.json',manifest)
 (destination/'manifest-sha256.txt').write_text(hashlib.sha256((destination/'samples.json').read_bytes()).hexdigest()+'\n')
 atomic_json(destination/'review-queue.json',queue);atomic_json(destination/'cleaning-diff.json',diffs)
 atomic_json(destination/'requests-preview.json',[payload_for(r) for r in manifest['samples']])
 print(json.dumps({'model_calls':0,'rebuilt':len(rows),'targeted_retest':len(queue),'changed_inputs':len(diffs),'output':str(destination)},ensure_ascii=False))

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('source',type=pathlib.Path);parser.add_argument('destination',type=pathlib.Path)
 args=parser.parse_args();prepare(args.source,args.destination)
