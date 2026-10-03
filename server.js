const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;
const MAX_LEVEL = 1000;
const DEATH_REWARD_COINS = 5;
const ELEMENTS = new Set(['earth', 'air', 'light', 'darkness']);
const ELEMENT_ORDER = ['earth', 'air', 'light', 'darkness'];
const MULTIPLAYER_ONLY = process.env.MULTIPLAYER_ONLY === '1';
const ROOM_MODES = {
  multiplayer: { maxPlayers: 2 },
  chaos: { maxPlayers: 4 }
};

app.use(express.json());
if (!MULTIPLAYER_ONLY) app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

app.get('/health', (_req, res) => res.status(200).json({
  ok: true,
  service: 'infinity-castle-elements-multiplayer',
  version: '0.0.5',
  rooms: rooms.size,
  modes: { multiplayer: 2, chaos: 4 }
}));

app.get('/multiplayer/status', (_req, res) => res.json({
  online: true,
  version: '0.0.5',
  activeRooms: rooms.size,
  maxPlayersPerRoom: 4,
  modes: { multiplayer: 2, chaos: 4 }
}));

app.get('/auth/chatgpt/status', (_req, res) => {
  res.json({ enabled: false, reason: 'Requires an approved Sign in with ChatGPT integration/client configuration for this app.' });
});

function makeRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}
function uniqueCode(){ let code=makeRoomCode(); while(rooms.has(code)) code=makeRoomCode(); return code; }
function normalizeElement(value) {
  const element = String(value || '').trim().toLowerCase();
  return ELEMENTS.has(element) ? element : 'earth';
}
function normalizeMode(value) {
  return value === 'chaos' ? 'chaos' : 'multiplayer';
}
function publicRoom(room) {
  return {
    code: room.code,
    mode: room.mode,
    maxPlayers: room.maxPlayers,
    level: room.level,
    deaths: room.deaths,
    chaosSeals: [...room.chaosSeals],
    trapStates: [...room.trapStates.entries()].map(([key,activatedAt])=>({key,activatedAt})),
    players: [...room.players.values()].map(p => ({
      id:p.id, name:p.name, role:p.role, slot:p.slot, ready:p.ready, atSeal:p.atSeal
    }))
  };
}
function emitRoom(room){ io.to(room.code).emit('room-state', publicRoom(room)); }
function resetGoalFlags(room){ for(const p of room.players.values()) p.atGoal=false; }
function clearBossTimer(room){ if(room.bossTimer) clearTimeout(room.bossTimer); room.bossTimer=null; }
function resetBossState(room){
  clearBossTimer(room);room.bossDefeated=false;
  for(const p of room.players.values()) p.atRune=false;
}
function resetChaosState(room){
  room.chaosSeals.clear();
  for(const p of room.players.values()) p.atSeal=false;
}
function resetAttemptState(room){
  resetGoalFlags(room);
  resetBossState(room);
  resetChaosState(room);
  room.trapStates.clear();
}
function bossRequiredSeconds(level,mode){
  const tier=level/100;
  const base=2.1+Math.min(1.9,tier*.16);
  return mode==='chaos' ? base+0.7 : base;
}
function maybeStartBossCharge(room){
  if(room.level%100!==0||room.bossDefeated||room.bossTimer||room.players.size!==room.maxPlayers)return;
  if(![...room.players.values()].every(p=>p.atRune))return;
  const level=room.level;
  room.bossTimer=setTimeout(()=>{
    room.bossTimer=null;
    if(rooms.get(room.code)!==room||room.level!==level||room.players.size!==room.maxPlayers)return;
    if(![...room.players.values()].every(p=>p.atRune))return;
    room.bossDefeated=true;
    io.to(room.code).emit('boss-defeated',{level,mode:room.mode});
  },Math.round(bossRequiredSeconds(level,room.mode)*1000));
}

