// Fail closed at the private saved-data boundary. This is not a provider adapter.
/** @returns {{week: number, points: Record<string, number|null>}[]} */
export function preparePreviewWeeks(data, now = Date.now()) {
  const fetched = Date.parse(data?.summary?.capturedAt);
  const window = data?.summary?.window;
  if (!Number.isFinite(fetched) || fetched > now + 300000 || now - fetched > 7*86400000 ||
    !data?.tradeInput?.teams?.length || !Array.isArray(data.results) ||
    !Number.isInteger(window?.fromWeek) || !Number.isInteger(window?.throughWeek) ||
    window.fromWeek < 1 || window.throughWeek > 18 || window.fromWeek > window.throughWeek ||
    String(data.tradeInput.season) !== String(window.season)) throw new Error('Missing, invalid or stale trade study.');
  const ids = data.results.map(p => p.playerId);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate player forecasts.');
  const prepared = [];
  for (let week = window.fromWeek; week <= window.throughWeek; week++) {
    const points = {};
    for (const player of data.results) {
      if (!Array.isArray(player.weeks)) throw new Error('Invalid weekly forecasts.');
      const matches = player.weeks.filter(r => r.week === week);
      if (matches.length > 1) throw new Error('Duplicate weekly forecasts.');
      const row = matches[0];
      if (row?.status === 'covered' && Number.isFinite(row.points) && Number.isFinite(row.updatedAt) &&
        row.updatedAt <= now + 300000 && now - row.updatedAt <= 7*86400000) points[player.playerId] = row.points;
      else if (row?.status === 'bye' && data.summary.scheduleValidated === true) points[player.playerId] = null;
    }
    prepared.push({week, points});
  }
  return prepared;
}
