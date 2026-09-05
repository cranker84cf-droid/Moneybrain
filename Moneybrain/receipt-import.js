window.parseRetailReceipt=async function(file,onProgress=()=>{}){
 let text='';
 if(file.type==='application/pdf'||/\.pdf$/i.test(file.name)){
  text=await receiptPdfText(file,onProgress);
  if(text.replace(/\s/g,'').length<10)throw new Error('Diese PDF enthält keinen lesbaren Belegtext.');
 }else if(String(file.type||'').startsWith('image/')||/\.(png|jpe?g|webp)$/i.test(String(file.name||''))){
 if(!window.Tesseract)throw new Error('Die Bilderkennung ist nicht geladen.');
  onProgress('Bilderkennung wird vorbereitet …');
  const worker=await Tesseract.createWorker('deu',1,receiptOcrOptions(m=>{if(m.status==='recognizing text')onProgress('Beleg wird gelesen: '+Math.round((m.progress||0)*100)+' %')}));
  try{const prepared=await prepareReceiptPhoto(file,onProgress),result=await worker.recognize(prepared);text=result.data.text||''}finally{await worker.terminate()}
 }else throw new Error('Dateityp nicht unterstützt.');
 return parseReceiptText(text,file.name);
};
async function prepareReceiptPhoto(file,onProgress){
 onProgress('Kamerafoto wird optimiert …');
 const bitmap=await createImageBitmap(file),maxPixels=4200000,scale=Math.min(1,Math.sqrt(maxPixels/(bitmap.width*bitmap.height))),width=Math.max(1,Math.round(bitmap.width*scale)),height=Math.max(1,Math.round(bitmap.height*scale)),canvas=document.createElement('canvas');
 canvas.width=width;canvas.height=height;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0,width,height);bitmap.close?.();
 const image=context.getImageData(0,0,width,height),data=image.data;
 for(let index=0;index<data.length;index+=4){const gray=.299*data[index]+.587*data[index+1]+.114*data[index+2],boosted=Math.max(0,Math.min(255,(gray-128)*1.38+142));data[index]=data[index+1]=data[index+2]=boosted}
 context.putImageData(image,0,0);return canvas;
}
async function receiptPdfText(file,onProgress=()=>{}){
 const pdfjs=await import('./vendor/pdf.min.mjs');
 pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.min.mjs',location.href).href;
 const pdf=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise,lines=[];
 for(let n=1;n<=pdf.numPages;n++){
  const page=await pdf.getPage(n),content=await page.getTextContent(),rows=[];
  for(const item of content.items){if(!item.str?.trim())continue;const y=Math.round(item.transform[5]);let row=rows.find(r=>Math.abs(r.y-y)<=2);if(!row){row={y,items:[]};rows.push(row)}row.items.push({x:item.transform[4],text:item.str.trim()})}
  rows.sort((a,b)=>b.y-a.y);for(const row of rows){row.items.sort((a,b)=>a.x-b.x);lines.push(row.items.map(x=>x.text).join(' ').replace(/\s+/g,' ').trim())}
 }
 const extracted=lines.join('\n');
 if(extracted.replace(/\s/g,'').length>=40)return extracted;
 if(!window.Tesseract)throw new Error('Die PDF enthält nur Bilder und die Bilderkennung ist nicht geladen.');
 onProgress('Bild-PDF wird für die Erkennung vorbereitet …');
 const worker=await Tesseract.createWorker('deu',1,receiptOcrOptions(m=>{if(m.status==='recognizing text')onProgress('PDF-Beleg wird gelesen: '+Math.round((m.progress||0)*100)+' %')})),ocr=[];
 try{
  for(let n=1;n<=Math.min(pdf.numPages,8);n++){
   onProgress('PDF-Seite '+n+' von '+pdf.numPages+' wird gelesen …');
   const page=await pdf.getPage(n),base=page.getViewport({scale:1}),scale=Math.min(2.2,Math.sqrt(4200000/(base.width*base.height))),viewport=page.getViewport({scale:Math.max(1.4,scale)}),canvas=document.createElement('canvas'),context=canvas.getContext('2d');
   canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:context,viewport}).promise;const result=await worker.recognize(canvas);ocr.push(result.data.text||'');
  }
 }finally{await worker.terminate()}
 return ocr.join('\n');
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
 if(/ZOOPARADIES|Zoo.?Paradies\s+Kempf/i.test(s))return 'Zooparadies Kempf GmbH';
 if(/JAWOLL|Wiglo\s+Wunderland/i.test(s))return 'Jawoll';
 if(/ROSSMANN|rossmann\.de/i.test(s))return 'Rossmann';
 if(/LIDL|Lidl Plus|lidl\.de/i.test(s))return 'Lidl';
 if(/R\s*E\s*W\s*E/i.test(s))return 'Rewe GmbH';
 if(/\*\*\*\s*eBon|NETTO-ONLINE|Netto_Kassenbon/i.test(s))return 'Netto Marken-Discount';
 if(/EDEKA/i.test(s))return 'Edeka';
 if(/ALDI/i.test(s))return 'Aldi';
 if(/KAUFLAND/i.test(s))return 'Kaufland';
 if(/PENNY/i.test(s))return 'Penny';
 if(/MARKTKAUF/i.test(s))return 'Marktkauf';
 if(/\bdm\b|dm-drogerie/i.test(s))return 'dm';
 if(/M[ÜU]LLER/i.test(s))return 'Müller';
 return 'Einzelhandel';
}
function receiptAmount(text,merchant){
 const finalTotal=[...text.matchAll(/Endsumme(?:\s+in)?(?:\s+(?:\(cid:\d+\)|EUR|\u20ac))?\s*(\d+[.,]\d{2})/ig)];if(finalTotal.length)return receiptMoney(finalTotal.at(-1)[1]);
 const patterns=merchant==='Lidl'?[/zu\s+zahlen[^\d]*(\d+[.,]\d{2})/ig]:merchant==='Decathlon'?[/Rechnungsbetrag[^\d]*(\d+[.,]\d{2})/ig,/Gesamt[^\d]*(\d+[.,]\d{2})/ig]:[/(?:ZU\s*ZAHLEN|GESAMTSUMME|GESAMTBETRAG|ENDSUMME|ENDBETRAG|ZAHLBETRAG)[^\d]*(\d+[.,]\d{2})/ig,/SUMME[^\n]*?(\d+[.,]\d{2})/ig];
 for(const pattern of patterns){const found=[...text.matchAll(pattern)];if(found.length)return receiptMoney(found.at(-1)[1])}
 const totalLines=[...text.matchAll(/^.*\bTotal\b.*$/gim)];for(const line of totalLines.reverse()){const amounts=[...line[0].matchAll(/\d+[.,]\d{2}/g)];if(amounts.length)return receiptMoney(amounts.at(-1)[0])}
 const paid=[...text.matchAll(/(?:Betrag|Karte|Kartenzahlung|Paypal)\s*(?:EUR|€)?\s*(\d+[.,]\d{2})/ig)];
 if(!paid.length)return 0;
 let value=receiptMoney(paid.at(-1)[1]),cash=[...text.matchAll(/Bargeldauszahlung\s*-?\s*(\d+[.,]\d{2})/ig)];
 if(cash.length)value-=receiptMoney(cash.at(-1)[1]);
 return Math.round(value*100)/100;
}
function receiptDate(text,filename){
 const iso=text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);if(iso)return new Date(Number(iso[1]),Number(iso[2])-1,Number(iso[3]),12);
 const patterns=[/Datum\s*:?[ ]*(\d{1,2})[./](\d{1,2})[./](\d{2,4})/i,/Kasse[^\n]*?(\d{1,2})[./](\d{1,2})[./](\d{2,4})/i,/Rechnungsdatum\s+(\d{1,2})[./](\d{1,2})[./](\d{2,4})/i,/(\d{1,2})[./](\d{1,2})[./](20\d{2})/];
 for(const p of patterns){const m=text.match(p);if(m){let y=Number(m[3]);if(y<100)y+=2000;return new Date(y,Number(m[2])-1,Number(m[1]),12)}}
 const f=filename.match(/(20\d{2})(\d{2})(\d{2})/);return f?new Date(Number(f[1]),Number(f[2])-1,Number(f[3]),12):null;
}
function receiptMethod(text){if(/Paypal/i.test(text))return 'PayPal';if(/Mastercard|Visa|Girocard|EC-Cash|Kartenzahlung|Zahlung\s+MasterCard/i.test(text))return 'Girokarte';if(/\bBar\s+(?:EUR\s*)?\d+[.,]\d{2}|Barzahlung|R(?:ü|u|ue)ckgeld/i.test(text))return 'Bar';return 'Sonstiges'}
function receiptMoney(value){const raw=String(value).replace(/\s/g,'');const comma=raw.lastIndexOf(','),dot=raw.lastIndexOf('.'),separator=Math.max(comma,dot);if(separator<0)return Number(raw.replace(/\D/g,''));const whole=raw.slice(0,separator).replace(/\D/g,''),fraction=raw.slice(separator+1).replace(/\D/g,'').slice(0,2);return Number(whole+'.'+fraction)}
function receiptOcrOptions(logger){return {workerPath:new URL('./vendor/tesseract-worker.min.js',location.href).href,corePath:new URL('./vendor/tesseract-core/tesseract-core-lstm.wasm.js',location.href).href,langPath:new URL('./vendor/tessdata',location.href).href,gzip:true,logger}}
window.parseRetailReceiptText=parseReceiptText;
