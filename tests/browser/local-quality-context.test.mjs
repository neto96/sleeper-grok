import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {startPreview} from './server.mjs';
test('local context: single fetch, filters, limits, annotations and existing controls at both widths', async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined});
 let server;
 try {
  server=await startPreview(0,true);const url=`http://127.0.0.1:${server.httpServer.address().port}`;
  const {makeLocalQualitySnapshot}=await server.ssrLoadModule('/fixture.ts');const s=makeLocalQualitySnapshot();
  const now=new Date().toISOString();
  const capture={version:1,mappings:{},players:[],records:s.analysisWaiverPool.map((p,i)=>({team:p.team,evidence:{provider:'FantasyPros',season:Number(s.season),rankingType:'ROS',scoring:'PPR',format:'redraft-1qb',pool:{id:`fantasypros:NFL:${s.season}:ROS:PPR:redraft-1qb:ALL`,kind:'overall',position:null},player:{providerId:`synthetic-${i}`,sleeperId:p.player_id,identityResolved:true,name:p.name,position:p.position},overallEcr:i+1,positionalEcr:i+1,sourceUpdatedAt:now,sourceAsOfDate:null,retrievedAt:now,sourceNote:'Synthetic'}}))};
  for(const width of [1280,390]){
   const page=await browser.newPage({viewport:{width,height:900}});let calls=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/__local-quality',r=>{calls++;return r.fulfill({json:{status:'loaded',capture}});});
   await page.goto(url+'?local-quality-study');await page.getByRole('button',{name:'Waivers',exact:true}).click();
   const panel=page.getByTestId('local-ros-assets');await panel.getByText('30 ranked of 30 offensive free agents').waitFor();
   assert.equal(await panel.locator('ol li').count(),10);assert.equal(calls,1);
   await panel.getByRole('button',{name:'Show more',exact:true}).click();assert.equal(await panel.locator('ol li').count(),25);
   await panel.getByRole('button',{name:'RB',exact:true}).click();assert.equal(await panel.locator('ol li').count(),10);
   assert.ok((await panel.locator('ol').innerText()).includes('Research Option 1'));
   await panel.getByRole('button',{name:'Show more',exact:true}).click();assert.equal(await panel.locator('ol li').count(),15);
   await panel.getByRole('button',{name:'QB',exact:true}).click();assert.equal(await panel.locator('ol li').count(),0);
   await panel.getByRole('button',{name:'All',exact:true}).click();assert.equal(await panel.locator('ol li').count(),10);
   assert.ok(await page.getByTestId('local-ros-annotation').count()>0);
   await page.getByTestId('local-decision-context').waitFor();
   const drop=page.getByLabel('Hypothetical waiver drop');if(await drop.count())await drop.selectOption({index:1});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
   await mkdir('/workspace/screenshots/phase3c',{recursive:true});await page.screenshot({path:`/workspace/screenshots/phase3c/waivers-${width}.png`,fullPage:true});
   assert.equal(calls,1);await page.close();
  }
 }finally{await server?.close();await browser.close();}
});
