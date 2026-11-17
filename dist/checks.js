import {AudioEngine} from './lib/audio.js';import{parseJianpu,detectPitch,hzMidi,midiHz,summarize}from'./lib/core.js';import{records,encodeSession,decodeSession}from'./lib/storage.js';
const result=document.getElementById('result'),run=document.getElementById('run');let url;
run.onclick=async()=>{run.disabled=true;result.textContent='';const log=s=>result.textContent+=s+'\n',check=(condition,message)=>{if(!condition)throw Error(message);log('通过 · '+message);};let ctx,engine,decoded;
 try{
  ctx=new AudioContext();await ctx.resume();const stream=ctx.createMediaStreamDestination(),osc=ctx.createOscillator(),gain=ctx.createGain();gain.gain.value=.35;osc.connect(gain);gain.connect(stream);osc.frequency.value=220;osc.start();
  const score=parseJianpu('标题: 浏览器自检（合成声音）\n速度: 120\n1 2 3 4 |');score.melodyId='melody';engine=new AudioEngine();let frames=[],blob;
  await engine.start(score,{mode:'free',bpm:120,start:0,end:0,transpose:0,countIn:false,inputStream:stream.stream},(buffer,sr,info)=>{const p=detectPitch(buffer,sr);frames.push({...info,...p,voiced:!!p.hz,confident:!!p.hz,target:57,cents:p.hz?(hzMidi(p.hz)-57)*100:null,index:0,measure:0});},()=>{},b=>blob=b);
  log('正在用合成声音检验实际浏览器录音…');await new Promise(r=>setTimeout(r,1600));await engine.finish();
  check(blob&&blob.size>500,'实际音频编码生成了录音文件');check(frames.some(f=>f.hz&&Math.abs(f.hz-220)<2),'音频输入与音高检测得到 220 Hz（赫兹）');
  check(engine.stream===null&&engine.timer===null,'结束后输入流和调度器已清理');
  const s={id:crypto.randomUUID(),created:new Date().toISOString(),duration:1.6,score,options:{mode:'free',bpm:120,start:0,end:0,transpose:0,tolerance:35},frames,audio:blob};s.summary=summarize(frames,35);
  await records('save',s);const loaded=(await records('list')).find(r=>r.id===s.id);check(loaded?.audio?.size===blob.size,'本机数据库保存并读取录音');await records('delete',s.id);
  decoded=decodeSession(JSON.parse(JSON.stringify(await encodeSession(s))));check(decoded.audio.size===blob.size,'完整备份编码、解码保留录音');check(decoded.score.notes===decoded.score.parts[0].notes,'备份还原练唱声部');
  check(s.summary.inTune>.9,'合成标准音的可靠采样得到合理音准统计');
  if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(blob);const audio=document.getElementById('recording');audio.src=url;audio.hidden=false;
  const loadedAudio=await new Promise(resolve=>{audio.onloadedmetadata=()=>resolve(true);audio.onerror=()=>resolve(false);audio.load();setTimeout(()=>resolve(false),4000);});check(loadedAudio,'浏览器能够加载刚保存的录音用于回放');
  log('\n本机自检全部通过。测试的是合成音与浏览器功能，不代表真实歌声识别准确率。');
 }catch(e){log('失败 · '+e.message);}finally{await engine?.close();await ctx?.close();run.disabled=false;}
};