io.on('connection', socket => {
  socket.on('create-room', ({name,element,resumeLevel,resumeDeaths,mode}={}, ack=()=>{}) => {
    const roomMode=normalizeMode(mode);
    const code=uniqueCode();
    const level=Math.max(1,Math.min(MAX_LEVEL,Number(resumeLevel)||1));
    const deaths=Math.max(0,Math.min(999999,Number(resumeDeaths)||0));
    const room={
      code,
      mode:roomMode,
      maxPlayers:ROOM_MODES[roomMode].maxPlayers,
      level,
      deaths,
      players:new Map(),
      resetting:false,
      bossDefeated:false,
      bossTimer:null,
      chaosSeals:new Set(),
      trapStates:new Map()
    };
    rooms.set(code,room);
    joinRoom(socket,room,name,element,ack);
  });

  socket.on('join-room', ({code,name,element,mode}={}, ack=()=>{}) => {
    const normalized=String(code||'').trim().toUpperCase(),room=rooms.get(normalized);
    if(!room)return ack({ok:false,error:'Sala não encontrada.'});
    if(mode&&normalizeMode(mode)!==room.mode)return ack({ok:false,error:room.mode==='chaos'?'Esse código pertence a uma sala do Modo Caos.':'Esse código pertence ao multiplayer de 2 jogadores.'});
    if(room.players.size>=room.maxPlayers)return ack({ok:false,error:`Essa sala já tem ${room.maxPlayers} jogadores.`});
    joinRoom(socket,room,name,element,ack);
  });

  socket.on('ready', ({ready}={}) => {
    const room=getSocketRoom(socket);if(!room)return;
    const player=room.players.get(socket.id);if(!player)return;
    player.ready=Boolean(ready);emitRoom(room);
    if(room.players.size===room.maxPlayers&&[...room.players.values()].every(p=>p.ready)){
      room.resetting=false;
      resetAttemptState(room);
      io.to(room.code).emit('start-level',{level:room.level,deaths:room.deaths,mode:room.mode});
      emitRoom(room);
    }
  });

  socket.on('player-state', payload => {
    const room=getSocketRoom(socket);if(!room||!payload)return;
    socket.to(room.code).emit('remote-state',{id:socket.id,...payload});
  });

  socket.on('enemy-defeated', ({id,level}={}) => {
    const room=getSocketRoom(socket);if(!room||Number(level)!==room.level||!Number.isFinite(Number(id)))return;
    socket.to(room.code).emit('enemy-defeated',{id:Number(id),level:room.level});
  });

  socket.on('trap-trigger', ({level,key}={}) => {
    const room=getSocketRoom(socket);if(!room||Number(level)!==room.level)return;
    const trapKey=String(key||'').slice(0,64);
    if(!/^(?:f|p|as|br|vp|ch|fb|sw|fg)\d+$|^movingExit$/.test(trapKey))return;
    if(room.trapStates.has(trapKey))return;
    const activatedAt=Date.now();
    room.trapStates.set(trapKey,activatedAt);
    io.to(room.code).emit('trap-trigger',{level:room.level,key:trapKey,activatedAt});
    emitRoom(room);
  });

  socket.on('chaos-seal-activate', ({level}={}) => {
    const room=getSocketRoom(socket);
    if(!room||room.mode!=='chaos'||room.level%100===0||Number(level)!==room.level)return;
    const player=room.players.get(socket.id);if(!player||player.atSeal)return;
    player.atSeal=true;
    room.chaosSeals.add(player.role);
    io.to(room.code).emit('chaos-seal-activated',{role:player.role,level:room.level,count:room.chaosSeals.size});
    emitRoom(room);
    if(room.chaosSeals.size===4)io.to(room.code).emit('chaos-unlocked',{level:room.level});
  });

  socket.on('rune-state', ({atRune,level}={}) => {
    const room=getSocketRoom(socket);if(!room||room.level%100!==0||Number(level)!==room.level||room.bossDefeated)return;
    const player=room.players.get(socket.id);if(!player)return;
    player.atRune=Boolean(atRune);
    if(!player.atRune)clearBossTimer(room);else maybeStartBossCharge(room);
  });

  socket.on('goal-state', ({atGoal}={}) => {
    const room=getSocketRoom(socket);if(!room)return;
    const player=room.players.get(socket.id);if(!player)return;
    if(room.level%100===0&&!room.bossDefeated){player.atGoal=false;return;}
    if(room.mode==='chaos'&&room.level%100!==0&&room.chaosSeals.size<4){player.atGoal=false;return;}
    player.atGoal=Boolean(atGoal);
    if(room.players.size===room.maxPlayers&&[...room.players.values()].every(p=>p.atGoal)){
      resetGoalFlags(room);
      const completedLevel=room.level,finished=completedLevel>=MAX_LEVEL;
      if(!finished){room.level+=1;resetAttemptState(room);}
      io.to(room.code).emit('level-complete',{level:room.level,finished,completedLevel,mode:room.mode});
      if(!finished)setTimeout(()=>io.to(room.code).emit('start-level',{level:room.level,deaths:room.deaths,mode:room.mode}),900);
      else io.to(room.code).emit('game-finished',{deaths:room.deaths,mode:room.mode});
      emitRoom(room);
    }
  });

  socket.on('player-death', () => {
    const room=getSocketRoom(socket);if(!room||room.resetting)return;
    room.resetting=true;room.deaths+=1;resetAttemptState(room);
    socket.emit('death-reward',{coins:DEATH_REWARD_COINS});
    io.to(room.code).emit('reset-level',{deaths:room.deaths,mode:room.mode});emitRoom(room);
    setTimeout(()=>{if(rooms.get(room.code)===room)room.resetting=false;},300);
  });

  socket.on('restart-level', () => {
    const room=getSocketRoom(socket);if(!room||room.resetting)return;
    room.resetting=true;resetAttemptState(room);
    io.to(room.code).emit('reset-level',{deaths:room.deaths,manual:true,mode:room.mode});emitRoom(room);
    setTimeout(()=>{if(rooms.get(room.code)===room)room.resetting=false;},300);
  });

  socket.on('disconnect',()=>{
    const room=getSocketRoom(socket);if(!room)return;
    room.players.delete(socket.id);socket.leave(room.code);
    if(room.players.size===0)rooms.delete(room.code);
    else{
      for(const p of room.players.values()){p.ready=false;p.atGoal=false;p.atRune=false;p.atSeal=false;}
      room.resetting=false;resetAttemptState(room);emitRoom(room);
      io.to(room.code).emit('partner-left',{
        mode:room.mode,
        maxPlayers:room.maxPlayers,
        currentPlayers:room.players.size
      });
    }
  });
});

