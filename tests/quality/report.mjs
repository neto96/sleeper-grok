import { register } from 'node:module';
import { readFile } from 'node:fs/promises';
register('../../src/lib/sleeper/resolve-ts-hook.mjs', import.meta.url);
const { renderQualityReport } = await import('./report.ts');
const fixture=JSON.parse(await readFile(new URL('../fixtures/shadow-quality-week10.json',import.meta.url),'utf8'));
process.stdout.write(renderQualityReport(fixture));
