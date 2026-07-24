const euro = new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'});
const monthFmt = new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'});
const shortDate = new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'short'});
const now = new Date();
const seed = [
 {id:'1',name:'Gehalt',amount:2840,type:'income',date:new Date(now.getFullYear(),now.getMonth(),1,9).toISOString(),method:'Girokonto',status:'confirmed',source:'Kontoauszug'},
 {id:'2',name:'REWE Markt',amount:48.72,type:'expense',date:new Date(now.getFullYear(),now.getMonth(),3,18).toISOString(),method:'Girokonto',status:'confirmed',source:'Kassenbon',note:'Lebensmittel'},
 {id:'3',name:'Spotify',amount:10.99,type:'expense',date:new Date(now.getFullYear(),now.getMonth(),5,7).toISOString(),method:'PayPal',status:'confirmed',source:'PayPal'},
 {id:'4',name:'Amazon',amount:36.40,type:'expense',date:new Date(now.getFullYear(),now.getMonth(),7,14).toISOString(),method:'PayPal',status:'review',source:'Screenshot',matchId:'5'},
 {id:'5',name:'PAYPAL *AMAZON',amount:36.40,type:'expense',date:new Date(now.getFullYear(),now.getMonth(),8,8).toISOString(),method:'Girokonto',status:'review',source:'Kontoauszug',matchId:'4'},
 {id:'6',name:'ALDI Süd',amount:27.83,type:'expense',date:new Date(now.getFullYear(),now.getMonth()-1,20,17).toISOString(),method:'Bar',status:'confirmed',source:'Kassenbon'}
];
let state={route:'home',filter:'all',archiveMode:'month',archiveDate:new Date(),transactions:load()};

function load(){try{return JSON.parse(localStorage.getItem('moneybrain.transactions'))||seed}catch{return seed}}
function save(){localStorage.setItem('moneybrain.transactions',JSON.stringify(state.transactions))}
const app=document.querySelector('#app'),sheet=document.querySelector('#sheet'),content=document.querySelector('#sheetContent');
const inMonth=(t,d=now)=>{const x=new Date(t.date);return x.getMonth()===d.getMonth()&&x.getFullYear()===d.getFullYear()};
const txs=(date=now)=>state.transactions.filter(t=>inMonth(t,date)).sort((a,b)=>new Date(b.date)-new Date(a.date));
const total=(items,type)=>items.filter(x=>x.type===type&&!x.amountUncertain).reduce((s,x)=>s+Number(x.amount),0);
function render(){document.querySelectorAll('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.route===state.route)); if(state.route==='home')home();if(state.route==='transactions')transactions();if(state.route==='archive')archive()}
function home(){const m=txs(),inc=total(m,'income'),exp=total(m,'expense');app.innerHTML=`
 <section class="hero"><span class="eyebrow">Deine Finanzen</span><h1>Hallo, alles im Blick?</h1><p class="subtitle">Hier ist dein Monat auf einen Blick.</p></section>
 <div class="month-row"><h2>${capitalize(monthFmt.format(now))}</h2><span class="month-chip">Heute, ${now.getDate()}.</span></div>
 <div class="balance-grid">
  <button class="balance-card income" data-open-type="income"><span class="card-icon">↙</span><span class="card-label">Einnahmen</span><span class="amount">${euro.format(inc)}</span></button>
  <button class="balance-card expense" data-open-type="expense"><span class="card-icon">↗</span><span class="card-label">Ausgaben</span><span class="amount">${euro.format(exp)}</span></button>
 </div>
 <button class="primary" id="newTx"><span>＋</span> Neue Buchung</button>
 <div class="section-title"><h2>Letzte Buchungen</h2><button class="link-button" data-go="transactions">Alle ansehen</button></div>
 ${list(m.slice(0,4))}`;bindCommon();document.querySelector('#newTx').onclick=openNew;document.querySelectorAll('[data-open-type]').forEach(b=>b.onclick=()=>{state.route='transactions';state.filter=b.dataset.openType;render()})}
function transactions(){let m=txs();if(state.filter!=='all')m=m.filter(x=>x.type===state.filter);app.innerHTML=`<div class="page-head"><div><span class="eyebrow">Aktueller Monat</span><h1>Buchungen</h1><p class="subtitle">${m.length} Transaktionen</p></div><button class="icon-button" id="addSmall">＋</button></div>
 <div class="filter-row">${[['all','Alle'],['income','Einnahmen'],['expense','Ausgaben'],['review','Zu prüfen']].map(([v,l])=>`<button class="filter ${state.filter===v?'active':''}" data-filter="${v}">${l}</button>`).join('')}</div>${list(m)}`;document.querySelector('#addSmall').onclick=openNew;document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{state.filter=b.dataset.filter;if(state.filter==='review'){m=txs().filter(x=>x.status==='review');app.querySelector('.transaction-list')?.remove();app.insertAdjacentHTML('beforeend',list(m))}else render();bindTransactions()});bindTransactions()}
function archive(){const d=state.archiveDate;const year=d.getFullYear(),allYear=state.transactions.filter(t=>new Date(t.date).getFullYear()===year).sort((a,b)=>new Date(b.date)-new Date(a.date));const shown=state.archiveMode==='year'?allYear:txs(d);app.innerHTML=`<div class="page-head"><div><span class="eyebrow">Gespeicherte Daten</span><h1>Archiv</h1><p class="subtitle">Monate und Jahre vergleichen</p></div></div>
 <div class="filter-row"><button class="filter ${state.archiveMode==='month'?'active':''}" data-mode="month">Monat</button><button class="filter ${state.archiveMode==='year'?'active':''}" data-mode="year">Ganzes Jahr</button></div>
 <div class="month-row"><button class="month-chip" data-step="-1">‹</button><h2>${state.archiveMode==='year'?year:capitalize(monthFmt.format(d))}</h2><button class="month-chip" data-step="1">›</button></div>
 <div class="year-summary"><span class="eyebrow">${state.archiveMode==='year'?'Jahressumme':'Monatssumme'}</span><div class="year-summary-grid"><div><small>Einnahmen</small><strong>${euro.format(total(shown,'income'))}</strong></div><div><small>Ausgaben</small><strong>${euro.format(total(shown,'expense'))}</strong></div></div></div>${list(shown)}`;document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{state.archiveMode=b.dataset.mode;render()});document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{const step=Number(b.dataset.step);state.archiveDate=state.archiveMode==='year'?new Date(year+step,0,1):new Date(year,d.getMonth()+step,1);render()});bindTransactions()}
