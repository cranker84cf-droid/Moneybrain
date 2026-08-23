(function(){
 const storageKey='moneybrain.accounts.v2';
 const nowIso=()=>new Date().toISOString();
 const number=value=>Number.isFinite(Number(value))?Number(value):0;
 const defaults=()=>[
  {id:crypto.randomUUID(),systemKey:'giro',name:'Girokonto',type:'bank',openingBalance:0,confirmedBalance:null,lastReconciledAt:null,active:true,includeInBudget:true,sortOrder:10,createdAt:nowIso(),updatedAt:nowIso()},
  {id:crypto.randomUUID(),systemKey:'paypal',name:'PayPal',type:'paypal',openingBalance:0,confirmedBalance:null,lastReconciledAt:null,active:true,includeInBudget:true,sortOrder:20,createdAt:nowIso(),updatedAt:nowIso()},
  {id:crypto.randomUUID(),systemKey:'wallet',name:'Portemonnaie',type:'cash',openingBalance:0,confirmedBalance:null,lastReconciledAt:null,active:true,includeInBudget:true,sortOrder:30,createdAt:nowIso(),updatedAt:nowIso()}
 ];
 let accounts=load();

 function normalize(account){return {id:String(account.id||crypto.randomUUID()),systemKey:account.systemKey||null,name:String(account.name||'Geldtopf').trim(),type:String(account.type||'other'),openingBalance:number(account.openingBalance),confirmedBalance:account.confirmedBalance===null||account.confirmedBalance===''||account.confirmedBalance===undefined?null:number(account.confirmedBalance),lastReconciledAt:account.lastReconciledAt||null,active:account.active!==false,includeInBudget:account.includeInBudget!==false,sortOrder:number(account.sortOrder),createdAt:account.createdAt||nowIso(),updatedAt:account.updatedAt||nowIso()}}
 function load(){try{const stored=JSON.parse(localStorage.getItem(storageKey)||'null');if(Array.isArray(stored)&&stored.length)return stored.map(normalize)}catch{}return defaults()}
 function save(queue=true){accounts=accounts.map(normalize).sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name));localStorage.setItem(storageKey,JSON.stringify(accounts));if(queue)window.MoneybrainCloud?.queueAccounts(accounts);window.render?.()}
 function all(){return accounts.map(account=>({...account}))}
 function active(){return all().filter(account=>account.active)}
 function accountForTransaction(transaction){
  if(transaction.accountId)return accounts.find(account=>account.id===transaction.accountId)||null;
  const method=String(transaction.method||'').trim().toLowerCase();
  if(method==='girokonto')return accounts.find(account=>account.systemKey==='giro')||accounts.find(account=>account.name.toLowerCase()==='girokonto')||null;
  if(method==='paypal')return accounts.find(account=>account.systemKey==='paypal')||accounts.find(account=>account.type==='paypal')||null;
  if(method==='bar'||method==='portemonnaie')return accounts.find(account=>account.systemKey==='wallet')||accounts.find(account=>account.name.toLowerCase()==='portemonnaie')||null;
  return null;
 }
 function balance(account,transactions=[]){
  const reconciledAt=account.lastReconciledAt?new Date(account.lastReconciledAt).getTime():null;
  let result=account.confirmedBalance!==null&&reconciledAt!==null?number(account.confirmedBalance):number(account.openingBalance);
  for(const transaction of transactions){
   if(accountForTransaction(transaction)?.id!==account.id||transaction.amountUncertain)continue;
   if(reconciledAt!==null&&new Date(transaction.date).getTime()<=reconciledAt)continue;
   const amount=number(transaction.amount);result+=transaction.type==='income'?amount:-amount;
  }
  return Math.round((result+Number.EPSILON)*100)/100;
 }
 function totals(transactions=[]){const rows=all().map(account=>({...account,balance:balance(account,transactions)}));return {rows,available:rows.filter(account=>account.active&&account.includeInBudget).reduce((sum,account)=>sum+account.balance,0),assets:rows.filter(account=>account.active&&!account.includeInBudget).reduce((sum,account)=>sum+account.balance,0)}}
 function unassigned(transactions=[]){return transactions.filter(transaction=>!accountForTransaction(transaction)).length}
 function create(input){const maxOrder=Math.max(0,...accounts.map(account=>account.sortOrder));const account=normalize({...input,id:crypto.randomUUID(),sortOrder:maxOrder+10,createdAt:nowIso(),updatedAt:nowIso()});accounts.push(account);save();return account}
 function update(id,input){const index=accounts.findIndex(account=>account.id===id);if(index<0)throw new Error('Geldtopf nicht gefunden');accounts[index]=normalize({...accounts[index],...input,id,updatedAt:nowIso()});save();return accounts[index]}
 function applyCloudRows(rows){if(!Array.isArray(rows)||!rows.length)return;accounts=rows.map(fromRow);save(false)}
 function exportRows(){return accounts.map(toRow)}
 function toRow(account){return {id:account.id,system_key:account.systemKey,name:account.name,account_type:account.type,opening_balance:account.openingBalance,confirmed_balance:account.confirmedBalance,last_reconciled_at:account.lastReconciledAt,is_active:account.active,include_in_budget:account.includeInBudget,sort_order:account.sortOrder,created_at:account.createdAt,updated_at:account.updatedAt}}
 function fromRow(row){return normalize({id:row.id,systemKey:row.system_key,name:row.name,type:row.account_type,openingBalance:row.opening_balance,confirmedBalance:row.confirmed_balance,lastReconciledAt:row.last_reconciled_at,active:row.is_active,includeInBudget:row.include_in_budget,sortOrder:row.sort_order,createdAt:row.created_at,updatedAt:row.updated_at})}
 window.MoneybrainAccounts={all,active,balance,totals,unassigned,accountForTransaction,create,update,applyCloudRows,exportRows,types:[['bank','Bankkonto'],['paypal','PayPal'],['cash','Bargeld'],['savings','Sparen'],['investment','Anlage'],['other','Sonstiges']]};
})();