function getSocketRoom(socket){const code=socket.data.roomCode;return code?rooms.get(code):null;}
function joinRoom(socket,room,rawName,requestedElement,ack){
  if(socket.data.roomCode)return ack({ok:false,error:'Você já está em uma sala.'});
  const name=String(rawName||'Jogador').trim().slice(0,18)||'Jogador';
  const role=normalizeElement(requestedElement);
  if(room.mode==='chaos'){
    const usedRoles=new Set([...room.players.values()].map(p=>p.role));
    if(usedRoles.has(role))return ack({ok:false,error:'Esse elemento já está ocupado no Modo Caos. Escolha outro dos quatro elementos.'});
  }
  const usedSlots=new Set([...room.players.values()].map(p=>p.slot));
  let slot=0;while(usedSlots.has(slot)&&slot<room.maxPlayers)slot++;
  const player={id:socket.id,name,role,slot,ready:false,atGoal:false,atRune:false,atSeal:false};
  room.players.set(socket.id,player);socket.data.roomCode=room.code;socket.join(room.code);
  ack({
    ok:true,
    code:room.code,
    mode:room.mode,
    maxPlayers:room.maxPlayers,
    role,slot,id:socket.id,level:room.level,deaths:room.deaths
  });
  emitRoom(room);
}

function startServer(port = PORT, host = '0.0.0.0') {
  if (server.listening) return server;
  server.listen(port, host, () => {
    const addr = server.address();
    const actualPort = typeof addr === 'object' && addr ? addr.port : port;
    console.log(`Infinity Castle Elements 0.0.5 multiplayer server listening on 0.0.0.0:${actualPort}`);
  });
  return server;
}

if (require.main === module) startServer(PORT, '0.0.0.0');

module.exports = { app, server, io, startServer };
