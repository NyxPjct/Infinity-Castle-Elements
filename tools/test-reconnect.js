'use strict';
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {io}=require('socket.io-client');
const {server,startServer,MULTIPLAYER_PROTOCOL}=require('../server');
const clients=[];
const event=(s,name,timeout=5000)=>new Promise((resolve,reject)=>{const t=setTimeout(()=>{s.off(name,cb);reject(Error('Timeout: '+name));},timeout);const cb=v=>{clearTimeout(t);resolve(v);};s.once(name,cb);});
const ack=(s,name,payload)=>new Promise((resolve,reject)=>s.timeout(4000).emit(name,payload,(e,r)=>e?reject(e):resolve(r)));
async function connect(url){const s=io(url,{transports:['websocket'],reconnection:false,forceNew:true});clients.push(s);await event(s,'connect');return s;}
(async()=>{
 try{
  startServer(0,'127.0.0.1');if(!server.listening)await once(server,'listening');const url='http://127.0.0.1:'+server.address().port;
  for(const mode of ['multiplayer','chaos']){
   const count=mode==='chaos'?4:2,peers=[];
   for(let i=0;i<count;i++)peers.push(await connect(url));
   const created=await ack(peers[0],'create-room',{name:'Host',mode,element:'earth',resumeLevel:41,protocol:MULTIPLAYER_PROTOCOL});assert.ok(created.token);
   let joined;
   for(let i=1;i<count;i++)joined=await ack(peers[i],'join-room',{code:created.code,name:'Guest',mode,element:['earth','air','light','darkness'][i],protocol:MULTIPLAYER_PROTOCOL});
   const begun=event(peers[0],'start-level');peers.forEach(s=>s.emit('ready',{ready:true}));await begun;
   const leaving=peers[count-1],snapshot=event(peers[0],'remote-state');
   leaving.emit('player-state',{id:'spoof',x:611,y:644,vx:40,vy:-50,onGround:false,level:41,abilityRemaining:700,abilityCooldownRemaining:5700});
   const remote=await snapshot;assert.equal(remote.id,leaving.id);
   const trap=event(peers[0],'trap-trigger');leaving.emit('trap-trigger',{level:41,key:'as4242'});await trap;
   if(mode==='chaos'){const seal=event(peers[0],'chaos-seal-activated');leaving.emit('chaos-seal-activate',{level:41});await seal;}
   const paused=event(peers[0],'session-paused');leaving.disconnect();const waiting=await paused;
   assert.ok(waiting.room.paused);assert.ok(waiting.until-Date.now()>29000);assert.equal(JSON.stringify(waiting.room).includes(joined.token),false,'Public snapshots must not expose seat tokens');
   const intruder=await connect(url);
   assert.equal((await ack(intruder,'join-room',{code:created.code,mode,element:'air',protocol:MULTIPLAYER_PROTOCOL})).ok,false,'Reserved seats must not be stolen');
   assert.equal((await ack(intruder,'resume-room',{code:created.code,token:'invalid',protocol:MULTIPLAYER_PROTOCOL})).ok,false);
   const resumedEvent=event(peers[0],'session-resumed');
   const resumed=await ack(intruder,'resume-room',{code:created.code,token:joined.token,protocol:MULTIPLAYER_PROTOCOL});
   assert.equal(resumed.ok,true);assert.equal(resumed.slot,joined.slot);assert.equal(resumed.role,joined.role);assert.equal(resumed.level,41);assert.equal(resumed.deaths,0);
   const own=resumed.room.players.find(p=>p.id===resumed.id);assert.equal(own.state.x,611);assert.equal(own.state.abilityCooldownRemaining,5700);assert.ok(resumed.room.trapStates.some(t=>t.key==='as4242'));
   if(mode==='chaos')assert.ok(resumed.room.chaosSeals.includes(joined.role));
   assert.equal((await resumedEvent).room.paused,false);
   const left=event(peers[0],'partner-left');intruder.emit('leave-room');await left;
   assert.equal((await ack(intruder,'join-room',{code:created.code,mode,element:joined.role,protocol:MULTIPLAYER_PROTOCOL})).ok,true,'Leaving intentionally frees the seat immediately');
   for(const s of [...peers,intruder])s.emit('leave-room');
  }
  const host=await connect(url),guest=await connect(url),replacement=await connect(url);
  const room=await ack(host,'create-room',{element:'earth',protocol:MULTIPLAYER_PROTOCOL});
  const seat=await ack(guest,'join-room',{code:room.code,element:'air',protocol:MULTIPLAYER_PROTOCOL});
  const expired=event(host,'partner-left',35000);guest.disconnect();await expired;
  assert.equal((await ack(replacement,'resume-room',{code:room.code,token:seat.token,protocol:MULTIPLAYER_PROTOCOL})).ok,false,'Expired tokens cannot restore a seat');
  assert.equal((await ack(replacement,'join-room',{code:room.code,element:'air',protocol:MULTIPLAYER_PROTOCOL})).ok,true,'The slot is available after 30 seconds');
  console.log('Reconnect: PASS — 2P/4P positions, roles, cooldowns, traps, seals, private tokens, explicit leave and real 30-second expiry.');
 }finally{for(const s of clients)s.close();if(server.listening)await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
