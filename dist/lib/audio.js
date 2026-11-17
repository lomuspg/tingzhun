import {midiHz,buildTimeline} from './core.js';

export function accompanimentEvents(score,timeline){
 if(timeline.accompaniment.length)return timeline.accompaniment.map(n=>({...n,kind:'backing'}));
 if(!score.chords.length)return[];
 const out=[];for(let beat=timeline.beat0;beat<timeline.beat1-.001;beat+=.5){
  const chord=score.chords.filter(c=>c.beat<=beat+.001).at(-1);if(!chord)continue;
  const relative=beat-timeline.beat0,slot=Math.round(relative*2),bass=slot%4===0;
  const pitches=bass?[36+chord.bass]:[48+chord.root+chord.intervals[(slot/1|0)%chord.intervals.length]];
  for(const pitch of pitches)out.push({midi:pitch+timeline.transpose,time:relative*timeline.seconds,seconds:.48*timeline.seconds,kind:'backing'});
 }return out;
}
export class AudioEngine{
 constructor(){this.nodes=new Set();this.timer=null;this.stream=null;this.context=null;this.closed=false;this.generation=0;}
 async ready(){if(!this.context||this.context.state==='closed')this.context=new(window.AudioContext||window.webkitAudioContext)();await this.context.resume();}
 piano(midi,time,duration,volume=.25){
  if(midi==null||!volume)return;const ctx=this.context,gain=ctx.createGain(),osc=ctx.createOscillator();
  const real=new Float32Array([0,0,0,0,0,0]),imag=new Float32Array([0,1,.38,.14,.07,.025]);
  osc.setPeriodicWave(ctx.createPeriodicWave(real,imag));osc.frequency.value=midiHz(midi);
  const end=time+Math.max(.08,duration);gain.gain.setValueAtTime(.0001,time);gain.gain.exponentialRampToValueAtTime(Math.max(.001,volume*.22),time+.008);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume*.028),end);gain.gain.exponentialRampToValueAtTime(.0001,end+.12);
  osc.connect(gain);gain.connect(ctx.destination);osc.start(time);osc.stop(end+.15);this.nodes.add(osc);osc.onended=()=>{osc.disconnect();gain.disconnect();this.nodes.delete(osc);};
 }
 click(time,strong=false){const ctx=this.context,o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=strong?1050:720;g.gain.setValueAtTime(.14,time);g.gain.exponentialRampToValueAtTime(.0001,time+.045);o.connect(g);g.connect(ctx.destination);o.start(time);o.stop(time+.05);this.nodes.add(o);o.onended=()=>{o.disconnect();g.disconnect();this.nodes.delete(o);};}
 async preview(score,options){await this.stop();const token=++this.generation;await this.ready();if(token!==this.generation)return;this.closed=false;this.schedule(score,options,false);}
 async start(score,options,onFrame,onTick,onFinish){
  await this.stop();const token=++this.generation;await this.ready();if(token!==this.generation)throw new DOMException('录音请求已取消。','AbortError');this.closed=false;
  try{
   if(!navigator.mediaDevices?.getUserMedia)throw Error('当前浏览器不能使用麦克风，请在安全网页或本机地址中打开。');
   const stream=options.inputStream||await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
   if(token!==this.generation){stream.getTracks().forEach(t=>t.stop());throw new DOMException('录音请求已取消。','AbortError');}this.stream=stream;
   if(!window.MediaRecorder)throw Error('此浏览器不支持录音，请使用较新的系统浏览器。');
   this.source=this.context.createMediaStreamSource(this.stream);this.analyser=this.context.createAnalyser();this.analyser.fftSize=4096;this.source.connect(this.analyser);
   const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(m=>MediaRecorder.isTypeSupported(m));
   this.recorder=new MediaRecorder(this.stream,mime?{mimeType:mime}:{});this.chunks=[];
   this.recorder.ondataavailable=e=>{if(e.data.size)this.chunks.push(e.data);};
   this.recordZero=this.context.currentTime;this.recorder.start(200);
   this.onFinish=onFinish;this.onFrame=onFrame;this.onTick=onTick;
   this.schedule(score,options,true);
   this.frameBuffer=new Float32Array(4096);this.lastFrame=0;
  }catch(e){if(token===this.generation)await this.stop();throw e;}
 }
 schedule(score,options,recording){
  this.recording=recording;this.timeline=buildTimeline(score,options);this.options=options;this.score=score;
  const beatSeconds=this.timeline.seconds,pulse=score.meter[1]===8&&score.meter[0]%3===0?1.5:4/score.meter[1];
  const count=options.countIn===false?0:score.meter[0]*4/score.meter[1]*beatSeconds;
  this.origin=this.context.currentTime+.12+count;this.sent=new Set();
  this.events=options.mode==='piano'?[...this.timeline.events.map(n=>({...n,kind:'melody'})),...accompanimentEvents(score,this.timeline)]:[];
  this.timer=setInterval(()=>{
   const now=this.context.currentTime,relative=now-this.origin,limit=now+.16;
   if(relative<0){for(let b=0;b<count/beatSeconds;b++){const time=this.origin-count+b*beatSeconds,key='c'+b;if(time>=now&&time<limit&&!this.sent.has(key)){this.sent.add(key);this.click(time,b===0);}}}
   const lap=Math.max(0,Math.floor(relative/this.timeline.duration));
   const loops=options.loop||options.mode!=='piano';
   for(let l=Math.max(0,lap-1);l<=lap+1;l++){
    if(l>0&&!loops)continue;const origin=this.origin+l*this.timeline.duration;
    this.events.forEach((n,i)=>{const time=origin+n.time,key=`${l}:n:${i}`;if(time>=now&&time<limit&&!this.sent.has(key)){this.sent.add(key);this.piano(n.midi,time,n.seconds,n.kind==='melody'?options.melodyVolume:options.backingVolume);}});
    if(options.mode==='beat')for(let b=0;b<this.timeline.beat1-this.timeline.beat0;b+=pulse){const time=origin+b*beatSeconds,key=`${l}:b:${b}`;if(time>=now&&time<limit&&!this.sent.has(key)){this.sent.add(key);const measure=score.measures.find(m=>m.beat<=this.timeline.beat0+b&&m.beat+m.dur>this.timeline.beat0+b);this.click(time,Math.abs((this.timeline.beat0+b)-(measure?.beat||0))<.01);}}
   }
   // Only retain scheduling keys near the current cycle during long sessions.
   if(lap>2&&this.sent.size>2000)for(const key of this.sent)if(Number(key.split(':')[0])<lap-1)this.sent.delete(key);
   const local=relative<0?relative:relative%this.timeline.duration;
   this.onTick?.({position:local,lap,elapsed:recording?now-this.recordZero:Math.max(0,relative),counting:relative<0});
   if(recording&&now-this.lastFrame>.075){this.lastFrame=now;this.analyser.getFloatTimeDomainData(this.frameBuffer);this.onFrame?.(this.frameBuffer,this.context.sampleRate,{t:now-this.recordZero,position:local,lap,counting:relative<0});}
   if(relative>=this.timeline.duration&&!loops)this.finish();
   if(recording&&now-this.recordZero>1800)this.finish();
  },25);
 }
 async togglePause(){if(!this.context||!this.recorder)return false;const paused=this.context.state!=='suspended';if(paused){this.recorder.pause();await this.context.suspend();}else{await this.context.resume();this.recorder.resume();}return paused;}
 async finish(){if(this.finishing)return;this.finishing=true;const cb=this.onFinish;const blob=await this.stop();this.finishing=false;await cb?.(blob);}
 async stop(){
  this.generation++;clearInterval(this.timer);this.timer=null;for(const n of this.nodes){try{n.stop();}catch{}}this.nodes.clear();this.sent?.clear();
  let blob=null;if(this.recorder&&this.recorder.state!=='inactive'){
   const recorder=this.recorder;blob=await new Promise(resolve=>{recorder.onstop=()=>resolve(new Blob(this.chunks,{type:recorder.mimeType||'audio/webm'}));recorder.stop();});
  }
  this.recorder=null;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.source?.disconnect();this.analyser?.disconnect();this.onTick=null;this.onFrame=null;this.onFinish=null;return blob;
 }
 async close(){await this.stop();if(this.context?.state!=='closed')await this.context?.close();}
}
