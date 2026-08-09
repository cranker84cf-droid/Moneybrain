window.parsePayPalActivity=async function(file,onProgress=()=>{}){
 if(!file?.type?.startsWith('image/'))throw new Error('PayPal-Aktivitaeten bitte als Screenshot importieren.');
 if(!window.Tesseract)throw new Error('Die Bilderkennung ist nicht geladen.');
 onProgress('PayPal-Nachweis wird vorbereitet ...');
 const worker=await Tesseract.createWorker('deu',1,{workerPath:new URL('./vendor/tesseract-worker.min.js',location.href).href,logger:m=>{if(m.status==='recognizing text')onProgress('PayPal wird gelesen: '+Math.round((m.progress||0)*100)+' %')}});
 let text='';
 try{text=(await worker.recognize(file)).data.text||''}finally{await worker.terminate()}
 return parsePayPalActivityText(text,file.name);
};

window.parsePayPalActivityText=parsePayPalActivityText;
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
 return transactions.filter((item,index,all)=>all.findIndex(other=>other.type===item.type&&other.amount===item.amount&&other.date.slice(0,10)===item.date.slice(0,10)&&paypalKey(other.name)===paypalKey(item.name))===index);
}
function paypalMerchant(lines,index){for(let offset=1;offset<=3;offset++){const candidate=lines[index-offset];if(candidate&&!/deine letzten|aktivitaeten|^juli$|^august$|^aug\.?$|zahlung|geld erhalten|zugestellt/i.test(candidate)&&!/[+\-−–]\s*\d+[.,]\d{2}/.test(candidate))return candidate}return 'PayPal'}
function paypalDate(lines,index,filename){const months={jan:0,feb:1,mae:2,maerz:2,mar:2,apr:3,mai:4,jun:5,juli:6,jul:6,aug:7,sep:8,okt:9,nov:10,dez:11},datePattern=/\b(Jan|Feb|Mae|Maerz|Mar|Apr|Mai|Jun|Juli|Jul|Aug|Sep|Okt|Nov|Dez)\.?\s*(\d{1,2})\b/i;let match=null;for(let offset=0;offset<=3&&!match;offset++)match=String(lines[index+offset]||'').match(datePattern);if(!match)return null;const month=months[match[1].toLowerCase().replace('ä','ae')],day=Number(match[2]),fileYear=Number((filename.match(/(20\d{2})/)||[])[1]),now=new Date(),year=fileYear||now.getFullYear(),date=new Date(year,month,day,12);if(date>new Date(now.getTime()+31*86400000))date.setFullYear(year-1);return date}
function paypalCleanMerchant(value){
 let clean=String(value||'PayPal').replace(/^[=+\-−–|:;.,_\s]+/,'').replace(/\s+\d{4,8}\s*$/,'').replace(/\s+[=+\-−–]?\s*$/,'').replace(/\s{2,}/g,' ').trim();
 if(/z{1,2}[o0]{2}\s*sky\s*24/i.test(clean))clean='zooSky24';
 else if(/m[cd]{1,2}onald'?s/i.test(clean))clean='McDonalds';
 else if(/netf[l1i]ix/i.test(clean))clean='Netflix.com';
 else if(/rewe\s+markt/i.test(clean))clean='REWE Markt Moehring OHG';
 else if(/google\s+payment/i.test(clean))clean='Google Payment Ireland Limited';
 clean=clean.replace(/^[A-Z0-9]{1,3}\s+(?=[A-ZÄÖÜ][a-zäöü])/,'');
 return clean||'PayPal';
}
function paypalMoney(value){return Number(String(value).replace(/\s/g,'').replace(/\./g,'').replace(',','.'))}
function paypalKey(value){return String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'')}
