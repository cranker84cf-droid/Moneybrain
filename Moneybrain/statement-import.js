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
 let cashMovements=0,cashExcluded=0;
 const transactions=blocks.map(({match,details},index)=>{
  const [,day,month,valueDay,valueMonth,bookingKind,sign,rawAmount]=match;
  const detailText=details.slice(0,8).join(' '),party=findParty(details,bookingKind);
  let amount=Number(rawAmount.replace(/\./g,'').replace(',','.'));
  const cashMatch=/Auszahlung/i.test(detailText)?detailText.match(/([\d.]+)\s*,\s*(\d{2})\s*EUR/i):null;
  const cashAmount=cashMatch?Number(cashMatch[1].replace(/\./g,'')+'.'+cashMatch[2]):0;
  const cashOnly=!/Kartenzahlung/i.test(bookingKind)&&(/\bGA\s+NR\d+/i.test(detailText)||/Bargeld(?:auszahlung|einzahlung)|(?:Auszahlung|Einzahlung)\s+am\s+Geldautomaten/i.test(bookingKind+' '+detailText));
  if(cashOnly){cashMovements++;cashExcluded+=amount;return null}
  if(cashAmount){cashMovements++;cashExcluded+=cashAmount;amount=Math.max(0,amount-cashAmount)}
  if(amount<0.005)return null;
  return {id:crypto.randomUUID(),name:party,amount:Math.round(amount*100)/100,type:sign==='+'?'income':'expense',date:new Date(year,Number(month)-1,Number(day),12).toISOString(),valueDate:new Date(year,Number(valueMonth)-1,Number(valueDay),12).toISOString(),method:/Kartenzahlung/i.test(bookingKind)?'Girokarte':'Girokonto',status:'confirmed',source:'Kontoauszug',note:statementNote(details,bookingKind),importOrder:index};
 }).filter(Boolean);
 if(!transactions.length)throw new Error('Keine Buchungszeilen erkannt');
 return {transactions,pages:pdf.numPages,year,income:sum(transactions,'income'),expense:sum(transactions,'expense'),cashMovements,cashExcluded:Math.round(cashExcluded*100)/100};
};
function sum(items,type){return items.filter(x=>x.type===type).reduce((total,x)=>total+x.amount,0)}
function statementNote(details,kind){const lines=[kind,...details.slice(0,8)].map(line=>String(line).replace(/^\d{4}\s+\d{4}\s+/,'').replace(/Verwendungszweck\s*\/\s*Kundenreferenz/ig,'').replace(/\s+/g,' ').trim()).filter(line=>line&&!/^(Buchung Valuta|Auszug Seite|IBAN|BIC)$/i.test(line));return [...new Set(lines)].join('\n')}
function findParty(details,kind){
 const cleaned=details.map(line=>line.replace(/^\d{4}\s+\d{4}\s+/,'').replace(/Verwendungszweck\s*\/\s*Kundenreferenz/ig,'').trim()).filter(Boolean);
 const skip=/^(Gl.ubiger-ID|Mand-ID|RCUR|OTHR|CORE|Buchung Valuta|Auszug Seite|IBAN|BIC|\d+\/\d+\/\d+)\b/i;
 const candidates=cleaned.filter(line=>!skip.test(line)&&!/^\d{4}-?\d*\s*$/.test(line));
 const joined=cleaned.join(' ');
 if(/Kartenzahlung/i.test(kind))return cardMerchant(candidates,kind);
 let value=candidates[0]||kind;
 if(/PayPal/i.test(value)){
  const purchase=joined.match(/Ihr\s*Einkauf\s+bei\s+(.+?)(?=\s+\d{10,}|\s+Gl.ubiger-ID|\s+Mand-ID|$)/i);
  const compact=joined.match(/PP\.[^/]*\/\.\s*([^,]+),?\s*Ihr\s*Einkauf/i);
  const merchant=(purchase?.[1]||compact?.[1]||'PayPal').replace(/PayPal\s*\(?(?:Europe)?[^,]*(?:et Cie,?\s*SCA)?/ig,'PayPal').trim();
  value=merchant&&merchant.length<80?merchant:'PayPal';
 }
 return normalizeParty(value,kind,joined);
}
function cardMerchant(lines,fallback){
 let raw=lines.find(line=>/[A-Za-z]{3}/.test(line)&&!/^(Folgenr|Verfalld|T?\d{1,2}:\d{2}:\d{2})/i.test(line))||fallback;
 raw=raw.replace(/^\d{4}\s+\d{4}\s+/,'').replace(/Verwendungszweck\s*\/\s*Kundenreferenz/ig,'').trim();
 const parts=raw.split(/\/\/|\//).map(x=>x.trim()).filter(Boolean);
 let value=parts[0]||fallback;
 if(/star\s+Tankstelle/i.test(value)){
  const city=parts.find((part,index)=>index>0&&!/^(DE|DEU|\d|T?\d{1,2}:)/i.test(part));
  return city?'star Tankstelle/'+city.replace(/\/DE.*$/i,''):'star Tankstelle';
 }
 return normalizeParty(value,'Kartenzahlung',raw);
}
function normalizeParty(value,kind,details=''){
 value=value.replace(/\s+/g,' ').trim().replace(/^\/\s*(?:\d{4}\s+\d{4}\s+)?/,'').replace(/^Vielen Dank\s+/i,'');
 if(/PayPal/i.test(value))return 'PayPal';
 if(/REWE/i.test(value))return 'Rewe GmbH';
 if(/Mc\s*Donalds?|MCDONALD/i.test(value))return 'McDonalds';
 if(/NETTO\s*MARKEN|NETTOMARKEN/i.test(value))return 'Netto Marken-Discount';
 if(/\bALDI\b/i.test(value))return 'Aldi';
 if(/^OBI\b/i.test(value))return 'OBI';
 if(/HORNBACH/i.test(value))return 'Hornbach';
 if(/STABILO\s+MARKT/i.test(value))return 'Stabilo Markt';
 if(/EDEKA/i.test(value))return 'Edeka';
 if(/^LIDL\b/i.test(value))return 'Lidl';
 if(/HAGEBAUMARKT/i.test(value))return 'Hagebaumarkt';
 if(/AMAZON/i.test(value))return 'Amazon';
 if(/AUDIBLE/i.test(value))return 'Audible';
 if(/Muenchner\s+Verkehr|\bMVG\b/i.test(value+' '+details))return 'MVG';
 if(/^AOK\b/i.test(value))return 'AOK Niedersachsen';
 if(/IGM\s+Region/i.test(value))return 'IG Metall';
 if(/GA\s+NR\d+/i.test(value)&&/Verwendungszweck/i.test(kind))return 'Bargeldabhebung';
 if(/Saldo\s+der\s+Abschlussposten/i.test(value))return 'Kontof\u00fchrung';
 return value.replace(/\s*(?:SAGT DANKE|\d{2}-\d{2}-\d{4}|T?\d{1,2}:\d{2}:\d{2}).*$/i,'').trim().slice(0,90)||kind;
}