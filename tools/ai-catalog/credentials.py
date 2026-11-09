"""Read only the explicitly selected dotenv entry; never execute or export it."""
import pathlib,re,shlex

def load_subscription_key(path):
 text=pathlib.Path(path).expanduser().read_text()
 if len(text)>65536:raise ValueError('Credential file exceeds size limit')
 found=[]
 for line in text.splitlines():
  match=re.match(r'^\s*(?:export\s+)?MINIMAX_API_KEY\s*=\s*(.*)$',line)
  if not match:continue
  lexer=shlex.shlex(match.group(1),posix=True);lexer.whitespace_split=True;lexer.commenters='#'
  try:parts=list(lexer)
  except ValueError:raise ValueError('Invalid quoting for MINIMAX_API_KEY') from None
  if len(parts)!=1:raise ValueError('MINIMAX_API_KEY must have one literal value')
  found.append(parts[0])
 if len(found)!=1:raise ValueError('Expected exactly one MINIMAX_API_KEY assignment')
 key=found[0]
 if not key.startswith('sk-cp-') or len(key)<17 or any(c.isspace() for c in key):raise ValueError('Subscription key required; refusing PAYG or invalid key')
 return key
