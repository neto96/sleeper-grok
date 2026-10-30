import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startPreview} from './server.mjs';
const server=await startPreview();let browser;
try {
  browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
  for(const width of [1280,390]) {
    const page=await browser.newPage({viewport:{width,height:900},permissions:['clipboard-read','clipboard-write']});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?projection-verdict&refresh-fails`);
    await page.getByRole('button',{name:'Waivers',exact:true}).click();
    const panel=page.getByTestId('projected-waivers');
    await panel.waitFor();
    assert.match(await panel.innerText(),/Choose a hypothetical drop/);
    await page.getByLabel('Hypothetical waiver drop').selectOption({label:'Alpha WR 7 · WR'});
    assert.match(await panel.innerText(),/Available Runner/);
    assert.match(await panel.innerText(),/\+20.00 points\/week/);
    assert.match(await panel.innerText(),/Unknown — incomplete/);
    await page.getByRole('button',{name:'Copy .md',exact:true}).click();
    const exported=await page.evaluate(()=>navigator.clipboard.readText());
    assert.match(exported,/## Projected Waiver Comparison/);
    assert.match(exported,/Hypothetical drop: Alpha WR 7/);
    assert.match(exported,/\+20.00 points\/week/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await mkdir('/workspace/screenshots/waiver-valuation',{recursive:true});
    await page.screenshot({path:`/workspace/screenshots/waiver-valuation/${width}.png`,fullPage:true});
    await page.getByLabel('Moves effective from').selectOption('7');
    assert.equal(await page.getByLabel('Hypothetical waiver drop').inputValue(),'');
    await page.getByLabel('Hypothetical waiver drop').selectOption({label:'Alpha WR 7 · WR'});
    assert.match(await panel.innerText(),/Weeks 7–7/);
    await page.getByLabel('Valuation end week').selectOption('6');
    assert.equal(await page.getByLabel('Moves effective from').inputValue(),'6');
    assert.equal(await page.getByLabel('Hypothetical waiver drop').inputValue(),'');
    await page.getByLabel('Valuation end week').selectOption('7');
    assert.equal(await page.getByLabel('Valuation end week').inputValue(),'7');
    await page.getByLabel('My team').selectOption('20');
    assert.equal(await page.getByLabel('Hypothetical waiver drop').inputValue(),'');
    await page.getByLabel('Hypothetical waiver drop').selectOption({label:'Beta WR 7 · WR'});
    assert.match(await panel.innerText(),/\+5.00 points\/week/);
    await page.getByRole('button',{name:'Refresh',exact:true}).click();
    await page.getByText('Simulated refresh failure',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Hypothetical waiver drop').inputValue(),'');
    await page.getByRole('button',{name:'Copy .md',exact:true}).click();
    assert.doesNotMatch(await page.evaluate(()=>navigator.clipboard.readText()),/## Projected Waiver Comparison/);
    assert.deepEqual(errors,[]);await page.close();
    console.log(`PASS ${width}: drop required, gain, unknown forecasts, roster reset and recalculation`);
  }
} finally {await browser?.close();await server.close();}
