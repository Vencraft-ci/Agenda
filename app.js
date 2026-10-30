'use strict';
const C=window.AGENDA_CONFIG,$=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DEF={remind:'both',remMin:60,name:C.businessName,open:'00:00',close:'24:00',slot:60,closedDays:[0],blocks:[],multi:false};
const U={normal:{l:'Pas urgent',c:'#2e9e5b'},moyen:{l:'Pas trop urgent',c:'#e8890c'},urgent:{l:'Urgent',c:'#d62828'}};
const PER=[['Matin',0,720],['Après-midi',720,1020],['Soirée',1020,1440]];
const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const pd=s=>{const[a,b,c]=s.split('-');return new Date(+a,b-1,+c)};
const add=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const fd=(s,o)=>pd(s).toLocaleDateString('fr-FR',o||{weekday:'long',day:'numeric',month:'long'});
const today=()=>iso(new Date());
const m2t=m=>String(m/60|0).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const t2m=t=>{const[h,m]=t.split(':');return +h*60+ +m};
/* minuit : stocké "24:00", affiché et saisi "00:00" */
const tv=t=>t==='24:00'?'00:00':t;
const tz=v=>v==='00:00'?'24:00':v;
const dur=m=>{const h=m/60|0,r=m%60;return h?(r?h+' h '+String(r).padStart(2,'0'):h+' h'):r+' min'};
const toast=m=>{const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('on'),2800)};
let PEND=null;
const closeModal=()=>{const m=$('#modal');m.classList.remove('on');m.innerHTML='';PEND=null};
/* numéro -> format international (pour appel et WhatsApp) */
function intl(raw){const s=String(raw||'').trim(),d=s.replace(/\D/g,'');if(!d)return'';const cc=String(C.countryCode||'225');
  if(s.startsWith('+'))return d;if(d.startsWith('00'))return d.slice(2);if(d.startsWith(cc)&&d.length>=cc.length+8)return d;return cc+d}

let DB,user=null,deferred=null,S={rdv:[],cfg:{},notes:[],ready:false},lastTab=null;
const blank=()=>({old:null,name:'',phone:'',same:true,wa:'',date:null,time:null,dur:null,urg:'normal',note:'',perso:'',keep:null,done:false,created:null});
const bk0=()=>({from:today(),to:today(),all:true,start:'12:00',end:'14:00',reason:''});
let F=blank(),P={tab:'agenda',day:0,seg:'todo',month:new Date(),sel:null,bk:bk0(),tOpen:true,tY:null};
const cfg=()=>({...DEF,...S.cfg});
/* durée choisie pour CE rendez-vous (sinon la durée par défaut des réglages) */
const fdur=()=>{const d=Math.round(+F.dur);return d>=5&&d<=1440?d:Math.max(5,+cfg().slot||60)};
/* cartes de rendez-vous dépliées (fermées par défaut) */
const OPEN=new Set();

/* ---------- disponibilités ---------- */
function slots(){const c=cfg(),o=[],sl=Math.max(5,+c.slot||60);for(let m=t2m(c.open);m+sl<=t2m(c.close);m+=sl)o.push(m2t(m));return o}
/* un créneau est bloqué s'il chevauche une période bloquée */
const isBlocked=(d,t,dd)=>{const c=cfg(),tm=t2m(t),sl=dd||Math.max(5,+c.slot||60);
  return c.closedDays.includes(pd(d).getDay())||c.blocks.some(b=>d>=b.from&&d<=b.to&&(b.all||(tm<t2m(b.end)&&tm+sl>t2m(b.start))))};
/* rendez-vous qui chevauchent le créneau t (tient compte de la durée) */
const busy=(d,t,skip,dd)=>{const sl=Math.max(5,+cfg().slot||60),L=dd||sl,a=t2m(t);return S.rdv.filter(r=>r.date===d&&r.sid!==skip&&isLive(r)&&t2m(r.time)<a+L&&a<t2m(r.time)+(+r.dur||sl))};
const takenBy=(d,t)=>cfg().multi?undefined:busy(d,t,F.old,fdur())[0];
const freeCount=d=>slots().filter(t=>!isBlocked(d,t)&&(cfg().multi||!busy(d,t).length)).length;
const dayClosed=d=>slots().every(t=>isBlocked(d,t));

/* ---------- données : démo locale ou Firebase ---------- */
const LS='agenda_pro_v1';
const Local={mode:'demo',
  load(){try{return JSON.parse(localStorage[LS])||{}}catch{try{if(localStorage[LS]&&!localStorage.agenda_corrompu)localStorage.agenda_corrompu=localStorage[LS]}catch{}return{}}},
  save(d){localStorage[LS]=JSON.stringify(d);this.push()},
  push(){const d=this.load();S.rdv=d.rdv||[];S.cfg=d.cfg||{};S.notes=Array.isArray(d.notes)?d.notes:[];S.ready=true;this.cb()},
  init(cb){this.cb=cb;user={demo:true};this.migrate();this.push();addEventListener('storage',e=>e.key===LS&&this.push())},
  async add(r){const d=this.load();d.rdv=d.rdv||[];if(d.rdv.some(x=>x.sid===r.sid))throw'taken';d.rdv.push(r);this.save(d)},
  async update(o,r){const d=this.load();d.rdv=d.rdv||[];if(o!==r.sid&&d.rdv.some(x=>x.sid===r.sid))throw'taken';d.rdv=d.rdv.filter(x=>x.sid!==o);d.rdv.push(r);this.save(d)},
  async patch(s,f){const d=this.load();d.rdv=(d.rdv||[]).map(x=>x.sid===s?{...x,...f}:x);this.save(d)},
  async remove(s){const d=this.load();d.rdv=(d.rdv||[]).filter(x=>x.sid!==s);this.save(d)},
  async setCfg(c){const d=this.load();d.cfg=c;this.save(d)},
  async putNote(n){const d=this.load();d.notes=(Array.isArray(d.notes)?d.notes:[]).filter(x=>x.id!==n.id);d.notes.push(n);this.save(d)},
  async delNote(id){const d=this.load();d.notes=(Array.isArray(d.notes)?d.notes:[]).filter(x=>x.id!==id);this.save(d)},
  /* une seule fois : les anciens horaires par défaut (08:00-18:00) passent à 24 h/24 ; vous pouvez les rechanger dans Réglages */
  migrate(){try{const q=JSON.parse(localStorage[LS]||'{}');if(q.cfg&&q.cfg.name==='AYOH LUXURY BOUAKÉ'&&!localStorage.agenda_mig_vc){delete q.cfg.name;localStorage[LS]=JSON.stringify(q);localStorage.agenda_mig_vc='1'}}catch{}try{if(localStorage.agenda_mig24)return;localStorage.agenda_mig24='1';const d=this.load(),c=d.cfg;if(c&&c.open==='08:00'&&c.close==='18:00'){c.open='00:00';c.close='24:00';localStorage[LS]=JSON.stringify(d)}}catch{}},
  async logout(){}};
const FB={mode:'firebase',
  ref(s){return this.db.collection('rdv').doc(s)},
  init(cb){this.cb=cb;firebase.initializeApp(C.firebase);this.db=firebase.firestore();this.un=[];
    firebase.auth().onAuthStateChanged(u=>{user=u;this.un.forEach(f=>f());this.un=[];
      if(u)this.un=[this.db.collection('rdv').onSnapshot(s=>{S.rdv=s.docs.map(d=>d.data());S.ready=true;cb()},()=>toast('Accès refusé : vérifiez les règles Firebase')),
        this.db.doc('meta/config').onSnapshot(s=>{S.cfg=s.exists?s.data():{};cb()})];
      else{S.rdv=[];S.ready=false}cb()})},
  add(r){return this.db.runTransaction(async t=>{if((await t.get(this.ref(r.sid))).exists)throw'taken';t.set(this.ref(r.sid),r)})},
  update(o,r){return this.db.runTransaction(async t=>{if(o!==r.sid){if((await t.get(this.ref(r.sid))).exists)throw'taken';t.delete(this.ref(o))}t.set(this.ref(r.sid),r)})},
  patch(s,f){return this.ref(s).update(f)},remove(s){return this.ref(s).delete()},
  setCfg(c){return this.db.doc('meta/config').set(c)},
  login(e,p){return firebase.auth().signInWithEmailAndPassword(e,p)},
  logout(){return firebase.auth().signOut()}};
const loadJs=u=>new Promise((ok,ko)=>{const s=document.createElement('script');s.src=u;s.onload=ok;s.onerror=ko;document.head.appendChild(s)});

/* ---------- installation, site officiel, soutien ---------- */
const SITE=C.siteUrl||'https://vencraft-ci.github.io/site-officiel/',PAY=C.payUrl||'https://pay.wave.com/m/M_ci_x2YYqnMBS-fb/c/ci/';
const standalone=()=>(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone;
const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent);
const isAndroid=()=>/android/i.test(navigator.userAgent);
const lnk=(u,t,c)=>`<a class="${c}" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${t}</a>`;
addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;refresh()});
addEventListener('appinstalled',()=>{deferred=null;toast('Application installée ✓');refresh()});
/* bouton « Installer ➜ » dans l'en-tête, à côté du nom (disparaît une fois installée) */
function instBtn(){return standalone()?'':'<button class=hinst data-a=install aria-label="Installer l\'application">Installer <span aria-hidden=true>➜</span></button>'}
/* carte VENCRAFT-CI en haut des réglages */
function vcCard(){
  return`<section class="card vcard"><div class=vname>VENCRAFT-CI</div><p class=vtag>Aux côtés de ceux qui bâtissent.</p>
  ${lnk(SITE,'Visiter le site officiel','btn site big')}
  <div class=vcof><h3>☕ Soutenir le projet</h3><p>Offrir un café, si vous le souhaitez.</p>${lnk(PAY,'☕ Offrir un café','btn gold big')}<p class=hint>Votre soutien est libre et facultatif.</p></div></section>`}

/* ---------- icônes ---------- */
const IC={agenda:'<path d="M4 6h16M4 12h16M4 18h10"/>',month:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',add:'<path d="M12 5v14M5 12h14"/>',block:'<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',set:'<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  chat:'<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/>',
  check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',undo:'<path d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3"/>',
  edit:'<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',trash:'<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/>'};
const ico=k=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`;

/* ---------- sauvegarde et restauration (fichier JSON, 100 % sur le téléphone) ---------- */
const BK={app:'agenda-rdv',ver:2,last:'agenda_derniere_sauvegarde',undo:'agenda_pro_v1_avant_restauration',max:5*1024*1024};
let nobk=false;
/* empreinte du contenu : détecte un fichier modifié ou abîmé */
const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(16)};
const okDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&iso(pd(s))===s;
const okTime=(s,m24)=>{if(typeof s!=='string'||!/^\d{2}:\d{2}$/.test(s))return false;if(s==='24:00')return!!m24;return+s.slice(0,2)<24&&+s.slice(3)<60};
const txt=(v,n)=>(typeof v==='string'||typeof v==='number')?String(v).trim().slice(0,n):'';
const hasU=k=>Object.prototype.hasOwnProperty.call(U,k);
const sx=n=>n>1?'s':'';
const fmtDT=t=>{const d=new Date(t);return isNaN(d)?'date inconnue':d.toLocaleString('fr-FR',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})};
const modal=h=>{const m=$('#modal');m.innerHTML=`<div class=mbox role=dialog aria-modal=true>${h}</div>`;m.classList.add('on')};
const mErr=(t,m)=>modal(`<h3>${esc(t)}</h3><p>${esc(m)}</p><p class=hint>Aucune donnée n'a été modifiée sur ce téléphone.</p><button class="btn gold big" data-a=close>Fermer</button>`);

/* nettoyage strict de tout ce qui vient d'un fichier : seuls les champs connus, aux formats attendus, sont conservés */
function cleanRdv0(r){
  if(!r||typeof r!=='object')return null;
  const date=r.date,time=r.time,name=txt(r.name,100);
  if(!okDate(date)||!okTime(time,false)||!name)return null;
  const d=Math.round(+r.dur),cr=+r.created,s0=date+'_'+time,sid=(typeof r.sid==='string'&&r.sid.startsWith(s0+'~')&&/^\d{1,3}$/.test(r.sid.slice(s0.length+1)))?r.sid:s0;
  return{sid,name,phone:txt(r.phone,40),wa:txt(r.wa,40),date,time,
    dur:d>=5&&d<=1440?d:(+cfg().slot||60),urg:hasU(r.urg)?r.urg:'normal',note:txt(r.note,1000),
    done:r.done===true,created:Number.isFinite(cr)&&cr>0?cr:Date.now()}}
function cleanBlocks(a){const seen=new Set();
  return a.map((b,i)=>{
    if(!b||typeof b!=='object'||!okDate(b.from)||!okDate(b.to)||b.to<b.from)return null;
    const all=b.all===true;
    if(!all&&!(okTime(b.start,false)&&okTime(b.end,true)&&t2m(b.end)>t2m(b.start)))return null;
    let id=String(b.id==null?'':b.id).replace(/[^\w-]/g,'').slice(0,40);
    if(!id||seen.has(id))id='b'+Date.now()+'_'+i;seen.add(id);
    return{id,from:b.from,to:b.to,all,start:okTime(b.start,false)?b.start:'12:00',end:okTime(b.end,true)?b.end:'14:00',reason:txt(b.reason,200)}}).filter(Boolean)}
