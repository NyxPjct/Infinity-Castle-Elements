'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require('playwright-core');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ice-browser010-'));process.env.ICE_DATA_DIR=directory;
const {server,startServer,io,MULTIPLAYER_PROTOCOL}=require('../server');
const {createEngine}=require('../backend/daily-engine.cjs');
let browser;
(async()=>{try{
 startServer(0,'127.0.0.1');if(!server.listening)await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const executablePath=[process.env.CHROMIUM_PATH,'/usr/bin/chromium','/usr/bin/google-chrome',chromium.executablePath()].filter(Boolean).find(p=>fs.existsSync(p));
 browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});const context=await browser.newContext({viewport:{width:1600,height:1000}});
 await context.addInitScript(base=>{window.ICE_MULTIPLAYER_SERVER_URL=base;if(!localStorage.getItem('infinity-castle-elements-profile-v1'))localStorage.setItem('infinity-castle-elements-profile-v1',JSON.stringify({settings:{language:'en-US',fullscreen:false},progress:{unlocked:500}}));},base);
 await context.route('https://api.github.com/**',r=>r.fulfill({status:200,contentType:'application/json',body:r.request().url().includes('latest')?'{}':'[]'}));
 await context.route('https://cdn.socket.io/**',async r=>r.fulfill({response:await context.request.get(base+'/socket.io/socket.io.js')}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/?menu');await page.waitForFunction(()=>window.ICE010UI&&socket.connected);
 await page.locator('#menuConnectionPill').click();await page.waitForFunction(()=>document.querySelector('#connectionLatency').textContent.endsWith(' ms'));
 assert.equal(await page.locator('#connectionClient').textContent(),'0.0.10');assert.equal(await page.locator('#connectionProtocol').textContent(),`${MULTIPLAYER_PROTOCOL} / ${MULTIPLAYER_PROTOCOL}`);assert.equal(await page.locator('#connectionState').textContent(),'Online');
 const previousId=await page.evaluate(()=>socket.id);await page.locator('#connectionReconnectBtn').click();await page.waitForFunction(id=>socket.connected&&socket.id!==id,previousId);await page.keyboard.press('Escape');assert.equal(await page.locator('#connectionModal').isVisible(),false);assert.equal(await page.evaluate(()=>document.activeElement.id),'menuConnectionPill');
 await page.locator('#menuSettingsBtn').click();await page.locator('#settingQuality').selectOption('low');assert.equal(await page.evaluate(()=>profile.settings.quality),'low');assert.equal(await page.evaluate(()=>{ctx.shadowBlur=24;return ctx.shadowBlur;}),0);await page.locator('#settingQuality').selectOption('high');assert.equal(await page.evaluate(()=>{ctx.shadowBlur=24;return ctx.shadowBlur;}),24);await page.locator('#closeSettingsBtn').click();await page.reload();await page.waitForFunction(()=>window.ICE010UI&&socket.connected);assert.equal(await page.evaluate(()=>profile.settings.quality),'high');
 await page.locator('#menuSingleBtn').click();await page.locator('#menuDailyBtn').click();await page.locator('#rankingName').fill('<b>Browser</b>');await page.locator('#rankedDailyBtn').click();await page.waitForFunction(()=>state.activity?.ranking&&state.dailyRun?.frames>0);
 await page.keyboard.down('d');await page.waitForTimeout(500);await page.keyboard.down('w');await page.waitForTimeout(300);await page.keyboard.up('w');await page.keyboard.up('d');await page.keyboard.press('Space');await page.waitForTimeout(200);await page.keyboard.press('Escape');
 const captured=await page.evaluate(()=>({spec:state.dailyRun.spec,replay:state.dailyRun.replay(),p:{x:player.x,y:player.y,vx:player.vx,vy:player.vy,deaths:state.dailyRun.deaths,frames:state.dailyRun.frames}}));
 const engine=createEngine(captured.spec);for(const [count,mask] of captured.replay)for(let i=0;i<count;i++)engine.step(mask);const simulated=engine.snapshot();
 for(const key of ['x','y','vx','vy','deaths','frames'])assert.ok(Math.abs(captured.p[key]-simulated[key])<.00001,`${key}: browser ${captured.p[key]} / server ${simulated[key]}`);
 const pausedFrames=await page.evaluate(()=>state.dailyRun.frames);await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>state.dailyRun.frames),pausedFrames);
 await page.locator('#pauseConnectionBtn').click();await page.locator('#connectionCloseBtn').click();assert.equal(await page.evaluate(()=>state.paused),true);
 await page.keyboard.press('Escape');await page.evaluate(()=>ICEFeatures.finish());await page.waitForFunction(()=>document.querySelector('#rankingResult').textContent.includes('not published'));assert.equal((await page.evaluate(()=>ICE010UI.request('daily-board'))).entries.length,0,'A forged UI finish never enters the server ranking');
 await page.locator('#activityMenuBtn').click();
 // Actual collision/carry behavior, beyond rendering a shared combo.
 const carry=await page.evaluate(()=>{
  ICEFeatures.start('practice',1,'earth');const elapsedMs=elapsed()*1000;
  const combo=ICEMechanics.combo('earth-air',{x:160,y:678},{x:200,y:678,facing:1},elapsedMs,'carry');state.combos=[combo];
  Object.assign(player,{x:145,y:678,vx:0,vy:0,onGround:true});applyComboPhysics(player);
  state.levelStart-=100;const before={x:player.x,y:player.y};applyComboPhysics(player);const carried={dx:player.x-before.x,dy:player.y-before.y};
  state.combos=[ICEMechanics.combo('light-darkness',{x:player.x,y:player.y},{x:player.x,y:player.y},elapsed()*1000,'protect')];state.invulnUntil=0;applyComboPhysics(player);return {...carried,protected:state.invulnUntil>gameNow()};
 });assert.ok(carry.dx>10&&carry.dy<0);assert.equal(carry.protected,true);
 const boss=await page.evaluate(()=>{ICEFeatures.start('practice',100,'earth');state.bossCharge=state.levelData.boss.required;const second=bossArenaPlatforms().length;state.bossCharge*=2;return {second,third:bossArenaPlatforms().length,phase:bossCurrentPhase()};});assert.deepEqual(boss,{second:2,third:3,phase:2});
 const restoredBoss=await page.evaluate(()=>{state.mode='multiplayer';state.networkWasRunning=false;restoreNetworkSession({started:true,level:100,deaths:0,elapsedMs:1000,bossPhase:2,bossDefeated:false,combos:[],trapStates:[],defeatedEnemies:[],players:[{id:state.id,role:'earth'}]});return state.bossCharge/state.levelData.boss.required;});assert.equal(restoredBoss,2,'Reconnection restores completed boss stages in the progress bar');
 // A known completed run goes through the real browser finish + socket + worker + board UI.
 const fixture=require('./fixtures/daily-010-earth.json'),realNow=Date.now;let serverNow=Date.parse(fixture.spec.date+'T12:00:00Z');
 try{
  Date.now=()=>serverNow;
  await page.evaluate(()=>{showMainMenu();ICEFeatures.openDaily();});await page.locator('#rankingName').fill('<b>Browser</b>');await page.locator('#rankedDailyBtn').click();await page.waitForFunction(()=>state.activity?.ranking);
  serverNow+=8000;
  await page.evaluate(fixture=>{const ranking=state.activity.ranking;ICEFeatures.start('daily',ranking.spec.level,ranking.spec.role,ranking);state.paused=true;for(const [count,mask] of fixture.replay)for(let i=0;i<count;i++)state.dailyRun.step(mask);},fixture);
  await page.waitForFunction(()=>document.querySelector('#rankingResult').textContent==='Leaderboard position: 1');
  const ranked=await page.evaluate(()=>ICE010UI.request('daily-board'));assert.equal(ranked.entries[0].time,7.6);assert.equal(ranked.entries[0].deaths,0);assert.equal(ranked.entries[0].name,'<b>Browser</b>');
  assert.equal(await page.locator('#dailyBoard li b').textContent(),'<b>Browser</b>');assert.equal(await page.locator('#dailyBoard li b b').count(),0,'Public names are literal text, never markup');
 }finally{Date.now=realNow;}
 assert.deepEqual(errors,[]);console.log('PASS: live diagnostics/reconnect/focus, saved quality, exact browser/server replay parity, pause, forged finish refusal, a real completed run published through the worker and board UI, literal public names, platform carry, protection and boss arenas.');
}finally{await browser?.close();io.disconnectSockets(true);await new Promise(r=>io.close(r));fs.rmSync(directory,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
