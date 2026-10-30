#!/usr/bin/env python3
"""Package tracked edits and new source files without changing the real Git index."""
import hashlib, io, json, os, pathlib, subprocess, tarfile, tempfile
ROOT = pathlib.Path(__file__).resolve().parents[1]
os.chdir(ROOT)
def git(*args, env=None):
    return subprocess.check_output(['git', *args], env=env)
base = git('rev-parse', 'HEAD').decode().strip()
paths = sorted(set(git('diff', '--name-only', 'HEAD', '-z').decode().split('\0') +
                   git('ls-files', '--others', '--exclude-standard', '-z').decode().split('\0')) - {''})
paths = [p for p in paths if not p.startswith(('.vercel/', 'release-artifacts/', '.grok/preview.'))]
with tempfile.TemporaryDirectory() as temp:
    env = dict(os.environ, GIT_INDEX_FILE=f'{temp}/index')
    git('read-tree', base, env=env)
    git('add', '--', *paths, env=env)
    patch = git('diff', '--cached', '--binary', base, env=env)
    entries = []
    for name in paths:
        path = ROOT / name
        entries.append({'path': name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None})
    manifest = {'base_commit': base, 'patch_sha256': hashlib.sha256(patch).hexdigest(), 'files':entries}
    # Apply to a clean base in an isolated directory, checking every packaged file.
    clean = pathlib.Path(temp) / 'verify'
    clean.mkdir()
    with tarfile.open(fileobj=io.BytesIO(git('archive', base))) as archive:
        archive.extractall(clean, filter='data')
    subprocess.run(['git', 'apply', '--check', '-'], input=patch, cwd=clean, check=True)
    subprocess.run(['git', 'apply', '-'], input=patch, cwd=clean, check=True)
    for entry in entries:
        path = clean / entry['path']
        assert (hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None) == entry['sha256'], entry['path']
    out = ROOT / 'release-artifacts'
    out.mkdir(exist_ok=True)
    target = out / 'sleeper-valuation-candidate.tar.gz'
    with tarfile.open(target, 'w:gz') as archive:
        blobs = {'valuation.patch':patch, 'manifest.json':(json.dumps(manifest,indent=2)+'\n').encode(),
                 'README.txt':f'Reviewed source changes against {base}.\nApply valuation.patch to a clean checkout of that commit with git apply.\nThe source/ directory contains every added or modified source file.\nSee VALUATION-RELEASE-REVIEW.md for validation and limitations.\nThis is not a deployment or Grok handoff. Raw captures and build output are excluded.\n'.encode()}
        for name, data in blobs.items():
            item = tarfile.TarInfo(name); item.size = len(data)
            archive.addfile(item,io.BytesIO(data))
        for name in paths:
            if (ROOT/name).exists(): archive.add(ROOT/name,arcname=f'source/{name}')
    print(json.dumps({'archive':str(target),'base_commit':base,'changed_files':len(paths),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'bytes':target.stat().st_size,'clean_base_apply_verified':True},indent=2))
