import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {stdin,stdout} from 'node:process';
import {randomBytes,scryptSync} from 'node:crypto';
import {db,flushState,remoteStorage} from '../db.mjs';
let muted=false;
const output=new Writable({write(chunk,encoding,callback){if(!muted)stdout.write(chunk,encoding);callback();}});
output.isTTY=stdout.isTTY;output.columns=stdout.columns;
const rl=createInterface({input:stdin,output,terminal:Boolean(stdin.isTTY&&stdout.isTTY)});
async function secret(prompt){stdout.write(prompt);muted=true;try{return await rl.question('');}finally{muted=false;stdout.write('\n');}}
try {
 console.log('\nPortfolio Studio — owner setup\nCreates or resets the administrator without deleting your content.\nPassword characters will not be displayed.\n');
 const email=(await rl.question('Admin email: ')).trim().toLowerCase();
 const password=await secret('Password (12–200 characters): ');
 const confirm=await secret('Confirm password: ');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<12||password.length>200)throw Error('Enter a valid email and a password of 12–200 characters.');
 if(password!==confirm)throw Error('Passwords do not match. Run setup again.');
 const salt=randomBytes(24).toString('hex');
 db.prepare('INSERT OR REPLACE INTO admin VALUES(1,?,?,?)').run(email,salt,scryptSync(password,salt,64).toString('hex'));
 db.exec('DELETE FROM sessions');
 await flushState();
 console.log(`\nAdmin saved${remoteStorage?' to Supabase':''}. Next: node server.mjs\nKeep that terminal open, then visit http://localhost:3000/admin`);
}catch(e){console.error(e.message);process.exitCode=1;}finally{rl.close();await flushState().catch(()=>{});db.close();}