function cleanNotes(a){const seen=new Set();return a.map((n,i)=>{if(!n||typeof n!=='object')return null;const title=txt(n.title,100),text=txt(n.text,5000);if(!title&&!text)return null;
  let id=String(n.id==null?'':n.id).replace(/[^\w-]/g,'').slice(0,40);if(!id||seen.has(id))id='n'+Date.now().toString(36)+'_'+i;seen.add(id);
  const cr=+n.created,up=+n.updated;return{id,title,date:okDate(n.date)?n.date:today(),text,created:Number.isFinite(cr)&&cr>0?cr:Date.now(),updated:Number.isFinite(up)&&up>0?up:Date.now()}}).filter(Boolean)}
function cleanCfg0(c){const o={};if(!c||typeof c!=='object')return o;
  const n=txt(c.name,80);if(n)o.name=n;
  if(okTime(c.open,false)&&okTime(c.close,true)&&t2m(c.close)>t2m(c.open)){o.open=c.open;o.close=c.close}
  const sl=Math.round(+c.slot);if(sl>=5&&sl<=1440)o.slot=sl;
  if(typeof c.multi==='boolean')o.multi=c.multi;
  if(Array.isArray(c.closedDays))o.closedDays=[...new Set(c.closedDays.map(Number).filter(x=>Number.isInteger(x)&&x>=0&&x<=6))];
  if(Array.isArray(c.blocks))o.blocks=cleanBlocks(c.blocks);
  return o}

/* lecture et vérification d'un fichier de sauvegarde : renvoie {err} ou les données propres */
function readBackup(text){
  let j;try{j=JSON.parse(String(text).replace(/^\uFEFF/,''))}catch{
    return{err:"Ce fichier est illisible ou abîmé. Choisissez le fichier « sauvegarde_rendez_vous_….json » créé par cet agenda."}}
  if(!j||typeof j!=='object'||j.app!==BK.app)return{err:"Ce fichier n'est pas une sauvegarde de cet agenda."};
  if(!Number.isInteger(j.formatVersion)||j.formatVersion<1)return{err:"Le format de ce fichier n'est pas reconnu."};
  if(j.formatVersion>BK.ver)return{err:"Cette sauvegarde a été créée par une version plus récente de l'agenda. Fermez puis rouvrez l'application pour la mettre à jour, puis réessayez."};
  if(!j.data||typeof j.data!=='object'||!Array.isArray(j.data.rdv))return{err:"Le fichier est incomplet : la liste des rendez-vous est absente."};
  if(j.checksum!==hash(JSON.stringify(j.data)))return{err:"Le fichier a été modifié ou est abîmé. Utilisez la sauvegarde d'origine (téléchargez-la de nouveau depuis Google Drive)."};
  const seen=new Set(),rdv=[];let bad=0,dup=0;
  j.data.rdv.forEach(r=>{const c=cleanRdv(r);if(!c){bad++;return}if(seen.has(c.sid)){dup++;return}seen.add(c.sid);rdv.push(c)});
  if(j.data.rdv.length&&!rdv.length)return{err:"Aucun rendez-vous valide n'a été trouvé dans ce fichier."};
  return{rdv,cfg:cleanCfg(j.data.cfg),notes:Array.isArray(j.data.notes)?cleanNotes(j.data.notes):null,bad,dup,created:j.createdAt,biz:txt(j.businessName,80)}}

/* ----- sauvegarde ----- */
function makeBackup(){
  try{
    const d=Local.load(),rdv=(Array.isArray(d.rdv)?d.rdv:[]).slice().sort((a,b)=>String(a&&a.sid).localeCompare(String(b&&b.sid))),
      data={rdv,cfg:d.cfg&&typeof d.cfg==='object'?d.cfg:{},notes:Array.isArray(d.notes)?d.notes:[]},
      payload={app:BK.app,formatVersion:BK.ver,createdAt:new Date().toISOString(),businessName:cfg().name,
        counts:{rdv:rdv.length,notes:data.notes.length,blocks:Array.isArray(data.cfg.blocks)?data.cfg.blocks.length:0},checksum:hash(JSON.stringify(data)),data},
      text=JSON.stringify(payload,null,2),back=JSON.parse(text);
    /* auto-contrôle : on relit le fichier avant de l'offrir */
    if(!text||back.checksum!==hash(JSON.stringify(back.data))||back.data.rdv.length!==rdv.length)throw 0;
    const name='sauvegarde_rendez_vous_'+today()+'.json';
    return{name,text,n:rdv.length,file:typeof File==='function'?new File([text],name,{type:'application/json'}):null}
  }catch{toast("La sauvegarde n'a pas pu être créée. Vos rendez-vous n'ont pas été modifiés.");return null}}
function dlFile(b){try{const u=URL.createObjectURL(new Blob([b.text],{type:'application/json'})),a=document.createElement('a');
  a.href=u;a.download=b.name;a.style.display='none';document.body.appendChild(a);a.click();setTimeout(()=>{a.remove();URL.revokeObjectURL(u)},10000);return true}catch{return false}}
const canShare=f=>{try{return!!(f&&navigator.share&&navigator.canShare&&navigator.canShare({files:[f]}))}catch{return false}};
const probe=()=>{try{return new File(['{}'],'sauvegarde.json',{type:'application/json'})}catch{return null}};
const stamp=()=>{try{localStorage[BK.last]=String(Date.now())}catch{}};
async function shareIt(b){
  try{await navigator.share({files:[b.file],title:"Sauvegarde de l'agenda"});stamp();return'shared'}
  catch(e){if(e&&e.name==='AbortError')return'cancel';toast('Le partage a échoué. Utilisez « Sauvegarder mes rendez-vous ».');return'fail'}}
async function deliver(b){
  /* iPhone, application installée : le téléchargement direct est peu fiable, on passe par le menu de partage */
  if(isIOS()&&standalone()&&canShare(b.file))return shareIt(b);
  if(!dlFile(b)){toast('Le téléchargement a échoué. Rechargez la page et réessayez.');return'fail'}
  stamp();return'dl'}

/* ----- restauration ----- */
/* fusion : on garde tout l'existant, on ajoute seulement ce qui manque (identifiant = sid, jamais le nom) */
function merged(cur,R){
  const cr=Array.isArray(cur.rdv)?cur.rdv:[],c0=cur.cfg&&typeof cur.cfg==='object'?cur.cfg:{},bl=Array.isArray(c0.blocks)?c0.blocks:[],
    have=new Set(cr.map(r=>r.sid)),add=R.rdv.filter(r=>!have.has(r.sid)),
    key=b=>[b.from,b.to,b.all?1:0,b.all?'':b.start,b.all?'':b.end].join('|'),
    bk=new Set(bl.map(key)),ids=new Set(bl.map(b=>b.id)),
    nb=(R.cfg.blocks||[]).filter(b=>!bk.has(key(b))).map((b,i)=>ids.has(b.id)?{...b,id:'b'+Date.now()+'_m'+i}:b);
  const cn=Array.isArray(cur.notes)?cur.notes:[],hn=new Set(cn.map(n=>n.id)),an=(R.notes||[]).filter(n=>!hn.has(n.id));
  return{rdv:[...cr,...add],cfg:{...c0,blocks:[...bl,...nb]},notes:[...cn,...an],addR:add.length,skipR:R.rdv.length-add.length,addB:nb.length,addN:an.length}}
function showRestore(R){
  const cur=Local.load(),cr=Array.isArray(cur.rdv)?cur.rdv:[],cb=cur.cfg&&Array.isArray(cur.cfg.blocks)?cur.cfg.blocks:[],cn=Array.isArray(cur.notes)?cur.notes:[],empty=!cr.length&&!cb.length&&!cn.length;
  PEND=R;
  const nb=(R.cfg.blocks||[]).length,up=R.rdv.filter(r=>r.date>=today()).length;
  let h=`<h3>Restaurer cette sauvegarde ?</h3><ul class=facts><li><span>Fichier créé le</span><b>${esc(fmtDT(R.created))}</b></li>`+
    (R.biz?`<li><span>Entreprise</span><b>${esc(R.biz)}</b></li>`:'')+
    `<li><span>Rendez-vous</span><b>${R.rdv.length}${R.rdv.length?` (dont ${up} à venir)`:''}</b></li><li><span>Périodes bloquées</span><b>${nb}</b></li>${R.notes?`<li><span>Notes</span><b>${R.notes.length}</b></li>`:''}</ul>`;
  if(R.bad||R.dup)h+=`<div class="box warn">${R.bad?R.bad+' rendez-vous incomplet'+sx(R.bad)+' dans le fichier ser'+(R.bad>1?'ont':'a')+' ignoré'+sx(R.bad)+'. ':''}${R.dup?R.dup+' doublon'+sx(R.dup)+' ignoré'+sx(R.dup)+'.':''}</div>`;
  if(R.biz&&R.biz!==cfg().name&&R.biz!==C.businessName&&R.biz!=='AYOH LUXURY BOUAKÉ')h+=`<div class="box warn">Ce fichier porte le nom « ${esc(R.biz)} », différent de cet agenda (« ${esc(cfg().name)} »). Vérifiez que c'est bien votre fichier.</div>`;
  if(empty){
    h+=`<p>Votre carnet est vide : les rendez-vous et les réglages du fichier vont être enregistrés sur ce téléphone.</p><button class="btn gold big" data-a=bkGo data-m=replace>Restaurer maintenant</button><button class="btn ghost big" data-a=close>Annuler</button>`}
  else{
    const g=merged(cur,R);
    h+=`<div class="box warn"><b>Votre carnet contient déjà ${cr.length} rendez-vous${cb.length?' et '+cb.length+' période'+sx(cb.length)+' bloquée'+sx(cb.length):''}.</b> Rien n'est modifié avant votre choix.</div>
    <button class="btn gold big" data-a=bkGo data-m=merge>Fusionner</button>
    <p class=hint>Garde vos données actuelles et ajoute celles du fichier : ${g.addR} rendez-vous ajouté${sx(g.addR)}, ${g.skipR} déjà présent${sx(g.skipR)} (conservé${sx(g.skipR)} tel${sx(g.skipR)} quel${sx(g.skipR)}), ${g.addB} période${sx(g.addB)} bloquée${sx(g.addB)} ajoutée${sx(g.addB)}, ${g.addN} note${sx(g.addN)} ajoutée${sx(g.addN)}.</p>
    <button class="btn danger big" data-a=bkGo data-m=replace>Remplacer mes données actuelles</button>
    <p class=hint>Les ${cr.length} rendez-vous actuels et les réglages seront remplacés par ceux du fichier. Vous pourrez annuler depuis Réglages.</p>
    <button class="btn ghost big" data-a=bkFirst>Sauvegarder d'abord mes données actuelles</button>
    <button class="btn ghost big" data-a=close>Annuler</button>`}
  modal(h)}
function applyRestore(mode){
  const R=PEND;if(!R)return;
  const raw=localStorage.getItem(LS),cur=Local.load();let nx,msg;
  if(mode==='merge'){const g=merged(cur,R);nx={...cur,rdv:g.rdv,cfg:g.cfg,notes:g.notes};
    msg=`${g.addR} rendez-vous ajouté${sx(g.addR)}, ${g.skipR} déjà présent${sx(g.skipR)} (conservé${sx(g.skipR)}), ${g.addN} note${sx(g.addN)} ajoutée${sx(g.addN)}.`}
  else{nx={...cur,rdv:R.rdv,cfg:R.cfg,notes:R.notes!==null?R.notes:(Array.isArray(cur.notes)?cur.notes:[])};msg=`${R.rdv.length} rendez-vous restauré${sx(R.rdv.length)}${R.notes?', '+R.notes.length+' note'+sx(R.notes.length):''}, avec les réglages et les périodes bloquées.`}
  const json=JSON.stringify(nx);
  try{
    localStorage.setItem(BK.undo,raw===null?'{}':raw);          /* copie de sécurité de l'état actuel */
    localStorage.setItem(LS,json);
    const back=localStorage.getItem(LS);
    if(back!==json||JSON.parse(back).rdv.length!==nx.rdv.length)throw 0;   /* relecture de contrôle */
  }catch{
    try{raw===null?localStorage.removeItem(LS):localStorage.setItem(LS,raw)}catch{}
    closeModal();return mErr('Restauration impossible',"L'enregistrement sur ce téléphone a échoué (espace insuffisant ou navigateur en mode privé).")}
  closeModal();Local.push();F=blank();P.tab='agenda';P.day=0;P.sel=null;P.seg='todo';render();
  modal(`<h3>Restauration réussie</h3><p>${esc(msg)}</p><p class=hint>Vos rendez-vous sont de retour dans l'agenda et le calendrier.</p><button class="btn gold big" data-a=close>OK</button>`)}

/* ----- affichage : carte dans Réglages + rappel ----- */
function bkCard(){
  if(DB.mode!=='demo')return'';
  const t=+localStorage[BK.last]||0,n=S.rdv.length,sh=canShare(probe()),un=!!localStorage.getItem(BK.undo);
  return`<section class=card><h2>Sauvegarde des rendez-vous</h2>
  <p class=hint style="margin:0 0 10px">Vos rendez-vous et vos notes sont enregistrés <b>sur ce téléphone uniquement</b>. Créez une sauvegarde de temps en temps et gardez le fichier sur Google Drive : vous pourrez tout retrouver sur un nouveau téléphone.</p>
  <ul class=facts><li><span>Rendez-vous enregistrés</span><b>${n}</b></li><li><span>Notes enregistrées</span><b>${S.notes.length}</b></li><li><span>Dernière sauvegarde</span><b>${t?esc(fmtDT(t)):'Aucune'}</b></li></ul>
  <button class="btn gold big" data-a=bkSave>Sauvegarder mes rendez-vous</button>
  ${sh?'<button class="btn ghost big" data-a=bkShare>Envoyer la sauvegarde (Drive, WhatsApp…)</button>':''}
  <button class="btn ghost big" data-a=bkRestore>Restaurer ma sauvegarde</button>
  ${un?'<button class="btn ghost big" data-a=bkUndo>Annuler la dernière restauration</button>':''}
  <p class=hint style="margin:10px 0 0">La sauvegarde ne modifie jamais vos rendez-vous. Si le téléphone est perdu ou réinitialisé, le fichier gardé ailleurs reste intact.</p></section>`}
