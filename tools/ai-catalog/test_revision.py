import importlib.util,json,pathlib,re,unittest
from clean_readme import clean_readme,excerpt
from schema_v2 import compatibility_note,validate
from minimax_validate import payload_for,MAX_INPUT_BYTES

class Regression(unittest.TestCase):
 def test_comparisons_and_placeholders(self):
  for token in ['<0.3.0','retryDelta <= 0','<your-token>','<API_KEY>']:
   raw=f'# Readme\n{token}\nCritical requirement stays.\n<div>after</div>'
   cleaned=clean_readme(raw)
   self.assertIn(token,cleaned);self.assertIn('Critical requirement stays.',cleaned);self.assertIn('after',cleaned)
 def test_code_and_markup(self):
  cleaned=clean_readme('# Demo\n`<div>` `<0.3.0`\n<div>feature</div>\n<script>malicious()</script><svg>noise</svg>\n![badge](https://shields.io/x)')
  for value in ['`<div>`','`<0.3.0`','feature']:self.assertIn(value,cleaned)
  for value in ['malicious','noise','shields.io']:self.assertNotIn(value,cleaned)
 def test_boundaries(self):
  row={'input':{'id':'gh:1','readme_text':'功能及限制\n'*5000,'install_available':False},'existing_category':'other'}
  p=payload_for(row)
  self.assertLessEqual(sum(len(m['content'].encode()) for m in p['messages']),MAX_INPUT_BYTES)
  self.assertEqual(json.loads(p['messages'][1]['content'])['compatibility_note_template'],compatibility_note(False))
 def test_schema(self):
  obj={'id':'gh:1','summary_zh':'用于测试格式校验的中文摘要，说明插件具体功能。','category':'other','tags':['测试','插件'],'confidence':0.5,'evidence':['资料事实'],'insufficient_evidence':False,'compatibility_note':compatibility_note(True)}
  self.assertEqual(validate(obj,'gh:1',True),[])
  obj['summary_zh']='长'*141;obj['evidence']=['事实']*4;obj['compatibility_note']='仓库未实际验证'
  self.assertEqual(set(validate(obj,'gh:1',True)),{'summary_length','evidence','compatibility_note_template'})
  for invalid in [None,[],True,{'category':[]}]:self.assertTrue(validate(invalid,'gh:1',False))
 def test_excerpt_budget(self):
  for budget in [160,500,7200]:self.assertLessEqual(len(excerpt('# 功能\n介绍\n'*4000,budget).encode()),budget)

if __name__=='__main__':unittest.main()
