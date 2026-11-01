'use strict';
const app=document.querySelector('#app'),label='WB ЕГЭ · by @edholod';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tg=()=>window.Telegram?.WebApp;
let API=String(window.WB_EGE_API||'').replace(/\/+$/,'');
let questions=[],answers=[],idx=0,session=null,profile=null,result=null,revision=0,expiresAt=0,dirty=false,saving=null,saveTimer=null,serial=0,pendingWrite=null,busy=false;
const store={get(k){try{return JSON.parse(sessionStorage.getItem(k))}catch{return null}},set(k,v){try{if(v===null)sessionStorage.removeItem(k);else sessionStorage.setItem(k,JSON.stringify(v))}catch{}}};
let auth=store.get('wb_ege_auth_v2');
const html=s=>{app.innerHTML=s;window.scrollTo(0,0)};
const button=(text,fn,secondary=false)=>{const b=document.createElement('button');b.type='button';b.className='btn'+(secondary?' secondary':'');b.textContent=text;b.onclick=fn;app.appendChild(b);return b};
const fmt=s=>new Date(s*1000).toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow'});
const errorText=e=>esc(e.message||e);
async function request(path,params){
 let res;try{res=await fetch(API+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(params)})}catch{throw Error('Нет соединения. Ответы остаются в текущем окне; повторите сохранение.')}
 let data;try{data=await res.json()}catch{throw Error('Сервер вернул неожиданный ответ. Повторите действие.')}
 if(!res.ok)throw Object.assign(Error(data.error||'Ошибка сервера'),{code:data.code,status:res.status});return data;
}
async function authenticate(){
 if(auth?.token&&auth.expiresAt*1000>Date.now()+10000)return;
 if(!tg()?.initData)throw Error('Откройте приложение кнопкой в Telegram');
 const r=await request('/auth',{initData:tg().initData});auth={token:r.sessionToken,expiresAt:r.expiresAt};store.set('wb_ege_auth_v2',auth);
}
async function api(path,params={}){await authenticate();try{return await request(path,{...params,sessionToken:auth.token})}catch(e){if(e.status===401){auth=null;store.set('wb_ege_auth_v2',null)}throw e}}
function persistDraft(){
 if(session)store.set('wb_ege_draft_v2',dirty||pendingWrite?{id:session,answers:[...answers],revision,serial,pendingWrite}:null);
 try{if(dirty||pendingWrite)tg()?.enableClosingConfirmation?.();else tg()?.disableClosingConfirmation?.()}catch{}
}
function saveStatus(text){const el=document.querySelector('#save-status');if(el)el.textContent=text}
function scheduleSave(){persistDraft();clearTimeout(saveTimer);saveTimer=setTimeout(()=>flushSave().catch(e=>saveStatus('Не сохранено: '+e.message)),300)}
async function flushSave(){
 clearTimeout(saveTimer);if(saving){await saving;return flushSave()}
 if(!dirty&&!pendingWrite)return;
 if(!pendingWrite)pendingWrite={answers:[...answers],revision,serial};
 const write=pendingWrite;saveStatus('Сохраняем ответы…');persistDraft();
 saving=(async()=>{const r=await api('/save',{sessionId:session,answers:write.answers,revision:write.revision});revision=r.revision;pendingWrite=null;dirty=write.serial!==serial;persistDraft();saveStatus(dirty?'Есть несохранённые изменения':'Сохранено на сервере')})();
 try{await saving}finally{saving=null}
 if(dirty)return flushSave();
}
function failure(e,retry){
 html(`<div class="brand">${label}</div><div class="card" role="alert"><h2>Не удалось выполнить действие</h2><p>${errorText(e)}</p></div>`);
 if(retry)button('Повторить действие',retry);
 if(session&&questions.length)button('Вернуться к вопросам',question,true);
 if(e.code==='REVISION_CONFLICT')button('Загрузить сохранённое состояние',async()=>{if(!confirm('Заменить ответы в этом окне состоянием с сервера? Несохранённые изменения этого окна будут потеряны.'))return;dirty=false;pendingWrite=null;persistDraft();await home()},true);
 button('На главную',async()=>{if(dirty||pendingWrite){try{await flushSave()}catch(err){failure(err,()=>flushSave().then(home).catch(x=>failure(x)));return}}await home()},true);
}
function useAttempt(a){
 session=a.id||a.sessionId;questions=a.questions;answers=[...a.answers];revision=a.revision;profile={fio:a.fio,dob:a.dob};expiresAt=a.expiresAt;dirty=false;pendingWrite=null;serial=0;
 let draft=store.get('wb_ege_draft_v2');if(draft?.id===session&&draft.revision!==revision){if(draft.pendingWrite&&revision===draft.pendingWrite.revision+1&&JSON.stringify(a.answers)===JSON.stringify(draft.pendingWrite.answers)){draft={...draft,revision,pendingWrite:null}}else if(!confirm('На сервере другая версия ответов. Загрузить её и отказаться от несохранённых изменений этого окна?')){home();return}else{draft=null;store.set('wb_ege_draft_v2',null)}}
 if(draft?.id===session&&draft.revision===revision&&Array.isArray(draft.answers)&&draft.answers.length===100&&draft.answers.every((v,i)=>v===null||(Number.isInteger(v)&&v>=0&&v<questions[i].options.length))){answers=draft.answers;serial=Number.isSafeInteger(draft.serial)&&draft.serial>=0?draft.serial:0;const pw=draft.pendingWrite;pendingWrite=pw&&pw.revision===revision&&Number.isSafeInteger(pw.serial)&&Array.isArray(pw.answers)&&pw.answers.length===100&&pw.answers.every((v,i)=>v===null||(Number.isInteger(v)&&v>=0&&v<questions[i].options.length))?pw:null;dirty=true}
 const gap=answers.findIndex(x=>x===null);idx=gap<0?99:gap;question();if(dirty)scheduleSave();
}
async function home(){
 try{
  const parsed=new URL(API);if(parsed.protocol!=='https:'||API.includes('REPLACE_'))throw Error('CONFIG');
 }catch{html(`<div class="brand">${label}</div><div class="card"><h1>Экзамен готовится к запуску</h1><p>Сервис пока не подключён. Попробуйте позже.</p></div>`);return}
 if(!tg()?.initData&&!auth?.token){html(`<div class="brand">${label}</div><div class="card"><h1>Откройте WB ЕГЭ из Telegram</h1><p>Используйте WebApp-кнопку бота, чтобы сохранить попытку и получить результат.</p></div>`);return}
 try{
  const status=await api('/status');
  html(`<div class="brand">${label}</div><div class="card"><span class="pill">Независимая учебная аттестация</span><h1>WB ЕГЭ</h1><p>100 вопросов, по одному баллу. После завершения — разбор ошибок с источниками и датами.</p><p>90–99 — серебряный сертификат; 100 — золотой.</p><p class="muted">Одна новая попытка за 24 часа с начала предыдущей. Завершить попытку нужно в течение этих 24 часов. Порядок вопросов и ответов индивидуален. Это не официальный экзамен Wildberries.</p></div>`);
  if(status.active){button('Продолжить экзамен',()=>useAttempt(status.active))}
  else if(status.cooldown){html(app.innerHTML+`<div class="card"><h2>Следующая попытка позже</h2><p>Осталось около ${Math.ceil(status.cooldown/60)} мин.</p>${status.legacyPending?'<p>Банк обновлён. Прежнюю незавершённую попытку продолжить нельзя; старые результаты сохранены.</p>':''}</div>`)}
  else{
   html(app.innerHTML+`<div class="card">${status.expired?'<p>Время прошлой незавершённой попытки истекло.</p>':''}<h2>Данные участника</h2><label for="fio">ФИО</label><input id="fio" class="field" maxlength="140" autocomplete="name" placeholder="Иванов Иван Иванович"><label for="dob">Дата рождения</label><input id="dob" class="field" type="date" max="${new Date().toISOString().slice(0,10)}"><label class="consent" for="consent"><input type="checkbox" id="consent"><span>Согласен на обработку указанных мной ФИО, даты рождения и результатов для экзамена и сертификата. По ссылке проверки будут доступны ФИО, год рождения и результат.</span></label></div>`);button('Начать экзамен',start);
  }
  if(status.lastScore!==null)button(`Последний результат: ${status.lastScore}/100 — разбор`,previousResult,true);
  button('Мои сертификаты',certificates,true);
 }catch(e){failure(e,home)}
}
async function start(){
 if(busy)return;const fio=document.querySelector('#fio').value.trim(),dob=document.querySelector('#dob').value,consent=document.querySelector('#consent').checked;
 if(!consent||fio.length<5||!dob){alert('Заполните ФИО, дату рождения и согласие');return}
 busy=true;try{const r=await api('/start',{fio,dob,consent});if(r.sessionToken){auth={token:r.sessionToken,expiresAt:r.authExpiresAt};store.set('wb_ege_auth_v2',auth)}store.set('wb_ege_draft_v2',null);useAttempt({...r,fio:r.fio||fio,dob:r.dob||dob})}catch(e){failure(e,home)}finally{busy=false}
}
function question(){
 const q=questions[idx];if(!q)return failure(Error('Задание недоступно. Загрузите состояние с главной.'),home);
 html(`<div class="brand">${label}</div><div class="flex"><b>Вопрос ${idx+1} / 100</b><span>${answers.filter(x=>x!==null).length} ответов</span></div><div class="progress"><div style="width:${answers.filter(x=>x!==null).length}%"></div></div><div class="card"><span class="pill">${esc(q.category)}</span><h2>${esc(q.question)}</h2><div id="choices"></div><p id="save-status" role="status" aria-live="polite" class="muted">${dirty||pendingWrite?'Есть несохранённые изменения':'Сохранено на сервере'}</p><p class="muted">Попытка до ${esc(new Date(expiresAt*1000).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'}))} мск</p></div>`);
 const choices=document.querySelector('#choices');q.options.forEach((o,i)=>{const b=document.createElement('button');b.type='button';b.className='option'+(answers[idx]===i?' selected':'');b.setAttribute('aria-pressed',String(answers[idx]===i));b.textContent=String.fromCharCode(65+i)+'. '+o;b.onclick=()=>{if(busy)return;answers[idx]=i;serial++;dirty=true;scheduleSave();question()};choices.appendChild(b)});
 const next=button(idx===99?'Завершить экзамен':'Следующий вопрос',idx===99?confirmFinish:()=>{idx++;question()});next.disabled=answers[idx]===null||busy;
 if(idx>0)button('Предыдущий вопрос',()=>{idx--;question()},true);
 button('К первому пропущенному',()=>{const n=answers.findIndex(x=>x===null);if(n<0)alert('На все вопросы даны ответы');else{idx=n;question()}},true);
 button('Сохранить сейчас',async()=>{try{await flushSave();saveStatus('Сохранено на сервере')}catch(e){failure(e,()=>flushSave().then(question).catch(x=>failure(x)))}},true);
 button('Сохранить и на главную',async()=>{try{await flushSave();await home()}catch(e){failure(e,()=>flushSave().then(home).catch(x=>failure(x)))}},true);
}
async function confirmFinish(){
 if(busy)return;if(answers.some(x=>x===null)){alert('Ответьте на все 100 вопросов');return}
 if(!confirm('Завершить экзамен? Изменить ответы после отправки нельзя.'))return;
 busy=true;try{await flushSave();result=await api('/finish',{sessionId:session,answers:[...answers],revision});dirty=false;pendingWrite=null;persistDraft();showResult()}catch(e){failure(e,confirmFinish)}finally{busy=false}
}
function sourcesHTML(refs){return (refs||[]).map(s=>`<p class="muted"><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a><br>${esc(s.date)} · ${esc(s.loc)}</p>`).join('')}
function showResult(){
 const r=result;questions=r.questions;answers=r.answers;profile={fio:r.fio,dob:r.dob};
 html(`<div class="brand">${label}</div><div class="card"><div class="result">${r.score}/100</div><h1>${r.level==='gold'?'Золотой результат':r.level==='silver'?'Серебряный результат':'Экзамен завершён'}</h1><p>${esc(profile.fio)}</p><p>Ошибок: ${100-r.score}</p><p class="muted">Банк: ${esc(r.bankVersion)}${r.legacy?' · прежняя несверенная редакция':''}</p></div>`);
 const misses=r.review||[];
 html(app.innerHTML+`<h2>Разбор ошибок (${misses.length})</h2>`+(misses.length?misses.map(m=>{const q=questions[m.i];return `<section class="card bad"><h2>${m.i+1}. ${esc(q.question)}</h2><p>Ваш ответ: ${esc(q.options[answers[m.i]])}</p><p><b>Правильный ответ: ${esc(q.options[m.correct])}</b></p><p>${esc(m.explanation)}</p><ol>${q.options.map((o,i)=>`<li><b>${i===m.correct?'Верно':'Неверно'}: ${esc(o)}</b>${m.optionExplanations?.[i]?'<br>'+esc(m.optionExplanations[i]):''}</li>`).join('')}</ol>${sourcesHTML(m.sources)}${m.verifiedAt?'<p class="muted">Сверено '+esc(m.verifiedAt)+'</p>':''}</section>`}).join(''):'<div class="card good">Все ответы правильные.</div>'));
 if(r.certificate)certificate(r.certificate);button('Мои сертификаты',certificates,true);button('На главную',home,true);
}
function certificate(c){
 const url=API+'/verify/'+encodeURIComponent(c.id),el=document.createElement('section');el.className='card certificate-wrap';
 el.innerHTML=`<div class="cert ${c.level==='gold'?'gold':''}"><div class="brand">WB ЕГЭ · by @edholod</div><h2>${c.revoked?'ОТОЗВАН':c.level==='gold'?'ЗОЛОТОЙ СЕРТИФИКАТ':'СЕРЕБРЯНЫЙ СЕРТИФИКАТ'}</h2><p>Независимая учебная аттестация сотрудников ПВЗ</p><div class="name">${esc(c.fio)}</div><p>Дата рождения: ${esc(c.dob)}<br>Результат: ${c.score}/100<br>Выдан: ${fmt(c.issuedAt)}</p><img class="certqr" alt="QR проверки сертификата"><p class="qr-fallback muted" hidden>QR не загрузился. Используйте ссылку проверки ниже.</p><p><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a></p><p class="muted">№ ${esc(c.id)}<br>Не является официальным документом Wildberries</p></div>`;
 app.appendChild(el);const qr=el.querySelector('.certqr');qr.onerror=()=>{qr.hidden=true;el.querySelector('.qr-fallback').hidden=false};qr.referrerPolicy='no-referrer';qr.src='https://api.qrserver.com/v1/create-qr-code/?size=240x240&data='+encodeURIComponent(url);
 button('Печать / сохранить сертификат в PDF',()=>{document.body.classList.add('print-certificate');window.print()});
 button('Проверить запись сертификата',()=>tg()?.openLink?tg().openLink(url):window.open(url,'_blank','noopener,noreferrer'),true);
}
async function previousResult(){try{result=await api('/result');showResult()}catch(e){failure(e,previousResult)}}
async function certificates(){try{const r=await api('/my-certificates');html(`<div class="brand">${label}</div><h1>Мои сертификаты</h1>`+(r.certificates.length?r.certificates.map(c=>`<section class="card"><h2>${c.level==='gold'?'Золотой':'Серебряный'} · ${c.score}/100</h2><p>${fmt(c.issued_at)} · ${c.revoked?'Отозван':'Действует'}</p><a href="${esc(API+'/verify/'+encodeURIComponent(c.id))}" target="_blank" rel="noopener noreferrer">Проверить запись</a></section>`).join(''):'<div class="card">Пока нет сертификатов.</div>'));button('На главную',home,true)}catch(e){failure(e,certificates)}}
window.addEventListener('beforeunload',e=>{if(dirty||pendingWrite){persistDraft();e.preventDefault();e.returnValue=''}});
window.addEventListener('afterprint',()=>document.body.classList.remove('print-certificate'));
try{tg()?.ready();tg()?.expand()}catch{}
home();