function list(items){if(!items.length)return `<div class="empty">Noch keine Buchungen vorhanden.</div>`;return `<div class="transaction-list">${items.map(t=>`<button class="transaction ${t.status==='review'?'needs-review':''}" data-id="${t.id}"><span class="tx-icon">${initials(t.name)}</span><span class="tx-main"><strong>${escapeHtml(t.name)}${t.status==='review'?'<i class="warning">!</i>':''}</strong><small>${formatTransactionDate(t.date)} · ${escapeHtml(t.method)}</small></span><span class="tx-value ${t.type==='income'?'in':''}">${t.type==='income'?'+':'−'} ${euro.format(t.amount)}</span></button>`).join('')}</div>`}
function bindCommon(){document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{state.route=b.dataset.go;render()});bindTransactions()}
function bindTransactions(){document.querySelectorAll('.transaction').forEach(b=>b.onclick=()=>detail(b.dataset.id))}
function openNew(){open(`<div class="sheet-title"><h2>Neue Buchung</h2><button class="close">✕</button></div><p class="subtitle">Wie möchtest du sie hinzufügen?</p><div class="action-grid"><button class="action-card" id="manual"><span>✎</span><strong>Manuell</strong><small>Daten selbst eintragen</small></button><button class="action-card" id="upload"><span>↑</span><strong>Datei importieren</strong><small>PDF, CSV oder Bild</small></button><button class="action-card" id="camera"><span>◎</span><strong>Beleg scannen</strong><small>Foto aufnehmen</small></button><button class="action-card" id="shared"><span>↗</span><strong>Geteilt</strong><small>Aus anderer App</small></button></div>`);content.querySelector('#manual').onclick=()=>manualForm();content.querySelector('#upload').onclick=()=>document.querySelector('#fileInput').click();content.querySelector('#camera').onclick=()=>{const i=document.querySelector('#fileInput');i.accept='image/*';i.setAttribute('capture','environment');i.click()};content.querySelector('#shared').onclick=()=>showToast('Geteilte Dateien erscheinen nach Installation als App.')}
function manualForm(existing){const t=existing||{name:'',amount:'',type:'expense',date:new Date().toISOString().slice(0,10),method:'Girokonto',status:'confirmed',source:'Manuell'};open(`<div class="sheet-title"><h2>${existing?'Buchung ändern':'Manuell buchen'}</h2><button class="close">✕</button></div><form class="form" id="txForm"><div class="field"><label>Empfänger / Sender</label><input name="name" value="${escapeHtml(t.name)}" required placeholder="z. B. REWE Markt"></div><div class="split"><div class="field"><label>Betrag</label><input name="amount" type="number" min="0.01" step="0.01" value="${t.amount}" required></div><div class="field"><label>Art</label><select name="type"><option value="expense" ${t.type==='expense'?'selected':''}>Ausgabe</option><option value="income" ${t.type==='income'?'selected':''}>Einnahme</option></select></div></div><div class="field"><label>Datum</label><input name="date" type="date" value="${String(t.date).slice(0,10)}" required></div><div class="field"><label>Zahlungsweg</label><select name="method">${['Girokonto','PayPal','Bar','Kreditkarte','Sonstiges'].map(x=>`<option ${t.method===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Notiz</label><textarea name="note" placeholder="Zusätzliche Angaben, z. B. Datum der Abbuchung">${escapeHtml(t.note||'')}</textarea></div><button class="primary" type="submit">${existing?'Änderungen speichern':'Buchung speichern'}</button></form>`);content.querySelector('#txForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),data=Object.fromEntries(f);data.amount=Number(data.amount);data.date=new Date(`${data.date}T12:00:00`).toISOString();data.status=t.amountUncertain?'confirmed':(t.status||'confirmed');data.source=t.source||'Manuell';if(existing){Object.assign(existing,data);delete existing.amountUncertain}else{data.id=crypto.randomUUID();state.transactions.push(data)}save();sheet.close();render();showToast(existing?'Buchung aktualisiert':'Buchung gespeichert')}}
function bankDateNote(type,date){return (type==='income'?'Auf das Konto gebucht: ':'Vom Konto abgebucht: ')+new Date(date).toLocaleDateString('de-DE')}
function displayedTransactionNote(t){if(t.bankDate){const base=bankDateNote(t.type,t.bankDate),details=String(t.source||'').includes('Konto-Screenshot')&&String(t.note||'').includes('\n')?String(t.note).slice(String(t.note).indexOf('\n')):'';return base+details}return t.note||''}
function detail(id){const t=state.transactions.find(x=>x.id===id);if(!t)return;const match=state.transactions.find(x=>x.id===t.matchId),shownNote=displayedTransactionNote(t);open(`<div class="sheet-title"><div><span class="eyebrow">${t.type==='income'?'Sender':'Empfänger'}</span><h2>${escapeHtml(t.name)}</h2></div><button class="close">✕</button></div><div class="detail-amount ${t.type==='income'?'in':'out'}">${t.type==='income'?'+':'−'} ${euro.format(t.amount)}</div><div class="detail-list"><div class="detail-row"><span>Datum</span><strong>${formatTransactionDate(t.date,true)}</strong></div><div class="detail-row"><span>Zahlungsweg</span><strong>${escapeHtml(t.method)}</strong></div><div class="detail-row"><span>Quelle</span><strong>${escapeHtml(t.source)}</strong></div><div class="detail-row"><span>Status</span><strong class="status ${t.status==='confirmed'?'ok':'open'}">${t.status==='confirmed'?'Geprüft & bestätigt':'Prüfung nötig'}</strong></div>${shownNote?`<div class="detail-row note-row"><span>Notiz</span><details><summary>Notiz vollständig anzeigen</summary><div>${escapeHtml(shownNote)}</div></details></div>`:''}</div>${match?`<div class="review-box"><strong>Mögliche Doppelbuchung</strong><p>${escapeHtml(match.name)} · ${euro.format(match.amount)} · ${formatTransactionDate(match.date,true)}<br>Datum und Empfänger weichen leicht ab.</p><div class="review-actions"><button class="secondary" id="separate">Verschieden</button><button class="secondary" id="merge">Zusammenführen</button></div></div>`:''}<div class="split" style="margin-top:18px"><button class="secondary" id="edit">Ändern</button><button class="secondary danger" id="delete">Löschen</button></div>`);content.querySelector('#edit').onclick=()=>manualForm(t);content.querySelector('#delete').onclick=()=>{if(confirm('Diese Buchung wirklich löschen?')){state.transactions=state.transactions.filter(x=>x.id!==id);save();sheet.close();render();showToast('Buchung gelöscht')}};content.querySelector('#merge')?.addEventListener('click',()=>{const keep={...t,name:t.name.length<=match.name.length?t.name:match.name,status:'confirmed',matchId:null,note:`Abgeglichen aus ${t.source} und ${match.source}`};state.transactions=state.transactions.filter(x=>x.id!==t.id&&x.id!==match.id);state.transactions.push(keep);save();sheet.close();render();showToast('Doppelbuchung zusammengeführt')});content.querySelector('#separate')?.addEventListener('click',()=>{t.status=match.status='confirmed';t.matchId=match.matchId=null;save();sheet.close();render();showToast('Als getrennte Buchungen bestätigt')})}
function open(html){content.innerHTML='<div class="sheet-handle"></div>'+html;content.querySelector('.close')?.addEventListener('click',()=>sheet.close());sheet.showModal()}
document.querySelectorAll('.bottom-nav button').forEach(b=>b.onclick=()=>{state.route=b.dataset.route;render()});
document.querySelector('#fileInput').onchange=async e=>{
 const files=[...e.target.files];if(!files.length)return;
 if(files.every(f=>f.name.toLowerCase().endsWith('.csv'))){for(const file of files)await importCsv(file);sheet.close();render();showToast(`${files.length} CSV-Datei(en) importiert`)}
 else{open(`<div class="sheet-title"><h2>Import prüfen</h2><button class="close">✕</button></div><div class="import-box"><strong>${files.length} Datei(en) bereit</strong><p>${files.map(f=>escapeHtml(f.name)).join('<br>')}</p></div>${files.length>1?'<div class="review-box"><strong>Mehrfachimport nicht verfügbar</strong><p>Bitte PDF-Kontoauszüge und Kassenbons einzeln importieren. Der unzuverlässige Bank-Screenshot-Import wurde deaktiviert.</p></div>':''}<button class="primary" id="createFromFile">Datei prüfen</button>`);content.querySelector('#createFromFile').onclick=()=>showDocumentImport(files[0])}
 e.target.value='';
};
async function importCsv(file){const text=await file.text(),lines=text.trim().split(/\r?\n/),sep=lines[0].includes(';')?';':',';for(const line of lines.slice(1)){const c=line.split(sep).map(x=>x.replace(/^"|"$/g,'').trim());if(c.length<3)continue;const parsed=Number(String(c[2]).replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,''));const date=parseDate(c[0]);if(!date||!Number.isFinite(parsed))continue;state.transactions.push({id:crypto.randomUUID(),date:date.toISOString(),name:c[1]||'Unbekannt',amount:Math.abs(parsed),type:parsed>=0?'income':'expense',method:'Girokonto',status:'review',source:'CSV'})}save()}
function parseDate(s){const p=s.split(/[.\/-]/);if(p.length!==3)return null;return p[0].length===4?new Date(+p[0],+p[1]-1,+p[2],12):new Date(+p[2],+p[1]-1,+p[0],12)}
function formatTransactionDate(value,full=false){const date=new Date(value);if(Number.isNaN(date.getTime()))return 'Datum fehlt';return full?date.toLocaleDateString('de-DE'):shortDate.format(date)}
function showToast(msg){const t=document.querySelector('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)}
function initials(s){return s.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase()}
function capitalize(s){return s.charAt(0).toUpperCase()+s.slice(1)}
function escapeHtml(s=''){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');
render();

handleSharedLaunch();
async function handleSharedLaunch(){
 const params=new URLSearchParams(location.search);
 if(params.has('shareError')){showToast('Die geteilte Datei konnte nicht gelesen werden.');history.replaceState({},'',location.pathname);return}
 if(!params.has('shared'))return;
 history.replaceState({},'',location.pathname);
 const shared=await readLatestShare();
 if(!shared){showToast('Keine geteilte Datei gefunden.');return}
 const files=shared.files||[],names=files.length?files.map(file=>escapeHtml(file.name||'Kontoauszug')).join('<br>'):'Geteilter Inhalt';
 open(`<div class="sheet-title"><h2>Kontoauszug erhalten</h2><button class="close">✕</button></div><div class="import-box"><strong>${files.length||1} Datei(en) aus deiner Bank-App</strong><p>${names}</p></div><p class="subtitle" style="margin-top:14px">Der Kontoauszug wurde nur auf diesem Gerät gespeichert. Prüfe und ergänze die Buchungsdaten vor der Übernahme.</p><button class="primary" id="reviewShared">Import prüfen</button>`);
 content.querySelector('#reviewShared').onclick=()=>showDocumentImport(files[0]);
}
function openShareDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open('moneybrain-share',1);request.onupgradeneeded=()=>request.result.createObjectStore('inbox',{keyPath:'id',autoIncrement:true});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
async function readLatestShare(){try{const db=await openShareDb();return await new Promise((resolve,reject)=>{const tx=db.transaction('inbox','readwrite'),store=tx.objectStore('inbox'),request=store.openCursor(null,'prev');request.onsuccess=()=>{const cursor=request.result;if(!cursor){resolve(null);return}const value=cursor.value;cursor.delete();resolve(value)};request.onerror=()=>reject(request.error);tx.oncomplete=()=>db.close()})}catch{return null}}
async function showStatementOnly(file){
 if(!file){showToast('Der Kontoauszug enthält keine Datei.');return}
 const button=content.querySelector('#reviewShared,#createFromFile');button.disabled=true;button.textContent='Kontoauszug wird gelesen …';
 try{
  const result=await window.parseDeutscheBankStatement(file);
  open('<div class="sheet-title"><h2>Importübersicht</h2><button class="close">✕</button></div><p class="subtitle">'+result.pages+' Seiten wurden vollständig gelesen.'+(result.cashMovements?' '+result.cashMovements+' Bargeldbewegung(en) über '+euro.format(result.cashExcluded)+' werden nicht berücksichtigt.':'')+'</p><div class="year-summary"><span class="eyebrow">Erkannte Buchungen</span><strong style="font-size:30px;display:block;margin-top:8px">'+result.transactions.length+'</strong><div class="year-summary-grid"><div><small>Einnahmen</small><strong>'+euro.format(result.income)+'</strong></div><div><small>Ausgaben</small><strong>'+euro.format(result.expense)+'</strong></div></div></div><div class="detail-list"><div class="detail-row"><span>Status</span><strong class="status ok">Kontoauszug geprüft</strong></div><div class="detail-row"><span>Übernahme</span><strong>Alle Buchungen</strong></div></div><button class="primary" id="importStatement">Alle '+result.transactions.length+' Buchungen übernehmen</button><button class="secondary" style="width:100%" id="previewStatement">Buchungen ansehen</button>');
  content.querySelector('#previewStatement').onclick=()=>{open('<div class="sheet-title"><h2>Erkannte Buchungen</h2><button class="close">✕</button></div><p class="subtitle">'+result.transactions.length+' Buchungen, chronologisch sortiert</p>'+list([...result.transactions].sort((a,b)=>new Date(b.date)-new Date(a.date))))};
  content.querySelector('#importStatement').onclick=()=>importStatementTransactions(result.transactions);
 }catch(error){open('<div class="sheet-title"><h2>Import nicht möglich</h2><button class="close">✕</button></div><div class="review-box"><strong>Kontoauszug nicht erkannt</strong><p>'+escapeHtml(error.message)+'</p></div>')}
}
const matchDay=86400000;
function isGenericBankMerchant(name){return /^(Kartenzahlung|Unbekannte Buchung)$/i.test(String(name||''))}
function transactionNameKey(value){return String(value||'').toLowerCase().replace(/gmbh|markt|marken-discount|filiale|[^a-z0-9]/g,'')}
function sameTransactionMerchant(a,b){const left=transactionNameKey(a),right=transactionNameKey(b);return left.length>2&&right.length>2&&(left.includes(right)||right.includes(left))}
function transactionCandidates(transaction,sourceTest){return state.transactions.filter(item=>sourceTest(item)&&item.type===transaction.type&&Math.abs(Number(item.amount)-Number(transaction.amount))<0.005&&Math.abs(new Date(item.date)-new Date(transaction.date))<=5*matchDay)}
function importStatementTransactions(items){
 const months=new Set(items.map(item=>String(item.date).slice(0,7)));
 state.transactions=state.transactions.filter(item=>!(item.source==='Kontoauszug'&&months.has(String(item.date).slice(0,7))));
 let merged=0,review=0,added=0;
 items.forEach(bank=>{
  const screenshots=state.transactions.filter(item=>String(item.source||'').includes('Konto-Screenshot')&&item.type===bank.type&&Math.abs(Number(item.amount)-Number(bank.amount))<0.005&&Math.abs(new Date(item.bankDate||item.date)-new Date(bank.date))<=matchDay&&sameTransactionMerchant(item.name,bank.name));
  if(screenshots.length===1){const screenshot=screenshots[0],hasReceipt=String(screenshot.source||'').includes('Kassenbon');Object.assign(screenshot,{bankDate:bank.date,valueDate:bank.valueDate||bank.date,method:bank.method||screenshot.method,status:'confirmed',source:'Kontoauszug + Konto-Screenshot'+(hasReceipt?' + Kassenbon':''),note:bankDateNote(bank.type,bank.date)});delete screenshot.matchId;merged++;return}
  if(screenshots.length>1){bank.status='review';state.transactions.push(bank);review++;added++;return}
  const candidates=transactionCandidates(bank,item=>String(item.source||'').includes('Kassenbon'));
  const matching=candidates.filter(item=>sameTransactionMerchant(item.name,bank.name));
  if(matching.length===1){const receipt=matching[0];Object.assign(receipt,{bankDate:bank.date,valueDate:bank.valueDate||bank.date,method:bank.method||receipt.method,status:'confirmed',source:'Kontoauszug + Kassenbon',note:bankDateNote(bank.type,bank.date)});delete receipt.matchId;merged++;return}
  if(candidates.length===1){bank.status='review';bank.matchId=candidates[0].id;candidates[0].status='review';candidates[0].matchId=bank.id;review++}else if(candidates.length>1){bank.status='review';review++}
  state.transactions.push(bank);added++;
 });
 save();sheet.close();state.route='transactions';state.filter='all';render();
 showToast(merged+' abgeglichen, '+added+' übernommen'+(review?', '+review+' zur Prüfung':'')+'; Bargeld ignoriert');
}

async function showDocumentImport(file){
 if(!file){showToast('Keine Datei gefunden.');return}
 if(/kontoauszug/i.test(file.name))return showStatementOnly(file);
 return showReceiptImport(file);
}
async function showReceiptImport(file){
 try{
  const receipt=await window.parseRetailReceipt(file,message=>{const button=content.querySelector('#reviewShared,#createFromFile');if(button)button.textContent=message});
  open('<div class="sheet-title"><h2>Beleg erkannt</h2><button class="close">✕</button></div><div class="detail-amount out">− '+euro.format(receipt.amount)+'</div><div class="detail-list"><div class="detail-row"><span>Händler</span><strong>'+escapeHtml(receipt.name)+'</strong></div><div class="detail-row"><span>Datum</span><strong>'+new Date(receipt.date).toLocaleDateString('de-DE')+'</strong></div><div class="detail-row"><span>Zahlungsweg</span><strong>'+escapeHtml(receipt.method)+'</strong></div><div class="detail-row"><span>Status</span><strong class="status ok">Beleg geprüft</strong></div></div><button class="primary" id="importReceipt">Buchung übernehmen</button><button class="secondary" style="width:100%" id="editReceipt">Vorher ändern</button>');
  content.querySelector('#importReceipt').onclick=()=>importReceiptTransaction(receipt);
  content.querySelector('#editReceipt').onclick=()=>manualForm(receipt);
 }catch(error){open('<div class="sheet-title"><h2>Import nicht möglich</h2><button class="close">✕</button></div><div class="review-box"><strong>Beleg nicht erkannt</strong><p>'+escapeHtml(error.message)+'</p></div>')}
}
function importReceiptTransaction(receipt){
 const candidates=transactionCandidates(receipt,item=>String(item.source||'').includes('Kontoauszug')||String(item.source||'').includes('Konto-Screenshot'));
 const matching=candidates.filter(item=>sameTransactionMerchant(item.name,receipt.name)||isGenericBankMerchant(item.name));
 if(matching.length===1){
  const bank=matching[0],bankDate=bank.bankDate||bank.date,fromScreenshot=String(bank.source||'').includes('Konto-Screenshot');
  Object.assign(bank,receipt,{id:bank.id,date:receipt.date,bankDate,valueDate:bank.valueDate||bankDate,method:bank.method||receipt.method,status:'confirmed',source:(fromScreenshot?'Konto-Screenshot':'Kontoauszug')+' + Kassenbon',note:bankDateNote(bank.type,bankDate)});delete bank.matchId;
  save();sheet.close();render();showToast('Beleg mit Kontoauszug abgeglichen');return;
 }
 if(candidates.length===1){receipt.status='review';receipt.matchId=candidates[0].id;candidates[0].status='review';candidates[0].matchId=receipt.id}
 state.transactions.push(receipt);save();sheet.close();render();showToast(candidates.length===1?'Mögliche Doppelbuchung zur Prüfung':'Beleg übernommen');
}
