window.parseRetailReceipt=async function(file,onProgress=()=>{}){
 let text='';
 if(file.type==='application/pdf'||/\.pdf$/i.test(file.name)){
  text=await receiptPdfText(file);
  if(text.replace(/\s/g,'').length<80)throw new Error('Diese PDF enthält keinen lesbaren Belegtext.');
 }else if(file.type.startsWith('image/')){
  if(!window.Tesseract)throw new Error('Die Bilderkennung ist nicht geladen.');
  onProgress('Bilderkennung wird vorbereitet …');
  const worker=await Tesseract.createWorker('deu',1,{workerPath:new URL('./vendor/tesseract-worker.min.js',location.href).href,logger:m=>{if(m.status==='recognizing text')onProgress('Beleg wird gelesen: '+Math.round((m.progress||0)*100)+' %')}});
  try{const result=await worker.recognize(file);text=result.data.text||''}finally{await worker.terminate()}
 }else throw new Error('Dateityp nicht unterstützt.');
 return parseReceiptText(text,file.name);
};
async function receiptPdfText(file){
 const pdfjs=await import('./vendor/pdf.min.mjs');
 pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.min.mjs',location.href).href;
 const pdf=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise,lines=[];
 for(let n=1;n<=pdf.numPages;n++){
  const page=await pdf.getPage(n),content=await page.getTextContent(),rows=[];
  for(const item of content.items){if(!item.str?.trim())continue;const y=Math.round(item.transform[5]);let row=rows.find(r=>Math.abs(r.y-y)<=2);if(!row){row={y,items:[]};rows.push(row)}row.items.push({x:item.transform[4],text:item.str.trim()})}
  rows.sort((a,b)=>b.y-a.y);for(const row of rows){row.items.sort((a,b)=>a.x-b.x);lines.push(row.items.map(x=>x.text).join(' ').replace(/\s+/g,' ').trim())}
 }
 return lines.join('\n');
}
function parseReceiptText(text,filename){
 const compact=text.replace(/\u0000/g,' ').replace(/[ \t]+/g,' '),merchant=receiptMerchant(compact,filename);
 const amount=receiptAmount(compact,merchant),date=receiptDate(compact,filename),method=receiptMethod(compact);
 if(!amount||!date)throw new Error('Betrag oder Datum konnten nicht sicher erkannt werden.');
 return {id:crypto.randomUUID(),name:merchant,amount,type:'expense',date:date.toISOString(),method,status:'confirmed',source:'Kassenbon',note:'Automatisch aus Beleg erkannt',receipt:{filename,recognizedAt:new Date().toISOString()}};
}
function receiptMerchant(text,filename){
 const s=text+' '+filename;
 if(/DECATHLON/i.test(s))return 'Decathlon';
 if(/\bOBI\b|obi\.de/i.test(s))return 'OBI';
 if(/ROSSMANN|rossmann\.de/i.test(s))return 'Rossmann';
 if(/LIDL|Lidl Plus|lidl\.de/i.test(s))return 'Lidl';
 if(/R\s*E\s*W\s*E/i.test(s))return 'Rewe GmbH';
 if(/\*\*\*\s*eBon|NETTO-ONLINE|Netto_Kassenbon/i.test(s))return 'Netto Marken-Discount';
 if(/EDEKA/i.test(s))return 'Edeka';
 if(/ALDI/i.test(s))return 'Aldi';
 return 'Einzelhandel';
}
function receiptAmount(text,merchant){
 const finalTotal=[...text.matchAll(/Endsumme(?:\s+in)?(?:\s+(?:\(cid:\d+\)|EUR|\u20ac))?\s*(\d+[.,]\d{2})/ig)];if(finalTotal.length)return money(finalTotal.at(-1)[1]);
 const patterns=merchant==='Lidl'?[/zu\s+zahlen\s+(\d+[.,]\d{2})/ig]:merchant==='Decathlon'?[/Rechnungsbetrag\s+(\d+[.,]\d{2})/ig,/Gesamt\s+(\d+[.,]\d{2})/ig]:[/SUMME[^\n]*?(\d+[.,]\d{2})/ig,/Gesamtbetrag\s+(\d+[.,]\d{2})/ig];
 for(const pattern of patterns){const found=[...text.matchAll(pattern)];if(found.length)return money(found.at(-1)[1])}
 const paid=[...text.matchAll(/(?:Betrag|Karte|Kartenzahlung|Paypal)\s*(?:EUR|€)?\s*(\d+[.,]\d{2})/ig)];
 if(!paid.length)return 0;
 let value=money(paid.at(-1)[1]),cash=[...text.matchAll(/Bargeldauszahlung\s*-?\s*(\d+[.,]\d{2})/ig)];
 if(cash.length)value-=money(cash.at(-1)[1]);
 return Math.round(value*100)/100;
}
function receiptDate(text,filename){
 const patterns=[/Datum\s*:?[ ]*(\d{2})[./](\d{2})[./](\d{2,4})/i,/Kasse[^\n]*?(\d{2})[./](\d{2})[./](\d{2,4})/i,/Rechnungsdatum\s+(\d{2})[./](\d{2})[./](\d{2,4})/i,/(\d{2})[./](\d{2})[./](20\d{2})/];
 for(const p of patterns){const m=text.match(p);if(m){let y=Number(m[3]);if(y<100)y+=2000;return new Date(y,Number(m[2])-1,Number(m[1]),12)}}
 const f=filename.match(/(20\d{2})(\d{2})(\d{2})/);return f?new Date(Number(f[1]),Number(f[2])-1,Number(f[3]),12):null;
}
function receiptMethod(text){if(/Paypal/i.test(text))return 'PayPal';if(/Mastercard|Visa|Girocard|EC-Cash|Kartenzahlung|Zahlung\s+MasterCard/i.test(text))return 'Girokarte';if(/\bBar\s+(?:EUR\s*)?\d+[.,]\d{2}|Barzahlung/i.test(text))return 'Bar';return 'Sonstiges'}
function money(value){const raw=String(value).replace(/\s/g,'');const comma=raw.lastIndexOf(','),dot=raw.lastIndexOf('.'),separator=Math.max(comma,dot);if(separator<0)return Number(raw.replace(/\D/g,''));const whole=raw.slice(0,separator).replace(/\D/g,''),fraction=raw.slice(separator+1).replace(/\D/g,'').slice(0,2);return Number(whole+'.'+fraction)}