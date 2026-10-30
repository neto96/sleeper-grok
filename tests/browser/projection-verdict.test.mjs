import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startPreview} from './server.mjs';
const server=await startPreview();let browser;
try {
  browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
  for(const width of [1280,390]) {
    const page=await browser.newPage({viewport:{width,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?projection-verdict`);
    await page.getByRole('button',{name:'Trade',exact:true}).click();
    await page.getByRole('checkbox',{name:/Alpha WR 5/}).check();
    await page.getByRole('checkbox',{name:/Beta WR 5/}).check();
    await page.getByRole('button',{name:'Analyze trade',exact:true}).click();
    await page.getByText(/Valuation basis: your team/).waitFor();
    assert.match(await page.locator('body').innerText(),/your team — projected lineup/);
    assert.match(await page.locator('body').innerText(),/Projected offensive lineup change: \+15.00/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await mkdir('/workspace/screenshots/projection-verdict',{recursive:true});
    await page.screenshot({path:`/workspace/screenshots/projection-verdict/${width}.png`,fullPage:true});
    await page.getByRole('button',{name:'Clear',exact:true}).click();
    assert.equal(await page.getByText(/Valuation basis: your team/).count(),0);
    await page.getByRole('checkbox',{name:/Alpha WR 5/}).check();
    await page.getByRole('checkbox',{name:/Beta WR 5/}).check();
    await page.getByRole('checkbox',{name:/Beta RB 3/}).check();
    await page.getByRole('button',{name:'Analyze trade',exact:true}).click();
    const drops=page.getByTestId('drops-teamA');
    await drops.waitFor();
    assert.match(await page.getByText(/Valuation basis: your team/).innerText(),/your team — structural fallback/);
    await drops.getByRole('checkbox',{name:/Alpha WR 7/}).check();
    assert.match(await page.getByText(/Valuation basis: your team/).innerText(),/your team — projected lineup/);
    assert.equal(await drops.getByRole('checkbox',{name:/Alpha RB 3/}).isDisabled(),true);
    await page.screenshot({path:`/workspace/screenshots/projection-verdict/drops-${width}.png`,fullPage:true});
    await drops.getByRole('checkbox',{name:/Alpha WR 7/}).uncheck();
    assert.match(await page.getByText(/Valuation basis: your team/).innerText(),/your team — structural fallback/);
    await page.getByRole('button',{name:'Clear',exact:true}).click();
    assert.equal(await page.getByTestId('drops-teamA').count(),0);
    assert.deepEqual(errors,[]);await page.close();
    console.log(`PASS ${width}: main trade projection verdict, basis, clear and layout`);
  }
} finally {await browser?.close();await server.close();}
