/* Deterministic input replay used by the browser and the ranking validator. */
(function(root){
  'use strict';
  const STEP=1000/60,BASE=10000,MAX_FRAMES=36000;
  function create(engine,spec,{record=true}={}){
    let frame=0,deaths=0,finished=false,respawn=0,stopped=false;const inputs=[];
    const run={
      get now(){return BASE+frame*STEP;},get frames(){return frame;},get deaths(){return deaths;},get complete(){return finished;},get stopped(){return stopped;},get time(){return frame/60;},get spec(){return spec;},
      step(mask){
        if(finished||stopped)return false;
        if(frame>=MAX_FRAMES){stopped=true;return false;}
        mask=Number(mask)&31;frame++;
        if(record){const last=inputs[inputs.length-1];if(last&&last[1]===mask)last[0]++;else inputs.push([1,mask]);}
        engine.clock(run.now);
        if(respawn){if(frame>=respawn){respawn=0;engine.reset(spec,run);}return true;}
        if(mask&16){run.die();return true;}
        engine.input(mask);
        if(mask&8)engine.ability();
        engine.step(1/60);return true;
      },
      die(){if(finished||respawn||stopped)return;deaths++;respawn=frame+36;engine.dead(deaths);},
      finish(){if(finished||respawn||stopped)return false;finished=true;engine.finish?.(run);return true;},
      replay(){return inputs.map(item=>[...item]);}
    };
    engine.clock(BASE);engine.reset(spec,run);return run;
  }
  function replayShape(input){
    if(!Array.isArray(input)||!input.length||input.length>18000)throw Error('INVALID_REPLAY');
    let frames=0;for(const item of input){if(!Array.isArray(item)||item.length!==2||!Number.isInteger(item[0])||item[0]<1||!Number.isInteger(item[1])||item[1]<0||item[1]>31)throw Error('INVALID_REPLAY');frames+=item[0];if(frames>MAX_FRAMES)throw Error('INVALID_REPLAY');}
    return frames;
  }
  root.ICEDailyRun={create,replayShape,STEP,BASE,MAX_FRAMES};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.ICEDailyRun;
})(typeof window==='undefined'?globalThis:window);
