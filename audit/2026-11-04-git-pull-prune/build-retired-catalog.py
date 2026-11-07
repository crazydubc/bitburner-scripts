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

# Use the index for the deployment inventory, so restorations/retirements can ship with their catalog.
current = set(git('ls-files').decode().splitlines())
patterns = ['*.js', '*.ts', '*.ns', '*.script']
removed = (set(git('log', 'HEAD', '--diff-filter=D', '--name-only', '--format=', '--', *patterns).decode().splitlines()) |
           set(git('diff', '--cached', '--no-renames', '--diff-filter=D', '--name-only', 'HEAD', '--', *patterns).decode().splitlines())) - current
removed = {name for name in removed if name and '.config.' not in name.lower() and
           not any(part.lower() in {'data', 'temp', 'audit', '.git', '.github'} for part in Path(name).parts)}
files = {name: set() for name in removed}
# Take blobs from their actual named tree entries, including merge parents. A simplified
# rev-list --objects walk can omit historical versions or report a shared blob only once.
retired = sorted(removed)
digests = {}
for revision in git('log', '--full-history', 'HEAD', '--format=%H', '--', *retired).decode().splitlines():
    for entry in git('ls-tree', '-r', '-z', revision, '--', *retired).split(b'\0'):
        if not entry:
            continue
        fields, path = entry.split(b'\t', 1)
        _, kind, oid = fields.decode().split()
        name = path.decode()
        if kind != 'blob' or name not in files:
            continue
        if oid not in digests:
            content = git('cat-file', 'blob', oid).decode('utf-8-sig')  # fetch Response.text strips a UTF-8 BOM.
            digests[oid] = hashlib.sha256(content.encode('utf-8')).hexdigest()
        files[name].add(digests[oid])
catalog = {'version': 1, 'source': 'crazydubc/bitburner-scripts',
           'generatedFrom': git('rev-parse', 'HEAD').decode().strip(),
           'files': {name: sorted(hashes) for name, hashes in sorted(files.items()) if hashes}}
(ROOT / 'git-pull-retired.json').write_text(json.dumps(catalog, indent=2) + '\n')
print(json.dumps({'retiredFiles': len(catalog['files']), 'knownVersions': sum(map(len, catalog['files'].values()))}))
