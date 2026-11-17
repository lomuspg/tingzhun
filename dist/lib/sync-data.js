import {decodeSession} from './storage.js';
export const DEFAULT_PREFERENCES={nickname:'我的练唱室',mode:'piano',tolerance:35,melodyVolume:.65,backingVolume:.55,countIn:true,loop:false};
const number=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
export function cleanPreferences(value={}){
 const p={...DEFAULT_PREFERENCES,...value};
 if(typeof p.nickname!=='string'||p.nickname.trim().length<1||p.nickname.length>32||!['piano','beat','free'].includes(p.mode)||![20,35,50].includes(p.tolerance)||!number(p.melodyVolume,0,1)||!number(p.backingVolume,0,1)||typeof p.countIn!=='boolean'||typeof p.loop!=='boolean')throw Error('个人偏好格式无效。');
 return Object.fromEntries(Object.keys(DEFAULT_PREFERENCES).map(k=>[k,k==='nickname'?p[k].trim():p[k]]));
}
export function cloudRecord(session){
 if(!session||typeof session.id!=='string'||!/^[-a-z0-9]{1,80}$/i.test(session.id))throw Error('记录编号无效。');
 const s=decodeSession({format:'tingzhun-session',version:1,session:{...session,frames:[],audio:null}});
 const r=session.summary;if(!r||!['voiced','valid','high','low','good'].every(k=>Number.isInteger(r[k])&&r[k]>=0&&r[k]<=30000)||!number(r.coverage,0,1)||(r.inTune!==null&&!number(r.inTune,0,1))||(r.meanAbs!==null&&!number(r.meanAbs,0,12000))||(r.timing!==null&&!number(r.timing,-5,5)))throw Error('练习摘要格式无效。');
 const passages=(Array.isArray(r.passages)?r.passages:[]).slice(0,12).map(p=>{
  if(!Number.isInteger(p.measure)||p.measure<0||p.measure>=s.score.measures.length||!Number.isInteger(p.lap)||p.lap<0||!number(p.start,0,1900)||!number(p.end,p.start,1900)||!number(p.meanAbs,0,12000)||!['偏高','偏低'].includes(p.direction)||!Number.isInteger(p.valid)||p.valid<0||!Number.isInteger(p.bad)||p.bad<0||p.bad>p.valid)throw Error('小节摘要格式无效。');
  return{key:`${p.lap}:${p.measure}`,measure:p.measure,lap:p.lap,start:p.start,end:p.end,valid:p.valid,bad:p.bad,meanAbs:p.meanAbs,direction:p.direction};
 });
 const options={mode:s.options.mode,bpm:s.options.bpm,start:s.options.start,end:s.options.end,transpose:s.options.transpose,tolerance:s.options.tolerance,loop:!!s.options.loop,countIn:s.options.countIn!==false,melodyVolume:number(s.options.melodyVolume,0,1)?s.options.melodyVolume:.65,backingVolume:number(s.options.backingVolume,0,1)?s.options.backingVolume:.55};
 return{id:session.id,created:s.created,duration:s.duration,score:s.score,options,frames:[],audio:null,cloudOnly:true,summary:{voiced:r.voiced,valid:r.valid,coverage:r.coverage,high:r.high,low:r.low,good:r.good,inTune:r.inTune,meanAbs:r.meanAbs,timing:r.timing,passages}};
}
