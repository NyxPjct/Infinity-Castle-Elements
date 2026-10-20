'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const {replayShape}=require('../public/daily-run');
const {createEngine}=require('./daily-engine.cjs');
try{
  const frames=replayShape(workerData.replay),engine=createEngine(workerData.spec);
  let steps=0;
  for(const [count,mask] of workerData.replay)for(let i=0;i<count;i++){
    engine.step(mask);steps++;
    if(engine.snapshot().complete&&steps!==frames)throw Error('INVALID_REPLAY');
  }
  const result=engine.snapshot();
  if(!result.complete||result.frames!==frames)throw Error('INCOMPLETE_RUN');
  parentPort.postMessage({ok:true,time:result.time,deaths:result.deaths,frames});
}catch(error){parentPort.postMessage({ok:false,code:String(error.message||'INVALID_REPLAY')});}
