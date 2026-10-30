import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startPreview } from './server.mjs';

const server = await startPreview();
const url = `http://127.0.0.1:${server.httpServer.address().port}`;
const saved = JSON.parse(await readFile(new URL('../../test-results/projections/comparison.json', import.meta.url), 'utf8'));
const errors = [];
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
  for (const [name, viewport] of [['desktop', { width: 1280, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/*', route => new URL(route.request().url()).origin === url ? route.continue() : route.abort());
    await page.goto(`${url}/?projection-study`);
    await page.getByTestId('comparison').waitFor();
    assert.match(await page.getByTestId('comparison').innerText(), /Puka Nacua minus A.J. Brown/);
    await page.getByLabel('Player A', { exact: true }).selectOption(saved.results.find(x => x.name === 'Michael Wilson').playerId);
    await page.getByLabel('Player B', { exact: true }).selectOption(saved.results.find(x => x.name === 'Rome Odunze').playerId);
    assert.match(await page.getByTestId('comparison').innerText(), /Michael Wilson minus Rome Odunze/);
    assert.ok(await page.getByText('Excluded scoring:', { exact: false }).isVisible());
    assert.ok(await page.getByText('Byes checked', { exact: false }).isVisible());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await mkdir('/workspace/screenshots/sleeper-projections', { recursive: true });
    await page.screenshot({ path: `/workspace/screenshots/sleeper-projections/${name}.png`, fullPage: true });
    await page.getByLabel('Player B', { exact: true }).selectOption(saved.results.find(x => x.name === 'Josh Allen').playerId);
    assert.equal(await page.getByTestId('comparison').count(), 0);
    await page.getByLabel('Player B', { exact: true }).selectOption(saved.results.find(x => x.name === 'Michael Wilson').playerId);
    assert.equal(await page.getByTestId('comparison').count(), 0);
    await page.close();
    console.log(`PASS ${name}: saved data, selections, same-position guard, same-player guard, caveats and layout`);
  }
  const stale = await browser.newPage();
  await stale.route('**/__projection-study', route => route.fulfill({ json: {
    ...saved, summary: { ...saved.summary, capturedAt: '2020-01-01T00:00:00Z' } } }));
  await stale.goto(`${url}/?projection-study`);
  await stale.getByRole('alert').waitFor();
  assert.equal(await stale.getByTestId('comparison').count(), 0);
  await stale.close();
  console.log('PASS stale capture disables comparison');
  const empty = await browser.newPage();
  await empty.route('**/__projection-study', route => route.fulfill({ status: 404, json: {} }));
  await empty.goto(`${url}/?projection-study`);
  await empty.getByRole('alert').waitFor();
  assert.match(await empty.getByRole('alert').innerText(), /No private study capture/);
  await empty.close();
  console.log('PASS missing capture shows actionable error');
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  await server.close();
}
