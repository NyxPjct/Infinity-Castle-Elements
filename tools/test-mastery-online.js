'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events'),{io:connect}=require('socket.io-client');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ice-online-'));process.env.ICE_DATA_DIR=directory;
const {server,startServer,io,MULTIPLAYER_PROTOCOL:protocol}=require('../server');
const clients=[],sleep=ms=>new Promise(r=>setTimeout(r,ms));
function event(socket,name,predicate=()=>true,timeout=6000){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.off(name,handler);reject(Error('Timeout: '+name));},timeout);function handler(data){if(!predicate(data))return;clearTimeout(timer);socket.off(name,handler);resolve(data);}socket.on(name,handler);});}
const ack=(socket,name,payload={})=>new Promise((resolve,reject)=>socket.timeout(15000).emit(name,payload,(err,result)=>err?reject(err):resolve(result)));
(async()=>{try{
 startServer(0,'127.0.0.1');if(!server.listening)await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 async function client(){const s=connect(base,{transports:['websocket'],forceNew:true,reconnection:false});clients.push(s);await event(s,'connect');return s;}
 const party=await Promise.all(['earth','air','light','darkness'].map(client));
 const created=await ack(party[0],'create-room',{mode:'chaos',element:'earth',resumeLevel:100,protocol});assert.equal(created.ok,true);
 for(let i=1;i<4;i++)assert.equal((await ack(party[i],'join-room',{code:created.code,mode:'chaos',element:['earth','air','light','darkness'][i],protocol})).ok,true);
 const started=event(party[0],'start-level');party.forEach(s=>s.emit('ready',{ready:true}));await started;
 const combos=party.map(()=>[]);party.forEach((s,i)=>s.on('combo-created',data=>combos[i].push(data)));
 const state=(i,x,ability=true)=>party[i].emit('player-state',{level:100,x,y:734,onGround:true,ability,facing:1});
 state(0,100);state(1,1000);await sleep(150);assert.equal(combos[0].length,0,'Out-of-range powers do not combine');
 const platform=event(party[3],'combo-created',d=>d.combo.type==='earth-air');state(1,160);const built=await platform;assert.equal(built.combo.durationMs,4000);
 const veil=event(party[0],'combo-created',d=>d.combo.type==='light-darkness');state(2,220);state(3,260);await veil;await sleep(100);
 for(const list of combos){assert.equal(list.length,2);assert.deepEqual(list.map(c=>c.combo.id),combos[0].map(c=>c.combo.id));}
 const snapshot=event(party[0],'room-state',r=>r.trapStates.some(t=>t.key==='f9001'));party[0].emit('trap-trigger',{level:100,key:'f9001'});assert.equal((await snapshot).combos.length,2);
 let defeated=false;party[0].on('boss-defeated',()=>{defeated=true;});
 const stage2=event(party[0],'boss-phase',d=>d.phase===1);party.forEach(s=>s.emit('rune-state',{level:100,atRune:true}));await stage2;assert.equal(defeated,false);
 party[0].emit('rune-state',{level:100,atRune:false});await sleep(3100);assert.equal(defeated,false,'Leaving a rune prevents the next stage from completing');
 const afterExpiry=event(party[0],'room-state',r=>r.trapStates.some(t=>t.key==='f9002'));party[0].emit('trap-trigger',{level:100,key:'f9002'});const snap=await afterExpiry;assert.equal(snap.bossPhase,1);assert.equal(snap.combos.length,0);
 state(0,100);state(1,160);await sleep(100);assert.equal(combos[0].length,2,'Combo cooldown survives expiry');
 const stage3=event(party[0],'boss-phase',d=>d.phase===2),final=event(party[0],'boss-defeated',()=>true,10000);party[0].emit('rune-state',{level:100,atRune:true});await stage3;assert.equal(defeated,false);await final;assert.equal(defeated,true);
 const diagnostic=await ack(party[0],'diagnostics');assert.equal(diagnostic.serverVersion,require('../package.json').version);assert.equal(diagnostic.protocolVersion,protocol);assert.equal(diagnostic.ranking.validation,'input-replay');
 const before=await ack(party[0],'daily-board');assert.deepEqual(before.entries,[]);
 const run=await ack(party[0],'daily-start',{secret:'b'.repeat(64),name:'Network player',protocol});assert.equal(run.ok,true);assert.equal(run.spec.date,new Date().toISOString().slice(0,10));
 assert.equal((await ack(party[0],'daily-submit',{secret:'b'.repeat(64),token:run.token,replay:[[1,0]],protocol})).code,'INCOMPLETE_RUN');
 assert.equal((await ack(party[0],'daily-start',{secret:'b'.repeat(64),protocol:protocol-1})).code,'UPDATE_REQUIRED');
 assert.deepEqual((await (await fetch(base+'/daily/leaderboard')).json()).entries,[]);
 // Pause the server clock across a disconnect: combo lifetime and cooldown both freeze.
 const earth=await client(),air=await client(),room=await ack(earth,'create-room',{mode:'multiplayer',element:'earth',protocol});
 const seat=await ack(air,'join-room',{code:room.code,mode:'multiplayer',element:'air',protocol});
 const begin=event(earth,'start-level');earth.emit('ready',{ready:true});air.emit('ready',{ready:true});await begin;
 let comboCount=0;earth.on('combo-created',()=>comboCount++);const firstCombo=event(earth,'combo-created');
 earth.emit('player-state',{level:1,x:90,y:734,ability:true});air.emit('player-state',{level:1,x:140,y:734,ability:true});await firstCombo;
 const paused=event(earth,'room-state',r=>r.paused);air.close();await paused;
 const realNow=Date.now;let offset=15000;Date.now=()=>realNow()+offset;
 try{
  const returned=await client(),resumed=await ack(returned,'resume-room',{code:room.code,token:seat.token,protocol});assert.equal(resumed.ok,true);assert.equal(resumed.room.combos.length,1,'Active combo survives a long connection pause');
  offset+=5000;earth.emit('player-state',{level:1,x:90,y:734,ability:true});await sleep(100);assert.equal(comboCount,1,'Waiting disconnected cannot bypass the shared cooldown');
  offset+=8000;const nextCombo=event(earth,'combo-created');earth.emit('player-state',{level:1,x:90,y:734,ability:true});await nextCombo;assert.equal(comboCount,2);
 }finally{Date.now=realNow;}
 console.log('PASS: shared ranged combos, timed expiry/cooldown preserved across connection pauses, three authoritative boss stages with rune interruption, diagnostics, daily session transport and replay rejection.');
}finally{for(const s of clients){s.emit('leave-room');s.close();}io.disconnectSockets(true);await new Promise(resolve=>io.close(resolve));fs.rmSync(directory,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
