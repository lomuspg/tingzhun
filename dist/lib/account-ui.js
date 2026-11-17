import{CloudAccount,ACCOUNT_ORIGIN}from'./account.js';
import{DEFAULT_PREFERENCES,cleanPreferences,cloudRecord}from'./sync-data.js';
import{records,setRecordOwner,getRecordOwner,createRecordScope,guestRecords}from'./storage.js';
const $=id=>document.getElementById(id);
export function createAccountUI(hooks){
 const client=new CloudAccount(window.location.origin===ACCOUNT_ORIGIN),pending=new Map(),deleting=new Set();
 let cloud=[],ready=false,error='',preferences={...DEFAULT_PREFERENCES},epoch=0,checking=false,destroyed=false;
 const signed=()=>!!client.identity.authenticated;
 const capture=()=>({epoch,owner:client.identity.userId,scope:createRecordScope()});
 const current=s=>!destroyed&&s.epoch===epoch&&signed()&&s.owner===client.identity.userId&&getRecordOwner()===s.owner;
 const recordKey=(owner,id)=>owner+'\0'+id;
 const channel=typeof window.BroadcastChannel==='function'?new window.BroadcastChannel('tingzhun-account'):null;
 function notify(){const signal={type:'account-changed',nonce:crypto.randomUUID()};channel?.postMessage(signal);try{window.localStorage.setItem('tingzhun-account-event',JSON.stringify(signal));}catch{}}
 const ui={
  get signedIn(){return signed();},get ready(){return ready&&!checking&&!destroyed;},get owner(){return client.identity.userId||'guest';},
  async init(){
   const ownEpoch=++epoch;$('accountMenu').disabled=true;$('start').disabled=true;
   try{
    const me=await client.load();if(ownEpoch!==epoch)return;
    if(me.authenticated){await setRecordOwner(me.userId,me.vaultKey);if(ownEpoch!==epoch)return;preferences=cleanPreferences(me.preferences);hooks.applyPreferences(preferences);const list=await client.list();if(ownEpoch===epoch)cloud=list;}
    else{await setRecordOwner('guest');try{preferences=cleanPreferences(JSON.parse(window.localStorage.getItem('tingzhun-guest-preferences')||'{}'));}catch{}hooks.applyPreferences(preferences);}
   }catch(e){if(ownEpoch!==epoch)return;if(e.status===401)await lock(e.message);else{error=e.message;if(!signed())await setRecordOwner('guest');}}
   finally{ready=true;$('accountMenu').disabled=false;$('start').disabled=false;render();}
   if(window.location.hash==='#account'){notify();open();}
  },
  merge(local){const owner=getRecordOwner(),combined=new Map((signed()&&owner===client.identity.userId?cloud:[]).map(s=>[s.id,s]));for(const s of local)if(s.ownerKey==null||s.ownerKey===owner)combined.set(s.id,s);return[...combined.values()].filter(s=>!deleting.has(recordKey(owner,s.id))).sort((a,b)=>b.created.localeCompare(a.created));},
  badge(s){return signed()?(s.cloudOnly?'云端摘要 · 录音在原设备':s.syncState==='synced'?'摘要已同步 · 录音在本机':s.syncState==='capacity'?'容量已满 · 本机保留':s.syncState==='error'?'待重试 · 本机保留':'本机记录 · 待同步'):'游客 · 本机记录';},
  sync(s,refresh=true){
   if(!signed())return Promise.resolve(false);const snapshot=capture(),key=recordKey(snapshot.owner,s.id);if(!current(snapshot)||deleting.has(key))return Promise.resolve(false);if(pending.has(key))return pending.get(key);
   const task=syncRecord(s,snapshot,key,refresh).finally(()=>{if(pending.get(key)===task)pending.delete(key);});pending.set(key,task);return task;
  },
  async remove(s){
   const snapshot=capture(),key=recordKey(snapshot.owner||'guest',s.id);deleting.add(key);
   try{
    if(signed()){
     await pending.get(key);if(!current(snapshot))throw Error('账号已变化，请在原账号重新操作。');
     try{await client.remove(s.id);}catch(e){if(e.status===401)await lock(e.message);if(e.status!==404)throw e;}
     await snapshot.scope.remove(s.id);if(current(snapshot))cloud=cloud.filter(r=>r.id!==s.id);
    }else await snapshot.scope.remove(s.id);
   }catch(e){deleting.delete(key);throw e;}
  },
  async revalidate(){
   if(!signed()||checking||destroyed)return;checking=true;const snapshot=capture();hooks.freeze?.();
   try{const me=await client.request('/api/me');if(!current(snapshot))return;if(!me.authenticated||me.userId!==snapshot.owner)await lock('账号状态已变化，请重新登录。');}
   catch(e){if(current(snapshot))await lock(e.message);}
   finally{checking=false;if(!destroyed&&snapshot.epoch===epoch)hooks.unfreeze?.();}
  },
  destroy(){destroyed=true;epoch++;channel?.close();window.removeEventListener('focus',onFocus);window.removeEventListener('blur',onBlur);window.removeEventListener('storage',onStorage);document.removeEventListener('visibilitychange',onVisibility);},
  open,
 };
 async function syncRecord(s,snapshot,key,refresh){
  try{
   await client.save(s);if(!current(snapshot)||deleting.has(key))return false;
   s.syncState='synced';s.syncedAt=new Date().toISOString();await snapshot.scope.save(s);
   if(!current(snapshot)||deleting.has(key))return false;error='';cloud=[cloudRecord(s),...cloud.filter(r=>r.id!==s.id)];
   if(refresh)await hooks.refresh();if(current(snapshot))render();return true;
  }catch(e){
   if(!current(snapshot)||deleting.has(key))return false;if(e.status===401){await lock(e.message);return false;}
   error=e.message;s.syncState=e.code==='capacity'?'capacity':'error';try{await snapshot.scope.save(s);}catch{}
   if(!current(snapshot)||deleting.has(key))return false;if(refresh)await hooks.refresh();if(current(snapshot)){render();hooks.toast('摘要未同步：'+e.message);}return false;
  }
 }
 function render(){
  if(destroyed)return;
  $('accountMenu').textContent=signed()?preferences.nickname+' · 个人账号':'游客 · 登录同步';$('accountTitle').textContent=signed()?preferences.nickname:'游客与个人账号';
  $('guestAccount').hidden=signed();$('personalAccount').hidden=!signed();$('nickname').value=preferences.nickname;
  $('accountDescription').textContent=signed()?'当前仅展示这个账号的练习记录。原始录音和细曲线保存在本机。':'游客记录不与其他设备共享；登录后可同步个人摘要与偏好。';
  $('historyIntro').textContent=signed()?'个人摘要跨设备同步。原始录音与详细曲线保存在录制设备，账号之间相互隔离。':'游客记录只保存在当前浏览器。共用设备请登录个人账号。';
  $('accountStatus').textContent=error?'同步状态：'+error:signed()?'个人账号 · 摘要同步 · 录音本机加密保存':'游客 · 本机保存 · 不上传';
  $('refreshCloud').hidden=!signed();$('retrySync').hidden=!signed();
  $('signIn').href=ACCOUNT_ORIGIN+'/signin-with-chatgpt?return_to=%2F%23account';$('signOut').href=ACCOUNT_ORIGIN+'/signout-with-chatgpt?return_to=%2F';
  $('originNotice').textContent=client.enabled?'无需付费订阅，不使用短信或付费邮件服务。':'账号功能在主站提供。两个网址的本机游客记录独立；已有录音可先导出备份，再到主站导入。';
 }
 function open(){if(hooks.busy()){hooks.toast('请先结束或保存当前练习，再操作账号。');return;}render();$('accountDialog').showModal();}
 async function lock(message){
  if(destroyed)return;const ownEpoch=++epoch;client.identity={authenticated:false};cloud=[];error=message||'登录已失效，请重新登录。';hooks.freeze?.();
  await hooks.stopForAccountChange?.();if(ownEpoch!==epoch)return;
  await setRecordOwner('guest');if(ownEpoch!==epoch)return;
  preferences={...DEFAULT_PREFERENCES};hooks.clear();hooks.applyPreferences(preferences);await hooks.refresh();if(ownEpoch===epoch){render();hooks.unfreeze?.();}
 }
 function onFocus(){void ui.revalidate();}
 function onBlur(){if(signed())hooks.freeze?.();}
 function onVisibility(){if(document.visibilityState==='visible')onFocus();else onBlur();}
 function onStorage(event){if(event.key==='tingzhun-account-event'&&signed())void lock('另一个标签页正在切换账号，请重新确认登录。');}
 if(channel)channel.onmessage=e=>{if(e.data?.type==='account-changed'&&signed())void lock('另一个标签页正在切换账号，请重新确认登录。');};
 window.addEventListener('focus',onFocus);window.addEventListener('blur',onBlur);window.addEventListener('storage',onStorage);document.addEventListener('visibilitychange',onVisibility);
 $('accountMenu').onclick=open;$('closeAccount').onclick=()=>$('accountDialog').close();
 $('signIn').onclick=$('signOut').onclick=e=>{if(hooks.busy()){e.preventDefault();hooks.toast('请先结束并保存当前练习。');return;}notify();if(signed())void lock('本机账号记录已锁定。');};
 $('savePreferences').onclick=async()=>{
  if(hooks.busy())return;const snapshot=capture();
  try{const next=cleanPreferences({...hooks.getOptions(),nickname:$('nickname').value});if(signed()){const saved=await client.preferences(next);if(!current(snapshot))return;preferences=saved;}else{window.localStorage.setItem('tingzhun-guest-preferences',JSON.stringify(next));preferences=next;}error='';render();hooks.toast(signed()?'个人偏好已同步。':'本机偏好已保存。');}
  catch(e){if(e.status===401&&current(snapshot))await lock(e.message);else if(snapshot.epoch===epoch)hooks.toast(e.message);}
 };
 $('refreshCloud').onclick=async()=>{
  if(hooks.busy())return;const snapshot=capture();try{const list=await client.list();if(!current(snapshot))return;cloud=list;error='';await hooks.refresh();if(current(snapshot)){render();hooks.toast('个人摘要已刷新。');}}
  catch(e){if(!current(snapshot))return;if(e.status===401)await lock(e.message);else{error=e.message;render();hooks.toast(e.message);}}
 };
 $('retrySync').onclick=async()=>{if(hooks.busy())return;const snapshot=capture();$('retrySync').disabled=true;try{for(const s of(await snapshot.scope.list()).filter(s=>s.syncState!=='synced'&&!s.cloudOnly)){if(!current(snapshot)||!await ui.sync(s,false))break;}if(current(snapshot)){await hooks.refresh();render();}}finally{if(!destroyed)$('retrySync').disabled=false;}};
 $('importGuests').onclick=async()=>{
  if(hooks.busy()||!signed())return;const snapshot=capture();let guests;try{guests=await guestRecords();}catch(e){hooks.toast(e.message);return;}if(!current(snapshot))return;
  if(!guests.length){hooks.toast('当前网址没有本机游客记录。另一个网址的记录需要通过备份导入。');return;}
  if(!window.confirm(`将 ${guests.length} 条本机游客记录复制到当前个人账号？只同步摘要，录音保存在本机；游客原件会保留。`))return;
  $('importGuests').disabled=true;try{const imported=new Set((await snapshot.scope.list()).map(s=>s.importedFromGuestId));let count=0;
   for(const s of guests){if(!current(snapshot))break;if(imported.has(s.id))continue;const copy={...s,id:crypto.randomUUID(),importedFromGuestId:s.id,syncState:'pending'};delete copy.ownerKey;await snapshot.scope.save(copy);if(!current(snapshot))break;await ui.sync(copy,false);count++;}
   if(current(snapshot)){await hooks.refresh();render();hooks.toast(`已复制 ${count} 条记录。游客原件仍保留；摘要同步状态见记录列表。`);}
  }catch(e){if(snapshot.epoch===epoch)hooks.toast(e.message);}finally{if(!destroyed)$('importGuests').disabled=false;}
 };
 return ui;
}
