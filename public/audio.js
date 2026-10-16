(function(root){
  'use strict';
  function create(){
    let ctx=null,master=null,music=null,sfx=null,noise=null,nextBeat=0,beat=0,enabled=false,theme='explore';
    let config={master: .7,music:.24,sfx:.7,muted:false};const voices=new Set();
    const gain=(v,fallback)=>Number.isFinite(Number(v))?Math.max(0,Math.min(1,Number(v))):fallback;
    function configure(raw={}){
      raw=raw&&typeof raw==='object'?raw:{};
      config={master:gain(raw.master,.7),music:gain(raw.music,.24),sfx:gain(raw.sfx,.7),muted:!!raw.muted};
      if(ctx){master.gain.setTargetAtTime(config.muted?0:config.master,ctx.currentTime,.03);sfx.gain.setTargetAtTime(config.sfx,ctx.currentTime,.03);music.gain.setTargetAtTime(enabled?config.music:0,ctx.currentTime,.08);}
    }
    function unlock(){
      try{
        if(!ctx){const AC=root.AudioContext||root.webkitAudioContext;if(!AC)return;
          ctx=new AC();master=ctx.createGain();music=ctx.createGain();sfx=ctx.createGain();music.connect(master);sfx.connect(master);master.connect(ctx.destination);
          noise=ctx.createBuffer(1,ctx.sampleRate*.35,ctx.sampleRate);const data=noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length);
          configure(config);
        }
        const resumed=ctx.resume();resumed?.catch?.(()=>{});
      }catch{ctx=null;}
    }
    function note(freq,duration,bus,volume=.1,type='sine',start=ctx?.currentTime||0,endFreq=null){
      if(!ctx||ctx.state!=='running'||voices.size>=24)return;
      const osc=ctx.createOscillator(),env=ctx.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,start);
      if(endFreq)osc.frequency.exponentialRampToValueAtTime(Math.max(20,endFreq),start+duration);
      env.gain.setValueAtTime(.0001,start);env.gain.exponentialRampToValueAtTime(Math.max(.001,volume),start+.012);env.gain.exponentialRampToValueAtTime(.0001,start+duration);
      osc.connect(env);env.connect(bus);voices.add(osc);osc.onended=()=>{voices.delete(osc);osc.disconnect();env.disconnect();};osc.start(start);osc.stop(start+duration+.02);
    }
    function hiss(pitch=1000,volume=.1){
      if(!ctx||ctx.state!=='running'||voices.size>=24)return;
      const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),env=ctx.createGain();source.buffer=noise;filter.type='bandpass';filter.frequency.value=pitch;filter.Q.value=.8;
      env.gain.setValueAtTime(volume,ctx.currentTime);env.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.22);
      source.connect(filter);filter.connect(env);env.connect(sfx);voices.add(source);source.onended=()=>{voices.delete(source);source.disconnect();filter.disconnect();env.disconnect();};source.start();source.stop(ctx.currentTime+.25);
    }
    function play(event,role='earth'){
      if(!ctx||config.muted||config.sfx===0)return;
      const f={earth:110,air:660,light:880,darkness:165}[role]||220;
      if(event==='ability'){
        note(f,.5,sfx,.14,role==='darkness'?'sawtooth':role==='earth'?'triangle':'sine',ctx.currentTime,f*1.5);
        if(role==='air')hiss(1700,.12);if(role==='light')note(f*1.5,.7,sfx,.07,'sine',ctx.currentTime+.06);
      }else if(event==='jump')note(f*.8,.16,sfx,.07,'sine',ctx.currentTime,f*1.4);
      else if(event==='land')hiss(role==='earth'?180:650,.06);
      else if(event==='trap'){hiss(600,.08);note(95,.18,sfx,.09,'triangle',ctx.currentTime,38);}
      else if(event==='death'){note(230,.45,sfx,.12,'triangle',ctx.currentTime,48);hiss(350,.06);}
      else if(event==='complete'){for(let i=0;i<3;i++)note([523,659,784][i],.45,sfx,.08,'sine',ctx.currentTime+i*.09);}
      else note(f,.1,sfx,.05);
    }
    function update(frame){
      const active=!!frame.active,newTheme=frame.theme||'explore';
      if(!ctx)return;
      if(active!==enabled){enabled=active;music.gain.setTargetAtTime(enabled?config.music:0,ctx.currentTime,.08);nextBeat=ctx.currentTime+.06;}
      if(newTheme!==theme){theme=newTheme;nextBeat=ctx.currentTime+.06;beat=0;}
      if(!active||config.muted||config.music===0||ctx.state!=='running')return;
      const bpm=theme==='chase'?138:theme==='boss'?112:76,step=60/bpm/2;
      if(nextBeat<ctx.currentTime)nextBeat=ctx.currentTime+.02;
      while(nextBeat<ctx.currentTime+.12){
        const scale=[146.83,174.61,220,261.63,293.66,349.23,440,392];
        const seq=theme==='explore'?[0,2,4,1,0,3,2,1]:[0,0,2,1,4,2,1,3];
        note(scale[seq[beat%8]]*(beat%4===0?.5:1),step*1.8,music,.065,'sine',nextBeat);
        if(theme!=='explore'&&beat%2===0)note(62,.11,music,.06,'triangle',nextBeat,30);
        beat++;nextBeat+=step;
      }
    }
    function suspend(){enabled=false;if(ctx){music.gain.setTargetAtTime(0,ctx.currentTime,.03);ctx.suspend()?.catch?.(()=>{});}}
    return {unlock,configure,play,update,suspend,stats:()=>({voices:voices.size,unlocked:!!ctx,theme,enabled,config:{...config}})};
  }
  root.ICEAudio={create};
})(typeof window==='undefined'?globalThis:window);
