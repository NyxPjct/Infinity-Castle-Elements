const {chromium}=require('playwright-core');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {server,startServer,io,MULTIPLAYER_PROTOCOL}=require('../server');
let base;const out=fs.mkdtempSync(path.join(os.tmpdir(),'ice-browser-'));
(async()=>{
 startServer(0,'127.0.0.1');if(!server.listening)await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
 const executablePath=[process.env.CHROMIUM_PATH,'/usr/bin/chromium','/usr/bin/google-chrome',chromium.executablePath()].filter(Boolean).find(p=>fs.existsSync(p));
 if(!executablePath){await new Promise(r=>server.close(r));throw Error('Install Chromium with: npx playwright-core install --with-deps chromium');}
 let browser;const errors=[];
 try{
  browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
  async function page(mobile=false){
   const c=await browser.newContext({viewport:mobile?{width:960,height:540}:{width:1600,height:1000},isMobile:mobile,hasTouch:mobile});
   await c.addInitScript(base=>{
    window.ICE_MULTIPLAYER_SERVER_URL=base;
    if(!localStorage.getItem('infinity-castle-elements-profile-v1')){
     localStorage.setItem('infinity-castle-elements-profile-v1',JSON.stringify({schemaVersion:2,coins:73,boosts:{shield:2,speed:1,jump:2},relics:{active:'windstep',owned:{windstep:true}},stats:{deaths:78},settings:{language:'en-US',fullscreen:false}}));
     localStorage.setItem('infinity-castle-elements-solo-v1',JSON.stringify({schemaVersion:2,level:214,role:'earth',deaths:78,completed:false}));
    }
   },base);
   await c.route('https://api.github.com/**',r=>r.fulfill({status:200,contentType:'application/json',body:r.request().url().includes('latest')?'{}':'[]'}));
   await c.route('https://cdn.socket.io/**',async r=>r.fulfill({response:await c.request.get(base+'/socket.io/socket.io.js')}));
   const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/?menu');await p.waitForFunction(()=>!!window.ICEFeatures);return p;
  }
  const p=await page();
  await p.waitForTimeout(800);
  const activities=p.locator('#menuTutorialBtn,#menuMapBtn,#menuDailyBtn');
  assert.equal(await p.locator('.main-nav .journey-launch').count(),0);
  assert.equal(await p.locator('#soloSetup .journey-launch button').count(),3);
  for(const viewport of [{width:1366,height:768},{width:1280,height:720},{width:960,height:540},{width:390,height:844},{width:853,height:393},{width:320,height:568}]){
   await p.setViewportSize(viewport);
   const layout=await p.evaluate(()=>{
    const nav=document.querySelector('.main-nav'),panel=document.querySelector('.menu-panel').getBoundingClientRect(),footer=document.querySelector('.menu-footer').getBoundingClientRect();
    return {width:innerWidth,height:innerHeight,scrollWidth:nav.scrollWidth,clientWidth:nav.clientWidth,scrollHeight:nav.scrollHeight,clientHeight:nav.clientHeight,panel:{top:panel.top,bottom:panel.bottom},footer:{top:footer.top,bottom:footer.bottom},scrollbar:getComputedStyle(nav).scrollbarWidth};
   });
   assert.ok(layout.scrollWidth<=layout.clientWidth+1,JSON.stringify(layout));
   assert.ok(layout.panel.top>=0&&layout.panel.bottom<=layout.height+1,JSON.stringify(layout));
   assert.ok(layout.footer.top>=0&&layout.footer.bottom<=layout.height+1,JSON.stringify(layout));
   assert.equal(layout.scrollbar,'thin');
   if(viewport.width>=1280)assert.ok(layout.scrollHeight<=layout.clientHeight+1,JSON.stringify(layout));
   await p.locator('#menuExitBtn').scrollIntoViewIfNeeded();const exit=await p.locator('#menuExitBtn').boundingBox();assert.ok(exit.y>=0&&exit.y+exit.height<=viewport.height+1,JSON.stringify(exit));
  }
  await p.setViewportSize({width:1600,height:1000});
  for(const mode of ['Multi','Chaos']){
   await p.locator('#menu'+mode+'Btn').click();
   for(const button of await activities.all())assert.equal(await button.isVisible(),false,'Solo activities must be hidden in '+mode);
   await p.locator('#backToMenuBtn').click();
  }
  await p.locator('#menuSingleBtn').click();
  for(const button of await activities.all())assert.equal(await button.isVisible(),true,'Solo activities are available inside Singleplayer');
  await p.locator('#backToMenuBtn').click();
  const campaign=await p.evaluate(()=>localStorage.getItem('infinity-castle-elements-solo-v1'));
  
  await p.locator('#menuSingleBtn').click();await p.locator('#menuTutorialBtn').click();await p.waitForTimeout(400);
  assert.equal(await p.evaluate(()=>state.activity.type),'tutorial');assert.equal(await p.evaluate(()=>state.mode),'singleplayer');
  await p.keyboard.down('d');await p.waitForFunction(()=>player.x>290);await p.keyboard.down('w');await p.waitForFunction(()=>state.activity.stage>=2);
  await p.keyboard.up('w');await p.keyboard.up('d');await p.keyboard.press('Space');await p.waitForFunction(()=>state.activity.stage===3);
  
  await p.evaluate(()=>{Object.assign(player,{x:1090,y:734,vx:0,vy:0});player.update(.016);});
  assert.equal(await p.evaluate(()=>state.activity.coop),true);
  await p.evaluate(()=>{Object.assign(player,{x:1520,y:734,vx:0,vy:0});player.update(.016);});
  await p.locator('#journeyResultView').waitFor({state:'visible'});
  assert.equal(await p.evaluate(()=>profile.tutorialCompleted),true);
  assert.equal(await p.evaluate(()=>localStorage.getItem('infinity-castle-elements-solo-v1')),campaign);
  assert.equal(await p.evaluate(()=>profile.coins),73);
  assert.equal(await p.evaluate(()=>profile.stats.deaths),78);
  await p.locator('#activityMenuBtn').click();await p.locator('#menuSingleBtn').click();await p.locator('#menuMapBtn').click();
  await p.locator('#mapRegion').selectOption('0');await p.locator('[data-level="100"]').click();
  
  await p.locator('#mapPlayBtn').click();assert.ok(await p.evaluate(()=>!!state.levelData.boss));assert.equal(await p.evaluate(()=>state.mode),'singleplayer');
  await p.evaluate(()=>ICEFeatures.finish());await p.locator('#journeyResultView').waitFor({state:'visible'});
  assert.ok(await p.evaluate(()=>profile.progress.practice[100]));assert.equal(await p.evaluate(()=>profile.progress.records[100]),undefined);
  assert.equal(await p.evaluate(()=>profile.progress.unlocked),214);
  assert.equal(await p.evaluate(()=>localStorage.getItem('infinity-castle-elements-solo-v1')),campaign);
  await p.locator('#activityMenuBtn').click();await p.locator('#menuSingleBtn').click();await p.locator('#menuDailyBtn').click();await p.locator('#dailyPlayBtn').click();
  const daily=await p.evaluate(()=>({level:state.level,role:state.role,expected:ICEJourney.daily(),relic:activeRelicId(),boosts:state.activeBoosts,geometry:JSON.stringify(state.levelData)}));
  assert.equal(await p.evaluate(()=>state.mode),'singleplayer');assert.equal(daily.level,daily.expected.level);assert.equal(daily.role,daily.expected.role);assert.equal(daily.relic,null);assert.equal(Object.values(daily.boosts).some(Boolean),false);
  await p.evaluate(()=>{addCoins(200);state.invulnUntil=0;die();});await p.waitForTimeout(800);
  assert.equal(await p.evaluate(()=>JSON.stringify(state.levelData)),daily.geometry,'Daily retry geometry is deterministic');assert.equal(await p.evaluate(()=>profile.coins),73);
  await p.keyboard.press('Escape');await p.locator('#pauseSettingsBtn').click();
  await p.locator('[data-binding="jump"]').click();await p.keyboard.press('KeyA');assert.equal(await p.evaluate(()=>inputController.bindings.jump.includes('KeyA')),false);
  await p.keyboard.press('KeyJ');assert.equal(await p.evaluate(()=>inputController.bindings.jump[0]),'KeyJ');
  await p.locator('#touchButtonSelect').selectOption('ability');await p.locator('#touchSize').fill('110');await p.locator('#touchX').fill('78');await p.locator('#touchY').fill('79');
  await p.locator('#audioMusic').fill('32');await p.locator('#audioPreviewBtn').click();await p.waitForTimeout(100);
  assert.ok(await p.evaluate(()=>sound.stats().unlocked));
  
  await p.locator('#closeSettingsBtn').click();await p.keyboard.press('Escape');
  await p.evaluate(()=>ICEFeatures.finish());assert.ok(await p.evaluate(()=>profile.daily[state.activity.date]));
  assert.equal(await p.evaluate(()=>localStorage.getItem('infinity-castle-elements-solo-v1')),campaign);
  await p.locator('#activityMenuBtn').click();await p.reload();await p.waitForFunction(()=>!!window.ICEFeatures);
  assert.equal(await p.evaluate(()=>inputController.bindings.jump[0]),'KeyJ');assert.equal(await p.evaluate(()=>profile.settings.touch.ability.size),110);assert.equal(await p.evaluate(()=>profile.settings.audio.music),.32);
  await p.locator('#menuSingleBtn').click();await p.locator('#menuTutorialBtn').click();await p.waitForTimeout(350);await p.keyboard.press('KeyW');assert.equal(await p.evaluate(()=>state.runStats.jumps),0);await p.keyboard.press('KeyJ');await p.waitForFunction(()=>state.runStats.jumps===1);
  await p.evaluate(()=>navigator.serviceWorker.ready);await p.waitForFunction(async()=>{for(const name of await caches.keys()){const c=await caches.open(name);if(await c.match('/journey-ui.js'))return true;}return false;});
  await p.context().setOffline(true);await p.reload();await p.waitForFunction(()=>!!window.ICEFeatures);await p.locator('#menuSingleBtn').click();await p.locator('#menuDailyBtn').click();await p.locator('#dailyPlayBtn').click();assert.equal(await p.evaluate(()=>state.activity.type),'daily');
  await p.context().close();
  const m=await page(true);await m.locator('#menuSingleBtn').click();await m.locator('#menuTutorialBtn').click();await m.waitForTimeout(550);await m.locator('#mobileControls').waitFor({state:'visible'});
  for(const el of await m.locator('.mobile-control-button').all()){const b=await el.boundingBox();assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=961&&b.y+b.height<=541,JSON.stringify(b));}
  const jump=await m.locator('[data-touch-key="w"]').boundingBox();await m.touchscreen.tap(jump.x+jump.width/2,jump.y+jump.height/2);await m.waitForFunction(()=>state.runStats.jumps>0);
  await m.context().close();
  const host=await page(),guest=await page();
  for(const [i,pg] of [host,guest].entries()){await pg.locator('#menuMultiBtn').click();await pg.locator('[data-element="'+(i?'air':'earth')+'"]').click();}
  await host.locator('#createBtn').click();await host.locator('#room').waitFor({state:'visible'});const code=await host.locator('#roomCode').innerText();
  await guest.locator('#roomCodeInput').fill(code);await guest.locator('#joinBtn').click();await guest.locator('#room').waitFor({state:'visible'});
  await host.locator('#readyBtn').click();await guest.locator('#readyBtn').click();await host.waitForFunction(()=>state.running&&state.mode==='multiplayer');await guest.waitForFunction(()=>state.running&&state.mode==='multiplayer');
  await guest.evaluate(()=>{Object.assign(player,{x:160,y:734,vx:0,vy:0,onGround:true});setTrapTrigger('as4242');});await host.waitForFunction(()=>[...state.remotePlayers.values()].some(p=>p.role==='air'&&Math.abs(p.x-160)<1));
  await guest.evaluate(()=>socket.disconnect());await host.waitForFunction(()=>state.networkPaused);assert.equal(await host.evaluate(()=>state.running),false);
  await guest.evaluate(()=>socket.connect());await guest.waitForFunction(()=>state.running&&!state.networkPaused);await host.waitForFunction(()=>state.running&&!state.networkPaused);
  assert.equal(await guest.evaluate(()=>state.slot),1);assert.equal(await guest.evaluate(()=>state.role),'air');assert.ok(await guest.evaluate(()=>Math.abs(player.x-160)<5));
  assert.equal(await host.evaluate(()=>state.trapState.has('as4242')),true);
  await guest.reload();await guest.waitForFunction(()=>state.running&&state.mode==='multiplayer'&&!state.networkPaused);assert.equal(await guest.evaluate(()=>state.slot),1);assert.equal(await guest.evaluate(()=>state.role),'air');
  await guest.keyboard.press('Escape');await guest.locator('#pauseMainMenuBtn').click();await host.locator('#room').waitFor({state:'visible'});
  assert.equal(await guest.evaluate(()=>sessionStorage.getItem('ice-network-session')),null);
  await host.context().close();await guest.context().close();
  const compatibility=await page();await compatibility.waitForFunction(()=>socket.connected);
  let release={tag_name:'v0.0.10',body:'<!-- required-update -->',assets:[]};
  await compatibility.context().route('https://api.github.com/repos/NyxPjct/Infinity-Castle-Elements/releases/latest',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(release)}));
  const peer=io.to(await compatibility.evaluate(()=>socket.id));
  peer.emit('protocol-info',{protocolVersion:MULTIPLAYER_PROTOCOL-1,serverVersion:'0.0.10'});
  await compatibility.waitForFunction(()=>document.querySelector('#connectionPill').textContent.includes('Server updating'));
  assert.equal(await compatibility.locator('#updateModal').isVisible(),false);
  await compatibility.locator('#menuMultiBtn').click();await compatibility.locator('#createBtn').click();
  await compatibility.waitForFunction(()=>document.querySelector('#errorText').textContent.includes('server needs an update'));
  assert.equal(await compatibility.evaluate(()=>state.roomCode),null);
  assert.equal(await compatibility.locator('#updateModal').isVisible(),false);
  await compatibility.locator('#backToMenuBtn').click();await compatibility.locator('#menuSingleBtn').click();await compatibility.locator('#menuTutorialBtn').click();
  assert.equal(await compatibility.evaluate(()=>state.mode),'singleplayer');
  await compatibility.keyboard.press('Escape');await compatibility.locator('#pauseMainMenuBtn').click();
  const currentRelease=await compatibility.evaluate(()=>checkUpdatesFromUI(true));
  assert.equal(currentRelease.status,'up-to-date');assert.equal(currentRelease.required,false);
  assert.equal(await compatibility.locator('#updateRequiredBanner').isVisible(),false);
  peer.emit('protocol-info',{protocolVersion:MULTIPLAYER_PROTOCOL+1,serverVersion:'0.0.11'});
  await compatibility.waitForFunction(()=>serverCompatibility?.status==='client-outdated'&&desktopUpdateState?.status==='up-to-date');
  assert.equal(await compatibility.locator('#updateModal').isVisible(),false);
  assert.ok((await compatibility.locator('#connectionPill').textContent()).includes('Multiplayer incompatible'));
  release={...release,tag_name:'v0.0.11'};
  peer.emit('protocol-info',{protocolVersion:MULTIPLAYER_PROTOCOL+1,serverVersion:'0.0.11'});
  await compatibility.waitForFunction(()=>document.querySelector('#connectionPill').textContent.includes('Update required'));
  await compatibility.locator('#updateModal').waitFor({state:'visible'});
  assert.equal(await compatibility.evaluate(()=>desktopUpdateState.required),true);
  await compatibility.locator('#closeUpdateBtn').click();
  peer.emit('protocol-info',{protocolVersion:MULTIPLAYER_PROTOCOL,serverVersion:'0.0.10'});
  await compatibility.waitForFunction(()=>document.querySelector('#connectionPill').textContent==='● Online');
  await compatibility.context().close();
  assert.deepEqual(errors,[]);console.log('PASS: protocol direction, published-update detection, responsive menu without horizontal overflow, Singleplayer-only activity navigation, playable tutorial inputs, cooperation gate, boss practice, campaign isolation, daily determinism, rebinding/conflicts, saved touch/audio preferences, offline activities, mobile tap jump and browser reconnect/reload.');
 }finally{await browser?.close();if(server.listening)await new Promise(r=>server.close(r));fs.rmSync(out,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
