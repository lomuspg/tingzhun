import{cloudRecord,cleanPreferences}from'./sync-data.js';
export const ACCOUNT_ORIGIN='https://tingzhun-practice.jokeycamel4.chatgpt.site';
export class CloudAccount{
 constructor(enabled=false,fetcher=(...args)=>fetch(...args)){this.enabled=enabled;this.fetcher=fetcher;this.identity={authenticated:false};}
 async request(path,options={}){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000),expected=this.identity.userId;try{const response=await this.fetcher(path,{...options,credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json',...(expected?{'X-Tingzhun-Account':expected}:{}),...options.headers}});let data;try{data=await response.json();}catch{throw Error('账号同步返回格式异常，完整记录仍保留在本机。');}if(!response.ok){const error=Error(data.error||'账号同步暂不可用。');error.status=response.status;error.code=data.code;throw error;}if(expected&&path!=='/api/me'&&response.headers.get('X-Tingzhun-User')!==expected){const e=Error('账号状态已变化，请刷新或重新登录。');e.status=401;e.code='identity-changed';throw e;}return data;}catch(e){if(e.name==='AbortError')throw Error('同步连接超时，记录已保留在本机，可以稍后重试。');throw e;}finally{clearTimeout(timer);}}
 async load(){if(!this.enabled)return this.identity={authenticated:false,enabled:false};return this.identity=await this.request('/api/me');}
 async list(){if(!this.identity.authenticated)return[];const data=await this.request('/api/sessions');return data.records.map(cloudRecord);}
 async save(session){if(!this.identity.authenticated)throw Error('请登录后同步。');return this.request('/api/sessions',{method:'PUT',body:JSON.stringify({record:cloudRecord(session)})});}
 async remove(id){if(!this.identity.authenticated)throw Error('请登录后删除个人云端摘要。');return this.request('/api/sessions/'+encodeURIComponent(id),{method:'DELETE'});}
 async preferences(value){const data=await this.request('/api/preferences',{method:'PUT',body:JSON.stringify(cleanPreferences(value))});this.identity.preferences=data.preferences;return data.preferences;}
}
