import {upgrade} from './defaults.mjs';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=dirname(fileURLToPath(import.meta.url));
export const dataDir=resolve(process.env.DATA_DIR||resolve(root,'data'));
mkdirSync(dataDir,{recursive:true});
export const db=new DatabaseSync(resolve(dataDir,'portfolio.sqlite'));
db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS content (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS admin (id INTEGER PRIMARY KEY CHECK(id=1), email TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'unread', created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);`);
db.prepare('INSERT OR IGNORE INTO content VALUES(1,?)').run(readFileSync(resolve(root,'seed.json'),'utf8'));
// Additive schema migration: existing owner, messages, content and uploads are preserved.
db.exec(`
CREATE TABLE IF NOT EXISTS articles (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, excerpt TEXT NOT NULL, body TEXT NOT NULL, category TEXT NOT NULL, tags TEXT NOT NULL, cover TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','published')), comments INTEGER NOT NULL DEFAULT 1, created TEXT NOT NULL, updated TEXT NOT NULL, published_at TEXT);
CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY, article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE, name TEXT NOT NULL, email TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','hidden')), reply TEXT NOT NULL DEFAULT '', created TEXT NOT NULL, replied_at TEXT);
CREATE INDEX IF NOT EXISTS idx_comments_article_status ON comments(article_id,status);
CREATE TABLE IF NOT EXISTS reactions (article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE, visitor TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('like','insightful','love')), PRIMARY KEY(article_id,visitor));
CREATE TABLE IF NOT EXISTS content_history (id INTEGER PRIMARY KEY, json TEXT NOT NULL, created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);
export const getContent=()=>upgrade(JSON.parse(db.prepare('SELECT json FROM content WHERE id=1').get().json));
