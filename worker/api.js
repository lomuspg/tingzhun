import{cloudRecord,cleanPreferences}from'../dist/lib/sync-data.js';
class ApiError extends Error{constructor(message,status=400,code='invalid'){super(message);this.status=status;this.code=code;}}
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','Vary':'Cookie, Origin','X-Content-Type-Options':'nosniff'}});
async function account(env,user){
 let row=await env.DB.prepare('SELECT vault_key, preferences FROM accounts WHERE user_id = ?').bind(user).first();if(row)return row;
 const total=await env.DB.prepare('SELECT COUNT(*) AS count FROM accounts WHERE ? = ?').bind(1,1).first();if(total.count>=2000)throw new ApiError('免费账号容量已满，游客练唱仍可使用。',409,'capacity');
 const key=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
 await env.DB.prepare('INSERT OR IGNORE INTO accounts (user_id, vault_key, preferences, updated_at) VALUES (?, ?, ?, ?)').bind(user,key,JSON.stringify(cleanPreferences()),Date.now()).run();
 return await env.DB.prepare('SELECT vault_key, preferences FROM accounts WHERE user_id = ?').bind(user).first();
}
async function body(request){const length=Number(request.headers.get('Content-Length')||0);if(length>140000)throw new ApiError('同步摘要超过单条免费容量。',413,'capacity');const text=await request.text();if(new TextEncoder().encode(text).length>140000)throw new ApiError('同步摘要超过单条免费容量。',413,'capacity');try{return JSON.parse(text);}catch{throw new ApiError('请求内容无效。');}}
export async function handleApi(request,env){
 try{
  const url=new URL(request.url),path=url.pathname,origin=request.headers.get('Origin');
  if(origin&&origin!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')throw new ApiError('请在主站内操作个人记录。',403,'origin');
  // These headers are supplied and protected by the Sites authentication proxy.
  const user=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email'),authenticated=!!user&&!!email;
  if(path==='/api/me'&&request.method==='GET'&&!authenticated)return json({authenticated:false,enabled:!!env.DB,signIn:'/signin-with-chatgpt?return_to=%2F'});
  if(!authenticated)throw new ApiError('请先登录，再访问个人记录。',401,'auth');
  if(!env.DB)throw new ApiError('个人同步暂时不可用，记录仍保留在本机。',503,'unavailable');
  const acc=await account(env,user);
  if(path==='/api/me'&&request.method==='GET')return json({authenticated:true,userId:user,vaultKey:acc.vault_key,preferences:cleanPreferences(JSON.parse(acc.preferences)),signOut:'/signout-with-chatgpt?return_to=%2F',limits:{records:100,perUserBytes:2097152}});
  if(path==='/api/preferences'){
   if(request.method==='GET')return json({preferences:cleanPreferences(JSON.parse(acc.preferences))});
   if(request.method==='PUT'){let preferences;try{preferences=cleanPreferences(await body(request));}catch(e){if(e instanceof ApiError)throw e;throw new ApiError(e.message);}await env.DB.prepare('UPDATE accounts SET preferences = ?, updated_at = ? WHERE user_id = ?').bind(JSON.stringify(preferences),Date.now(),user).run();return json({preferences});}
  }
  if(path==='/api/sessions'&&request.method==='GET'){
   const rows=await env.DB.prepare('SELECT payload FROM cloud_sessions WHERE user_id = ? ORDER BY created DESC LIMIT 100').bind(user).all();
   return json({records:rows.results.map(row=>JSON.parse(row.payload))});
  }
  if(path==='/api/sessions'&&request.method==='PUT'){
   const data=await body(request),raw=data?.record;
   if(!raw||['owner','ownerKey','userId','user_id','vaultKey'].some(k=>k in raw)||raw.audio||raw.frames?.length)throw new ApiError('只接收当前账号的摘要，录音和详细曲线不上传。');
   let record;try{record=cloudRecord(raw);}catch(e){throw new ApiError(e.message);}
   const payload=JSON.stringify(record),bytes=new TextEncoder().encode(payload).length;
   if(bytes>131072)throw new ApiError('此曲谱和摘要超过单条免费同步容量，完整记录仍保留在本机。',413,'capacity');
   const query=`INSERT INTO cloud_sessions (user_id, session_id, payload, bytes, created, updated_at)
    SELECT ?, ?, ?, ?, ?, ? WHERE
    (SELECT COUNT(*) FROM cloud_sessions WHERE user_id = ? AND session_id <> ?) < 100
    AND (SELECT COALESCE(SUM(bytes),0) FROM cloud_sessions WHERE user_id = ? AND session_id <> ?) + ? <= 2097152
    AND (SELECT COALESCE(SUM(bytes),0) FROM cloud_sessions WHERE NOT (user_id = ? AND session_id = ?)) + ? <= 41943040
    ON CONFLICT(user_id,session_id) DO UPDATE SET payload=excluded.payload,bytes=excluded.bytes,created=excluded.created,updated_at=excluded.updated_at`;
   const result=await env.DB.prepare(query).bind(user,record.id,payload,bytes,record.created,Date.now(),user,record.id,user,record.id,bytes,user,record.id,bytes).run();
   if(!result.meta?.changes)throw new ApiError('免费摘要容量已满，录音仍保留在本机。可导出备份或删除旧摘要后重试。',409,'capacity');return json({saved:true,id:record.id});
  }
  if(path.startsWith('/api/sessions/')&&request.method==='DELETE'){
   const id=path.slice('/api/sessions/'.length);if(!/^[-a-z0-9]{1,80}$/i.test(id))throw new ApiError('记录编号无效。');
   const result=await env.DB.prepare('DELETE FROM cloud_sessions WHERE user_id = ? AND session_id = ?').bind(user,id).run();if(!result.meta?.changes)throw new ApiError('当前账号没有这份记录。',404,'missing');return json({deleted:true});
  }
  return json({error:'找不到此接口。',code:'missing'},404);
 }catch(e){return json({error:e instanceof ApiError?e.message:'个人同步暂时不可用，记录仍保留在本机。',code:e.code||'unavailable'},e.status||503);}
}