function bkHtml(){return'';/* le fichier ne se télécharge plus que depuis Réglages */
  if(DB.mode!=='demo'||nobk||!(S.rdv.length||S.notes.length))return'';
  const t=+localStorage[BK.last]||0;if(t&&Date.now()-t<7*864e5)return'';
  return`<div class=inst><span>${t?'Votre dernière sauvegarde date de plus de 7 jours.':'Pensez à sauvegarder vos rendez-vous.'}</span><button class="btn gold sm" data-a=bkSave>Sauvegarder</button><button class=x data-a=nobk aria-label=Fermer>✕</button></div>`}

const BKA={
  async bkSave(){const b=makeBackup();if(!b)return;const r=await deliver(b);if(r==='cancel'||r==='fail')return;
    modal(`<h3>Sauvegarde créée</h3><p>Le fichier <b>${esc(b.name)}</b> contient ${b.n} rendez-vous.</p>`+
      (r==='dl'?`<p>Votre téléphone doit l'avoir enregistré dans les <b>téléchargements</b> (sur iPhone : application <b>Fichiers</b>). Vérifiez qu'il y est ; sinon, recommencez.</p>`:`<p>Le fichier a été transmis via le menu de partage. Vérifiez qu'il est bien arrivé à destination.</p>`)+
      `<p><b>Dernière étape :</b> mettez ce fichier dans Google Drive (ou envoyez-le vous-même par e-mail ou WhatsApp). Tant qu'il reste seulement sur ce téléphone, il peut être perdu avec lui.</p><button class="btn gold big" data-a=close>J'ai compris</button>`);
    render()},
  async bkShare(){const b=makeBackup();if(!b)return;
    if(!canShare(b.file))return toast("Le partage de fichier n'est pas disponible ici. Utilisez « Sauvegarder mes rendez-vous ».");
    const r=await shareIt(b);if(r==='shared'){toast("Fichier partagé. Vérifiez qu'il est bien arrivé dans Google Drive.");render()}},
  bkRestore(){const i=$('#rf');if(!i)return toast('Restauration indisponible. Rechargez la page.');i.value='';i.click()},
  bkGo(d){applyRestore(d.m)},
  async bkFirst(){const b=makeBackup();if(!b)return;const r=await deliver(b);if(r==='dl'||r==='shared')toast('Sauvegarde de vos données actuelles créée : '+b.name)},
  bkUndo(){const raw=localStorage.getItem(BK.undo);if(raw===null)return;
    if(!confirm("Revenir à l'état d'avant la dernière restauration ? Les modifications faites depuis seront perdues."))return;
    try{localStorage.setItem(LS,raw);localStorage.removeItem(BK.undo)}catch{return toast("Impossible d'annuler la restauration")}
    Local.push();render();toast('Restauration annulée')},
  nobk(){nobk=true;render()}};
document.addEventListener('change',e=>{const t=e.target;if(!t||t.id!=='rf')return;
  const f=t.files&&t.files[0];if(!f)return;
  if(f.size>BK.max)return mErr('Fichier trop volumineux',"Ce fichier ne ressemble pas à une sauvegarde de l'agenda.");
  const rd=new FileReader();
  rd.onerror=()=>mErr('Lecture impossible',"Le fichier n'a pas pu être lu. Réessayez, ou téléchargez-le de nouveau depuis Google Drive.");
  rd.onload=()=>{const R=readBackup(rd.result);R.err?mErr('Restauration impossible',R.err):showRestore(R)};
  rd.readAsText(f)});

