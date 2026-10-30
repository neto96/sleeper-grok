"""Read-only, manually invoked private study. Raw responses stay git-ignored."""
import argparse
import concurrent.futures
import datetime
import json
from pathlib import Path
import urllib.request
from archive import archive_capture

parser = argparse.ArgumentParser()
parser.add_argument('--league', required=True)
parser.add_argument('--season', required=True, type=int)
parser.add_argument('--from-week', required=True, type=int)
parser.add_argument('--through-week', required=True, type=int)
args = parser.parse_args()
if not 1 <= args.from_week <= args.through_week <= 18:
    parser.error('Invalid week range')
root = Path(__file__).resolve().parents[2] / 'test-results' / 'projections'
root.mkdir(parents=True, exist_ok=True)
base = 'https://api.sleeper.app'
urls = {'league': f'{base}/v1/league/{args.league}',
        'schedule': f'{base}/schedule/nfl/regular/{args.season}',
        'rosters': f'{base}/v1/league/{args.league}/rosters',
        'players': f'{base}/v1/players/nfl'}
query = '?season_type=regular&position%5B%5D=QB&position%5B%5D=RB&position%5B%5D=WR&position%5B%5D=TE'
for week in range(args.from_week, args.through_week + 1):
    urls[f'week{week}'] = f'{base}/projections/nfl/{args.season}/{week}{query}'

def collect(item):
    name, url = item
    with urllib.request.urlopen(url, timeout=40) as response:
        data = json.load(response)
    return name, {'url': url, 'fetchedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'data': data}

# Write only a complete new collection; failed requests cannot mix old/new runs.
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
    result = dict(executor.map(collect, urls.items()))
if str(result['league']['data']['season']) != str(args.season):
    raise ValueError('League season does not match requested season')
result['window'] = {'season': str(args.season), 'fromWeek': args.from_week, 'throughWeek': args.through_week}
target = root / 'capture.json'
# Preserve the existing evidence before replacing the working view.
if target.exists():
    archive_capture(root, json.loads(target.read_text()))
digest = archive_capture(root, result)
temporary = root / 'capture.tmp'
temporary.write_text(json.dumps(result))
temporary.replace(target)
print(f'Captured {len(urls)} read-only responses; window {args.from_week}–{args.through_week}.')
print(f'Archived evidence SHA-256: {digest}')
