import {readMobileMemoryHash} from './mobile-sync.mjs';
// A new URL keeps older app caches from supplying a state writer without memory support.
import {STATE_KEY,emptyState,validateImport,saveState} from './core.mjs?phone-sync=1';
import {normalizeMemory} from './study-memory.mjs';

const names={c:'C 语言',python:'Python',calculus:'高等数学',linear:'线性代数'};
const escape=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** Prepare a memory-only merge without touching a device's existing records. */
export function preparePhoneMemoryState(raw,profile,{now=new Date()}={}){
  let current;
  try{current=raw===null?emptyState():validateImport(typeof raw==='string'?JSON.parse(raw):raw);}
  catch{throw new Error('这台设备原有的学习记录暂时无法读取。已停止同步，请先在学习空间备份或恢复原有记录。');}
  const memory=normalizeMemory({...normalizeMemory(profile,{now}),updatedAt:now.toISOString()},{now});
  return validateImport({...current,memory,settings:{...current.settings,memoryAutoSync:false}});
}

function start(){
  const card=document.querySelector('#phone-card');
  let profile,parseError;
  try{profile=readMobileMemoryHash(location.hash);}
  catch(error){parseError=error;}
  // Keep the transport out of subsequent history, copied URLs and outbound links.
  if(location.hash)history.replaceState(null,'',location.pathname+location.search);
  if(parseError||!profile){card.innerHTML=`<div class="phone-eyebrow">SHIZHI · MOBILE SYNC</div><div class="phone-symbol">知</div><h1>${parseError?'同步链接暂不可用':'在另一台设备，接着学。'}</h1><p class="phone-description ${parseError?'phone-error':''}">${parseError?'请在原设备重新生成手机同步链接。当前设备的资料没有改动。':'请在原设备的“学习记忆”页选择“同步到手机”，再用手机打开生成的链接。'}</p><a class="phone-primary" href="./#memory">打开学习记忆</a>`;return;}
  card.innerHTML=`<div class="phone-eyebrow">PICK UP WHERE YOU LEFT OFF</div><div class="phone-symbol">↗</div><h1>把学习记忆，<br>接到这台设备。</h1><p class="phone-description">已准备好 ${profile.focus.length} 个学习话题。确认后，拾知会根据这些线索安排更合适的复习内容。</p><details class="phone-details"><summary>查看 ${profile.focus.length} 个学习话题</summary><ul class="phone-topics">${profile.focus.map(topic=>`<li><small>${escape(names[topic.subject])}</small>${escape(topic.title)}</li>`).join('')}</ul></details><p class="phone-preview-note">这次只同步学习话题与讲解偏好。手机原有的书架、笔记、答题和完成记录会保留；当前学习记忆将替换为这份摘要。</p><button class="phone-primary" id="confirm-phone-sync">同步到这台设备</button><a class="phone-secondary" href="./#memory">暂时跳过</a><p class="phone-status" id="phone-status" role="status"></p>`;
  document.querySelector('#confirm-phone-sync').addEventListener('click',async()=>{
    const button=document.querySelector('#confirm-phone-sync'),status=document.querySelector('#phone-status');
    button.disabled=true;button.textContent='正在保存学习记忆…';
    try{
      // Read at confirmation time so notes made while previewing are preserved.
      const next=preparePhoneMemoryState(localStorage.getItem(STATE_KEY),profile);
      saveState(next);
      const readback=validateImport(JSON.parse(localStorage.getItem(STATE_KEY)));
      if(readback.memory?.fingerprint!==next.memory.fingerprint)throw new Error('保存校验未完成，请重新同步。');
      card.classList.add('phone-success');
      card.querySelector('h1').textContent='学习记忆，已接上。';
      card.querySelector('.phone-description').textContent=`${next.memory.focus.length} 个学习话题已保存到这台设备的当前浏览器。之后在同一网址打开拾知即可继续。`;
      const open=document.createElement('a');open.className='phone-primary';open.href='./#memory';open.textContent='打开学习空间';button.replaceWith(open);
      card.querySelector('.phone-secondary')?.remove();
      status.textContent='这是本次学习摘要快照；以后有新内容，可再次生成同步链接。';
      if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').then(reg=>reg.update()).catch(()=>{});
    }catch(error){status.textContent=error.message||'暂时无法保存，请检查浏览器是否允许本地存储。';status.classList.add('phone-error');button.disabled=false;button.textContent='重新同步到这台设备';}
  });
}

if(typeof document!=='undefined'){
  start();
  window.addEventListener('hashchange',start);
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').then(reg=>reg.update()).catch(()=>{});
}