/* ---------- bloc-notes, rappels automatiques, heure dépliable ---------- */
Object.assign(IC,{notes:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'});
const blankN=()=>({old:null,title:'',date:today(),text:''});
let N={...blankN(),from:'',to:'',q:'',mon:null,fo:false,rec:false,err:null},NT=[],REC=null;
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const nFiltered=()=>{const q=norm(N.q).trim();
  return S.notes.filter(n=>(!N.from||n.date>=N.from)&&(!N.to||n.date<=N.to)&&(!q||norm(n.title+' '+n.text).includes(q))).slice().sort((a,b)=>b.date.localeCompare(a.date)||b.created-a.created)};
const nLabel=()=>N.mon?new Date(N.mon.y,N.mon.m,1).toLocaleDateString('fr-FR',{month:'long',year:'numeric'}):(N.from||N.to)?'Période choisie':'Toutes les dates';
const nCard=n=>`<article class=nc><div class=nh2><b>${esc(n.title)||'Sans titre'}</b><span class=hint>${esc(fd(n.date,{weekday:'short',day:'numeric',month:'short',year:'numeric'}))}</span></div>${n.text?`<div class=nt>${esc(n.text)}</div>`:''}
  <div class=mini><button data-a=nedit data-id="${esc(n.id)}">${ico('edit')}Modifier</button><button class=dl data-a=ndel data-id="${esc(n.id)}">${ico('trash')}Supprimer</button></div></article>`;
const nListHtml=()=>{const L=nFiltered();return L.length?L.map(nCard).join(''):`<div class=empty>${S.notes.length?'Aucune note pour ce filtre.':"Aucune note pour l'instant. Écrivez ou dictez votre première note."}</div>`};
const nCount=()=>{const n=nFiltered().length;return n+' note'+sx(n)+(n!==S.notes.length?' sur '+S.notes.length:'')};
function updNotesList(){const l=$('#nl');if(l)l.innerHTML=nListHtml();const c=$('#ncount');if(c)c.textContent=nCount()}
function notesView(){
  if(DB.mode!=='demo')return`<section class=card><h2>Bloc-notes</h2><p class=hint>Le bloc-notes fonctionne uniquement avec l'enregistrement sur ce téléphone.</p></section>`;
  return`<section class=card><h2>${N.old?'Modifier la note':'Nouvelle note'}</h2>
  <div class=row><label class=lbl>Titre<input data-nf=title value="${esc(N.title)}" placeholder="Ex : Tissus à commander" maxlength=100 autocomplete=off></label><label class=lbl>Date<input type=date data-nf=date value="${esc(N.date)}"></label></div>
  <textarea id=ntx data-nf=text maxlength=5000 placeholder="Écrivez votre note ou touchez Dicter…">${esc(N.text)}</textarea>
  <div class=nact><button class="btn ${N.rec?'rec':'ghost'}" data-a=nmic>${ico('mic')}${N.rec?'Arrêter':'Dicter'}</button><button class="btn gold" data-a=nsave>Enregistrer</button>${N.old?'<button class="btn ghost" data-a=ncancel>Annuler</button>':''}</div>
  ${N.rec?'<p class=hint style="margin:8px 0 0">Parlez maintenant. Touchez « Arrêter » quand vous avez fini : la note est enregistrée automatiquement.</p>':''}</section>
  <section class=card><button class=fold id=nfoldb data-a=nfold aria-expanded="${N.fo}"><h2>Filtrer</h2><span class=hint>${esc(nLabel())} ${N.fo?'▴':'▾'}</span></button>
  <div id=nfp ${N.fo?'':'hidden'} style="margin-top:10px"><div class=mh style="margin-bottom:8px"><button class="btn ghost sm" data-a=nmon data-n=-1 aria-label="Mois précédent">‹</button><b class=cap>${esc(nLabel())}</b><button class="btn ghost sm" data-a=nmon data-n=1 aria-label="Mois suivant">›</button></div>
  <div class=row><label class=lbl>Du<input type=date data-nf=from value="${esc(N.from)}"></label><label class=lbl>Au<input type=date data-nf=to value="${esc(N.to)}"></label></div>
  <input data-nf=q value="${esc(N.q)}" placeholder="Rechercher un mot (titre ou texte)" autocomplete=off>
  <div class=nact><button class="btn ghost sm" data-a=nthis>Ce mois</button><button class="btn ghost sm" data-a=nall>Tout voir</button></div></div></section>
  <section class="card nlistc"><div class=nh><h2>Mes notes</h2><span class=hint id=ncount>${nCount()}</span></div><div class=nlist id=nl>${nListHtml()}</div></section>`}
async function saveNote(auto){
  const title=N.title.trim(),text=N.text.trim();
  if(!title&&!text)return toast('Écrivez ou dictez une note');
  const old=N.old&&S.notes.find(x=>x.id===N.old),now=Date.now(),
    note={id:old?old.id:'n'+now.toString(36)+Math.random().toString(36).slice(2,6),title:(title||text.split(/\s+/).slice(0,6).join(' ')).slice(0,100),
      date:okDate(N.date)?N.date:today(),text:text.slice(0,5000),created:old?old.created:now,updated:now};
  try{await DB.putNote(note)}catch{return toast("La note n'a pas pu être enregistrée (espace insuffisant ?)")}
  N={...N,...blankN()};toast(auto?'Note vocale enregistrée':'Note enregistrée');render()}
/* dictée vocale : fonction du navigateur (Chrome Android surtout), connexion internet nécessaire */
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
function micStart(){
  if(!SR)return toast("La dictée vocale n'est pas disponible sur ce navigateur. Utilisez le micro du clavier de votre téléphone.");
  const base=N.text.trim();let live='';
  const r=new SR();r.lang='fr-FR';r.continuous=true;r.interimResults=true;
  r.onresult=e=>{live=Array.from(e.results).map(x=>x[0].transcript).join(' ').replace(/\s+/g,' ').trim();N.text=(base?base+' ':'')+live;const t=$('#ntx');if(t)t.value=N.text};
  r.onerror=e=>{N.err=e&&e.error};
  r.onend=()=>{REC=null;N.rec=false;const err=N.err;N.err=null;
    if(live){N.text=(base?base+' ':'')+live;saveNote(true)}
    else{render();toast(err==='not-allowed'||err==='service-not-allowed'?'Micro refusé : autorisez le micro pour ce site dans les réglages du navigateur.':err==='network'?'La dictée vocale demande une connexion internet.':'Aucune voix détectée. Réessayez.')}};
  try{r.start();REC=r;N.rec=true;render()}catch{REC=null;N.rec=false;toast('Impossible de démarrer le micro')}}

/* rappels : au plus 2 par rendez-vous (la veille, puis quand l'heure approche), jamais répétés */
const nfl=()=>{try{return JSON.parse(localStorage.agenda_notifs)||{}}catch{return{}}};
function checkNotifs(){
  if(!S.ready||!user)return;
  const f=nfl(),now=new Date(),td=today(),tm=iso(add(now,1)),mins=now.getHours()*60+now.getMinutes(),live=new Set(S.rdv.map(r=>r.sid));let ch=false;
  Object.keys(f).forEach(k=>{if(!live.has(k.split('|')[0])){delete f[k];ch=true}});
  const j1=S.rdv.filter(r=>!r.done&&r.date===tm&&!f[r.sid+'|j1']&&Date.now()-(+r.created||0)>2*36e5).sort((a,b)=>a.time.localeCompare(b.time));
  if(j1.length){j1.forEach(r=>{f[r.sid+'|j1']=Date.now()});ch=true;
    NT.push({t:j1.length>1?'Demain : '+j1.length+' rendez-vous':'Demain : 1 rendez-vous',m:j1.slice(0,5).map(r=>r.name+' à '+r.time).join(' · ')+(j1.length>5?' …':'')})}
  S.rdv.filter(r=>!r.done&&r.date===td&&!f[r.sid+'|j0']).forEach(r=>{const diff=t2m(r.time)-mins;
    if(diff<=60&&diff>=-15){f[r.sid+'|j0']=Date.now();ch=true;NT.push({t:'Rendez-vous bientôt',m:r.name+' à '+r.time+(diff>0?' (dans '+diff+' min)':' (maintenant)')})}});
  if(ch){try{localStorage.agenda_notifs=JSON.stringify(f)}catch{}if(NT.length>6)NT=NT.slice(-6);refresh()}}
const ntHtml=()=>NT.map((n,i)=>`<div class=ntf role=status><div><b>${esc(n.t)}</b><br>${esc(n.m)}</div><button class=x data-a=ntx data-i=${i} aria-label=Fermer>✕</button></div>`).join('');

const NTA={
  tfold(){P.tOpen=!P.tOpen;render()},
  ntx(d){NT.splice(+d.i,1);render()},
  nfold(){N.fo=!N.fo;render()},
  nmon(d){const b=N.mon?new Date(N.mon.y,N.mon.m,1):new Date(),m=new Date(b.getFullYear(),b.getMonth()+ +d.n,1);
    N.mon={y:m.getFullYear(),m:m.getMonth()};N.from=iso(m);N.to=iso(new Date(m.getFullYear(),m.getMonth()+1,0));render()},
  nthis(){const m=new Date();N.mon={y:m.getFullYear(),m:m.getMonth()};N.from=iso(new Date(m.getFullYear(),m.getMonth(),1));N.to=iso(new Date(m.getFullYear(),m.getMonth()+1,0));render()},
  nall(){N.mon=null;N.from='';N.to='';N.q='';render()},
  nmic(){REC?REC.stop():micStart()},
  nsave(){if(REC){REC.stop();return}saveNote(false)},
  ncancel(){N={...N,...blankN()};render()},
  nedit(d){const n=S.notes.find(x=>x.id===d.id);if(!n)return;N={...N,old:n.id,title:n.title,date:n.date,text:n.text};render();const s=$('#sc');if(s)s.scrollTop=0},
  async ndel(d){const n=S.notes.find(x=>x.id===d.id);if(!n||!confirm('Supprimer la note « '+(n.title||'Sans titre')+' » ?'))return;
    try{await DB.delNote(d.id);if(N.old===d.id)N={...N,...blankN()};toast('Note supprimée');render()}catch{toast('Erreur, réessayez')}}};
document.addEventListener('input',e=>{const t=e.target,k=t&&t.dataset&&t.dataset.nf;if(!k)return;N[k]=t.value;if(k==='q')updNotesList()});
document.addEventListener('change',e=>{const t=e.target,k=t&&t.dataset&&t.dataset.nf;if(k!=='from'&&k!=='to')return;
  N.mon=null;if(N.from&&N.to&&N.to<N.from){k==='from'?N.to=N.from:N.from=N.to}render()});
/* ---------- vues ---------- */
function card(r){const u=U[r.urg]||U.normal,tel=intl(r.phone),wa=intl(r.wa||r.phone),d=+(r.dur||cfg().slot),
  msg=encodeURIComponent(`Bonjour ${r.name}, ici ${cfg().name}. Nous vous confirmons votre rendez-vous le ${fd(r.date)} à ${r.time}.`);
  return`<article class="rc${r.done?' done':''}" style="--c:${u.c}"><div class=rt><b>${r.time}</b><small>${dur(d)}</small></div><div class=rb>
  <div class=rn><h4>${esc(r.name)}</h4><span class=tag><i></i>${u.l}</span></div><div class=ph>${esc(r.phone)}</div>
  ${r.note?`<div class=note>${esc(r.note)}</div>`:''}
  <div class=acts><a class="act call${tel?'':' off'}" href="tel:+${tel}">${ico('phone')}Appeler</a><a class="act wa${wa?'':' off'}" href="https://wa.me/${wa}?text=${msg}" target=_blank rel=noopener>${ico('chat')}WhatsApp</a></div>
  <div class=mini>${r.done?`<button data-a=done data-s="${r.sid}">${ico('undo')}À recevoir</button>`:`<button class=ok2 data-a=done data-s="${r.sid}">${ico('check')}Terminé</button>`}<button data-a=edit data-s="${r.sid}">${ico('edit')}Modifier</button><button class=dl data-a=del data-s="${r.sid}">${ico('trash')}Supprimer</button></div></div></article>`}

function dayBlock(d){const L=S.rdv.filter(r=>r.date===d).sort((a,b)=>a.time.localeCompare(b.time)),todo=L.filter(r=>!r.done),dn=L.filter(r=>r.done),isT=P.seg==='todo',cl=dayClosed(d);
  let h=`<div class=dh><h3 class=cap>${esc(fd(d))}</h3><span class=hint>${cl?'Jour bloqué':freeCount(d)+' créneau'+(freeCount(d)>1?'x':'')+' libre'+(freeCount(d)>1?'s':'')}</span></div>
  <div class=seg><button class="${isT?'sel':''}" data-a=seg data-s=todo>À recevoir<em>${todo.length}</em></button><button class="${isT?'':'sel'}" data-a=seg data-s=done>Terminés<em>${dn.length}</em></button></div>`;
  const list=isT?todo:dn;
  if(!list.length)return h+`<div class=empty>${isT?'Aucun client à recevoir ce jour.':'Aucun client terminé ce jour.'}</div>`+(isT&&!cl?`<button class="btn gold big" data-a=addfor data-d="${d}">Ajouter un rendez-vous</button>`:'');
  if(!isT)return h+list.map(card).join('');
  PER.forEach(([n,a,b])=>{const g=list.filter(r=>t2m(r.time)>=a&&t2m(r.time)<b);if(g.length)h+=`<div class=gl>${n}</div>`+g.map(card).join('')});return h}
function agendaView(){const ds=[0,1,2].map(i=>iso(add(new Date(),i))),lb=['Aujourd\'hui','Demain','Après-demain'],cal=P.day===3;
  return`<div class=tiles>${ds.map((d,i)=>`<button class="tile${P.day===i?' sel':''}" data-a=day data-i=${i}><b>${S.rdv.filter(r=>r.date===d&&!r.done).length}</b><span>${lb[i]}</span><small>${esc(fd(d,{weekday:'short',day:'numeric'}))}</small></button>`).join('')}<button class="tile cal${cal?' sel':''}" data-a=day data-i=3>${ico('month')}<span>Calendrier</span><small>${esc(P.month.toLocaleDateString('fr-FR',{month:'short'}))}</small></button></div>`+(cal?monthView():dayBlock(ds[P.day]))}
function monthView(){const m=P.month,y=m.getFullYear(),mo=m.getMonth(),n=new Date(y,mo+1,0).getDate(),off=(new Date(y,mo,1).getDay()+6)%7,by={};
  S.rdv.forEach(r=>(by[r.date]=by[r.date]||[]).push(r));
  let g=['L','M','M','J','V','S','D'].map(x=>`<div class=gh>${x}</div>`).join('')+'<div></div>'.repeat(off);
  for(let i=1;i<=n;i++){const d=iso(new Date(y,mo,i)),L=(by[d]||[]),T=L.filter(r=>stOf(r)==='todo'),mx=T.some(r=>r.urg==='urgent')?'urgent':T.some(r=>r.urg==='moyen')?'moyen':'normal',col=T.length?U[mx].c:L.length?'#9aa5a0':'transparent';
    g+=`<button class="cell${dayClosed(d)?' blk':''}${d===today()?' td':''}${d===(P.sel||today())?' sel':''}" data-a=sel data-d="${d}">${i}<i style="background:${col}"></i></button>`}
  return`<div class=mh><button class="btn ghost sm" data-a=mon data-n=-1 aria-label="Mois précédent">‹</button><h3 class=cap>${m.toLocaleDateString('fr-FR',{month:'long',year:'numeric'})}</h3><button class="btn ghost sm" data-a=mon data-n=1 aria-label="Mois suivant">›</button></div><div class=grid>${g}</div>`+dayBlock(P.sel||today())}

function addView(){if(!F.date)F.date=today();const all=slots(),D=fdur(),endT=F.time?tv(m2t(Math.min(1440,t2m(F.time)+D))):'';
  return`<section class=card><h2>${F.old?'Modifier le rendez-vous':'Nouveau rendez-vous'}</h2>
  <label class=lbl>Nom du client<input data-f=name value="${esc(F.name)}" placeholder="Ex : Awa Koné" autocomplete=off></label>
  <label class=lbl>Téléphone<input data-f=phone type=tel inputmode=tel value="${esc(F.phone)}" placeholder="07 00 00 00 00"></label>
  <label class=chk><input type=checkbox data-f=same ${F.same?'checked':''}> Ce numéro est aussi sur WhatsApp</label>
  ${F.same?'':`<label class=lbl>Numéro WhatsApp<input data-f=wa type=tel inputmode=tel value="${esc(F.wa)}" placeholder="Numéro WhatsApp du client"></label>`}</section>
  <section class=card><h2>Date</h2><div class=chips>${Array.from({length:14},(_,i)=>{const d=iso(add(new Date(),i)),x=pd(d),f=freeCount(d);
    return`<button class="chip${d===F.date?' sel':''}${f?'':' off'}" data-a=pickd data-d="${d}"><small>${i?x.toLocaleDateString('fr-FR',{weekday:'short'}):'Auj.'}</small><b>${x.getDate()}</b><small>${x.toLocaleDateString('fr-FR',{month:'short'})}</small><em>${dayClosed(d)?'Bloqué':f?f+' libre'+(f>1?'s':''):'Complet'}</em></button>`}).join('')}</div>
  <label class=lbl>Autre date<input type=date data-f=date value="${F.date}" min="${today()}"></label></section>
  <section class=card><button class=fold id=tfold data-a=tfold aria-expanded="${P.tOpen}"><h2>Heure</h2><span class=hint>${F.time?'<b>'+esc(tv(F.time))+' → '+esc(endT)+'</b> ('+esc(dur(D))+')':'Choisir'} ${chev(P.tOpen)}</span></button><div id=tpanel class=tp ${P.tOpen?'':'hidden'}>
  <div class=lbl>Durée de ce rendez-vous : <b>${esc(dur(D))}</b></div><div class=qd>${[30,60,90,120,180,240].map(x=>`<button class="pill${D===x?' sel':''}" data-a=pdur data-m=${x}>${esc(dur(x))}</button>`).join('')}</div>
  <label class=lbl>Autre durée (en minutes)<span class=unit><input type=number data-f=dur inputmode=numeric min=5 max=1440 value="${F.dur||''}" placeholder="${D}"><b>min</b></span></label>
  <label class=lbl style="margin-top:8px">Heure précise (ex : 17:30)<input type=time data-f=time value="${F.time||''}"></label>
  ${dayClosed(F.date)?'<div class=empty>Ce jour est bloqué. Choisissez une autre date.</div>':'<div class=lbl style="margin-top:6px">Ou touchez une heure</div>'+PER.map(([n,a,b])=>{const g=all.filter(t=>t2m(t)>=a&&t2m(t)<b);
    return g.length?`<div class=gl>${n}</div><div class=slots>`+g.map(t=>{const bl=isBlocked(F.date,t,D),o=takenBy(F.date,t),m=cfg().multi?busy(F.date,t,F.old,D).length:0;
      return`<button class="slot${o?' taken':''}${F.time===t?' sel':''}" ${bl||o?'disabled':`data-a=pickt data-t="${t}"`}>${t}${o?`<small>${esc(o.name.split(' ')[0])}</small>`:bl?'<small>Bloqué</small>':m?`<small>${m} rdv</small>`:''}</button>`}).join('')+'</div>':''}).join('')}</div></section>
  <section class=card><h2>Urgence, motif et note personnelle</h2><div class=urg>${Object.entries(U).reverse().map(([k,u])=>`<button class="u${F.urg===k?' sel':''}" style="--c:${u.c}" data-a=urg data-u="${k}"><i></i>${u.l}</button>`).join('')}</div>
  <label class=lbl>Motif du rendez-vous<textarea data-f=note placeholder="Pourquoi le client vient (facultatif)">${esc(F.note)}</textarea></label><label class=lbl style="margin-top:10px">🔒 Note personnelle (vous seul la voyez)<textarea data-f=perso placeholder="Ex : client fidèle, apporter les échantillons…">${esc(F.perso||'')}</textarea></label></section>
  <button class="btn gold big" data-a=save>Enregistrer le rendez-vous</button>${F.old?'<button class="btn ghost big" data-a=cancelEdit>Annuler la modification</button>':''}`}

function blockView(){const c=cfg(),B=P.bk,bl=[...c.blocks].sort((a,b)=>a.from.localeCompare(b.from)),DN=[['Lun',1],['Mar',2],['Mer',3],['Jeu',4],['Ven',5],['Sam',6],['Dim',0]],
  ok=!B.all&&t2m(B.end)>t2m(B.start);
  return`<section class=card><h2>Bloquer une période</h2>
  <div class=row><label class=lbl>Du<input type=date data-b=from value="${B.from}" min="${today()}"></label><label class=lbl>Au<input type=date data-b=to value="${B.to}" min="${B.from}"></label></div>
  <div class=seg><button class="${B.all?'sel':''}" data-a=ball data-v=1>Toute la journée</button><button class="${B.all?'':'sel'}" data-a=ball data-v=0>Certaines heures</button></div>
  ${B.all?'':`<div class=row><label class=lbl>De<input type=time data-b=start value="${B.start}"></label><label class=lbl>À<input type=time data-b=end value="${tv(B.end)}"></label></div>
  <div class=lbl>Durée rapide à partir de l'heure de début</div><div class=qd>${[1,2,3,4,6].map(h=>`<button class=pill data-a=bdur data-h=${h}>${h} h</button>`).join('')}</div>
  <p class=hint>${ok?`Bloqué de ${tv(B.start)} à ${tv(B.end)} (${dur(t2m(B.end)-t2m(B.start))}), chaque jour de la période. `:''}Pour fermer le soir, mettez par exemple de 18:00 à 00:00 (minuit).</p>`}
  <input data-b=reason value="${esc(B.reason)}" placeholder="Raison (congé, fête, déplacement…)"><button class="btn gold big" data-a=addblock>Bloquer cette période</button></section>
  <section class=card><h2>Jours fermés chaque semaine</h2><div class=wd>${DN.map(([n,i])=>`<button class="pill${c.closedDays.includes(i)?' sel':''}" data-a=wd data-d="${i}">${n}</button>`).join('')}</div><div class=hint>Les jours en violet sont fermés.</div></section>
  <section class=card><h2>Périodes bloquées</h2>${bl.length?bl.map(b=>`<div class=bl><div><b>${b.from===b.to?esc(fd(b.from,{weekday:'short',day:'numeric',month:'short'})):esc(fd(b.from,{day:'numeric',month:'short'}))+' au '+esc(fd(b.to,{day:'numeric',month:'short'}))}</b><br><span class=hint>${b.all?'Toute la journée':tv(b.start)+' à '+tv(b.end)+' ('+dur(t2m(b.end)-t2m(b.start))+')'}${b.reason?', '+esc(b.reason):''}</span></div><button class="btn ghost sm" data-a=unblock data-id="${b.id}">Débloquer</button></div>`).join(''):'<div class=hint>Aucun blocage en cours.</div>'}</section>`}

function setView(){const c=cfg(),sl=+c.slot;
  return`<section class=card><h2>Réglages</h2><label class=lbl>Nom de l'entreprise<input id=sn value="${esc(c.name)}"></label>
  <div class=row><label class=lbl>Ouverture<input type=time id=so value="${tv(c.open)}"></label><label class=lbl>Fermeture<input type=time id=scl value="${tv(c.close)}"></label></div>
  <p class=hint style="margin:0 0 12px">Pour fermer à minuit, mettez 00:00. Vous pouvez ouvrir dès 00:00 et fermer à 00:00 pour couvrir 24 h.</p>
  <label class=lbl>Durée d'un rendez-vous (en minutes)<input type=number id=sl inputmode=numeric min=5 max=1440 step=1 value="${sl}"></label>
  <div class=qd>${[15,30,45,60,90,120,180].map(x=>`<button class="pill qs${sl===x?' sel':''}" data-a=setslot data-m=${x}>${x}</button>`).join('')}</div>
  <p class=hint id=pv></p>
  <label class=chk><input type=checkbox id=smulti ${c.multi?'checked':''}> Autoriser plusieurs rendez-vous à la même heure</label>
  <p class=hint style="margin:-4px 0 12px">Désactivé (recommandé) : un créneau déjà pris ne peut plus être choisi.</p>
  <button class="btn gold big" data-a=savecfg>Enregistrer</button></section>
  ${bkCard()}
  ${DB.mode==='firebase'?`<section class=card><h2>Compte</h2><p class=hint>Connecté : ${esc(user.email||'')}</p><button class="btn ghost sm" data-a=logout>Se déconnecter</button></section>`:''}`}
function pvUpdate(){const o=$('#so'),c=$('#scl'),s=$('#sl'),p=$('#pv');if(!o||!c||!s||!p)return;
  const sl=+s.value,om=t2m(o.value||'08:00'),cm=t2m(tz(c.value||'18:00'));
  document.querySelectorAll('.qs').forEach(b=>b.classList.toggle('sel',+b.dataset.m===sl));
  if(!(sl>=5)||cm<=om){p.textContent='Vérifiez les horaires et la durée (5 minutes minimum).';return}
  const n=Math.floor((cm-om)/sl);
  p.textContent=n?`${n} créneau${n>1?'x':''} par jour : le premier à ${m2t(om)}, le dernier à ${m2t(om+(n-1)*sl)}.`:'La durée est plus longue que la journée d\'ouverture.'}
function loginView(){document.title='Agenda';lastTab=null;
  $('#app').innerHTML=`<main class=wrap id=sc><div class=login><img src="icons/icon-192.png" alt=""><h1>${esc(cfg().name)}</h1><p class=sub>Agenda de l'équipe</p><section class=card><h2>Connexion</h2>
  <input id=em type=email placeholder="Adresse e-mail de l'équipe" autocomplete=username><input id=pw type=password placeholder="Mot de passe" autocomplete=current-password>
  <button class="btn gold big" data-a=login>Se connecter</button><p class=hint>Une seule fois : le téléphone reste connecté ensuite.</p></section></div></main>`}

function render(){if(!DB)return;if(!user)return loginView();const c=cfg();document.title=c.name+' – Agenda';
  const old=$('#sc'),y=old&&lastTab===P.tab?old.scrollTop:0;lastTab=P.tab;
  const tabs=[['agenda','Agenda'],['notes','Bloc-notes'],['add','Ajouter'],['block','Bloquer'],['set','Réglages']];
  const v={agenda:agendaView,notes:notesView,add:addView,block:blockView,set:setView}[P.tab]();
  $('#app').innerHTML=`<header class=top><img src="icons/icon-192.png" alt=""><div><div class=brand>${esc(c.name)}</div><div class=sub>Agenda des rendez-vous</div></div>${instBtn()}</header>${ntHtml()}
  <main class="wrap${P.tab==='notes'?' fill':''}" id=sc>${P.tab==='set'||P.tab==='notes'?'':`<div id=inst>${bkHtml()}</div>`}${v}</main>
  <nav class=bnav>${tabs.map(([k,l])=>`<button class="${k==='add'?'plus ':''}${P.tab===k?'sel':''}" data-a=tab data-t=${k} aria-label="${l}">${ico(k)}<span>${l}</span></button>`).join('')}</nav>`;
  $('#sc').scrollTop=y;P.tY=(P.tab==='add'&&P.tOpen)?y:null;if(P.tab==='set')pvUpdate()}
function refresh(){const a=document.activeElement;if(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)&&$('#app').contains(a)&&user)return;render()}

/* ---------- actions ---------- */
const A={
  tab(d){P.tab=d.t;if(d.t==='add'){if(!F.old&&!F.date)F.date=today();P.tOpen=false}render()},
  day:d=>{P.day=+d.i;render()},seg:d=>{P.seg=d.s;render()},
  mon:d=>{P.month=new Date(P.month.getFullYear(),P.month.getMonth()+ +d.n,1);render()},
  sel:d=>{P.sel=d.d;render()},
  pickd:d=>{F.date=d.d;F.time=null;render()},pickt:d=>{F.time=d.t;render()},pdur:d=>{F.dur=+d.m;render()},urg:d=>{F.urg=d.u;render()},
  addfor:d=>{F=blank();F.date=d.d;P.tab='add';P.tOpen=false;render()},
  edit(d){const r=S.rdv.find(x=>x.sid===d.s);if(!r)return;F={old:r.sid,name:r.name,phone:r.phone,same:!r.wa||r.wa===r.phone,wa:r.wa||'',date:r.date,time:r.time,dur:+r.dur||null,urg:r.urg,note:r.note||'',perso:r.perso||'',keep:r,done:!!r.done,created:r.created};P.tab='add';P.tOpen=false;render()},
  cancelEdit(){F=blank();P.tab='agenda';render()},
  async save(){const name=F.name.trim(),ph=F.phone.trim(),wa=F.same?ph:F.wa.trim();
    if(name.length<2)return toast('Entrez le nom du client');
    if(ph.replace(/\D/g,'').length<6)return toast('Entrez un numéro de téléphone valide');
    if(!F.same&&wa.replace(/\D/g,'').length<6)return toast('Entrez le numéro WhatsApp');
    if(!F.time||!okTime(F.time,false))return toast('Choisissez une heure');
    const D=fdur(),cf=cfg();
    if(isBlocked(F.date,F.time,D))return toast('Ce créneau est bloqué');
    const clash=busy(F.date,F.time,F.old,D);
    if(clash.length){if(!cf.multi)return toast('Ce créneau est déjà pris. Choisissez-en un autre.');
      if(!confirm('Il y a déjà un rendez-vous à cette heure ('+clash.map(x=>x.name).join(', ')+'). Ajouter quand même ?'))return}
    const base=F.date+'_'+F.time;let sid=base;
    if(F.old&&(F.old===base||F.old.startsWith(base+'~')))sid=F.old;
    else if(S.rdv.some(x=>x.sid===sid&&x.sid!==F.old)){let k=2;while(S.rdv.some(x=>x.sid===base+'~'+k))k++;sid=base+'~'+k}
    const r={...(F.keep||{}),sid,name,phone:ph,wa,date:F.date,time:F.time,dur:D,urg:F.urg,note:F.note.trim(),perso:(F.perso||'').trim(),status:F.keep?stOf(F.keep):'todo',done:F.done,created:F.created||Date.now()};
    try{F.old?await DB.update(F.old,r):await DB.add(r)}catch(e){return toast(e==='taken'?'Ce créneau est déjà pris. Choisissez-en un autre.':'Erreur de connexion, réessayez')}
    F=blank();const i=Math.round((pd(r.date)-pd(today()))/864e5);P.seg='todo';
    if(i>=0&&i<=2){P.tab='agenda';P.day=i}else{P.tab='agenda';P.day=3;P.sel=r.date;P.month=new Date(pd(r.date).getFullYear(),pd(r.date).getMonth(),1)}
    render();toast('Rendez-vous enregistré')},
  async done(d){const r=S.rdv.find(x=>x.sid===d.s);if(!r)return;try{await DB.patch(d.s,{done:!r.done});toast(r.done?'Remis à recevoir':'Client terminé')}catch{toast('Erreur de connexion')}},
  async del(d){const r0=S.rdv.find(x=>x.sid===d.s);if(!confirm(r0?'Supprimer le rendez-vous de '+r0.name+' ('+fd(r0.date)+' à '+r0.time+') ? Le créneau sera de nouveau libre.':'Supprimer ce rendez-vous ?'))return;try{await DB.remove(d.s);toast('Rendez-vous supprimé')}catch{toast('Erreur de connexion')}},
  ball(d){P.bk.all=d.v==='1';render()},
  bdur(d){const B=P.bk;B.end=m2t(Math.min(1440,t2m(B.start)+ +d.h*60));render()},
  async addblock(){const B=P.bk,f=B.from,t=B.to,all=B.all,s=B.start,e=B.end;
    if(!f||!t||t<f)return toast('Vérifiez les dates');if(!all&&(!s||!e||t2m(e)<=t2m(s)))return toast("L'heure de fin doit être après l'heure de début");
    const c=cfg();c.blocks=[...c.blocks,{id:String(Date.now()),from:f,to:t,all,start:s,end:e,reason:B.reason.trim()}];
    const hit=S.rdv.filter(r=>stOf(r)==='todo'&&r.date>=f&&r.date<=t&&(all||(t2m(r.time)<t2m(e)&&t2m(r.time)+ +c.slot>t2m(s)))).length;
    try{await DB.setCfg(c);P.bk=bk0();toast(hit?`Bloqué. Attention : ${hit} rendez-vous déjà prévus sur cette période`:'Période bloquée');render()}catch{toast('Erreur de connexion')}},
  async unblock(d){const c=cfg();c.blocks=c.blocks.filter(b=>b.id!==d.id);try{await DB.setCfg(c);toast('Débloqué');render()}catch{toast('Erreur de connexion')}},
  async wd(d){const c=cfg(),i=+d.d;c.closedDays=c.closedDays.includes(i)?c.closedDays.filter(x=>x!==i):[...c.closedDays,i];try{await DB.setCfg(c);render()}catch{toast('Erreur de connexion')}},
  setslot(d){$('#sl').value=d.m;pvUpdate()},
  async savecfg(){const c=cfg(),o=$('#so').value,cl=tz($('#scl').value),sl=Math.round(+$('#sl').value);
    if(!o||!cl||t2m(cl)<=t2m(o))return toast("Vérifiez les horaires (la fermeture doit être après l'ouverture)");
    if(!(sl>=5&&sl<=1440))return toast('Entrez une durée en minutes (5 minimum)');
    Object.assign(c,{name:$('#sn').value.trim()||c.name,open:o,close:cl,slot:sl,multi:$('#smulti').checked});
    try{await DB.setCfg(c);toast('Réglages enregistrés');render()}catch{toast('Erreur de connexion')}},
  async login(){try{await DB.login($('#em').value.trim(),$('#pw').value)}catch{toast('E-mail ou mot de passe incorrect')}},
  async logout(){await DB.logout()},
  async install(){
    if(!deferred){const ios=isIOS();return modal(`<h3>Installer l'application</h3><ol class=steps>${ios?'<li>Ouvrez cette page dans <b>Safari</b>.</li><li>Touchez <b>Partager</b> (carré avec une flèche).</li><li>Choisissez <b>Sur l\'écran d\'accueil</b>, puis <b>Ajouter</b>.</li>':'<li>Touchez le menu <b>⋮</b> en haut à droite du navigateur.</li><li>Choisissez <b>Installer l\'application</b> (ou <b>Ajouter à l\'écran d\'accueil</b>).</li>'}</ol><button class="btn gold big" data-a=close style="margin-top:14px">OK</button>`)}
    try{deferred.prompt();const r=await deferred.userChoice;if(r&&r.outcome==='accepted')toast('Installation en cours…')}catch{}
    deferred=null;refresh()},
  noinst(){try{localStorage.noinst_t=Date.now()}catch{}refresh()},close:closeModal,none(){},...BKA,...NTA};
document.addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(b&&A[b.dataset.a])A[b.dataset.a](b.dataset,b)});
document.addEventListener('input',e=>{const t=e.target,f=t.dataset&&t.dataset.f,b=t.dataset&&t.dataset.b;
  if(f)F[f]=t.type==='checkbox'?t.checked:t.value;
  if(b)P.bk[b]=b==='end'?tz(t.value):t.value;
  if(t.id==='so'||t.id==='scl'||t.id==='sl')pvUpdate()});
