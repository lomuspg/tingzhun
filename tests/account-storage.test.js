import{test}from'node:test';import assert from'node:assert/strict';import{IDBFactory}from'fake-indexeddb';import{records,setRecordOwner,database,encodeSession}from'../dist/lib/storage.js';import{parseJianpu,summarize}from'../dist/lib/core.js';
function record(title){const score=parseJianpu(`标题: ${title}\n速度: 80\n1 2 3 4 |`);score.melodyId='melody';return{id:crypto.randomUUID(),created:new Date().toISOString(),duration:1,score,options:{mode:'free',bpm:80,start:0,end:0,transpose:0,tolerance:35},frames:[],audio:new Blob(['private-audio'],{type:'audio/webm;codecs=opus'}),summary:summarize([],35)};}
test('游客记录迁移保留，两个账号本机记录隔离且加密保存',async()=>{
 globalThis.indexedDB=new IDBFactory();const legacy=record('游客旧录音');await new Promise((resolve,reject)=>{const r=indexedDB.open('tingzhun-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('sessions',{keyPath:'id'});r.onsuccess=()=>{const tx=r.result.transaction('sessions','readwrite');tx.objectStore('sessions').put(legacy);tx.oncomplete=()=>{r.result.close();resolve();};};r.onerror=reject;});
 await setRecordOwner('guest');assert.equal((await records('list'))[0].score.title,'游客旧录音');
 const keyA=btoa(String.fromCharCode(...new Uint8Array(32).fill(1))),keyB=btoa(String.fromCharCode(...new Uint8Array(32).fill(2)));
 await setRecordOwner('alice',keyA);const a=record('Alice私密练习');await records('save',a);assert.equal((await records('list')).length,1);
 const db=await database(),raw=await new Promise(resolve=>{const r=db.transaction('owned_sessions').objectStore('owned_sessions').get(['alice',a.id]);r.onsuccess=()=>resolve(r.result);});db.close();assert.ok(raw.cipher);assert.equal(raw.score,undefined);assert.equal(raw.audio,undefined);assert.equal(raw.vaultKey,undefined);
 await setRecordOwner('bob',keyB);assert.equal((await records('list')).length,0);await records('delete',a.id);
 await setRecordOwner('alice',keyA);const restored=(await records('list'))[0];assert.equal(restored.score.title,'Alice私密练习');assert.equal(await restored.audio.text(),'private-audio');assert.equal(restored.id,a.id);
 const backup=await encodeSession(restored);assert.equal(backup.session.ownerKey,undefined);assert.equal(backup.session.vaultKey,undefined);
 await setRecordOwner('guest');assert.deepEqual((await records('list')).map(s=>s.id),[legacy.id]);
});
