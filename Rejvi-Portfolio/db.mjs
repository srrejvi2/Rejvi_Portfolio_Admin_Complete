import {upgrade} from './defaults.mjs';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,existsSync,readdirSync,statSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {bundledArticles} from './article-seed.mjs';

export const root=dirname(fileURLToPath(import.meta.url));
export const dataDir=resolve(process.env.DATA_DIR||resolve(root,'data'));
mkdirSync(dataDir,{recursive:true});

const supabaseUrl=String(process.env.SUPABASE_URL||'').replace(/\/+$/,'');
const supabaseKey=String(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
export const remoteStorage=Boolean(supabaseUrl&&supabaseKey);
export const mediaBucket=process.env.SUPABASE_MEDIA_BUCKET||'rejvi-media';
const stateBucket=process.env.SUPABASE_STATE_BUCKET||'rejvi-state';
const stateObject='portfolio-state.json';

export let db;
let state=null;
let supabase=null;
let dirty=false;
let saveChain=Promise.resolve();
let txBackup=null;

const clone=x=>structuredClone(x);
const nextId=rows=>rows.length?Math.max(...rows.map(x=>Number(x.id)||0))+1:1;
const nowIso=()=>new Date().toISOString();

function emptyState(){
 return {
  version:4,
  content:readFileSync(resolve(root,'seed.json'),'utf8'),
  admin:null,
  sessions:[],messages:[],limits:[],articles:[],comments:[],reactions:[],content_history:[],
  settings:{},media:[],subscribers:[],visitors:[]
 };
}

function ensureShape(s){
 const base=emptyState(),out={...base,...(s||{})};
 for(const k of ['sessions','messages','limits','articles','comments','reactions','content_history','media','subscribers','visitors'])if(!Array.isArray(out[k]))out[k]=[];
 if(!out.settings||typeof out.settings!=='object'||Array.isArray(out.settings))out.settings={};
 if(typeof out.content!=='string')out.content=JSON.stringify(out.content||JSON.parse(base.content));
 out.version=4;
 return out;
}

async function initSupabase(){
 const {createClient}=await import('@supabase/supabase-js');
 supabase=createClient(supabaseUrl,supabaseKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 async function ensureBucket(name,isPublic,opts={}){
  const {data,error}=await supabase.storage.getBucket(name);
  if(!error&&data){
   if(Boolean(data.public)!==Boolean(isPublic))await supabase.storage.updateBucket(name,{public:isPublic,...opts});
   return;
  }
  const created=await supabase.storage.createBucket(name,{public:isPublic,...opts});
  if(created.error&&!/already exists|duplicate/i.test(created.error.message||''))throw new Error(`Supabase bucket ${name}: ${created.error.message}`);
 }
 await ensureBucket(stateBucket,false,{fileSizeLimit:'5MB',allowedMimeTypes:['application/json']});
 await ensureBucket(mediaBucket,true,{fileSizeLimit:'2MB',allowedMimeTypes:['image/png','image/jpeg','image/webp','application/pdf']});

 const downloaded=await supabase.storage.from(stateBucket).download(stateObject);
 if(!downloaded.error){
  state=ensureShape(JSON.parse(await downloaded.data.text()));
  return;
 }
 if(!/not found|does not exist|404|object/i.test(downloaded.error.message||''))throw new Error(`Cannot load Supabase state: ${downloaded.error.message}`);
 state=await migrateLegacyState();
 state=ensureShape(state);
 dirty=true;
 await flushState();
}

function safeAll(db,sql){try{return db.prepare(sql).all();}catch{return [];}}
function safeGet(db,sql){try{return db.prepare(sql).get();}catch{return undefined;}}

async function migrateLegacyState(){
 const s=emptyState();
 const dbPath=resolve(dataDir,'portfolio.sqlite');
 if(existsSync(dbPath)){
  const legacy=new DatabaseSync(dbPath,{readOnly:true});
  const content=safeGet(legacy,'SELECT json FROM content WHERE id=1');if(content?.json)s.content=content.json;
  s.admin=safeGet(legacy,'SELECT * FROM admin WHERE id=1')||null;
  s.messages=safeAll(legacy,'SELECT * FROM messages');
  s.articles=safeAll(legacy,'SELECT * FROM articles');
  s.comments=safeAll(legacy,'SELECT * FROM comments');
  s.reactions=safeAll(legacy,'SELECT * FROM reactions');
  s.content_history=safeAll(legacy,'SELECT * FROM content_history');
  for(const row of safeAll(legacy,'SELECT * FROM settings'))s.settings[row.key]=row.value;
  legacy.close();
 }
 s.sessions=[];s.limits=[];

 const uploadDir=resolve(dataDir,'uploads'),replacements=new Map();
 if(existsSync(uploadDir)){
  for(const name of readdirSync(uploadDir)){
   if(!/^[a-f0-9]+\.(png|jpg|webp|pdf)$/.test(name))continue;
   const filePath=resolve(uploadDir,name),buf=readFileSync(filePath),mime=mimeFromName(name);
   const up=await supabase.storage.from(mediaBucket).upload(name,buf,{contentType:mime,upsert:true,cacheControl:'31536000'});
   if(up.error){console.error(`Could not migrate ${name}: ${up.error.message}`);continue;}
   const url=publicMediaUrl(name),st=statSync(filePath);
   replacements.set('/uploads/'+name,url);
   s.media.push({name,url,size:st.size,created:st.mtime.toISOString(),mime});
  }
 }
 if(replacements.size){
  let content=s.content;
  for(const [from,to] of replacements)content=content.split(from).join(to);
  s.content=content;
  s.articles=s.articles.map(a=>{let body=String(a.body||''),cover=String(a.cover||'');for(const [from,to] of replacements){body=body.split(from).join(to);cover=cover.split(from).join(to);}return {...a,body,cover};});
  s.content_history=s.content_history.map(h=>{let json=String(h.json||'');for(const [from,to] of replacements)json=json.split(from).join(to);return {...h,json};});
 }
 console.log(`Supabase initialized${existsSync(dbPath)?' from existing SQLite data':''}${s.media.length?` with ${s.media.length} media file(s)`:''}.`);
 return s;
}

function publicMediaUrl(name){return `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(mediaBucket)}/${encodeURIComponent(name)}`;}
function mimeFromName(name){return name.endsWith('.png')?'image/png':name.endsWith('.jpg')?'image/jpeg':name.endsWith('.webp')?'image/webp':'application/pdf';}

export async function flushState(){
 if(!remoteStorage||!dirty)return saveChain;
 const snapshot=JSON.stringify(state);
 dirty=false;
 saveChain=saveChain.then(async()=>{
  const r=await supabase.storage.from(stateBucket).upload(stateObject,new Blob([snapshot],{type:'application/json'}),{contentType:'application/json',upsert:true,cacheControl:'0'});
  if(r.error){dirty=true;throw new Error(`Supabase state save failed: ${r.error.message}`);}
 });
 return saveChain;
}
function markDirty(){if(remoteStorage)dirty=true;}

export async function listMedia(){
 if(remoteStorage)return clone(state.media).sort((a,b)=>String(b.created).localeCompare(String(a.created)));
 const {readdir,stat,mkdir}=await import('node:fs/promises');
 await mkdir(resolve(dataDir,'uploads'),{recursive:true});
 const names=await readdir(resolve(dataDir,'uploads'));
 return Promise.all(names.filter(n=>/^[a-f0-9]+\.(png|jpg|webp|pdf)$/.test(n)).map(async name=>{const f=await stat(resolve(dataDir,'uploads',name));return {name,url:'/uploads/'+name,size:f.size,created:f.mtime.toISOString(),mime:mimeFromName(name)};}));
}
export async function saveMedia(name,buf){
 const mime=mimeFromName(name);
 if(remoteStorage){
  const up=await supabase.storage.from(mediaBucket).upload(name,buf,{contentType:mime,upsert:false,cacheControl:'31536000'});
  if(up.error)throw new Error(`Media upload failed: ${up.error.message}`);
  const item={name,url:publicMediaUrl(name),size:buf.length,created:nowIso(),mime};state.media.push(item);markDirty();await flushState();return clone(item);
 }
 const {mkdir,writeFile}=await import('node:fs/promises');await mkdir(resolve(dataDir,'uploads'),{recursive:true});await writeFile(resolve(dataDir,'uploads',name),buf);return {name,url:'/uploads/'+name,size:buf.length,created:nowIso(),mime};
}
export async function removeMedia(name){
 if(remoteStorage){
  const r=await supabase.storage.from(mediaBucket).remove([name]);if(r.error)throw new Error(`Media delete failed: ${r.error.message}`);
  const before=state.media.length;state.media=state.media.filter(x=>x.name!==name);if(before===state.media.length)return false;markDirty();await flushState();return true;
 }
 const {unlink}=await import('node:fs/promises');try{await unlink(resolve(dataDir,'uploads',name));return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}
}

function normalize(sql){return String(sql).replace(/\s+/g,' ').trim();}
function sortDesc(rows,...keys){return rows.sort((a,b)=>{for(const k of keys){const av=a[k]??'',bv=b[k]??'';if(av>bv)return -1;if(av<bv)return 1;}return 0;});}
function likeMatch(value,pattern){const needle=String(pattern||'').replace(/^%|%$/g,'');return String(value||'').includes(needle);}
function getStmt(sql){
 const q=normalize(sql),low=q.toLowerCase();
 return {
  get(...p){
   if(low==='select value from settings where key=?')return state.settings[p[0]]===undefined?undefined:{value:state.settings[p[0]]};
   if(low==='select * from articles where slug=? and status=?')return clone(state.articles.find(x=>x.slug===p[0]&&x.status===p[1]));
   if(low==="select * from articles where slug=? and status='published'")return clone(state.articles.find(x=>x.slug===p[0]&&x.status==='published'));
   if(low==='select kind from reactions where article_id=? and visitor=?')return clone(state.reactions.find(x=>Number(x.article_id)===Number(p[0])&&x.visitor===p[1]));
   if(low==='select id from articles where slug=?')return state.articles.find(x=>x.slug===p[0])?{id:state.articles.find(x=>x.slug===p[0]).id}:undefined;
   if(low==='select id from articles where slug=? and id<>?'){const a=state.articles.find(x=>x.slug===p[0]&&Number(x.id)!==Number(p[1]));return a?{id:a.id}:undefined;}
   if(low==='select * from articles where id=?')return clone(state.articles.find(x=>Number(x.id)===Number(p[0])));
   if(low==='select * from comments where id=?')return clone(state.comments.find(x=>Number(x.id)===Number(p[0])));
   if(low==='select * from limits where key=?')return clone(state.limits.find(x=>x.key===p[0]));
   if(low==='select * from sessions where token=? and expires>?')return clone(state.sessions.find(x=>x.token===p[0]&&Number(x.expires)>Number(p[1])));
   if(low==='select * from admin where id=1'||low==='select * from admin')return clone(state.admin||undefined);
   if(low==='select email from admin')return state.admin?{email:state.admin.email}:undefined;
   if(low==='select json from content where id=1')return {json:state.content};
   if(low==='select * from content_history where id=?')return clone(state.content_history.find(x=>Number(x.id)===Number(p[0])));
   if(low==='select 1 from articles where cover=? or body like ? limit 1'){const a=state.articles.find(x=>x.cover===p[0]||likeMatch(x.body,p[1]));return a?{'1':1}:undefined;}
   throw new Error(`Unsupported remote DB get: ${q}`);
  },
  all(...p){
   if(low==='select kind,count(*) as count from reactions where article_id=? group by kind'){
    const m=new Map();for(const r of state.reactions.filter(x=>Number(x.article_id)===Number(p[0])))m.set(r.kind,(m.get(r.kind)||0)+1);return [...m].map(([kind,count])=>({kind,count}));
   }
   if(low.startsWith('select id,slug,title,excerpt,category,tags,cover,created,updated,published_at,comments from articles where status=')){
    return sortDesc(state.articles.filter(x=>x.status==='published').map(({id,slug,title,excerpt,category,tags,cover,created,updated,published_at,comments})=>({id,slug,title,excerpt,category,tags,cover,created,updated,published_at,comments})),'published_at','id');
   }
   if(low==="select id,name,body,reply,created,replied_at from comments where article_id=? and status='approved' order by id")return state.comments.filter(x=>Number(x.article_id)===Number(p[0])&&x.status==='approved').sort((a,b)=>a.id-b.id).map(({id,name,body,reply,created,replied_at})=>({id,name,body,reply,created,replied_at}));
   if(low==='select * from articles order by updated desc,id desc')return clone(sortDesc([...state.articles],'updated','id'));
   if(low==='select c.*,a.title as article_title,a.slug from comments c join articles a on a.id=c.article_id order by c.id desc limit 2000')return clone([...state.comments].sort((a,b)=>b.id-a.id).slice(0,2000).map(c=>{const a=state.articles.find(x=>Number(x.id)===Number(c.article_id));return {...c,article_title:a?.title||'',slug:a?.slug||''};}));
   if(low==='select id,created from content_history order by id desc')return clone([...state.content_history].sort((a,b)=>b.id-a.id).map(({id,created})=>({id,created})));
   if(low==='select * from messages order by id desc limit 1000')return clone([...state.messages].sort((a,b)=>b.id-a.id).slice(0,1000));
   if(low==='select * from messages order by id desc')return clone([...state.messages].sort((a,b)=>b.id-a.id));
   if(low==='select * from articles')return clone(state.articles);
   if(low==='select * from comments')return clone(state.comments);
   if(low==='select * from reactions')return clone(state.reactions);
   if(low==='select * from settings')return Object.entries(state.settings).map(([key,value])=>({key,value}));
   throw new Error(`Unsupported remote DB all: ${q}`);
  },
  run(...p){
   let result={changes:0,lastInsertRowid:0};
   if(low==='insert or ignore into settings values(?,?)'){if(state.settings[p[0]]===undefined){state.settings[p[0]]=p[1];result.changes=1;markDirty();}return result;}
   if(low.startsWith('insert into comments(article_id,name,email,body,created) values')){const id=nextId(state.comments);state.comments.push({id,article_id:Number(p[0]),name:p[1],email:p[2],body:p[3],status:'pending',reply:'',created:p[4],replied_at:null});markDirty();return {changes:1,lastInsertRowid:id};}
   if(low==='delete from reactions where article_id=? and visitor=?'){const n=state.reactions.length;state.reactions=state.reactions.filter(x=>!(Number(x.article_id)===Number(p[0])&&x.visitor===p[1]));markDirty();return {changes:n-state.reactions.length,lastInsertRowid:0};}
   if(low.startsWith('insert into reactions values(?,?,?) on conflict')){const old=state.reactions.find(x=>Number(x.article_id)===Number(p[0])&&x.visitor===p[1]);if(old)old.kind=p[2];else state.reactions.push({article_id:Number(p[0]),visitor:p[1],kind:p[2]});markDirty();return {changes:1,lastInsertRowid:0};}
   if(low.startsWith('insert into articles(slug,title,excerpt,body,category,tags,cover,status,comments,created,updated,published_at) values')){const id=nextId(state.articles);const [slug,title,excerpt,body,category,tags,cover,status,comments,created,updated,published_at]=p;state.articles.push({id,slug,title,excerpt,body,category,tags,cover,status,comments:Number(comments),created,updated,published_at});markDirty();return {changes:1,lastInsertRowid:id};}
   if(low.startsWith('update articles set slug=?,title=?,excerpt=?,body=?,category=?,tags=?,cover=?,status=?,comments=?,updated=?,published_at=? where id=?')){const a=state.articles.find(x=>Number(x.id)===Number(p[11]));if(!a)return result;Object.assign(a,{slug:p[0],title:p[1],excerpt:p[2],body:p[3],category:p[4],tags:p[5],cover:p[6],status:p[7],comments:Number(p[8]),updated:p[9],published_at:p[10]});markDirty();return {changes:1,lastInsertRowid:0};}
   if(low==='delete from articles where id=?'){const id=Number(p[0]),n=state.articles.length;state.articles=state.articles.filter(x=>Number(x.id)!==id);state.comments=state.comments.filter(x=>Number(x.article_id)!==id);state.reactions=state.reactions.filter(x=>Number(x.article_id)!==id);markDirty();return {changes:n-state.articles.length,lastInsertRowid:0};}
   if(low==='update comments set status=?,reply=?,replied_at=? where id=?'){const c=state.comments.find(x=>Number(x.id)===Number(p[3]));if(!c)return result;Object.assign(c,{status:p[0],reply:p[1],replied_at:p[2]});markDirty();return {changes:1,lastInsertRowid:0};}
   if(low==='delete from comments where id=?'){const n=state.comments.length;state.comments=state.comments.filter(x=>Number(x.id)!==Number(p[0]));markDirty();return {changes:n-state.comments.length,lastInsertRowid:0};}
   if(low==='insert or replace into admin values(1,?,?,?)'||low==='insert into admin values(1,?,?,?)'){state.admin={id:1,email:p[0],salt:p[1],hash:p[2]};markDirty();return {changes:1,lastInsertRowid:1};}
   if(low==='delete from limits where expires<?'){const n=state.limits.length;state.limits=state.limits.filter(x=>Number(x.expires)>=Number(p[0]));if(n!==state.limits.length)markDirty();return {changes:n-state.limits.length,lastInsertRowid:0};}
   if(low==='update limits set count=count+1 where key=?'){const r=state.limits.find(x=>x.key===p[0]);if(r){r.count++;markDirty();return {changes:1,lastInsertRowid:0};}return result;}
   if(low==='insert into limits values(?,1,?)'){state.limits.push({key:p[0],count:1,expires:Number(p[1])});markDirty();return {changes:1,lastInsertRowid:0};}
   if(low==='delete from sessions where expires<?'){const n=state.sessions.length;state.sessions=state.sessions.filter(x=>Number(x.expires)>=Number(p[0]));if(n!==state.sessions.length)markDirty();return {changes:n-state.sessions.length,lastInsertRowid:0};}
   if(low==='insert into sessions values(?,?,?)'){state.sessions=state.sessions.filter(x=>x.token!==p[0]);state.sessions.push({token:p[0],csrf:p[1],expires:Number(p[2])});markDirty();return {changes:1,lastInsertRowid:0};}
   if(low==='update sessions set expires=? where token=?'){const r=state.sessions.find(x=>x.token===p[1]);if(!r)return result;r.expires=Number(p[0]);markDirty();return {changes:1,lastInsertRowid:0};}
   if(low.startsWith('insert into messages(name,email,message,created) values')){const id=nextId(state.messages);state.messages.push({id,name:p[0],email:p[1],message:p[2],status:'unread',created:p[3]});markDirty();return {changes:1,lastInsertRowid:id};}
   if(low.startsWith('insert into messages values(')){const id=Number(p[0]);state.messages.push({id,name:p[1],email:p[2],message:p[3],status:p[4],created:p[5]});markDirty();return {changes:1,lastInsertRowid:id};}
   if(low==='insert into content_history(json,created) values(?,?)'){const id=nextId(state.content_history);state.content_history.push({id,json:p[0],created:p[1]});markDirty();return {changes:1,lastInsertRowid:id};}
   if(low==='update content set json=? where id=1'){state.content=p[0];markDirty();return {changes:1,lastInsertRowid:0};}
   if(low==='update admin set email=? where id=1'){if(!state.admin)return result;state.admin.email=p[0];markDirty();return {changes:1,lastInsertRowid:0};}
   if(low==='update messages set status=? where id=?'){const m=state.messages.find(x=>Number(x.id)===Number(p[1]));if(!m)return result;m.status=p[0];markDirty();return {changes:1,lastInsertRowid:0};}
   if(low==='delete from messages where id=?'){const n=state.messages.length;state.messages=state.messages.filter(x=>Number(x.id)!==Number(p[0]));markDirty();return {changes:n-state.messages.length,lastInsertRowid:0};}
   if(low==='delete from sessions where token=?'){const n=state.sessions.length;state.sessions=state.sessions.filter(x=>x.token!==p[0]);markDirty();return {changes:n-state.sessions.length,lastInsertRowid:0};}
   if(low==='update admin set salt=?,hash=?'){if(!state.admin)return result;state.admin.salt=p[0];state.admin.hash=p[1];markDirty();return {changes:1,lastInsertRowid:0};}
   if(low==='insert or ignore into content values(1,?)'){if(!state.content){state.content=p[0];markDirty();return {changes:1,lastInsertRowid:1};}return result;}
   if(low==='insert into content values(1,?)'){state.content=p[0];markDirty();return {changes:1,lastInsertRowid:1};}
   throw new Error(`Unsupported remote DB run: ${q}`);
  }
 };
}

function remoteExec(sql){
 const q=normalize(sql),low=q.toLowerCase();
 if(low.startsWith('pragma ')||low.startsWith('create table ')||low.includes('create table if not exists')||low.startsWith('create index '))return;
 if(low==='begin immediate'){txBackup=clone(state);return;}
 if(low==='rollback'){if(txBackup){state=txBackup;txBackup=null;markDirty();}return;}
 if(low==='commit'){txBackup=null;return;}
 if(low==='delete from sessions'){state.sessions=[];markDirty();return;}
 if(low.includes('delete from content_history where id not in')){state.content_history=sortDesc([...state.content_history],'id').slice(0,20);txBackup=null;markDirty();return;}
 // Initial schema creation can arrive as a multi-statement string in compatibility paths.
 if(low.includes('create table'))return;
 throw new Error(`Unsupported remote DB exec: ${q}`);
}

if(remoteStorage){
 await initSupabase();
 db={prepare:getStmt,exec:remoteExec,flush:flushState,close(){},remote:true};
}else{
 const local=new DatabaseSync(resolve(dataDir,'portfolio.sqlite'));
 local.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS content (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS admin (id INTEGER PRIMARY KEY CHECK(id=1), email TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'unread', created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);`);
 local.prepare('INSERT OR IGNORE INTO content VALUES(1,?)').run(readFileSync(resolve(root,'seed.json'),'utf8'));
 local.exec(`
CREATE TABLE IF NOT EXISTS articles (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, excerpt TEXT NOT NULL, body TEXT NOT NULL, category TEXT NOT NULL, tags TEXT NOT NULL, cover TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','published')), comments INTEGER NOT NULL DEFAULT 1, created TEXT NOT NULL, updated TEXT NOT NULL, published_at TEXT);
CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY, article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE, name TEXT NOT NULL, email TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','hidden')), reply TEXT NOT NULL DEFAULT '', created TEXT NOT NULL, replied_at TEXT);
CREATE INDEX IF NOT EXISTS idx_comments_article_status ON comments(article_id,status);
CREATE TABLE IF NOT EXISTS reactions (article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE, visitor TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('like','insightful','love')), PRIMARY KEY(article_id,visitor));
CREATE TABLE IF NOT EXISTS content_history (id INTEGER PRIMARY KEY, json TEXT NOT NULL, created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS subscribers (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'active', created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS visitors (visitor TEXT PRIMARY KEY, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, visits INTEGER NOT NULL DEFAULT 1);
`);
 local.flush=async()=>{};local.remote=false;db=local;
}


export const getContent=()=>upgrade(JSON.parse(db.prepare('SELECT json FROM content WHERE id=1').get().json));


export function recordVisit(visitor){
 const now=nowIso(),key=String(visitor||'').slice(0,128);if(!key)return;
 if(remoteStorage){
  const row=state.visitors.find(x=>x.visitor===key);
  if(row){row.last_seen=now;row.visits=Number(row.visits||0)+1;}else state.visitors.push({visitor:key,first_seen:now,last_seen:now,visits:1});
  markDirty();return;
 }
 const row=db.prepare('SELECT * FROM visitors WHERE visitor=?').get(key);
 if(row)db.prepare('UPDATE visitors SET last_seen=?,visits=visits+1 WHERE visitor=?').run(now,key);
 else db.prepare('INSERT INTO visitors(visitor,first_seen,last_seen,visits) VALUES(?,?,?,1)').run(key,now,now);
}
export function addSubscriber(email){
 const value=String(email||'').trim().toLowerCase(),now=nowIso();if(!value)return false;
 if(remoteStorage){const old=state.subscribers.find(x=>x.email===value);if(old){old.status='active';return false;}state.subscribers.push({id:nextId(state.subscribers),email:value,status:'active',created:now});markDirty();return true;}
 try{db.prepare("INSERT INTO subscribers(email,status,created) VALUES(?,'active',?)").run(value,now);return true;}catch{return false;}
}
export function removeSubscriber(id){
 const n=Number(id);if(remoteStorage){const before=state.subscribers.length;state.subscribers=state.subscribers.filter(x=>Number(x.id)!==n);if(before!==state.subscribers.length)markDirty();return before!==state.subscribers.length;}
 return db.prepare('DELETE FROM subscribers WHERE id=?').run(n).changes>0;
}
export function listSubscribers(){
 if(remoteStorage)return clone([...state.subscribers].sort((a,b)=>String(b.created).localeCompare(String(a.created))));
 return db.prepare('SELECT * FROM subscribers ORDER BY id DESC').all();
}
export function analyticsSummary(){
 let visitors,subscribers;
 if(remoteStorage){visitors=state.visitors;subscribers=state.subscribers;}else{visitors=db.prepare('SELECT * FROM visitors').all();subscribers=db.prepare('SELECT * FROM subscribers').all();}
 return {uniqueVisitors:visitors.length,totalVisits:visitors.reduce((n,x)=>n+Number(x.visits||0),0),subscribers:subscribers.filter(x=>x.status!=='removed').length};
}
async function seedBundledArticles(){
 if(db.prepare('SELECT value FROM settings WHERE key=?').get('bundled-articles-v1')?.value==='done')return;
 const existing=new Set(db.prepare('SELECT * FROM articles').all().map(x=>x.slug));
 const sql='INSERT INTO articles(slug,title,excerpt,body,category,tags,cover,status,comments,created,updated,published_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)';
 for(const a of bundledArticles){if(existing.has(a.slug))continue;db.prepare(sql).run(a.slug,a.title,a.excerpt,a.body,a.category,a.tags,a.cover,'published',1,a.created,a.updated,a.published_at);}
 db.prepare('INSERT OR IGNORE INTO settings VALUES(?,?)').run('bundled-articles-v1','done');
 await flushState();
}
await seedBundledArticles();
