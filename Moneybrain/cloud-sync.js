(function(){
 const config=window.MONEYBRAIN_SUPABASE||{};
 const sessionKey='moneybrain.supabase.session';
 const requestTimeoutMs=12000;
 let session=null,uploadTimer=null,accountUploadTimer=null,reconciliationUploadTimer=null,movementUploadTimer=null,syncing=false,accountsSyncing=false,movementsSyncing=false;

 function configured(){return /^https:\/\/.+\.supabase\.co$/i.test(config.url||'')&&!String(config.publishableKey||'').startsWith('HIER_')}
 function headers(accessToken,extra={}){return {apikey:config.publishableKey,Authorization:`Bearer ${accessToken||config.publishableKey}`,...extra}}
 function readSession(){try{return JSON.parse(localStorage.getItem(sessionKey)||'null')}catch{return null}}
 function storeSession(value){session=value;if(value)localStorage.setItem(sessionKey,JSON.stringify(value));else localStorage.removeItem(sessionKey)}
 function expiresSoon(value){return !value?.access_token||Number(value.expires_at||0)*1000<Date.now()+60000}
 function lockApp(){const shell=document.querySelector('.app-shell');if(shell){shell.hidden=true;shell.setAttribute('aria-hidden','true')}}
 function unlockApp(){const shell=document.querySelector('.app-shell');if(shell){shell.hidden=false;shell.removeAttribute('aria-hidden')}}
 function authMessage(error){return error?.name==='AbortError'?'Die Anmeldung hat zu lange gedauert. Bitte Verbindung prüfen und erneut versuchen.':'Anmeldung nicht möglich. Bitte E-Mail und Passwort prüfen.'}

 async function request(path,options={},timeoutMs=requestTimeoutMs){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
   const response=await fetch(config.url+path,{...options,signal:controller.signal});
   const responseText=await response.text();let body=null;
   try{body=responseText?JSON.parse(responseText):null}catch{body=responseText}
   if(!response.ok)throw new Error(body?.msg||body?.message||body?.error_description||'Cloud-Anfrage fehlgeschlagen');
   return body;
  }finally{clearTimeout(timer)}
 }
 async function refresh(){if(!session?.refresh_token)return null;try{const next=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:headers(null,{'Content-Type':'application/json'}),body:JSON.stringify({refresh_token:session.refresh_token})});next.expires_at=Math.floor(Date.now()/1000)+Number(next.expires_in||3600);storeSession(next);return next}catch{storeSession(null);return null}}
 async function validSession(){session=readSession();if(session&&expiresSoon(session))await refresh();return session}
 async function login(email,password){const next=await request('/auth/v1/token?grant_type=password',{method:'POST',headers:headers(null,{'Content-Type':'application/json'}),body:JSON.stringify({email,password})});next.expires_at=Math.floor(Date.now()/1000)+Number(next.expires_in||3600);storeSession(next);return next}
 async function cloudRow(){const rows=await request('/rest/v1/moneybrain_data?select=transactions,updated_at',{headers:headers(session.access_token)});return Array.isArray(rows)?rows[0]:null}
 async function cloudAccounts(){return request('/rest/v1/money_accounts?select=id,system_key,name,account_type,opening_balance,confirmed_balance,last_reconciled_at,is_active,include_in_budget,sort_order,created_at,updated_at&order=sort_order.asc',{headers:headers(session.access_token)})}
 async function cloudReconciliations(){return request('/rest/v1/money_balance_reconciliations?select=id,account_id,calculated_balance,actual_balance,difference,reconciled_at,note,created_at&order=reconciled_at.asc',{headers:headers(session.access_token)})}
 async function cloudTransfers(){return request('/rest/v1/money_transfers?select=id,source_account_id,target_account_id,amount,occurred_at,note,source_transaction_id,status,created_at,updated_at&order=occurred_at.asc',{headers:headers(session.access_token)})}
 async function cloudSplits(){return request('/rest/v1/money_transaction_splits?select=id,transaction_id,split_kind,amount,label,transfer_id,created_at&order=created_at.asc',{headers:headers(session.access_token)})}
 async function upload(items){if(!session||syncing)return;syncing=true;try{const updatedAt=localStorage.getItem('moneybrain.localUpdatedAt')||new Date().toISOString();await request('/rest/v1/moneybrain_data?on_conflict=user_id',{method:'POST',headers:headers(session.access_token,{'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'}),body:JSON.stringify({user_id:session.user.id,transactions:items,updated_at:updatedAt})});setCloudStatus('Gesichert')}catch(error){setCloudStatus('Nicht synchronisiert');console.error(error)}finally{syncing=false}}
 function queueUpload(items){if(!configured()||!session)return;clearTimeout(uploadTimer);uploadTimer=setTimeout(()=>upload(items),500)}
 async function uploadAccounts(items){if(!session||accountsSyncing||!window.MoneybrainAccounts)return;accountsSyncing=true;try{const rows=window.MoneybrainAccounts.exportRows().map(row=>({...row,user_id:session.user.id}));await request('/rest/v1/money_accounts?on_conflict=id',{method:'POST',headers:headers(session.access_token,{'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'}),body:JSON.stringify(rows)});setCloudStatus('Gesichert')}catch(error){setCloudStatus('Nicht synchronisiert');console.error(error)}finally{accountsSyncing=false}}
 function queueAccounts(items){if(!configured()||!session)return;clearTimeout(accountUploadTimer);accountUploadTimer=setTimeout(()=>uploadAccounts(items),500)}
 async function uploadReconciliation(item){if(!session||!window.MoneybrainAccounts)return;const row={...window.MoneybrainAccounts.toReconciliationRow(item),user_id:session.user.id};await request('/rest/v1/money_balance_reconciliations',{method:'POST',headers:headers(session.access_token,{'Content-Type':'application/json',Prefer:'return=minimal'}),body:JSON.stringify(row)});setCloudStatus('Gesichert')}
 function queueReconciliation(item){if(!configured()||!session)return;clearTimeout(reconciliationUploadTimer);reconciliationUploadTimer=setTimeout(()=>uploadReconciliation(item).catch(error=>{setCloudStatus('Nicht synchronisiert');console.error(error)}),250)}
 async function deleteAccount(id){if(!session)return;try{await request('/rest/v1/money_accounts?id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:headers(session.access_token,{Prefer:'return=minimal'})});setCloudStatus('Gesichert')}catch(error){setCloudStatus('Nicht synchronisiert');console.error(error)}}
 async function uploadMovements(snapshot){if(!session||movementsSyncing||!window.MoneybrainMovements)return;movementsSyncing=true;try{const transferRows=snapshot.transfers.map(item=>({...window.MoneybrainMovements.toTransferRow(item),user_id:session.user.id})),splitRows=snapshot.splits.map(item=>({...window.MoneybrainMovements.toSplitRow(item),user_id:session.user.id}));if(transferRows.length)await request('/rest/v1/money_transfers?on_conflict=id',{method:'POST',headers:headers(session.access_token,{'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'}),body:JSON.stringify(transferRows)});if(splitRows.length)await request('/rest/v1/money_transaction_splits?on_conflict=id',{method:'POST',headers:headers(session.access_token,{'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'}),body:JSON.stringify(splitRows)});setCloudStatus('Gesichert')}finally{movementsSyncing=false}}
 function queueMovements(snapshot){if(!configured()||!session)return;clearTimeout(movementUploadTimer);movementUploadTimer=setTimeout(()=>uploadMovements(snapshot).catch(error=>{setCloudStatus('Nicht synchronisiert');console.error(error)}),500)}
 async function replaceTransactionSplits(transactionId,removedTransferIds,newTransfers,newSplits){if(!session)return;try{await request('/rest/v1/money_transaction_splits?transaction_id=eq.'+encodeURIComponent(transactionId),{method:'DELETE',headers:headers(session.access_token,{Prefer:'return=minimal'})});if(removedTransferIds.length)await request('/rest/v1/money_transfers?id=in.('+removedTransferIds.map(encodeURIComponent).join(',')+')',{method:'DELETE',headers:headers(session.access_token,{Prefer:'return=minimal'})});const transferRows=newTransfers.map(item=>({...window.MoneybrainMovements.toTransferRow(item),user_id:session.user.id})),splitRows=newSplits.map(item=>({...window.MoneybrainMovements.toSplitRow(item),user_id:session.user.id}));if(transferRows.length)await request('/rest/v1/money_transfers',{method:'POST',headers:headers(session.access_token,{'Content-Type':'application/json',Prefer:'return=minimal'}),body:JSON.stringify(transferRows)});if(splitRows.length)await request('/rest/v1/money_transaction_splits',{method:'POST',headers:headers(session.access_token,{'Content-Type':'application/json',Prefer:'return=minimal'}),body:JSON.stringify(splitRows)});setCloudStatus('Gesichert')}catch(error){setCloudStatus('Nicht synchronisiert');console.error(error)}}
 async function synchronizeAccounts(){if(!window.MoneybrainAccounts)return;const [rows,reconciliationRows,transferRows,splitRows]=await Promise.all([cloudAccounts(),cloudReconciliations(),cloudTransfers(),cloudSplits()]);if(Array.isArray(rows)&&rows.length)window.MoneybrainAccounts.applyCloudRows(rows);else await uploadAccounts(window.MoneybrainAccounts.all());window.MoneybrainAccounts.applyCloudReconciliations(reconciliationRows);if(window.MoneybrainMovements){if((!transferRows?.length&&!splitRows?.length)&&(window.MoneybrainMovements.allTransfers().length||window.MoneybrainMovements.allSplits().length))await uploadMovements({transfers:window.MoneybrainMovements.allTransfers(),splits:window.MoneybrainMovements.allSplits()});else window.MoneybrainMovements.applyCloud(transferRows,splitRows)}}
 async function synchronize(){const row=await cloudRow(),local=window.moneybrainGetTransactions(),localStamp=Date.parse(localStorage.getItem('moneybrain.localUpdatedAt')||'')||0,cloudStamp=Date.parse(row?.updated_at||'')||0;if(!row){await upload(local);return}const cloud=Array.isArray(row.transactions)?row.transactions:[];if(local.length&&!cloud.length){await upload(local);return}if(cloud.length&&(!local.length||cloudStamp>localStamp)){window.moneybrainApplyCloudTransactions(cloud,row.updated_at);setCloudStatus('Wiederhergestellt');return}if(localStamp>cloudStamp)await upload(local);else setCloudStatus('Synchronisiert')}
 function setCloudStatus(text){document.querySelectorAll('#cloudStatus').forEach(element=>element.textContent=text)}
 function synchronizeInBackground(){setCloudStatus('Synchronisiere…');Promise.all([synchronize(),synchronizeAccounts()]).catch(error=>{setCloudStatus('Nicht synchronisiert');console.error('Cloud-Synchronisierung fehlgeschlagen',error)})}
 function showLogin(message=''){
  lockApp();
  const overlay=document.querySelector('#authOverlay');if(!overlay)return;
  overlay.hidden=false;
  const form=document.querySelector('#loginForm'),error=document.querySelector('#authError');
  error.textContent=message;
  const password=form.querySelector('input[name="password"]');if(password)password.value='';
  form.onsubmit=async event=>{
   event.preventDefault();const button=event.submitter||event.currentTarget.querySelector('button[type="submit"]');error.textContent='';button.disabled=true;
   try{const data=new FormData(event.currentTarget);await login(String(data.get('email')).trim(),String(data.get('password')));overlay.hidden=true;unlockApp();window.render?.();synchronizeInBackground()}
   catch(loginError){error.textContent=authMessage(loginError)}finally{button.disabled=false}
  };
 }
 async function init(){lockApp();if(!configured())return {configured:false};if(!await validSession()){showLogin();return {configured:true,authenticated:false}}unlockApp();window.render?.();synchronizeInBackground();return {configured:true,authenticated:true}}
 async function signOut(){
  const accessToken=session?.access_token||readSession()?.access_token;
  clearTimeout(uploadTimer);clearTimeout(accountUploadTimer);clearTimeout(reconciliationUploadTimer);clearTimeout(movementUploadTimer);storeSession(null);lockApp();
  const dialog=document.querySelector('#sheet');if(dialog?.open)dialog.close();
  showLogin('Du wurdest sicher abgemeldet.');
  if(accessToken){try{await request('/auth/v1/logout',{method:'POST',headers:headers(accessToken)},5000)}catch(error){console.warn('Supabase-Session konnte serverseitig nicht sofort widerrufen werden.',error)}}
 }
 window.MoneybrainCloud={init,queueUpload,queueAccounts,queueReconciliation,queueMovements,replaceTransactionSplits,deleteAccount,signOut,isConfigured:configured,isSignedIn:()=>Boolean(session)};
})();
