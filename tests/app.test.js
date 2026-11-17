import{test}from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{Window}from'happy-dom';import{indexedDB}from'fake-indexeddb';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
test('应用整条流程：录音中保护导航、保存回放、第二场刷新和备份往返',async()=>{
 const timers=[],nativeTimeout=globalThis.setTimeout;globalThis.setTimeout=(fn,ms,...args)=>{const id=nativeTimeout(fn,ms,...args);timers.push(id);return id;};
 const win=new Window({url:'http://localhost:4173',settings:{disableJavaScriptEvaluation:true,disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
 win.document.write(fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'));
 for(const name of['window','document','FileReader','DOMParser','HTMLElement'])Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='window'?win:win[name]});globalThis.indexedDB=indexedDB;
 win.scrollTo=()=>{};win.HTMLElement.prototype.scrollIntoView=()=>{};globalThis.Option=function(text,value){const o=win.document.createElement('option');o.textContent=text;o.value=value;return o;};globalThis.FileReader=class{readAsDataURL(blob){blob.arrayBuffer().then(b=>{this.result=`data:${blob.type};base64,${Buffer.from(b).toString('base64')}`;this.onload();});}};
 const drawing={scale(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText(){}};let paints=0;win.HTMLCanvasElement.prototype.getContext=()=>{paints++;return drawing;};
 class Context{constructor(){this.zero=performance.now();this.state='running';this.sampleRate=48000;}get currentTime(){return(performance.now()-this.zero)/1000;}async resume(){this.state='running';}async suspend(){this.state='suspended';}createMediaStreamSource(){return{connect(){},disconnect(){}};}createAnalyser(){return{getFloatTimeDomainData(b){for(let i=0;i<b.length;i++)b[i]=.3*Math.sin(2*Math.PI*261.626*i/48000);},disconnect(){}};}}
 class Recorder{static isTypeSupported(){return true;}constructor(s,o){this.mimeType=o.mimeType;this.state='inactive';}start(){this.state='recording';}stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable({data:new Blob(['recorded'])});this.onstop();});}pause(){this.state='paused';}resume(){this.state='recording';}}
 win.AudioContext=Context;win.MediaRecorder=Recorder;globalThis.MediaRecorder=Recorder;let released=0;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{async getUserMedia(){return{getTracks:()=>[{stop(){released++;}}]};}}}});
 await import('../dist/app.js');const $=id=>win.document.getElementById(id);
 win.document.querySelector('[data-mode="free"]').onclick();$('countIn').checked=false;
 await $('start').onclick();win.document.querySelector('[data-page="history"]').onclick();assert.equal($('history').hidden,true);assert.equal($('studio').hidden,false);
 await wait(700);assert.match($('signalStatus').textContent,/收音清晰/);const before=paints;
 await $('stop').onclick();assert.equal(released,1);assert.equal($('history').hidden,false);assert.equal($('historyCount').textContent,'1');assert.equal($('review').hidden,false);assert.ok($('reviewAudio'));
 const {records,encodeSession,decodeSession}=await import('../dist/lib/storage.js');const saved=(await records('list'))[0];assert.equal(saved.audio.size,8);assert.ok(saved.frames.length>3);
 const backup=await encodeSession(saved);assert.doesNotThrow(()=>decodeSession(backup),JSON.stringify({options:backup.session.options,duration:backup.session.duration}));assert.equal(decodeSession(backup).audio.size,8);
 win.document.querySelector('[data-page="studio"]').onclick();await $('start').onclick();await wait(380);assert.ok(paints>before+1,'第二次练习早期刷新曲线');await $('stop').onclick();assert.equal($('historyCount').textContent,'2');assert.equal(released,2);
 timers.forEach(clearTimeout);globalThis.setTimeout=nativeTimeout;await win.happyDOM.close();
});
