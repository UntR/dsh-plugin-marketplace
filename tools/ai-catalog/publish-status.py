"""Write small public coverage metadata alongside the stable Client URL."""
import json,pathlib,datetime,collections
root=pathlib.Path('publish');catalog=json.loads((root/'registry/v1/index.json').read_text());native=json.loads((root/'native/format1/index.json').read_text());report=json.loads((root/'native/format1/report.json').read_text())
status={'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'catalogPlugins':len(catalog['plugins']),'aiSummaries':sum(bool(e.get('ai')) for e in catalog['plugins']),'nativePlugins':len(native['plugins']),'nativeExcluded':dict(collections.Counter(e['reason'] for e in report['excluded'])),'clientSource':'https://untr.github.io/dsh-plugin-marketplace/market-index.json','completeCatalog':'https://untr.github.io/dsh-plugin-marketplace/catalog.json','aiNotice':'Automatically generated from public repository information; installation is not tested.'}
(root/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':'))+'\n')
(root/'market-index.json').write_text(json.dumps(native,ensure_ascii=False,separators=(',',':'))+'\n')
(root/'status.json').write_text(json.dumps(status,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in status.items() if k!='nativeExcluded'},ensure_ascii=False))
