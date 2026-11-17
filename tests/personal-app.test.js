import{test}from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{Window}from'happy-dom';import{IDBFactory}from'fake-indexeddb';import{createD1}from'./helpers/d1.js';import{handleApi}from'../worker/api.js';import{parseJianpu,summarize}from'../dist/lib/core.js';import{records,setRecordOwner,getRecordOwner,createRecordScope}from'../dist/lib/storage.js';
import{waitFor}from'./helpers/wait-for.js';
const wait=ms=>new Promise(r=>setTimeout(r,ms)),origin='https://tingzhun-practice.jokeycamel4.chatgpt.site';
test('登录应用：不混入游客与其他账号，录音后只同步摘要，账号变更后锁定旧界面',async()=>{
 const env=createD1(),win=new Window({url:origin,settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true,disableJavaScriptFileLoading:true}}),timers=[],nativeTimeout=globalThis.setTimeout;
 globalThis.setTimeout=(fn,ms,...args)=>{const id=nativeTimeout(fn,ms,...args);timers.push(id);return id;};
 try{
  win.document.write(fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'));
  for(const name of['window','document','DOMParser','HTMLElement'])Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='window'?win:win[name]});globalThis.indexedDB=new IDBFactory();
  globalThis.Option=function(text,value){const e=win.document.createElement('option');e.textContent=text;e.value=value;return e;};win.scrollTo=()=>{};win.HTMLElement.prototype.scrollIntoView=()=>{};win.HTMLDialogElement.prototype.showModal=function(){this.open=true;};win.HTMLCanvasElement.prototype.getContext=()=>({scale(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText(){}});
  let currentUser='alice';const headersFor=user=>({'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.test'});
  const call=async(path,user,method='GET',data)=>handleApi(new Request(origin+path,{method,headers:{...headersFor(user),Origin:origin,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined}),env);
  await call('/api/me','alice');await call('/api/me','bob');await call('/api/preferences','alice','PUT',{nickname:'Alice练唱室',mode:'free'});
  const score=parseJianpu('标题: Bob不可见曲谱\n速度: 80\n1 2 3 4 |');score.melodyId='melody';const base={id:crypto.randomUUID(),created:new Date().toISOString(),duration:1,score,options:{mode:'free',bpm:80,start:0,end:0,transpose:0,tolerance:35},frames:[],summary:summarize([],35),audio:null};await call('/api/sessions','bob','PUT',{record:base});
  await setRecordOwner('guest');await records('save',{...base,id:crypto.randomUUID(),score:{...score,title:'游客旧记录'}});
  globalThis.fetch=async(path,options={})=>{const request=new Request(origin+path,{...options,headers:{...options.headers,...headersFor(currentUser),...(options.method?{Origin:origin}:{})}});return handleApi(request,env);};
  class Context{constructor(){this.zero=performance.now();this.state='running';this.sampleRate=48000;}get currentTime(){return(performance.now()-this.zero)/1000;}async resume(){}createMediaStreamSource(){return{connect(){},disconnect(){}};}createAnalyser(){return{getFloatTimeDomainData(b){for(let i=0;i<b.length;i++)b[i]=.3*Math.sin(2*Math.PI*261.626*i/48000);},disconnect(){}};}}
  class Recorder{static isTypeSupported(){return true;}constructor(s,o){this.mimeType=o.mimeType;this.state='inactive';}start(){this.state='recording';}stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable({data:new Blob(['private-recording'])});this.onstop();});}}
  win.AudioContext=Context;win.MediaRecorder=Recorder;globalThis.MediaRecorder=Recorder;Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{async getUserMedia(){return{getTracks:()=>[{stop(){}}]};}}}});
  await import('../dist/app.js');const $=id=>win.document.getElementById(id);assert.match($('accountMenu').textContent,/Alice练唱室/);assert.equal($('historyCount').textContent,'0');
  $('countIn').checked=false;await $('start').onclick();await wait(400);await $('stop').onclick();
  for(let i=0;i<20;i++){if((await records('list'))[0]?.syncState==='synced')break;await wait(20);}
  const local=(await records('list'))[0];assert.ok(local.audio);assert.equal(local.syncState,'synced');const cloud=(await(await call('/api/sessions','alice')).json()).records;assert.equal(cloud.length,1);assert.equal(cloud[0].audio,null);assert.equal(cloud[0].frames.length,0);assert.equal((await(await call('/api/sessions','bob')).json()).records.length,1);assert.ok(!$('historyList').textContent.includes('Bob不可见曲谱'));assert.ok(!$('historyList').textContent.includes('游客旧记录'));
  await records('delete',local.id);await $('refreshCloud').onclick();$('historyList').querySelector('[data-review]').onclick();assert.match($('exportBackup').textContent,/不含录音/);
  const privateScope=createRecordScope();win.document.querySelector('[data-page="studio"]').onclick();await $('start').onclick();await wait(200);currentUser='bob';window.dispatchEvent(new win.Event('focus'));assert.equal($('identityShield').hidden,false);
  // 切换存储身份后还要异步读取游客历史；等界面清理结束，避免在中间态销毁测试窗口。
  await waitFor(()=>getRecordOwner()==='guest'&&$('accountMenu').textContent.includes('游客')&&$('identityShield').hidden,'账号切换完成并清理旧界面');
  assert.match($('accountMenu').textContent,/游客/);assert.equal($('review').hidden,true);assert.ok(!$('historyList').textContent.includes('起音与跳进'));assert.ok(!$('historyList').textContent.includes('Bob不可见曲谱'));assert.equal((await records('list'))[0].score.title,'游客旧记录');assert.equal((await privateScope.list()).length,1);assert.equal(await(await privateScope.list())[0].audio.text(),'private-recording');
 }finally{timers.forEach(clearTimeout);globalThis.setTimeout=nativeTimeout;await win.happyDOM.close();env.sql.close();}
});
