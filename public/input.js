(function(root){
  'use strict';
  const DEFAULTS={left:['KeyA','ArrowLeft'],right:['KeyD','ArrowRight'],jump:['KeyW','ArrowUp'],ability:['Space'],restart:['KeyR']};
  const TOUCH={left:{x:7,y:86,size:72},right:{x:17,y:86,size:72},jump:{x:82,y:86,size:72},ability:{x:93,y:86,size:88}};
  const valid=code=>typeof code==='string'&&/^(Key[A-Z]|Digit[0-9]|Arrow(Left|Right|Up|Down)|Space|ShiftLeft|ShiftRight|ControlLeft|ControlRight|AltLeft|AltRight|[A-Z][a-z]+)$/.test(code)&&!['Escape','Tab','Enter','CapsLock','MetaLeft','MetaRight'].includes(code);
  function bindings(raw={}){
    raw=raw&&typeof raw==='object'?raw:{};
    const out={},used=new Set();
    for(const action of Object.keys(DEFAULTS)){
      const wanted=Array.isArray(raw[action])?raw[action]:DEFAULTS[action];
      let list=wanted.filter(c=>valid(c)&&!used.has(c)).slice(0,2);
      if(!list.length)list=DEFAULTS[action].filter(c=>!used.has(c));
      if(!list.length)list=['Key'+['Z','X','C','V','B','N'].find(c=>!used.has('Key'+c))];
      out[action]=list;list.forEach(c=>used.add(c));
    }
    return out;
  }
  const bounded=(n,a,b,fallback)=>Number.isFinite(Number(n))?Math.max(a,Math.min(b,Number(n))):fallback;
  function touch(raw={}){raw=raw&&typeof raw==='object'?raw:{};return Object.fromEntries(Object.entries(TOUCH).map(([key,d])=>[key,{x:bounded(raw[key]?.x,0,100,d.x),y:bounded(raw[key]?.y,0,100,d.y),size:bounded(raw[key]?.size,44,120,d.size)}]));}
  function create(raw){
    let map=bindings(raw),jumpUntil=0;const held=new Set(),touchHeld=new Set(),now=()=>root.performance?.now?.()??Date.now();
    return {
      configure(raw){const next=bindings(raw);if(JSON.stringify(next)!==JSON.stringify(map)){map=next;held.clear();}},
      key(code,down){if(down)held.add(code);else held.delete(code);const action=Object.keys(map).find(a=>map[a].includes(code));if(down&&action==='jump')jumpUntil=now()+140;return action;},
      down(action){return (action==='jump'&&jumpUntil>now())||touchHeld.has(action)||map[action]?.some(c=>held.has(c))||false;},
      touch(action,down){if(down)touchHeld.add(action);else touchHeld.delete(action);if(down&&action==='jump')jumpUntil=now()+140;},
      consume(action){if(action==='jump')jumpUntil=0;},
      clear(){held.clear();touchHeld.clear();jumpUntil=0;},
      bind(action,code){if(!map[action]||!valid(code)||Object.keys(map).some(a=>a!==action&&map[a].includes(code)))return false;map[action]=[code];held.clear();return true;},
      get bindings(){return Object.fromEntries(Object.entries(map).map(([k,v])=>[k,[...v]]));}
    };
  }
  function label(code){return code==='Space'?'␣':code.replace(/^Key|^Digit/,'').replace('ArrowLeft','←').replace('ArrowRight','→').replace('ArrowUp','↑').replace('ArrowDown','↓');}
  root.ICEControls={create,bindings,touch,label,defaults:DEFAULTS};
})(typeof window==='undefined'?globalThis:window);
