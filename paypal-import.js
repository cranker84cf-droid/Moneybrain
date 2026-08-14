window.parsePayPalActivity=async function(file,onProgress=()=>{}){
 let text='';
 if(file?.type==='application/pdf'||/\.pdf$/i.test(file?.name||'')){
  onProgress('PayPal-PDF wird gelesen ...');
  text=await paypalPdfText(file,onProgress);
  if(!/Transaktions(?:ü|u|ue)bersicht\s*-\s*EUR/i.test(paypalFold(text)))throw new Error('Diese PDF ist kein PayPal-Aktivitätsbericht.');
  return parsePayPalPdfText(text,file.name);
 }
 if(!file?.type?.startsWith('image/'))throw new Error('PayPal-Nachweise bitte als PDF oder Screenshot importieren.');
 if(!window.Tesseract)throw new Error('Die Bilderkennung ist nicht geladen.');
 onProgress('PayPal-Nachweis wird vorbereitet ...');
 const worker=await Tesseract.createWorker('deu',1,{workerPath:new URL('./vendor/tesseract-worker.min.js',location.href).href,logger:m=>{if(m.status==='recognizing text')onProgress('PayPal wird gelesen: '+Math.round((m.progress||0)*100)+' %')}});
 try{text=(await worker.recognize(file)).data.text||''}finally{await worker.terminate()}
 return parsePayPalActivityText(text,file.name);
};

window.parsePayPalActivityText=parsePayPalActivityText;
window.parsePayPalPdfText=parsePayPalPdfText;

async function paypalPdfText(file,onProgress){
 const pdfjs=await import('./vendor/pdf.min.mjs');
 pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.min.mjs',location.href).href;
 const pdf=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise,lines=[];
 for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){
  onProgress('PayPal-PDF: Seite '+pageNo+' von '+pdf.numPages);
  const page=await pdf.getPage(pageNo),content=await page.getTextContent(),rows=[];
  for(const item of content.items){if(!item.str?.trim())continue;const y=Math.round(item.transform[5]);let row=rows.find(value=>Math.abs(value.y-y)<=2);if(!row){row={y,items:[]};rows.push(row)}row.items.push({x:item.transform[4],text:item.str.trim()})}
  rows.sort((a,b)=>b.y-a.y);for(const row of rows){row.items.sort((a,b)=>a.x-b.x);lines.push(row.items.map(value=>value.text).join(' ').replace(/\s+/g,' ').trim())}
 }
 return lines.join('\n');
}

function parsePayPalPdfText(text,filename='PayPal.pdf'){
 const normalized=paypalFold(text),dateStart=/^(\d{2})\.(\d{2})\.(\d{2})\s+/,lines=normalized.split(/\r?\n/).map(line=>line.replace(/\s+/g,' ').trim()).filter(Boolean),records=[];
 for(let index=0;index<lines.length;index++)if(dateStart.test(lines[index])){
  const before=[];for(let offset=Math.max(0,index-2);offset<index;offset++)if(!dateStart.test(lines[offset])&&!paypalPdfNoise(lines[offset]))before.push(lines[offset]);
  const after=[];for(let offset=index+1;offset<Math.min(lines.length,index+3)&&!dateStart.test(lines[offset]);offset++)if(!paypalPdfNoise(lines[offset]))after.push(lines[offset]);
  records.push({core:lines[index],context:[...before,lines[index],...after].join(' ')});
 }
 const transactions=records.map((record,index)=>paypalPdfRecord(record,filename,index)).filter(Boolean);
 if(!transactions.length)throw new Error('In der PayPal-PDF wurden keine echten Buchungen erkannt.');
 return paypalUnique(transactions);
}

