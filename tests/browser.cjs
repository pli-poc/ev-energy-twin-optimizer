const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
(async()=>{
 fs.mkdirSync('.preview',{recursive:true});fs.mkdirSync('test-results',{recursive:true});
 if(!fs.existsSync('.preview/ev-energy-twin-optimizer'))fs.symlinkSync('../out','.preview/ev-energy-twin-optimizer','dir');
 const server=spawn('python3',['-m','http.server','4173','--directory','.preview'],{stdio:'ignore'});
 let browser;
 try{
  for(let i=0;i<60;i++){try{const r=await fetch('http://127.0.0.1:4173/ev-energy-twin-optimizer/');if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,500));}
  browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1600,height:1000},acceptDownloads:true});page.setDefaultTimeout(30000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/ev-energy-twin-optimizer/',{waitUntil:'networkidle'});
  await page.getByRole('heading',{name:'One site. A shared energy system.',exact:true}).waitFor();
  await page.getByRole('button',{name:'Compare strategies',exact:true}).click();
  await page.getByRole('heading',{name:'Six strategies. One set of assumptions.',exact:true}).waitFor();
  assert.equal(await page.locator('tr[data-strategy]').count(),6);
  const reference=await page.locator('tr[data-strategy="balanced"] td').allTextContents();
  const names=[['immediate','Immediate charging'],['balanced','Load balancing'],['ems','Deadline-aware EMS'],['cheap','Cheapest energy'],['peak','Peak-aware'],['total','Total-cost-aware']];
  for(const [id,name] of names){
   await page.getByRole('button',{name:`Replay ${name}`,exact:true}).click();
   await page.locator(`tr[data-strategy="${id}"].selected-run`).waitFor();
   assert.ok((await page.locator('.scene-sub').innerText()).includes(name));
   assert.deepEqual(await page.locator('tr[data-strategy="balanced"] td').allTextContents(),reference);
  }
  console.log('PASS: six replays update the twin; baseline metrics remain unchanged.');
  await page.getByLabel('Comparison chart metric',{exact:true}).selectOption('cost');
  await page.getByLabel('Comparison chart metric',{exact:true}).selectOption('energy');
  const csvPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Comparison CSV',exact:true}).click();const csv=fs.readFileSync(await (await csvPromise).path(),'utf8');assert.equal(csv.split('\n').length,7);assert.ok(csv.includes('"EUR"'));assert.ok(!csv.includes('£'));
  const jsonPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Evidence JSON',exact:true}).click();const evidence=JSON.parse(fs.readFileSync(await (await jsonPromise).path(),'utf8'));assert.equal(evidence.results.length,6);assert.equal(evidence.assumptions.currency,'EUR');
  const scenarioPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export scenario',exact:true}).click();const scenario=JSON.parse(fs.readFileSync(await (await scenarioPromise).path(),'utf8'));assert.equal(scenario.schemaVersion,2);assert.equal(scenario.optimizer.policy,'total');assert.equal(scenario.advanced,true);
  await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('button',{name:'Replay Immediate charging',exact:true}).click();await page.getByRole('button',{name:'Restore',exact:true}).click();await page.locator('tr[data-strategy="total"].selected-run').waitFor();
  console.log('PASS: EUR CSV, evidence JSON, scenario export and browser restore.');
  const oldId=await page.locator('.compare-intro .eyebrow').innerText();
  await page.getByRole('combobox',{name:'Market profile',exact:true}).click();await page.getByRole('option',{name:'Wallonia',exact:true}).click();
  await page.waitForFunction(old=>document.querySelector('.compare-intro .eyebrow')?.textContent!==old,oldId);
  assert.ok((await page.locator('.compare-assumptions').innerText()).includes('Wallonia'));
  const energyBefore=await page.locator('tr[data-strategy="total"] td').first().innerText();
  await page.locator('.comparison-method summary').click();await page.getByLabel('Monthly capacity rate',{exact:true}).fill('4.45');
  assert.equal(await page.locator('tr[data-strategy="total"] td').first().innerText(),energyBefore);
  console.log('PASS: tariff setting shared; monthly sensitivity not added to daily energy cost.');
  await page.locator('.strategy-analysis').screenshot({path:'test-results/comparison-desktop.png'});
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Replay Peak-aware',exact:true}).click();await page.locator('tr[data-strategy="peak"].selected-run').waitFor();
  await page.screenshot({path:'test-results/comparison-mobile.png',fullPage:true});
  assert.deepEqual(errors,[],'No uncaught browser errors');
  console.log('PASS: mobile replay and screenshots; no uncaught browser exceptions.');
 }finally{if(browser)await browser.close();server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
