"""Content-addressed local evidence. Never overwrite an earlier capture."""
import hashlib
import json
from pathlib import Path


def archive_capture(root, capture):
    payload = json.dumps(capture, sort_keys=True, separators=(',', ':')).encode()
    digest = hashlib.sha256(payload).hexdigest()
    directory = Path(root) / 'archive'
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / (digest + '.json')
    try:
        with target.open('xb') as handle:
            handle.write(payload)
    except FileExistsError:
        if target.read_bytes() != payload:
            raise ValueError('Archive integrity mismatch')
    return digest


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[2] / 'test-results' / 'projections'
    print(archive_capture(root, json.loads((root / 'capture.json').read_text())))
