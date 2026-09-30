import {createHmac,randomBytes} from 'node:crypto';
import {db,getContent} from './db.mjs';
import {article,str,email,fail} from './validate.mjs';
db.prepare('INSERT OR IGNORE INTO settings VALUES(?,?)').run('reaction-secret',randomBytes(32).toString('hex'));
const secret=db.prepare('SELECT value FROM settings WHERE key=?').get('reaction-secret').value;
const sign=x=>createHmac('sha256',secret).update(x).digest('hex');
export async function handleArticles({path,req,res,body,send,auth,limit,ip,production}){
 const config=getContent(),enabled=config.pages.find(p=>p.id==='articles')?.visible;
 const publicSummary='id,slug,title,excerpt,category,tags,cover,created,updated,published_at,comments';
 const publicRoute=path.startsWith('/api/articles');
 if(publicRoute&&!enabled)fail(404,'Articles are not available.');
 const match=path.match(/^\/api\/articles\/([a-z0-9-]+)(?:\/(comments|reactions))?$/);
 let a;
 if(match){a=db.prepare('SELECT * FROM articles WHERE slug=? AND status=?').get(match[1],'published');if(!a)fail(404,'Article not found.');}
 const visitor=()=>{const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('reader='))?.slice(7)||'';const [id,mac]=raw.split('.');if(/^[a-f0-9]{48}$/.test(id||'')&&mac===sign(id))return id;return null;};
 const counts=id=>Object.fromEntries(db.prepare('SELECT kind,count(*) AS count FROM reactions WHERE article_id=? GROUP BY kind').all(id).map(x=>[x.kind,x.count]));
 if(path==='/api/articles'&&req.method==='GET'){send(200,db.prepare(`SELECT ${publicSummary} FROM articles WHERE status='published' ORDER BY published_at DESC,id DESC`).all());return true;}
 if(match&&req.method==='GET'&&!match[2]){send(200,{...a,status:undefined,reactions:counts(a.id),myReaction:visitor()?db.prepare('SELECT kind FROM reactions WHERE article_id=? AND visitor=?').get(a.id,sign(visitor()))?.kind||null:null});return true;}
 if(match&&match[2]==='comments'&&req.method==='GET'){send(200,db.prepare("SELECT id,name,body,reply,created,replied_at FROM comments WHERE article_id=? AND status='approved' ORDER BY id").all(a.id));return true;}
 if(match&&match[2]==='comments'&&req.method==='POST'){
 if(!config.site.comments||!a.comments)fail(403,'Comments are closed.');limit('comment:'+ip,6,3600e3);const b=await body(req);if(b.website){send(201,{ok:true});return true;}if(!email(b.email)||str(b.name,100).length<1||str(b.body,5000).length<3)fail(400,'Enter your name, a valid email, and a comment of 3–5,000 characters.');
 db.prepare('INSERT INTO comments(article_id,name,email,body,created) VALUES(?,?,?,?,?)').run(a.id,b.name.trim(),b.email.trim().toLowerCase(),b.body.trim(),new Date().toISOString());send(201,{ok:true,pending:true});return true;
 }
 if(match&&match[2]==='reactions'&&req.method==='POST'){
 if(!config.site.reactions)fail(403,'Reactions are disabled.');limit('react:'+ip,60,3600e3);const b=await body(req);if(!['like','love','insightful',null].includes(b.kind))fail(400,'Invalid reaction.');let v=visitor();if(!v){v=randomBytes(24).toString('hex');res.setHeader('Set-Cookie',`reader=${v}.${sign(v)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${production?'; Secure':''}`);}
 if(b.kind===null)db.prepare('DELETE FROM reactions WHERE article_id=? AND visitor=?').run(a.id,sign(v));else db.prepare('INSERT INTO reactions VALUES(?,?,?) ON CONFLICT(article_id,visitor) DO UPDATE SET kind=excluded.kind').run(a.id,sign(v),b.kind);
 send(200,{reactions:counts(a.id),myReaction:b.kind});return true;
 }
 if(path.startsWith('/api/admin/articles')||path.startsWith('/api/admin/comments')){
 auth();
 if(path==='/api/admin/articles'&&req.method==='GET'){send(200,db.prepare('SELECT * FROM articles ORDER BY updated DESC,id DESC').all());return true;}
 if(path==='/api/admin/articles'&&req.method==='POST'){const a=article(await body(req)),now=new Date().toISOString();if(db.prepare('SELECT id FROM articles WHERE slug=?').get(a.slug))fail(409,'This article URL is already in use.');const r=db.prepare('INSERT INTO articles(slug,title,excerpt,body,category,tags,cover,status,comments,created,updated,published_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(a.slug,a.title,a.excerpt,a.body,a.category,a.tags,a.cover,a.status,Number(a.comments),now,now,a.status==='published'?now:null);send(201,db.prepare('SELECT * FROM articles WHERE id=?').get(Number(r.lastInsertRowid)));return true;}
 const am=path.match(/^\/api\/admin\/articles\/(\d+)$/);
 if(am){const old=db.prepare('SELECT * FROM articles WHERE id=?').get(+am[1]);if(!old)fail(404,'Article not found.');if(req.method==='PUT'){const b=await body(req);if(b.updated!==old.updated)fail(409,'This article changed in another session. Reload before editing.');const a=article(b);if(db.prepare('SELECT id FROM articles WHERE slug=? AND id<>?').get(a.slug,old.id))fail(409,'This article URL is already in use.');const now=new Date().toISOString();db.prepare('UPDATE articles SET slug=?,title=?,excerpt=?,body=?,category=?,tags=?,cover=?,status=?,comments=?,updated=?,published_at=? WHERE id=?').run(a.slug,a.title,a.excerpt,a.body,a.category,a.tags,a.cover,a.status,Number(a.comments),now,old.published_at||(a.status==='published'?now:null),old.id);send(200,db.prepare('SELECT * FROM articles WHERE id=?').get(old.id));return true;}if(req.method==='DELETE'){db.prepare('DELETE FROM articles WHERE id=?').run(old.id);send(200,{ok:true});return true;}}
 if(path==='/api/admin/comments'&&req.method==='GET'){send(200,db.prepare('SELECT c.*,a.title AS article_title,a.slug FROM comments c JOIN articles a ON a.id=c.article_id ORDER BY c.id DESC LIMIT 2000').all());return true;}
 const cm=path.match(/^\/api\/admin\/comments\/(\d+)$/);
 if(cm&&req.method==='PATCH'){const b=await body(req);if(!['pending','approved','hidden'].includes(b.status))fail(400,'Invalid moderation status.');const old=db.prepare('SELECT * FROM comments WHERE id=?').get(+cm[1]);if(!old)fail(404,'Comment not found.');const reply=str(b.reply??old.reply,10000);db.prepare('UPDATE comments SET status=?,reply=?,replied_at=? WHERE id=?').run(b.status,reply,reply!==old.reply?new Date().toISOString():old.replied_at,+cm[1]);send(200,{ok:true});return true;}
 if(cm&&req.method==='DELETE'){db.prepare('DELETE FROM comments WHERE id=?').run(+cm[1]);send(200,{ok:true});return true;}
 }
 return false;
}
