import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {startPreview} from './server.mjs';
test('local ROS view is additive, reloads, hides missing and rejects stale evidence on desktop/mobile',async()=>{
 const server=await startPreview(0,true),browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined});
 try{const url=`http://127.0.0.1:${server.httpServer.address().port}`;
 for(const width of [1280,390]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 let response={status:'absent'};await page.route('**/__local-quality',route=>route.fulfill({json:response}));
 await page.goto(url+'?projection-verdict');await page.getByRole('button',{name:'Waivers',exact:true}).click();await page.waitForTimeout(200);assert.equal(await page.getByTestId('local-ros-assets').count(),0);
 const {makeProjectionSnapshot}=await server.ssrLoadModule('/fixture.ts');const snapshot=makeProjectionSnapshot(),p=snapshot.analysisWaiverPool.find(x=>x.position==='RB');assert.ok(p);
 const now=new Date().toISOString();
 response={status:'loaded',capture:{version:1,mappings:{},players:[],records:[{team:p.team??null,evidence:{player:{sleeperId:String(p.player_id),providerId:'synthetic-browser-id',name:p.name,position:p.position,identityResolved:true},provider:'FantasyPros',season:Number(snapshot.season),rankingType:'ROS',scoring:'PPR',format:'redraft-1qb',pool:{id:`fantasypros:NFL:${snapshot.season}:ROS:PPR:redraft-1qb:ALL`,kind:'overall',position:null},overallEcr:17,positionalEcr:8,sourceUpdatedAt:now,sourceAsOfDate:null,retrievedAt:now,sourceNote:'Synthetic browser control'}}]}};
 await page.reload();await page.getByRole('button',{name:'Waivers',exact:true}).click();const panel=page.getByTestId('local-ros-assets');await panel.waitFor();await panel.getByText('ROS #17',{exact:false}).waitFor();assert.match(await panel.innerText(),/1 ranked available players/);
 await page.getByRole('button',{name:'Markdown',exact:true}).click();const baseline=await page.locator('pre').innerText();assert.ok(!baseline.includes('Best ROS Assets'));
 await page.getByRole('button',{name:'Waivers',exact:true}).click();await mkdir('/workspace/screenshots/phase3a',{recursive:true});await panel.screenshot({path:`/workspace/screenshots/phase3a/ros-${width}.png`});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 response.capture.records[0].evidence.sourceUpdatedAt='2020-01-01T00:00:00Z';await page.getByRole('button',{name:'Reload local capture'}).click();await panel.getByText('No current overall ROS evidence for these free agents.').waitFor();
 response={status:'absent'};await page.getByRole('button',{name:'Reload local capture'}).click();await panel.waitFor({state:'detached'});await page.getByRole('button',{name:'Markdown',exact:true}).click();assert.equal(await page.locator('pre').innerText(),baseline);assert.deepEqual(errors,[]);await page.close();
 }
 }finally{await browser.close();await server.close();}
});
