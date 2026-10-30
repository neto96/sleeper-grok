import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startPreview } from './server.mjs';
const server=await startPreview();
let browser;
try {
  browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
  for(const width of [1280,390]) {
    const page=await browser.newPage({viewport:{width,height:900}});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?trade-projections`);
    await page.getByRole('heading',{name:'Private trade projection test'}).waitFor();
    const data=JSON.parse(await readFile(new URL('../../test-results/projections/comparison.json',import.meta.url),'utf8'));
    for (const team of data.tradeInput.teams.slice(0,2)) {
      await page.getByRole('checkbox',{name: new RegExp(team.bench[0].name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).check();
    }
    await page.getByRole('button',{name:'Analyze trade',exact:true}).click();
    await page.getByRole('heading',{name:'Experimental projected lineup impact'}).waitFor();
    assert.ok((await page.locator('body').innerText()).includes('comparable weeks'));
    const detail=page.getByTestId('projected-teamA').locator('details').first();
    await detail.locator('summary').click();
    assert.ok((await detail.innerText()).length>40);
    await mkdir('/workspace/screenshots/trade-evidence',{recursive:true});
    await page.screenshot({path:`/workspace/screenshots/trade-evidence/${width}.png`,fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.getByRole('button',{name:'Clear',exact:true}).click();
    assert.equal(await page.getByRole('heading',{name:'Experimental projected lineup impact'}).count(),0);
    const pick = async p => page.getByRole('checkbox', {name: new RegExp(p.name.split(' ')[0])}).first().check();
    await pick(data.tradeInput.teams[0].bench[0]);
    await pick(data.tradeInput.teams[1].bench[0]);
    await pick(data.tradeInput.teams[1].bench[1]);
    await page.getByRole('button',{name:'Analyze trade',exact:true}).click();
    const impact=page.getByTestId('projected-teamA');
    await impact.waitFor();
    assert.match(await impact.innerText(),/Select follow-up drops/);
    const drops=impact.getByRole('checkbox');
    const legend=await impact.locator('legend').innerText();
    const required=Number(legend.match(/Choose (\d+)/)[1]);
    for(let i=0;i<required;i++) await drops.nth(i).check();
    assert.ok(!(await impact.innerText()).includes('Select follow-up drops'));
    assert.equal(await drops.nth(required).isDisabled(),true);
    await drops.first().uncheck();
    assert.match(await impact.innerText(),/Select follow-up drops/);
    await page.getByRole('combobox').nth(1).selectOption(String(data.tradeInput.teams[2].rosterId));
    assert.equal(await page.getByTestId('projected-teamA').count(),0);
    await page.getByLabel('Your roster').selectOption(String(data.tradeInput.teams[1].rosterId));
    assert.equal(await page.getByTestId('projected-teamA').count(),0);
    console.log(`PASS ${width}: uneven trade, drop resolution/undo/limit, partner and roster reset`);
    assert.deepEqual(errors,[]);
    await page.close();console.log(`PASS ${width}: saved roster trade, projected comparison, clear, layout`);
  }
} finally {await browser?.close();await server.close();}
