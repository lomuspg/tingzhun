export const midiHz=m=>440*2**((m-69)/12);
export const hzMidi=h=>69+12*Math.log2(h/440);
export const noteName=m=>m==null?'—':['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][((Math.round(m)%12)+12)%12]+(Math.floor(Math.round(m)/12)-1);
const steps={C:0,D:2,E:4,F:5,G:7,A:9,B:11},scale=[0,2,4,5,7,9,11];
export function parseJianpu(text){
 const s={title:'我的曲谱',bpm:80,meter:[4,4],key:'C',notes:[],chords:[],measures:[],warnings:[],parts:[]},body=[];
 for(const line of text.split(/\r?\n/)){
  const m=line.trim().match(/^(标题|调号|拍号|速度|歌词)\s*[:：]\s*(.*)$/);
  if(m){const [_,k,v]=m;if(k==='标题')s.title=v.slice(0,100);if(k==='调号')s.key=v;if(k==='速度')s.bpm=Number(v);if(k==='拍号')s.meter=v.split('/').map(Number);if(k==='歌词')s.lyrics=v;}
  else if(!line.trim().startsWith('//'))body.push(line);
 }
 if(!(s.bpm>=30&&s.bpm<=240))throw Error('速度请设在每分钟 30—240 拍之间。');
 if(s.meter.length!==2||!Number.isInteger(s.meter[0])||s.meter[0]<1||s.meter[0]>12||![2,4,8,16].includes(s.meter[1]))throw Error('拍号格式应为 4/4、3/4、6/8 等。');
 const key=s.key.replace(/^1\s*=\s*/,'').trim().match(/^([A-Ga-g])([#b♯♭]?)(m)?$/);
 if(!key||key[3])throw Error('文本简谱请使用 1=C、D、Bb 等大调音阶；其他情况请导入电子谱。');
 const root=steps[key[1].toUpperCase()]+(['#','♯'].includes(key[2])?1:['b','♭'].includes(key[2])?-1:0);
 let beat=0,start=0,bar=0,last=null;const expected=s.meter[0]*4/s.meter[1];
 const close=()=>{if(beat>start){s.measures.push({index:bar,beat:start,dur:beat-start,meter:s.meter});if(Math.abs(beat-start-expected)>.01)s.warnings.push(`第 ${bar+1} 小节时值为 ${beat-start}，请核对拍号或弱起。`);bar++;start=beat;last=null;}};
 const source=body.join(' ').replace(/\|:/g,'|').replace(/:\|/g,'|');
 const tokens=source.match(/\[[^\]]+\]|\|+|[#b]?[0-7][',]*\/*\.*|-|[^\s]+/g)||[];
 for(const token of tokens){
  if(token.startsWith('|')){close();continue;}
  if(token.startsWith('[')){const c=parseChord(token.slice(1,-1));if(!c)throw Error(`无法识别和弦 ${token}，可使用 C、Am、G7、Fmaj7。`);s.chords.push({...c,beat,measure:bar});continue;}
  if(token==='-'){if(!last)throw Error('延长线前需要一个音符或休止符。');last.dur++;beat++;continue;}
  const m=token.match(/^([#b]?)([0-7])([',]*)(\/*)(\.*)$/);if(!m)throw Error(`无法识别“${token}”。音符之间请留空格，参考帮助中的格式。`);
  const dur=(2-1/2**m[5].length)/2**m[4].length,oct=[...m[3]].reduce((a,c)=>a+(c==="'"?12:-12),0);
  const midi=m[2]==='0'?null:60+root+scale[Number(m[2])-1]+oct+(m[1]==='#'?1:m[1]==='b'?-1:0);
  last={id:s.notes.length,midi,beat,dur,measure:bar,token,lyric:''};s.notes.push(last);beat+=dur;
 }
 close();if(!s.notes.some(n=>n.midi!=null))throw Error('请至少输入一个旋律音符。');
 if(s.notes.length>6000)throw Error('单次最多支持 6000 个音符，请分文件导入。');
 if(s.lyrics){const words=s.lyrics.split(/\s+/);s.notes.filter(n=>n.midi!=null).forEach((n,i)=>n.lyric=words[i]||'');}
 s.parts=[{id:'melody',name:'主旋律',notes:s.notes}];return s;
}
export function parseChord(label){
 const m=label.trim().match(/^([A-G])([#b]?)(maj7|m7|m|min|minor|7|major|dim|sus4|sus2)?(?:\/([A-G])([#b]?))?$/);if(!m)return null;
 const pc=(a,b)=>(steps[a]+(b==='#'?1:b==='b'?-1:0)+12)%12,root=pc(m[1],m[2]),q=m[3]||'major';
 const intervals=q==='dim'?[0,3,6]:q==='sus4'?[0,5,7]:q==='sus2'?[0,2,7]:q==='maj7'?[0,4,7,11]:q==='m7'?[0,3,7,10]:q==='7'?[0,4,7,10]:['m','min','minor'].includes(q)?[0,3,7]:[0,4,7];
 return {label,root,bass:m[4]?pc(m[4],m[5]):root,intervals};
}
export function parseMusicXML(xml,parser=new DOMParser()){
 if(/<!ENTITY/i.test(xml))throw Error('不支持含外部实体的文件。');
 // Standard MusicXML exports often contain a harmless external DTD. Strip it; never fetch it.
 xml=xml.replace(/<!DOCTYPE[^>]*>/gi,'');const doc=parser.parseFromString(xml,'text/xml');
 if(doc.getElementsByTagName('parsererror').length)throw Error('电子谱格式损坏。');
 if(doc.documentElement?.nodeName!=='score-partwise')throw Error('目前支持分声部 MusicXML，请从制谱软件导出此格式。');
 const txt=(e,t,d='')=>e.getElementsByTagName(t)[0]?.textContent||d,children=e=>Array.from(e.childNodes||[]).filter(c=>c.nodeType===1);
 const s={title:txt(doc,'work-title',txt(doc,'movement-title','导入的乐谱')).slice(0,100),bpm:80,meter:[4,4],key:'原谱',notes:[],parts:[],chords:[],measures:[],warnings:[]},names={};
 for(const p of Array.from(doc.getElementsByTagName('score-part')))names[p.getAttribute('id')]=txt(p,'part-name','声部');
 for(const [pi,part]of children(doc.documentElement).filter(c=>c.nodeName==='part').entries()){
  let base=0,div=1,meter=[4,4];const tracks=new Map(),ties=new Map();
  for(const [mi,measure]of children(part).filter(c=>c.nodeName==='measure').entries()){
   let cursor=0,max=0,previous=0;
   for(const e of children(measure)){
    if(e.nodeName==='attributes'){
     div=Number(txt(e,'divisions',String(div)));if(!(div>0))throw Error('电子谱时值单位无效。');
     const time=e.getElementsByTagName('time')[0];if(time)meter=[txt(time,'beats','4').split('+').reduce((a,b)=>a+Number(b),0),Number(txt(time,'beat-type','4'))];if(pi===0&&mi===0)s.meter=meter;
    }
    if(e.nodeName==='direction'){const tempo=Number(e.getElementsByTagName('sound')[0]?.getAttribute('tempo'));if(tempo>0){if(pi===0&&mi===0)s.bpm=tempo;else if(pi===0)s.warnings.push('谱中有速度变化；首版使用所选固定练习速度。');}}
    if(e.nodeName==='backup')cursor-=Number(txt(e,'duration','0'))/div;
    if(e.nodeName==='forward'){cursor+=Number(txt(e,'duration','0'))/div;max=Math.max(max,cursor);}
    if(e.nodeName==='harmony'&&pi===0){const root=txt(e,'root-step'),alter=Number(txt(e,'root-alter','0')),kind=txt(e,'kind','major');
     const suf={'minor':'m','dominant':'7','major-seventh':'maj7','minor-seventh':'m7','diminished':'dim','suspended-fourth':'sus4','major':''}[kind];
     const c=parseChord(root+(alter===1?'#':alter===-1?'b':'')+(suf??''));if(c&&suf!==undefined)s.chords.push({...c,beat:base+cursor,measure:mi});else s.warnings.push('部分和弦未支持，对应伴奏已跳过。');}
    if(e.nodeName!=='note'||e.getElementsByTagName('grace').length||e.getElementsByTagName('unpitched').length)continue;
    const dur=Number(txt(e,'duration','0'))/div;if(!(dur>0))continue;
    const chord=e.getElementsByTagName('chord').length>0,onset=chord?previous:cursor,p=e.getElementsByTagName('pitch')[0];
    const midi=p?12*(Number(txt(p,'octave','4'))+1)+(steps[txt(p,'step')]??0)+Number(txt(p,'alter','0')):null;
    const voice=txt(e,'voice','1'),staff=txt(e,'staff','1'),id=`${part.getAttribute('id')}:${voice}:${staff}`;
    if(!tracks.has(id))tracks.set(id,{id,name:`${names[part.getAttribute('id')]||'声部'} · ${voice}/${staff}`,notes:[]});
    const track=tracks.get(id),ts=Array.from(e.getElementsByTagName('tie')).map(t=>t.getAttribute('type')),tk=id+':'+midi;
    if(ts.includes('stop')&&ties.has(tk))ties.get(tk).dur+=dur;
    else{const n={midi,beat:base+onset,dur,measure:mi,lyric:txt(e,'text'),voice,staff};track.notes.push(n);if(ts.includes('start'))ties.set(tk,n);}
    if(ts.includes('stop')&&!ts.includes('start'))ties.delete(tk);
    previous=onset;if(!chord)cursor+=dur;max=Math.max(max,onset+dur,cursor);
   }
   const length=max||meter[0]*4/meter[1];if(pi===0)s.measures.push({index:mi,beat:base,dur:length,meter});
   if(pi===0&&(measure.getElementsByTagName('repeat').length||measure.getElementsByTagName('ending').length))s.warnings.push('反复记号首版按谱面小节顺序播放，可用选段循环重复。');base+=length;
  }
  s.parts.push(...tracks.values());
 }
 for(const p of s.parts){p.notes.sort((a,b)=>a.beat-b.beat||b.midi-a.midi);p.notes.forEach((n,i)=>n.id=i);}
 s.parts=s.parts.filter(p=>p.notes.some(n=>n.midi!=null));if(!s.parts.length)throw Error('未找到有音高的旋律声部。');s.notes=s.parts[0].notes;
 if(s.notes.length>6000)throw Error('旋律超过 6000 个音符，请分段导出。');s.bpm=Math.max(30,Math.min(240,s.bpm));s.warnings=[...new Set(s.warnings)];return s;
}
export function buildTimeline(score,{start=0,end=score.measures.length-1,bpm=score.bpm,transpose=0}={}){
 const first=score.measures[start],last=score.measures[end];if(!first||!last||end<start)throw Error('请选择有效的小节范围。');
 const b0=first.beat,b1=last.beat+last.dur,seconds=60/bpm;
 const convert=notes=>notes.flatMap((n,i)=>{const a=Math.max(b0,n.beat),b=Math.min(b1,n.beat+n.dur);return b>a?[{...n,index:n.id??i,midi:n.midi==null?null:n.midi+transpose,time:(a-b0)*seconds,seconds:(b-a)*seconds}]:[];});
 return {events:convert(score.notes),accompaniment:score.parts.filter(p=>p.notes!==score.notes&&p.id!==score.melodyId).flatMap(p=>convert(p.notes)),duration:(b1-b0)*seconds,beat0:b0,beat1:b1,seconds,bpm,transpose,start,end};
}
export function detectPitch(buffer,sampleRate){
 let rms=0;for(const x of buffer)rms+=x*x;rms=Math.sqrt(rms/buffer.length);if(rms<.008)return {hz:null,clarity:0,rms};
 const stride=Math.max(1,Math.floor(sampleRate/16000)),len=Math.floor(buffer.length/stride),x=new Float32Array(len);let mean=0;
 for(let i=0;i<len;i++){let v=0;for(let k=0;k<stride;k++)v+=buffer[i*stride+k];x[i]=v/stride;mean+=x[i];}mean/=len;for(let i=0;i<len;i++)x[i]-=mean;
 const sr=sampleRate/stride,max=Math.min(Math.floor(sr/65),Math.floor(len/2)),min=Math.floor(sr/1100),diff=new Float32Array(max+1);let sum=0;
 for(let tau=1;tau<=max;tau++){let d=0;for(let i=0;i<len-max;i++){const v=x[i]-x[i+tau];d+=v*v;}sum+=d;diff[tau]=sum?d*tau/sum:1;}
 let tau=-1;for(let i=min;i<max;i++)if(diff[i]<.15){while(i+1<max&&diff[i+1]<diff[i])i++;tau=i;break;}
 if(tau<0)return{hz:null,clarity:0,rms};const a=diff[tau-1],b=diff[tau],c=diff[tau+1],denom=2*(2*b-a-c),shift=denom?(c-a)/denom:0,hz=sr/(tau+shift);
 return{hz:hz>=65&&hz<=1100?hz:null,clarity:1-b,rms};
}
export class Follower{
 constructor(notes){this.notes=notes.filter(n=>n.midi!=null).filter((n,i,arr)=>i===0||n.beat!==arr[i-1].beat);this.observations=[];this.last=null;}
 observe(midi,duration=1){
  this.observations.push({midi,duration});if(this.observations.length>8)this.observations.shift();const count=this.observations.length,candidates=[];
  for(let end=0;end<this.notes.length;end++){let best={cost:Infinity,length:0};
   for(let l=Math.min(count,8,end+1);l>=Math.min(3,count);l--){let cost=0;for(let j=0;j<l;j++){const d=Math.abs(this.observations[count-l+j].midi-this.notes[end-l+1+j].midi);cost+=Math.min(2.5,d)/l;}cost+=.07*(8-l);if(cost<best.cost)best={cost,length:l};}
   candidates.push({index:this.notes[end].id??end,...best});
  }
  candidates.sort((a,b)=>a.cost-b.cost);const best=candidates[0];if(!best)return{index:null,confident:false,candidates:[]};const near=candidates.filter(c=>c.cost-best.cost<.2);
  return this.last={index:best.index,confident:count>=3&&best.cost<1.1&&near.length===1,candidates:near.slice(0,8).map(c=>c.index),cost:best.cost};
 }
}
export function summarize(frames,tolerance=35){
 const voiced=frames.filter(f=>f.voiced),valid=voiced.filter(f=>f.confident&&Number.isFinite(f.cents)),high=valid.filter(f=>f.cents>tolerance).length,low=valid.filter(f=>f.cents < -tolerance).length,good=valid.length-high-low,groups=new Map();
 for(const f of valid){const key=`${f.lap||0}:${f.measure??0}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(f);}
 const passages=[...groups.entries()].map(([key,fs])=>{const bad=fs.filter(f=>Math.abs(f.cents)>tolerance);return{key,measure:fs[0].measure,lap:fs[0].lap||0,start:fs[0].t,end:fs.at(-1).t,valid:fs.length,bad:bad.length,meanAbs:fs.reduce((a,f)=>a+Math.abs(f.cents),0)/fs.length,direction:bad.reduce((a,f)=>a+Math.sign(f.cents),0)>=0?'偏高':'偏低'};}).filter(p=>p.valid>=4);
 passages.sort((a,b)=>(b.bad/b.valid)-(a.bad/a.valid)||b.valid-a.valid);const timing=frames.filter(f=>f.voiced&&f.timingValid).map(f=>f.timing).filter(Number.isFinite).sort((a,b)=>a-b);
 return{voiced:voiced.length,valid:valid.length,coverage:voiced.length?valid.length/voiced.length:0,high,low,good,inTune:valid.length?good/valid.length:null,meanAbs:valid.length?valid.reduce((a,f)=>a+Math.abs(f.cents),0)/valid.length:null,timing:timing.length?timing[Math.floor(timing.length/2)]:null,passages};
}
