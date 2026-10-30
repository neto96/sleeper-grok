// Real built-server smoke check. Makes read-only live Sleeper requests.
// Run after npm run build; requires port 8081 to be free.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const server = spawn('npm', ['run', 'preview'], { detached:true, stdio:['ignore','pipe','pipe'] });
let browser;
const report = { pageErrors:[], failedResources:[], responses:[], checks:[] };
try {
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Built server did not start in 30 seconds')),30000);
    server.once('exit',code=>{clearTimeout(timer);reject(new Error(`Preview exited: ${code}`));});
    server.once('error',error=>{clearTimeout(timer);reject(error);});
    server.stdout.on('data',data=>{if(String(data).includes('127.0.0.1:8081')){clearTimeout(timer);resolve();}});
    server.stderr.on('data',()=>{});
  });
  browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1280,height:800},timezoneId:'America/Chicago',locale:'es-MX'});
  page.on('pageerror',error=>report.pageErrors.push(error.message));
  page.on('requestfailed',request=>report.failedResources.push({host:new URL(request.url()).host,type:request.resourceType(),error:request.failure()?.errorText}));
  page.on('response',response=>{if(response.status()>=400)report.responses.push({host:new URL(response.url()).host,status:response.status()});});
  const started=Date.now();
  const response=await page.goto('http://127.0.0.1:8081/',{waitUntil:'domcontentloaded',timeout:90000});
  report.initialLoadMs=Date.now()-started;
  console.log('Initial document loaded');
  report.initialHtmlBytes=(await response.body()).length;
  assert.equal(response.status(),200);
  await page.getByRole('button',{name:'Refresh',exact:true}).waitFor({timeout:10000});
  report.initialProjectionControls=await page.getByText('Valuation end week',{exact:true}).isVisible();
  report.checks.push('Live SSR renders roster application');
  await page.waitForFunction(() => [...document.querySelectorAll('form')].some(form => Object.keys(form).some(key => key.startsWith('__reactProps$'))),{},{timeout:15000});
  report.checks.push('Client form hydration completes');
  const refreshed=Date.now();
  const serverResponse=page.waitForResponse(r=>new URL(r.url()).host==='127.0.0.1:8081' && r.request().method()==='POST',{timeout:90000});
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  console.log('Refresh clicked');
  const result=await serverResponse;
  const payload=await result.body();
  report.refreshMs=Date.now()-refreshed;
  report.refreshBytes=payload.length;
  assert.equal(result.status(),200);
  assert.ok(payload.includes(Buffer.from('core-offense-v1')),'Live refresh must include projection policy');
  await page.getByRole('button',{name:'Refresh',exact:true}).waitFor({timeout:10000});
  report.checks.push('Real TanStack POST refresh returns projection data');
  assert.deepEqual(report.pageErrors,[]);
  assert.equal(report.failedResources.filter(r=>r.host==='127.0.0.1:8081').length,0);
  assert.equal(report.responses.filter(r=>r.host==='127.0.0.1:8081').length,0);
  report.ok=true;
} catch(error) {
  report.ok=false; report.error=error.message; process.exitCode=1;
} finally {
  await browser?.close();
  const exited=once(server,'exit').catch(()=>{});
  try {process.kill(-server.pid,'SIGTERM');} catch {}
  await Promise.race([exited,new Promise(resolve=>setTimeout(resolve,1000))]);
  await mkdir('test-results/browser',{recursive:true});
  await writeFile('test-results/browser/production-smoke.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}
