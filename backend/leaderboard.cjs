'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Worker}=require('node:worker_threads');
const {replayShape}=require('../public/daily-run');
require('../public/journey');
const daily=globalThis.ICEJourney.daily;
function createLeaderboard({directory,clock=()=>Date.now(),validate=validateReplay}={}){
  directory=directory||process.env.ICE_DATA_DIR||process.env.RAILWAY_VOLUME_MOUNT_PATH||path.resolve(__dirname,'../data');
  fs.mkdirSync(directory,{recursive:true});const file=path.join(directory,'daily-leaderboard.json');
  let boards={};if(fs.existsSync(file)){const data=JSON.parse(fs.readFileSync(file,'utf8'));if(data.schema!==1||!data.boards||typeof data.boards!=='object')throw Error('Invalid leaderboard storage; preserve the file and restore a valid backup.');boards=data.boards;}
  const sessions=new Map(),limits=new Map();let active=0;
  const id=value=>crypto.createHash('sha256').update(value).digest('hex');
  const identity=secret=>typeof secret==='string'&&/^[a-f0-9]{64}$/.test(secret)?id(secret):null;
  const better=(a,b)=>a.deaths-b.deaths||a.time-b.time||a.createdAt-b.createdAt;
  function quota(key,max){const now=clock(),old=limits.get(key);if(!old||now-old.start>=60000){limits.set(key,{start:now,count:1});return true;}return ++old.count<=max;}
  function clean(){const now=clock();for(const [token,s] of sessions)if(now-s.startedAt>1800000)sessions.delete(token);for(const [key,v] of limits)if(now-v.start>120000)limits.delete(key);}
  function status(){return {available:true,storage:'file',volumeConfigured:!!process.env.RAILWAY_VOLUME_MOUNT_PATH,validation:'input-replay',maxSeconds:600};}
  function list(date=daily(new Date(clock())).date){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return {ok:false,code:'INVALID_DATE'};
    return {ok:true,date,entries:(boards[date]||[]).slice(0,100).map((entry,index)=>({rank:index+1,name:entry.name,time:entry.time,deaths:entry.deaths})),...status()};
  }
  function begin({secret,name}={},address='local'){
    clean();const player=identity(secret);if(!player)return {ok:false,code:'INVALID_IDENTITY'};
    if(limits.size>=4096)return {ok:false,code:'RATE_LIMIT'};
    if(!quota('start:'+player,6)||!quota('ip:'+address,100)||sessions.size>=256)return {ok:false,code:'RATE_LIMIT'};
    name=String(name||'Jogador').replace(/[\p{C}\r\n]/gu,'').trim().slice(0,24)||'Jogador';
    for(const [token,session] of sessions)if(session.player===player&&!session.busy)sessions.delete(token);
    const token=crypto.randomBytes(32).toString('hex'),spec=daily(new Date(clock()));
    sessions.set(token,{player,name,spec,startedAt:clock(),busy:false});return {ok:true,token,spec,...status()};
  }
  async function submit({secret,token,replay}={}){
    clean();const player=identity(secret),session=sessions.get(token);
    if(!player||!session||session.player!==player||session.busy)return {ok:false,code:'INVALID_SESSION'};
    let frames;try{frames=replayShape(replay);}catch{return {ok:false,code:'INVALID_REPLAY'};}
    if(active>=2||!quota('submit:'+player,5))return {ok:false,code:'RATE_LIMIT'};
    if(clock()-session.startedAt+500<frames*1000/60)return {ok:false,code:'IMPOSSIBLE_TIME'};
    session.busy=true;active++;
    try{
      const result=await validate(session.spec,replay);if(!result.ok)return {ok:false,code:result.code||'INVALID_REPLAY'};
      sessions.delete(token);
      const entry={player,name:session.name,time:result.frames/60,deaths:result.deaths,createdAt:clock(),level:session.spec.level,role:session.spec.role};
      const entries=[...(boards[session.spec.date]||[])],index=entries.findIndex(e=>e.player===player);
      if(index<0)entries.push(entry);else if(better(entry,entries[index])<0)entries[index]=entry;
      entries.sort(better);const updated={...boards,[session.spec.date]:entries.slice(0,200)};
      const dates=Object.keys(updated).sort();for(const day of dates.slice(0,Math.max(0,dates.length-60)))delete updated[day];
      const temporary=file+'.tmp';fs.writeFileSync(temporary,JSON.stringify({schema:1,boards:updated}));fs.renameSync(temporary,file);boards=updated;
      const rank=boards[session.spec.date].findIndex(e=>e.player===player)+1;
      return {ok:true,rank:rank||null,time:entry.time,deaths:entry.deaths,board:list(session.spec.date)};
    }catch{return {ok:false,code:'RANKING_UNAVAILABLE'};}
    finally{active--;session.busy=false;}
  }
  return {begin,submit,list,status};
}
function validateReplay(spec,replay){
  return new Promise((resolve,reject)=>{
    const workerPath=path.join(__dirname,'daily-worker.cjs').replace(/app\.asar([/\\])/,'app.asar.unpacked$1');
    const worker=new Worker(workerPath,{workerData:{spec,replay},resourceLimits:{maxOldGenerationSizeMb:96}});let settled=false;
    const timer=setTimeout(()=>{worker.terminate();reject(Error('VALIDATION_TIMEOUT'));},10000);
    worker.once('message',result=>{settled=true;clearTimeout(timer);resolve(result);worker.terminate();});worker.once('error',error=>{settled=true;clearTimeout(timer);reject(error);});worker.once('exit',()=>{clearTimeout(timer);if(!settled)reject(Error('VALIDATOR_EXIT'));});
  });
}
module.exports={createLeaderboard,validateReplay};
