import http from 'node:http';
import {readFile,writeFile,mkdir,readdir,stat} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {db,root,dataDir,getContent} from './db.mjs';
import {validate,fail} from './validate.mjs';
import {handleArticles} from './articles.mjs';
const port=Number(process.env.PORT||3000), production=process.env.NODE_ENV==='production';
const origin=process.env.APP_ORIGIN||`http://localhost:${port}`;
if(production && !/^https:\/\/[^/]+$/.test(origin)) throw Error('Production requires APP_ORIGIN=https://your-domain without a trailing slash');
const digest=x=>createHash('sha256').update(x).digest('hex');
const validEmail=x=>typeof x==='string'&&x.length<255&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
function limit(key,max,ms){const now=Date.now();db.prepare('DELETE FROM limits WHERE expires<?').run(now);const r=db.prepare('SELECT * FROM limits WHERE key=?').get(key);if(r&&r.count>=max)fail(429,'Too many attempts. Please try again later.');if(r)db.prepare('UPDATE limits SET count=count+1 WHERE key=?').run(key);else db.prepare('INSERT INTO limits VALUES(?,1,?)').run(key,now+ms);}
async function body(req){let n=0,chunks=[];for await(const c of req){n+=c.length;if(n>4*1024*1024)fail(413,'Request too large.');chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString());}catch{fail(400,'Invalid JSON.');}}
const server=http.createServer(async(req,res)=>{
 const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
 if(production)res.setHeader('Strict-Transport-Security','max-age=31536000');
 try {
 const path=new URL(req.url,'http://localhost').pathname;
 const mutation=!['GET','HEAD'].includes(req.method);
 if(mutation && req.headers.origin!==origin)fail(403,'Origin rejected. Check APP_ORIGIN.');
 if(mutation && !String(req.headers['content-type']).startsWith('application/json'))fail(415,'JSON required.');
 const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('session='))?.slice(8)||'';
 const session=token?db.prepare('SELECT * FROM sessions WHERE token=? AND expires>?').get(digest(token),Date.now()):null;
 const auth=()=>{if(!session)fail(401,'Please sign in.');if(mutation&&req.headers['x-csrf-token']!==session.csrf)fail(403,'Session verification failed. Reload and retry.');};
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
 db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(t),csrf,Date.now()+8*3600e3);
 res.setHeader('Set-Cookie',`session=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${production?'; Secure':''}`);return send(200,{csrf,email:a.email});
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
 if(path==='/api/admin/media'&&req.method==='GET'){await mkdir(resolve(dataDir,'uploads'),{recursive:true});const names=await readdir(resolve(dataDir,'uploads'));const files=await Promise.all(names.filter(n=>/^[a-f0-9]+\.(png|jpg|webp|pdf)$/.test(n)).map(async name=>{const f=await stat(resolve(dataDir,'uploads',name));return {name,url:'/uploads/'+name,size:f.size,created:f.mtime.toISOString()};}));return send(200,files.sort((a,b)=>b.created.localeCompare(a.created)));}
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
 await mkdir(resolve(dataDir,'uploads'),{recursive:true});const name=randomBytes(16).toString('hex')+'.'+ext;await writeFile(resolve(dataDir,'uploads',name),buf);return send(201,{url:'/uploads/'+name});
 }
 if(path==='/api/admin/export'&&req.method==='GET')return send(200,{version:2,articles:db.prepare('SELECT * FROM articles').all(),comments:db.prepare('SELECT * FROM comments').all(),reactions:db.prepare('SELECT * FROM reactions').all(),content:getContent(),messages:db.prepare('SELECT * FROM messages ORDER BY id DESC').all(),exportedAt:new Date().toISOString()});
 }
 if(path.startsWith('/api/'))fail(404,'Endpoint not found.');
 if(!['GET','HEAD'].includes(req.method))fail(405,'Method not allowed.');
 if(path==='/theme.css'){
 const c=getContent().site;const colors={blue:['#315bff','#edf2ff'],violet:['#7244da','#f3efff'],teal:['#007f77','#e9f9f5'],rose:['#bb3568','#fff0f5'],orange:['#aa4c13','#fff3e9']};const [accent,tint]=colors[c.accent]||colors.blue;
 const font={sans:'Inter,Segoe UI,Arial,sans-serif',editorial:'Georgia,Times New Roman,serif',mono:'Consolas,monospace'}[c.font]||'Arial,sans-serif';
 res.writeHead(200,{'Content-Type':'text/css','Cache-Control':'no-cache'});return res.end(`:root{--accent:${accent};--tint:${tint};--radius:${c.corners==='square'?'4px':'20px'};--heading:${font}}`);
 }
 let file;if(/^\/uploads\/[a-f0-9]+\.(png|jpg|webp|pdf)$/.test(path))file=resolve(dataDir,path.slice(1));else {
 const allowed={'/':'index.html','/admin':'admin.html','/admin/':'admin.html','/style.css':'style.css','/app.js':'app.js','/admin.js':'admin.js','/favicon.svg':'favicon.svg','/robots.txt':'robots.txt','/schema.js':'schema.js','/shared.js':'shared.js','/admin.css':'admin.css','/fonts/bengali-400.woff2':'fonts/bengali-400.woff2','/fonts/bengali-600.woff2':'fonts/bengali-600.woff2','/fonts/bengali-700.woff2':'fonts/bengali-700.woff2'};
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
 let html=await readFile(resolve(root,'public',selected),'utf8');html=html.replace('<!--TITLE-->',escape(pageTitle?pageTitle+' — '+c.profile.name:c.site.title)).replace('<!--DESCRIPTION-->',escape(description||c.site.description));
 if(articleBody)html=html.replace('<!--ARTICLE_FALLBACK-->','<noscript><article><h1>'+escape(pageTitle)+'</h1><p>'+escape(articleBody).replace(/\n/g,'<br>')+'</p></article></noscript>');
 res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','no-cache');return res.end(req.method==='HEAD'?undefined:html);
 }
 file=resolve(root,'public',selected);}
 const bytes=await readFile(file);const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.pdf':'application/pdf','.txt':'text/plain','.woff2':'font/woff2'};
 res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:bytes);
 }catch(e){if(!res.headersSent)send(e.status||(e.code==='ENOENT'?404:500),{error:e.status?e.message:e.code==='ENOENT'?'File not found.':'Server error. Please try again.'});else res.end();if(!e.status&&e.code!=='ENOENT')console.error(e);}
});
server.requestTimeout=15000;server.headersTimeout=10000;
server.listen(port,process.env.HOST||'0.0.0.0',()=>console.log(`Rejvi Portfolio: ${origin}\nAdmin: ${origin}/admin`));