function paypalPdfRecord(record,filename,index){
 const chunk=record.core,context=record.context,dateMatch=chunk.match(/^(\d{2})\.(\d{2})\.(\d{2})\s+/);if(!dateMatch)return null;
 const amounts=[...chunk.matchAll(/-?\d{1,3}(?:\.\d{3})*,\d{2}/g)];if(amounts.length<3)return null;
 const lastThree=amounts.slice(-3),netText=lastThree[2][0],net=paypalSignedMoney(netText);if(!Number.isFinite(net)||Math.abs(net)<.005)return null;
 let body=chunk.slice(dateMatch[0].length,lastThree[0].index).replace(/\s+/g,' ').trim();
 if(/^(?:offene|allgemeiner|W(?:ä|a)hrungsumrec)\b/i.test(body)||(/^[A-Z0-9]{17}\b/.test(body)&&/Bankgutschrift/i.test(context))||/Korrektur des Kontostands|Geb(?:ü|u)hreneinzug/i.test(body))return null;
 const transactionId=(body.match(/\b[A-Z0-9]{17}\b/g)||[]).at(-1)||'';if(transactionId)body=body.replace(transactionId,' ');
  body=body.replace(/\b\S+@\S+\b/g,' ').replace(/\b(?:Website-Zahlung|PayPal Express-?\s*Zahlung|Handyzahlung|R(?:ü|u)ckzahlung|Allgemeine Zahlung|Transfer \(Gutschrift\)|Zahlung im Einzugsverfahren mit|Zahlungsrechnung)\b/gi,' ').replace(/\s+/g,' ').trim();
 let name=paypalCleanPdfMerchant(body),contextName=paypalCleanPdfMerchant(context);if(paypalKnownName(contextName))name=contextName;if(!name||name==='PayPal'||name.length<3||(/^mit\b/i.test(body)&&!paypalKnownName(name))){let fallback=context.replace(chunk,' ').replace(/\b\S+@\S+\b/g,' ').replace(/\b(?:Website-Zahlung|PayPal Express-?\s*Zahlung|Handyzahlung|R(?:ü|u)ckzahlung|Allgemeine Zahlung|Transfer \(Gutschrift\)|Zahlung im Einzugsverfahren|Zahlungsrechnun\s*g?|R(?:ü|u)ckbuchung|Einbehaltung|Bankgutschrift|auf PayPal-Konto)\b/gi,' ').replace(/\b[A-Z0-9]{17}\b/g,' ').replace(/-?\d{1,3}(?:\.\d{3})*,\d{2}/g,' ');name=paypalCleanPdfMerchant(fallback)}
 const type=net>0?'income':'expense',date=new Date(2000+Number(dateMatch[3]),Number(dateMatch[2])-1,Number(dateMatch[1]),12);
 if(!name||name==='PayPal')return null;
 return {id:crypto.randomUUID(),name,amount:Math.abs(net),type,date:date.toISOString(),method:'PayPal',status:'confirmed',source:'PayPal-Nachweis',externalId:transactionId||undefined,note:'Aus PayPal-Aktivitätsbericht importiert'+(transactionId?' · Transaktionscode '+transactionId:'') ,receipt:{filename,recognizedAt:new Date().toISOString(),record:index+1}};
}

