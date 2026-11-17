import { test } from 'node:test';
import assert from 'node:assert/strict';
import {DOMParser} from '@xmldom/xmldom';
import {parseJianpu, parseMusicXML, buildTimeline, detectPitch, Follower, summarize} from '../dist/lib/core.js';
test('简谱：调号、附点、八度、延长和休止保持准确时值',()=>{
 const s=parseJianpu('标题: 测试\n调号: D\n拍号: 3/4\n速度: 90\n[C] 1/ 2/ 3 - | 5. 6/ 1\' | 0 - - |');
 assert.equal(s.bpm,90); assert.equal(s.meter[0],3); assert.equal(s.notes[0].midi,62);
 assert.equal(s.notes[2].dur,2); assert.equal(s.notes[3].dur,1.5); assert.equal(s.notes[5].midi,74);
 assert.equal(s.measures.length,3); assert.equal(s.notes.at(-1).midi,null);
});
test('电子谱：声部、八分音符、和弦与连音不重复起音',()=>{
 const xml='<score-partwise><work><work-title>测试曲</work-title></work><part-list><score-part id="P1"><part-name>人声</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><direction><sound tempo="100"/></direction><harmony><root><root-step>C</root-step></root><kind>major</kind></harmony><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><tie type="start"/></note><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><tie type="stop"/></note><note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration></note><note><chord/><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration></note></measure></part></score-partwise>';
 const s=parseMusicXML(xml,new DOMParser()); assert.equal(s.bpm,100); assert.equal(s.parts.length,1);
 assert.equal(s.notes[0].dur,1); assert.equal(s.notes.length,3); assert.equal(s.notes[1].beat,s.notes[2].beat);
 assert.equal(s.chords[0].root,0);
});
test('时间线：选段、移调和循环映射不越界',()=>{
 const s=parseJianpu('1 2 3 4 | 5 6 7 1\' |');
 const t=buildTimeline(s,{start:1,end:1,bpm:120,transpose:-2});
 assert.equal(t.events.length,4); assert.equal(t.events[0].time,0); assert.equal(t.events[0].midi,65);
 assert.equal(t.duration,2);
});
test('检测：纯音与带泛音的歌声模型，静音不给音高',()=>{
 const sr=48000,n=4096; const wave=Float32Array.from({length:n},(_,i)=>.4*Math.sin(2*Math.PI*220*i/sr)+.1*Math.sin(2*Math.PI*440*i/sr));
 const p=detectPitch(wave,sr); assert.ok(Math.abs(p.hz-220)<2); assert.ok(p.clarity>.85);
 assert.equal(detectPitch(new Float32Array(n),sr).hz,null);
});
test('跟谱：任意起点以及跳到另一段后恢复',()=>{
 const s=parseJianpu('1 2 3 4 | 5 3 6 2 | 7 4 1\' 5 |');
 const f=new Follower(s.notes);
 let r; for(const midi of [67,64,69,62]) r=f.observe(midi,1);
 assert.equal(r.index,7); assert.equal(r.confident,true);
 for(const midi of [71,65,72,67]) r=f.observe(midi,1);
 assert.equal(r.index,11); assert.equal(r.confident,true);
});
test('跟谱：完全重复的旋律保留歧义',()=>{
 const s=parseJianpu('1 2 3 4 | 1 2 3 4 |'); const f=new Follower(s.notes);
 let r;for(const n of [60,62,64,65])r=f.observe(n,1);assert.equal(r.confident,false);assert.ok(r.candidates.length>=2);
});
test('总结：偏高偏低不抵消，无定位和无声不伪造分数',()=>{
 const frames=[{t:0,hz:440,voiced:true,cents:60,index:0,confident:true},{t:.1,hz:440,voiced:true,cents:-60,index:1,confident:true},{t:.2,hz:440,voiced:true,confident:false},{t:.3,hz:null,voiced:false}];
 const r=summarize(frames,35);assert.equal(r.inTune,0);assert.equal(r.high,1);assert.equal(r.low,1);assert.equal(r.coverage,2/3);assert.equal(summarize([],35).inTune,null);
});
