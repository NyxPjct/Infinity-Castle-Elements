'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require('playwright-core');const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ice-expedition-'));process.env.ICE_DATA_DIR=directory;
const {server,startServer,io}=require('../server');let browser;
(async()=>{try{
 startServer(0,'127.0.0.1');if(!server.listening)await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const executablePath=[process.env.CHROMIUM_PATH,'/usr/bin/chromium','/usr/bin/google-chrome',chromium.executablePath()].filter(Boolean).find(p=>fs.existsSync(p));browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1600,height:1000}});await context.addInitScript(base=>{
  window.ICE_MULTIPLAYER_SERVER_URL=base;
  if(!localStorage.getItem('infinity-castle-elements-profile-v1')){
   localStorage.setItem('infinity-castle-elements-profile-v1',JSON.stringify({schemaVersion:3,coins:73,settings:{language:'en-US',fullscreen:false,quality:'low'},progress:{unlocked:214,records:{1:{time:20,deaths:0,clears:1}},practice:{}}}));
   localStorage.setItem('infinity-castle-elements-solo-v1',JSON.stringify({schemaVersion:3,level:20,role:'earth',deaths:9,completed:false}));
  }
 },base);
 await context.route('https://api.github.com/**',r=>r.fulfill({status:200,contentType:'application/json',body:r.request().url().includes('latest')?'{}':'[]'}));await context.route('https://cdn.socket.io/**',async r=>r.fulfill({response:await context.request.get(base+'/socket.io/socket.io.js')}));
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/?menu');await p.waitForFunction(()=>!!window.ICESoloUI);
 assert.equal(await p.evaluate(()=>profile.schemaVersion),4);assert.equal(await p.evaluate(()=>profile.coins),73);assert.equal(await p.evaluate(()=>profile.solo.mastery.earth.xp),0);
 await p.locator('#menuSingleBtn').click();assert.equal(await p.locator('#ngplusBtn').isDisabled(),true);await p.locator('#masteryBtn').click();assert.equal((await p.locator('#expeditionModal').innerText()).includes('Campanha'),false);assert.equal(await p.locator('#masteryLooks button:disabled').count(),3);await p.locator('#ghostEnabled').uncheck();await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>document.activeElement.id),'masteryBtn');
 await p.reload();await p.waitForFunction(()=>!!window.ICESoloUI);assert.equal(await p.evaluate(()=>profile.solo.showGhost),false);await p.locator('#menuSingleBtn').click();await p.locator('#continueSoloBtn').click();await p.waitForFunction(()=>player.onGround);assert.equal(await p.evaluate(()=>state.levelData.soloSpecial),true);
 // Real key input jumps onto the Earth route pedestal and activates the root bridge.
 await p.keyboard.down('d');await p.waitForFunction(()=>player.x>140);await p.keyboard.up('d');await p.keyboard.press('w');await p.waitForFunction(()=>player.onGround&&Math.abs(player.y+56-690)<2);await p.keyboard.press('Space');await p.waitForFunction(()=>state.expeditionRun.routeUnlocked);assert.ok(await p.locator('#soloObjectiveLines>span').count()>=3);
 const before=await p.evaluate(()=>profile.solo.mastery.earth.xp);
 await p.evaluate(()=>{const r=state.levelData.soloRoute;Object.assign(player,{x:r.badge.x,y:r.badge.y,vx:0,vy:0});player.update(1/60);});assert.equal(await p.evaluate(()=>profile.solo.mastery.earth.xp),before+4);
 await p.evaluate(()=>player.update(1/60));assert.equal(await p.evaluate(()=>profile.solo.mastery.earth.xp),before+4,'Route XP cannot be farmed by standing on a badge');
 const normalSave=await p.evaluate(()=>localStorage.getItem(SOLO_SAVE_KEY));
 // Practice records a ghost, without awarding mastery, coins or campaign progress.
 const mastery=await p.evaluate(()=>JSON.stringify(profile.solo.mastery));await p.evaluate(()=>{profile.solo.showGhost=true;saveProfile();ICEFeatures.start('practice',20,'earth');});
 await p.keyboard.down('d');await p.waitForTimeout(350);await p.keyboard.up('d');await p.evaluate(()=>ICEFeatures.finish());await p.locator('#journeyResultView').waitFor({state:'visible'});
 assert.equal(await p.evaluate(()=>JSON.stringify(profile.solo.mastery)),mastery);assert.equal(await p.evaluate(()=>localStorage.getItem(SOLO_SAVE_KEY)),normalSave);assert.ok(await p.evaluate(()=>Object.keys(profile.solo.ghosts).length));
 await p.locator('#activityRetryBtn').click();assert.ok(await p.evaluate(()=>!!state.expeditionGhost));await p.keyboard.press('Escape');await p.locator('#pauseMasteryBtn').click();await p.locator('#ghostEnabled').uncheck();assert.equal(await p.evaluate(()=>!!state.expeditionGhost),false);await p.locator('#expeditionCloseBtn').click();assert.equal(await p.evaluate(()=>state.paused),true);
 await p.evaluate(()=>{pauseToMainMenu();});await p.locator('#menuSingleBtn').click();await p.locator('#menuDailyBtn').click();await p.locator('#dailyPlayBtn').click();assert.equal(await p.evaluate(()=>!!state.levelData.soloSpecial),false);assert.equal(await p.locator('#soloObjectives').isVisible(),false);
 assert.equal(await p.evaluate(()=>JSON.stringify(profile.solo.mastery)),mastery);
 // A campaign guardian opens a persistent choice at the next region, with safe menu/reload recovery.
 await p.evaluate(()=>{showMainMenu();startSolo(true);state.level=100;startLevel(100);state.bossDefeated=true;completeSoloLevel();});await p.locator('#expeditionStoryModal').waitFor({state:'visible'});assert.equal(await p.evaluate(()=>state.paused),true);assert.equal(await p.evaluate(()=>profile.solo.story.pending),1);
 await p.locator('#storyLeaveBtn').click();await p.reload();await p.waitForFunction(()=>!!window.ICESoloUI);await p.locator('#menuSingleBtn').click();await p.locator('#continueSoloBtn').click();await p.locator('#expeditionStoryModal').waitFor({state:'visible'});await p.locator('#storyFreeBtn').click();assert.equal(await p.evaluate(()=>profile.solo.story.choices[1]),'free');assert.equal(await p.evaluate(()=>state.paused),false);
 // Original and NG+ save keys, records, story choices and practice unlocks remain separate.
 await p.evaluate(()=>{showMainMenu();const save=loadSoloSave();save.completed=true;save.level=1000;persistentSet(SOLO_SAVE_KEY,JSON.stringify(save));ICESoloUI.refresh();});
 const original=await p.evaluate(()=>localStorage.getItem(SOLO_SAVE_KEY)),records=await p.evaluate(()=>JSON.stringify(profile.progress));await p.locator('#menuSingleBtn').click();await p.locator('#ngplusBtn').click();assert.equal(await p.evaluate(()=>state.ngplus),true);assert.equal(await p.evaluate(()=>state.level),1);assert.equal(await p.evaluate(()=>state.levelData.ngplus),true);
 await p.evaluate(()=>completeSoloLevel());await p.waitForFunction(()=>state.level===2&&!state.soloTransition);assert.equal(await p.evaluate(()=>localStorage.getItem(SOLO_SAVE_KEY)),original);assert.equal(await p.evaluate(()=>JSON.stringify(profile.progress)),records);assert.ok(await p.evaluate(()=>profile.solo.ngProgress.records[1]));
 await p.evaluate(()=>{state.level=100;startLevel(100);state.bossDefeated=true;completeSoloLevel();});await p.locator('#expeditionStoryModal').waitFor({state:'visible'});await p.locator('#storySealBtn').click();assert.equal(await p.evaluate(()=>profile.solo.ngStory.choices[1]),'seal');assert.equal(await p.evaluate(()=>profile.solo.story.choices[1]),'free');
 await p.evaluate(()=>showMainMenu());await p.locator('#menuSingleBtn').click();await p.locator('#masteryBtn').click();await p.evaluate(()=>{profile.solo.mastery.earth.xp=360;ICESoloUI.refresh();});assert.equal(await p.locator('#masteryLooks button:disabled').count(),0);await p.locator('[data-look="3"]').click();assert.equal(await p.evaluate(()=>profile.solo.mastery.earth.look),3);await p.locator('#expeditionCloseBtn').click();
 await p.reload();await p.waitForFunction(()=>!!window.ICESoloUI);assert.equal(await p.evaluate(()=>profile.solo.mastery.earth.look),3);assert.equal(await p.evaluate(()=>profile.solo.story.choices[1]),'free');assert.equal(await p.evaluate(()=>profile.solo.ngStory.choices[1]),'seal');assert.deepEqual(errors,[]);
 console.log('PASS: legacy migration, live keyboard route unlock, one-time route XP, practice/daily isolation, best-run ghost toggle, cosmetic unlock/equip, persistent narrative choices with menu/reload recovery and independent NG+ saves/records/story.');
}finally{await browser?.close();io.disconnectSockets(true);await new Promise(r=>io.close(r));fs.rmSync(directory,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
