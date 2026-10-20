'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createEngine}=require('../backend/daily-engine.cjs');
const {createLeaderboard,validateReplay}=require('../backend/leaderboard.cjs');
const rules=require('../public/mechanics');
const fixture=require('./fixtures/daily-010-earth.json');
function ledge(wait){
  const engine=createEngine(fixture.spec);
  outer:for(const [count,mask] of fixture.replay)for(let i=0;i<count;i++){
    engine.step(mask);const p=engine.snapshot();
    if(p.x>1180&&p.onGround){for(let j=0;j<50;j++){engine.step(2);if(!engine.snapshot().onGround){for(let k=0;k<wait;k++)engine.step(0);engine.step(4);return engine.snapshot();}}break outer;}
  }
  throw Error('Fixture did not reach the ledge');
}
(async()=>{
  assert.ok(ledge(3).vy<0,'A late jump within 110 ms of leaving a ledge succeeds');
  assert.ok(ledge(8).vy>=0,'A jump outside the grace window cannot become an air jump');
  const q=rules.qualityController('auto');for(let i=0;i<120;i++)q.sample(30,10000);assert.equal(q.name,'low');
  for(let i=0;i<120;i++)q.sample(16,20000);assert.equal(q.name,'medium');q.set('high');for(let i=0;i<200;i++)q.sample(90,30000);assert.equal(q.name,'high');
  assert.equal(rules.bossPhase(1,2),0);assert.equal(rules.bossPhase(2,2),1);assert.equal(rules.bossPhase(6,2),2);
  assert.equal(rules.bossPlatforms(0).length,0);assert.equal(rules.bossPlatforms(1).length,2);assert.equal(rules.bossPlatforms(2).length,3);
  const platform=rules.combo('earth-air',{x:90,y:734},{x:140,y:734,facing:1},0,'platform');
  assert.equal(rules.comboPose(platform,4000),null);assert.ok(rules.comboPose(platform,1000).x>platform.x);assert.ok(rules.comboPose(platform,1000).y<platform.y);
  assert.equal(rules.combo('earth-air',{x:0,y:0},{x:1500,y:700},0,'far'),null);
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ice-ranking-'));let now=Date.parse(fixture.spec.date+'T12:00:00Z');
  try{
    const board=createLeaderboard({directory,clock:()=>now}),secret='a'.repeat(64);
    const run=board.begin({secret,name:'Player\nOne'});assert.equal(run.ok,true);assert.deepEqual(run.spec,fixture.spec);
    assert.equal((await board.submit({secret,token:run.token,replay:fixture.replay})).code,'IMPOSSIBLE_TIME');
    now+=8000;
    assert.equal((await board.submit({secret:'b'.repeat(64),token:run.token,replay:fixture.replay})).code,'INVALID_SESSION');
    assert.equal((await board.submit({secret,token:run.token,replay:[[36001,2]]})).code,'INVALID_REPLAY');
    assert.equal((await board.submit({secret,token:run.token,replay:[[1,32]]})).code,'INVALID_REPLAY');
    assert.equal((await board.submit({secret,token:run.token,replay:[[60,0]]})).code,'INCOMPLETE_RUN');
    const result=await board.submit({secret,token:run.token,replay:fixture.replay,time:.001,deaths:999});
    assert.equal(result.ok,true);assert.equal(result.time,7.6);assert.equal(result.deaths,0);assert.equal(result.rank,1);
    assert.equal((await board.submit({secret,token:run.token,replay:fixture.replay})).code,'INVALID_SESSION');
    const saved=createLeaderboard({directory,clock:()=>now}).list();assert.equal(saved.entries[0].time,7.6);assert.equal(saved.entries[0].name,'PlayerOne');assert.equal('player' in saved.entries[0],false);
    const second=board.begin({secret:'c'.repeat(64),name:'Second'});now+=10000;
    const withDeath=[[1,16],[36,0],...fixture.replay];
    const deathResult=await board.submit({secret:'c'.repeat(64),token:second.token,replay:withDeath,deaths:0});assert.equal(deathResult.ok,true);assert.equal(deathResult.deaths,1);assert.equal(deathResult.time,493/60);assert.equal(deathResult.rank,2);
    const expired=board.begin({secret:'d'.repeat(64),name:'Expired'});now+=1800001;assert.equal((await board.submit({secret:'d'.repeat(64),token:expired.token,replay:fixture.replay})).code,'INVALID_SESSION');
    const padded=await validateReplay(fixture.spec,[...fixture.replay,[1,0]]);assert.equal(padded.ok,false);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
  console.log('PASS: coyote-time boundaries, adaptive/manual quality, boss arenas, timed combo geometry, real completed input replay, forged scores, invalid/expired/reused tokens, deaths and elapsed-time validation, persistent ordered anonymous rankings.');
})().catch(error=>{console.error(error);process.exitCode=1;});