function paypalCleanPdfMerchant(value){
 let clean=String(value||'').replace(/\b(?:com|de|net|org)\b\s*/gi,' ').replace(/\s+/g,' ').replace(/^[,;:|._\s]+|[,;:|._\s]+$/g,'').trim();
 const known=[[/z[o0]{2}\s*sky\s*24/i,'zooSky24'],[/m[cd]{1,2}onald'?s(?:\s+\d+)?/i,'McDonalds'],[/netf[l1i]ix/i,'Netflix.com'],[/rewe\s+markt/i,'REWE Markt Moehring OHG'],[/google\s+payment/i,'Google Payment Ireland Limited'],[/monika\s+tallarek/i,'Monika Tallarek'],[/k4g\s+ltd/i,'K4G LTD'],[/waipu/i,'waipu.tv'],[/sky.*deutschland/i,'Sky Deutschland']];
 for(const [pattern,name] of known)if(pattern.test(clean))return name;
 return paypalCleanMerchant(clean.replace(/\s+\d{4,8}\s*$/,''));
}
function paypalKnownName(value){return /^(?:zooSky24|McDonalds|Netflix\.com|REWE Markt Moehring OHG|Google Payment Ireland Limited|Monika Tallarek|K4G LTD|waipu\.tv|Sky Deutschland)$/i.test(value)}

function parsePayPalActivityText(text,filename='PayPal'){
 const lines=String(text).split(/\r?\n/).map(line=>line.replace(/\s+/g,' ').trim()).filter(Boolean),transactions=[];
 for(let index=0;index<lines.length;index++){
  const line=lines[index],amountMatch=line.match(/([+=\-−–])\s*(\d{1,3}(?:[.\s]\d{3})*,\d{2})\s*(?:EUR|€)?\s*$/i);
  if(!amountMatch)continue;
  const amount=paypalMoney(amountMatch[2]);if(!Number.isFinite(amount)||amount<=0)continue;
  const type=/\+/.test(amountMatch[1])?'income':'expense';
  let name=line.slice(0,amountMatch.index).trim();if(!name||/^(zahlung|geld erhalten)$/i.test(name))name=paypalMerchant(lines,index);
  const date=paypalDate(lines,index,filename);if(!date)continue;
  const detail=lines.slice(index+1,index+4).find(value=>/zahlung|geld erhalten|google pay|paypal card/i.test(value))||'';
  transactions.push({id:crypto.randomUUID(),name:paypalCleanMerchant(name),amount,type,date:date.toISOString(),method:'PayPal',status:'confirmed',source:'PayPal-Nachweis',note:detail?'PayPal: '+detail:'Aus PayPal-Aktivitaeten erkannt'});
 }
 if(!transactions.length)throw new Error('Keine PayPal-Buchungen mit Datum und Betrag erkannt.');
 return paypalUnique(transactions);
}
function paypalUnique(items){return items.filter((item,index,all)=>all.findIndex(other=>(item.externalId&&other.externalId===item.externalId)||(other.type===item.type&&other.amount===item.amount&&other.date.slice(0,10)===item.date.slice(0,10)&&paypalKey(other.name)===paypalKey(item.name)))===index)}
function paypalPdfNoise(line){return /^(?:H(?:ä|a)ndlerkonto-ID|PayPal-ID|Transaktions(?:ü|u)bersicht|Datum Typ Name|Hinweis:|Copyright|Boulevard Royal|Seite \d+ von|\d{2}\.\d{2}\.\d{2}\s*[-–])/i.test(line)}
function paypalFold(value){return String(value||'').replace(/\u00ad/g,'').replace(/Ã¼/g,'ü').replace(/Ã¤/g,'ä').replace(/Ã¶/g,'ö').replace(/ÃŸ/g,'ß').replace(/â‚¬/g,'€').replace(/âˆ’|â€“/g,'−')}
function paypalMerchant(lines,index){for(let offset=1;offset<=3;offset++){const candidate=lines[index-offset];if(candidate&&!/deine letzten|aktivitaeten|^juli$|^august$|^aug\.?$|zahlung|geld erhalten|zugestellt/i.test(candidate)&&!/[+\-−–]\s*\d+[.,]\d{2}/.test(candidate))return candidate}return 'PayPal'}
function paypalDate(lines,index,filename){const months={jan:0,feb:1,mae:2,maerz:2,mar:2,apr:3,mai:4,jun:5,juli:6,jul:6,aug:7,sep:8,okt:9,nov:10,dez:11},datePattern=/\b(Jan|Feb|Mae|Maerz|Mar|Apr|Mai|Jun|Juli|Jul|Aug|Sep|Okt|Nov|Dez)\.?\s*(\d{1,2})\b/i;let match=null;for(let offset=0;offset<=3&&!match;offset++)match=String(lines[index+offset]||'').match(datePattern);if(!match)return null;const month=months[match[1].toLowerCase().replace('ä','ae')],day=Number(match[2]),fileYear=Number((filename.match(/(20\d{2})/)||[])[1]),now=new Date(),year=fileYear||now.getFullYear(),date=new Date(year,month,day,12);if(date>new Date(now.getTime()+31*86400000))date.setFullYear(year-1);return date}
function paypalCleanMerchant(value){let clean=String(value||'PayPal').replace(/^[=+\-−–|:;.,_\s]+/,'').replace(/\s+\d{4,8}\s*$/,'').replace(/\s+[=+\-−–]?\s*$/,'').replace(/\s{2,}/g,' ').trim();if(/z{1,2}[o0]{2}\s*sky\s*24/i.test(clean))clean='zooSky24';else if(/m[cd]{1,2}onald'?s/i.test(clean))clean='McDonalds';else if(/netf[l1i]ix/i.test(clean))clean='Netflix.com';else if(/rewe\s+markt/i.test(clean))clean='REWE Markt Moehring OHG';else if(/google\s+payment/i.test(clean))clean='Google Payment Ireland Limited';clean=clean.replace(/^[A-Z0-9]{1,3}\s+(?=[A-ZÄÖÜ][a-zäöü])/,'');return clean||'PayPal'}
function paypalSignedMoney(value){return Number(String(value).replace(/\s/g,'').replace(/\./g,'').replace(',','.'))}
function paypalMoney(value){return Math.abs(paypalSignedMoney(value))}
function paypalKey(value){return String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'')}
