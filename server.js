const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 3000;
const MAX_LEVEL = 1000;
const ELEMENTS = new Set(['earth', 'air', 'light', 'darkness']);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/auth/chatgpt/status', (_req, res) => {
  res.json({ enabled: false, reason: 'Requires an approved Sign in with ChatGPT integration/client configuration for this app.' });
});

const rooms = new Map();

function makeRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}
function normalizeElement(value) {
  const element = String(value || '').trim().toLowerCase();
  return ELEMENTS.has(element) ? element : 'earth';
}
function publicRoom(room) {
  return {
    code: room.code, level: room.level, deaths: room.deaths,
    players: [...room.players.values()].map(p => ({ id:p.id, name:p.name, role:p.role, slot:p.slot, ready:p.ready }))
  };
}
function uniqueCode(){ let code=makeRoomCode(); while(rooms.has(code)) code=makeRoomCode(); return code; }
function emitRoom(room){ io.to(room.code).emit('room-state', publicRoom(room)); }
function resetGoalFlags(room){ for(const p of room.players.values()) p.atGoal=false; }
function clearBossTimer(room){ if(room.bossTimer) clearTimeout(room.bossTimer); room.bossTimer=null; }
function resetBossState(room){ clearBossTimer(room); room.bossDefeated=false; for(const p of room.players.values()) p.atRune=false; }
function bossRequiredSeconds(level){ const tier=level/100; return 2.1+Math.min(1.9,tier*.16); }
function maybeStartBossCharge(room){
  if(room.level%100!==0||room.bossDefeated||room.bossTimer||room.players.size!==2)return;
  if(![...room.players.values()].every(p=>p.atRune))return;
  const level=room.level;
  room.bossTimer=setTimeout(()=>{
    room.bossTimer=null;
    if(rooms.get(room.code)!==room||room.level!==level||room.players.size!==2)return;
    if(![...room.players.values()].every(p=>p.atRune))return;
    room.bossDefeated=true;io.to(room.code).emit('boss-defeated',{level});
  },Math.round(bossRequiredSeconds(level)*1000));
}

io.on('connection', socket => {
  socket.on('create-room', ({name,element}={}, ack=()=>{}) => {
    const code=uniqueCode();
    const room={code,level:1,deaths:0,players:new Map(),resetting:false,bossDefeated:false,bossTimer:null};
    rooms.set(code,room);joinRoom(socket,room,name,element,ack);
  });
  socket.on('join-room', ({code,name,element}={}, ack=()=>{}) => {
    const normalized=String(code||'').trim().toUpperCase(),room=rooms.get(normalized);
    if(!room)return ack({ok:false,error:'Sala não encontrada.'});
    if(room.players.size>=2)return ack({ok:false,error:'Essa sala já tem 2 jogadores.'});
    joinRoom(socket,room,name,element,ack);
  });
  socket.on('ready', ({ready}={}) => {
    const room=getSocketRoom(socket);if(!room)return;const player=room.players.get(socket.id);if(!player)return;
    player.ready=Boolean(ready);emitRoom(room);
    if(room.players.size===2&&[...room.players.values()].every(p=>p.ready)){
      room.resetting=false;resetGoalFlags(room);resetBossState(room);io.to(room.code).emit('start-level',{level:room.level,deaths:room.deaths});
    }
  });
  socket.on('player-state', payload => {
    const room=getSocketRoom(socket);if(!room||!payload)return;socket.to(room.code).emit('remote-state',{id:socket.id,...payload});
  });
  socket.on('enemy-defeated', ({id,level}={}) => {
    const room=getSocketRoom(socket);if(!room||Number(level)!==room.level||!Number.isFinite(Number(id)))return;
    socket.to(room.code).emit('enemy-defeated',{id:Number(id),level:room.level});
  });
  socket.on('rune-state', ({atRune,level}={}) => {
    const room=getSocketRoom(socket);if(!room||room.level%100!==0||Number(level)!==room.level||room.bossDefeated)return;
    const player=room.players.get(socket.id);if(!player)return;player.atRune=Boolean(atRune);
    if(!player.atRune)clearBossTimer(room);else maybeStartBossCharge(room);
  });
  socket.on('goal-state', ({atGoal}={}) => {
    const room=getSocketRoom(socket);if(!room)return;const player=room.players.get(socket.id);if(!player)return;
    if(room.level%100===0&&!room.bossDefeated){player.atGoal=false;return;}
    player.atGoal=Boolean(atGoal);
    if(room.players.size===2&&[...room.players.values()].every(p=>p.atGoal)){
      resetGoalFlags(room);const completedLevel=room.level,finished=completedLevel>=MAX_LEVEL;
      if(!finished){room.level+=1;resetBossState(room);}
      io.to(room.code).emit('level-complete',{level:room.level,finished,completedLevel});
      if(!finished)setTimeout(()=>io.to(room.code).emit('start-level',{level:room.level,deaths:room.deaths}),900);
      else io.to(room.code).emit('game-finished',{deaths:room.deaths});
      emitRoom(room);
    }
  });
  socket.on('player-death', () => {
    const room=getSocketRoom(socket);if(!room||room.resetting)return;room.resetting=true;room.deaths+=1;resetGoalFlags(room);resetBossState(room);
    io.to(room.code).emit('reset-level',{deaths:room.deaths});emitRoom(room);
    setTimeout(()=>{if(rooms.get(room.code)===room)room.resetting=false;},300);
  });
  socket.on('restart-level', () => {
    const room=getSocketRoom(socket);if(!room||room.resetting)return;room.resetting=true;resetGoalFlags(room);resetBossState(room);
    io.to(room.code).emit('reset-level',{deaths:room.deaths,manual:true});setTimeout(()=>{if(rooms.get(room.code)===room)room.resetting=false;},300);
  });
  socket.on('disconnect',()=>{
    const room=getSocketRoom(socket);if(!room)return;room.players.delete(socket.id);socket.leave(room.code);
    if(room.players.size===0)rooms.delete(room.code);else{
      const only=[...room.players.values()][0];if(only){only.ready=false;only.atGoal=false;only.atRune=false;}
      room.resetting=false;resetBossState(room);emitRoom(room);io.to(room.code).emit('partner-left');
    }
  });
});

function getSocketRoom(socket){const code=socket.data.roomCode;return code?rooms.get(code):null;}
function joinRoom(socket,room,rawName,requestedElement,ack){
  if(socket.data.roomCode)return ack({ok:false,error:'Você já está em uma sala.'});
  const name=String(rawName||'Jogador').trim().slice(0,18)||'Jogador',role=normalizeElement(requestedElement);
  const usedSlots=new Set([...room.players.values()].map(p=>p.slot)),slot=usedSlots.has(0)?1:0;
  const player={id:socket.id,name,role,slot,ready:false,atGoal:false,atRune:false};
  room.players.set(socket.id,player);socket.data.roomCode=room.code;socket.join(room.code);
  ack({ok:true,code:room.code,role,slot,id:socket.id,level:room.level});emitRoom(room);
}

function startServer(port = PORT, host) {
  if (server.listening) return server;
  server.listen(port, host, () => {
    const addr = server.address();
    const actualPort = typeof addr === 'object' && addr ? addr.port : port;
    console.log(`Infinity Castle Elements INSANITY 0.0 running on http://localhost:${actualPort}`);
  });
  return server;
}

if (require.main === module) startServer(PORT);

module.exports = { app, server, io, startServer };