document.addEventListener('change',e=>{const t=e.target,f=t.dataset&&t.dataset.f,b=t.dataset&&t.dataset.b;
  if(f==='same')render();if(f==='date'&&t.value){F.date=t.value;F.time=null;render()}
  if(f==='time'&&t.type==='time'){F.time=t.value||null;render()}if(f==='dur')render();
  if(b==='from'){if(P.bk.to<P.bk.from)P.bk.to=P.bk.from;render()}
  if(b==='start'||b==='end'||b==='to')render()});

/* ===== VenCraft-CI : statuts, période, annuler/reporter, rappels, notes, réglages ===== */
BK.ver=3;
const ST={todo:{l:'À recevoir',c:'#7c3aed'},done:{l:'Terminés',c:'#16a34a'},cancel:{l:'Annulés',c:'#dc2626'},moved:{l:'Reportés',c:'#d97706'}};
const stOf=r=>ST[r.status]?r.status:(r.done?'done':'todo');
const isLive=r=>{const s=stOf(r);return s==='todo'||s==='done'};
const EM={todo:'Aucun client à recevoir.',done:'Aucun rendez-vous terminé.',cancel:'Aucun rendez-vous annulé.',moved:'Aucun rendez-vous reporté.'};
Object.assign(IC,{star:'<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',pin:'<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3zM12 14v7"/>',filter:'<path d="M3 5h18l-7 8v6l-4-2v-4z"/>',x:'<path d="M6 6l12 12M18 6L6 18"/>'});
const chev=o=>`<span class=chev aria-hidden=true>${o?'▲':'▼'}</span>`;
const waLink=(r,t)=>'https://wa.me/'+intl(r.wa||r.phone)+'?text='+encodeURIComponent(t);
/* --- période --- */
const PRE=[['today',"Aujourd'hui"],['w7','7 jours'],['mon','Ce mois'],['pm','Mois dernier'],['p30','30 derniers jours'],['all','Tout']];
function setPre(k){const n=new Date(),t=iso(n),y=n.getFullYear(),m=n.getMonth();
  const R={today:[t,t],w7:[t,iso(add(n,6))],mon:[iso(new Date(y,m,1)),iso(new Date(y,m+1,0))],pm:[iso(new Date(y,m-1,1)),iso(new Date(y,m,0))],p30:[iso(add(n,-30)),t],all:['','']}[k];P.pre=k;P.pf=R[0];P.pt=R[1]}
