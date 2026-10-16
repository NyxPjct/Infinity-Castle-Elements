'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const sandbox={};vm.createContext(sandbox);
for(const name of ['journey','input','audio'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/'+name+'.js'),'utf8'),sandbox);
const {ICEJourney:journey,ICEControls:controls,ICEAudio:audio}=sandbox;
const first=journey.daily(new Date('2026-10-16T00:00:00.000Z')),last=journey.daily(new Date('2026-10-16T23:59:59.999Z'));
assert.equal(JSON.stringify(first),JSON.stringify(last));
assert.notEqual(JSON.stringify(first),JSON.stringify(journey.daily(new Date('2026-10-17T00:00:00Z'))));
for(let i=0;i<365;i++){const d=journey.daily(new Date(Date.UTC(2026,0,1+i)));assert.ok(d.level>=5&&d.level<=1000&&d.level%100!==0&&d.level!==666);assert.ok(['earth','air','light','darkness'].includes(d.role));}
const progress=journey.progress(null,414);assert.equal(progress.unlocked,414);assert.equal(journey.progress({unlocked:2000},1).unlocked,1000);
journey.record(progress.records,12,{time:20,deaths:0});journey.record(progress.records,12,{time:25,deaths:2});assert.equal(progress.records[12].time,20);assert.equal(progress.records[12].clears,2);
journey.record(progress.practice,12,{time:10,deaths:1});assert.equal(progress.records[12].time,20);assert.equal(progress.practice[12].time,10);
const tutorial=journey.tutorialLevel();assert.ok(tutorial.plate&&tutorial.plate2&&tutorial.door&&tutorial.goal);assert.ok(tutorial.platforms.length>=3);assert.ok(tutorial.enemies.length>0);assert.equal(tutorial.hazards.length,0);
const input=controls.create();input.key('ArrowLeft',true);assert.ok(input.down('left'));input.key('ArrowLeft',false);assert.equal(input.down('left'),false);
assert.ok(input.bind('jump','KeyJ'));input.key('KeyJ',true);assert.ok(input.down('jump'));input.configure(input.bindings);assert.ok(input.down('jump'),'Saving unrelated preferences must not drop a held key');
assert.equal(input.bind('left','KeyJ'),false);assert.equal(input.bind('left','Escape'),false);input.key('KeyJ',false);assert.ok(input.down('jump'),'Brief taps remain queued until the next physics frame');input.consume('jump');assert.equal(input.down('jump'),false);
input.touch('right',true);assert.ok(input.down('right'));input.clear();assert.equal(input.down('right'),false);
input.configure(null);assert.ok(input.bindings.jump.includes('KeyW'));
const layout=controls.touch({left:{size:999,x:-20,y:300}});assert.equal(layout.left.size,120);assert.equal(layout.left.x,0);assert.equal(layout.left.y,100);assert.equal(controls.touch(null).left.size,72);
const bad=controls.bindings({left:['Escape'],right:['KeyA'],jump:['KeyA']});const codes=Object.values(bad).flat();assert.equal(new Set(codes).size,codes.length);
const silent=audio.create();silent.unlock();silent.play('ability');silent.update({active:true,theme:'boss'});silent.configure(null);silent.suspend();assert.equal(silent.stats().unlocked,false);

// WebAudio scheduling: cap voices, distinguish elements, adjust music, and disconnect ended nodes.
const nodes=[];class Param{constructor(){this.value=0;}setTargetAtTime(v){this.value=v;}setValueAtTime(v){this.value=v;}exponentialRampToValueAtTime(v){this.value=v;}}
class Node{constructor(){this.gain=new Param();this.frequency=new Param();this.Q=new Param();this.disconnected=false;nodes.push(this);}connect(){}disconnect(){this.disconnected=true;}start(){}stop(){}}
class AudioContext{constructor(){this.state='running';this.currentTime=1;this.sampleRate=1000;this.destination={};}createGain(){return new Node();}createOscillator(){return new Node();}createBufferSource(){return new Node();}createBiquadFilter(){return new Node();}createBuffer(){return {getChannelData:()=>new Float32Array(350)};}resume(){this.state='running';return Promise.resolve();}suspend(){this.state='suspended';return Promise.resolve();}}
sandbox.AudioContext=AudioContext;const sound=audio.create();sound.unlock();
for(const role of ['earth','air','light','darkness'])sound.play('ability',role);
assert.ok(sound.stats().voices>=5);sound.update({active:true,theme:'boss'});assert.equal(sound.stats().theme,'boss');sound.update({active:true,theme:'chase'});assert.equal(sound.stats().theme,'chase');
for(let i=0;i<100;i++)sound.play('jump','earth');assert.ok(sound.stats().voices<=24);
for(const node of nodes)node.onended?.();assert.equal(sound.stats().voices,0);assert.ok(nodes.some(n=>n.disconnected));
sound.configure({muted:true,music:.1,sfx:.3,master:.5});assert.equal(sound.stats().config.muted,true);sound.update({active:false});assert.equal(sound.stats().enabled,false);sound.suspend();
console.log('Features: PASS — UTC daily determinism, tutorial geometry, save separation, remapping, touch bounds, audio scheduling, mute and voice cleanup.');
