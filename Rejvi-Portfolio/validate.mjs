import {randomBytes} from 'node:crypto';
import {defaults} from './defaults.mjs';
import {profileFields,collections} from './public/schema.js';
export const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
export const str=(v,max=10000)=>{if(typeof v!=='string'||v.length>max)fail(400,'Text is missing or too long.');return v.trim();};
export const email=v=>typeof v==='string'&&v.length<255&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
export const url=(v,asset=false)=>{v=str(v??'',2048);if(v&&!(asset&&/^\/uploads\/[a-f0-9]+\.(png|jpg|webp|pdf)$/.test(v))){try{if(new URL(v).protocol!=='https:')throw Error();}catch{fail(400,'Use an HTTPS link or an uploaded asset.');}}return v;};
const arr=(x,max=200)=>{if(!Array.isArray(x)||x.length>max)fail(400,`Expected a list with at most ${max} entries.`);return x;};
const record=x=>{if(!x||typeof x!=='object'||Array.isArray(x))fail(400,'Invalid record.');return x;};
function valField(f,v){if(['url','github','linkedin'].includes(f))return url(v);if(['photo','resume','image','logo','favicon'].includes(f))return url(v,true);if(f==='gallery')return str(v).split('\n').filter(Boolean).map(x=>url(x,true)).join('\n');return str(v??'');}
export function validate(data){record(data);record(data.profile);record(data.site);record(data.copy);const c={profile:{},site:{},copy:{},pages:[],sections:[]};
for(const f of Object.keys(profileFields))c.profile[f]=valField(f,data.profile[f]);
if(!c.profile.name||!c.profile.headline)fail(400,'Profile name and headline are required.');if(c.profile.email&&!email(c.profile.email))fail(400,'Invalid public email.');
for(const [k,v] of Object.entries(defaults.site)){if(Array.isArray(v))continue;c.site[k]=typeof v==='boolean'?data.site[k]===true:valField(k,data.site[k]??v);}
if(!['blue','violet','teal','rose','orange'].includes(c.site.accent)||!['cloud','midnight','warm','glass','ink'].includes(c.site.theme)||!['sans','editorial','mono','humanist','rounded','classic'].includes(c.site.font)||!['soft','square'].includes(c.site.corners)||!['cat','dog','bird','fox','robot'].includes(c.site.petType)||!/^(?:[1-9]|[1-9][0-9]|1[0-8][0-9])$/.test(String(c.site.petInterval||'')))fail(400,'Invalid appearance or visitor experience option.');
c.site.socials=arr(data.site.socials||[],20).map(x=>({label:str(record(x).label,50),url:url(x.url)}));
for(const [k,v] of Object.entries(defaults.copy))c.copy[k]=str(data.copy[k]??v,5000);
const used=new Set(),ids=new Set();
c.pages=arr(data.pages,30).map(x=>{record(x);const id=str(x.id,64),slug=str(x.slug,80);if(!/^[a-z0-9-]+$/.test(id)||ids.has(id)||used.has(slug)||slug&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||['admin','api','uploads','privacy','projects'].includes(slug))fail(400,'Pages need unique IDs and valid, unique slugs.');ids.add(id);used.add(slug);const builtin=defaults.pages.find(p=>p.id===id);if(builtin&&builtin.slug!==slug)fail(400,'Built-in page addresses cannot change.');if(!builtin&&slug==='')fail(400,'Custom pages need a URL slug.');return {id,slug,label:str(x.label,60),title:str(x.title??'',300),subtitle:str(x.subtitle??'',1000),body:str(x.body??'',100000),image:url(x.image??'',true),visible:id==='home'?true:x.visible===true};});
for(const p of defaults.pages)if(!ids.has(p.id))fail(400,'Keep built-in pages; hide them with the visibility switch.');
const sectionIds=new Set();c.sections=arr(data.sections,20).map(x=>{if(!defaults.sections.some(s=>s.id===x.id)||sectionIds.has(x.id))fail(400,'Invalid home section.');sectionIds.add(x.id);return {id:x.id,label:str(x.label,80),visible:x.visible===true};});
for(const [key,schema] of Object.entries(collections)){const itemIds=new Set();c[key]=arr(data[key]||[]).map(x=>{record(x);const r={id:str(x.id||randomBytes(8).toString('hex'),80)};if(!/^[\w-]+$/.test(r.id)||itemIds.has(r.id))fail(400,'Entry IDs must be unique.');itemIds.add(r.id);for(const f of Object.keys(schema.fields))r[f]=valField(f,x[f]);for(const f of Object.keys(schema.flags||{}))r[f]=x[f]===true;if(!r.title)fail(400,`${schema.label}: a title is required.`);return r;});}
return c;
}
export function article(data){record(data);const a={};for(const f of ['title','slug','excerpt','body','category','tags','cover','status'])a[f]=f==='cover'?url(data[f]||'',true):str(data[f]||'',f==='body'?200000:2000);if(!a.title||a.title.length>200||!a.body||!['draft','published'].includes(a.status)||!/^([a-z0-9]+-)*[a-z0-9]+$/.test(a.slug)||a.slug.length>100)fail(400,'Article needs a title, URL slug, body, and draft/published status.');a.comments=data.comments!==false;return a;}
