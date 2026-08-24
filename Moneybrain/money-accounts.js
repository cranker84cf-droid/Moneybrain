(function(){
 const accountsKey='moneybrain.accounts.v2',reconciliationsKey='moneybrain.reconciliations.v2';
 const nowIso=()=>new Date().toISOString();
 const number=value=>Number.isFinite(Number(value))?Number(value):0;
 const defaults=()=>[
  {id:crypto.randomUUID(),systemKey:'giro',name:'Girokonto',type:'bank',active:true,includeInBudget:true,sortOrder:10,createdAt:nowIso(),updatedAt:nowIso()},
  {id:crypto.randomUUID(),systemKey:'paypal',name:'PayPal',type:'paypal',active:true,includeInBudget:true,sortOrder:20,createdAt:nowIso(),updatedAt:nowIso()},
  {id:crypto.randomUUID(),systemKey:'wallet',name:'Portemonnaie',type:'cash',active:true,includeInBudget:true,sortOrder:30,createdAt:nowIso(),updatedAt:nowIso()}
 ];
 function normalizeAccount(account){return {id:String(account.id||crypto.randomUUID()),systemKey:account.systemKey||null,name:String(account.name||'Geldtopf').trim(),type:String(account.type||'other'),active:account.active!==false,includeInBudget:account.includeInBudget!==false,sortOrder:number(account.sortOrder),createdAt:account.createdAt||nowIso(),updatedAt:account.updatedAt||nowIso()}}
 function normalizeReconciliation(item){return {id:String(item.id||crypto.randomUUID()),accountId:String(item.accountId),calculatedBalance:number(item.calculatedBalance),actualBalance:number(item.actualBalance),difference:number(item.difference),reconciledAt:item.reconciledAt||nowIso(),note:String(item.note||''),createdAt:item.createdAt||nowIso()}}
 function loadArray(key,normalizer,fallback=[]){try{const stored=JSON.parse(localStorage.getItem(key)||'null');if(Array.isArray(stored))return stored.map(normalizer)}catch{}return fallback}
 let accounts=loadArray(accountsKey,normalizeAccount,defaults()),reconciliations=loadArray(reconciliationsKey,normalizeReconciliation,[]);
 function persistAccounts(queue=true){accounts=accounts.map(normalizeAccount).sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name));localStorage.setItem(accountsKey,JSON.stringify(accounts));if(queue)window.MoneybrainCloud?.queueAccounts(accounts);window.render?.()}
 function persistReconciliations(queueItem=null){reconciliations=reconciliations.map(normalizeReconciliation).sort((a,b)=>new Date(a.reconciledAt)-new Date(b.reconciledAt));localStorage.setItem(reconciliationsKey,JSON.stringify(reconciliations));if(queueItem)window.MoneybrainCloud?.queueReconciliation(queueItem);window.render?.()}
 function all(){return accounts.map(account=>({...account}))}
 function active(){return all().filter(account=>account.active)}
 function history(accountId){return reconciliations.filter(item=>item.accountId===accountId).map(item=>({...item})).sort((a,b)=>new Date(b.reconciledAt)-new Date(a.reconciledAt))}
 function accountForTransaction(transaction){return transaction.accountId?accounts.find(account=>account.id===transaction.accountId)||null:null}
 function balanceAt(account,transactions=[],at=nowIso()){
  const cutoff=new Date(at).getTime(),prior=history(account.id).filter(item=>new Date(item.reconciledAt).getTime()<=cutoff).sort((a,b)=>new Date(b.reconciledAt)-new Date(a.reconciledAt))[0],baseTime=prior?new Date(prior.reconciledAt).getTime():-Infinity;
  let result=prior?number(prior.actualBalance):0;
  for(const transaction of transactions){const time=new Date(transaction.date).getTime();if(transaction.amountUncertain||time<=baseTime||time>cutoff)continue;const parts=window.MoneybrainMovements?.splitsFor(transaction.id)||[];if(parts.length){result+=parts.filter(part=>part.kind!=='transfer'&&(part.accountId||transaction.accountId)===account.id).reduce((sum,part)=>sum+(part.kind==='income'?number(part.amount):-number(part.amount)),0);continue}if(transaction.accountId===account.id)result+=transaction.type==='income'?number(transaction.amount):-number(transaction.amount)}
  result+=window.MoneybrainMovements?.accountDelta(account.id,baseTime===-Infinity?null:new Date(baseTime).toISOString(),new Date(cutoff).toISOString())||0;
  return Math.round((result+Number.EPSILON)*100)/100;
 }
 function balance(account,transactions=[]){return balanceAt(account,transactions)}
 function totals(transactions=[]){const rows=all().map(account=>({...account,balance:balance(account,transactions)}));return {rows,available:rows.filter(account=>account.active&&account.includeInBudget).reduce((sum,account)=>sum+account.balance,0),assets:rows.filter(account=>account.active&&!account.includeInBudget).reduce((sum,account)=>sum+account.balance,0)}}
 function unassigned(transactions=[]){return transactions.filter(transaction=>!transaction.accountId).length}
 function create(input){const maxOrder=Math.max(0,...accounts.map(account=>account.sortOrder)),account=normalizeAccount({...input,id:crypto.randomUUID(),sortOrder:maxOrder+10,createdAt:nowIso(),updatedAt:nowIso()});accounts.push(account);persistAccounts();return account}
 function update(id,input){const index=accounts.findIndex(account=>account.id===id);if(index<0)throw new Error('Geldtopf nicht gefunden');accounts[index]=normalizeAccount({...accounts[index],...input,id,updatedAt:nowIso()});persistAccounts();return accounts[index]}
 function hasHistory(id,transactions=[]){return history(id).length>0||transactions.some(transaction=>transaction.accountId===id)}
 function remove(id,transactions=[]){if(hasHistory(id,transactions))throw new Error('Geldtopf mit Historie kann nur deaktiviert werden');accounts=accounts.filter(account=>account.id!==id);persistAccounts(false);window.MoneybrainCloud?.deleteAccount(id);window.render?.()}
 function reconcile(accountId,actualBalance,reconciledAt,transactions=[],note=''){const account=accounts.find(item=>item.id===accountId);if(!account)throw new Error('Geldtopf nicht gefunden');const calculated=balanceAt(account,transactions,reconciledAt),actual=number(actualBalance),item=normalizeReconciliation({id:crypto.randomUUID(),accountId,calculatedBalance:calculated,actualBalance:actual,difference:Math.round((actual-calculated+Number.EPSILON)*100)/100,reconciledAt,note,createdAt:nowIso()});reconciliations.push(item);persistReconciliations(item);return item}
 function applyCloudRows(rows){if(!Array.isArray(rows)||!rows.length)return;accounts=rows.map(fromAccountRow);persistAccounts(false)}
 function applyCloudReconciliations(rows){if(!Array.isArray(rows))return;const byId=new Map(reconciliations.map(item=>[item.id,item]));rows.map(fromReconciliationRow).forEach(item=>byId.set(item.id,item));reconciliations=[...byId.values()];persistReconciliations()}
 function exportRows(){return accounts.map(toAccountRow)}
 function toAccountRow(account){return {id:account.id,system_key:account.systemKey,name:account.name,account_type:account.type,is_active:account.active,include_in_budget:account.includeInBudget,sort_order:account.sortOrder,created_at:account.createdAt,updated_at:account.updatedAt}}
 function fromAccountRow(row){return normalizeAccount({id:row.id,systemKey:row.system_key,name:row.name,type:row.account_type,active:row.is_active,includeInBudget:row.include_in_budget,sortOrder:row.sort_order,createdAt:row.created_at,updatedAt:row.updated_at})}
 function toReconciliationRow(item){return {id:item.id,account_id:item.accountId,calculated_balance:item.calculatedBalance,actual_balance:item.actualBalance,difference:item.difference,reconciled_at:item.reconciledAt,note:item.note,created_at:item.createdAt}}
 function fromReconciliationRow(row){return normalizeReconciliation({id:row.id,accountId:row.account_id,calculatedBalance:row.calculated_balance,actualBalance:row.actual_balance,difference:row.difference,reconciledAt:row.reconciled_at,note:row.note,createdAt:row.created_at})}
 window.MoneybrainAccounts={all,active,history,balance,balanceAt,totals,unassigned,accountForTransaction,create,update,remove,hasHistory,reconcile,applyCloudRows,applyCloudReconciliations,exportRows,toReconciliationRow,types:[['bank','Bankkonto'],['paypal','PayPal'],['cash','Bargeld'],['savings','Sparen'],['investment','Anlage'],['other','Sonstiges']]};
})();
