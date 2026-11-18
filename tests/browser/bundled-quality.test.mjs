import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { startPreview } from './server.mjs';
test('bundled ROS with local flag off: desktop/mobile filters, limits and refresh',async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined});
 let server;
 try{
  server=await startPreview(0,false);
  for(const width of [1280,390]){
   const page=await browser.newPage({viewport:{width,height:844}}), errors=[], forbidden=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('request',r=>{if(/fantasypros|__local-quality/.test(r.url()))forbidden.push(r.url());});
   await page.clock.install({time:new Date('2026-11-18T12:00:00Z')});
   await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?bundled-quality-study`);
   await page.getByRole('button',{name:'Waivers',exact:true}).click();
   const panel=page.getByTestId('local-ros-assets');
   await panel.getByText(/30 ranked of 30/).waitFor();
   await page.getByTestId('local-decision-context').waitFor();
   assert.equal(await panel.locator('ol li').count(),10);
   await panel.getByRole('button',{name:'Show more',exact:true}).click();
   assert.equal(await panel.locator('ol li').count(),25);
   await panel.getByRole('button',{name:'WR',exact:true}).click();
   assert.ok(await panel.locator('ol li').count()>0);
   await panel.getByRole('button',{name:'All',exact:true}).click();
   assert.equal(await panel.locator('ol li').count(),10);
   const source=await panel.getByRole('status').innerText();assert.match(source,/ROS data · Nov 17, 2026/);
   await page.getByRole('button',{name:'Refresh',exact:true}).click();
   await panel.getByText(/29 ranked of 29/).waitFor();
   assert.equal(await panel.getByRole('status').innerText(),source);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);
   await mkdir('/workspace/screenshots/bundled-ros',{recursive:true});
   await page.screenshot({path:`/workspace/screenshots/bundled-ros/waivers-${width}.png`,fullPage:true});
   await page.close();
  }
 }finally{await server?.close();await browser.close();}
});
