"""Run bounded regression suites; pass the engine, optional UI fixture directory and optional report path.
python audit/2026-11-04-full-audit/run-checks.py ../bitburner-engine /tmp/bitburner-terminal-ui-check audit/2026-11-07-sleeve-recovery/validation.json
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
ENGINE = str(Path(sys.argv[1]).resolve())
UI = str(Path(sys.argv[2]).resolve()) if len(sys.argv) > 2 and sys.argv[2] != '-' else None
# Support modules and optional stochastic tournaments are not standalone regression gates.
EXCLUDE = {'ram-impact', 'go-benchmark', 'go-bot-loader', 'go-engine', 'go-tactics-model', 'stock-market-fixture'}
checks = sorted((ROOT / 'audit').glob('*/checks/*.mjs'))
logs = Path(tempfile.mkdtemp(prefix='bitburner-full-audit-'))

def run(path):
    if path.stem in {'bn1-ui', 'scan-ui'} and not UI:
        return {'suite': path.stem, 'status': 'skipped', 'reason': 'React/MUI fixture directory not supplied'}
    args = ['node', '--expose-internals', str(path), ENGINE]
    if path.stem in {'bn1-ui', 'scan-ui'}:
        args.append(UI)
    started = time.monotonic()
    try:
        result = subprocess.run(args, cwd=ROOT, text=True, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, timeout=180)
        code, output = result.returncode, result.stdout
    except subprocess.TimeoutExpired:
        code, output = 124, '180-second timeout'
    (logs / (path.stem + '.log')).write_text(output)
    return {'suite': path.stem, 'status': 'passed' if code == 0 else 'failed', 'exit': code,
            'seconds': round(time.monotonic() - started, 2)}

with ThreadPoolExecutor(max_workers=4) as pool:
    results = list(pool.map(run, [path for path in checks if path.stem not in EXCLUDE]))
report = {'engine': subprocess.check_output(['git', '-C', ENGINE, 'rev-parse', 'HEAD'], text=True).strip(),
          'node': subprocess.check_output(['node', '--version'], text=True).strip(), 'suites': results}
report_path = Path(sys.argv[3]) if len(sys.argv) > 3 else Path(__file__).parent / 'validation.json'
report_path.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'count': len(results), 'failed': [r for r in results if r['status'] == 'failed'],
                  'skipped': [r for r in results if r['status'] == 'skipped'], 'logs': str(logs)}))
sys.exit(any(r['status'] == 'failed' for r in results))
