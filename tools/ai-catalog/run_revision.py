"""Run a prepared, finite revision using hidden interactive credentials."""
import json,pathlib,sys
import minimax_validate as runner

if __name__=='__main__':
 if len(sys.argv) not in (2,3) or (len(sys.argv)==3 and sys.argv[2]!='--dry-run'):
  raise SystemExit('Usage: python3 run_revision.py PREPARED_DIRECTORY [--dry-run]')
 root=pathlib.Path(sys.argv[1]).resolve()
 runner.ROOT=root
 for name,file in [('STATUS','status.json'),('RESULTS','results.json'),('REPORT','report.md'),('LOCK','run-started.json')]:setattr(runner,name,root/file)
 runner.LIMIT=len(json.loads((root/'samples.json').read_text())['samples'])
 if not 0<runner.LIMIT<=100:raise SystemExit('Expected 1–100 targeted records')
 runner.MAX_ATTEMPTS=runner.LIMIT+min(20,runner.LIMIT*2)
 sys.argv=[sys.argv[0]]+sys.argv[2:]
 runner.main()
