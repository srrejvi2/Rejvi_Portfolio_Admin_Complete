import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {db,root,dataDir,getContent,flushState,listMedia,saveMedia,removeMedia,remoteStorage} from './db.mjs';
import {validate,fail} from './validate.mjs';
import {handleArticles} from './articles.mjs';
const port=Number(process.env.PORT||3000), production=process.env.NODE_ENV==='production';
const SESSION_IDLE_MS=30*60e3;
const normalizeOrigin=value=>{
 const raw=String(value||'').trim().replace(/^['"]|['"]$/g,'').replace(/\/+$/,'');
 if(!raw)return '';
 try{return new URL(raw).origin;}catch{return raw;}
};
const configuredOrigins=new Set(String(process.env.APP_ORIGIN||`http://localhost:${port}`).split(',').map(normalizeOrigin).filter(Boolean));
const canonicalOrigin=[...configuredOrigins][0]||`http://localhost:${port}`;
if(production && (![...configuredOrigins].length||[...configuredOrigins].some(x=>!/^https:\/\/[^/]+$/.test(x)))) throw Error('Production requires APP_ORIGIN=https://your-domain (comma-separate multiple origins if needed)');
const requestOrigins=req=>{
 const proto=String(req.headers['x-forwarded-proto']||'').split(',')[0].trim().toLowerCase()||(req.socket.encrypted?'https':'http');
 const hosts=[req.headers.host,...String(req.headers['x-forwarded-host']||'').split(',')].map(x=>String(x||'').trim()).filter(Boolean);
 return new Set(hosts.map(host=>normalizeOrigin(`${proto}://${host}`)).filter(Boolean));
};
const digest=x=>createHash('sha256').update(x).digest('hex');
const validEmail=x=>typeof x==='string'&&x.length<255&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
function limit(key,max,ms){const now=Date.now();db.prepare('DELETE FROM limits WHERE expires<?').run(now);const r=db.prepare('SELECT * FROM limits WHERE key=?').get(key);if(r&&r.count>=max)fail(429,'Too many attempts. Please try again later.');if(r)db.prepare('UPDATE limits SET count=count+1 WHERE key=?').run(key);else db.prepare('INSERT INTO limits VALUES(?,1,?)').run(key,now+ms);}
async function body(req){let n=0,chunks=[];for await(const c of req){n+=c.length;if(n>4*1024*1024)fail(413,'Request too large.');chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString());}catch{fail(400,'Invalid JSON.');}}
const server=http.createServer(async(req,res)=>{
 const send=(status,data)=>{Promise.resolve(flushState()).then(()=>{if(res.writableEnded)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}).catch(err=>{console.error(err);if(!res.headersSent){res.writeHead(500,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Persistent storage is temporarily unavailable.'}));}else res.end();});};
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
 if(production)res.setHeader('Strict-Transport-Security','max-age=31536000');
 try {
 const path=new URL(req.url,'http://localhost').pathname;
 const mutation=!['GET','HEAD'].includes(req.method);
 if(mutation){
  const incomingOrigin=normalizeOrigin(req.headers.origin);
  const sameRequestOrigin=requestOrigins(req).has(incomingOrigin);
  if(!incomingOrigin||(!configuredOrigins.has(incomingOrigin)&&!sameRequestOrigin))fail(403,'Origin rejected. Check APP_ORIGIN.');
 }
 if(mutation && !String(req.headers['content-type']).startsWith('application/json'))fail(415,'JSON required.');
 const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('session='))?.slice(8)||'';
 const session=token?db.prepare('SELECT * FROM sessions WHERE token=? AND expires>?').get(digest(token),Date.now()):null;
 const auth=()=>{if(!session)fail(401,'Please sign in.');if(mutation&&req.headers['x-csrf-token']!==session.csrf)fail(403,'Session verification failed. Reload and retry.');const next=Date.now()+SESSION_IDLE_MS;db.prepare('UPDATE sessions SET expires=? WHERE token=?').run(next,session.token);session.expires=next;res.setHeader('Set-Cookie',`session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800${production?'; Secure':''}`);};
 const ip=process.env.TRUST_PROXY==='1'?String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',').at(-1).trim():req.socket.remoteAddress;
 if(path==='/api/health'&&req.method==='GET')return send(200,{ok:true});
 if(path==='/api/content'&&req.method==='GET'){const c=getContent();c.projects=c.projects.filter(p=>p.published);c.pages=c.pages.filter(p=>p.visible);return send(200,c);}
 if(await handleArticles({path,req,res,body,send,auth,limit,ip,production}))return;
 if(path==='/api/login'&&req.method==='POST'){
 limit('login:'+ip,10,15*60e3);limit('login:global',200,15*60e3);
 const b=await body(req);const a=db.prepare('SELECT * FROM admin WHERE id=1').get();
 if(!a)fail(503,'Run npm run setup in the server terminal to create your administrator.');
 if(typeof b.password!=='string'||b.password.length>200||typeof b.email!=='string')fail(400,'Invalid credentials.');
 const h=scryptSync(b.password,a.salt,64);if(!timingSafeEqual(h,Buffer.from(a.hash,'hex'))||b.email.trim().toLowerCase()!==a.email)fail(401,'Email or password is incorrect.');
 const t=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');
 db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(t),csrf,Date.now()+SESSION_IDLE_MS);
 res.setHeader('Set-Cookie',`session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800${production?'; Secure':''}`);return send(200,{csrf,email:a.email,timeoutMinutes:30});
 }
 if(path==='/api/contact'&&req.method==='POST'){
 if(!getContent().site.contact)fail(403,'Contact form is disabled.');limit('contact:'+ip,5,3600e3);const b=await body(req);
 if(b.website)return send(200,{ok:true});
 if(typeof b.name!=='string'||!b.name.trim()||b.name.length>100||!validEmail(b.email)||typeof b.message!=='string'||b.message.trim().length<10||b.message.length>5000)fail(400,'Use a valid email, a name, and a message of 10–5,000 characters.');
 db.prepare('INSERT INTO messages(name,email,message,created) VALUES(?,?,?,?)').run(b.name.trim(),b.email.trim(),b.message.trim(),new Date().toISOString());return send(201,{ok:true});
 }
 if(path.startsWith('/api/admin/')){
 auth();
 if(path==='/api/admin/session'&&req.method==='GET')return send(200,{csrf:session.csrf,email:db.prepare('SELECT email FROM admin').get().email});
 if(path==='/api/admin/content'&&req.method==='GET')return send(200,{...getContent(),_revision:digest(db.prepare('SELECT json FROM content WHERE id=1').get().json)});
 if(path==='/api/admin/content'&&req.method==='PUT'){
 const b=await body(req),old=db.prepare('SELECT json FROM content WHERE id=1').get().json;
 if(b._revision!==digest(old))fail(409,'Website content changed in another session. Reload the editor before saving.');
 const c=validate(b),json=JSON.stringify(c);db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT INTO content_history(json,created) VALUES(?,?)').run(old,new Date().toISOString());db.prepare('UPDATE content SET json=? WHERE id=1').run(json);db.exec('DELETE FROM content_history WHERE id NOT IN (SELECT id FROM content_history ORDER BY id DESC LIMIT 20); COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return send(200,{ok:true,revision:digest(json)});
 }
 if(path==='/api/admin/history'&&req.method==='GET')return send(200,db.prepare('SELECT id,created FROM content_history ORDER BY id DESC').all());
 const hm=path.match(/^\/api\/admin\/history\/(\d+)$/);if(hm&&req.method==='GET'){const h=db.prepare('SELECT * FROM content_history WHERE id=?').get(+hm[1]);if(!h)fail(404,'Revision not found.');return send(200,JSON.parse(h.json));}
 const mediaInUse=url=>{const contentJson=db.prepare('SELECT json FROM content WHERE id=1').get()?.json||'';if(contentJson.includes(url))return true;return !!db.prepare('SELECT 1 FROM articles WHERE cover=? OR body LIKE ? LIMIT 1').get(url,'%'+url+'%');};
 if(path==='/api/admin/media'&&req.method==='GET'){const files=(await listMedia()).map(file=>({...file,inUse:mediaInUse(file.url)}));return send(200,files.sort((a,b)=>String(b.created).localeCompare(String(a.created))));}
 const mediaDelete=path.match(/^\/api\/admin\/media\/([a-f0-9]+\.(?:png|jpg|webp|pdf))$/);
 if(mediaDelete&&req.method==='DELETE'){const b=await body(req),name=mediaDelete[1],file=(await listMedia()).find(x=>x.name===name);if(!file)fail(404,'File not found.');const inUse=mediaInUse(file.url);if(inUse&&!b.force)fail(409,'This file is still used on the website. Remove its reference first, or confirm permanent deletion.');if(!await removeMedia(name))fail(404,'File not found.');return send(200,{ok:true,url:file.url,inUse});}
 if(path==='/api/admin/account'&&req.method==='PUT'){const b=await body(req),a=db.prepare('SELECT * FROM admin WHERE id=1').get();if(!validEmail(b.email)||typeof b.password!=='string'||b.password.length>200)fail(400,'Enter a valid email and your current password.');if(!timingSafeEqual(scryptSync(b.password,a.salt,64),Buffer.from(a.hash,'hex')))fail(400,'Password is incorrect.');db.prepare('UPDATE admin SET email=? WHERE id=1').run(b.email.trim().toLowerCase());return send(200,{ok:true});}

 if(path==='/api/admin/messages'&&req.method==='GET')return send(200,db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT 1000').all());
 const mid=path.match(/^\/api\/admin\/messages\/(\d+)$/);
 if(mid&&req.method==='PATCH'){const b=await body(req);if(!['unread','read','archived'].includes(b.status))fail(400,'Invalid status.');db.prepare('UPDATE messages SET status=? WHERE id=?').run(b.status,Number(mid[1]));return send(200,{ok:true});}
 if(mid&&req.method==='DELETE'){db.prepare('DELETE FROM messages WHERE id=?').run(Number(mid[1]));return send(200,{ok:true});}
 if(path==='/api/admin/logout'&&req.method==='POST'){db.prepare('DELETE FROM sessions WHERE token=?').run(session.token);res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send(200,{ok:true});}
 if(path==='/api/admin/password'&&req.method==='PUT'){
 const b=await body(req),a=db.prepare('SELECT * FROM admin').get();if(typeof b.current!=='string'||b.current.length>200||typeof b.password!=='string'||b.password.length<12||b.password.length>200)fail(400,'Use a new password of 12–200 characters.');
 if(!timingSafeEqual(scryptSync(b.current,a.salt,64),Buffer.from(a.hash,'hex')))fail(400,'Current password is incorrect.');
 const salt=randomBytes(24).toString('hex');db.prepare('UPDATE admin SET salt=?,hash=?').run(salt,scryptSync(b.password,salt,64).toString('hex'));db.exec('DELETE FROM sessions');return send(200,{ok:true});
 }
 if(path==='/api/admin/upload'&&req.method==='POST'){
 const b=await body(req);if(typeof b.data!=='string')fail(400,'Missing file.');const buf=Buffer.from(b.data,'base64');if(buf.length>2*1024*1024||buf.length<12)fail(400,'File must be less than 2 MB.');
 let ext='';if(buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))ext='png';else if(buf[0]===255&&buf[1]===216&&buf[2]===255)ext='jpg';else if(buf.toString('ascii',0,4)==='RIFF'&&buf.toString('ascii',8,12)==='WEBP')ext='webp';else if(buf.toString('ascii',0,5)==='%PDF-')ext='pdf';else fail(400,'Upload a PNG, JPEG, WebP, or PDF file.');
 const name=randomBytes(16).toString('hex')+'.'+ext,item=await saveMedia(name,buf);return send(201,{url:item.url});
 }
 if(path==='/api/admin/export'&&req.method==='GET')return send(200,{version:2,articles:db.prepare('SELECT * FROM articles').all(),comments:db.prepare('SELECT * FROM comments').all(),reactions:db.prepare('SELECT * FROM reactions').all(),content:getContent(),messages:db.prepare('SELECT * FROM messages ORDER BY id DESC').all(),exportedAt:new Date().toISOString()});
 }
 if(path.startsWith('/api/'))fail(404,'Endpoint not found.');
 if(!['GET','HEAD'].includes(req.method))fail(405,'Method not allowed.');
 if(path==='/theme.css'){
  const c=getContent().site;
  const colors={blue:['#315bff','#edf2ff'],violet:['#7244da','#f3efff'],teal:['#007f77','#e9f9f5'],rose:['#bb3568','#fff0f5'],orange:['#aa4c13','#fff3e9']};const [accent,tint]=colors[c.accent]||colors.blue;
  const fonts={
   sans:{heading:'Inter,"Segoe UI",Arial,sans-serif',body:'Inter,"Segoe UI",Arial,sans-serif'},
   editorial:{heading:'Georgia,"Times New Roman",serif',body:'"Segoe UI",Arial,sans-serif'},
   mono:{heading:'Consolas,"SFMono-Regular",monospace',body:'"Segoe UI",Arial,sans-serif'},
   humanist:{heading:'"Trebuchet MS","Segoe UI",Arial,sans-serif',body:'"Segoe UI",Aptos,Arial,sans-serif'},
   rounded:{heading:'"Arial Rounded MT Bold","Trebuchet MS","Segoe UI",sans-serif',body:'"Trebuchet MS","Segoe UI",Arial,sans-serif'},
   classic:{heading:'Palatino,"Palatino Linotype",Georgia,serif',body:'Georgia,"Times New Roman",serif'}
  };const f=fonts[c.font]||fonts.sans;
  const themes={
   cloud:{bg:'#ffffff',ink:'#182034',muted:'#667086',line:'#e5e9f0',soft:'#f7f9fc',surface:'#ffffff',header:'#fffffff5',shadow:'0 18px 60px #2134540b',scheme:'light'},
   midnight:{bg:'#0b1220',ink:'#f5f7fb',muted:'#aab5c7',line:'#263349',soft:'#101a2c',surface:'#142036',header:'#0b1220ee',shadow:'0 18px 60px #00000038',scheme:'dark'},
   warm:{bg:'#fffaf2',ink:'#2d251e',muted:'#78695b',line:'#eadfce',soft:'#fbf3e7',surface:'#fffdf9',header:'#fffaf2f2',shadow:'0 18px 60px #6b4b2412',scheme:'light'},
   glass:{bg:'#f3f7ff',ink:'#14203a',muted:'#65728b',line:'#dce4f3',soft:'#eaf1ff',surface:'#ffffffcc',header:'#f7faffcc',shadow:'0 22px 70px #315bff16',scheme:'light'},
   ink:{bg:'#f7f7f5',ink:'#111111',muted:'#676767',line:'#dcdcd7',soft:'#eeeeea',surface:'#ffffff',header:'#f7f7f5f2',shadow:'0 18px 50px #00000010',scheme:'light'}
  };const t=themes[c.theme]||themes.cloud;const radius=c.corners==='square'?'4px':'20px';
  const css=`:root{color-scheme:${t.scheme};--accent:${accent};--tint:${tint};--radius:${radius};--heading:${f.heading};--body:${f.body};--bg:${t.bg};--ink:${t.ink};--muted:${t.muted};--line:${t.line};--soft:${t.soft};--surface:${t.surface};--header-bg:${t.header};--shadow:${t.shadow}}
body{background:var(--bg);color:var(--ink)}#header{background:var(--header-bg)}.button,.secondary,.developer-card,.service-card,.article-card,.contact-form,.info-card,.panel,.media-item,.media-choice,.login-card,.icon-button,.format-tools button,.stat,.article-row,.welcome-panel{background:var(--surface);color:var(--ink)}.soft-section,#footer{background:var(--soft)}.tags span{color:var(--muted)}.developer-card pre,.code-top{background:color-mix(in srgb,var(--surface) 94%,var(--soft));color:var(--muted)}.portrait-caption{background:color-mix(in srgb,var(--surface) 92%,transparent)}.article-card,.service-card,.skill-card,.quote-card,.developer-card,.panel,.contact-form,.info-card{border-color:var(--line)}.admin-body,.admin-main{background:var(--soft)}.sidebar,.admin-top{background:var(--surface)}.nav-group button,.breadcrumb,.stat>span,.stat small{color:var(--muted)}.welcome-panel,.tip-card,.notice{border-color:var(--line)}input,textarea,select{background:var(--surface);color:var(--ink);border-color:var(--line)}dialog{background:var(--surface);color:var(--ink)}
html[data-visitor-theme="dark"]{color-scheme:dark;--bg:#0b1220;--ink:#f5f7fb;--muted:#aab5c7;--line:#263349;--soft:#101a2c;--surface:#142036;--header-bg:#0b1220ee;--shadow:0 18px 60px #00000038}
html[data-visitor-theme="light"]{color-scheme:light;--bg:#ffffff;--ink:#182034;--muted:#667086;--line:#e5e9f0;--soft:#f7f9fc;--surface:#ffffff;--header-bg:#fffffff5;--shadow:0 18px 60px #2134540b}`;
  res.writeHead(200,{'Content-Type':'text/css','Cache-Control':'no-cache'});return res.end(css);
 }
 let file;if(!remoteStorage&&/^\/uploads\/[a-f0-9]+\.(png|jpg|webp|pdf)$/.test(path))file=resolve(dataDir,path.slice(1));else {
 const allowed={'/':'index.html','/admin':'admin.html','/admin/':'admin.html','/style.css':'style.css','/app.js':'app.js','/admin.js':'admin.js','/favicon.png':'favicon.png','/brand/SR_Rejvi_logo.png':'brand/SR_Rejvi_logo.png','/robots.txt':'robots.txt','/schema.js':'schema.js','/shared.js':'shared.js','/admin.css':'admin.css','/sw.js':'sw.js','/fonts/bengali-400.woff2':'fonts/bengali-400.woff2','/fonts/bengali-600.woff2':'fonts/bengali-600.woff2','/fonts/bengali-700.woff2':'fonts/bengali-700.woff2'};
 let selected=allowed[path];let pageTitle='',description='',articleBody='';
 if(!selected){const c=getContent();const pg=c.pages.find(p=>p.visible&&('/'+p.slug)===path);const pr=path.match(/^\/projects\/([\w-]+)$/);const ar=path.match(/^\/articles\/([a-z0-9-]+)$/);
 if(pg){selected='index.html';pageTitle=pg.title||pg.label;description=pg.subtitle;}
 else if(path==='/privacy'){selected='index.html';pageTitle=c.copy.privacyTitle;}
 else if(pr&&c.pages.find(p=>p.id==='work')?.visible){const p=c.projects.find(p=>p.id===pr[1]&&p.published);if(p){selected='index.html';pageTitle=p.title;description=p.description;}}
 else if(ar&&c.pages.find(p=>p.id==='articles')?.visible){const a=db.prepare("SELECT * FROM articles WHERE slug=? AND status='published'").get(ar[1]);if(a){selected='index.html';pageTitle=a.title;description=a.excerpt;articleBody=a.body;}}
 if(!selected){res.statusCode=404;selected='index.html';pageTitle=c.copy.notFoundTitle;}
 }
 if(selected==='index.html'){
 const c=getContent(),escape=v=>String(v||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 let html=await readFile(resolve(root,'public',selected),'utf8');const brandLogo=c.site.logo||'/brand/SR_Rejvi_logo.png',loaderLogo=c.site.loaderLogo||brandLogo,siteIcon=c.site.favicon||brandLogo||'/favicon.png';html=html.replace('<!--TITLE-->',escape(pageTitle?pageTitle+' — '+c.profile.name:c.site.title)).replace('<!--DESCRIPTION-->',escape(description||c.site.description)).replace('<!--LOADER_LOGO-->',escape(loaderLogo)).replace('<!--FAVICON-->',escape(siteIcon));
 if(articleBody)html=html.replace('<!--ARTICLE_FALLBACK-->','<noscript><article><h1>'+escape(pageTitle)+'</h1><p>'+escape(articleBody).replace(/\n/g,'<br>')+'</p></article></noscript>');
 res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-cache');return res.end(req.method==='HEAD'?undefined:html);
 }
 file=resolve(root,'public',selected);}
 const bytes=await readFile(file);const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.pdf':'application/pdf','.txt':'text/plain','.woff2':'font/woff2'};
 res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:bytes);
 }catch(e){if(!res.headersSent)send(e.status||(e.code==='ENOENT'?404:500),{error:e.status?e.message:e.code==='ENOENT'?'File not found.':'Server error. Please try again.'});else res.end();if(!e.status&&e.code!=='ENOENT')console.error(e);}
});
server.requestTimeout=15000;server.headersTimeout=10000;
server.listen(port,process.env.HOST||'0.0.0.0',()=>console.log(`Rejvi Portfolio: ${canonicalOrigin}\nAdmin: ${canonicalOrigin}/admin`));
