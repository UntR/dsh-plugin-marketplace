"""Deterministic local text preparation; no execution of repository content."""
import html,re
from html.parser import HTMLParser

CLEANER_VERSION = "3"

# Only known HTML tags are markup. Version comparisons and placeholders are text.
HTML_TAGS = set("a abbr address article aside b blockquote body br caption center code col colgroup dd del details div dl dt em figcaption figure footer h1 h2 h3 h4 h5 h6 head header hr html i img input kbd label li link main mark meta nav ol p picture pre s samp section small source span strike strong sub summary sup table tbody td th thead time title tr u ul var video wbr iframe".split())

class ReadmeHTML(HTMLParser):
 def __init__(self):
  super().__init__(convert_charrefs=False);self.parts=[];self.hidden=[]
 def handle_starttag(self,tag,attrs):
  if self.hidden:
   if tag in {"svg","script","style"}:self.hidden.append(tag)
   return
  if tag in {"svg","script","style"}:self.hidden.append(tag)
  elif tag not in HTML_TAGS:self.parts.append(self.get_starttag_text())
  elif tag == "br":self.parts.append("\n")
 def handle_startendtag(self,tag,attrs):
  if not self.hidden and tag not in HTML_TAGS | {"svg","script","style"}:self.parts.append(self.get_starttag_text())
 def handle_endtag(self,tag):
  if self.hidden:
   if tag==self.hidden[-1]:self.hidden.pop()
  elif tag not in HTML_TAGS:self.parts.append("</"+tag+">")
 def handle_data(self,data):
  if not self.hidden:self.parts.append(data)
 def handle_entityref(self,name):self.handle_data("&"+name+";")
 def handle_charref(self,name):self.handle_data("&#"+name+";")

def strip_html(text):
 parser=ReadmeHTML();parser.feed(text);parser.close();return "".join(parser.parts)


NOISE_HEADINGS=re.compile(r'^(?:sponsors?|sponsorship|sponsor us|support us|contributors?|acknowledg(?:e)?ments?|star history|stars?|badges?|table of contents|toc|赞助(?:商|鸣谢)?|赞助支持|致谢|贡献者|目录|社交媒体)\s*[:：]?$',re.I)
PRIORITY=re.compile(r'overview|features?|capabilit|what|why|how it works|architecture|requirements?|limitations?|caveats?|compatib|security|privacy|prerequisites?|概览|介绍|简介|功能|能力|用途|特性|前置|要求|限制|兼容|注意|架构|安全|隐私|风险|依赖',re.I)

def clean_readme(text):
 text=text.replace('\r\n','\n').replace('\r','\n')
 text=re.sub(r'<!--[\s\S]*?-->','',text)
 text=re.sub(r'```[^\n]*\n[\s\S]*?```','\n[代码示例省略，未执行]\n',text)
 text=re.sub(r'~~~[^\n]*\n[\s\S]*?~~~','\n[代码示例省略，未执行]\n',text)
 # Protect inline code before HTML parsing, including literal HTML examples.
 literals=[]
 def protect(match):
  literals.append(match.group(0));return '\x00INLINE'+str(len(literals)-1)+'\x00'
 text=re.sub(r'(`+)([^`\n]*?)\1',protect,text)
 text=re.sub(r'!\[[^\]]*\]\([^\n]*?\)','',text)
 text=re.sub(r'!\[[^\]]*\]\[[^\]]*\]','',text)
 text=re.sub(r'<(?:img|source|video|iframe)\b[^>]*>','',text,flags=re.I)
 text=re.sub(r'data:[^\s"<>)]{20,}','[嵌入媒体省略]',text,flags=re.I)
 text=re.sub(r'<br\s*/?>','\n',text,flags=re.I)
 text=strip_html(text)
 text=re.sub(r'\x00INLINE(\d+)\x00',lambda m:literals[int(m.group(1))],text)
 text=re.sub(r'\[([^\]\n]+)\]\([^\n)]*\)',r'\1',text)
 text=re.sub(r'^\s*\[[^\]]+\]:\s*\S+.*$','',text,flags=re.M)
 text=html.unescape(text)
 out=[];skip_level=None
 for raw in text.splitlines():
  line=raw.strip();m=re.match(r'^(#{1,6})\s+(.+)$',line)
  if m:
   level=len(m.group(1));title=re.sub(r'[*_`#]','',m.group(2)).strip()
   if skip_level is not None and level<=skip_level:skip_level=None
   normalized=re.sub(r'^[^\w\u4e00-\u9fff]+','',title).strip()
   if NOISE_HEADINGS.fullmatch(normalized):skip_level=level;continue
  if skip_level is not None:continue
  if re.fullmatch(r'\[\]\([^)]*\)',line):continue
  if re.search(r'shields\.io|img\.shields|badge\.fury|star-history\.com|badgen\.net',line,re.I):continue
  if re.fullmatch(r'[\s|·•*_-]*',line):
   if out and out[-1]!='':out.append('')
   continue
  # Obvious all-anchor navigation lines only. Preserve feature bullets and tables.
  if len(line)>1200:line=line[:1200]+' [长行截断]'
  if line and (not out or line!=out[-1]):out.append(line)
 return '\n'.join(out).strip()

CAUTIONS=re.compile(r'requirements?|limitations?|caveats?|compatib|prerequisites?|privacy|security|前置|要求|限制|兼容|注意|隐私|风险|依赖',re.I)

def excerpt(text,max_bytes=7200):
 """Prioritize overview and qualifiers, visibly mark all local cuts."""
 if len(text.encode())<=max_bytes:return text
 sections=[];cur=[]
 for line in text.splitlines():
  if line.startswith('#') and cur:sections.append('\n'.join(cur));cur=[]
  cur.append(line)
 if cur:sections.append('\n'.join(cur))
 selected=[];budget=max_bytes;marker='[该节后续省略]'
 def rank(pair):
  i,sec=pair;heading=sec.splitlines()[0]
  return (0 if i==0 else 1 if CAUTIONS.search(heading) else 2 if PRIORITY.search(heading) else 3,i)
 for i,sec in sorted(enumerate(sections),key=rank):
  if budget<160:break
  heading=sec.splitlines()[0]
  cap=min(budget,2200 if len(sections)>2 else budget)
  if i==0 and len(sections)>2:cap=min(cap,1800)
  lines=[];size=0;was_cut=False;lines_all=sec.splitlines()
  for j,ln in enumerate(lines_all):
   cost=len((ln+'\n').encode())
   remaining_marker=len((marker+'\n').encode()) if j<len(lines_all)-1 else 0
   if size+cost+remaining_marker>cap:was_cut=True;break
   lines.append(ln);size+=cost
  if was_cut and lines:lines.append(marker)
  value='\n'.join(lines).strip()
  if value and len((value+'\n\n').encode())<=budget:
   selected.append((i,value));budget-=len((value+'\n\n').encode())
 return '\n\n'.join(s for _,s in sorted(selected))
