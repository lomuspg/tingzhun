import {test} from 'node:test';import assert from 'node:assert/strict';import {AudioEngine} from '../dist/lib/audio.js';import {parseJianpu} from '../dist/lib/core.js';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
class Context{constructor(){this.zero=performance.now();this.state='running';this.sampleRate=48000;}get currentTime(){return(performance.now()-this.zero)/1000;}async resume(){}createMediaStreamSource(){return{connect(){},disconnect(){}};}createAnalyser(){return{fftSize:4096,getFloatTimeDomainData(b){b.fill(0);},disconnect(){}};}}
class Recorder{static isTypeSupported(){return true;}constructor(stream,opts){this.mimeType=opts.mimeType;this.state='inactive';}start(){this.state='recording';}stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(['recorded'])});this.onstop?.();});}}
globalThis.window={AudioContext:Context,MediaRecorder:Recorder};globalThis.MediaRecorder=Recorder;
test('等待麦克风期间取消，迟到的权限结果释放音轨且不开始录音',async()=>{
 let resolveMic,requested=false,stopped=0;Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia(){requested=true;return new Promise(r=>resolveMic=r);}}}});
 const e=new AudioEngine(),p=e.start(parseJianpu('1 2 3 4 |'),{bpm:120,mode:'free'},()=>{},()=>{},()=>{});
 while(!requested)await wait(0);await e.stop();resolveMic({getTracks:()=>[{stop(){stopped++;}}]});
 await assert.rejects(p,{name:'AbortError'});assert.equal(stopped,1);assert.equal(e.timer,null);assert.equal(e.stream,null);
});
test('完整录音停止后返回数据、释放麦克风且清理计时器',async()=>{
 let stopped=0,finished;Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{async getUserMedia(){return{getTracks:()=>[{stop(){stopped++;}}]};}}}});
 const e=new AudioEngine();e.click=()=>{};await e.start(parseJianpu('1 2 3 4 |'),{bpm:120,mode:'free',countIn:false},()=>{},()=>{},b=>finished=b);
 await e.finish();assert.equal(finished.size,8);assert.equal(finished.type,'audio/webm;codecs=opus');assert.equal(stopped,1);assert.equal(e.timer,null);assert.equal(e.stream,null);
});
test('选段试听按固定时间轴播放且自然结束，只调度一次音符',async()=>{
 const e=new AudioEngine(),played=[];e.piano=(m,t,d)=>played.push(m);const s=parseJianpu('1 2 3 4 | 5 |');
 await e.preview(s,{bpm:240,start:1,end:1,mode:'piano',countIn:false,loop:false,melodyVolume:.5,backingVolume:0});
 await wait(550);assert.deepEqual(played,[67]);assert.equal(e.timer,null);
});
test('暂停同时暂停录音和音频时钟，继续后恢复',async()=>{
 const e=new AudioEngine();e.context={state:'running',async suspend(){this.state='suspended';},async resume(){this.state='running';}};e.recorder={state:'recording',pause(){this.state='paused';},resume(){this.state='recording';}};
 assert.equal(await e.togglePause(),true);assert.equal(e.recorder.state,'paused');assert.equal(e.context.state,'suspended');assert.equal(await e.togglePause(),false);assert.equal(e.recorder.state,'recording');
});
test('取消的旧权限请求迟到，不会停止后来开始的新录音',async()=>{let resolveFirst,count=0,stoppedA=0,stoppedB=0;const streamB={getTracks:()=>[{stop(){stoppedB++;}}]};Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia(){count++;return count===1?new Promise(r=>resolveFirst=r):Promise.resolve(streamB);}}}});const e=new AudioEngine(),s=parseJianpu('1 2 3 4 |'),o={bpm:120,mode:'free',countIn:false};const old=e.start(s,o,()=>{},()=>{},()=>{});while(!resolveFirst)await wait(0);await e.stop();await e.start(s,o,()=>{},()=>{},()=>{});resolveFirst({getTracks:()=>[{stop(){stoppedA++;}}]});await assert.rejects(old,{name:'AbortError'});assert.equal(e.stream,streamB);assert.equal(e.recorder.state,'recording');assert.equal(stoppedA,1);assert.equal(stoppedB,0);await e.stop();});
