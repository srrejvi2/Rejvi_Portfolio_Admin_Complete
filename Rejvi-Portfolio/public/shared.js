export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const safeURL=s=>/^https:\/\//.test(s||'')||/^\/uploads\/[a-f0-9]+\.(png|jpg|webp|pdf)$/.test(s||'');
export const external=(url,label,cls='text-link')=>safeURL(url)?`<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} <span aria-hidden="true">↗</span></a>`:'';
export function markdown(source=''){
 // A deliberately small, escaped Markdown renderer: no HTML or arbitrary embeds.
 const inline=s=>esc(s).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>');
 let out='',code=false,buffer=[],list=false;
 for(const line of source.split('\n')){
 if(line.startsWith('```')){if(list){out+='</ul>';list=false;}if(code){out+='<pre><code>'+esc(buffer.join('\n'))+'</code></pre>';buffer=[];}code=!code;continue;}
 if(code){buffer.push(line);continue;}
 const li=line.match(/^[-*] (.*)/);if(li){if(!list){out+='<ul>';list=true;}out+='<li>'+inline(li[1])+'</li>';continue;}if(list){out+='</ul>';list=false;}
 const h=line.match(/^(#{1,3}) (.*)/);if(h){const n=Math.min(h[1].length+1,4);out+=`<h${n}>${inline(h[2])}</h${n}>`;}
 else if(line.startsWith('> '))out+='<blockquote>'+inline(line.slice(2))+'</blockquote>';
 else if(line.trim())out+='<p>'+inline(line)+'</p>';
 }
 if(code)out+='<pre><code>'+esc(buffer.join('\n'))+'</code></pre>';if(list)out+='</ul>';return out;
}
export const date=x=>x?new Date(x).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'';
export const icon=name=>({code:'⌘',spark:'✳',grid:'▦',arrow:'↗',close:'×',menu:'☰',check:'✓'}[name]||'◇');