Object.assign(P,{pf:'',pt:'',pq:'',pOpen:true,pre:'mon'});setPre('mon');
const pItems=()=>{const q=norm(P.pq).trim();return S.rdv.filter(r=>(!P.pf||r.date>=P.pf)&&(!P.pt||r.date<=P.pt)&&(!q||norm(r.name+' '+r.phone+' '+(r.note||'')+' '+(r.perso||'')).includes(q)))};
const pLabel=()=>P.pf||P.pt?(P.pf?fd(P.pf,{day:'numeric',month:'short',year:'numeric'}):'…')+' → '+(P.pt?fd(P.pt,{day:'numeric',month:'short',year:'numeric'}):'…'):'Toutes les dates';
const segBar=L=>`<div class=seg4>${Object.entries(ST).map(([k,s])=>`<button class="${P.seg===k?'sel':''}" style="--c:${s.c}" data-a=seg data-s=${k}><i>${L.filter(r=>stOf(r)===k).length}</i><span>${s.l}</span></button>`).join('')}</div>`;
function listHtml(L,byDate){const k=P.seg,l=L.filter(r=>stOf(r)===k).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
  if(!l.length)return`<div class=empty>${EM[k]}</div>`;
  if(byDate){let h='',d='';l.forEach(r=>{if(r.date!==d){d=r.date;h+=`<div class=gl><span class=cap>${esc(fd(d,{weekday:'long',day:'numeric',month:'long',year:'numeric'}))}</span></div>`}h+=card(r)});return h}
  if(k!=='todo')return l.map(card).join('');
  let h='';PER.forEach(([n,a,b])=>{const g=l.filter(r=>t2m(r.time)>=a&&t2m(r.time)<b);if(g.length)h+=`<div class=gl>${n}</div>`+g.map(card).join('')});return h}
const pBody=()=>{const L=pItems();return`<div class=dh><h3>${L.length} rendez-vous</h3><span class=hint>${esc(pLabel())}</span></div>`+segBar(L)+listHtml(L,true)};
function periodView(){return`<section class=card><button class=fold data-a=pfold aria-expanded="${P.pOpen}"><h2>Filtrer par période</h2>${chev(P.pOpen)}</button>
  <div ${P.pOpen?'':'hidden'} style="margin-top:10px"><div class=qd>${PRE.map(([k,l])=>`<button class="pill${P.pre===k?' sel':''}" data-a=ppre data-k=${k}>${l}</button>`).join('')}</div>
  <div class=row><label class=lbl>Du<input type=date data-p=pf value="${P.pf}"></label><label class=lbl>Au<input type=date data-p=pt value="${P.pt}"></label></div>
  <input data-p=pq value="${esc(P.pq)}" placeholder="Rechercher un client (nom, téléphone, motif)" autocomplete=off></div></section><div id=pl>${pBody()}</div>`}
function dayBlock(d){const L=S.rdv.filter(r=>r.date===d),cl=dayClosed(d),f=freeCount(d);
  return`<div class=dh><h3 class=cap>${esc(fd(d))}</h3><span class=hint>${cl?'Jour bloqué':f+' créneau'+(f>1?'x':'')+' libre'+(f>1?'s':'')}</span></div>`+segBar(L)+listHtml(L,false)+(P.seg==='todo'&&!cl&&!L.some(r=>stOf(r)==='todo')?`<button class="btn gold big" data-a=addfor data-d="${d}">Ajouter un rendez-vous</button>`:'')}
function agendaView(){const ds=[0,1,2].map(i=>iso(add(new Date(),i))),lb=["Aujourd'hui",'Demain','Après-demain'],cal=P.day===3,per=P.day===4;
  return`<div class=tiles>${ds.map((d,i)=>`<button class="tile${P.day===i?' sel':''}" data-a=day data-i=${i}><b>${S.rdv.filter(r=>r.date===d&&stOf(r)==='todo').length}</b><span>${lb[i]}</span><small>${esc(fd(d,{weekday:'short',day:'numeric'}))}</small></button>`).join('')}<button class="tile cal${cal?' sel':''}" data-a=day data-i=3>${ico('month')}<span>Calendrier</span><small>${esc(P.month.toLocaleDateString('fr-FR',{month:'short'}))}</small></button></div>
  <button class="pbar${per?' sel':''}" data-a=day data-i=4>${ico('filter')}<span>Période personnalisée</span><small>${per?esc(pLabel()):'Choisir du … au …'}</small></button>`+(per?periodView():cal?monthView():dayBlock(ds[P.day]))}
/* --- carte rendez-vous --- */
function card(r){const s=stOf(r),u=U[r.urg]||U.normal,tel=intl(r.phone),wa=intl(r.wa||r.phone),d=+(r.dur||cfg().slot),cn=cfg().name,
  t0=s==='cancel'?`Bonjour ${r.name}, ici ${cn}. Votre rendez-vous du ${fd(r.date)} à ${r.time} est annulé. Nous vous recontacterons.`:s==='moved'&&r.movedTo?`Bonjour ${r.name}, ici ${cn}. Votre rendez-vous est reporté au ${fd(r.movedTo.date)} à ${r.movedTo.time}.`:`Bonjour ${r.name}, ici ${cn}. Nous vous confirmons votre rendez-vous le ${fd(r.date)} à ${r.time}.`,
  B=(a,c,i,l)=>`<button class="${c}" data-a=${a} data-s="${r.sid}">${ico(i)}${l}</button>`;
  const info=s==='moved'&&r.movedTo?`<div class="note mv">↪ Reporté au <b>${esc(fd(r.movedTo.date,{weekday:'short',day:'numeric',month:'short'}))} à ${esc(r.movedTo.time)}</b></div>`:s==='todo'&&r.movedFrom?`<div class="note mv">↪ Reporté depuis le ${esc(fd(r.movedFrom.date,{day:'numeric',month:'short'}))} à ${esc(r.movedFrom.time)}</div>`:'';
  const why=r.reason?`<div class=note>${s==='cancel'?"Motif d'annulation : ":'Raison du report : '}${esc(r.reason)}</div>`:'';
  const mini=s==='todo'?`<div class=mini3>${B('done','ok2','check','Terminé')}${B('rp','mv2','undo','Reporter')}${B('cn','dl','x','Annuler')}</div><div class=mini2>${B('edit','','edit','Modifier')}${B('del','dl','trash','Supprimer')}</div>`
    :s==='done'?`<div class=mini>${B('todo','','undo','À recevoir')}${B('edit','','edit','Modifier')}${B('del','dl','trash','Supprimer')}</div>`
    :s==='cancel'?`<div class=mini2>${B('todo','ok2','undo','Rétablir')}${B('del','dl','trash','Supprimer')}</div>`:`<div class=mini2>${B('del','dl','trash','Supprimer')}</div>`;
  const op=OPEN.has(r.sid),tg=`data-a=ctog data-s="${r.sid}"`;
  return`<article class="rc ${s}${op?' open':''}" style="--c:${s==='todo'||s==='done'?u.c:ST[s].c}"><div class=rt ${tg}><b>${r.time}</b><small>${dur(d)}</small></div><div class=rb>
  <div class=rcl ${tg} role=button tabindex=0 aria-expanded="${op}"><div class=rn><h4>${esc(r.name)}</h4>${s==='todo'?`<span class=tag><i></i>${u.l}</span>`:`<span class=tag><i></i>${ST[s].l.replace(/s$/,'')}</span>`}</div><div class=ph>${esc(r.phone)}</div>${chev(op)}</div>${info}
  ${op?`<div class=rx>${r.note?`<div class=note><b>Motif :</b> ${esc(r.note)}</div>`:''}${r.perso?`<div class="note pv">🔒 Note personnelle : ${esc(r.perso)}</div>`:''}${why}
  <div class=acts><a class="act call${tel?'':' off'}" href="tel:+${tel}">${ico('phone')}Appeler</a><a class="act wa${wa?'':' off'}" href="https://wa.me/${wa}?text=${encodeURIComponent(t0)}" target=_blank rel=noopener>${ico('chat')}WhatsApp</a></div>${mini}</div>`:''}</div></article>`}
/* --- changement de statut, annuler, reporter --- */
async function setS(sid,st,x){const r=S.rdv.find(y=>y.sid===sid);if(!r)return;
  if(st==='todo'&&stOf(r)==='cancel'&&!cfg().multi&&busy(r.date,r.time,sid).length)return toast('Ce créneau est déjà pris : reportez ce rendez-vous à une autre date.');
  try{await DB.patch(sid,{status:st,done:st==='done',reason:'',...x});toast({done:'Client terminé',todo:'Remis à recevoir',cancel:'Rendez-vous annulé'}[st])}catch{toast('Erreur, réessayez')}}
let RP=null,CNS=null;
function rpHtml(){const r=S.rdv.find(x=>x.sid===RP.sid),all=slots(),d=RP.date,cl=dayClosed(d);
  return`<h3>Reporter le rendez-vous</h3><ul class=facts><li><span>Client</span><b>${esc(r.name)}</b></li><li><span>Actuellement</span><b>${esc(fd(r.date,{weekday:'short',day:'numeric',month:'short'}))} à ${r.time}</b></li></ul>
  <label class=lbl>Nouvelle date<input type=date data-rp=date value="${d}" min="${today()}"></label>
  ${cl?'<div class="box warn">Ce jour est bloqué. Choisissez une autre date.</div>':`<div class=lbl style="margin-top:6px">Nouvelle heure ${RP.time?'<b>('+RP.time+')</b>':''}</div><div class="slots tp">${all.map(t=>{const bl=!okSlot(d,t,r);return`<button class="slot${RP.time===t?' sel':''}" ${bl?'disabled':`data-a=rpt data-t="${t}"`}>${t}</button>`}).join('')}</div><label class=lbl style="margin-top:8px">Ou une heure précise (ex : 17:30)<input type=time data-rp=time value="${RP.time||''}"></label>`}
  <textarea data-rp=reason placeholder="Raison du report (facultatif)" style="margin:10px 0">${esc(RP.reason)}</textarea>
  <button class="btn gold big" data-a=rpgo ${RP.time?'':'disabled'}>Confirmer le report</button><button class="btn ghost big" data-a=close>Fermer</button>`}
const pastT=(d,t)=>{const n=new Date();return d===today()&&t2m(t)<=n.getHours()*60+n.getMinutes()};
const okSlot=(d,t,r)=>{const D=+r.dur||undefined;return !isBlocked(d,t,D)&&(cfg().multi||!busy(d,t,r.sid,D).length)&&!(d===r.date&&t===r.time)&&!pastT(d,t)};
const doneModal=(h,r,t)=>modal(`<h3>${h}</h3><p>Voulez-vous prévenir le client ?</p><a class="btn gold big act wa" style="text-decoration:none;display:flex;justify-content:center" href="${waLink(r,t)}" target=_blank rel=noopener>${ico('chat')}Envoyer sur WhatsApp</a><button class="btn ghost big" data-a=close>Fermer</button>`);
Object.assign(A,{
  done(d){setS(d.s,'done')},todo(d){setS(d.s,'todo')},
  cn(d){const r=S.rdv.find(x=>x.sid===d.s);if(!r)return;CNS=d.s;modal(`<h3>Annuler ce rendez-vous ?</h3><ul class=facts><li><span>Client</span><b>${esc(r.name)}</b></li><li><span>Date</span><b>${esc(fd(r.date,{weekday:'short',day:'numeric',month:'short'}))} à ${r.time}</b></li></ul><textarea id=cnr placeholder="Motif d'annulation (facultatif)" style="margin-bottom:10px"></textarea><button class="btn danger big" data-a=cngo>Oui, annuler</button><button class="btn ghost big" data-a=close>Non, garder</button>`)},
  async cngo(){const r=S.rdv.find(x=>x.sid===CNS),why=($('#cnr')||{value:''}).value.trim();if(!r)return;closeModal();await setS(r.sid,'cancel',{reason:why});
    doneModal('Rendez-vous annulé',r,`Bonjour ${r.name}, ici ${cfg().name}. Votre rendez-vous du ${fd(r.date)} à ${r.time} est annulé.`+(why?' Motif : '+why+'.':'')+' Nous restons à votre disposition.')},
  rp(d){const r=S.rdv.find(x=>x.sid===d.s);if(!r)return;const dt=r.date>today()?r.date:today();RP={sid:d.s,date:dt,time:null,reason:''};if(okSlot(dt,r.time,r))RP.time=r.time;modal(rpHtml())},
  rpt(d){RP.time=d.t;modal(rpHtml())},
  async rpgo(){const r=S.rdv.find(x=>x.sid===(RP&&RP.sid));if(!r||!RP.time)return;const{date,time,reason}=RP;
    if(!okSlot(date,time,r))return toast("Ce créneau n'est plus libre. Choisissez-en un autre.");
    const base=date+'_'+time;let sid=base,k=2;while(S.rdv.some(x=>x.sid===sid))sid=base+'~'+k++;
    const{movedTo,...rest}=r,n={...rest,sid,date,time,status:'todo',done:false,movedFrom:{date:r.date,time:r.time},reason:reason.trim(),created:Date.now()};
    try{await DB.add(n);await DB.patch(r.sid,{status:'moved',done:false,movedTo:{date,time},reason:reason.trim()})}catch{return toast('Erreur, réessayez')}
    closeModal();RP=null;toast('Rendez-vous reporté');
    doneModal('Rendez-vous reporté',n,`Bonjour ${r.name}, ici ${cfg().name}. Votre rendez-vous du ${fd(r.date)} à ${r.time} est reporté au ${fd(date)} à ${time}.`+(reason.trim()?' Raison : '+reason.trim()+'.':'')+' Merci de votre compréhension.')},
  pfold(){P.pOpen=!P.pOpen;render()},ppre(d){setPre(d.k);render()}});
