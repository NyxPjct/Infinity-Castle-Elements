'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

// Run the real desktop updater through its IPC handler without starting Electron
// or touching installation files. Only GitHub responses and the app version vary.
const handlers=new Map();
let installed='0.0.9',release={};
const electron={
  app:{getVersion:()=>installed,isPackaged:true,whenReady:()=>({then(){}}),on(){},setName(){},setAppUserModelId(){}},
  ipcMain:{on(){},handle:(name,fn)=>handlers.set(name,fn)}
};
const sandbox={
  require:name=>name==='electron'?electron:require(name),
  process:{env:{},platform:'win32'},console,
  fetch:async url=>({ok:true,json:async()=>url.includes('/latest')?release:[]})
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../desktop/main.cjs'),'utf8'),sandbox,{filename:'desktop/main.cjs'});
(async()=>{
  for(const [current,latest,mandatory,expectedStatus,required] of [
    ['0.0.9','0.0.9',true,'up-to-date',false],
    ['0.0.9','0.0.8',true,'up-to-date',false],
    ['0.0.9','0.0.10',true,'available',true],
    ['0.0.9','0.0.10',false,'available',false],
    ['0.0.10','0.0.10',true,'up-to-date',false]
  ]){
    installed=current;
    release={tag_name:'v'+latest,body:mandatory?'<!-- required-update -->':'Optional update',assets:[{name:'Infinity-Castle-Elements-Setup-'+latest+'.exe',browser_download_url:'https://github.com/example/setup.exe'}]};
    const result=await handlers.get('ice:check-for-updates')();
    assert.equal(result.status,expectedStatus);
    assert.equal(result.required,required);
    assert.equal(result.currentVersion,current);
    assert.equal(result.latestVersion,latest);
  }
  console.log('PASS: desktop mandatory updates apply only to newer releases; current and older releases never require reinstalling.');
})().catch(error=>{console.error(error);process.exitCode=1;});
