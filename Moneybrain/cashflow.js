(function(){
 const reserveKey='moneybrain.cashflow.reserve.v2',defaultHorizon=60,averageMonthDays=365.25/12,num=value=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;
 function reserve(){const stored=localStorage.getItem(reserveKey);if(stored===null||stored==='')return 100;const value=Number(stored);return Number.isFinite(value)&&value>=0?value:100}
 function setReserve(value){localStorage.setItem(reserveKey,String(Math.max(0,num(value))));window.render?.()}
 function rhythmMonths(item){return item.rhythm==='quarterly'?3:item.rhythm==='semiannual'?6:item.rhythm==='annual'?12:item.rhythm==='custom'?Math.max(1,Number(item.customMonths||1)):1}
 function rareDailyProvision(fixed){return num(fixed.all().filter(item=>item.active&&rhythmMonths(item)>1).reduce((sum,item)=>sum+fixed.planningAmount(item)/(rhythmMonths(item)*averageMonthDays),0))}
 function forecast(transactions=[],start=new Date(),days=defaultHorizon){
  const horizonDays=Math.max(1,Math.round(Number(days)||defaultHorizon)),accounts=window.MoneybrainAccounts.totals(transactions),fixed=window.MoneybrainFixedCosts,income=window.MoneybrainRecurringIncome,end=new Date(start.getFullYear(),start.getMonth(),start.getDate()+horizonDays,23,59),events=[];
  for(let cursor=new Date(start.getFullYear(),start.getMonth(),1);cursor<=end;cursor.setMonth(cursor.getMonth()+1)){
   fixed.month(cursor.getFullYear(),cursor.getMonth(),transactions).rows.filter(row=>!row.paid&&new Date(row.due)>=start&&new Date(row.due)<=end).forEach(row=>events.push({date:row.due,type:'expense',amount:row.expected,label:row.name,id:row.id,rhythm:row.rhythm}));
   income.month(cursor.getFullYear(),cursor.getMonth(),transactions).filter(row=>!row.received&&new Date(row.due)>=start&&new Date(row.due)<=end).forEach(row=>events.push({date:row.due,type:'income',amount:row.expectedAmount,label:row.name,id:row.id}));
  }
  events.sort((a,b)=>new Date(a.date)-new Date(b.date)||(a.type==='expense'?-1:1));
  const safety=reserve(),rareDaily=rareDailyProvision(fixed),constraints=[];let balance=num(accounts.available),minimum=balance;
  for(const event of events){const elapsed=Math.max(1,Math.min(horizonDays,Math.ceil((new Date(event.date)-start)/86400000)));event.before=balance;constraints.push((event.before-safety)/elapsed-rareDaily);balance=num(balance+(event.type==='income'?event.amount:-event.amount));event.after=balance;minimum=Math.min(minimum,balance);constraints.push((event.after-safety)/elapsed-rareDaily)}
  constraints.push((balance-safety)/horizonDays-rareDaily);
  const daily=num(Math.max(0,Math.min(...constraints))),rareProvision=num(rareDaily*horizonDays),expenseTotal=num(events.filter(event=>event.type==='expense').reduce((sum,event)=>sum+event.amount,0)),free=num(daily*horizonDays),nextIncome=events.find(event=>event.type==='income');
  return {available:num(accounts.available),protectedAmount:num(expenseTotal+rareProvision),expenseTotal,rareDaily,rareProvision,safety,free,daily,budgetDays:horizonDays,horizonDays,events,minimum,covered:minimum>=safety,nextIncome:nextIncome||null};
 }
 function simulatePurchase(amount,transactions=[],start=new Date()){const current=forecast(transactions,start),purchase=Math.max(0,num(amount)),afterFree=num(current.free-purchase),afterAvailable=num(current.available-purchase),afterMinimum=num(current.minimum-purchase),afterDaily=num(Math.max(0,afterFree)/current.budgetDays);return {amount:purchase,currentFree:current.free,afterFree,currentDaily:current.daily,afterDaily,knownCostsCovered:afterAvailable>=current.expenseTotal,safetyMaintained:afterMinimum>=current.safety,usesProtected:afterFree<0,shortfall:num(Math.max(0,-afterFree))}}
 window.MoneybrainCashflow={forecast,simulatePurchase,reserve,setReserve};
})();