/* --- rappels : 1 ou 2 fois par rendez-vous --- */
const sys=(t,b)=>{try{if(window.Notification&&Notification.permission==='granted'&&navigator.serviceWorker)navigator.serviceWorker.ready.then(g=>g.showNotification(t,{body:b,icon:'icons/icon-192.png',badge:'icons/icon-192.png',tag:t+b}))}catch{}};
function checkNotifs(){
  if(!S.ready||!user)return;
  const c=cfg(),m=c.remind||'both',rm=+c.remMin||60,f=nfl(),now=new Date(),td=today(),tm=iso(add(now,1)),mins=now.getHours()*60+now.getMinutes(),lv=new Set(S.rdv.map(r=>r.sid));let ch=false;
  Object.keys(f).forEach(k=>{if(!lv.has(k.split('|')[0])){delete f[k];ch=true}});
  const T=S.rdv.filter(r=>stOf(r)==='todo'),push=(t,b)=>{NT.push({t,m:b});sys(t,b)};
  if(m==='both'||m==='day'){const j1=T.filter(r=>r.date===tm&&!f[r.sid+'|j1']&&Date.now()-(+r.created||0)>2*36e5).sort((a,b)=>a.time.localeCompare(b.time));
    if(j1.length){j1.forEach(r=>{f[r.sid+'|j1']=Date.now()});ch=true;push(j1.length>1?'Demain : '+j1.length+' rendez-vous':'Demain : 1 rendez-vous',j1.slice(0,5).map(r=>r.name+' à '+r.time).join(' · ')+(j1.length>5?' …':''))}}
  if(m==='both'||m==='soon')T.filter(r=>r.date===td&&!f[r.sid+'|j0']).forEach(r=>{const diff=t2m(r.time)-mins;
    if(diff<=rm&&diff>=-15){f[r.sid+'|j0']=Date.now();ch=true;push('Rendez-vous bientôt',r.name+' à '+r.time+(diff>0?' (dans '+diff+' min)':' (maintenant)'))}});
  if(ch){try{localStorage.agenda_notifs=JSON.stringify(f)}catch{}if(NT.length>6)NT=NT.slice(-6);refresh()}}
/* --- réglages (enregistrer ≠ sauvegarder) --- */
const REM=[['both','La veille + peu avant'],['day','La veille seulement'],['soon','Peu avant seulement'],['off','Aucun']];
function setView(){const c=cfg(),sl=+c.slot,rm=c.remind||'both',np=window.Notification?Notification.permission:'none';
  return`${vcCard()}<section class=card><h2>Réglages</h2><label class=lbl>Nom de l'entreprise<input id=sn data-cs value="${esc(c.name)}"></label>
  <div class=row><label class=lbl>Ouverture<input type=time id=so data-cs value="${tv(c.open)}"></label><label class=lbl>Fermeture<input type=time id=scl data-cs value="${tv(c.close)}"></label></div>
  <p class=hint style="margin:0 0 12px">Pour fermer à minuit, mettez 00:00. Ouverture 00:00 et fermeture 00:00 = 24 h sur 24.</p>
  <label class=lbl>Durée d'un rendez-vous : tapez le nombre de minutes<span class=unit><input type=number id=sl data-cs inputmode=numeric min=5 max=1440 step=1 value="${sl}"><b>min</b></span></label>
  <div class=lbl style="margin-top:6px">Ou touchez un raccourci</div><div class=qd>${[15,30,45,60,90,120,180].map(x=>`<button class="pill qs${sl===x?' sel':''}" data-a=setslot data-m=${x}>${x}</button>`).join('')}</div><p class=hint id=pv></p>
  <label class=chk><input type=checkbox id=smulti data-cs ${c.multi?'checked':''}> Autoriser plusieurs rendez-vous à la même heure</label>
  <h3 class=sh>Rappels des rendez-vous</h3><div class=qd id=srem data-v="${rm}">${REM.map(([k,l])=>`<button class="pill rem${rm===k?' sel':''}" data-a=setrem data-v=${k}>${l}</button>`).join('')}</div>
  <label class=lbl>Rappel « peu avant » : combien de minutes avant ?<span class=unit><input type=number id=srm data-cs inputmode=numeric min=5 max=1440 value="${+c.remMin||60}"><b>min</b></span></label>
  <div id=cfgstat></div><button class="btn gold big" data-a=savecfg>Enregistrer les réglages</button></section>
  <section class=card><h2>Notifications du téléphone</h2><p class=hint>Les rappels s'affichent dans l'application. Activez aussi les notifications pour les recevoir comme alertes quand l'application est ouverte ou en arrière-plan. Si elle est complètement fermée, aucun rappel ne peut apparaître.</p>${np==='granted'?'<div class="box ok">✓ Notifications activées</div>':np==='denied'?'<div class="box warn">Notifications bloquées : autorisez-les dans les réglages du navigateur.</div>':np==='none'?'<p class=hint>Non disponibles sur ce navigateur.</p>':'<button class="btn gold big" data-a=notif>Activer les notifications</button>'}</section>
  ${bkCard()}${DB.mode==='firebase'?`<section class=card><h2>Compte</h2><p class=hint>Connecté : ${esc(user.email||'')}</p><button class="btn ghost sm" data-a=logout>Se déconnecter</button></section>`:''}`}
function pvUpdate(){const o=$('#so'),c=$('#scl'),s=$('#sl'),p=$('#pv');if(!o||!c||!s||!p)return;
  const sl=+s.value,om=t2m(o.value||'08:00'),cm=t2m(tz(c.value||'18:00'));
  document.querySelectorAll('.qs').forEach(b=>b.classList.toggle('sel',+b.dataset.m===sl));
  if(!(sl>=5)||cm<=om)p.textContent='Vérifiez les horaires et la durée (5 minutes minimum).';
  else{const n=Math.floor((cm-om)/sl);p.textContent=n?`${n} créneau${n>1?'x':''} par jour : le premier à ${m2t(om)}, le dernier à ${m2t(om+(n-1)*sl)}.`:"La durée est plus longue que la journée d'ouverture."}
  const g=cfg(),dirty=($('#sn').value.trim()||g.name)!==g.name||o.value!==tv(g.open)||tz(c.value)!==g.close||sl!==+g.slot||$('#smulti').checked!==!!g.multi||$('#srem').dataset.v!==(g.remind||'both')||+$('#srm').value!==(+g.remMin||60);
  $('#cfgstat').innerHTML=dirty?'<div class="stat warn">● Modifications non enregistrées</div>':`<div class="stat ok">${g.saved?'✓ Réglages enregistrés · '+esc(fmtDT(g.saved)):'✓ Réglages par défaut en cours'}</div>`}
function bkCard(){if(DB.mode!=='demo')return'';const t=+localStorage[BK.last]||0,un=!!localStorage.getItem(BK.undo);
  return`<section class=card><h2>Sauvegarde et restauration</h2><div class="box ok">✓ Tout ce que vous enregistrez (rendez-vous, notes écrites ou vocales, réglages) reste enregistré sur ce téléphone, sans rien télécharger.</div>
  <ul class=facts><li><span>Rendez-vous enregistrés</span><b>${S.rdv.length}</b></li><li><span>Notes enregistrées</span><b>${S.notes.length}</b></li><li><span>Dernier fichier de sauvegarde</span><b>${t?esc(fmtDT(t)):'Aucun'}</b></li></ul>
  <button class="btn gold big" data-a=bkSave>Sauvegarder : télécharger le fichier</button><button class="btn ghost big" data-a=bkRestore>Restaurer ma sauvegarde</button>${un?'<button class="btn ghost big" data-a=bkUndo>Annuler la dernière restauration</button>':''}
  <p class=hint style="margin:10px 0 0">Le fichier contient tous les rendez-vous (avec leur statut), toutes les notes et les réglages. Gardez-le sur Google Drive ou votre ordinateur pour le restaurer sur un autre téléphone.</p></section>`}
Object.assign(A,{setrem(d){$('#srem').dataset.v=d.v;document.querySelectorAll('.rem').forEach(b=>b.classList.toggle('sel',b.dataset.v===d.v));pvUpdate()},
  notif(){try{Notification.requestPermission().then(()=>render())}catch{}},
  async savecfg(){const c=cfg(),o=$('#so').value,cl=tz($('#scl').value),sl=Math.round(+$('#sl').value),rn=Math.round(+$('#srm').value);
    if(!o||!cl||t2m(cl)<=t2m(o))return toast("Vérifiez les horaires (la fermeture doit être après l'ouverture)");
    if(!(sl>=5&&sl<=1440))return toast('Entrez une durée en minutes (5 minimum)');
    if(!(rn>=5&&rn<=1440))return toast('Entrez le délai du rappel en minutes (5 minimum)');
    Object.assign(c,{name:$('#sn').value.trim()||c.name,open:o,close:cl,slot:sl,multi:$('#smulti').checked,remind:$('#srem').dataset.v,remMin:rn,saved:Date.now()});
    try{await DB.setCfg(c);toast('Réglages enregistrés sur ce téléphone');render()}catch{toast('Erreur, réessayez')}}});
const _cr=cleanRdv0,_cc=cleanCfg0;
function cleanRdv(r){const c=_cr(r);if(!c)return null;const s=ST[r.status]?r.status:(c.done?'done':'todo');c.status=s;c.done=s==='done';c.perso=txt(r.perso,1000);c.reason=txt(r.reason,500);
  ['movedFrom','movedTo'].forEach(k=>{const m=r[k];if(m&&okDate(m.date)&&okTime(m.time,false))c[k]={date:m.date,time:m.time}});return c}
function cleanCfg(c){const o=_cc(c);if(c&&['both','day','soon','off'].includes(c.remind))o.remind=c.remind;const m=Math.round(+(c&&c.remMin));if(m>=5&&m<=1440)o.remMin=m;const sv=+(c&&c.saved);if(sv>0)o.saved=sv;return o}
/* --- bloc-notes : catégories, couleurs, favoris, épingles, enregistrement automatique --- */
const NC={violet:['#ede9fe','#7c3aed'],bleu:['#dbeafe','#2563eb'],rose:['#fce7f3','#db2777'],vert:['#dcfce7','#16a34a'],jaune:['#fef9c3','#ca8a04'],orange:['#ffedd5','#ea580c']};
Object.assign(N,{cat:'',color:'',fav:false,pin:false,ed:false,fc:'',co:false,cfo:false});
const nReset=()=>{N={...N,...blankN(),cat:'',color:'',fav:false,pin:false,ed:false,co:false}};
function cleanNotes(a){const seen=new Set();return a.map((n,i)=>{if(!n||typeof n!=='object')return null;const title=txt(n.title,100),text=txt(n.text,5000);if(!title&&!text)return null;
  let id=String(n.id==null?'':n.id).replace(/[^\w-]/g,'').slice(0,40);if(!id||seen.has(id))id='n'+Date.now().toString(36)+'_'+i;seen.add(id);const cr=+n.created,up=+n.updated;
  return{id,title,date:okDate(n.date)?n.date:today(),text,cat:txt(n.cat,40),color:NC[n.color]?n.color:'',fav:n.fav===true,pin:n.pin===true,created:Number.isFinite(cr)&&cr>0?cr:Date.now(),updated:Number.isFinite(up)&&up>0?up:Date.now()}}).filter(Boolean)}
