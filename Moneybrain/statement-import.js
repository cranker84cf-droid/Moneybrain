window.parseDeutscheBankStatement=async function(file){
 const pdfjs=await import('./vendor/pdf.min.mjs');
 pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.min.mjs',location.href).href;
 const pdf=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise;
 const lines=[];
 for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
  const page=await pdf.getPage(pageNo),content=await page.getTextContent(),rows=[];
  for(const item of content.items){
   if(!item.str?.trim())continue;
   const y=Math.round(item.transform[5]);
   let row=rows.find(entry=>Math.abs(entry.y-y)<=2);
   if(!row){row={y,items:[]};rows.push(row)}
   row.items.push({x:item.transform[4],text:item.str.trim()});
  }
  rows.sort((a,b)=>b.y-a.y);
  for(const row of rows){row.items.sort((a,b)=>a.x-b.x);lines.push(row.items.map(x=>x.text).join(' ').replace(/\s+/g,' ').trim())}
 }
 const full=lines.join('\n'),yearMatch=full.match(/Kontoauszug vom[^\n]*?(20\d{2})/),year=Number(yearMatch?.[1]||new Date().getFullYear());
 const header=/^(\d{2})\.(\d{2})\s*\.\s+(\d{2})\.(\d{2})\s*\.\s+(.+?)\s+([+-])\s+([\d.]+,\d{2})$/;
 const blocks=[];let current=null;
 for(const line of lines){
  const match=line.match(header);
  if(match){if(current)blocks.push(current);current={match,details:[]}}
  else if(current)current.details.push(line);
 }
 if(current)blocks.push(current);
 const transactions=blocks.map(({match,details},index)=>{
  const [,day,month,valueDay,valueMonth,bookingKind,sign,rawAmount]=match;
  const party=findParty(details,bookingKind);
  return {id:crypto.randomUUID(),name:party,amount:Number(rawAmount.replace(/\./g,'').replace(',','.')),type:sign==='+'?'income':'expense',date:new Date(year,Number(month)-1,Number(day),12).toISOString(),valueDate:new Date(year,Number(valueMonth)-1,Number(valueDay),12).toISOString(),method:/Kartenzahlung/i.test(bookingKind)?'Girokarte':'Girokonto',status:'confirmed',source:'Kontoauszug',note:bookingKind,importOrder:index};
 });
 if(!transactions.length)throw new Error('Keine Buchungszeilen erkannt');
 return {transactions,pages:pdf.numPages,year,income:sum(transactions,'income'),expense:sum(transactions,'expense')};
};
function sum(items,type){return items.filter(x=>x.type===type).reduce((total,x)=>total+x.amount,0)}
function findParty(details,kind){
 const cleaned=details.map(line=>line.replace(/^\d{4}\s+\d{4}\s+/,'').trim()).filter(Boolean);
 const skip=/^(Verwendungszweck|Gläubiger-ID|Mand-ID|RCUR|OTHR|CORE|Buchung Valuta|Auszug Seite|\d+\/\d+\/\d+)\b/i;
 const candidates=cleaned.filter(line=>!skip.test(line)&&!/^\d{4}-?\d*/.test(line));
 let value=candidates[0]||kind;
 if(/^Verwendungszweck/i.test(value)&&candidates[1])value=candidates[1];
 if(/Kartenzahlung/i.test(kind)){value=(candidates.find(x=>/[A-Za-zÄÖÜäöüß]{3}/.test(x))||value).split(/\/\/|\//)[0]}
 return value.replace(/\s+/g,' ').slice(0,90);
}