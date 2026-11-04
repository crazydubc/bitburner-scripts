"""Build the one-time migration catalog from this branch's real Git history.
Future removals are normally handled by each game's download manifest.
"""
from pathlib import Path
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parents[2]

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)

current = set(git('ls-tree', '-r', '--name-only', 'HEAD').decode().splitlines())
removed = set(git('log', 'HEAD', '--diff-filter=D', '--name-only', '--format=', '--',
                  '*.js', '*.ts', '*.ns', '*.script').decode().splitlines()) - current
removed = {name for name in removed if name and '.config.' not in name.lower() and
           not any(part.lower() in {'data', 'temp', 'audit', '.git', '.github'} for part in Path(name).parts)}
files = {name: set() for name in removed}
objects = git('rev-list', '--objects', 'HEAD', '--', *sorted(removed)).decode().splitlines()
for entry in objects:
    oid, _, name = entry.partition(' ')
    if name not in files:
        continue
    if git('cat-file', '-t', oid).strip() != b'blob':
        continue
    content = git('cat-file', 'blob', oid).decode('utf-8-sig')  # fetch Response.text strips a UTF-8 BOM.
    files[name].add(hashlib.sha256(content.encode('utf-8')).hexdigest())
catalog = {'version': 1, 'source': 'crazydubc/bitburner-scripts',
           'generatedFrom': git('rev-parse', 'HEAD').decode().strip(),
           'files': {name: sorted(hashes) for name, hashes in sorted(files.items()) if hashes}}
(ROOT / 'git-pull-retired.json').write_text(json.dumps(catalog, indent=2) + '\n')
print(json.dumps({'retiredFiles': len(catalog['files']), 'knownVersions': sum(map(len, catalog['files'].values()))}))