const noteCats=()=>[...new Set(S.notes.map(n=>n.cat).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
const catLbl=()=>N.fc==='*'?'★ Favoris':N.fc||'Toutes les notes';
function catFilter(){return`<section class="card catcard"><button class=fold data-a=ncfold aria-expanded="${N.cfo}"><h2>Catégories</h2><span class=hint><b>${esc(catLbl())}</b> ${chev(N.cfo)}</span></button>
  <div class=cl id=ncl ${N.cfo?'':'hidden'}><button class="cli${!N.fc?' sel':''}" data-a=nfc data-c="">Toutes les notes</button><button class="cli${N.fc==='*'?' sel':''}" data-a=nfc data-c="*">★ Favoris</button>${noteCats().map(c=>`<button class="cli${N.fc===c?' sel':''}" data-a=nfc data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div></section>`}
const nFilt=()=>{const q=norm(N.q).trim();return S.notes.filter(n=>(!N.from||n.date>=N.from)&&(!N.to||n.date<=N.to)&&(!q||norm(n.title+' '+n.text+' '+(n.cat||'')).includes(q))&&(!N.fc||(N.fc==='*'?n.fav:n.cat===N.fc))).slice().sort((a,b)=>(b.pin?1:0)-(a.pin?1:0)||b.date.localeCompare(a.date)||b.created-a.created)};
const nb=(a,n,i,c)=>`<button class="ib${c}" data-a=${a} data-id="${esc(n.id)}" aria-label="${a}">${ico(i)}</button>`;
const nCard2=n=>{const c=NC[n.color];return`<article class="nc" style="${c?`background:${c[0]};border-left-color:${c[1]}`:''}" data-a=nedit data-id="${esc(n.id)}"><div class=nh2><b>${n.pin?'📌 ':''}${esc(n.title)||'Sans titre'}</b><span class=hint>${esc(fd(n.date,{day:'numeric',month:'short',year:'numeric'}))}</span></div>${n.cat?`<span class=badge>${esc(n.cat)}</span>`:''}${n.text?`<div class="nt clamp">${esc(n.text)}</div>`:''}<div class=nbtn>${nb('nfav2',n,'star',n.fav?' on fav':'')}${nb('npin2',n,'pin',n.pin?' on pin':'')}${nb('nedit',n,'edit','')}${nb('ndel',n,'trash',' dl')}</div></article>`};
const nListHtml2=()=>{const L=nFilt();return L.length?L.map(nCard2).join(''):`<div class=empty>${S.notes.length?'Aucune note pour ce filtre.':'Aucune note pour l\'instant. Touchez « Nouvelle note ».'}</div>`};
const nCount2=()=>{const n=nFilt().length;return n+' note'+sx(n)+(n!==S.notes.length?' sur '+S.notes.length:'')};
function updNotesList(){const l=$('#nl');if(l)l.innerHTML=nListHtml2();const c=$('#ncount');if(c)c.textContent=nCount2()}
function noteEditor(){return`<section class=card><h2>${N.old?'Modifier la note':'Nouvelle note'}</h2>
  <div class=row><label class=lbl>Titre<input data-nf=title value="${esc(N.title)}" placeholder="Ex : Tissus à commander" maxlength=100 autocomplete=off></label><label class=lbl>Date<input type=date data-nf=date value="${esc(N.date)}"></label></div>
  <div class=lbl>Catégorie</div><button class="fold catb" data-a=ncatfold aria-expanded="${N.co}"><span id=ncatl>${esc(N.cat)||'Choisir une catégorie'}</span>${chev(N.co)}</button>
  <div class=cl id=ncatp ${N.co?'':'hidden'}><button class="cli${N.cat?'':' sel'}" data-a=ncatpick data-c="">Aucune catégorie</button>${noteCats().map(c=>`<button class="cli${N.cat===c?' sel':''}" data-a=ncatpick data-c="${esc(c)}">${esc(c)}</button>`).join('')}<input data-nf=cat value="${esc(N.cat)}" placeholder="Ou tapez une nouvelle catégorie" maxlength=40 autocomplete=off></div>
  <div class=lbl>Couleur de la note</div><div class=sw><button class="sw0${N.color?'':' sel'}" data-a=ncol data-c="" aria-label="Sans couleur">∅</button>${Object.entries(NC).map(([k,v])=>`<button class="${N.color===k?'sel':''}" style="background:${v[0]};border-color:${v[1]}" data-a=ncol data-c=${k} aria-label="${k}"></button>`).join('')}</div>
  <div class=nact><button class="btn ghost tg${N.fav?' on fav':''}" data-a=nfavE>${ico('star')}Favori</button><button class="btn ghost tg${N.pin?' on pin':''}" data-a=npinE>${ico('pin')}Épingler</button></div>
  <textarea id=ntx data-nf=text maxlength=5000 placeholder="Écrivez votre note ou touchez Dicter…" style="margin-top:10px">${esc(N.text)}</textarea>
  <div class=nact><button class="btn ${N.rec?'rec':'ghost'}" data-a=nmic>${ico('mic')}${N.rec?'Arrêter':'Dicter'}</button><button class="btn gold" data-a=nsave>Enregistrer</button><button class="btn ghost" data-a=ncancel>Fermer</button></div>
  ${N.rec?'<p class=hint style="margin:8px 0 0">Parlez maintenant. Touchez « Arrêter » : la note est enregistrée.</p>':''}<p class=hint id=nstat style="margin:8px 0 0">Enregistrement automatique pendant que vous écrivez.</p></section>`}
function notesView(){
  if(DB.mode!=='demo')return`<section class=card><h2>Bloc-notes</h2><p class=hint>Le bloc-notes fonctionne uniquement avec l'enregistrement sur ce téléphone.</p></section>`;
  const act=!!(N.from||N.to);
  return`<section class="card nsearch"><div class=srow><input data-nf=q value="${esc(N.q)}" placeholder="Rechercher une note" autocomplete=off><button class="fbtn${act?' on':''}" data-a=nfold aria-expanded="${N.fo}">${ico('filter')}<span>Date</span>${chev(N.fo)}</button></div>
  <div id=nfp ${N.fo?'':'hidden'} style="margin-top:10px"><div class=qd><button class=pill data-a=nper data-k=today>Aujourd'hui</button><button class=pill data-a=nper data-k=w7>7 jours</button><button class=pill data-a=nthis>Ce mois</button><button class=pill data-a=nall>Tout voir</button></div>
  <div class=mh style="margin-bottom:8px"><button class="btn ghost sm" data-a=nmon data-n=-1 aria-label="Mois précédent">‹</button><b class=cap>${esc(nLabel())}</b><button class="btn ghost sm" data-a=nmon data-n=1 aria-label="Mois suivant">›</button></div>
  <div class=row><label class=lbl>Du<input type=date data-nf=from value="${esc(N.from)}"></label><label class=lbl>Au<input type=date data-nf=to value="${esc(N.to)}"></label></div></div></section>
  ${catFilter()}
  ${N.ed?noteEditor():'<button class="btn gold big" data-a=nnew>＋ Nouvelle note</button>'}
  <section class="card nlistc"><div class=nh><h2>Mes notes</h2><span class=hint id=ncount>${nCount2()}</span></div><div class=nlist id=nl>${nListHtml2()}</div></section>`}
async function persistNote(){const title=N.title.trim(),text=N.text.trim(),old=N.old&&S.notes.find(x=>x.id===N.old),now=Date.now(),
  note={id:N.old||'n'+now.toString(36)+Math.random().toString(36).slice(2,6),title:(title||text.split(/\s+/).slice(0,6).join(' ')).slice(0,100),date:okDate(N.date)?N.date:today(),text:text.slice(0,5000),cat:N.cat.trim().slice(0,40),color:NC[N.color]?N.color:'',fav:!!N.fav,pin:!!N.pin,created:old?old.created:now,updated:now};
  try{await DB.putNote(note);N.old=note.id;return true}catch{toast("La note n'a pas pu être enregistrée (espace insuffisant ?)");return false}}
let AT=0;
async function autoP(){if(!(N.title.trim()||N.text.trim()))return;if(await persistNote()){const s=$('#nstat');if(s)s.textContent='✓ Enregistré automatiquement à '+new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});updNotesList()}}
async function saveNote(auto){if(!(N.title.trim()||N.text.trim()))return toast('Écrivez ou dictez une note');clearTimeout(AT);if(!await persistNote())return;
  if(auto){toast('Note vocale enregistrée');render();return}nReset();toast('Note enregistrée');render()}
Object.assign(A,{nnew(){nReset();N.ed=true;render()},
  async ncancel(){clearTimeout(AT);if(N.title.trim()||N.text.trim())await persistNote();nReset();render()},
  nedit(d){const n=S.notes.find(x=>x.id===d.id);if(!n)return;N={...N,old:n.id,title:n.title,date:n.date,text:n.text,cat:n.cat||'',color:n.color||'',fav:!!n.fav,pin:!!n.pin,ed:true};render();const s=$('#sc');if(s)s.scrollTop=0},
  async ndel(d){const n=S.notes.find(x=>x.id===d.id);if(!n||!confirm('Supprimer la note « '+(n.title||'Sans titre')+' » ?'))return;try{await DB.delNote(d.id);if(N.old===d.id)nReset();toast('Note supprimée');render()}catch{toast('Erreur, réessayez')}},
  async nfav2(d){const n=S.notes.find(x=>x.id===d.id);if(n){await DB.putNote({...n,fav:!n.fav,updated:Date.now()});toast(n.fav?'Retirée des favoris':'Ajoutée aux favoris')}},
  async npin2(d){const n=S.notes.find(x=>x.id===d.id);if(n){await DB.putNote({...n,pin:!n.pin,updated:Date.now()});toast(n.pin?'Note désépinglée':'Note épinglée en haut')}},
  nfavE(){N.fav=!N.fav;render();autoP()},npinE(){N.pin=!N.pin;render();autoP()},ncol(d){N.color=d.c;render();autoP()},nfc(d){N.fc=d.c;render()},ncfold(){N.cfo=!N.cfo;render()},ncatfold(){N.co=!N.co;render()},ncatpick(d){N.cat=d.c;render();autoP()},ctog(d){OPEN.has(d.s)?OPEN.delete(d.s):OPEN.add(d.s);render()},
  nper(d){const t=today(),n=new Date();const R={today:[t,t],w7:[iso(add(n,-6)),t]}[d.k];N.mon=null;N.from=R[0];N.to=R[1];render()}});
/* --- écouteurs : filtre période, report, enregistrement automatique des notes, réglages --- */
document.addEventListener('input',e=>{const t=e.target,ds=t.dataset||{};
  if(ds.p==='pq'){P.pq=t.value;const l=$('#pl');if(l)l.innerHTML=pBody()}
  if(ds.rp==='reason'&&RP)RP.reason=t.value;
  if(ds.nf==='cat'){const l=$('#ncatl');if(l)l.textContent=N.cat||'Choisir une catégorie'}
  if(ds.nf==='title'||ds.nf==='text'||ds.nf==='cat'){clearTimeout(AT);AT=setTimeout(autoP,900)}
  if('cs' in ds)pvUpdate()});
document.addEventListener('change',e=>{const t=e.target,ds=t.dataset||{};
  if(ds.p==='pf'||ds.p==='pt'){P[ds.p]=t.value;P.pre='';if(P.pf&&P.pt&&P.pt<P.pf){ds.p==='pf'?P.pt=P.pf:P.pf=P.pt}render()}
  if(ds.rp==='time'&&RP){RP.time=t.value&&okTime(t.value,false)?t.value:null;modal(rpHtml())}
  if(ds.rp==='date'&&RP&&t.value){const o=S.rdv.find(x=>x.sid===RP.sid);RP.date=t.value;RP.time=o&&okSlot(t.value,o.time,o)?o.time:null;modal(rpHtml())}
  if('cs' in ds)pvUpdate()});
function render(){if(!DB)return;if(!user)return loginView();const c=cfg();document.title=c.name+' – Agenda';
  const old=$('#sc'),y=old&&lastTab===P.tab?old.scrollTop:0;lastTab=P.tab;const IN=['#tpanel','#ncl','#ncatp'],ky=IN.map(q=>{const e=$(q);return e?e.scrollTop:0});
  const tabs=[['agenda','Agenda'],['notes','Notes'],['add','Ajouter'],['block','Bloquer'],['set','Réglages']];
  const v={agenda:agendaView,notes:notesView,add:addView,block:blockView,set:setView}[P.tab](),nm=esc(c.name).replace(/^(ven)(.*)$/i,'$1<span>$2</span>');
  $('#app').innerHTML=`<header class=top><img src="icons/icon-192.png" alt=""><div><div class=brand>${nm}</div><div class=sub>Agenda des rendez-vous</div></div>${instBtn()}</header>${ntHtml()}
  <main class="wrap${P.tab==='notes'?' fill':''}" id=sc>${P.tab==='set'||P.tab==='notes'?'':`<div id=inst>${bkHtml()}</div>`}${v}</main>
  <nav class=bnav>${tabs.map(([k,l])=>`<button class="n-${k}${k==='add'?' plus':''}${P.tab===k?' sel':''}" data-a=tab data-t=${k} aria-label="${l}"><span class=ni>${ico(k)}</span><span class=nl>${l}</span></button>`).join('')}</nav>`;
  $('#sc').scrollTop=y;IN.forEach((q,i)=>{const e=$(q);if(e&&ky[i])e.scrollTop=ky[i]});P.tY=null;if(P.tab==='set')pvUpdate()}

(async function boot(){
  DB=Local;
  if(C.firebase){try{const b='https://www.gstatic.com/firebasejs/10.12.2/firebase-';await loadJs(b+'app-compat.js');await loadJs(b+'firestore-compat.js');await loadJs(b+'auth-compat.js');DB=FB}catch{toast('Connexion impossible : mode local')}}
  if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
  try{if(navigator.storage&&navigator.storage.persist&&!/firefox/i.test(navigator.userAgent))Promise.resolve(navigator.storage.persist()).catch(()=>{})}catch{}
  DB.init(refresh);checkNotifs();setInterval(()=>{refresh();checkNotifs()},60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkNotifs()})})();