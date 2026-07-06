import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getAccounts, SUPER_ADMIN_EMAIL } from './Login';
import { collection, query, where, orderBy, onSnapshot, doc, setDoc, getDoc, getDocs, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref as sRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { GENRES } from '../data/books';
const PageEditorPanel   = lazy(() => import('./admin-panels/PageEditorPanel'));
const DesignStudioPanel = lazy(() => import('./admin-panels/DesignStudioPanel'));
const SecurityPanel     = lazy(() => import('./admin-panels/SecurityPanel'));
const PluginsPanel      = lazy(() => import('./admin-panels/PluginsPanel'));
const GodModePanel      = lazy(() => import('./admin-panels/GodModePanel'));
const IntegrationsPanel = lazy(() => import('./admin-panels/IntegrationsPanel'));
const MessagesPanel     = lazy(() => import('./admin-panels/MessagesPanel'));
const LiveChatPanel     = lazy(() => import('./admin-panels/LiveChatPanel'));
const ReportsPanel      = lazy(() => import('./admin-panels/ReportsPanel'));
const ReviewsPanel      = lazy(() => import('./admin-panels/ReviewsPanel'));
const EmailPanel        = lazy(() => import('./admin-panels/EmailPanel'));
const NewsletterPanel   = lazy(() => import('./admin-panels/NewsletterPanel'));
const VisitorsPanel     = lazy(() => import('./admin-panels/VisitorsPanel'));
const ActivityPanel     = lazy(() => import('./admin-panels/ActivityPanel'));
const SMSPanel          = lazy(() => import('./admin-panels/SMSPanel'));
const ChatSettingsPanel = lazy(() => import('./admin-panels/ChatSettingsPanel'));
const PaymentFeesPanel  = lazy(() => import('./admin-panels/PaymentFeesPanel'));

const PanelLoader = () => (
  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', flexDirection:'column', gap:12 }}>
    <div style={{ width:32, height:32, border:'3px solid rgba(201,168,76,0.2)', borderTop:'3px solid var(--gold)', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
    <span style={{ color:'var(--muted)', fontSize:'0.82rem' }}>Loading panel…</span>
  </div>
);
import './Admin.css';

const EMPTY_BOOK = {
  id: '', title: '', subtitle: '', author: 'Elijah Mwangi M', cover: null, coverType: 'styled',
  coverColor: 'linear-gradient(145deg,#0f0f22,#1a1a3a)', coverAccent: '#c9a84c',
  genre: 'Drama', genres: [], type: 'novel', price: 250, pages: 0, rating: 5.0, reviews: 0,
  inspired: true, inspiredNote: '', excerpt: '', description: '',
  featured: false, isNew: true,
  status: 'complete',
  chaptersReleased: 0,
  totalChapters: 0,
  chapterCount: 0,
  setting: '', audienceRating: '',
  themes: [], ratingQuote: '', authorNote: '', tableOfContents: [],
  date: new Date().toISOString().slice(0, 10), readTime: '5 hrs',
  expectedDate: '',
  driveUrl: '', chapters: [],
};

const BOOK_STATUSES = [
  { value:'complete',     label:'✅ Complete',       color:'#2ecc71', bg:'rgba(46,204,113,0.12)',  desc:'Fully published, all content available'   },
  { value:'ongoing',      label:'📖 Ongoing',        color:'#4a9eff', bg:'rgba(74,158,255,0.12)',  desc:'Releasing in chapters / being written'     },
  { value:'premium',      label:'⭐ Premium',         color:'#c9a84c', bg:'rgba(201,168,76,0.12)',  desc:'Exclusive paid content, no free preview'   },
  { value:'free-preview', label:'👀 Free Preview',    color:'#a855f7', bg:'rgba(168,85,247,0.12)',  desc:'First chapters free, rest requires purchase'},
  { value:'coming-soon',  label:'🔜 Coming Soon',     color:'#e8832a', bg:'rgba(232,131,42,0.12)',  desc:'Announced, not yet available'              },
  { value:'limited',      label:'⏳ Limited Edition', color:'#e74c3c', bg:'rgba(231,76,60,0.12)',   desc:'Available for a limited time only'         },
  { value:'draft',        label:'📝 Draft',           color:'#64748b', bg:'rgba(100,116,139,0.12)', desc:'Work in progress — not shown publicly'     },
];

// buildUserList — pulls from Firestore-synced localStorage + registered users
// BASE_ACCOUNTS removed — no hardcoded test users
function buildUserList(suspendedList = []) {
  const deleted    = JSON.parse(localStorage.getItem('eh_deleted_users')    || '[]');
  const roleChanges= JSON.parse(localStorage.getItem('eh_role_overrides')   || '{}');
  const registered = JSON.parse(localStorage.getItem('eh_registered_users') || '[]');
  const legacySusp = JSON.parse(localStorage.getItem('eh_suspended_users')  || '[]');
  const suspended  = [...new Set([...suspendedList, ...legacySusp])];
  // Only the super admin as a known built-in account
  const adminEntry = [{ id:'admin01', name:'Admin', email: SUPER_ADMIN_EMAIL, role:'superadmin', joined:'', books:0 }];
  const all = adminEntry
    .filter(a => !deleted.includes(a.email.toLowerCase()))
    .map(a => ({ ...a, role:roleChanges[a.email.toLowerCase()]||a.role, status:suspended.includes(a.email.toLowerCase())?'Suspended':'Active' }));
  registered.forEach(r => {
    const email = (r.email||'').toLowerCase();
    if (deleted.includes(email)) return;
    if (all.find(u => u.email.toLowerCase()===email)) return;
    all.push({ id:r.id, name:r.name, email:r.email, role:roleChanges[email]||r.role||'user', joined:r.joined||'', books:0, status:suspended.includes(email)?'Suspended':'Active' });
  });
  return all;
}

const MOCK_REVIEWS_INIT = [
  { id:'r1', user:'Amina Njeri',   book:'Marriage Is a Scam', rating:5, text:'Absolutely gripping. Read it in one sitting.',          date:'2024-11-02', status:'Published' },
  { id:'r2', user:'Brian Ochieng', book:'Pain',               rating:5, text:'Rawly honest. Hit close to home.',                      date:'2024-11-04', status:'Published' },
  { id:'r3', user:'Sarah Kamau',   book:'Seven Sunsets',      rating:4, text:'Beautiful collection. Lake Victoria was my favourite.', date:'2024-11-06', status:'Pending'   },
  { id:'r4', user:'Grace Akinyi',  book:'The Acacia Road',    rating:5, text:'A tender romance that felt completely real.',           date:'2024-11-10', status:'Published' },
];

const PROMO_INIT = [
  { id:'p1', code:'HAVEN10',  discount:'10%',    type:'Percentage', uses:34, active:true,  expires:'2025-02-28' },
  { id:'p2', code:'LAUNCH50', discount:'KSh 50', type:'Fixed',      uses:12, active:true,  expires:'2025-01-31' },
  { id:'p3', code:'VIP20',    discount:'20%',    type:'Percentage', uses: 5, active:false, expires:'2024-12-31' },
];

// ── Photo constants & helpers ────────────────────────────────────────────────

const PUBLIC_COVERS = [
  { name:'cover-marriage-is-a-scam.png', url:'/cover-marriage-is-a-scam.png', path:'pub/cover-marriage-is-a-scam.png', uploadedAt:1700000001000, size:0, isPublic:true },
  { name:'cover-pain.png',               url:'/cover-pain.png',               path:'pub/cover-pain.png',               uploadedAt:1700000002000, size:0, isPublic:true },
  { name:'cover-chasing-her-ghosts.png', url:'/cover-chasing-her-ghosts.png', path:'pub/cover-chasing-her-ghosts.png', uploadedAt:1700000003000, size:0, isPublic:true },
  { name:'cover-the-last-chapter.png',   url:'/cover-the-last-chapter.png',   path:'pub/cover-the-last-chapter.png',   uploadedAt:1700000004000, size:0, isPublic:true },
  { name:'cover-19-days.png',            url:'/cover-19-days.png',            path:'pub/cover-19-days.png',            uploadedAt:1700000005000, size:0, isPublic:true },
  { name:'cover-echoes-savanna.svg',     url:'/cover-echoes-savanna.svg',     path:'pub/cover-echoes-savanna.svg',     uploadedAt:1700000006000, size:0, isPublic:true },
  { name:'cover-seven-sunsets.svg',      url:'/cover-seven-sunsets.svg',      path:'pub/cover-seven-sunsets.svg',      uploadedAt:1700000007000, size:0, isPublic:true },
  { name:'cover-midnight-mombasa.svg',   url:'/cover-midnight-mombasa.svg',   path:'pub/cover-midnight-mombasa.svg',   uploadedAt:1700000008000, size:0, isPublic:true },
  { name:'cover-acacia-road.svg',        url:'/cover-acacia-road.svg',        path:'pub/cover-acacia-road.svg',        uploadedAt:1700000009000, size:0, isPublic:true },
  { name:'cover-children-thunder.svg',   url:'/cover-children-thunder.svg',   path:'pub/cover-children-thunder.svg',  uploadedAt:1700000010000, size:0, isPublic:true },
  { name:'cover-nairobi-nights.svg',     url:'/cover-nairobi-nights.svg',     path:'pub/cover-nairobi-nights.svg',     uploadedAt:1700000011000, size:0, isPublic:true },
];

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

const fmtSize     = b => !b ? '' : b < 1048576 ? (b/1024).toFixed(1)+' KB' : (b/1048576).toFixed(1)+' MB';
const ALLOWED_IMG = ['image/jpeg','image/png','image/webp','image/svg+xml','image/gif'];

// ── Lightbox viewer with zoom/pan ────────────────────────────────────────────
function Lightbox({ photo, onClose }) {
  const [zoom, setZoom] = useState(1);
  const [pos, setPos]   = useState({ x:0, y:0 });
  const dragRef         = useRef(null);
  useEffect(() => {
    const k = e => { if(e.key==='Escape') onClose(); };
    window.addEventListener('keydown',k);
    document.body.style.overflow='hidden';
    return () => { window.removeEventListener('keydown',k); document.body.style.overflow=''; };
  },[onClose]);
  const wheel = e => { e.preventDefault(); setZoom(z=>Math.max(0.5,Math.min(5,z-e.deltaY*0.001))); };
  const mdown = e => { dragRef.current={sx:e.clientX-pos.x,sy:e.clientY-pos.y}; };
  const mmove = e => { if(dragRef.current) setPos({x:e.clientX-dragRef.current.sx,y:e.clientY-dragRef.current.sy}); };
  const mup   = () => { dragRef.current=null; };
  const reset = () => { setZoom(1); setPos({x:0,y:0}); };
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.93)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}}
      onClick={e=>e.target===e.currentTarget&&onClose()} onMouseMove={mmove} onMouseUp={mup} onWheel={wheel}>
      <div style={{position:'absolute',top:14,right:14,display:'flex',gap:8,zIndex:1}}>
        <button onClick={()=>setZoom(z=>Math.min(5,z+0.5))} style={{background:'rgba(255,255,255,0.15)',border:'none',color:'#fff',borderRadius:6,padding:'6px 12px',cursor:'pointer',fontSize:'1.1rem'}}>＋</button>
        <button onClick={()=>setZoom(z=>Math.max(0.5,z-0.5))} style={{background:'rgba(255,255,255,0.15)',border:'none',color:'#fff',borderRadius:6,padding:'6px 12px',cursor:'pointer',fontSize:'1.1rem'}}>－</button>
        <button onClick={reset} style={{background:'rgba(255,255,255,0.15)',border:'none',color:'#fff',borderRadius:6,padding:'5px 10px',cursor:'pointer',fontSize:'0.78rem'}}>Reset</button>
        <button onClick={onClose} style={{background:'rgba(231,76,60,0.8)',border:'none',color:'#fff',borderRadius:6,padding:'6px 14px',cursor:'pointer',fontSize:'1rem',fontWeight:700}}>✕</button>
      </div>
      <div style={{position:'absolute',bottom:14,left:'50%',transform:'translateX(-50%)',color:'rgba(255,255,255,0.45)',fontSize:'0.72rem',whiteSpace:'nowrap'}}>
        Scroll to zoom · Drag to pan · ESC to close · {Math.round(zoom*100)}%
      </div>
      <img src={photo.url} alt={photo.name} onMouseDown={mdown}
        style={{maxWidth:'90vw',maxHeight:'90vh',objectFit:'contain',borderRadius:8,
          transform:`scale(${zoom}) translate(${pos.x/zoom}px,${pos.y/zoom}px)`,
          transformOrigin:'center',transition:dragRef.current?'none':'transform 0.1s',
          cursor:zoom>1?'grab':'zoom-in',userSelect:'none',display:'block'}} />
    </div>
  );
}

// ── Image compression + base64 storage (no Firebase Storage auth needed) ────
// Compresses image to max 800px wide / 200KB before storing in Firestore

function compressImage(file, maxW = 600, quality = 0.65) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width  * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      // SVG files can't be compressed — use original FileReader
      const type = file.type === 'image/svg+xml' ? 'image/svg+xml' : 'image/jpeg';
      if (type === 'image/svg+xml') {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      } else {
        resolve(canvas.toDataURL(type, quality));
      }
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function uploadFileToStorage(file) {
  // Compress first — keeps base64 well under Firestore's 1MB field limit
  const dataUrl = await compressImage(file);
  // path is local — no Firebase Storage used
  const path = `local/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
  return { url: dataUrl, path };
}

function usePhotoUpload(fsKey) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress,  setProgress]  = useState('');
  const [uploadErr, setUploadErr] = useState('');

  const upload = async (files, currentList, onSaved) => {
    setUploadErr('');
    const OK = ['image/jpeg','image/png','image/webp','image/svg+xml','image/gif'];
    const valid = Array.from(files||[]).filter(f => OK.includes(f.type));
    if (!valid.length)    { setUploadErr('Only JPG, PNG, WebP, or SVG files'); return; }
    if (valid.length > 5) { setUploadErr('Max 5 files at a time'); return; }
    setUploading(true);
    const added = [];
    for (let i = 0; i < valid.length; i++) {
      const file = valid[i];
      setProgress('Compressing ' + (i+1) + '/' + valid.length + ': ' + file.name);
      try {
        const { url, path } = await uploadFileToStorage(file);
        added.push({ name:file.name, url, path, uploadedAt:Date.now(), size:file.size, isPublic:false });
      } catch(e) {
        setUploadErr('Failed: ' + file.name + ' - ' + e.message);
      }
    }
    if (added.length) {
      setProgress('Saving to library...');
      try {
        const merged = [...added, ...(currentList||[])];
        const meta = merged.map(p => ({ name:p.name, url:p.url, path:p.path, uploadedAt:p.uploadedAt||0, size:p.size||0, isPublic:!!p.isPublic }));
        await setDoc(doc(db,'site_data',fsKey), { list:meta }, { merge:true });
        setUploadErr('');
        onSaved(meta);
      } catch(e) {
        setUploadErr('Save failed: ' + e.message);
        onSaved([...added, ...(currentList||[])]);
      }
    }
    setUploading(false); setProgress('');
    if (fileRef.current) fileRef.current.value = '';
  };

  return { fileRef, uploading, progress, uploadErr, setUploadErr, upload };
}

// ── Shared drop zone ──────────────────────────────────────────────────────────
function DropZone({uploading,progress,fileRef,onFiles}) {
  const [over,setOver]=useState(false);
  return (
    <div className={'adm-photo-dropzone'+(over?' over':'')}
      onDragOver={e=>{e.preventDefault();setOver(true);}} onDragLeave={()=>setOver(false)}
      onDrop={e=>{e.preventDefault();setOver(false);onFiles(e.dataTransfer.files);}}
      onClick={()=>!uploading&&fileRef.current?.click()}>
      {uploading
        ? <><div className="adm-photo-spinner"/><p style={{marginTop:10,color:'var(--gold)',fontWeight:600}}>{progress}</p><p style={{fontSize:'0.75rem',color:'var(--muted)',marginTop:4}}>Please wait…</p></>
        : <><span style={{fontSize:'2.5rem'}}>📤</span><p style={{marginTop:10,fontWeight:600}}>Drag &amp; drop or <span style={{color:'var(--gold)'}}>click to browse</span></p><p style={{fontSize:'0.75rem',color:'var(--muted)',marginTop:6}}>JPG · PNG · WebP · SVG · max 10 · Stored in Firebase</p></>}
    </div>
  );
}

// ── Photo thumbnail card ──────────────────────────────────────────────────────
function PhotoThumb({photo,selected,onToggle,actions,usedBy,onPreview}) {
  const sz = !photo.size?'':photo.size<1048576?(photo.size/1024).toFixed(1)+' KB':(photo.size/1048576).toFixed(1)+' MB';
  return (
    <div className={'adm-photo-card card'+(selected?' adm-photo-selected':'')} style={{cursor:'default'}}>
      <div className="adm-photo-img-wrap" onClick={onPreview} style={{cursor:'zoom-in'}}>
        <img src={photo.url} alt={photo.name} className="adm-photo-img" loading="lazy"/>
        <div className="adm-photo-preview-hint">🔍 View</div>
        <div className={'adm-photo-check'+(selected?' on':'')} onClick={e=>{e.stopPropagation();onToggle();}}>
          {selected?'✓':''}
        </div>
        {usedBy>0&&<div className="adm-photo-used-badge">✓ {usedBy} book{usedBy!==1?'s':''}</div>}
        {photo.isPublic&&<div className="adm-photo-public-badge">Built-in</div>}
      </div>
      <div className="adm-photo-info">
        <p className="adm-photo-name" title={photo.name}>{photo.name}</p>
        {sz&&<p className="adm-photo-meta">{sz}</p>}
        <div className="adm-photo-actions">{actions}</div>
      </div>
    </div>
  );
}

// ── Novel Covers Tab ──────────────────────────────────────────────────────────
function CoversTab({books,saveBook,showToast}) {
  const [photos,setPhotos]         = useState([]);
  const [loading,setLoading]       = useState(true);
  const [selected,setSelected]     = useState([]);
  const [assignTo,setAssignTo]     = useState(null);
  const [preview,setPreview]       = useState(null);
  const [delOne,setDelOne]         = useState(null);
  const [bulkDel,setBulkDel]       = useState(false);
  const {fileRef,uploading,progress,uploadErr,setUploadErr,upload} = usePhotoUpload('novel_covers');

  const FSKEY = 'novel_covers';
  const sorted = list => [...list].sort((a,b)=>(b.uploadedAt||0)-(a.uploadedAt||0));

  useEffect(()=>{
    setLoading(true);
    getDoc(doc(db,'site_data',FSKEY)).then(snap=>{
      let list = snap.exists()?(snap.data().list||[]):[];
      const have = new Set(list.map(p=>p.path));
      const miss = PUBLIC_COVERS.filter(c=>!have.has(c.path));
      if(miss.length){ list=[...list,...miss]; setDoc(doc(db,'site_data',FSKEY),{list},{ merge:true}); }
      setPhotos(sorted(list));
    }).catch(()=>setPhotos([...PUBLIC_COVERS])).finally(()=>setLoading(false));
  },[]);

  const persist = async list=>{
    const meta=list.map(p=>({name:p.name,url:p.url,path:p.path,uploadedAt:p.uploadedAt||0,size:p.size||0,isPublic:!!p.isPublic}));
    await setDoc(doc(db,'site_data',FSKEY),{list:meta},{merge:true});
    setPhotos(sorted(meta));
  };

  const removeOne = async p=>{ const next=photos.filter(x=>x.path!==p.path); try{await persist(next);}catch{setPhotos(next);} setSelected(s=>s.filter(x=>x!==p.path)); showToast('Cover removed'); setDelOne(null); };
  const removeBulk= async ()=>{ const next=photos.filter(p=>!selected.includes(p.path)); try{await persist(next);}catch{setPhotos(next);} showToast(selected.length+' deleted'); setSelected([]); setBulkDel(false); };
  const assign    = async b=>{ try { await saveBook({...b,cover:assignTo.url,coverType:'photo'}); showToast('Cover set for "'+b.title+'"'); } catch { showToast('❌ Save failed'); } setAssignTo(null); };
  const toggle    = p=>setSelected(s=>s.includes(p)?s.filter(x=>x!==p):[...s,p]);
  const onSaved   = list=>setPhotos(sorted(list));

  const grid = list => list.map(photo=>{
    const used=books.filter(b=>b.coverType==='photo'&&b.cover===photo.url).length;
    return <PhotoThumb key={photo.path} photo={photo} selected={selected.includes(photo.path)}
      onToggle={()=>toggle(photo.path)} usedBy={used} onPreview={()=>setPreview(photo)}
      actions={<><button className="adm-act-btn adm-act-edit" onClick={()=>setAssignTo(photo)}>Set as Cover</button><button className="adm-act-btn adm-act-del" onClick={()=>setDelOne(photo)}>Remove</button></>}/>;
  });

  return (
    <div className="adm-page">
      {preview&&<Lightbox photo={preview} onClose={()=>setPreview(null)}/>}
      {assignTo&&(
        <div className="adm-overlay">
          <div className="adm-confirm card" style={{maxWidth:600,textAlign:'left'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <h3 style={{fontSize:'1rem'}}>Set as Book Cover</h3>
              <button className="adm-close-btn" onClick={()=>setAssignTo(null)}>✕</button>
            </div>
            <div style={{display:'flex',gap:16,marginBottom:20}}>
              <img src={assignTo.url} alt="" style={{width:70,height:98,objectFit:'cover',borderRadius:6,border:'1px solid var(--dim)',flexShrink:0}}/>
              <p style={{fontSize:'0.8rem',color:'var(--muted)'}}>Click a book to apply this image as its cover. Saves instantly.</p>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:8,maxHeight:320,overflowY:'auto'}}>
              {books.map(b=>(
                <button key={b.id} onClick={()=>assign(b)} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',background:b.cover===assignTo.url?'rgba(201,168,76,0.12)':'rgba(255,255,255,0.03)',border:b.cover===assignTo.url?'1px solid rgba(201,168,76,0.5)':'1px solid var(--dim)',borderRadius:'var(--r-sm)',cursor:'pointer',textAlign:'left',width:'100%',transition:'all 0.15s'}}>
                  {b.coverType==='photo'&&b.cover?<img src={b.cover} alt="" style={{width:26,height:38,objectFit:'cover',borderRadius:3,flexShrink:0}}/>:<div style={{width:26,height:38,background:b.coverColor||'#1a1a3a',borderRadius:3,flexShrink:0}}/>}
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:'0.78rem',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'var(--text)'}}>{b.title}</div>
                    <div style={{fontSize:'0.68rem',color:b.cover===assignTo.url?'var(--gold)':'var(--muted)'}}>{b.cover===assignTo.url?'✓ Current':'Apply'}</div>
                  </div>
                </button>
              ))}
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',marginTop:16}}><button className="btn btn-ghost btn-sm" onClick={()=>setAssignTo(null)}>Close</button></div>
          </div>
        </div>
      )}
      {delOne&&<div className="adm-overlay"><div className="adm-confirm card"><p>Remove <strong style={{color:'var(--gold)'}}>{delOne.name}</strong>?</p><div className="adm-confirm-btns"><button className="btn btn-primary btn-sm" onClick={()=>removeOne(delOne)}>Yes</button><button className="btn btn-ghost btn-sm" onClick={()=>setDelOne(null)}>Cancel</button></div></div></div>}
      {bulkDel&&<div className="adm-overlay"><div className="adm-confirm card"><p>Delete <strong style={{color:'var(--gold)'}}>{selected.length} cover(s)</strong>?</p><div className="adm-confirm-btns"><button className="btn btn-primary btn-sm" onClick={removeBulk}>Yes</button><button className="btn btn-ghost btn-sm" onClick={()=>setBulkDel(false)}>Cancel</button></div></div></div>}

      <div className="adm-page-head">
        <div><h1>Novel Covers</h1><span className="adm-page-sub">{photos.length} image(s) — upload covers and assign to books</span></div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          {selected.length>0&&<><span style={{fontSize:'0.82rem',color:'var(--gold)',fontWeight:600}}>{selected.length} selected</span><button className="btn btn-sm" style={{background:'rgba(231,76,60,0.12)',color:'#e74c3c',border:'1px solid rgba(231,76,60,0.35)'}} onClick={()=>setBulkDel(true)}>🗑 Delete</button><button className="btn btn-ghost btn-sm" onClick={()=>setSelected([])}>Clear</button></>}
          {selected.length===0&&photos.length>0&&<button className="btn btn-ghost btn-sm" onClick={()=>setSelected(photos.map(p=>p.path))}>Select All</button>}
          <button className="btn btn-primary" disabled={uploading} onClick={()=>fileRef.current?.click()}>{uploading?'⏳ Uploading…':'+ Upload Covers'}</button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{display:'none'}} onChange={e=>upload(e.target.files,photos,onSaved)}/>
      </div>
      {uploadErr&&<div style={{background:'rgba(231,76,60,0.1)',border:'1px solid rgba(231,76,60,0.35)',borderRadius:'var(--r-sm)',padding:'10px 14px',marginBottom:16,fontSize:'0.82rem',color:'#e74c3c',display:'flex',justifyContent:'space-between'}}><span>{uploadErr}</span><button onClick={()=>setUploadErr('')} style={{background:'none',border:'none',color:'#e74c3c',cursor:'pointer'}}>✕</button></div>}
      <DropZone uploading={uploading} progress={progress} fileRef={fileRef} onFiles={files=>upload(files,photos,onSaved)}/>
      {loading?<div style={{textAlign:'center',padding:60,color:'var(--muted)'}}>Loading…</div>
        :photos.length===0?<div className="adm-empty"><div style={{fontSize:'3rem',marginBottom:12}}>🎨</div><p>No covers yet. Upload above.</p></div>
        :<>
          {photos.some(p=>!p.isPublic)&&<><p style={{fontSize:'0.72rem',color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:1,marginBottom:12}}>Uploaded Covers</p><div className="adm-photo-grid" style={{marginBottom:28}}>{grid(photos.filter(p=>!p.isPublic))}</div></>}
          {photos.some(p=>p.isPublic)&&<><p style={{fontSize:'0.72rem',color:'var(--muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:1,marginBottom:12}}>Built-in Covers</p><div className="adm-photo-grid">{grid(photos.filter(p=>p.isPublic))}</div></>}
        </>}
    </div>
  );
}

// ── Site Photos Tab ───────────────────────────────────────────────────────────
function PhotosTab({showToast}) {
  const [photos,setPhotos]     = useState([]);
  const [loading,setLoading]   = useState(true);
  const [selected,setSelected] = useState([]);
  const [preview,setPreview]   = useState(null);
  const [delOne,setDelOne]     = useState(null);
  const [bulkDel,setBulkDel]   = useState(false);
  const [copied,setCopied]     = useState('');
  const {fileRef,uploading,progress,uploadErr,setUploadErr,upload} = usePhotoUpload('site_photos');

  const FSKEY  = 'site_photos';
  const sorted = list => [...list].sort((a,b)=>(b.uploadedAt||0)-(a.uploadedAt||0));

  useEffect(()=>{
    setLoading(true);
    getDoc(doc(db,'site_data',FSKEY)).then(snap=>{
      const list=snap.exists()?(snap.data().list||[]):[];
      setPhotos(sorted(list));
    }).catch(()=>setPhotos([])).finally(()=>setLoading(false));
  },[]);

  const persist = async list=>{
    const meta=list.map(p=>({name:p.name,url:p.url,path:p.path,uploadedAt:p.uploadedAt||0,size:p.size||0,isPublic:false}));
    await setDoc(doc(db,'site_data',FSKEY),{list:meta},{merge:true});
    setPhotos(sorted(meta));
  };

  const removeOne = async p=>{ const next=photos.filter(x=>x.path!==p.path); try{await persist(next);}catch{setPhotos(next);} setSelected(s=>s.filter(x=>x!==p.path)); showToast('Photo removed'); setDelOne(null); };
  const removeBulk= async ()=>{ const next=photos.filter(p=>!selected.includes(p.path)); try{await persist(next);}catch{setPhotos(next);} showToast(selected.length+' deleted'); setSelected([]); setBulkDel(false); };
  const toggle    = p=>setSelected(s=>s.includes(p)?s.filter(x=>x!==p):[...s,p]);
  const onSaved   = list=>setPhotos(sorted(list));

  const copy = url => {
    navigator.clipboard.writeText(url).then(()=>{ setCopied('URL copied!'); setTimeout(()=>setCopied(''),2000); }).catch(()=>setCopied('Copy failed'));
  };

  return (
    <div className="adm-page">
      {preview&&<Lightbox photo={preview} onClose={()=>setPreview(null)}/>}
      {delOne&&<div className="adm-overlay"><div className="adm-confirm card"><p>Remove <strong style={{color:'var(--gold)'}}>{delOne.name}</strong>?</p><div className="adm-confirm-btns"><button className="btn btn-primary btn-sm" onClick={()=>removeOne(delOne)}>Yes</button><button className="btn btn-ghost btn-sm" onClick={()=>setDelOne(null)}>Cancel</button></div></div></div>}
      {bulkDel&&<div className="adm-overlay"><div className="adm-confirm card"><p>Delete <strong style={{color:'var(--gold)'}}>{selected.length} photo(s)</strong>?</p><div className="adm-confirm-btns"><button className="btn btn-primary btn-sm" onClick={removeBulk}>Yes</button><button className="btn btn-ghost btn-sm" onClick={()=>setBulkDel(false)}>Cancel</button></div></div></div>}

      <div className="adm-page-head">
        <div><h1>Site Photos</h1><span className="adm-page-sub">{photos.length} image(s) — banners, author photos, promotional images</span></div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          {selected.length>0&&<><span style={{fontSize:'0.82rem',color:'var(--gold)',fontWeight:600}}>{selected.length} selected</span><button className="btn btn-sm" style={{background:'rgba(231,76,60,0.12)',color:'#e74c3c',border:'1px solid rgba(231,76,60,0.35)'}} onClick={()=>setBulkDel(true)}>🗑 Delete</button><button className="btn btn-ghost btn-sm" onClick={()=>setSelected([])}>Clear</button></>}
          {selected.length===0&&photos.length>0&&<button className="btn btn-ghost btn-sm" onClick={()=>setSelected(photos.map(p=>p.path))}>Select All</button>}
          <button className="btn btn-primary" disabled={uploading} onClick={()=>fileRef.current?.click()}>{uploading?'⏳ Uploading…':'+ Upload Photos'}</button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{display:'none'}} onChange={e=>upload(e.target.files,photos,onSaved)}/>
      </div>
      {copied&&<div style={{background:'rgba(46,204,113,0.1)',border:'1px solid rgba(46,204,113,0.3)',borderRadius:'var(--r-sm)',padding:'8px 14px',marginBottom:12,fontSize:'0.82rem',color:'var(--ok)'}}>{copied}</div>}
      {uploadErr&&<div style={{background:'rgba(231,76,60,0.1)',border:'1px solid rgba(231,76,60,0.35)',borderRadius:'var(--r-sm)',padding:'10px 14px',marginBottom:16,fontSize:'0.82rem',color:'#e74c3c',display:'flex',justifyContent:'space-between'}}><span>{uploadErr}</span><button onClick={()=>setUploadErr('')} style={{background:'none',border:'none',color:'#e74c3c',cursor:'pointer'}}>✕</button></div>}
      <DropZone uploading={uploading} progress={progress} fileRef={fileRef} onFiles={files=>upload(files,photos,onSaved)}/>
      {loading?<div style={{textAlign:'center',padding:60,color:'var(--muted)'}}>Loading…</div>
        :photos.length===0?<div className="adm-empty"><div style={{fontSize:'3rem',marginBottom:12}}>🖼️</div><p>No site photos yet. Upload banners or author images above.</p></div>
        :<div className="adm-photo-grid">
          {photos.map(photo=>(
            <PhotoThumb key={photo.path} photo={photo} selected={selected.includes(photo.path)}
              onToggle={()=>toggle(photo.path)} usedBy={0} onPreview={()=>setPreview(photo)}
              actions={<><button className="adm-act-btn adm-act-edit" onClick={()=>copy(photo.url)}>Copy URL</button><button className="adm-act-btn adm-act-del" onClick={()=>setDelOne(photo)}>Remove</button></>}/>
          ))}
        </div>}
    </div>
  );
}


// -- BookForm --
function BookForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({ ...EMPTY_BOOK, ...(initial||{}) });
  // If cover is a data: URL or a path (not null/styled), start in 'library' mode
  const initCoverMode = () => {
    if (!initial) return 'styled';
    if (initial.coverType === 'photo' && initial.cover) return 'library';
    return 'styled';
  };
  const [coverMode, setCoverMode] = useState(initCoverMode);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [libPhotos, setLibPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  useEffect(() => {
    if (!pickerOpen) return;
    getDoc(doc(db,'site_data','novel_covers')).then(snap => {
      const saved = snap.exists() ? (snap.data().list||[]) : [];
      const paths = new Set(saved.map(p=>p.path));
      const all = [...saved, ...PUBLIC_COVERS.filter(c=>!paths.has(c.path))];
      all.sort((a,b)=>(b.uploadedAt||0)-(a.uploadedAt||0));
      setLibPhotos(all);
    }).catch(()=>setLibPhotos([...PUBLIC_COVERS]));
  }, [pickerOpen]);

  const handleSubmit = e => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      onSave({
        ...form,
        id: form.id || String(Date.now()),
        price: Number(form.price),
        pages: Number(form.pages),
        rating: Number(form.rating),
        coverType: coverMode==='styled' ? 'styled' : 'photo',
        cover: coverMode==='styled' ? null : (form.cover||null),
      });
    } catch(err) {
      console.error('[BookForm] submit error:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="adm-overlay">
      <div className="adm-bookform card">
        <div className="adm-bookform-head">
          <h2>{form.id ? 'Edit Book' : 'Add New Book'}</h2>
          <button className="adm-close-btn" onClick={onCancel}>X</button>
        </div>
        <form onSubmit={handleSubmit} className="adm-bookform-body">
          <div className="adm-form-grid">

            <div className="adm-field-group adm-col-2">
              <label>Title *</label>
              <input className="field" value={form.title} onChange={e=>set('title',e.target.value)} placeholder="Book title" required/>
            </div>

            <div className="adm-field-group">
              <label>Subtitle <span style={{color:'var(--muted)',fontWeight:400,fontSize:'0.72rem'}}>(optional — shown under title on book detail)</span></label>
              <input className="field" value={form.subtitle||''} onChange={e=>set('subtitle',e.target.value)} placeholder="e.g. By Elijah M. M."/>
            </div>

            <div className="adm-field-group">
              <label>Author</label>
              <input className="field" value={form.author} onChange={e=>set('author',e.target.value)}/>
            </div>

            <div className="adm-field-group adm-col-2">
              <div className="adm-section-heading">🎭 Genres <span style={{color:'var(--muted)',fontWeight:400,fontSize:'0.72rem',letterSpacing:0,textTransform:'none',marginLeft:8}}>Select presets or add custom — ★ first = primary</span></div>
              <div className="adm-genre-grid">
                {[...GENRES,...(Array.isArray(form._customGenres)?form._customGenres:[])].map(g => {
                  const allSel = Array.from(new Set([...(form.genre?[form.genre]:[]),...(form.genres||[])]));
                  const selected = allSel.includes(g);
                  const isPrimary = form.genre === g;
                  const isCustom = !GENRES.includes(g);
                  return (
                    <button key={g} type="button"
                      className={'adm-genre-chip'+(selected?' adm-genre-chip--on':'')+(isPrimary?' adm-genre-chip--primary':'')+(isCustom?' adm-genre-chip--custom':'')}
                      onClick={()=>{
                        const cur=Array.from(new Set([...(form.genre?[form.genre]:[]),...(form.genres||[])]));
                        const next=cur.includes(g)?cur.filter(x=>x!==g):[...cur,g];
                        setForm(f=>({...f,genre:next[0]||'Drama',genres:next.slice(1)}));
                      }}>
                      {selected&&<span className="adm-genre-chip-check">{isPrimary?'★':'✓'}</span>}
                      {g}
                      {isCustom&&!selected&&<span style={{marginLeft:3,opacity:0.5,fontSize:'0.65rem'}} onClick={e=>{e.stopPropagation();setForm(f=>({...f,_customGenres:(f._customGenres||[]).filter(x=>x!==g)}));}}>×</span>}
                    </button>
                  );
                })}
              </div>
              <div className="adm-tag-add-row" style={{marginTop:10}}>
                <input id="adm-cg-inp" className="field" style={{flex:1,fontSize:'0.82rem'}} placeholder="Add custom genre… press Enter"
                  onKeyDown={e=>{if(e.key==='Enter'||e.key===','){e.preventDefault();const v=e.target.value.trim();if(!v)return;if(![...GENRES,...(form._customGenres||[])].includes(v))setForm(f=>({...f,_customGenres:[...(f._customGenres||[]),v]}));e.target.value='';}}}/>
                <button type="button" className="adm-tag-add-btn" onClick={()=>{const inp=document.getElementById('adm-cg-inp');const v=inp.value.trim();if(!v)return;if(![...GENRES,...(form._customGenres||[])].includes(v))setForm(f=>({...f,_customGenres:[...(f._customGenres||[]),v]}));inp.value='';}}>+ Add</button>
              </div>
              {(form.genre||(form.genres||[]).length>0)&&(
                <div className="adm-genre-summary">
                  <span className="adm-gs-label">★</span><span className="adm-gs-primary">{form.genre}</span>
                  {(form.genres||[]).length>0&&<><span className="adm-gs-sep">·</span>{(form.genres||[]).map(g=><span key={g} className="adm-gs-tag">{g}</span>)}</>}
                </div>
              )}
            </div>

            <div className="adm-field-group">
              <label>Type</label>
              <div className="adm-toggle-row">
                <button type="button" className={'adm-toggle'+(form.type==='novel'?' on':'')} onClick={()=>set('type','novel')}>Novel</button>
                <button type="button" className={'adm-toggle'+(form.type==='short-story'?' on':'')} onClick={()=>set('type','short-story')}>Short Story</button>
              </div>
            </div>

            <div className="adm-field-group">
              <label>Price (KSh)</label>
              <input className="field" type="number" min={0} value={form.price} onChange={e=>set('price',e.target.value)}/>
            </div>
            <div className="adm-field-group">
              <label>Pages</label>
              <input className="field" type="number" min={0} value={form.pages} onChange={e=>set('pages',e.target.value)}/>
            </div>
            <div className="adm-field-group">
              <label>Read Time</label>
              <input className="field" value={form.readTime} onChange={e=>set('readTime',e.target.value)} placeholder="e.g. 6 hrs"/>
            </div>
            <div className="adm-field-group">
              <label>Rating (0-5)</label>
              <input className="field" type="number" step="0.1" min="0" max="5" value={form.rating} onChange={e=>set('rating',e.target.value)}/>
            </div>

            <div className="adm-field-group adm-col-2">
              <label>Book Cover</label>
              <div className="adm-toggle-row" style={{marginBottom:10}}>
                <button type="button" className={'adm-toggle'+(coverMode==='styled'?' on':'')} onClick={()=>setCoverMode('styled')}>Styled (CSS)</button>
                <button type="button" className={'adm-toggle'+(coverMode==='url'?' on':'')} onClick={()=>setCoverMode('url')}>Photo URL</button>
                <button type="button" className={'adm-toggle'+(coverMode==='library'?' on':'')} onClick={()=>{setCoverMode('library');setPickerOpen(true);}}>Photo Library</button>
              </div>

              {coverMode!=='styled' && form.cover && (
                <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:10,padding:'8px 12px',background:'rgba(201,168,76,0.05)',border:'1px solid rgba(201,168,76,0.2)',borderRadius:'var(--r-sm)'}}>
                  <img src={form.cover} alt="" style={{width:40,height:56,objectFit:'cover',borderRadius:4,flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{fontSize:'0.78rem',fontWeight:600,marginBottom:2}}>Current cover</p>
                    <p style={{fontSize:'0.68rem',color:'var(--muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{form.cover&&form.cover.startsWith('data:')?'Uploaded image':form.cover}</p>
                  </div>
                  <button type="button" className="adm-act-btn adm-act-del" style={{flexShrink:0}} onClick={()=>set('cover',null)}>Remove</button>
                </div>
              )}

              {coverMode==='url' && (
                <input className="field" value={form.cover||''} onChange={e=>set('cover',e.target.value)} placeholder="https://... or /cover-file.png"/>
              )}

              {coverMode==='library' && (
                <div>
                  <button type="button" className="btn btn-outline btn-sm" style={{marginBottom:10}} onClick={()=>setPickerOpen(p=>!p)}>
                    {pickerOpen ? 'Close Library' : 'Open Photo Library'}
                  </button>
                  {pickerOpen && (
                    <div style={{border:'1px solid var(--dim)',borderRadius:'var(--r-sm)',padding:12,background:'rgba(0,0,0,0.25)'}}>
                      <p style={{fontSize:'0.76rem',color:'var(--muted)',marginBottom:10}}>Click a cover to apply it. Upload new covers in the Novel Covers tab.</p>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(80px,1fr))',gap:8,maxHeight:280,overflowY:'auto'}}>
                        {libPhotos.map(p=>(
                          <button key={p.path} type="button" onClick={()=>{set('cover',p.url);setPickerOpen(false);}}
                            style={{padding:0,border:form.cover===p.url?'2px solid var(--gold)':'2px solid transparent',borderRadius:6,overflow:'hidden',cursor:'pointer',background:'none',transition:'border 0.15s'}}>
                            <img src={p.url} alt={p.name} style={{width:'100%',aspectRatio:'3/4',objectFit:'cover',display:'block'}}/>
                          </button>
                        ))}
                        {libPhotos.length===0 && <p style={{gridColumn:'1/-1',color:'var(--muted)',fontSize:'0.78rem'}}>No covers yet. Upload in the Novel Covers tab.</p>}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {coverMode==='styled' && (
                <div className="adm-styled-row">
                  <div className="adm-field-group">
                    <label>BG Gradient (CSS)</label>
                    <input className="field" value={form.coverColor} onChange={e=>set('coverColor',e.target.value)} placeholder="linear-gradient(...)"/>
                  </div>
                  <div className="adm-field-group">
                    <label>Accent Colour</label>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <input className="field" value={form.coverAccent} onChange={e=>set('coverAccent',e.target.value)} placeholder="#c9a84c"/>
                      <input type="color" value={form.coverAccent} onChange={e=>set('coverAccent',e.target.value)} style={{width:36,height:36,border:'none',background:'none',cursor:'pointer'}}/>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="adm-field-group adm-col-2">
              <label>Excerpt</label>
              <input className="field" value={form.excerpt} onChange={e=>set('excerpt',e.target.value)} placeholder="One-line teaser"/>
            </div>
            <div className="adm-field-group adm-col-2">
              <label>Full Description</label>
              <textarea className="field" rows={4} value={form.description} onChange={e=>set('description',e.target.value)} style={{resize:'vertical'}}/>
            </div>
            <div className="adm-field-group adm-col-2">
              <label>True Story Note</label>
              <input className="field" value={form.inspiredNote} onChange={e=>set('inspiredNote',e.target.value)} placeholder="What real story inspired this?"/>
            </div>

            {/* ── Rich Metadata ── */}
            <div className="adm-field-group adm-col-2" style={{borderTop:'1px solid var(--dim)',paddingTop:18,marginTop:4}}>
              <div className="adm-section-heading">📋 Book Details &amp; Metadata</div>
              <p style={{fontSize:'0.76rem',color:'var(--muted)',margin:'4px 0 0'}}>Professional publishing info shown on the public book detail page.</p>
            </div>

            <div className="adm-field-group">
              <label>Setting / Location</label>
              <input className="field" value={form.setting||''} onChange={e=>set('setting',e.target.value)} placeholder="e.g. Karen (Nairobi), Nyeri, Kenya"/>
            </div>
            <div className="adm-field-group">
              <label>Audience Rating</label>
              <select className="field" value={form.audienceRating||''} onChange={e=>set('audienceRating',e.target.value)}>
                <option value="">— Select —</option>
                <option value="13+">13+</option>
                <option value="14+">14+</option>
                <option value="16+">16+</option>
                <option value="18+">18+</option>
              </select>
            </div>
            <div className="adm-field-group">
              <label>Chapter / Story Count</label>
              <input className="field" type="number" min={0} value={form.chapterCount||0} onChange={e=>set('chapterCount',Number(e.target.value))} placeholder="e.g. 28"/>
            </div>

            <div className="adm-field-group">
              <label>Release Date <span style={{color:'var(--muted)',fontWeight:400,fontSize:'0.72rem'}}>— shown as "Released: Aug 2024"</span></label>
              <input className="field" type="date" value={form.date||''} onChange={e=>set('date',e.target.value)}/>
            </div>
            <div className="adm-field-group">
              <label>Review Count <span style={{color:'var(--muted)',fontWeight:400,fontSize:'0.72rem'}}>— shown next to ★ rating</span></label>
              <input className="field" type="number" min={0} value={form.reviews||0} onChange={e=>set('reviews',Number(e.target.value))} placeholder="e.g. 187"/>
            </div>
            <div className="adm-field-group">
              <label>Expected Date <span style={{color:'var(--muted)',fontWeight:400,fontSize:'0.72rem'}}>— coming-soon cards only (e.g. "September 2025")</span></label>
              <input className="field" value={form.expectedDate||''} onChange={e=>set('expectedDate',e.target.value)} placeholder="e.g. September 2025"/>
            </div>

            {/* ── Reader Rating Display ── */}
            <div className="adm-field-group adm-col-2">
              <label>Reader Rating Display <span style={{color:'var(--muted)',fontWeight:400,fontSize:'0.72rem'}}>— shown as ⭐⭐⭐⭐⭐ 4.8/5 on book detail</span></label>
              <div className="adm-rating-preview">
                <div className="adm-rating-stars">
                  {[1,2,3,4,5].map(n=>(
                    <span key={n} style={{fontSize:'1.5rem',color:n<=Math.round(Number(form.rating)||0)?'#f5c518':'var(--dim)',cursor:'pointer'}}
                      onClick={()=>set('rating',n)}>★</span>
                  ))}
                  <span className="adm-rating-num">{Number(form.rating||0).toFixed(1)}/5</span>
                </div>
                {form.ratingQuote&&<blockquote className="adm-rating-quote-preview">{form.ratingQuote}</blockquote>}
              </div>
              <input className="field" style={{marginTop:10}} value={form.ratingQuote||''} onChange={e=>set('ratingQuote',e.target.value)}
                placeholder='"A deeply emotional story about love, loss, and the hidden battles inside modern marriage."'/>
              <small style={{color:'var(--muted)',fontSize:'0.7rem'}}>This quote appears directly below the star rating on the public book page</small>
            </div>

            {/* ── Themes Tag Builder ── */}
            <div className="adm-field-group adm-col-2">
              <div className="adm-section-heading">🏷️ Themes <span style={{color:'var(--muted)',fontWeight:400,fontSize:'0.72rem',letterSpacing:0,textTransform:'none',marginLeft:8}}>Click presets or type custom</span></div>
              <div className="adm-theme-presets">
                {['Love','Marriage','Betrayal','Trust','Family','Financial Abuse','Infidelity','Redemption','Parenthood','Emotional Survival',
                  'Grief','Loss','Healing','Identity','Resilience','Trauma','Loneliness','Survival','Ambition','Power',
                  'Justice','Loyalty','Deception','Courage','Hope','Sacrifice','Community','The Past','Closure','Memory',
                  'Forgiveness','Legacy','Land','Second Chances','Vulnerability','Distance','Longing','Coming of Age',
                  'Mythology','Prophecy','Class','Dreams','Friendship','War','Freedom','Race','Politics'].map(t=>{
                  const active=(form.themes||[]).includes(t);
                  return(
                    <button key={t} type="button" className={'adm-theme-chip'+(active?' adm-theme-chip--on':'')}
                      onClick={()=>{const c=form.themes||[];set('themes',active?c.filter(x=>x!==t):[...c,t]);}}>
                      {active&&'✓ '}{t}
                    </button>
                  );
                })}
              </div>
              <div className="adm-tag-add-row" style={{marginTop:10}}>
                <input id="adm-ct-inp" className="field" style={{flex:1,fontSize:'0.82rem'}} placeholder="Type custom theme… press Enter or comma"
                  onKeyDown={e=>{if(e.key==='Enter'||e.key===','){e.preventDefault();const v=e.target.value.trim();if(!v||(form.themes||[]).includes(v))return;set('themes',[...(form.themes||[]),v]);e.target.value='';}}}/>
                <button type="button" className="adm-tag-add-btn" onClick={()=>{const i=document.getElementById('adm-ct-inp');const v=i.value.trim();if(!v||(form.themes||[]).includes(v))return;set('themes',[...(form.themes||[]),v]);i.value='';}}>+ Add</button>
              </div>
              {(form.themes||[]).length>0&&(
                <div className="adm-selected-tags">
                  <span style={{fontSize:'0.7rem',color:'var(--muted)'}}>Selected ({(form.themes||[]).length}):</span>
                  {(form.themes||[]).map(t=>(
                    <span key={t} className="adm-selected-tag">{t}<button type="button" onClick={()=>set('themes',(form.themes||[]).filter(x=>x!==t))}>×</button></span>
                  ))}
                  <button type="button" className="adm-clear-tags" onClick={()=>set('themes',[])}>Clear all</button>
                </div>
              )}
            </div>

            {/* ── Author's Note ── */}
            <div className="adm-field-group adm-col-2">
              <label>Author's Note</label>
              <textarea className="field" rows={4} value={form.authorNote||''} onChange={e=>set('authorNote',e.target.value)}
                placeholder="A personal message from the author about this book's inspiration or writing process…"
                style={{resize:'vertical'}}/>
              <small style={{color:'var(--muted)',fontSize:'0.7rem'}}>Shown in a dedicated "Author's Note" section on the public book detail page</small>
            </div>

            {/* ── Table of Contents ── */}
            <div className="adm-field-group adm-col-2">
              <label>Table of Contents <span style={{color:'var(--muted)',fontWeight:400,fontSize:'0.75rem'}}>(one chapter per line)</span></label>
              <textarea className="field" rows={8}
                value={Array.isArray(form.tableOfContents)?form.tableOfContents.join('\n'):(form.tableOfContents||'')}
                onChange={e=>set('tableOfContents',e.target.value.split('\n').map(l=>l.trim()).filter(Boolean))}
                placeholder={'Chapter 1 — The First Meeting\nChapter 2 — Something Like Love\nChapter 3 — The Promise'}
                style={{resize:'vertical',fontFamily:'monospace',fontSize:'0.82rem',lineHeight:1.7}}/>
              <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
                <small style={{color:'var(--muted)',fontSize:'0.7rem'}}>Each line = one entry in the published TOC</small>
                {Array.isArray(form.tableOfContents)&&form.tableOfContents.length>0&&(
                  <small style={{color:'var(--gold)',fontSize:'0.7rem'}}>{form.tableOfContents.length} entries</small>
                )}
              </div>
            </div>

            <div className="adm-field-group adm-col-2">
              <label>Google Drive URL (PDF)</label>
              <input className="field" value={form.driveUrl||''} onChange={e=>set('driveUrl',e.target.value)} placeholder="https://drive.google.com/file/d/FILE_ID/view?usp=sharing"/>
              <div style={{marginTop:8,background:'rgba(201,168,76,0.06)',border:'1px solid rgba(201,168,76,0.2)',borderRadius:'var(--r-sm)',padding:'10px 14px',fontSize:'0.76rem',color:'var(--muted)',lineHeight:1.8}}>
                <ol style={{paddingLeft:16,margin:0}}><li>Upload PDF to Google Drive</li><li>Share - "Anyone with the link"</li><li>Copy link and paste above</li></ol>
              </div>
            </div>

            <div className="adm-field-group adm-col-2">
              <div className="adm-flags">
                <label className="adm-check"><input type="checkbox" checked={form.featured} onChange={e=>set('featured',e.target.checked)}/> Featured on homepage</label>
                <label className="adm-check"><input type="checkbox" checked={form.isNew} onChange={e=>set('isNew',e.target.checked)}/> Show New badge</label>
                <label className="adm-check"><input type="checkbox" checked={form.inspired} onChange={e=>set('inspired',e.target.checked)}/> Inspired by true story</label>
              </div>
            </div>

            {/* ── Publication Status ── */}
            <div className="adm-field-group adm-col-2">
              <label style={{color:'var(--gold)',fontWeight:700,fontSize:'0.82rem',textTransform:'uppercase',letterSpacing:1}}>Publication Status</label>
              <p style={{fontSize:'0.76rem',color:'var(--muted)',marginBottom:12}}>Shown as a badge on the book card and detail page.</p>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(185px,1fr))',gap:8}}>
                {BOOK_STATUSES.map(s => (
                  <button key={s.value} type="button" onClick={() => set('status', s.value)}
                    style={{
                      display:'flex', alignItems:'flex-start', gap:10, padding:'10px 12px',
                      border: form.status===s.value ? `1px solid ${s.color}` : '1px solid var(--dim)',
                      borderRadius:'var(--r-sm)', cursor:'pointer', textAlign:'left',
                      background: form.status===s.value ? s.bg : 'rgba(255,255,255,0.02)',
                      transition:'all 0.15s',
                    }}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:'0.82rem',fontWeight:700,color: form.status===s.value ? s.color : 'var(--text)',marginBottom:2}}>{s.label}</div>
                      <div style={{fontSize:'0.7rem',color:'var(--muted)',lineHeight:1.4}}>{s.desc}</div>
                    </div>
                    {form.status===s.value && <span style={{color:s.color,fontSize:'0.8rem',flexShrink:0}}>✓</span>}
                  </button>
                ))}
              </div>

              {/* Chapter progress — only for Ongoing books */}
              {form.status === 'ongoing' && (
                <div style={{marginTop:14,padding:'14px 16px',background:'rgba(74,158,255,0.06)',border:'1px solid rgba(74,158,255,0.2)',borderRadius:'var(--r-sm)'}}>
                  <p style={{fontSize:'0.8rem',color:'var(--muted)',marginBottom:12}}>📖 Ongoing series — show readers chapter progress (like a TV series)</p>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                    <div className="adm-field-group" style={{marginBottom:0}}>
                      <label>Chapters Released</label>
                      <input className="field" type="number" min={0} value={form.chaptersReleased||0}
                        onChange={e=>set('chaptersReleased', Number(e.target.value))}
                        placeholder="e.g. 5" />
                      <small style={{color:'var(--muted)'}}>Chapters available now</small>
                    </div>
                    <div className="adm-field-group" style={{marginBottom:0}}>
                      <label>Total Planned Chapters</label>
                      <input className="field" type="number" min={0} value={form.totalChapters||0}
                        onChange={e=>set('totalChapters', Number(e.target.value))}
                        placeholder="e.g. 24 (0 = unknown)" />
                      <small style={{color:'var(--muted)'}}>0 = not announced yet</small>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="adm-field-group adm-col-2" style={{borderTop:'1px solid var(--dim)',paddingTop:18,marginTop:4}}>
              <label style={{color:'var(--gold)',fontWeight:700,fontSize:'0.88rem',textTransform:'uppercase',letterSpacing:1}}>Book Content - Online Reader</label>
              <div style={{background:'rgba(201,168,76,0.06)',border:'1px solid rgba(201,168,76,0.2)',borderRadius:'var(--r-sm)',padding:'10px 14px',marginBottom:14,fontSize:'0.76rem',color:'var(--muted)',lineHeight:1.7}}>
                <strong style={{color:'var(--gold)'}}>How to paste chapters:</strong> Copy the text from Word/Google Docs and paste directly. Paragraphs separated by blank lines will render correctly. Each chapter is saved separately — no size limit.
              </div>
              {(form.chapters||[]).map((ch,i)=>{
                const words = (ch.text||'').trim().split(/\s+/).filter(Boolean).length;
                return (
                  <div key={i} style={{background:'rgba(255,255,255,0.02)',border:'1px solid var(--dim)',borderRadius:'var(--r-sm)',padding:14,marginBottom:12}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                      <span style={{fontSize:'0.85rem',color:'var(--gold)',fontWeight:700}}>Chapter {i+1}</span>
                      <div style={{display:'flex',gap:8,alignItems:'center'}}>
                        {words > 0 && <span style={{fontSize:'0.72rem',color:'var(--muted)'}}>{words.toLocaleString()} words · {(ch.text||'').length.toLocaleString()} chars</span>}
                        <button type="button" className="adm-act-btn adm-act-del" style={{fontSize:'0.7rem',padding:'2px 8px'}}
                          onClick={()=>set('chapters',form.chapters.filter((_,j)=>j!==i))}>Remove</button>
                      </div>
                    </div>
                    <div className="adm-field-group" style={{marginBottom:10}}>
                      <label>Chapter Title</label>
                      <input className="field" value={ch.title||''} placeholder="e.g. Chapter 1 — The Beginning"
                        onChange={e=>set('chapters',form.chapters.map((c,j)=>j===i?{...c,title:e.target.value}:c))}/>
                    </div>
                    <div className="adm-field-group" style={{marginBottom:10}}>
                      <label>Chapter Subtitle <span style={{color:'var(--muted)',fontWeight:400,fontSize:'0.72rem'}}>(optional — appears below chapter title in reader)</span></label>
                      <input className="field" value={ch.subtitle||''} placeholder="e.g. A Young Man With Big Dreams · Karen, Nairobi — 2013"
                        onChange={e=>set('chapters',form.chapters.map((c,j)=>j===i?{...c,subtitle:e.target.value}:c))}/>
                    </div>
                    <div className="adm-field-group" style={{marginBottom:0}}>
                      <label>Chapter Text <span style={{color:'var(--muted)',fontWeight:400,fontSize:'0.72rem'}}>(paste from Word / Google Docs)</span></label>
                      <textarea className="field" rows={20} value={ch.text||''} placeholder="Paste full chapter text here...&#10;&#10;Paragraphs separated by blank lines will display correctly in the reader."
                        style={{resize:'vertical',fontFamily:'Georgia,serif',lineHeight:1.9,fontSize:'0.9rem',minHeight:320}}
                        onChange={e=>set('chapters',form.chapters.map((c,j)=>j===i?{...c,text:e.target.value}:c))}/>
                    </div>
                    <div className="adm-field-group" style={{marginBottom:0,marginTop:10}}>
                      <label>End-of-Chapter Message <span style={{color:'var(--muted)',fontWeight:400,fontSize:'0.72rem'}}>(shown to reader at the bottom of this chapter)</span></label>
                      <input className="field" value={ch.endMessage||''} placeholder={`— End of Chapter ${i+1} —`}
                        onChange={e=>set('chapters',form.chapters.map((c,j)=>j===i?{...c,endMessage:e.target.value}:c))}/>
                      <span style={{fontSize:'0.68rem',color:'var(--muted)',marginTop:3,display:'block'}}>Leave blank to auto-generate: "— End of Chapter {i+1} —"</span>
                    </div>
                  </div>
                );
              })}
              <button type="button" className="btn btn-ghost btn-sm" style={{width:'100%',marginTop:4}}
                onClick={()=>set('chapters',[...(form.chapters||[]),{title:'Chapter '+((form.chapters||[]).length+1),text:''}])}>
                + Add Chapter
              </button>
            </div>

          </div>
          <div className="adm-bookform-footer">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '⏳ Saving…' : (form.id ? 'Save Changes' : 'Add Book')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}


// ── UserLibrariesTab ─────────────────────────────────────────────────────────
function UserLibrariesTab({ users, books, showToast }) {
  const [libs,        setLibs]        = useState({});
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [expanded,    setExpanded]    = useState({});
  const [busy,        setBusy]        = useState({});
  // Deactivation modal state
  const [deactModal,  setDeactModal]  = useState(null); // { userEmail, bookId, title, mode: 'full'|'read'|'download' }
  const [deactReason, setDeactReason] = useState('');
  // Add book modal
  const [addModal,    setAddModal]    = useState(null); // userEmail

  const libDocId = email => (email||'').toLowerCase().replace(/[^a-z0-9]/g,'_');

  const loadLibs = (userList) => {
    const nonAdmin = userList.filter(u => u.role === 'user');
    if (!nonAdmin.length) { setLoading(false); return; }
    let done = 0; const result = {};
    nonAdmin.forEach(u => {
      getDoc(doc(db,'libraries',libDocId(u.email)))
        .then(snap => { result[u.email.toLowerCase()] = snap.exists() ? (snap.data().books || []) : []; })
        .catch(() => { result[u.email.toLowerCase()] = []; })
        .finally(() => { done++; if (done === nonAdmin.length) { setLibs({ ...result }); setLoading(false); } });
    });
  };

  useEffect(() => { loadLibs(users); }, [users]); // eslint-disable-line

  // Deactivate with reason — mode: 'full' | 'read' | 'download'
  const applyDeactivation = async () => {
    if (!deactModal) return;
    const { userEmail, bookId, mode } = deactModal;
    const key = userEmail.toLowerCase();
    const busyKey = key + '_' + bookId;
    setBusy(b => ({ ...b, [busyKey]: true }));
    try {
      const ref  = doc(db, 'libraries', libDocId(userEmail));
      const snap = await getDoc(ref);
      if (!snap.exists()) { showToast('No library for ' + userEmail); return; }
      const existing = snap.data().books || [];
      const updated  = existing.map(b => {
        if (b.id !== bookId) return b;
        if (mode === 'full')     return { ...b, active: false, readDeactivated: true, downloadDeactivated: true, deactivationReason: deactReason || 'Access restricted by administrator.' };
        if (mode === 'read')     return { ...b, readDeactivated: true,     deactivationReason: deactReason || 'Online reading restricted by administrator.' };
        if (mode === 'download') return { ...b, downloadDeactivated: true, deactivationReason: deactReason || 'Downloads restricted by administrator.' };
        return b;
      });
      await setDoc(ref, { books: updated }, { merge: true });
      setLibs(prev => ({ ...prev, [key]: updated }));
      showToast('✅ Book access updated for ' + userEmail.split('@')[0]);
      setDeactModal(null); setDeactReason('');
    } catch (e) { showToast('Error: ' + e.message); }
    finally { setBusy(b => { const n={...b}; delete n[busyKey]; return n; }); }
  };

  // Reactivate — restore all access
  const reactivateBook = async (userEmail, bookId) => {
    const key = userEmail.toLowerCase();
    const busyKey = key + '_' + bookId;
    setBusy(b => ({ ...b, [busyKey]: true }));
    try {
      const ref  = doc(db, 'libraries', libDocId(userEmail));
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const existing = snap.data().books || [];
      const updated  = existing.map(b => b.id === bookId
        ? { ...b, active: true, readDeactivated: false, downloadDeactivated: false, deactivationReason: '' }
        : b
      );
      await setDoc(ref, { books: updated }, { merge: true });
      setLibs(prev => ({ ...prev, [key]: updated }));
      showToast('✅ Full access restored for ' + userEmail.split('@')[0]);
    } catch (e) { showToast('Error: ' + e.message); }
    finally { setBusy(b => { const n={...b}; delete n[busyKey]; return n; }); }
  };

  // Remove book from library
  const removeBook = async (userEmail, bookId) => {
    if (!window.confirm('Remove this book from ' + userEmail.split('@')[0] + "'s library? They will lose access permanently.")) return;
    const key = userEmail.toLowerCase();
    try {
      const ref  = doc(db, 'libraries', libDocId(userEmail));
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const updated = (snap.data().books || []).filter(b => b.id !== bookId);
      await setDoc(ref, { books: updated }, { merge: true });
      setLibs(prev => ({ ...prev, [key]: updated }));
      showToast('📕 Book removed from ' + userEmail.split('@')[0] + "'s library");
    } catch (e) { showToast('Error: ' + e.message); }
  };

  // Add book back to user library
  const addBook = async (userEmail, bookToAdd) => {
    const key = userEmail.toLowerCase();
    try {
      const ref  = doc(db, 'libraries', libDocId(userEmail));
      const snap = await getDoc(ref);
      const existing = snap.exists() ? (snap.data().books || []) : [];
      if (existing.find(b => b.id === bookToAdd.id)) { showToast('User already has this book'); return; }
      const updated = [...existing, { ...bookToAdd, downloadUnlocked: true, active: true }];
      await setDoc(ref, { books: updated }, { merge: true });
      setLibs(prev => ({ ...prev, [key]: updated }));
      showToast('✅ "' + bookToAdd.title + '" added to ' + userEmail.split('@')[0] + "'s library");
      setAddModal(null);
    } catch (e) { showToast('Error: ' + e.message); }
  };

  const filteredUsers = users.filter(u =>
    u.role === 'user' &&
    (u.name.toLowerCase().includes(search.toLowerCase()) ||
     u.email.toLowerCase().includes(search.toLowerCase()))
  );

  const totalBooks = Object.values(libs).reduce((s, arr) => s + arr.length, 0);

  return (
    <div className="adm-page">
      {/* Deactivation modal */}
      {deactModal && (
        <div className="adm-overlay">
          <div className="adm-confirm card" style={{ maxWidth:460, textAlign:'left' }}>
            <h3 style={{ marginBottom:8 }}>Restrict Book Access</h3>
            <p style={{ fontSize:'0.82rem', color:'var(--muted)', marginBottom:16 }}>
              <strong style={{ color:'var(--gold)' }}>{deactModal.title}</strong> for {deactModal.userEmail.split('@')[0]}
            </p>
            <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
              {['full','read','download'].map(m => (
                <button key={m} type="button"
                  className={'adm-toggle' + (deactModal.mode === m ? ' on' : '')}
                  onClick={() => setDeactModal(d => ({ ...d, mode: m }))}>
                  {m === 'full' ? '🔒 Block All' : m === 'read' ? '📖 Block Reading' : '⬇ Block Download'}
                </button>
              ))}
            </div>
            <div className="adm-field-group" style={{ marginBottom:16 }}>
              <label>Reason shown to user</label>
              <input className="field" value={deactReason}
                onChange={e => setDeactReason(e.target.value)}
                placeholder="e.g. Payment issue — contact support to restore access" />
            </div>
            <div className="adm-confirm-btns">
              <button className="btn btn-primary btn-sm" onClick={applyDeactivation}>Apply</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setDeactModal(null); setDeactReason(''); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Add book modal */}
      {addModal && (
        <div className="adm-overlay">
          <div className="adm-confirm card" style={{ maxWidth:540, textAlign:'left' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <h3>Add Book to {addModal.split('@')[0]}'s Library</h3>
              <button className="adm-close-btn" onClick={() => setAddModal(null)}>✕</button>
            </div>
            <p style={{ fontSize:'0.8rem', color:'var(--muted)', marginBottom:14 }}>Select a book to grant access. The user will be able to read and download it immediately.</p>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:8, maxHeight:320, overflowY:'auto' }}>
              {books.filter(b => {
                const userLib = libs[addModal] || [];
                return !userLib.find(lb => lb.id === b.id);
              }).map(b => (
                <button key={b.id} type="button" onClick={() => addBook(addModal, b)}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background:'rgba(255,255,255,0.03)', border:'1px solid var(--dim)', borderRadius:'var(--r-sm)', cursor:'pointer', textAlign:'left', width:'100%' }}>
                  {b.coverType === 'photo' && b.cover
                    ? <img src={b.cover} alt="" style={{ width:26, height:38, objectFit:'cover', borderRadius:3, flexShrink:0 }} />
                    : <div style={{ width:26, height:38, background:b.coverColor||'#1a1a3a', borderRadius:3, flexShrink:0 }} />
                  }
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:'0.78rem', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'var(--text)' }}>{b.title}</div>
                    <div style={{ fontSize:'0.68rem', color:'var(--muted)' }}>KSh {b.price}</div>
                  </div>
                </button>
              ))}
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:14 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setAddModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <div className="adm-page-head">
        <div>
          <h1>User Libraries</h1>
          <span className="adm-page-sub">{filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''} · {totalBooks} total books owned</span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => { setLoading(true); setLibs({}); loadLibs(users); }}>Refresh</button>
      </div>

      <div className="adm-toolbar card" style={{ marginBottom:16 }}>
        <input className="field adm-search" placeholder="Search users by name or email..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <span className="adm-toolbar-count">{filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'60px', color:'var(--muted)' }}>
          <div className="adm-photo-spinner" style={{ margin:'0 auto 16px' }} />Loading user libraries...
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="adm-empty"><p>No users found.</p></div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {filteredUsers.map(u => {
            const userBooks = libs[u.email.toLowerCase()] || [];
            const isOpen    = !!expanded[u.email];
            return (
              <div key={u.id} className="card" style={{ overflow:'hidden' }}>
                <div onClick={() => setExpanded(p => ({ ...p, [u.email]: !p[u.email] }))}
                  style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 20px', cursor:'pointer', borderBottom: isOpen ? '1px solid var(--dim)' : 'none' }}>
                  <div className="adm-user-avatar" style={{ flexShrink:0 }}>{u.name.charAt(0)}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <strong style={{ fontSize:'0.92rem' }}>{u.name}</strong>
                    <span style={{ display:'block', fontSize:'0.75rem', color:'var(--muted)' }}>{u.email}</span>
                  </div>
                  <div style={{ background: userBooks.length > 0 ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.04)', border: userBooks.length > 0 ? '1px solid rgba(201,168,76,0.3)' : '1px solid var(--dim)', borderRadius:20, padding:'3px 12px', fontSize:'0.78rem', fontWeight:600, color: userBooks.length > 0 ? 'var(--gold)' : 'var(--muted)', flexShrink:0 }}>
                    {userBooks.length} book{userBooks.length !== 1 ? 's' : ''}
                  </div>
                  <span style={{ fontSize:'0.75rem', color:'var(--muted)', flexShrink:0 }}>{isOpen ? '▲' : '▼'}</span>
                </div>

                {isOpen && (
                  <div style={{ padding:'12px 16px' }}>
                    {/* Add book button */}
                    <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:10 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => setAddModal(u.email.toLowerCase())}>
                        + Add Book to Library
                      </button>
                    </div>
                    {userBooks.length === 0 ? (
                      <div style={{ padding:'16px 0', color:'var(--muted)', fontSize:'0.85rem', textAlign:'center' }}>This user has no books yet.</div>
                    ) : (
                      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                        {userBooks.map(lb => {
                          const cat        = books.find(b => b.id === lb.id);
                          const title      = cat?.title      || lb.title || lb.id;
                          const cover      = cat?.cover      || lb.cover;
                          const coverType  = cat?.coverType  || lb.coverType;
                          const coverColor = cat?.coverColor || lb.coverColor || '#1a1a3a';
                          const coverAccent= cat?.coverAccent|| '#c9a84c';
                          const isFullOff  = lb.active === false;
                          const isReadOff  = lb.readDeactivated === true;
                          const isDlOff    = lb.downloadDeactivated === true;
                          const anyOff     = isFullOff || isReadOff || isDlOff;
                          const busyKey    = u.email.toLowerCase() + '_' + lb.id;
                          return (
                            <div key={lb.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', borderRadius:'var(--r-sm)', background: anyOff ? 'rgba(231,76,60,0.05)' : 'rgba(255,255,255,0.03)', border: anyOff ? '1px solid rgba(231,76,60,0.2)' : '1px solid var(--dim)' }}>
                              {coverType==='photo' && cover
                                ? <img src={cover} alt="" style={{ width:32,height:44,objectFit:'cover',borderRadius:4,flexShrink:0 }} />
                                : <div style={{ width:32,height:44,background:coverColor,borderRadius:4,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.55rem',color:coverAccent }}>EH</div>
                              }
                              <div style={{ flex:1, minWidth:0 }}>
                                <strong style={{ fontSize:'0.85rem', display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{title}</strong>
                                <span style={{ fontSize:'0.72rem', color:'var(--muted)' }}>
                                  {lb.downloadUnlocked ? 'Download unlocked' : 'Read only'}
                                  {isFullOff  && <span style={{ color:'#e74c3c', marginLeft:6 }}>· All access off</span>}
                                  {!isFullOff && isReadOff   && <span style={{ color:'#e67e22', marginLeft:6 }}>· Reading off</span>}
                                  {!isFullOff && isDlOff     && <span style={{ color:'#e67e22', marginLeft:6 }}>· Download off</span>}
                                </span>
                                {lb.deactivationReason && <span style={{ display:'block', fontSize:'0.68rem', color:'var(--muted)', fontStyle:'italic', marginTop:2 }}>"{lb.deactivationReason}"</span>}
                              </div>
                              {/* Status chip */}
                              <span style={{ flexShrink:0, fontSize:'0.68rem', padding:'2px 8px', borderRadius:10, background: anyOff ? 'rgba(231,76,60,0.12)' : 'rgba(46,204,113,0.12)', color: anyOff ? '#e74c3c' : '#2ecc71', border: anyOff ? '1px solid rgba(231,76,60,0.3)' : '1px solid rgba(46,204,113,0.3)' }}>
                                {isFullOff ? 'BLOCKED' : isReadOff ? 'READ OFF' : isDlOff ? 'DL OFF' : 'ACTIVE'}
                              </span>
                              {/* Restrict button */}
                              {!anyOff ? (
                                <button disabled={!!busy[busyKey]} className="adm-flag-btn on"
                                  onClick={() => setDeactModal({ userEmail: u.email, bookId: lb.id, title, mode:'full' })}>
                                  Restrict
                                </button>
                              ) : (
                                <button disabled={!!busy[busyKey]} className="adm-flag-btn"
                                  style={{ borderColor:'#2ecc71', color:'#2ecc71' }}
                                  onClick={() => reactivateBook(u.email, lb.id)}>
                                  {busy[busyKey] ? '…' : 'Restore'}
                                </button>
                              )}
                              {/* Remove button */}
                              <button onClick={() => removeBook(u.email, lb.id)} className="adm-act-btn adm-act-del" title="Remove from library permanently">Remove</button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ── SiteControlsPanel ────────────────────────────────────────────────────────
function SiteControlsPanel({ siteControls, saveSiteControls, showToast, isSuper }) {
  const sc = siteControls || {};
  const toggle = async (key) => {
    const updated = { ...sc, [key]: !sc[key] };
    await saveSiteControls(updated);
    showToast((updated[key] ? '✅ Enabled: ' : '❌ Disabled: ') + key.replace(/([A-Z])/g,' $1').toLowerCase());
  };

  const setInterval_ = async (val) => {
    const updated = { ...sc, autoRefreshInterval: val };
    await saveSiteControls(updated);
    showToast(`✅ Auto-refresh interval set to ${val} minutes`);
  };

  const controls = [
    { key:'disableRightClick', icon:'🖱️', label:'Disable Right-Click',       desc:'Blocks context menu site-wide. Prevents image/text saving via right-click.', danger:false },
    { key:'disableTextSelect', icon:'🔤', label:'Disable Text Selection',     desc:'Users cannot select or highlight any text on the site.', danger:false },
    { key:'disableCopy',       icon:'📋', label:'Disable Copy & Cut',         desc:'Ctrl+C and Ctrl+X are blocked site-wide.', danger:false },
    { key:'disableDevTools',   icon:'🔧', label:'Block DevTools Shortcuts',   desc:'Blocks F12, Ctrl+Shift+I/J/C, Ctrl+U to deter code inspection.', danger:false },
    { key:'disablePrint',      icon:'🖨️', label:'Disable Printing',           desc:'Prevents Ctrl+P and browser print dialog from opening.', danger:false },
    { key:'watermarkAll',      icon:'💧', label:'Watermark All Content',      desc:'Show user name & email watermark on all book and image content.', danger:false },
    { key:'maintenanceMode',   icon:'🚧', label:'Maintenance Mode',           desc:'Shows a maintenance page to all non-admin visitors. Use during updates.', danger:true },
    { key:'disableRegistration',icon:'🚫',label:'Disable New Registrations',  desc:'Prevent new users from creating accounts.', danger:false },
    { key:'disableOrders',     icon:'🛒', label:'Disable All Orders',         desc:'Block all checkout and payment. No new orders can be placed.', danger:true },
    { key:'readOnlyMode',      icon:'📖', label:'Read-Only Mode',             desc:'Users can browse but cannot purchase, review, or interact.', danger:false },
  ];

  const refreshIntervals = [
    { label: '5 minutes',  value: 5 },
    { label: '10 minutes', value: 10 },
    { label: '15 minutes', value: 15 },
    { label: '30 minutes', value: 30 },
    { label: '1 hour',     value: 60 },
    { label: '2 hours',    value: 120 },
  ];

  const currentInterval = parseInt(sc.autoRefreshInterval, 10) || 30;

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>Site Controls</h1>
          <span className="adm-page-sub">Global security and access controls — changes take effect immediately for all users</span>
        </div>
      </div>

      <div style={{ background:'rgba(201,168,76,0.07)', border:'1px solid rgba(201,168,76,0.25)', borderRadius:'var(--r-sm)', padding:'12px 18px', marginBottom:24, fontSize:'0.84rem' }}>
        ⚡ <strong style={{ color:'var(--gold)' }}>Real-time:</strong> All changes are saved to Firestore and take effect instantly for every visitor — no page reload required.
      </div>

      {/* ── Auto Refresh Section ── */}
      <div className="card" style={{ padding:'20px 24px', marginBottom:20, border: sc.autoRefreshEnabled ? '1px solid rgba(74,158,255,0.35)' : '1px solid var(--border)', background: sc.autoRefreshEnabled ? 'rgba(74,158,255,0.04)' : 'rgba(255,255,255,0.02)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          <span style={{ fontSize:'1.8rem', flexShrink:0 }}>🔄</span>
          <div style={{ flex:1, minWidth:0 }}>
            <strong style={{ fontSize:'0.92rem', display:'block', marginBottom:3 }}>Auto Page Refresh</strong>
            <span style={{ fontSize:'0.78rem', color:'var(--muted)' }}>
              Automatically reload the page for all regular users after the set interval. Keeps book data, prices, and content fresh without manual reload. Admins are never auto-refreshed.
            </span>
            {sc.autoRefreshEnabled && (
              <span style={{ display:'inline-block', marginTop:6, fontSize:'0.72rem', padding:'2px 8px', borderRadius:10, background:'rgba(74,158,255,0.12)', color:'#4a9eff', border:'1px solid rgba(74,158,255,0.3)' }}>
                🟢 Active — refreshing every {currentInterval} min for all users
              </span>
            )}
          </div>
          <button
            onClick={() => toggle('autoRefreshEnabled')}
            style={{ flexShrink:0, minWidth:64, padding:'8px 16px', borderRadius:'var(--r-sm)', border:'none', cursor:'pointer', fontWeight:700, fontSize:'0.82rem',
              background: sc.autoRefreshEnabled ? 'rgba(74,158,255,0.2)' : 'rgba(255,255,255,0.06)',
              color: sc.autoRefreshEnabled ? '#4a9eff' : 'var(--muted)',
              transition:'all 0.2s',
            }}>
            {sc.autoRefreshEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Interval selector — only shown when enabled */}
        {sc.autoRefreshEnabled && (
          <div style={{ marginTop:16, paddingTop:14, borderTop:'1px solid rgba(255,255,255,0.06)', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
            <span style={{ fontSize:'0.82rem', color:'var(--muted)', flexShrink:0 }}>Refresh every:</span>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {refreshIntervals.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setInterval_(opt.value)}
                  style={{
                    padding:'5px 14px', borderRadius:20, border:'none', cursor:'pointer',
                    fontSize:'0.78rem', fontWeight:600, transition:'all 0.15s',
                    background: currentInterval === opt.value ? '#4a9eff' : 'rgba(255,255,255,0.07)',
                    color:       currentInterval === opt.value ? '#fff'   : 'var(--muted)',
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>
            <span style={{ fontSize:'0.75rem', color:'var(--muted)', marginLeft:'auto' }}>
              Current: <strong style={{ color:'#4a9eff' }}>{currentInterval} min</strong>
            </span>
          </div>
        )}
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {controls.map(ctrl => (
          <div key={ctrl.key} className="card" style={{ display:'flex', alignItems:'center', gap:16, padding:'16px 20px', border: sc[ctrl.key] ? (ctrl.danger ? '1px solid rgba(231,76,60,0.4)' : '1px solid rgba(201,168,76,0.3)') : '1px solid var(--dim)', background: sc[ctrl.key] ? (ctrl.danger ? 'rgba(231,76,60,0.06)' : 'rgba(201,168,76,0.04)') : 'rgba(255,255,255,0.02)' }}>
            <span style={{ fontSize:'1.8rem', flexShrink:0 }}>{ctrl.icon}</span>
            <div style={{ flex:1, minWidth:0 }}>
              <strong style={{ fontSize:'0.92rem', display:'block', marginBottom:3 }}>{ctrl.label}</strong>
              <span style={{ fontSize:'0.78rem', color:'var(--muted)' }}>{ctrl.desc}</span>
              {ctrl.danger && sc[ctrl.key] && (
                <span style={{ display:'inline-block', marginTop:4, fontSize:'0.72rem', padding:'2px 8px', borderRadius:10, background:'rgba(231,76,60,0.12)', color:'#e74c3c', border:'1px solid rgba(231,76,60,0.3)' }}>
                  ⚠ Active — affecting all users
                </span>
              )}
            </div>
            <button
              onClick={() => toggle(ctrl.key)}
              style={{ flexShrink:0, minWidth:64, padding:'8px 16px', borderRadius:'var(--r-sm)', border:'none', cursor:'pointer', fontWeight:700, fontSize:'0.82rem',
                background: sc[ctrl.key] ? (ctrl.danger ? '#e74c3c' : 'rgba(201,168,76,0.2)') : 'rgba(255,255,255,0.06)',
                color: sc[ctrl.key] ? (ctrl.danger ? '#fff' : 'var(--gold)') : 'var(--muted)',
                transition:'all 0.2s',
              }}>
              {sc[ctrl.key] ? 'ON' : 'OFF'}
            </button>
          </div>
        ))}
      </div>

      {/* Print disabling via CSS injection */}
      {sc.disablePrint && (
        <style>{`@media print { body { display: none !important; } }`}</style>
      )}
    </div>
  );
}

// ── NotificationsPanel ───────────────────────────────────────────────────────
const REVERT_REASONS = [
  'Sent by mistake',
  'Book not yet available',
  'Wrong user notified',
  'Notification sent to wrong book',
  'User requested re-notification',
  'Technical error',
  'Other',
];

function RevertModal({ notif, bookTitle, onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  const [custom, setCustom] = useState('');
  const [busy, setBusy]     = useState(false);

  const handleConfirm = async () => {
    const finalReason = reason === 'Other' ? custom.trim() : reason;
    if (!finalReason) { return; }
    setBusy(true);
    await onConfirm(notif, finalReason);
    setBusy(false);
    onClose();
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'var(--surface,#1a1a2e)', border:'1px solid var(--dim)', borderRadius:'var(--r)', padding:24, width:'100%', maxWidth:420 }}>
        <h3 style={{ margin:'0 0 4px', fontSize:'1rem' }}>Revert Notification</h3>
        <p style={{ margin:'0 0 16px', fontSize:'0.8rem', color:'var(--muted)' }}>
          Revert <strong>{notif.name || notif.email}</strong> for "{bookTitle}" back to <em>pending</em>.
        </p>
        <p style={{ margin:'0 0 8px', fontSize:'0.82rem', fontWeight:600 }}>Reason for reverting:</p>
        <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:12 }}>
          {REVERT_REASONS.map(r => (
            <label key={r} style={{ display:'flex', alignItems:'center', gap:8, fontSize:'0.82rem', cursor:'pointer' }}>
              <input type="radio" name="revert-reason" value={r} checked={reason===r} onChange={() => setReason(r)} />
              {r}
            </label>
          ))}
        </div>
        {reason === 'Other' && (
          <textarea
            placeholder="Describe the reason…"
            value={custom}
            onChange={e => setCustom(e.target.value)}
            rows={2}
            style={{ width:'100%', background:'rgba(255,255,255,0.04)', border:'1px solid var(--dim)', borderRadius:'var(--r-sm)', color:'inherit', padding:'8px 10px', fontSize:'0.82rem', resize:'vertical', boxSizing:'border-box', marginBottom:12 }}
          />
        )}
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-danger btn-sm" onClick={handleConfirm} disabled={busy || !reason || (reason==='Other' && !custom.trim())}>
            {busy ? '⏳ Reverting…' : '↩ Revert'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NotificationsPanel({ books, showToast, saveBook, addLog }) {
  const [notifs, setNotifs]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [sending, setSending]     = useState({});
  const [fetchErr, setFetchErr]   = useState('');
  const [revertTarget, setRevertTarget] = useState(null); // { notif, bookTitle }

  useEffect(() => {
    setFetchErr('');
    // Read from contact_messages (type='notification') — no orderBy to avoid index requirement
    const unsub = onSnapshot(
      collection(db, 'contact_messages'),
      snap => {
        const docs = snap.docs
          .map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toMillis?.() || 0 }))
          .filter(d => d.type === 'notification')
          .sort((a, b) => b.createdAt - a.createdAt);
        setNotifs(docs);
        setLoading(false);
        setFetchErr('');
      },
      err => {
        setFetchErr('Could not load notifications: ' + err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Group by book
  const byBook = {};
  notifs.forEach(n => {
    const bookId = n.bookId;
    const bookTitle = n.bookTitle || n.subject?.replace('🔔 Book Notification Request — ', '') || 'Unknown';
    if (!byBook[bookId]) byBook[bookId] = { title: bookTitle, status: n.status, items: [] };
    byBook[bookId].items.push(n);
  });

  const sendNotification = async (bookId) => {
    setSending(s => ({ ...s, [bookId]: true }));
    const group = byBook[bookId];
    const pendingItems = group.items.filter(n => !n.notified);
    const book = books?.find(b => b.id === bookId);
    const bookUrl = `${window.location.origin}/book/${bookId}`;

    try {
      // 1. Mark all as notified in contact_messages
      await Promise.all(group.items.map(n =>
        setDoc(doc(db, 'contact_messages', n.id), { notified: true, notifiedAt: serverTimestamp(), status: 'notified' }, { merge: true })
      ));

      // 2. Best-effort mark in legacy notifications collection
      await Promise.all(group.items.map(n => {
        const notifKey = `notify_${bookId}_${(n.email||'').replace(/[^a-z0-9]/gi,'_').toLowerCase()}`;
        return setDoc(doc(db, 'notifications', notifKey), { notified: true, notifiedAt: serverTimestamp() }, { merge: true }).catch(() => {});
      }));

      // 3. Write in-app dashboard notification for each pending user
      await Promise.all(pendingItems.map(n => {
        const emailSlug = (n.email||'').replace(/[^a-z0-9]/gi,'_').toLowerCase();
        const inAppKey  = `inapp_${bookId}_${emailSlug}`;
        const msgText   = `"${group.title}" is now available! Tap to read it on Ellines Haven.`;
        return Promise.all([
          // In-app bell notification
          setDoc(doc(db, 'user_notifications', inAppKey), {
            userEmail:   (n.email||'').toLowerCase(),
            userId:      n.userId || '',
            type:        'book_ready',
            title:       `📖 ${group.title} is now available!`,
            message:     msgText,
            bookId:      bookId,
            bookTitle:   group.title,
            bookUrl:     bookUrl,
            read:        false,
            createdAt:   serverTimestamp(),
            sentByAdmin: true,
          }, { merge: true }),
          // Direct message in their Messages inbox
          setDoc(doc(db, 'contact_messages', `dm_ready_${inAppKey}`), {
            name:       n.name || n.email,
            email:      (n.email||'').toLowerCase(),
            userId:     n.userId || '',
            subject:    `📖 "${group.title}" is now available!`,
            message:    `Hi ${n.name || 'there'},\n\n"${group.title}" is now ready for you to read!\n\n${book?.description ? book.description.slice(0, 200) + '…\n\n' : ''}Head over to your library or click the link below to start reading:\n${bookUrl}\n\nHappy reading! 📚\n— Ellines Haven Team`,
            type:       'direct',
            status:     'replied',
            threadId:   `dm_ready_${inAppKey}`,
            createdAt:  serverTimestamp(),
            lastMsg:    `"${group.title}" is now available! Click to read.`,
            lastMsgAt:  serverTimestamp(),
            lastSender: 'admin',
            userRead:   false,
            fromAdmin:  true,
            adminEmail: 'ellines.haven@gmail.com',
            adminName:  'Ellines Haven',
            bookId:     bookId,
            bookTitle:  group.title,
          }).then(() =>
            // Seed the thread subcollection so the user sees the message body
            setDoc(doc(db, 'contact_messages', `dm_ready_${inAppKey}`, 'messages', 'msg_0'), {
              text:        `Hi ${n.name || 'there'},\n\n"${group.title}" is now ready for you to read!\n\n${book?.description ? book.description.slice(0, 200) + '…\n\n' : ''}Head over to your library or click the link below:\n${bookUrl}\n\nHappy reading! 📚\n— Ellines Haven Team`,
              sender:      'admin',
              senderName:  'Ellines Haven',
              senderEmail: 'ellines.haven@gmail.com',
              createdAt:   serverTimestamp(),
            })
          ),
        ]);
      }));

      setNotifs(prev => prev.map(n => n.bookId === bookId ? { ...n, notified: true, status: 'notified' } : n));
      addLog('system', `Notifications sent for "${group.title}" to ${pendingItems.length} user(s) — email + in-app`);
      showToast(`✅ Notified ${pendingItems.length} user(s) for "${group.title}" — inbox + bell notification sent`);
    } catch (e) {
      showToast('❌ Error: ' + e.message);
    }
    setSending(s => ({ ...s, [bookId]: false }));
  };

  const revertNotification = async (notif, reason) => {
    try {
      await setDoc(doc(db, 'contact_messages', notif.id), {
        notified: false,
        notifiedAt: null,
        status: 'pending',
        revertedAt: serverTimestamp(),
        revertReason: reason,
      }, { merge: true });
      // Best-effort revert in notifications collection too
      const notifKey = `notify_${notif.bookId}_${(notif.email||'').replace(/[^a-z0-9]/gi,'_').toLowerCase()}`;
      setDoc(doc(db, 'notifications', notifKey), { notified: false, notifiedAt: null, revertedAt: serverTimestamp(), revertReason: reason }, { merge: true }).catch(() => {});
      setNotifs(prev => prev.map(n => n.id === notif.id ? { ...n, notified: false, status: 'pending' } : n));
      addLog('system', `Notification reverted for "${notif.name || notif.email}" on "${notif.bookTitle || 'book'}" — Reason: ${reason}`);
      showToast(`↩ Reverted notification for ${notif.name || notif.email}`);
    } catch (e) {
      showToast('❌ Revert failed: ' + e.message);
    }
  };

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>Notifications</h1>
          <span className="adm-page-sub">Users who clicked "Notify Me" — send them a WhatsApp/email when their book is ready</span>
        </div>
      </div>

      <div style={{ background:'rgba(201,168,76,0.06)', border:'1px solid rgba(201,168,76,0.2)', borderRadius:'var(--r-sm)', padding:'12px 18px', marginBottom:20, fontSize:'0.82rem' }}>
        💡 When you mark a book as <strong style={{color:'var(--gold)'}}>Complete</strong> or change its status, click <strong>Send Notifications</strong> to alert all waiting users via WhatsApp. The system opens WhatsApp pre-filled for each user's number.
      </div>

      {fetchErr && (
        <div style={{ background:'rgba(231,76,60,0.1)', border:'1px solid rgba(231,76,60,0.35)', borderRadius:'var(--r-sm)', padding:'10px 14px', marginBottom:16, fontSize:'0.82rem', color:'#e74c3c' }}>
          ⚠️ {fetchErr}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'var(--muted)' }}>Loading notifications…</div>
      ) : Object.keys(byBook).length === 0 ? (
        <div className="adm-empty">
          <div style={{ fontSize:'3rem', marginBottom:12 }}>🔔</div>
          <p>No notification requests yet. When users click "Notify Me" on a book, they'll appear here.</p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {Object.entries(byBook).map(([bookId, group]) => {
            const book    = books.find(b => b.id === bookId);
            const pending = group.items.filter(n => !n.notified).length;
            const total   = group.items.length;
            return (
              <div key={bookId} className="card" style={{ padding:20 }}>
                <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:14 }}>
                  {book?.cover && book?.coverType === 'photo'
                    ? <img src={book.cover} alt="" style={{ width:44, height:60, objectFit:'cover', borderRadius:4, flexShrink:0 }} />
                    : <div style={{ width:44, height:60, background:book?.coverColor||'#1a1a3a', borderRadius:4, flexShrink:0 }} />
                  }
                  <div style={{ flex:1 }}>
                    <strong style={{ display:'block', marginBottom:4 }}>{group.title}</strong>
                    <span style={{ fontSize:'0.78rem', color:'var(--muted)' }}>
                      {total} request{total!==1?'s':''} · {pending} pending
                    </span>
                  </div>
                  {pending > 0 && (
                    <button className="btn btn-primary btn-sm" disabled={!!sending[bookId]}
                      onClick={() => sendNotification(bookId)}>
                      {sending[bookId] ? '⏳ Sending…' : `📣 Notify ${pending} User${pending!==1?'s':''}`}
                    </button>
                  )}
                  {pending === 0 && total > 0 && (
                    <span style={{ fontSize:'0.78rem', color:'var(--ok)' }}>✅ All notified</span>
                  )}
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {group.items.map(n => (
                    <div key={n.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'rgba(255,255,255,0.02)', borderRadius:'var(--r-sm)', border:'1px solid var(--dim)' }}>
                      <div style={{ width:28, height:28, borderRadius:'50%', background:'rgba(201,168,76,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.78rem', fontWeight:700, flexShrink:0 }}>
                        {(n.name||n.email||'?').charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex:1 }}>
                        <strong style={{ fontSize:'0.82rem' }}>{n.name || 'Unknown'}</strong>
                        <span style={{ display:'block', fontSize:'0.72rem', color:'var(--muted)' }}>{n.email}</span>
                      </div>
                      <span style={{ fontSize:'0.7rem', padding:'2px 8px', borderRadius:10, background: n.notified?'rgba(46,204,113,0.1)':'rgba(201,168,76,0.1)', color: n.notified?'var(--ok)':'var(--gold)', border: n.notified?'1px solid rgba(46,204,113,0.3)':'1px solid rgba(201,168,76,0.3)' }}>
                        {n.notified ? '✓ Notified' : '⏳ Pending'}
                      </span>
                      {/* Revert button — only shown when already notified */}
                      {n.notified && (
                        <button
                          onClick={() => setRevertTarget({ notif: n, bookTitle: group.title })}
                          title="Revert notification status back to pending"
                          style={{ fontSize:'0.7rem', padding:'3px 8px', borderRadius:'var(--r-sm)', background:'rgba(231,76,60,0.08)', color:'#e74c3c', border:'1px solid rgba(231,76,60,0.3)', cursor:'pointer', flexShrink:0 }}>
                          ↩ Revert
                        </button>
                      )}
                      {/* Quick WhatsApp link per user */}
                      <a href={`https://wa.me/254748255466?text=${encodeURIComponent('Hi ' + (n.name||'there') + ', "' + group.title + '" is now available! 📖 ' + window.location.origin + '/book/' + bookId)}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ fontSize:'0.72rem', padding:'3px 8px', borderRadius:'var(--r-sm)', background:'rgba(37,211,102,0.1)', color:'#25D366', border:'1px solid rgba(37,211,102,0.3)', textDecoration:'none', flexShrink:0 }}>
                        💬 WA
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Revert modal */}
      {revertTarget && (
        <RevertModal
          notif={revertTarget.notif}
          bookTitle={revertTarget.bookTitle}
          onConfirm={revertNotification}
          onClose={() => setRevertTarget(null)}
        />
      )}
    </div>
  );
}

// ── PromoCreateForm ───────────────────────────────────────────────────────────
function PromoCreateForm({ onSave }) {
  const [form, setForm] = useState({
    code: '', discount: '', type: 'Percentage', expires: '', maxUses: '', active: true,
  });
  const [err, setErr] = useState('');

  const randomCode = () => {
    const prefix = ['HAVEN','ELLINES','READ','BOOK','KENYA'][Math.floor(Math.random()*5)];
    setForm(f => ({ ...f, code: prefix + Math.floor(Math.random()*900+100) }));
  };

  const submit = e => {
    e.preventDefault();
    setErr('');
    if (!form.code.trim())     { setErr('Code is required'); return; }
    if (!form.discount.trim()) { setErr('Discount value is required'); return; }
    if (!form.expires)         { setErr('Expiry date is required'); return; }
    onSave({
      id: 'p_' + Date.now(),
      code:     form.code.trim().toUpperCase(),
      discount: form.discount.trim(),
      type:     form.type,
      expires:  form.expires,
      maxUses:  Number(form.maxUses) || 0,
      uses:     0,
      active:   form.active,
    });
    setForm({ code:'', discount:'', type:'Percentage', expires:'', maxUses:'', active:true });
  };

  return (
    <form onSubmit={submit}>
      {err && <div style={{ color:'#e74c3c', fontSize:'0.78rem', marginBottom:10 }}>{err}</div>}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr auto', gap:10, alignItems:'end' }}>
        <div className="adm-field-group" style={{ marginBottom:0 }}>
          <label>Code</label>
          <div style={{ display:'flex', gap:6 }}>
            <input className="field" value={form.code} onChange={e => setForm(f=>({...f,code:e.target.value.toUpperCase()}))}
              placeholder="e.g. SAVE20" style={{ textTransform:'uppercase', letterSpacing:1 }} />
            <button type="button" className="btn btn-ghost btn-sm" style={{ flexShrink:0 }} onClick={randomCode} title="Generate random code">🎲</button>
          </div>
        </div>
        <div className="adm-field-group" style={{ marginBottom:0 }}>
          <label>Discount</label>
          <input className="field" value={form.discount} onChange={e => setForm(f=>({...f,discount:e.target.value}))} placeholder="e.g. 20% or KSh 50" />
        </div>
        <div className="adm-field-group" style={{ marginBottom:0 }}>
          <label>Type</label>
          <select className="field" value={form.type} onChange={e => setForm(f=>({...f,type:e.target.value}))}>
            <option value="Percentage">Percentage</option>
            <option value="Fixed">Fixed (KSh)</option>
            <option value="Free Shipping">Free Shipping</option>
          </select>
        </div>
        <div className="adm-field-group" style={{ marginBottom:0 }}>
          <label>Expires</label>
          <input className="field" type="date" value={form.expires} onChange={e => setForm(f=>({...f,expires:e.target.value}))} />
        </div>
        <button type="submit" className="btn btn-primary btn-sm" style={{ marginBottom:0 }}>Create</button>
      </div>
    </form>
  );
}

function ManualUnlockForm({ books, showToast, onUnlock }) {
  const [email,    setEmail]    = useState('');
  const [selected, setSelected] = useState([]);
  const [busy,     setBusy]     = useState(false);

  const toggle = id => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const handleSubmit = e => {
    e.preventDefault();
    if (!email.trim() || selected.length === 0) { showToast('Enter email and select at least one book'); return; }
    setBusy(true);
    onUnlock(email.trim().toLowerCase(), selected);
    setEmail('');
    setSelected([]);
    setBusy(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,marginBottom:14}}>
        <input className="field" type="email" placeholder="Customer email e.g. lucymwask@gmail.com"
          value={email} onChange={e => setEmail(e.target.value)} required />
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !email || selected.length === 0}>
          {busy ? 'Unlocking...' : 'Unlock Selected Books'}
        </button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:8}}>
        {books.map(b => (
          <label key={b.id} style={{
            display:'flex',alignItems:'center',gap:10,padding:'8px 12px',
            background: selected.includes(b.id) ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.03)',
            border: selected.includes(b.id) ? '1px solid rgba(201,168,76,0.4)' : '1px solid var(--dim)',
            borderRadius:'var(--r-sm)',cursor:'pointer',transition:'all 0.15s',
          }}>
            <input type="checkbox" checked={selected.includes(b.id)} onChange={() => toggle(b.id)}
              style={{width:14,height:14,accentColor:'var(--gold)',flexShrink:0}} />
            {b.coverType === 'photo' && b.cover
              ? <img src={b.cover} alt="" style={{width:28,height:40,objectFit:'cover',borderRadius:3,flexShrink:0}} />
              : <div style={{width:28,height:40,background:b.coverColor||'#1a1a3a',borderRadius:3,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.55rem',color:b.coverAccent||'var(--gold)'}}>EH</div>
            }
            <div style={{minWidth:0}}>
              <div style={{fontSize:'0.8rem',fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{b.title}</div>
              <div style={{fontSize:'0.7rem',color:'var(--muted)'}}>KSh {b.price}</div>
            </div>
          </label>
        ))}
      </div>
      {selected.length > 0 && (
        <p style={{fontSize:'0.78rem',color:'var(--gold)',marginTop:10}}>
          {selected.length} book{selected.length !== 1 ? 's' : ''} selected — will be unlocked for {email || 'the email above'}
        </p>
      )}
    </form>
  );
}

/* ── ArchivesPanel ────────────────────────────────────────────────────────── */
/* ── TrashPanel / ArchivesPanel — handles ALL content types ─────────────── */
const TYPE_LABELS = {
  order:   { icon:'🛒', label:'Order',   color:'var(--gold)' },
  book:    { icon:'📚', label:'Book',    color:'#4a9eff'     },
  user:    { icon:'👤', label:'User',    color:'#a855f7'     },
  message: { icon:'💬', label:'Message', color:'#25D366'     },
  review:  { icon:'⭐', label:'Review',  color:'#e8832a'     },
};

function ItemSummary({ item }) {
  const type = item.type || 'order';
  if (type === 'order') return (
    <td style={{ fontSize:'0.78rem' }}>
      <div><strong>{item.userName || item.userEmail || '—'}</strong></div>
      <div style={{ color:'var(--muted)', fontSize:'0.72rem' }}>{item.userEmail}</div>
      <div style={{ color:'var(--muted)', fontSize:'0.72rem' }}>{(item.items||[]).map(b=>b.title).join(', ')}</div>
      {item.total && <div style={{ color:'var(--gold)', fontWeight:700 }}>KSh {item.total.toLocaleString()}</div>}
    </td>
  );
  if (type === 'book') return (
    <td style={{ fontSize:'0.78rem' }}>
      <strong>{item.title || '—'}</strong>
      <div style={{ color:'var(--muted)', fontSize:'0.72rem' }}>{item.genre} · {item.author}</div>
    </td>
  );
  if (type === 'user') return (
    <td style={{ fontSize:'0.78rem' }}>
      <strong>{item.name || '—'}</strong>
      <div style={{ color:'var(--muted)', fontSize:'0.72rem' }}>{item.email}</div>
    </td>
  );
  if (type === 'message') return (
    <td style={{ fontSize:'0.78rem' }}>
      <strong>{item.name || item.email || '—'}</strong>
      <div style={{ color:'var(--muted)', fontSize:'0.72rem' }}>{(item.message||'').slice(0,60)}{(item.message||'').length>60?'…':''}</div>
    </td>
  );
  if (type === 'review') return (
    <td style={{ fontSize:'0.78rem' }}>
      <strong>{item.user || '—'}</strong>
      <div style={{ color:'var(--muted)', fontSize:'0.72rem' }}>{item.book} · {'★'.repeat(item.rating||0)}</div>
    </td>
  );
  return <td style={{ fontSize:'0.78rem', color:'var(--muted)' }}>{item.id}</td>;
}

// ── Orders Panel Component ────────────────────────────────────────────────────
function OrdersPanel({
  allOrders, filteredOrders, orderFilter, setOrderFilter,
  pendingCount, revenue, isSuper,
  handleConfirmOrder, handleRejectOrder, handleArchiveOrder, handleDeleteOrder,
  books, unlockBooksForBuyer, showToast, setTick, setLiveOrders, syncOrders, user,
}) {
  const [selected,    setSelected]   = useState([]);
  const [bulkBusy,    setBulkBusy]   = useState(false);
  const [bulkAction,  setBulkAction] = useState('');
  const [refundModal, setRefundModal]= useState(null);

  const manualPending = allOrders.filter(o =>
    o.status === 'Pending' && !['paystack','mpesa_stk','card_auto'].includes(o.method)
  );
  const refundCount = allOrders.filter(o => o.status === 'Refunded').length;

  const toggleSelect = id =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () => {
    const ids = filteredOrders.map(o => o.id);
    setSelected(prev => prev.length === ids.length ? [] : ids);
  };

  const handleRefundOrder = async (orderId, note = '') => {
    await updateDoc(doc(db, 'orders', orderId), {
      status: 'Refunded', refundedAt: new Date().toISOString(),
      refundedBy: user?.email, ...(note ? { refundNote: note } : {}),
    });
    setLiveOrders(prev => prev.map(o => o.id === orderId ? { ...o, status:'Refunded', refundNote: note } : o));
  };

  const executeBulk = async (action) => {
    if (!selected.length) return;
    const label = selected.length === 1 ? '1 order' : `${selected.length} orders`;
    const msgs = { confirm:`Confirm ${label}? Books unlock.`, reject:`Reject ${label}?`, refund:`Mark ${label} as Refunded?`, archive:`Archive ${label}?`, delete:`Move ${label} to Trash?` };
    if (!window.confirm(msgs[action])) return;
    setBulkBusy(true); setBulkAction(action);
    for (const id of selected) {
      const o = allOrders.find(x => x.id === id);
      try {
        if (action === 'confirm') await handleConfirmOrder(id, o?.userName || '', true);
        else if (action === 'reject')  await handleRejectOrder(id, true);
        else if (action === 'archive') await handleArchiveOrder(id);
        else if (action === 'delete')  await handleDeleteOrder(id, true);
        else if (action === 'refund')  await handleRefundOrder(id);
      } catch {}
    }
    setSelected([]); setBulkBusy(false); setBulkAction('');
    showToast(`✅ ${label} — ${action} complete`);
  };

  const deleteUnconfirmed = async () => {
    const ids = allOrders.filter(o => o.status === 'Pending').map(o => o.id);
    if (!ids.length) { showToast('No pending orders'); return; }
    if (!window.confirm(`Delete all ${ids.length} unconfirmed orders?`)) return;
    setBulkBusy(true);
    for (const id of ids) await handleDeleteOrder(id, true);
    setBulkBusy(false);
    showToast(`🗑️ ${ids.length} unconfirmed orders deleted`);
  };

  const BULK_ACTIONS = [
    { key:'confirm', label:'✅ Confirm', color:'rgba(46,204,113,0.15)',  text:'#2ecc71', border:'rgba(46,204,113,0.4)' },
    { key:'reject',  label:'✕ Reject',  color:'rgba(231,76,60,0.1)',    text:'#e74c3c', border:'rgba(231,76,60,0.35)' },
    { key:'refund',  label:'↩ Refund',  color:'rgba(168,85,247,0.1)',   text:'#a855f7', border:'rgba(168,85,247,0.35)' },
    { key:'archive', label:'📦 Archive',color:'rgba(100,116,139,0.1)',  text:'var(--muted)', border:'var(--dim)' },
    { key:'delete',  label:'🗑 Delete', color:'rgba(231,76,60,0.1)',    text:'#e74c3c', border:'rgba(231,76,60,0.35)' },
  ];

  return (
    <div className="adm-page" style={{ maxWidth:'100%', overflowX:'hidden' }}>
      {/* Header */}
      <div className="adm-page-head" style={{ flexWrap:'wrap', gap:8 }}>
        <div>
          <h1>Orders</h1>
          <span className="adm-page-sub">
            {allOrders.length} orders · KSh {revenue.toLocaleString()} revenue · {pendingCount} pending · {refundCount} refunded
          </span>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button className="btn btn-sm" style={{ background:'rgba(231,76,60,0.1)', color:'#e74c3c', border:'1px solid rgba(231,76,60,0.35)' }}
            onClick={deleteUnconfirmed} disabled={bulkBusy}>🗑 Delete All Unconfirmed</button>
          {isSuper && (
            <button className="btn btn-ghost btn-sm" style={{ color:'var(--err)', borderColor:'rgba(231,76,60,0.4)' }}
              onClick={() => { if (!window.confirm('Clear ALL orders?')) return; allOrders.forEach(o => handleDeleteOrder(o.id, true)); showToast('All orders cleared'); }}
              disabled={bulkBusy}>Clear All</button>
          )}
        </div>
      </div>

      {manualPending.length > 0 && (
        <div className="adm-alert-box" style={{ marginBottom:12 }}>
          <strong>⚠ {manualPending.length} manual order{manualPending.length > 1 ? 's' : ''} need verification.</strong>
          {' '}Check the M-Pesa/Airtel reference and confirm payment to unlock books.
        </div>
      )}

      {/* Filter tabs */}
      <div className="adm-toolbar card" style={{ gap:8, flexWrap:'wrap', alignItems:'center' }}>
        {['all','completed','pending','cancelled','rejected','refunded'].map(f => (
          <button key={f} className={'adm-filter-btn' + (orderFilter === f ? ' on' : '')}
            onClick={() => { setOrderFilter(f); setSelected([]); }}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === 'pending'  && pendingCount > 0 && <span className="adm-filter-dot">{pendingCount}</span>}
            {f === 'refunded' && refundCount > 0  && <span className="adm-filter-dot" style={{ background:'#a855f7' }}>{refundCount}</span>}
          </button>
        ))}
        <span className="adm-toolbar-count" style={{ marginLeft:'auto' }}>{filteredOrders.length} orders</span>
      </div>

      {/* Bulk action bar */}
      {selected.length > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', background:'rgba(201,168,76,0.08)', border:'1px solid rgba(201,168,76,0.3)', borderRadius:'var(--r-sm)', padding:'10px 16px', marginTop:8 }}>
          <span style={{ fontWeight:700, color:'var(--gold)', fontSize:'0.88rem' }}>{selected.length} selected</span>
          {BULK_ACTIONS.map(a => (
            <button key={a.key}
              style={{ padding:'5px 12px', background:a.color, color:a.text, border:`1px solid ${a.border}`, borderRadius:6, cursor:'pointer', fontSize:'0.8rem', fontWeight:600, fontFamily:'inherit', opacity:bulkBusy ? 0.5 : 1 }}
              onClick={() => executeBulk(a.key)} disabled={bulkBusy}>
              {bulkBusy && bulkAction === a.key ? '…' : a.label}
            </button>
          ))}
          <button style={{ marginLeft:'auto', background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'0.82rem', fontFamily:'inherit' }}
            onClick={() => setSelected([])}>✕ Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="card" style={{ overflowX:'auto', maxWidth:'100%', marginTop:8 }}>
        <table className="adm-table" style={{ minWidth:680, tableLayout:'auto' }}>
          <thead>
            <tr>
              <th style={{ width:36, paddingLeft:12 }}>
                <input type="checkbox" style={{ cursor:'pointer' }}
                  checked={selected.length === filteredOrders.length && filteredOrders.length > 0}
                  onChange={toggleAll} title="Select all" />
              </th>
              <th>Order ID</th><th>Customer</th><th>Books</th><th>Amount</th>
              <th>Method</th><th>Status</th><th>Date</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map(o => {
              const isPending   = o.status === 'Pending';
              const isCompleted = o.status === 'Completed';
              const isCancelled = o.status === 'Cancelled' || o.status === 'PaymentFailed';
              const isRefunded  = o.status === 'Refunded';
              const isAuto      = ['paystack','mpesa_stk'].includes(o.method);
              const bookNames   = o.items ? o.items.map(i => i.title).join(', ') : (o.book || '—');
              const amount      = o.total || o.amount || 0;
              const customer    = o.userName || o.customer || '—';
              const email       = o.userEmail || o.email || '';
              const isSelected  = selected.includes(o.id);
              const rowBg       = isSelected ? 'rgba(201,168,76,0.09)' : isCancelled ? 'rgba(231,76,60,0.04)' : isRefunded ? 'rgba(168,85,247,0.04)' : isPending && !isAuto ? 'rgba(201,168,76,0.04)' : undefined;
              return (
                <tr key={o.id} style={{ background:rowBg }}>
                  <td style={{ paddingLeft:12 }}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(o.id)} style={{ cursor:'pointer' }} />
                  </td>
                  <td><code className="adm-code" style={{ fontSize:'0.68rem' }}>{(o.id||'').slice(0,14)}…</code></td>
                  <td>
                    <strong style={{ fontSize:'0.84rem' }}>{customer}</strong>
                    <span style={{ display:'block', fontSize:'0.72rem', color:'var(--muted)' }}>{email}</span>
                  </td>
                  <td style={{ maxWidth:130, fontSize:'0.76rem', color:'var(--muted)' }}>{bookNames.length > 40 ? bookNames.slice(0,40)+'…' : bookNames}</td>
                  <td><strong style={{ color:'var(--gold)' }}>KSh {amount.toLocaleString()}</strong></td>
                  <td>
                    <span className="adm-method-badge" style={{ fontSize:'0.7rem' }}>{o.method}</span>
                    {isAuto && <span style={{ display:'block', fontSize:'0.65rem', color:'var(--ok)', marginTop:1 }}>auto</span>}
                  </td>
                  <td>
                    <span className={'adm-status adm-status--' + (o.status||'unknown').toLowerCase()} style={{ fontSize:'0.73rem' }}>
                      {o.status === 'PaymentFailed' ? '✕ Failed' : o.status}
                    </span>
                    {isCancelled && o.failReason && <span style={{ display:'block', fontSize:'0.66rem', color:'var(--err)', marginTop:2 }}>{(o.failReason||'').slice(0,36)}</span>}
                    {isRefunded  && o.refundNote && <span style={{ display:'block', fontSize:'0.66rem', color:'#a855f7', marginTop:2 }}>{(o.refundNote||'').slice(0,36)}</span>}
                  </td>
                  <td style={{ color:'var(--muted)', fontSize:'0.73rem', whiteSpace:'nowrap' }}>{o.date ? o.date.slice(0,10) : '—'}</td>
                  <td className="adm-actions" style={{ whiteSpace:'nowrap', gap:3 }}>
                    {isPending && !isAuto && (<><button className="adm-act-btn adm-act-confirm" onClick={() => handleConfirmOrder(o.id, customer)}>✅</button><button className="adm-act-btn adm-act-del" onClick={() => handleRejectOrder(o.id)}>✕</button></>)}
                    {isPending && isAuto  && (<button className="adm-act-btn adm-act-confirm" style={{ opacity:0.7, fontSize:'0.68rem' }} onClick={() => handleConfirmOrder(o.id, customer)} title="Force-confirm">⚡</button>)}
                    {o.status === 'PaymentFailed' && (<button className="adm-act-btn adm-act-confirm" style={{ opacity:0.8, fontSize:'0.68rem' }} onClick={() => handleConfirmOrder(o.id, customer)} title="Force-confirm (payment may have succeeded)">⚡ Fix</button>)}
                    {isCompleted && (<button className="adm-act-btn" style={{ background:'rgba(168,85,247,0.1)', color:'#a855f7', border:'1px solid rgba(168,85,247,0.3)', fontSize:'0.72rem' }} onClick={() => setRefundModal(o)}>↩ Refund</button>)}
                    <button className="adm-act-btn adm-act-archive" onClick={() => handleArchiveOrder(o.id)} title="Archive">📦</button>
                    <button className="adm-act-btn adm-act-del"     onClick={() => handleDeleteOrder(o.id)} title="Delete">🗑️</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredOrders.length === 0 && <div className="adm-empty">No orders match this filter.</div>}
      </div>

      {refundModal && (
        <RefundModal order={refundModal} onClose={() => setRefundModal(null)}
          onConfirm={async (note) => {
            await handleRefundOrder(refundModal.id, note);
            setRefundModal(null);
            showToast('↩ Refund issued for ' + refundModal.id.slice(0,12));
          }} />
      )}

      <div className="card" style={{ padding:24, marginTop:24, border:'1px solid rgba(201,168,76,0.2)' }}>
        <h3 style={{ marginBottom:6, fontSize:'0.95rem' }}>Manual Book Unlock</h3>
        <p style={{ fontSize:'0.82rem', color:'var(--muted)', marginBottom:16 }}>Use this when a customer paid but books weren't unlocked automatically.</p>
        <ManualUnlockForm books={books} showToast={showToast} onUnlock={async (email, bookIds) => {
          const emailLow = email.trim().toLowerCase();
          const booksToUnlock = bookIds.map(bid => books.find(b => b.id === bid)).filter(Boolean).map(b => ({ ...b, downloadUnlocked:true }));
          if (!booksToUnlock.length) { showToast('No valid books selected'); return; }
          try {
            await unlockBooksForBuyer(emailLow, booksToUnlock);
            const mo = { id:'ORD-MANUAL-'+Date.now(), userId:null, userName:emailLow.split('@')[0], userEmail:emailLow, items:booksToUnlock.map(b=>({id:b.id,title:b.title,price:b.price})), total:booksToUnlock.reduce((s,b)=>s+(b.price||0),0), method:'manual', ref:'MANUAL-UNLOCK', status:'Completed', date:new Date().toISOString().slice(0,10), createdAt:serverTimestamp() };
            await setDoc(doc(db,'orders',mo.id), mo);
            showToast('✅ Unlocked ' + booksToUnlock.length + ' book(s) for ' + emailLow);
            setTick(t => t+1);
          } catch (err) { showToast('❌ Unlock failed: ' + err.message); }
        }} />
      </div>
    </div>
  );
}

// ── Refunds Panel ─────────────────────────────────────────────────────────────
function RefundsPanel({ allOrders, handleRefundOrder, showToast }) {
  const [refundModal, setRefundModal] = useState(null);
  const refunded  = allOrders.filter(o => o.status === 'Refunded');
  const completed = allOrders.filter(o => o.status === 'Completed');
  const totalRefunded = refunded.reduce((s, o) => s + (o.total || o.amount || 0), 0);

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div>
          <h1>Refunds</h1>
          <span className="adm-page-sub">
            {refunded.length} refunded · KSh {totalRefunded.toLocaleString()} total · {completed.length} completed orders eligible
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12, marginBottom:20 }}>
        {[
          { label:'Total Refunded',   value: refunded.length,                color:'#a855f7', bg:'rgba(168,85,247,0.1)'  },
          { label:'KSh Refunded',     value: 'KSh '+totalRefunded.toLocaleString(), color:'#e74c3c', bg:'rgba(231,76,60,0.08)' },
          { label:'Eligible Orders',  value: completed.length,               color:'#2ecc71', bg:'rgba(46,204,113,0.08)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding:'16px 20px', background:s.bg, border:`1px solid ${s.color}30` }}>
            <strong style={{ fontSize:'1.4rem', color:s.color, display:'block' }}>{s.value}</strong>
            <span style={{ fontSize:'0.78rem', color:'var(--muted)' }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Refunded orders */}
      {refunded.length > 0 && (
        <div className="card" style={{ overflowX:'auto', marginBottom:24 }}>
          <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--dim)', display:'flex', alignItems:'center', gap:10 }}>
            <h3 style={{ margin:0, fontSize:'0.95rem' }}>Refunded Orders</h3>
          </div>
          <table className="adm-table" style={{ minWidth:600 }}>
            <thead><tr><th>Order ID</th><th>Customer</th><th>Books</th><th>Amount</th><th>Date</th><th>Note</th></tr></thead>
            <tbody>
              {refunded.map(o => (
                <tr key={o.id} style={{ background:'rgba(168,85,247,0.03)' }}>
                  <td><code className="adm-code" style={{ fontSize:'0.7rem' }}>{(o.id||'').slice(0,14)}…</code></td>
                  <td><strong style={{ fontSize:'0.84rem' }}>{o.userName || '—'}</strong><span style={{ display:'block', fontSize:'0.72rem', color:'var(--muted)' }}>{o.userEmail}</span></td>
                  <td style={{ fontSize:'0.76rem', color:'var(--muted)', maxWidth:120 }}>{(o.items||[]).map(i=>i.title).join(', ') || '—'}</td>
                  <td><strong style={{ color:'#a855f7' }}>KSh {(o.total||o.amount||0).toLocaleString()}</strong></td>
                  <td style={{ fontSize:'0.75rem', color:'var(--muted)' }}>{o.refundedAt ? o.refundedAt.slice(0,10) : o.date?.slice(0,10) || '—'}</td>
                  <td style={{ fontSize:'0.75rem', color:'var(--muted)', maxWidth:120 }}>{o.refundNote || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Completed orders — can be refunded */}
      <div className="card" style={{ overflowX:'auto' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--dim)', display:'flex', alignItems:'center', gap:10 }}>
          <h3 style={{ margin:0, fontSize:'0.95rem' }}>Completed Orders — Issue Refund</h3>
          <span style={{ fontSize:'0.78rem', color:'var(--muted)' }}>{completed.length} eligible</span>
        </div>
        {completed.length === 0 ? (
          <div className="adm-empty">No completed orders available for refund.</div>
        ) : (
          <table className="adm-table" style={{ minWidth:600 }}>
            <thead><tr><th>Order ID</th><th>Customer</th><th>Books</th><th>Amount</th><th>Method</th><th>Date</th><th>Action</th></tr></thead>
            <tbody>
              {completed.map(o => (
                <tr key={o.id}>
                  <td><code className="adm-code" style={{ fontSize:'0.7rem' }}>{(o.id||'').slice(0,14)}…</code></td>
                  <td><strong style={{ fontSize:'0.84rem' }}>{o.userName || '—'}</strong><span style={{ display:'block', fontSize:'0.72rem', color:'var(--muted)' }}>{o.userEmail}</span></td>
                  <td style={{ fontSize:'0.76rem', color:'var(--muted)', maxWidth:120 }}>{(o.items||[]).map(i=>i.title).join(', ') || '—'}</td>
                  <td><strong style={{ color:'var(--gold)' }}>KSh {(o.total||o.amount||0).toLocaleString()}</strong></td>
                  <td><span className="adm-method-badge" style={{ fontSize:'0.7rem' }}>{o.method}</span></td>
                  <td style={{ fontSize:'0.75rem', color:'var(--muted)' }}>{o.date?.slice(0,10) || '—'}</td>
                  <td>
                    <button className="adm-act-btn"
                      style={{ background:'rgba(168,85,247,0.1)', color:'#a855f7', border:'1px solid rgba(168,85,247,0.3)', fontSize:'0.75rem' }}
                      onClick={() => setRefundModal(o)}>
                      ↩ Refund
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {refundModal && (
        <RefundModal order={refundModal} onClose={() => setRefundModal(null)}
          onConfirm={async (note) => {
            await handleRefundOrder(refundModal.id, note);
            setRefundModal(null);
          }} />
      )}
    </div>
  );
}

// ── Refund Modal ──────────────────────────────────────────────────────────────
function RefundModal({ order, onClose, onConfirm }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const amount   = order.total || order.amount || 0;
  const customer = order.userName || order.userEmail || '—';
  const submit = async e => { e.preventDefault(); setBusy(true); await onConfirm(note); setBusy(false); };
  return (
    <div className="adm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="adm-confirm card" style={{ maxWidth:460, width:'95vw' }}>
        <h3 style={{ marginBottom:4 }}>↩ Issue Refund</h3>
        <p style={{ fontSize:'0.84rem', color:'var(--muted)', marginBottom:16 }}>
          Order <strong style={{ color:'var(--gold)' }}>{order.id?.slice(0,16)}…</strong> · {customer}
        </p>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, background:'rgba(0,0,0,0.2)', borderRadius:'var(--r-sm)', padding:'12px 16px', marginBottom:16 }}>
          <div><span style={{ fontSize:'0.75rem', color:'var(--muted)' }}>Amount</span><br/><strong style={{ color:'var(--gold)' }}>KSh {amount.toLocaleString()}</strong></div>
          <div><span style={{ fontSize:'0.75rem', color:'var(--muted)' }}>Method</span><br/><strong>{order.method}</strong></div>
          <div style={{ gridColumn:'1/-1' }}><span style={{ fontSize:'0.75rem', color:'var(--muted)' }}>Books</span><br/><span style={{ fontSize:'0.78rem' }}>{(order.items||[]).map(i=>i.title).join(', ') || '—'}</span></div>
        </div>
        <div style={{ background:'rgba(168,85,247,0.06)', border:'1px solid rgba(168,85,247,0.25)', borderLeft:'3px solid #a855f7', borderRadius:'var(--r-sm)', padding:'10px 14px', marginBottom:16, fontSize:'0.82rem', color:'#a855f7' }}>
          ⚠ This records the refund in the system. Actual money transfer must be done manually via Paystack dashboard or M-Pesa.
        </div>
        <form onSubmit={submit}>
          <div className="form-group" style={{ marginBottom:16 }}>
            <label style={{ fontSize:'0.82rem' }}>Refund Note (optional)</label>
            <input className="field" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Customer request, duplicate charge…" />
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button type="submit" className="btn btn-sm"
              style={{ background:'rgba(168,85,247,0.15)', color:'#a855f7', border:'1px solid rgba(168,85,247,0.4)', flex:1 }}
              disabled={busy}>{busy ? 'Processing…' : '↩ Confirm Refund'}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ArchivesPanel({ db, showToast, onRestore }) {
  const [items,      setItems]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    const qr = query(collection(db, 'archives'), orderBy('archivedAt', 'desc'));
    const unsub = onSnapshot(qr, s => {
      setItems(s.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []); // eslint-disable-line

  const restore = async (item) => {
    try {
      const { id, archivedAt, archivedBy, type, ...data } = item;
      const target = type==='user' ? 'users' : type==='message' ? 'contact_messages' : type==='review' ? 'reviews' : 'orders';
      await setDoc(doc(db, target, id), { ...data, type, restoredAt: serverTimestamp() });
      await deleteDoc(doc(db, 'archives', id));
      setItems(prev => prev.filter(i => i.id !== id));
      onRestore?.({ id, ...data });
      showToast('✅ Restored');
    } catch (e) { showToast('❌ Restore failed: ' + e.message); }
  };

  const permDelete = async (id) => {
    if (!window.confirm('Permanently delete? This cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'archives', id));
      setItems(prev => prev.filter(i => i.id !== id));
      showToast('🗑️ Permanently deleted');
    } catch (e) { showToast('❌ ' + e.message); }
  };

  const types = ['all', ...new Set(items.map(i => i.type||'order'))];
  const filtered = typeFilter==='all' ? items : items.filter(i => (i.type||'order')===typeFilter);

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div><h1>Archives</h1><span className="adm-page-sub">{items.length} archived item{items.length!==1?'s':''} — orders, books, messages, users &amp; reviews</span></div>
      </div>
      {types.length > 1 && (
        <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
          {types.map(t => {
            const tm = TYPE_LABELS[t];
            return (
              <button key={t} onClick={() => setTypeFilter(t)}
                style={{ padding:'4px 14px', borderRadius:20, border:'1px solid', fontSize:'0.78rem', fontWeight:600, cursor:'pointer', fontFamily:'inherit',
                  background: typeFilter===t ? 'rgba(201,168,76,0.15)' : 'transparent',
                  color: typeFilter===t ? 'var(--gold)' : 'var(--muted)',
                  borderColor: typeFilter===t ? 'rgba(201,168,76,0.5)' : 'var(--dim)' }}>
                {t==='all' ? 'All' : (tm?.icon+' '+tm?.label+'s')}
              </button>
            );
          })}
        </div>
      )}
      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'var(--muted)' }}>Loading archives…</div>
      ) : filtered.length === 0 ? (
        <div className="adm-empty"><div style={{ fontSize:'3rem', marginBottom:12 }}>📦</div>
          <p>{typeFilter==='all' ? 'No archived items yet.' : `No archived ${typeFilter}s.`}</p>
        </div>
      ) : (
        <div className="card" style={{ overflow:'hidden' }}>
          <table className="adm-table">
            <thead><tr><th>Type</th><th>ID</th><th>Summary</th><th>Archived By</th><th>Date</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(item => {
                const tm = TYPE_LABELS[item.type||'order'] || TYPE_LABELS.order;
                return (
                  <tr key={item.id}>
                    <td><span style={{ background:'rgba(255,255,255,0.06)', border:'1px solid var(--dim)', borderRadius:6, padding:'2px 8px', fontSize:'0.72rem', fontWeight:700, color:tm.color, whiteSpace:'nowrap' }}>{tm.icon} {tm.label}</span></td>
                    <td><code style={{ fontSize:'0.68rem', color:'var(--gold)' }}>{String(item.id).slice(0,16)}</code></td>
                    <ItemSummary item={item} />
                    <td style={{ fontSize:'0.72rem', color:'var(--muted)' }}>{item.archivedBy||'—'}</td>
                    <td style={{ fontSize:'0.72rem', color:'var(--muted)' }}>{item.archivedAt?.toDate?.()?.toLocaleDateString?.()||'—'}</td>
                    <td className="adm-actions">
                      <button className="adm-act-btn adm-act-confirm" onClick={() => restore(item)}>↩ Restore</button>
                      <button className="adm-act-btn adm-act-del"     onClick={() => permDelete(item.id)}>✕ Delete Forever</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── TrashPanel ───────────────────────────────────────────────────────────── */
function TrashPanel({ db, showToast, onRestore }) {
  const [items,      setItems]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    const qr = query(collection(db, 'trash'), orderBy('trashedAt', 'desc'));
    const unsub = onSnapshot(qr, s => {
      setItems(s.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []); // eslint-disable-line

  const restore = async (item) => {
    try {
      const { id, trashedAt, trashedBy, type, ...data } = item;
      const target = type==='user' ? 'users' : type==='message' ? 'contact_messages' : type==='review' ? 'reviews' : 'orders';
      await setDoc(doc(db, target, id), { ...data, type, restoredAt: serverTimestamp() });
      await deleteDoc(doc(db, 'trash', id));
      setItems(prev => prev.filter(i => i.id !== id));
      onRestore?.({ id, ...data });
      showToast('✅ Restored');
    } catch (e) { showToast('❌ Restore failed: ' + e.message); }
  };

  const permDelete = async (id) => {
    if (!window.confirm('Permanently delete this item? This cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'trash', id));
      setItems(prev => prev.filter(i => i.id !== id));
      showToast('🗑️ Permanently deleted');
    } catch (e) { showToast('❌ ' + e.message); }
  };

  const emptyTrash = async () => {
    if (!window.confirm(`Permanently delete all ${items.length} items in trash? Cannot be undone.`)) return;
    try {
      await Promise.all(items.map(i => deleteDoc(doc(db, 'trash', i.id))));
      setItems([]);
      showToast('🗑️ Trash emptied');
    } catch (e) { showToast('❌ ' + e.message); }
  };

  const types = ['all', ...new Set(items.map(i => i.type||'order'))];
  const filtered = typeFilter==='all' ? items : items.filter(i => (i.type||'order')===typeFilter);

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div><h1>Trash</h1><span className="adm-page-sub">{items.length} item{items.length!==1?'s':''} in trash</span></div>
        {items.length > 0 && (
          <button onClick={emptyTrash} style={{ background:'rgba(231,76,60,0.12)', color:'#e74c3c', border:'1px solid rgba(231,76,60,0.3)', borderRadius:'var(--r-sm)', padding:'7px 16px', cursor:'pointer', fontWeight:600, fontSize:'0.82rem', fontFamily:'inherit' }}>
            🗑️ Empty Trash ({items.length})
          </button>
        )}
      </div>
      {types.length > 1 && (
        <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
          {types.map(t => {
            const tm = TYPE_LABELS[t];
            return (
              <button key={t} onClick={() => setTypeFilter(t)}
                style={{ padding:'4px 14px', borderRadius:20, border:'1px solid', fontSize:'0.78rem', fontWeight:600, cursor:'pointer', fontFamily:'inherit',
                  background: typeFilter===t ? 'rgba(231,76,60,0.12)' : 'transparent',
                  color: typeFilter===t ? '#e74c3c' : 'var(--muted)',
                  borderColor: typeFilter===t ? 'rgba(231,76,60,0.4)' : 'var(--dim)' }}>
                {t==='all' ? 'All' : (tm?.icon+' '+tm?.label+'s')}
              </button>
            );
          })}
        </div>
      )}
      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'var(--muted)' }}>Loading trash…</div>
      ) : filtered.length === 0 ? (
        <div className="adm-empty"><div style={{ fontSize:'3rem', marginBottom:12 }}>🗑️</div>
          <p>Trash is empty. Deleted items from Orders, Books, Users, Messages and Reviews appear here.</p>
        </div>
      ) : (
        <div className="card" style={{ overflow:'hidden' }}>
          <table className="adm-table">
            <thead><tr><th>Type</th><th>ID</th><th>Summary</th><th>Deleted By</th><th>Date</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(item => {
                const tm = TYPE_LABELS[item.type||'order'] || TYPE_LABELS.order;
                return (
                  <tr key={item.id} style={{ opacity:0.85 }}>
                    <td><span style={{ background:'rgba(231,76,60,0.08)', border:'1px solid rgba(231,76,60,0.25)', borderRadius:6, padding:'2px 8px', fontSize:'0.72rem', fontWeight:700, color:'#e06c5a', whiteSpace:'nowrap' }}>{tm.icon} {tm.label}</span></td>
                    <td><code style={{ fontSize:'0.68rem', color:'#e06c5a' }}>{String(item.id).slice(0,16)}</code></td>
                    <ItemSummary item={item} />
                    <td style={{ fontSize:'0.72rem', color:'var(--muted)' }}>{item.trashedBy||'—'}</td>
                    <td style={{ fontSize:'0.72rem', color:'var(--muted)' }}>{item.trashedAt?.toDate?.()?.toLocaleDateString?.()||'—'}</td>
                    <td className="adm-actions">
                      <button className="adm-act-btn adm-act-confirm" onClick={() => restore(item)}>↩ Restore</button>
                      <button className="adm-act-btn adm-act-del"     onClick={() => permDelete(item.id)}>✕ Delete Forever</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Admin() {
  const { user, books, saveBook, deleteBook, resetBooks, orders, setOrdersState, confirmOrder, rejectOrder, settings, updateSettings, syncOrders, manualUnlock, unlockBooksForBuyer, userPerms, getUserPerms, setPermField, saveUserPerms, suspendedList, isUserSuspended, setSuspended, siteControls, saveSiteControls } = useApp();
  const location = useLocation();
  const [tab, setTab] = useState(location.state?.tab || 'dashboard');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');
  const [orderFilter, setOrderFilter] = useState('all');
  const [bookStatusFilter, setBookStatusFilter] = useState('all');
  const [bookTypeFilter,   setBookTypeFilter]   = useState('all');
  const [reviews, setReviews] = useState(MOCK_REVIEWS_INIT);
  const [promos,  setPromos]  = useState(PROMO_INIT);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Detect mobile
  const isMobile = () => typeof window !== 'undefined' && window.innerWidth <= 768;

  const toggleSidebar = () => {
    if (isMobile()) {
      setMobileSidebarOpen(o => !o);
    } else {
      setSidebarCollapsed(c => !c);
    }
  };

  // Close mobile sidebar on tab change
  useEffect(() => {
    if (isMobile()) setMobileSidebarOpen(false);
  }, [tab]); // eslint-disable-line
  const [selectedIds, setSelectedIds] = useState(new Set());
  const toggleSelect  = id => setSelectedIds(prev => { const n = new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });
  const selectAll     = ids => setSelectedIds(new Set(ids));
  const clearSelected = () => setSelectedIds(new Set());
  // Reset selection when tab changes
  useEffect(() => { clearSelected(); }, [tab]); // eslint-disable-line

  // ── Load reviews + promos from Firestore (persist across refresh) ──────────
  useEffect(() => {
    getDoc(doc(db, 'site_data', 'reviews')).then(snap => {
      if (snap.exists() && snap.data().list?.length) setReviews(snap.data().list);
    }).catch(() => {});
    getDoc(doc(db, 'site_data', 'promos')).then(snap => {
      if (snap.exists() && snap.data().list?.length) setPromos(snap.data().list);
    }).catch(() => {});
  }, []); // eslint-disable-line

  const saveReviews = async (next) => {
    setReviews(next);
    try { await setDoc(doc(db, 'site_data', 'reviews'), { list: next, updatedAt: serverTimestamp() }, { merge: false }); } catch {}
  };
  const savePromos = async (next) => {
    setPromos(next);
    try { await setDoc(doc(db, 'site_data', 'promos'), { list: next, updatedAt: serverTimestamp() }, { merge: false }); } catch {}
  };

  // -- Users state  sourced from BASE_ACCOUNTS + registered, persisted deletions survive refresh --
  const [users, setUsers] = useState(() => buildUserList(suspendedList));
  const [sForm, setSForm] = useState(settings);
  const [resetPwUser, setResetPwUser] = useState(null);
  const [newPw, setNewPw]       = useState('');
  const [newPayMethod, setNewPayMethod] = useState({ name:'', type:'mobile', number:'', enabled:true });
  // For the nav bar badge counts on messages and live chat
  const [messages, setMessages] = useState([]);
  const [chatSessions, setChatSessions] = useState([]);
  // Add user/admin modal
  const [addUserModal, setAddUserModal] = useState(null); // 'user' | 'admin'
  const [addUserForm, setAddUserForm]   = useState({ name:'', email:'', password:'', role:'user' });
  const [customMethods, setCustomMethods] = useState(() => {
    try { return JSON.parse(localStorage.getItem('eh_pay_methods')) || []; } catch { return []; }
  });

  // System logs — stored in Firestore so they are real-time and cross-device
  const [logFilter, setLogFilter] = useState('all');
  const [systemLogs, setSystemLogs] = useState([]);
  const [deletionAlerts, setDeletionAlerts] = useState([]);

  // Load logs from Firestore on mount, real-time
  useEffect(() => {
    const logsDoc = doc(db, 'site_data', 'system_logs');
    const unsub = onSnapshot(logsDoc, (snap) => {
      const entries = snap.exists() ? (snap.data().logs || []) : [];
      setSystemLogs(entries);
    }, () => {
      // Fallback — try localStorage only (no demo data)
      try { setSystemLogs(JSON.parse(localStorage.getItem('eh_system_logs') || '[]')); } catch {}
    });
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real-time: sync newly registered users from Firestore into the users list
  // (handles users who registered on a different device — AppContext writes to localStorage
  //  but Admin.jsx only reads buildUserList on mount; this listener re-syncs it)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'site_data', 'registered_users'), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();

      // Respect the deletedEmails blocklist — never re-add deleted users
      const deletedEmails = new Set([
        ...(data.deletedEmails || []),
        ...JSON.parse(localStorage.getItem('eh_deleted_users') || '[]'),
      ].map(e => e.toLowerCase()));

      if (data.registered) {
        const filtered = data.registered.filter(r => !deletedEmails.has(r.email?.toLowerCase()));
        localStorage.setItem('eh_registered_users', JSON.stringify(filtered));
      }
      if (data.pwOverrides) {
        const local = JSON.parse(localStorage.getItem('eh_pw_overrides') || '{}');
        localStorage.setItem('eh_pw_overrides', JSON.stringify({ ...local, ...data.pwOverrides }));
      }
      if (data.roleOverrides) {
        localStorage.setItem('eh_role_overrides', JSON.stringify(data.roleOverrides));
      }
      // Re-build users list — skip deleted emails
      setUsers(prev => {
        const fresh = buildUserList(JSON.parse(localStorage.getItem('eh_suspended_fs') || '[]'))
          .filter(u => !deletedEmails.has(u.email.toLowerCase()));
        const prevMap = new Map(prev.map(u => [u.email.toLowerCase(), u]));
        return fresh.map(u => {
          const old = prevMap.get(u.email.toLowerCase());
          return old ? { ...u, books: old.books || 0 } : u;
        });
      });
    }, () => {});
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live chat sessions listener — for nav bar badge count
  // Fetch all contact_messages + filter client-side — no index requirements
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'contact_messages'), snap => {
      const sessions = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(d => d.type === 'live_chat')
        .sort((a, b) => {
          const ta = a.lastMsgAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
          const tb = b.lastMsgAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
          return tb - ta;
        });
      setChatSessions(sessions);
    }, () => {});
    return () => unsub();
  }, []);

  // Messages listener — for nav bar badge count
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'contact_messages'), snap => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(msgs);
    }, () => {});
    return () => unsub();
  }, []);

  // Helper to add a real log entry — writes to Firestore immediately
  const addLog = (type, event, status = 'success') => {
    const entry = {
      time: new Date().toISOString().slice(0, 16).replace('T', ' '),
      type, event, user: user?.email || 'Admin', ip: 'browser', status,
    };
    setSystemLogs(prev => {
      const next = [entry, ...prev].slice(0, 500);
      const logsDoc = doc(db, 'site_data', 'system_logs');
      setDoc(logsDoc, { logs: next, updatedAt: serverTimestamp() }, { merge: false })
        .catch(() => {
          try { localStorage.setItem('eh_system_logs', JSON.stringify(next)); } catch {}
        });
      return next;
    });
  };
  const [tick, setTick] = useState(0);
  const [liveOrders, setLiveOrders] = useState(() => {
    try { return JSON.parse(localStorage.getItem('eh_orders') || '[]'); } catch { return []; }
  });

  // Force a fresh read of liveOrders on mount in case orders were written
  // between React tree initialization and first render
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('eh_orders') || '[]');
      setLiveOrders(stored);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for localStorage changes from OTHER tabs (e.g. Lucy places an order)
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'eh_orders') {
        try {
          const stored = JSON.parse(e.newValue || '[]');
          setLiveOrders(stored);
          setTick(t => t + 1);
        } catch {}
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => { localStorage.setItem('eh_pay_methods', JSON.stringify(customMethods)); }, [customMethods]);
  useEffect(() => { setSForm(settings); }, [settings]);

  // One-time: clear any 'undefined' string values that crash JSON.parse
  useEffect(() => {
    ['eh_books','eh_orders','eh_registered_users','eh_settings'].forEach(key => {
      const v = localStorage.getItem(key);
      if (v === 'undefined' || v === 'null') localStorage.removeItem(key);
    });
  }, []);

  // Real-time Firestore listener — orders from ALL users, ALL devices appear instantly
  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q,
      (snap) => {
        const fsOrders = snap.docs.map(d => {
          const data = d.data();
          // Convert Firestore Timestamp to plain number for sorting
          return { ...data, id: d.id, createdAt: data.createdAt?.toMillis?.() || data.createdAt || 0 };
        });
        setOrdersState(fsOrders);
        setLiveOrders(fsOrders);
        // Rebuild users with live book counts — also surface users who exist only in Firestore orders
        try {
          const bookCounts = {};
          fsOrders.forEach(o => {
            if (o.status === 'Completed' && o.userEmail) {
              const k = o.userEmail.toLowerCase();
              bookCounts[k] = (bookCounts[k] || 0) + (o.items ? o.items.length : 1);
            }
          });

          // Build base list from localStorage
          const baseList = buildUserList(suspendedList);
          const knownEmails = new Set(baseList.map(u => u.email.toLowerCase()));

          // Add any users who appear in Firestore orders but aren't in localStorage yet
          // (e.g. they registered on a different device — Firestore registered_users listener
          //  will eventually sync them, but orders fire first)
          const suspended = JSON.parse(localStorage.getItem('eh_suspended_fs') || '[]');
          const deletedEmails = new Set([
            ...JSON.parse(localStorage.getItem('eh_deleted_users') || '[]'),
          ].map(e => e.toLowerCase()));

          fsOrders.forEach(o => {
            if (!o.userEmail) return;
            const emailKey = o.userEmail.toLowerCase();
            if (knownEmails.has(emailKey)) return;
            if (deletedEmails.has(emailKey)) return; // never re-add deleted users
            knownEmails.add(emailKey);
            baseList.push({
              id: 'fs_' + emailKey.replace(/[^a-z0-9]/g, '_'),
              name: o.userName || o.userEmail.split('@')[0],
              email: o.userEmail,
              role: 'user',
              joined: o.date || '',
              books: 0,
              status: suspended.includes(emailKey) ? 'Suspended' : 'Active',
            });
          });

          setUsers(baseList.map(u => ({ ...u, books: bookCounts[u.email.toLowerCase()] || u.books || 0 })));
        } catch {}
        setTick(t => t + 1);
      },
      (err) => { console.error('Firestore orders listener error:', err); }
    );
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) return <Navigate to="/login" replace />;
  const isSuper = user.role === 'superadmin';

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 3200); };

  // Permissions — wired to AppContext so changes affect the live site immediately
  const getPerms     = (email) => getUserPerms(email);
  const localSetPerm = (email, field, val) => {
    setPermField(email, field, val);
    showToast('Permission updated for ' + email.split('@')[0]);
  };

  const setSetting = (k, v) => setSForm(s => ({ ...s, [k]: v }));
  const saveSettings = section => { updateSettings(sForm); showToast(section + ' saved'); };

  const handleSaveBook = async (book) => {
    try {
      await saveBook(book);
      setEditing(null);
      showToast(book.id ? '✅ Book updated successfully' : '✅ New book added');
      addLog('book', (book.id ? 'Book updated: ' : 'Book added: ') + book.title);
    } catch (err) {
      console.error('[handleSaveBook] error:', err);
      showToast('❌ Save failed: ' + err.message);
    }
  };
  const handleDeleteBook = id => {
    const b = books.find(x => x.id === id);
    deleteBook(id); setDeleting(null);
    showToast('Book deleted');
    addLog('book', 'Book deleted: ' + (b?.title || id), 'warning');
  };

  // Confirm order  immediately refresh via tick
  const handleConfirmOrder = (orderId, customerName) => {
    confirmOrder(orderId);
    setTimeout(() => {
      try {
        const stored = JSON.parse(localStorage.getItem('eh_orders') || '[]');
        setLiveOrders(stored);
      } catch {}
      syncOrders();
      setTick(t => t + 1);
    }, 80);
    showToast('Payment confirmed - books unlocked for ' + customerName);
  };

  // Reject order  immediately refresh via tick
  const handleRejectOrder = (orderId) => {
    rejectOrder(orderId);
    setTimeout(() => {
      try {
        const stored = JSON.parse(localStorage.getItem('eh_orders') || '[]');
        setLiveOrders(stored);
      } catch {}
      syncOrders();
      setTick(t => t + 1);
    }, 80);
    showToast('Order rejected');
  };

  // Archive an order — moves it to Firestore archives collection
  const handleArchiveOrder = async (orderId) => {
    try {
      const order = allOrders.find(o => o.id === orderId);
      if (!order) return;
      await setDoc(doc(db, 'archives', orderId), {
        ...order,
        type: 'order',
        archivedAt: serverTimestamp(),
        archivedBy: user?.email,
      });
      await deleteDoc(doc(db, 'orders', orderId)).catch(() => {});
      setLiveOrders(prev => prev.filter(o => o.id !== orderId));
      showToast('📦 Order archived');
    } catch (e) { showToast('❌ Archive failed: ' + e.message); }
  };

  // Delete order — moves to trash (soft delete)
  const handleDeleteOrder = async (orderId, silent = false) => {
    if (!silent && !window.confirm('Move this order to Trash? It can be restored later.')) return;
    try {
      const order = allOrders.find(o => o.id === orderId);
      if (!order) return;
      await setDoc(doc(db, 'trash', orderId), {
        ...order, type: 'order', trashedAt: serverTimestamp(), trashedBy: user?.email,
      });
      await deleteDoc(doc(db, 'orders', orderId)).catch(() => {});
      setLiveOrders(prev => prev.filter(o => o.id !== orderId));
      if (!silent) showToast('🗑️ Order moved to Trash');
    } catch (e) { showToast('❌ Delete failed: ' + e.message); }
  };

  // Delete user  persists across refresh via eh_deleted_users blocklist + Firestore
  const handleDeleteUser = async (u) => {
    const emailKey = u.email.toLowerCase();

    // 1. Add to permanent deleted blocklist (localStorage)
    const deleted = JSON.parse(localStorage.getItem('eh_deleted_users') || '[]');
    if (!deleted.includes(emailKey)) {
      localStorage.setItem('eh_deleted_users', JSON.stringify([...deleted, emailKey]));
    }
    // 2. Remove from registered users (localStorage)
    const registered = JSON.parse(localStorage.getItem('eh_registered_users') || '[]');
    const updatedRegistered = registered.filter(r => r.email.toLowerCase() !== emailKey);
    localStorage.setItem('eh_registered_users', JSON.stringify(updatedRegistered));

    // 3. Sync deletion to Firestore so real-time listener doesn't re-add on refresh
    try {
      const deleted = JSON.parse(localStorage.getItem('eh_deleted_users') || '[]');
      // Use merge:true — only update the deletedEmails blocklist, never wipe other users
      await setDoc(doc(db, 'site_data', 'registered_users'), {
        deletedEmails: [...new Set([...deleted, emailKey])],
        updatedAt: serverTimestamp(),
      }, { merge: true });
      // Remove from the registered array in Firestore too (fetch first, then update)
      const regSnap = await getDoc(doc(db, 'site_data', 'registered_users'));
      if (regSnap.exists()) {
        const fsRegistered = (regSnap.data().registered || []).filter(r => r.email?.toLowerCase() !== emailKey);
        await setDoc(doc(db, 'site_data', 'registered_users'), {
          registered: fsRegistered,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
      // Also delete from users collection
      await deleteDoc(doc(db, 'users', u.id)).catch(() => {});
    } catch (e) { console.warn('[deleteUser] Firestore sync failed:', e.message); }

    // 4. Remove ALL their orders
    const allStoredOrders = JSON.parse(localStorage.getItem('eh_orders') || '[]');
    localStorage.setItem('eh_orders', JSON.stringify(
      allStoredOrders.filter(o => o.userId !== u.id && o.userEmail?.toLowerCase() !== emailKey)
    ));
    // 5. Remove from suspended list
    const suspended = JSON.parse(localStorage.getItem('eh_suspended_users') || '[]');
    localStorage.setItem('eh_suspended_users', JSON.stringify(suspended.filter(e => e !== emailKey)));
    // 6. Clear their library data
    localStorage.removeItem('eh_lib_' + u.id);
    localStorage.removeItem('eh_lib_email_' + emailKey);
    // 7. If this user is currently logged in on this browser, log them out
    const currentSession = JSON.parse(localStorage.getItem('eh_user') || 'null');
    if (currentSession && currentSession.email?.toLowerCase() === emailKey) {
      localStorage.removeItem('eh_user');
    }
    // 8. Refresh state immediately — remove from UI right away
    setUsers(prev => prev.filter(x => x.email.toLowerCase() !== emailKey));
    setTick(t => t + 1);
    showToast(`User "${u.name}" permanently deleted`);
  };

  // Navigate to Books tab with a pre-set status filter
  const goToBooks = (statusFilter = 'all') => {
    setBookStatusFilter(statusFilter);
    setBookTypeFilter('all');
    setSearch('');
    setTab('books');
  };

  const filtered = books.filter(b => {
    const matchSearch = !search ||
      b.title.toLowerCase().includes(search.toLowerCase()) ||
      b.genre.toLowerCase().includes(search.toLowerCase());
    const matchStatus = bookStatusFilter === 'all'
      ? true
      : bookStatusFilter === '__featured__'
      ? b.featured === true
      : (b.status || 'complete') === bookStatusFilter;
    const matchType = bookTypeFilter === 'all' || b.type === bookTypeFilter;
    return matchSearch && matchStatus && matchType;
  });

  // Real orders only — sorted newest first
  const realOrders = [...liveOrders].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const allOrders = realOrders;

  const revenue      = allOrders.filter(o => o.status === 'Completed').reduce((s, o) => s + (Number(o.amount) || Number(o.total) || 0), 0);
  const pendingCount  = realOrders.filter(o => o.status === 'Pending').length;
  const refundCount   = realOrders.filter(o => o.status === 'Refunded').length;
  const filteredOrders = orderFilter === 'all'
    ? allOrders
    : orderFilter === 'cancelled'
    ? allOrders.filter(o => o.status === 'Cancelled' || o.status === 'PaymentFailed')
    : allOrders.filter(o => o.status.toLowerCase() === orderFilter);

  const navItems = [
    /* ── General admin ── */
    { k:'dashboard',     label:'Dashboard',        icon:'🏠', group:'admin' },
    { k:'activity',      label:'Activity Feed',    icon:'📊', group:'admin' },
    { k:'books',         label:'Books',             icon:'📚', group:'admin' },
    { k:'covers',        label:'Novel Covers',      icon:'🖼️', group:'admin' },
    { k:'photos',        label:'Site Photos',       icon:'📷', group:'admin' },
    { k:'orders',        label:'Orders' + (pendingCount > 0 ? ` (${pendingCount})` : ''), icon:'🛒', group:'admin' },
    { k:'refunds',       label:'Refunds' + (refundCount > 0 ? ` (${refundCount})` : ''),  icon:'↩', group:'admin' },
    { k:'archives',      label:'Archives',          icon:'📦', group:'admin' },
    { k:'trash',         label:'Trash',             icon:'🗑️', group:'admin' },
    { k:'users',         label:'Users',             icon:'👥', group:'admin' },
    { k:'userbooks',     label:'User Libraries',    icon:'📖', group:'admin' },
    { k:'permissions',   label:'Permissions',       icon:'🔐', group:'admin' },
    { k:'reviews',       label:'Reviews',           icon:'⭐', group:'admin' },
    { k:'newsletter',    label:'Newsletter',         icon:'📬', group:'admin' },
    { k:'promos',        label:'Promo Codes',       icon:'🎟️', group:'admin' },
    { k:'analytics',     label:'Analytics',         icon:'📊', group:'admin' },
    { k:'reports',       label:'Reports',           icon:'📈', group:'admin' },
    { k:'visitors',      label:'Site Visitors',     icon:'🌍', group:'admin' },
    { k:'payments',      label:'Payment Methods',   icon:'💳', group:'admin' },
    { k:'payfees',       label:'Fee Calculator',    icon:'🧮', group:'admin' },
    { k:'settings',      label:'Settings',          icon:'⚙️', group:'admin' },
    { k:'notifications', label:'Notifications',     icon:'🔔', group:'admin' },
    { k:'messages',      label:'Messages',          icon:'💬', group:'admin' },
    { k:'livechat',      label:'Live Chat',          icon:'⚡', group:'admin' },
    { k:'chatsettings',  label:'Chat Settings',      icon:'💬', group:'admin' },
    { k:'sms',           label:'SMS Broadcast',      icon:'📱', group:'admin' },
    { k:'email',         label:'Email Config',      icon:'📧', group:'admin' },
    { k:'sitecontrols',  label:'Site Controls',     icon:'🎛️', group:'admin' },
    /* ── Power tools — visible to both admin & superadmin ── */
    { k:'pageeditor',    label:'Page Editor',       icon:'✏️', group:'power' },
    { k:'design',        label:'Design Studio',     icon:'🎨', group:'power' },
    { k:'security',      label:'Security',          icon:'🔒', group:'power' },
    { k:'plugins',       label:'Plugins & Tools',   icon:'🧩', group:'power' },
    { k:'integrations',  label:'Integrations',      icon:'🔌', group:'power' },
    { k:'logs',          label:'System Logs',       icon:'📋', group:'power' },
    { k:'backup',        label:'Backup & Restore',  icon:'💾', group:'power' },
    /* ── Super admin only ── */
    { k:'admins',        label:'Admin Control',     icon:'🛡️', group:'super' },
    { k:'godmode',       label:'God Mode',          icon:'⚡', group:'super' },
  ];

  return (
    <div className={`adm${sidebarCollapsed ? ' adm--collapsed' : ''}${mobileSidebarOpen ? ' adm--mobile-open' : ''}`}>
      {/* ── Sidebar toggle — hamburger on mobile, collapse arrow on desktop ── */}
      <button
        className="adm-sidebar-toggle"
        onClick={toggleSidebar}
        title={mobileSidebarOpen ? 'Close menu' : sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label="Toggle sidebar"
      >
        <span>{mobileSidebarOpen ? '✕' : '☰'}</span>
        {/* Show current section name in the mobile top bar */}
        {!mobileSidebarOpen && (
          <span className="adm-sidebar-toggle__title" style={{
            fontSize: '0.9rem', fontWeight: 700, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            flex: 1,
          }}>
          {navItems.find(n => n.k === tab)?.label || 'Admin'}</span>
        )}
        {!mobileSidebarOpen && (
          <img src="/logo-nobg3.png" alt="" style={{ width: 30, height: 30, objectFit: 'contain', marginLeft: 'auto', opacity: 0.85 }} />
        )}
      </button>

      {/* ── Mobile backdrop — tap to close sidebar ── */}
      {mobileSidebarOpen && (
        <div
          style={{ position:'fixed', inset:0, zIndex:298 }}
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className="adm-sidebar">
        <div className="adm-sidebar-logo">
          <img src="/logo-nobg3.png" alt="Ellines Haven" className="adm-sidebar-logo-img" />
          <div className="adm-sidebar-logo-text">
            <span className="adm-sidebar-brand">Ellines Haven</span>
            <em>{isSuper ? 'Super Admin Panel' : 'Admin Panel'}</em>
            {isSuper && <span className="adm-super-tag">SUPER ADMIN</span>}
          </div>
        </div>
        <nav className="adm-nav">
          {/* ── Manage section ── */}
          <div className="adm-nav-section adm-nav-section-admin">
            <span className="adm-nav-section-dot adm-nav-section-dot--admin" />
            <span className="adm-nav-label">Manage</span>
          </div>
          {navItems.filter(n => n.group === 'admin').map(({ k, label, icon }) => {
            let count = null;
            if (k === 'messages') count = messages.filter(m => (m.status==='new'||!m.status) && m.type !== 'live_chat' && m.type !== 'notification').length;
            if (k === 'livechat') count = chatSessions.filter(s => s.lastSender === 'user' && s.status !== 'closed').length;
            return (
              <button key={k} className={'adm-nav-btn' + (tab === k ? ' active' : '')} style={{}} onClick={() => { setTab(k); if (k === 'books') { setBookStatusFilter('all'); setBookTypeFilter('all'); setSearch(''); } }} title={label}>
                <span className="adm-nav-icon-emoji">{icon}</span>
                <span className="adm-nav-label">{label}</span>
                {count > 0 && (
                  <span style={{
                    marginLeft:'auto',
                    background: k === 'livechat' ? 'rgba(231,76,60,0.2)' : 'rgba(255,255,255,0.1)',
                    color: k === 'livechat' ? '#e74c3c' : 'var(--muted)',
                    fontSize:'0.68rem',
                    fontWeight:700,
                    padding:'1px 6px',
                    borderRadius:10,
                    minWidth:20,
                    textAlign:'center',
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}

          {/* ── Book Categories (shown when Books tab is active) ── */}
          {tab === 'books' && !sidebarCollapsed && (
            <div style={{ marginLeft:12, marginTop:2, marginBottom:4, display:'flex', flexDirection:'column', gap:2 }}>
              {[
                { label:'All Books',     count: books.length,                                  filter:'all',          color:'var(--muted)' },
                { label:'Complete',      count: books.filter(b=>b.status==='complete').length,  filter:'complete',     color:'#2ecc71' },
                { label:'Featured',      count: books.filter(b=>b.featured).length,             filter:'__featured__', color:'#c9a84c' },
                { label:'Ongoing',       count: books.filter(b=>b.status==='ongoing').length,   filter:'ongoing',      color:'#4a9eff' },
                { label:'Premium',       count: books.filter(b=>b.status==='premium').length,   filter:'premium',      color:'#c9a84c' },
                { label:'Coming Soon',   count: books.filter(b=>b.status==='coming-soon').length,filter:'coming-soon', color:'#e8832a' },
                { label:'Draft',         count: books.filter(b=>b.status==='draft').length,     filter:'draft',        color:'#64748b' },
              ].map(item => (
                <button key={item.filter}
                  onClick={() => { setBookStatusFilter(item.filter); setBookTypeFilter('all'); setSearch(''); }}
                  style={{
                    display:'flex', alignItems:'center', justifyContent:'space-between',
                    padding:'4px 10px 4px 12px',
                    background: bookStatusFilter === item.filter ? 'rgba(201,168,76,0.08)' : 'transparent',
                    border: bookStatusFilter === item.filter ? '1px solid rgba(201,168,76,0.2)' : '1px solid transparent',
                    borderRadius:'var(--r-sm)', cursor:'pointer', transition:'all 0.15s',
                    color: bookStatusFilter === item.filter ? 'var(--gold)' : 'var(--muted)',
                    fontSize:'0.73rem',
                  }}
                  onMouseEnter={e => { if (bookStatusFilter !== item.filter) e.currentTarget.style.color = 'var(--text)'; }}
                  onMouseLeave={e => { if (bookStatusFilter !== item.filter) e.currentTarget.style.color = 'var(--muted)'; }}>
                  <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ width:6, height:6, borderRadius:'50%', background: item.color, flexShrink:0 }} />
                    {item.label}
                  </span>
                  <span style={{ fontSize:'0.68rem', background:'rgba(255,255,255,0.06)', padding:'1px 6px', borderRadius:8 }}>
                    {item.count}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* ── Power Tools — admin & superadmin ── */}
          <div className="adm-nav-divider" />
          <div className="adm-nav-section adm-nav-section-power">
            <span className="adm-nav-section-dot adm-nav-section-dot--power" />
            <span className="adm-nav-label">Power Tools</span>
          </div>
          {navItems.filter(n => n.group === 'power').map(({ k, label, icon }) => (
            <button key={k} className={'adm-nav-btn adm-nav-btn--power' + (tab === k ? ' active' : '')} onClick={() => setTab(k)} title={label}>
              <span className="adm-nav-icon-emoji">{icon}</span>
              <span className="adm-nav-label">{label}</span>
            </button>
          ))}

          {/* ── Super Admin ── */}
          {isSuper && (
            <>
              <div className="adm-nav-divider" />
              <div className="adm-nav-section adm-nav-section-super">
                <span className="adm-nav-section-dot adm-nav-section-dot--super" />
                <span className="adm-nav-label">Super Admin</span>
              </div>
              {navItems.filter(n => n.group === 'super').map(({ k, label, icon }) => (
                <button key={k} className={'adm-nav-btn adm-nav-btn--super' + (tab === k ? ' active' : '')} onClick={() => setTab(k)} title={label}>
                  <span className="adm-nav-icon-emoji">{icon}</span>
                  <span className="adm-nav-label">{label}</span>
                </button>
              ))}
            </>
          )}
        </nav>
        <div className="adm-sidebar-footer">
          <div className="adm-admin-info">
            <div className="adm-admin-avatar" style={{ background: isSuper ? 'var(--gold)' : 'rgba(74,158,255,0.8)', color: '#000' }}>
              {user.name.charAt(0)}
            </div>
            <div>
              <strong>{user.name}</strong>
              <span style={{ color: isSuper ? 'var(--gold)' : '#7eb6ff' }}>
                {isSuper ? '⚡ Super Admin' : '🛡️ Admin'}
              </span>
            </div>
          </div>
          <div style={{ display:'flex', gap:6 }}>
            <Link to="/profile" className="adm-back-btn" style={{ flex:1, textAlign:'center' }}>👤 Profile</Link>
            <Link to="/" className="adm-back-btn" style={{ flex:1, textAlign:'center' }}>← Site</Link>
          </div>

          {/* ── Payment Dashboards Quick Links ── */}
          {!sidebarCollapsed && (
            <div style={{ marginTop:10, borderTop:'1px solid var(--border)', paddingTop:10 }}>
              <div style={{ fontSize:'0.65rem', color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:6, paddingLeft:2 }}>
                💳 Payment Dashboards
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <a href="https://dashboard.paystack.com" target="_blank" rel="noopener noreferrer"
                  style={{ display:'flex', alignItems:'center', gap:7, padding:'6px 10px', background:'rgba(0,196,140,0.07)', border:'1px solid rgba(0,196,140,0.15)', borderRadius:'var(--r-sm)', textDecoration:'none', color:'#00c48c', fontSize:'0.75rem', fontWeight:600, transition:'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background='rgba(0,196,140,0.14)'}
                  onMouseLeave={e => e.currentTarget.style.background='rgba(0,196,140,0.07)'}>
                  <span style={{ fontSize:'0.9rem' }}>🟢</span> Paystack
                </a>
                <a href="https://www.paypal.com/signin" target="_blank" rel="noopener noreferrer"
                  style={{ display:'flex', alignItems:'center', gap:7, padding:'6px 10px', background:'rgba(0,112,243,0.07)', border:'1px solid rgba(0,112,243,0.15)', borderRadius:'var(--r-sm)', textDecoration:'none', color:'#4a9eff', fontSize:'0.75rem', fontWeight:600, transition:'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background='rgba(0,112,243,0.14)'}
                  onMouseLeave={e => e.currentTarget.style.background='rgba(0,112,243,0.07)'}>
                  <span style={{ fontSize:'0.9rem' }}>🅿</span> PayPal
                </a>
                <a href="https://developer.safaricom.co.ke" target="_blank" rel="noopener noreferrer"
                  style={{ display:'flex', alignItems:'center', gap:7, padding:'6px 10px', background:'rgba(46,204,113,0.07)', border:'1px solid rgba(46,204,113,0.15)', borderRadius:'var(--r-sm)', textDecoration:'none', color:'#2ecc71', fontSize:'0.75rem', fontWeight:600, transition:'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background='rgba(46,204,113,0.14)'}
                  onMouseLeave={e => e.currentTarget.style.background='rgba(46,204,113,0.07)'}>
                  <span style={{ fontSize:'0.9rem' }}>📱</span> M-Pesa / Daraja
                </a>
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="adm-main">
        {toast && <div className="adm-toast">{toast}</div>}
        {editing !== null && <BookForm initial={editing} onSave={handleSaveBook} onCancel={() => setEditing(null)} />}
        {deleting && <Confirm msg="Delete this book? This cannot be undone." onYes={() => handleDeleteBook(deleting)} onNo={() => setDeleting(null)} />}

        {/* Messages tab — full height, no padding */}
        {tab === 'messages' && (
          <div className="adm-main-messages">
            <MessagesPanel showToast={showToast} users={users} />
          </div>
        )}

        {/* Live Chat tab — full height, no padding */}
        {tab === 'livechat' && (
          <div className="adm-main-messages">
            <Suspense fallback={<PanelLoader />}>
              <LiveChatPanel showToast={showToast} />
            </Suspense>
          </div>
        )}

        {/* SMS Broadcast tab — scrollable */}
        {tab === 'sms' && (
          <div className="adm-main-scroll">
            <Suspense fallback={<PanelLoader />}>
              <SMSPanel showToast={showToast} users={users} />
            </Suspense>
          </div>
        )}

        {/* Chat Settings tab — scrollable */}
        {tab === 'chatsettings' && (
          <div className="adm-main-scroll">
            <Suspense fallback={<PanelLoader />}>
              <ChatSettingsPanel showToast={showToast} />
            </Suspense>
          </div>
        )}

        {/* All other tabs — scrollable with padding */}
        {tab !== 'messages' && tab !== 'livechat' && tab !== 'sms' && tab !== 'chatsettings' && (
          <div className="adm-main-scroll">
        {addUserModal && (
          <div className="adm-overlay">
            <div className="adm-confirm card" style={{ maxWidth:440, textAlign:'left' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                <h3>Add New {addUserModal === 'admin' ? 'Admin' : 'User'}</h3>
                <button className="adm-close-btn" onClick={() => { setAddUserModal(null); setAddUserForm({ name:'', email:'', password:'', role: addUserModal === 'admin' ? 'admin' : 'user' }); }}>✕</button>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                <div className="adm-field-group">
                  <label>Full Name *</label>
                  <input className="field" value={addUserForm.name} onChange={e => setAddUserForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Jane Muthoni" />
                </div>
                <div className="adm-field-group">
                  <label>Email Address *</label>
                  <input className="field" type="email" value={addUserForm.email} onChange={e => setAddUserForm(f=>({...f,email:e.target.value}))} placeholder="jane@example.com" />
                </div>
                <div className="adm-field-group">
                  <label>Password *</label>
                  <input className="field" type="text" value={addUserForm.password} onChange={e => setAddUserForm(f=>({...f,password:e.target.value}))} placeholder="Minimum 4 characters" />
                  <small style={{ color:'var(--muted)' }}>User will use this to log in.</small>
                </div>
                {addUserModal === 'admin' && (
                  <div className="adm-field-group">
                    <label>Role</label>
                    <select className="field" value={addUserForm.role} onChange={e => setAddUserForm(f=>({...f,role:e.target.value}))}>
                      <option value="admin">Admin</option>
                      {isSuper && <option value="superadmin">Super Admin</option>}
                    </select>
                  </div>
                )}
              </div>
              <div className="adm-confirm-btns" style={{ marginTop:20 }}>
                <button className="btn btn-primary btn-sm" onClick={async () => {
                  const { name, email, password, role } = addUserForm;
                  if (!name.trim() || !email.trim() || !password.trim()) { showToast('❌ All fields are required'); return; }
                  if (password.length < 4) { showToast('❌ Password must be at least 4 characters'); return; }
                  const emailKey = email.trim().toLowerCase();
                  
                  // Check for duplicates in local state
                  const existing = users.find(u => u.email.toLowerCase() === emailKey);
                  if (existing) { showToast('❌ An account with that email already exists'); return; }
                  
                  // Also check Firestore users collection directly
                  try {
                    const fsQuery = query(collection(db, 'users'), where('email', '==', emailKey));
                    const fsSnap = await getDocs(fsQuery);
                    if (!fsSnap.empty) { showToast('❌ An account with that email already exists'); return; }
                  } catch (e) { console.warn('[DuplicateCheck]', e.message); }

                  const newUser = { id: (addUserModal==='admin'?'adm_':'usr_') + Date.now(), name: name.trim(), email: emailKey, role: addUserModal==='admin' ? role : 'user', joined: new Date().toISOString().slice(0,10) };

                  // 1. Write directly to Firestore users/{id} with passwordHash — works on all devices
                  try {
                    await setDoc(doc(db, 'users', newUser.id), {
                      id: newUser.id, name: newUser.name, email: emailKey,
                      passwordHash: password.trim(), role: newUser.role,
                      joined: newUser.joined, createdAt: serverTimestamp(), status: 'active',
                    });
                  } catch (e) { console.warn('[AddUser] users write failed:', e.message); }

                  // 2. Append to registered_users with merge:true — never wipe existing users
                  try {
                    const regSnap = await getDoc(doc(db, 'site_data', 'registered_users'));
                    const currentList = regSnap.exists() ? (regSnap.data().registered || []) : [];
                    const overrides = { ...(regSnap.exists() ? regSnap.data().pwOverrides || {} : {}),
                      [emailKey]: password.trim() };
                    const roleOverrides = { ...(regSnap.exists() ? regSnap.data().roleOverrides || {} : {}) };
                    if (addUserModal === 'admin') roleOverrides[emailKey] = role;
                    if (!currentList.find(r => r.email?.toLowerCase() === emailKey)) {
                      await setDoc(doc(db, 'site_data', 'registered_users'), {
                        registered: [...currentList, newUser],
                        pwOverrides: overrides,
                        roleOverrides,
                        updatedAt: serverTimestamp(),
                      }, { merge: true });
                    }
                  } catch (e) { console.warn('[Users] Firestore sync failed:', e.message); }

                  // 3. Update localStorage
                  const overrides = JSON.parse(localStorage.getItem('eh_pw_overrides') || '{}');
                  overrides[emailKey] = password.trim();
                  localStorage.setItem('eh_pw_overrides', JSON.stringify(overrides));
                  const registered = JSON.parse(localStorage.getItem('eh_registered_users') || '[]');
                  if (!registered.find(r => r.email?.toLowerCase() === emailKey)) {
                    localStorage.setItem('eh_registered_users', JSON.stringify([...registered, newUser]));
                  }
                  if (addUserModal === 'admin') {
                    const roleOverrides = JSON.parse(localStorage.getItem('eh_role_overrides') || '{}');
                    roleOverrides[emailKey] = role;
                    localStorage.setItem('eh_role_overrides', JSON.stringify(roleOverrides));
                  }

                  // Update local UI state
                  setUsers(prev => [...prev, { ...newUser, books:0, status:'Active' }]);
                  addLog('user', (addUserModal==='admin'?'Admin':'User') + ' account created: ' + emailKey);
                  showToast(`✅ Account created for ${name.trim()}`);
                  
                  // Track activity for admin notification
                  try {
                    const { trackActivity, NOTIFICATION_CATEGORIES } = await import('../utils/adminActivityTracker');
                    await trackActivity({
                      category: NOTIFICATION_CATEGORIES.USER_REGISTRATION,
                      title: addUserModal === 'admin' ? 'Admin Account Created' : 'User Account Created',
                      message: `${user.name} created ${addUserModal === 'admin' ? 'admin' : 'user'} account for ${name.trim()} (${emailKey})`,
                      userEmail: emailKey,
                      userName: name.trim(),
                      metadata: {
                        createdBy: user.email,
                        role: newUser.role,
                        createdAt: newUser.joined,
                      },
                      priority: addUserModal === 'admin' ? 'normal' : 'low',
                    });
                  } catch (err) {
                    console.error('[trackActivity]', err);
                  }
                  
                  setAddUserModal(null);
                  setAddUserForm({ name:'', email:'', password:'', role:'user' });
                }}>Create Account</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setAddUserModal(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
        {resetConfirm && (
          <Confirm
            msg="Reset all books to defaults? All admin edits will be lost."
            onYes={() => { resetBooks(); setResetConfirm(false); showToast('Books reset to default'); }}
            onNo={() => setResetConfirm(false)}
          />
        )}
        {/* DASHBOARD */}
        {tab === 'dashboard' && (
          <div className="adm-page">
            <div className="adm-page-head">
              <div>
                <h1>Dashboard</h1>
                <span className="adm-page-sub">
                  Welcome back, {user.name.split(' ')[0]} ·{' '}
                  <span style={{ color:'var(--gold)' }}>{new Date().toLocaleDateString('en-KE',{weekday:'long',day:'numeric',month:'long'})}</span>
                </span>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => { syncOrders(); setTick(t=>t+1); showToast('Dashboard refreshed'); }}>
                🔄 Refresh
              </button>
            </div>

            {/* ── Pending alert ── */}
            {pendingCount > 0 && (
              <div className="adm-alert-box" style={{ marginBottom:20, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
                <span>⚠️ You have <strong>{pendingCount} pending order{pendingCount!==1?'s':''}</strong> awaiting payment verification.</span>
                <button className="btn btn-primary btn-sm" onClick={() => setTab('orders')}>Review Orders →</button>
              </div>
            )}

            {/* ── KPI row ── */}
            <div className="adm-stats-grid cols-4" style={{ marginBottom:20 }}>
              {[
                { icon:'📚', label:'Total Books',     value: books.length,                    color:'#c9a84c', bg:'rgba(201,168,76,0.1)',   click: () => setTab('books') },
                { icon:'👥', label:'Total Readers',   value: users.length,                    color:'#4a9eff', bg:'rgba(74,158,255,0.1)',    click: () => setTab('users') },
                { icon:'💰', label:'Total Revenue',   value:'KSh ' + revenue.toLocaleString(), color:'#2ecc71', bg:'rgba(46,204,113,0.1)',   click: () => setTab('analytics') },
                { icon:'🛒', label:'Pending Orders',  value: pendingCount,                    color:'#e8832a', bg:'rgba(232,131,42,0.1)',    click: () => setTab('orders') },
              ].map(s => (
                <div key={s.label} className="adm-stat-card card" style={{ cursor:'pointer', transition:'transform .15s' }}
                  onClick={s.click}
                  onMouseEnter={e => e.currentTarget.style.transform='translateY(-2px)'}
                  onMouseLeave={e => e.currentTarget.style.transform=''}>
                  <div className="adm-stat-icon" style={{ background:s.bg, fontSize:'1.4rem' }}>{s.icon}</div>
                  <div className="adm-stat-body">
                    <strong style={{ color:s.color, fontSize:'1.6rem' }}>{s.value}</strong>
                    <span>{s.label}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Secondary stats ── */}
            <div className="adm-stats-grid cols-4" style={{ marginBottom:24 }}>
              {[
                { icon:'✅', label:'Completed Orders',  value: allOrders.filter(o=>o.status==='Completed').length,  color:'#2ecc71', bg:'rgba(46,204,113,0.08)',   click: () => setOrderFilter('completed') || setTab('orders') },
                { icon:'📖', label:'Featured Books',    value: books.filter(b=>b.featured).length,                 color:'#c9a84c', bg:'rgba(201,168,76,0.08)',   click: () => { setBookStatusFilter('__featured__'); setBookTypeFilter('all'); setTab('books'); } },
                { icon:'🔜', label:'Coming Soon',       value: books.filter(b=>b.status==='coming-soon').length,   color:'#e8832a', bg:'rgba(232,131,42,0.08)',   click: () => goToBooks('coming-soon') },
                { icon:'📝', label:'Draft / Hidden',    value: books.filter(b=>b.status==='draft'||b.active===false).length, color:'#64748b', bg:'rgba(100,116,139,0.08)', click: () => goToBooks('draft') },
              ].map(s => (
                <div key={s.label} className="adm-stat-card card"
                  style={{ cursor:'pointer', transition:'transform .15s, box-shadow .15s' }}
                  onClick={s.click}
                  onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 4px 20px rgba(0,0,0,0.3)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=''; }}>
                  <div className="adm-stat-icon" style={{ background: s.bg, fontSize:'1.2rem' }}>{s.icon}</div>
                  <div className="adm-stat-body">
                    <strong style={{ color:s.color, fontSize:'1.4rem' }}>{s.value}</strong>
                    <span>{s.label}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Book Status Breakdown ── */}
            <div className="card" style={{ padding:'18px 20px', marginBottom:24 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                <h3 style={{ fontSize:'0.92rem', margin:0 }}>📚 Book Catalogue by Status</h3>
                <button className="btn btn-outline btn-sm" onClick={() => goToBooks('all')}>Manage All Books</button>
              </div>
              <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                {BOOK_STATUSES.map(s => {
                  const count = books.filter(b => (b.status||'complete') === s.value).length;
                  return (
                    <button key={s.value} onClick={() => goToBooks(s.value)}
                      style={{
                        display:'flex', alignItems:'center', gap:8, padding:'8px 16px',
                        background: count > 0 ? s.bg : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${count > 0 ? s.color + '60' : 'var(--dim)'}`,
                        borderRadius:20, cursor:'pointer', transition:'all 0.15s',
                        color: count > 0 ? s.color : 'var(--muted)',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.transform='translateY(-1px)'; }}
                      onMouseLeave={e => { e.currentTarget.style.transform=''; }}>
                      <span style={{ fontSize:'0.82rem' }}>{s.label}</span>
                      <span style={{ fontSize:'0.78rem', fontWeight:700, background:'rgba(0,0,0,0.3)', padding:'1px 7px', borderRadius:10 }}>
                        {count}
                      </span>
                    </button>
                  );
                })}
                <button onClick={() => { setBookStatusFilter('__featured__'); setBookTypeFilter('all'); setTab('books'); }}
                  style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 16px', background:'rgba(201,168,76,0.06)', border:'1px solid rgba(201,168,76,0.3)', borderRadius:20, cursor:'pointer', color:'var(--gold)', transition:'all .15s' }}>
                  ⭐ Featured <span style={{ fontSize:'0.78rem', fontWeight:700, background:'rgba(0,0,0,0.25)', padding:'1px 7px', borderRadius:10 }}>{books.filter(b=>b.featured).length}</span>
                </button>
                <button onClick={() => { setBookTypeFilter('novel'); setBookStatusFilter('all'); setTab('books'); }}
                  style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 16px', background:'rgba(74,158,255,0.06)', border:'1px solid rgba(74,158,255,0.3)', borderRadius:20, cursor:'pointer', color:'#4a9eff', transition:'all .15s' }}>
                  📖 Novels <span style={{ fontSize:'0.78rem', fontWeight:700, background:'rgba(0,0,0,0.25)', padding:'1px 7px', borderRadius:10 }}>{books.filter(b=>b.type==='novel').length}</span>
                </button>
                <button onClick={() => { setBookTypeFilter('short-story'); setBookStatusFilter('all'); setTab('books'); }}
                  style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 16px', background:'rgba(168,85,247,0.06)', border:'1px solid rgba(168,85,247,0.3)', borderRadius:20, cursor:'pointer', color:'#a855f7', transition:'all .15s' }}>
                  ✍️ Short Stories <span style={{ fontSize:'0.78rem', fontWeight:700, background:'rgba(0,0,0,0.25)', padding:'1px 7px', borderRadius:10 }}>{books.filter(b=>b.type==='short-story').length}</span>
                </button>
              </div>
            </div>

            <div className="adm-dash-grid">

              {/* ── Recent orders ── */}
              <div className="card">
                <div className="adm-card-head">
                  <h3>Recent Orders</h3>
                  {pendingCount > 0 && (
                    <span style={{ fontSize:'0.7rem', padding:'2px 8px', borderRadius:10, background:'rgba(201,168,76,0.15)', color:'var(--gold)', border:'1px solid rgba(201,168,76,0.3)', marginLeft:8 }}>
                      {pendingCount} pending
                    </span>
                  )}
                  <button className="btn btn-outline btn-sm" style={{ marginLeft:'auto' }} onClick={() => setTab('orders')}>View All</button>
                </div>
                {allOrders.slice(0, 8).map(o => {
                  const bookName = (o.items||[]).map(i=>i.title).join(', ');
                  const amount   = o.total || o.amount || 0;
                  const statusColor = o.status==='Completed'?'var(--ok)':o.status==='Pending'?'var(--gold)':'var(--err)';
                  return (
                    <div key={o.id} className="adm-order-row"
                      style={{ borderLeft: o.status==='Pending' ? '3px solid var(--gold)' : '3px solid transparent', paddingLeft:10 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <strong style={{ fontSize:'0.84rem' }}>{o.userName || 'Guest'}</strong>
                        <span style={{ display:'block', fontSize:'0.72rem', color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:200 }}>
                          {bookName || 'Order'}
                        </span>
                      </div>
                      <div style={{ textAlign:'right', flexShrink:0 }}>
                        <strong style={{ fontSize:'0.88rem' }}>KSh {amount.toLocaleString()}</strong>
                        <span style={{ display:'block', fontSize:'0.7rem', color:statusColor, fontWeight:700 }}>{o.status}</span>
                      </div>
                    </div>
                  );
                })}
                {allOrders.length === 0 && (
                  <p style={{ color:'var(--muted)', fontSize:'0.85rem', padding:16 }}>No orders yet.</p>
                )}
              </div>

              {/* ── Right column: quick stats + actions ── */}
              <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

                {/* Top books — clickable rows that open book editor */}
                <div className="card">
                  <div className="adm-card-head">
                    <h3>Top Books</h3>
                    <button className="btn btn-outline btn-sm" onClick={() => goToBooks('all')}>Manage All</button>
                  </div>
                  <div style={{ padding:'0 0 8px' }}>
                    {books.slice(0,6).map((b,i) => {
                      const sm = BOOK_STATUSES.find(s => s.value === (b.status||'complete')) || BOOK_STATUSES[0];
                      return (
                        <div key={b.id}
                          onClick={() => setEditing(b)}
                          style={{ display:'flex', alignItems:'center', gap:12, padding:'9px 16px', borderBottom:'1px solid rgba(255,255,255,0.03)', cursor:'pointer', transition:'background 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.03)'}
                          onMouseLeave={e => e.currentTarget.style.background=''}>
                          <span style={{ width:18, height:18, borderRadius:'50%', background:'rgba(201,168,76,0.12)', color:'var(--gold)', fontWeight:700, fontSize:'0.65rem', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{i+1}</span>
                          {b.coverType==='photo' && b.cover
                            ? <img src={b.cover} alt="" style={{ width:26, height:38, objectFit:'cover', borderRadius:3, flexShrink:0 }} />
                            : <div style={{ width:26, height:38, background:b.coverColor||'#1a1a3a', borderRadius:3, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.5rem', color:b.coverAccent||'#c9a84c' }}>EH</div>
                          }
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:'0.8rem', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{b.title}</div>
                            <div style={{ fontSize:'0.68rem', color:'var(--muted)' }}>KSh {b.price} · {b.genre}</div>
                          </div>
                          <span style={{ fontSize:'0.65rem', padding:'2px 7px', borderRadius:10, background:sm.bg, color:sm.color, border:`1px solid ${sm.color}35`, flexShrink:0, whiteSpace:'nowrap' }}>
                            {sm.label.replace(/^[^\s]+\s/,'')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="card" style={{ padding:20 }}>
                  <h3 style={{ fontSize:'0.92rem', marginBottom:14 }}>⚡ Quick Actions</h3>
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    <button className="btn btn-primary btn-sm" style={{ justifyContent:'flex-start' }} onClick={() => setEditing({})}>
                      📚 Add New Book
                    </button>
                    <button className="btn btn-outline btn-sm" style={{ justifyContent:'flex-start' }} onClick={() => setTab('orders')}>
                      🛒 Review Orders {pendingCount>0 && <span style={{ marginLeft:4, background:'var(--gold)', color:'#000', padding:'1px 6px', borderRadius:8, fontSize:'0.7rem', fontWeight:700 }}>{pendingCount}</span>}
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ justifyContent:'flex-start' }} onClick={() => setTab('users')}>
                      👥 Manage Users ({users.length})
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ justifyContent:'flex-start' }} onClick={() => setTab('analytics')}>
                      📊 View Analytics
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ justifyContent:'flex-start' }} onClick={() => setTab('notifications')}>
                      🔔 Notifications
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ justifyContent:'flex-start' }} onClick={() => setTab('messages')}>
                      💬 Messages
                    </button>
                    {isSuper && (
                      <button className="btn btn-sm" style={{ justifyContent:'flex-start', background:'rgba(201,168,76,0.08)', color:'var(--gold)', border:'1px solid rgba(201,168,76,0.25)' }}
                        onClick={() => setTab('godmode')}>
                        ⚡ God Mode
                      </button>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* ── System status bar ── */}
            <div className="card" style={{ padding:'14px 20px', marginTop:20, display:'flex', alignItems:'center', gap:20, flexWrap:'wrap' }}>
              <span style={{ fontSize:'0.78rem', color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:1 }}>System Status</span>
              {[
                { label:'Firestore', ok:true },
                { label:'Library',  ok:true },
                { label:'Orders',   ok:allOrders.length >= 0 },
                { label:'Auth',     ok:!!user },
              ].map(s => (
                <span key={s.label} style={{ fontSize:'0.78rem', display:'flex', alignItems:'center', gap:5 }}>
                  <span style={{ width:7, height:7, borderRadius:'50%', background:s.ok?'var(--ok)':'var(--err)', display:'inline-block', boxShadow:s.ok?'0 0 6px var(--ok)':'' }} />
                  {s.label}
                </span>
              ))}
              <div style={{ marginLeft:'auto', display:'flex', gap:16, alignItems:'center', flexWrap:'wrap' }}>
                <span style={{ fontSize:'0.72rem', color:'var(--muted)' }}>
                  {books.filter(b=>b.active!==false).length} live books · {users.filter(u=>u.status==='Active').length} active users
                </span>
                <span style={{ fontSize:'0.72rem', color:'var(--muted)' }}>
                  Refreshed {new Date().toLocaleTimeString('en-KE', { hour:'2-digit', minute:'2-digit' })}
                </span>
                <button className="btn btn-ghost btn-sm" style={{ fontSize:'0.72rem', padding:'3px 10px' }}
                  onClick={() => { syncOrders(); setTick(t=>t+1); showToast('Refreshed'); }}>
                  🔄 Sync
                </button>
              </div>
            </div>

          </div>
        )}
        {/* BOOKS */}
        {tab === 'books' && (
          <div className="adm-page">
            <div className="adm-page-head">
              <div>
                <h1>Books</h1>
                <span className="adm-page-sub">
                  {books.length} titles in the catalogue
                  {bookStatusFilter !== 'all' && (
                    <span style={{ marginLeft:8, color:'var(--gold)' }}>
                      · Showing: {BOOK_STATUSES.find(s=>s.value===bookStatusFilter)?.label || bookStatusFilter}
                    </span>
                  )}
                </span>
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setResetConfirm(true)}>Reset Defaults</button>
                <button className="btn btn-primary" onClick={() => setEditing({})}>+ Add New Book</button>
              </div>
            </div>

            {/* ── Type Tabs ── */}
            <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap' }}>
              {[
                { value:'all',          label:'All Types',     count: books.length },
                { value:'novel',        label:'📖 Novels',     count: books.filter(b=>b.type==='novel').length },
                { value:'short-story',  label:'✍️ Short Stories', count: books.filter(b=>b.type==='short-story').length },
              ].map(t => (
                <button key={t.value}
                  className={'adm-filter-btn' + (bookTypeFilter === t.value ? ' on' : '')}
                  onClick={() => setBookTypeFilter(t.value)}>
                  {t.label}
                  <span style={{ marginLeft:6, fontSize:'0.7rem', opacity:0.7 }}>({t.count})</span>
                </button>
              ))}
            </div>

            {/* ── Status Filter Tabs ── */}
            <div style={{ display:'flex', gap:6, marginBottom:14, flexWrap:'wrap' }}>
              <button className={'adm-filter-btn' + (bookStatusFilter === 'all' ? ' on' : '')}
                onClick={() => setBookStatusFilter('all')}>
                All Statuses
                <span style={{ marginLeft:6, fontSize:'0.7rem', opacity:0.7 }}>({books.length})</span>
              </button>
              {BOOK_STATUSES.map(s => {
                const count = books.filter(b => (b.status||'complete') === s.value).length;
                return (
                  <button key={s.value}
                    className={'adm-filter-btn' + (bookStatusFilter === s.value ? ' on' : '')}
                    style={ bookStatusFilter === s.value
                      ? { background: s.bg, borderColor: s.color + '80', color: s.color }
                      : { opacity: count === 0 ? 0.45 : 1 }
                    }
                    onClick={() => setBookStatusFilter(s.value)}>
                    {s.label}
                    <span style={{ marginLeft:6, fontSize:'0.7rem', opacity:0.7 }}>({count})</span>
                  </button>
                );
              })}
              <button className={'adm-filter-btn' + (bookStatusFilter === '__featured__' ? ' on' : '')}
                style={{ borderColor:'rgba(201,168,76,0.4)', color: bookStatusFilter==='__featured__' ? 'var(--gold)' : undefined }}
                onClick={() => setBookStatusFilter('__featured__')}>
                ⭐ Featured
                <span style={{ marginLeft:6, fontSize:'0.7rem', opacity:0.7 }}>({books.filter(b=>b.featured).length})</span>
              </button>
            </div>

            <div className="adm-toolbar card">
              <input className="field adm-search" placeholder="Search by title or genre..." value={search} onChange={e => setSearch(e.target.value)} />
              <span className="adm-toolbar-count">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
              {(bookStatusFilter !== 'all' || bookTypeFilter !== 'all' || search) && (
                <button className="btn btn-ghost btn-sm" onClick={() => { setBookStatusFilter('all'); setBookTypeFilter('all'); setSearch(''); }}>
                  ✕ Clear filters
                </button>
              )}
            </div>
            {selectedIds.size > 0 && (
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",marginBottom:8,background:"rgba(201,168,76,0.08)",border:"1px solid rgba(201,168,76,0.3)",borderRadius:"var(--r)",flexWrap:"wrap"}}>
                <span style={{fontWeight:700,color:"var(--gold)",fontSize:"0.88rem"}}>{selectedIds.size} book{selectedIds.size!==1?"s":""} selected</span>
                <button className="btn btn-ghost btn-sm" onClick={()=>{if(window.confirm("Delete "+selectedIds.size+" book(s)?")){selectedIds.forEach(id=>{const bk=books.find(x=>x.id===id);if(bk)deleteBook(id)});clearSelected();showToast("Deleted "+selectedIds.size+" books")}}}>🗑️ Delete</button>
                <button className="btn btn-ghost btn-sm" onClick={async ()=>{selectedIds.forEach(id=>{const bk=books.find(x=>x.id===id);if(bk)saveBook({...bk,active:false})});clearSelected();showToast("Deactivated")}}>📴 Deactivate</button>
                <button className="btn btn-ghost btn-sm" onClick={async ()=>{selectedIds.forEach(id=>{const bk=books.find(x=>x.id===id);if(bk)saveBook({...bk,active:true})});clearSelected();showToast("Activated")}}>✅ Activate</button>
                <button className="btn btn-ghost btn-sm" onClick={async ()=>{selectedIds.forEach(id=>{const bk=books.find(x=>x.id===id);if(bk)saveBook({...bk,featured:true})});clearSelected();showToast("Featured")}}>⭐ Feature</button>
                <button className="btn btn-ghost btn-sm" style={{marginLeft:"auto"}} onClick={clearSelected}>✕ Clear</button>
              </div>
            )}
            <div className="card" style={{ overflow:'hidden' }}>
              <table className="adm-table adm-books-table">
                <thead>
                  <tr><th style={{width:34}}><input type="checkbox" onChange={e=>e.target.checked?selectAll(filtered.map(b=>b.id)):clearSelected()} checked={filtered.length>0&&filtered.every(b=>selectedIds.has(b.id))} style={{cursor:"pointer",accentColor:"var(--gold)"}} /></th><th>Cover</th><th>Title</th><th>Genre</th><th>Type</th><th>Price</th><th>Status</th><th>Active</th><th>Featured</th><th>New</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {filtered.map(b => {
                    const statusMeta = BOOK_STATUSES.find(s => s.value === (b.status || 'complete')) || BOOK_STATUSES[0];
                    const isChecked = selectedIds.has(b.id);
                    return (
                      <tr key={b.id} style={{ background: isChecked ? 'rgba(201,168,76,0.07)' : undefined }}>
                        <td><input type="checkbox" checked={isChecked} onChange={() => toggleSelect(b.id)} style={{ cursor:'pointer', accentColor:'var(--gold)' }} /></td>
                        <td>
                        {b.coverType === 'photo' && b.cover
                          ? <img src={b.cover} alt="" className="adm-book-thumb" />
                          : <div className="adm-book-thumb-styled" style={{ background:b.coverColor || '#1a1a3a' }}>
                              <span style={{ fontSize:'0.6rem', color:b.coverAccent || '#c9a84c' }}>EH</span>
                            </div>
                        }
                      </td>
                      <td><strong>{b.title}</strong><span className="adm-book-author">{b.author}</span></td>
                      <td><span className="adm-badge">{b.genre}</span></td>
                      <td>{b.type === 'novel' ? 'Novel' : 'Short Story'}</td>
                      <td>KSh {b.price}</td>
                      {/* Quick status dropdown */}
                      <td>
                        <select
                          className="field"
                          style={{ padding:'3px 6px', fontSize:'0.72rem', width:'auto', color: statusMeta.color, background:'rgba(0,0,0,0.3)', border:`1px solid ${statusMeta.color}40` }}
                          value={b.status || 'complete'}
                          onChange={async e => { const v=e.target.value; try { await saveBook({ ...b, status: v }); addLog('book', `"${b.title}" status → ${v}`); showToast(`Status updated`); } catch { showToast('❌ Save failed'); } }}>
                          {BOOK_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </td>
                      <td>
                        <button
                          className={'adm-flag-btn' + (b.active!==false ? ' on' : '')}
                          style={b.active===false?{borderColor:'var(--err)',color:'var(--err)'}:{}}
                          title={b.active===false?'Hidden from users - click to reactivate':'Live - click to deactivate'}
                          onClick={async () => {
                            const msg = b.active!==false
                              ? 'Deactivate "'+b.title+'"? It will be hidden from the public library.'
                              : 'Reactivate "'+b.title+'"? It will appear in the public library again.';
                            if(window.confirm(msg)) {
                              try {
                                await saveBook({ ...b, active: b.active===false ? true : false });
                                addLog('book', `"${b.title}" ${b.active!==false?'deactivated':'reactivated'}`, b.active!==false?'warning':'success');
                                showToast(b.active!==false ? '📴 Deactivated' : '✅ Reactivated');
                              } catch { showToast('❌ Save failed'); }
                            }
                          }}>
                          {b.active!==false ? 'Live' : 'Off'}
                        </button>
                      </td>
                      <td>
                        <button className={'adm-flag-btn' + (b.featured ? ' on' : '')} onClick={async () => { try { await saveBook({ ...b, featured:!b.featured }); } catch { showToast('❌ Save failed'); } }}>
                          {b.featured ? 'Yes' : 'No'}
                        </button>
                      </td>
                      <td>
                        <button className={'adm-flag-btn' + (b.isNew ? ' on' : '')} onClick={async () => { try { await saveBook({ ...b, isNew:!b.isNew }); } catch { showToast('❌ Save failed'); } }}>
                          {b.isNew ? 'New' : '-'}
                        </button>
                      </td>
                      <td className="adm-actions">
                        <button className="adm-act-btn adm-act-edit" onClick={() => setEditing(b)}>Edit</button>
                        <button className="adm-act-btn adm-act-del" onClick={() => setDeleting(b.id)}>Delete</button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && <div className="adm-empty">No books match your search.</div>}
            </div>
          </div>
        )}
        {/* NOVEL COVERS */}
        {tab === 'covers' && (
          <CoversTab books={books} saveBook={saveBook} showToast={showToast} />
        )}
        {/* SITE PHOTOS */}
        {tab === 'photos' && (
          <PhotosTab showToast={showToast} />
        )}
        {tab === 'orders' && (
          <OrdersPanel
            allOrders={allOrders}
            filteredOrders={filteredOrders}
            orderFilter={orderFilter}
            setOrderFilter={setOrderFilter}
            pendingCount={pendingCount}
            revenue={revenue}
            isSuper={isSuper}
            handleConfirmOrder={handleConfirmOrder}
            handleRejectOrder={handleRejectOrder}
            handleArchiveOrder={handleArchiveOrder}
            handleDeleteOrder={handleDeleteOrder}
            books={books}
            unlockBooksForBuyer={unlockBooksForBuyer}
            showToast={showToast}
            setTick={setTick}
            setLiveOrders={setLiveOrders}
            syncOrders={syncOrders}
            user={user}
          />
        )}

        {/* REFUNDS */}
        {tab === 'refunds' && (
          <RefundsPanel
            allOrders={allOrders}
            handleRefundOrder={async (orderId, note) => {
              await updateDoc(doc(db, 'orders', orderId), {
                status: 'Refunded', refundedAt: new Date().toISOString(),
                refundedBy: user?.email, ...(note ? { refundNote: note } : {}),
              });
              setLiveOrders(prev => prev.map(o => o.id === orderId ? { ...o, status:'Refunded', refundNote: note } : o));
              showToast('↩ Refund issued');
            }}
            showToast={showToast}
          />
        )}

        {/* ARCHIVES */}
        {tab === 'archives' && (
          <ArchivesPanel db={db} showToast={showToast} onRestore={(order) => {
            setLiveOrders(prev => [order, ...prev]);
          }} />
        )}

        {/* TRASH */}
        {tab === 'trash' && (
          <TrashPanel db={db} showToast={showToast} onRestore={(order) => {
            setLiveOrders(prev => [order, ...prev]);
          }} />
        )}

        {/* USERS */}
        {tab === 'users' && (
          <div className="adm-page">
            <div className="adm-page-head">
              <div><h1>Users</h1><span className="adm-page-sub">{users.length} registered accounts</span></div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <button className="btn btn-outline btn-sm" onClick={async () => {
                  if (!confirm('This will sync all users from site_data/registered_users to the users collection. Continue?')) return;
                  try {
                    const regSnap = await getDoc(doc(db, 'site_data', 'registered_users'));
                    if (!regSnap.exists()) { showToast('❌ No registered users found'); return; }
                    const regData = regSnap.data();
                    const registered = regData.registered || [];
                    const pwOverrides = regData.pwOverrides || {};
                    let migrated = 0, skipped = 0;
                    for (const regUser of registered) {
                      const emailKey = regUser.email?.toLowerCase();
                      if (!emailKey) { skipped++; continue; }
                      // Check if already exists in users collection
                      const q = query(collection(db, 'users'), where('email', '==', emailKey));
                      const existing = await getDocs(q);
                      if (!existing.empty) { skipped++; continue; }
                      // Migrate to users collection
                      const uid = regUser.id || ('u_' + Date.now() + '_' + Math.random().toString(36).slice(2,7));
                      const joined = regUser.joined || new Date().toISOString().slice(0, 10);
                      const pw = pwOverrides[emailKey] || regUser.password || '';
                      await setDoc(doc(db, 'users', uid), {
                        id: uid, name: regUser.name || '', email: emailKey,
                        role: regUser.role || 'user', passwordHash: pw,
                        joined, migratedAt: serverTimestamp(), status: 'active',
                      });
                      migrated++;
                    }
                    showToast(`✅ Migration complete: ${migrated} users migrated, ${skipped} skipped (already exist)`);
                    addLog('system', `User migration: ${migrated} accounts migrated to users collection`);
                  } catch (e) {
                    showToast('❌ Migration failed: ' + e.message);
                    console.error('[Migration]', e);
                  }
                }} title="Sync all users from registered_users to users collection">🔄 Migrate Users</button>
                <button className="btn btn-primary btn-sm" onClick={() => { setAddUserForm({name:'',email:'',password:'',role:'user'}); setAddUserModal('user'); }}>+ Add User</button>
              </div>
            </div>

            {/* Password reset modal */}
            {resetPwUser && (
              <div className="adm-overlay">
                <div className="adm-confirm card" style={{ maxWidth:400 }}>
                  <h3 style={{ marginBottom:16 }}>Reset Password</h3>
                  <p style={{ color:'var(--muted)', fontSize:'0.85rem', marginBottom:16 }}>
                    Setting new password for <strong style={{ color:'var(--gold)' }}>{resetPwUser.name}</strong> ({resetPwUser.email})
                  </p>
                  <div className="adm-field-group">
                    <label>New Password</label>
                    <input className="field" type="text" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Enter new password" autoFocus />
                  </div>
                  <div className="adm-confirm-btns" style={{ marginTop:16 }}>
                    <button className="btn btn-primary btn-sm" onClick={async () => {
                      if (!newPw.trim()) return;
                      const email = resetPwUser.email.toLowerCase();
                      const pw = newPw.trim();

                      // 1. Save to localStorage overrides (same-device fallback)
                      const overrides = JSON.parse(localStorage.getItem('eh_pw_overrides') || '{}');
                      overrides[email] = pw;
                      localStorage.setItem('eh_pw_overrides', JSON.stringify(overrides));

                      // 2. Find the REAL Firestore user doc by email query — never guess by ID
                      try {
                        const q = query(collection(db, 'users'), where('email', '==', email));
                        const snap = await getDocs(q);
                        if (!snap.empty) {
                          await setDoc(doc(db, 'users', snap.docs[0].id), {
                            passwordHash: pw, updatedAt: serverTimestamp(),
                          }, { merge: true });
                        } else {
                          // Not in /users yet — create it so login can find them
                          const uid = (resetPwUser.id && resetPwUser.id !== 'admin01')
                            ? resetPwUser.id : ('u_' + Date.now());
                          await setDoc(doc(db, 'users', uid), {
                            id: uid, name: resetPwUser.name || '', email,
                            role: resetPwUser.role || 'user',
                            passwordHash: pw, createdAt: serverTimestamp(), status: 'active',
                          });
                        }
                      } catch (e) { console.warn('[PW reset]', e.message); }

                      // 3. Sync pwOverrides into registered_users so all devices pick it up
                      try {
                        await setDoc(doc(db, 'site_data', 'registered_users'), {
                          pwOverrides: overrides, updatedAt: serverTimestamp(),
                        }, { merge: true });
                      } catch {}

                      setUsers(prev => prev.map(u => u.id === resetPwUser.id ? { ...u, password: pw } : u));
                      addLog('user', 'Password reset for ' + email);
                      showToast('✅ Password updated for ' + resetPwUser.name);
                      setResetPwUser(null); setNewPw('');
                    }}>Set Password</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setResetPwUser(null); setNewPw(''); }}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {selectedIds.size > 0 && (
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",marginBottom:8,background:"rgba(201,168,76,0.08)",border:"1px solid rgba(201,168,76,0.3)",borderRadius:"var(--r)",flexWrap:"wrap"}}>
                <span style={{fontWeight:700,color:"var(--gold)",fontSize:"0.88rem"}}>{selectedIds.size} user{selectedIds.size!==1?"s":""} selected</span>
                <button className="btn btn-ghost btn-sm" onClick={()=>{selectedIds.forEach(id=>{const u=users.find(x=>x.id===id);if(u)setSuspended?.(u.email,true)});clearSelected();showToast("Suspended "+selectedIds.size+" users")}}>🚫 Suspend</button>
                <button className="btn btn-ghost btn-sm" onClick={()=>{selectedIds.forEach(id=>{const u=users.find(x=>x.id===id);if(u)setSuspended?.(u.email,false)});clearSelected();showToast("Reinstated users")}}>✓ Reinstate</button>
                <button className="btn btn-ghost btn-sm" onClick={()=>{if(window.confirm("Delete "+selectedIds.size+" user(s)? Cannot be undone.")){selectedIds.forEach(id=>{const u=users.find(x=>x.id===id);if(u)handleDeleteUser(u)});clearSelected()}}}>🗑️ Delete</button>
                <button className="btn btn-ghost btn-sm" style={{marginLeft:"auto"}} onClick={clearSelected}>✕ Clear</button>
              </div>
            )}
            <div className="card" style={{ overflow:'hidden' }}>
              <table className="adm-table">
                <thead>
                  <tr>
                    <th style={{width:34}}><input type="checkbox" onChange={e=>e.target.checked?selectAll(users.map(u=>u.id)):clearSelected()} checked={users.length>0&&users.every(u=>selectedIds.has(u.id))} style={{cursor:"pointer",accentColor:"var(--gold)"}} /></th>
                    <th>Avatar</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Books</th>
                    <th>Joined</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} style={selectedIds.has(u.id)?{background:"rgba(201,168,76,0.05)"}:{}}>
                      <td><input type="checkbox" checked={selectedIds.has(u.id)} onChange={()=>toggleSelect(u.id)} style={{cursor:"pointer",accentColor:"var(--gold)"}} /></td>
                      <td>
                        <div className="adm-user-avatar" style={u.role === 'superadmin' ? { background:'linear-gradient(135deg,#c9a84c,#e8c96d)', color:'#000' } : {}}>
                          {u.name.charAt(0)}
                        </div>
                      </td>
                      <td>
                        <strong>{u.name}</strong>
                        {u.role === 'superadmin' && <span style={{ display:'block', fontSize:'0.68rem', color:'var(--gold)', letterSpacing:1, textTransform:'uppercase' }}>Super Admin</span>}
                      </td>
                      <td style={{ fontSize:'0.8rem', color:'var(--muted)' }}>{u.email}</td>
                      <td>
                        {isSuper && u.id !== user.id ? (
                          <select className="field" style={{ padding:'3px 8px', fontSize:'0.78rem', width:'auto' }}
                            value={u.role}
                            onChange={e => {
                              const newRole = e.target.value;
                              setUsers(prev => prev.map(x => x.id === u.id ? { ...x, role: newRole } : x));
                              // Persist role change so Login reads it
                              const roleChanges = JSON.parse(localStorage.getItem('eh_role_overrides') || '{}');
                              roleChanges[u.email.toLowerCase()] = newRole;
                              localStorage.setItem('eh_role_overrides', JSON.stringify(roleChanges));
                              showToast('Role updated: ' + newRole + ' for ' + u.name);
                            }}>
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                            <option value="superadmin">Super Admin</option>
                          </select>
                        ) : (
                          <span className={'adm-role adm-role--' + (u.role === 'superadmin' ? 'admin' : u.role)}>{u.role}</span>
                        )}
                      </td>
                      <td>{u.books}</td>
                      <td style={{ fontSize:'0.8rem', color:'var(--muted)' }}>{u.joined}</td>
                      <td>
                        <span className={'adm-status adm-status--' + (isUserSuspended(u.email) ? 'refunded' : 'completed')}>
                          {isUserSuspended(u.email) ? 'Suspended' : 'Active'}
                        </span>
                      </td>
                      <td className="adm-actions">
                        {/* Reset password  superadmin can reset anyone, admin can only reset users */}
                        {(isSuper || u.role === 'user') && u.id !== user.id && (
                          <button className="adm-act-btn adm-act-edit" onClick={() => { setResetPwUser(u); setNewPw(''); }}>
                            Reset PW
                          </button>
                        )}
                        {/* Suspend / Activate — Firestore-backed, takes effect instantly on user's session */}
                        {u.id !== user.id && u.role !== 'superadmin' && (
                          <button className="adm-act-btn adm-act-edit" style={{ marginLeft:4 }}
                            onClick={async () => {
                              const isSusp = isUserSuspended(u.email);
                              await setSuspended(u.email, !isSusp);
                              setUsers(prev => prev.map(x => x.id === u.id ? { ...x, status: !isSusp ? 'Suspended' : 'Active' } : x));
                              showToast(u.name + (!isSusp ? ' suspended — they will be logged out immediately' : ' reactivated ✅'));
                            }}>
                            {isUserSuspended(u.email) ? 'Activate' : 'Suspend'}
                          </button>
                        )}
                        {/* Delete user  superadmin only */}
                        {isSuper && u.id !== user.id && (
                          <button className="adm-act-btn adm-act-del" style={{ marginLeft:4 }}
                            onClick={() => handleDeleteUser(u)}>
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {/* USER LIBRARIES */}
        {tab === 'userbooks' && (
          <UserLibrariesTab users={users} books={books} showToast={showToast} />
        )}
        {/* REVIEWS */}
        {tab === 'reviews' && (
          <Suspense fallback={<PanelLoader />}>
            <ReviewsPanel books={books} showToast={showToast} isSuper={isSuper} />
          </Suspense>
        )}

        {/* NEWSLETTER */}
        {tab === 'newsletter' && (
          <Suspense fallback={<PanelLoader />}>
            <NewsletterPanel showToast={showToast} />
          </Suspense>
        )}

        {/* PROMO CODES */}
        {tab === 'promos' && (
          <div className="adm-page">
            <div className="adm-page-head">
              <div><h1>Promo Codes</h1><span className="adm-page-sub">Manage discount codes for readers</span></div>
              <button className="btn btn-primary" onClick={() => {
                const code = 'HAVEN' + Math.floor(Math.random()*90+10);
                const next = [...promos, { id:'p_'+Date.now(), code, discount:'15%', type:'Percentage', uses:0, active:true, expires:'2025-12-31' }];
                savePromos(next);
                showToast('Promo code ' + code + ' created');
              }}>+ New Promo</button>
            </div>
            {/* Quick stats */}
            <div className="adm-stats-grid" style={{ gridTemplateColumns:'repeat(4,1fr)', marginBottom:20 }}>
              {[
                { label:'Active Codes',  value:promos.filter(p=>p.active).length,            color:'#2ecc71' },
                { label:'Total Uses',    value:promos.reduce((s,p)=>s+p.uses,0),             color:'#c9a84c' },
                { label:'Inactive',      value:promos.filter(p=>!p.active).length,           color:'#e8832a' },
                { label:'Avg Uses/Code', value:Math.round(promos.reduce((s,p)=>s+p.uses,0)/Math.max(promos.length,1)), color:'#4a9eff' },
              ].map(s=>(
                <div key={s.label} className="adm-stat-card card">
                  <div className="adm-stat-body"><strong style={{color:s.color}}>{s.value}</strong><span>{s.label}</span></div>
                </div>
              ))}
            </div>

            {/* Create promo form */}
            <div className="card" style={{ padding:20, marginBottom:20 }}>
              <h3 style={{ fontSize:'0.92rem', marginBottom:16, color:'var(--gold)' }}>Create Custom Promo Code</h3>
              <PromoCreateForm onSave={(newPromo) => { const next = [...promos, newPromo]; savePromos(next); showToast('✅ Promo code ' + newPromo.code + ' created'); }} />
            </div>

            <div className="card" style={{ overflow:'hidden' }}>
              <table className="adm-table">
                <thead><tr><th>Code</th><th>Discount</th><th>Type</th><th>Times Used</th><th>Active</th><th>Expires</th><th>Actions</th></tr></thead>
                <tbody>
                  {promos.map(p => (
                    <tr key={p.id}>
                      <td>
                        <code className="adm-code" style={{ fontSize:'0.9rem', color:'var(--gold)' }}>{p.code}</code>
                        <button onClick={() => { navigator.clipboard.writeText(p.code); showToast('Code copied!'); }}
                          style={{ marginLeft:8, background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:'0.72rem' }}>
                          📋
                        </button>
                      </td>
                      <td><strong>{p.discount}</strong></td>
                      <td><span className="adm-badge">{p.type}</span></td>
                      <td>{p.uses} uses</td>
                      <td>
                        <button className={'adm-flag-btn' + (p.active ? ' on' : '')}
                          onClick={() => savePromos(promos.map(x => x.id === p.id ? { ...x, active:!x.active } : x))}>
                          {p.active ? 'Active' : 'Off'}
                        </button>
                      </td>
                      <td style={{ fontSize:'0.8rem', color: new Date(p.expires) < new Date() ? '#e74c3c' : 'var(--muted)' }}>
                        {p.expires}
                        {new Date(p.expires) < new Date() && <span style={{ marginLeft:4, fontSize:'0.68rem', color:'#e74c3c' }}>(Expired)</span>}
                      </td>
                      <td>
                        <button className="adm-act-btn adm-act-del"
                          onClick={() => { savePromos(promos.filter(x => x.id !== p.id)); showToast('Promo code removed'); }}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {/* ANALYTICS / REPORTS */}
        {tab === 'analytics' && (
          <Suspense fallback={<PanelLoader />}>
            <ReportsPanel orders={allOrders} books={books} users={users} showToast={showToast} />
          </Suspense>
        )}
        {tab === 'reports' && (
          <Suspense fallback={<PanelLoader />}>
            <ReportsPanel orders={allOrders} books={books} users={users} showToast={showToast} />
          </Suspense>
        )}

        {/* -- ACTIVITY FEED -- */}
        {tab === 'activity' && (
          <Suspense fallback={<PanelLoader />}>
            <ActivityPanel user={user} showToast={showToast} />
          </Suspense>
        )}

        {/* -- VISITORS -- */}
        {tab === 'visitors' && (
          <Suspense fallback={<PanelLoader />}>
            <VisitorsPanel showToast={showToast} />
          </Suspense>
        )}

        {/* SETTINGS */}
        {tab === 'settings' && (
          <div className="adm-page">
            <div className="adm-page-head">
              <div><h1>Settings</h1><span className="adm-page-sub">All changes save to the live site instantly</span></div>
            </div>
            <div className="adm-settings-grid">

              {/* Site Info  wired to context */}
              <div className="card adm-settings-card">
                <h3>Site Info</h3>
                <div className="adm-field-group"><label>Site Name</label><input className="field" value={sForm.siteName || ''} onChange={e => setSetting('siteName', e.target.value)} /></div>
                <div className="adm-field-group"><label>Tagline</label><input className="field" value={sForm.tagline || ''} onChange={e => setSetting('tagline', e.target.value)} /></div>
                <div className="adm-field-group"><label>Contact Email</label><input className="field" value={sForm.email || ''} onChange={e => setSetting('email', e.target.value)} /></div>
                <div className="adm-field-group"><label>Phone</label><input className="field" value={sForm.phone || ''} onChange={e => setSetting('phone', e.target.value)} /></div>
                <div className="adm-field-group"><label>Location</label><input className="field" value={sForm.location || ''} onChange={e => setSetting('location', e.target.value)} /></div>
                <button className="btn btn-primary btn-sm" style={{ marginTop:8 }} onClick={() => saveSettings('Site info')}>Save Changes</button>
              </div>

              {/* Author Profile  wired */}
              <div className="card adm-settings-card">
                <h3>Author Profile</h3>
                <div className="adm-field-group"><label>Author Name</label><input className="field" value={sForm.authorName || ''} onChange={e => setSetting('authorName', e.target.value)} /></div>
                <div className="adm-field-group"><label>Short Bio</label><textarea className="field" rows={3} value={sForm.authorBio || ''} onChange={e => setSetting('authorBio', e.target.value)} style={{ resize:'vertical' }} /></div>
                <div className="adm-field-group"><label>Website</label><input className="field" value={sForm.authorWeb || ''} onChange={e => setSetting('authorWeb', e.target.value)} /></div>
                <div className="adm-field-group"><label>Twitter / X</label><input className="field" value={sForm.authorTwitter || ''} onChange={e => setSetting('authorTwitter', e.target.value)} placeholder="@handle" /></div>
                <button className="btn btn-primary btn-sm" style={{ marginTop:8 }} onClick={() => saveSettings('Author profile')}>Save Changes</button>
              </div>

              {/* Payment settings moved to dedicated Payment Methods tab */}
              <div className="card adm-settings-card" style={{ gridColumn:'1/-1' }}>
                <h3>💳 Payment Settings</h3>
                <div className="adm-info-note">
                  Payment method configuration has moved to its own dedicated tab.
                  <button className="btn btn-outline btn-sm" style={{ marginLeft:16 }} onClick={() => setTab('payments')}>
                    Go to Payment Methods ?
                  </button>
                </div>
              </div>
              {/* Admin Security  SuperAdmin only */}
              <div className="card adm-settings-card">
                <h3>Admin and Security {isSuper && <span style={{ fontSize:'0.68rem', background:'linear-gradient(135deg,#c9a84c,#e8c96d)', color:'#000', padding:'2px 8px', borderRadius:10, marginLeft:8, fontWeight:700, letterSpacing:1 }}>SUPER ADMIN</span>}</h3>
                <div className="adm-field-group"><label>Admin Email</label><input className="field" defaultValue="ellines.haven@gmail.com" /></div>
                <div className="adm-field-group"><label>New Password</label><input className="field" type="password" placeholder="Leave blank to keep current" /></div>
                <div className="adm-field-group"><label>Confirm Password</label><input className="field" type="password" placeholder="Repeat new password" /></div>
                {isSuper && (
                  <div className="adm-info-note" style={{ marginBottom:12 }}>
                    As Super Admin you have full control  user management, payment methods, all settings. Regular admins can manage books, orders and users but cannot change system settings or promote users.
                  </div>
                )}
                <div className="adm-field-group">
                  <label>Two-Factor Authentication</label>
                  <label className="adm-check"><input type="checkbox" defaultChecked={false} /> Enable 2FA via email OTP</label>
                </div>
                <div className="adm-field-group">
                  <label>Session Timeout</label>
                  <select className="field"><option>30 minutes</option><option>1 hour</option><option>4 hours</option><option>Never</option></select>
                </div>
                <button className="btn btn-primary btn-sm" style={{ marginTop:8 }} onClick={() => showToast('Security settings saved')}>Update Credentials</button>
              </div>

              {/* Notifications */}
              <div className="card adm-settings-card">
                <h3>Email Notifications</h3>
                <p style={{ fontSize:'0.78rem', color:'var(--muted)', marginBottom:16 }}>Choose which events trigger email alerts.</p>
                {['New order placed','New user registered','Review submitted','Payment failed'].map(item => (
                  <label key={item} className="adm-check" style={{ marginBottom:12 }}>
                    <input type="checkbox" defaultChecked={true} /> {item}
                  </label>
                ))}
                <div className="adm-field-group" style={{ marginTop:8 }}><label>Notification Email</label><input className="field" value={sForm.email || ''} onChange={e => setSetting('email', e.target.value)} /></div>
                <button className="btn btn-primary btn-sm" style={{ marginTop:8 }} onClick={() => saveSettings('Notification preferences')}>Save Preferences</button>
              </div>

              {/* SEO */}
              <div className="card adm-settings-card">
                <h3>SEO and Meta</h3>
                <div className="adm-field-group"><label>Meta Title</label><input className="field" value={'Ellines Haven  ' + (sForm.tagline || '')} onChange={() => {}} /></div>
                <div className="adm-field-group"><label>Meta Description</label><textarea className="field" rows={3} defaultValue="Discover compelling African novels and short stories by Elijah Mwangi M." style={{ resize:'vertical' }} /></div>
                <div className="adm-field-group"><label>Google Analytics ID</label><input className="field" defaultValue="" placeholder="G-XXXXXXXXXX" /></div>
                <div className="adm-field-group"><label>Facebook Pixel ID</label><input className="field" defaultValue="" placeholder="XXXXXXXXXXXXXXX" /></div>
                <button className="btn btn-primary btn-sm" style={{ marginTop:8 }} onClick={() => showToast('SEO settings saved')}>Save Changes</button>
              </div>

            </div>
          </div>
        )}

        {/* -- PAYMENT METHODS TAB -- */}
        {tab === 'payments' && (
          <div className="adm-page">
            <div className="adm-page-head">
              <div>
                <h1>Payment Methods</h1>
                <span className="adm-page-sub">Activate or deactivate each method — changes show on checkout immediately</span>
              </div>
            </div>

            {/* ── Quick status overview ── */}
            {(() => {
              const activeMethods = sForm.payMethods || ['mpesa','paystack','airtel','card'];
              const allMethods = [
                { key:'paystack', icon:'🟢', label:'Paystack' },
                { key:'mpesa',    icon:'📱', label:'M-Pesa STK' },
                { key:'paypal',   icon:'🅿', label:'PayPal' },
                { key:'airtel',   icon:'📶', label:'Airtel' },
                { key:'card',     icon:'💳', label:'Stripe' },
                { key:'wa',       icon:'💬', label:'WhatsApp' },
              ];
              return (
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:20, padding:'12px 16px', background:'var(--surface)', borderRadius:'var(--r)', border:'1px solid var(--border)' }}>
                  <span style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, alignSelf:'center', marginRight:4 }}>At Checkout:</span>
                  {allMethods.map(m => {
                    const on = activeMethods.includes(m.key);
                    return (
                      <button key={m.key}
                        onClick={() => {
                          const cur = sForm.payMethods || ['mpesa','paystack','airtel','card'];
                          const next = on ? cur.filter(x => x !== m.key) : [...cur, m.key];
                          setSetting('payMethods', next);
                          updateSettings({ ...sForm, payMethods: next });
                          showToast(on ? `${m.label} deactivated` : `${m.label} activated`);
                        }}
                        style={{
                          padding:'5px 12px', borderRadius:20, border:'none', cursor:'pointer',
                          background: on ? 'rgba(46,204,113,0.15)' : 'rgba(100,116,139,0.12)',
                          color: on ? '#2ecc71' : 'var(--muted)',
                          fontWeight:700, fontSize:'0.78rem', fontFamily:'inherit',
                          display:'flex', alignItems:'center', gap:5,
                          transition:'all 0.15s',
                        }}>
                        <span style={{ width:7, height:7, borderRadius:'50%', background: on ? '#2ecc71' : '#64748b', flexShrink:0, display:'inline-block' }} />
                        {m.icon} {m.label}
                      </button>
                    );
                  })}
                </div>
              );
            })()}

            <div className="adm-settings-grid">

              {/* M-Pesa */}
              {(() => {
                const key = 'mpesa';
                const activeMethods = sForm.payMethods || ['mpesa','paystack','airtel','card'];
                const isActive = activeMethods.includes(key);
                const toggle = () => {
                  const next = isActive ? activeMethods.filter(x=>x!==key) : [...activeMethods, key];
                  setSetting('payMethods', next);
                  updateSettings({ ...sForm, payMethods: next });
                  showToast(isActive ? '📱 M-Pesa hidden from checkout' : '📱 M-Pesa shown at checkout');
                };
                return (
                  <div className="card adm-settings-card" style={{ borderTop:`3px solid ${isActive?'#2ecc71':'#64748b'}` }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                      <h3 style={{ margin:0 }}>📱 M-Pesa STK Push</h3>
                      <button onClick={toggle} style={{
                        padding:'6px 16px', borderRadius:20, border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:'0.8rem',
                        background: isActive ? 'rgba(46,204,113,0.15)' : 'rgba(231,76,60,0.12)',
                        color: isActive ? '#2ecc71' : '#e74c3c',
                      }}>{isActive ? '✓ Active' : '✕ Inactive'}</button>
                    </div>
                    <p style={{ fontSize:'0.82rem', color:'var(--muted)', marginBottom:16 }}>Automatic STK push — customer enters PIN on their phone.</p>
                    <div className="adm-field-group">
                      <label>Send Money Number</label>
                      <input className="field" value={sForm.mpesaPhone || ''} onChange={e => setSetting('mpesaPhone', e.target.value)} placeholder="0748255466" />
                    </div>
                    <div className="adm-field-group">
                      <label>Lipa Na M-Pesa Till</label>
                      <input className="field" value={sForm.mpesaTill || ''} onChange={e => setSetting('mpesaTill', e.target.value)} placeholder="Leave blank to use phone" />
                    </div>
                    <div className="adm-field-group">
                      <label>Business Name</label>
                      <input className="field" value={sForm.mpesaName || ''} onChange={e => setSetting('mpesaName', e.target.value)} placeholder="Ellines Haven" />
                    </div>
                    <button className="btn btn-primary btn-sm" style={{ marginTop:8 }} onClick={() => saveSettings('M-Pesa settings')}>Save M-Pesa</button>
                  </div>
                );
              })()}

              {/* Paystack */}
              {(() => {
                const key = 'paystack';
                const activeMethods = sForm.payMethods || ['mpesa','paystack','airtel','card'];
                const isActive = activeMethods.includes(key);
                const toggle = () => {
                  const next = isActive ? activeMethods.filter(x=>x!==key) : [...activeMethods, key];
                  setSetting('payMethods', next);
                  updateSettings({ ...sForm, payMethods: next });
                  showToast(isActive ? '🟢 Paystack hidden from checkout' : '🟢 Paystack shown at checkout');
                };
                return (
                  <div className="card adm-settings-card" style={{ borderTop:`3px solid ${isActive?'#2ecc71':'#64748b'}` }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                      <h3 style={{ margin:0 }}>🟢 Paystack</h3>
                      <button onClick={toggle} style={{
                        padding:'6px 16px', borderRadius:20, border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:'0.8rem',
                        background: isActive ? 'rgba(46,204,113,0.15)' : 'rgba(231,76,60,0.12)',
                        color: isActive ? '#2ecc71' : '#e74c3c',
                      }}>{isActive ? '✓ Active' : '✕ Inactive'}</button>
                    </div>
                    <p style={{ fontSize:'0.82rem', color:'var(--muted)', marginBottom:8 }}>Accepts M-Pesa, local cards, and bank transfers. Books unlock <strong>automatically</strong>.</p>
                    <div className="adm-info-note" style={{ fontSize:'0.75rem' }}>Public key is hardcoded in Cart.jsx. Update it there if needed.</div>
                  </div>
                );
              })()}

              {/* Airtel Money */}
              {(() => {
                const key = 'airtel';
                const activeMethods = sForm.payMethods || ['mpesa','paystack','airtel','card'];
                const isActive = activeMethods.includes(key);
                const toggle = () => {
                  const next = isActive ? activeMethods.filter(x=>x!==key) : [...activeMethods, key];
                  setSetting('payMethods', next);
                  updateSettings({ ...sForm, payMethods: next });
                  showToast(isActive ? '📶 Airtel hidden from checkout' : '📶 Airtel shown at checkout');
                };
                return (
                  <div className="card adm-settings-card" style={{ borderTop:`3px solid ${isActive?'#2ecc71':'#64748b'}` }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                      <h3 style={{ margin:0 }}>📶 Airtel Money</h3>
                      <button onClick={toggle} style={{
                        padding:'6px 16px', borderRadius:20, border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:'0.8rem',
                        background: isActive ? 'rgba(46,204,113,0.15)' : 'rgba(231,76,60,0.12)',
                        color: isActive ? '#2ecc71' : '#e74c3c',
                      }}>{isActive ? '✓ Active' : '✕ Inactive'}</button>
                    </div>
                    <p style={{ fontSize:'0.82rem', color:'var(--muted)', marginBottom:16 }}>Manual verification required — admin confirms in Orders tab.</p>
                    <div className="adm-field-group">
                      <label>Airtel Money Number</label>
                      <input className="field" value={sForm.airtelNum || ''} onChange={e => setSetting('airtelNum', e.target.value)} placeholder="073X XXX XXX" />
                    </div>
                    <button className="btn btn-primary btn-sm" style={{ marginTop:8 }} onClick={() => saveSettings('Airtel settings')}>Save Airtel</button>
                  </div>
                );
              })()}

              {/* WhatsApp */}
              {(() => {
                const key = 'wa';
                const activeMethods = sForm.payMethods || ['mpesa','paystack','airtel','card'];
                const isActive = activeMethods.includes(key);
                const toggle = () => {
                  const next = isActive ? activeMethods.filter(x=>x!==key) : [...activeMethods, key];
                  setSetting('payMethods', next);
                  updateSettings({ ...sForm, payMethods: next });
                  showToast(isActive ? '💬 WhatsApp hidden from checkout' : '💬 WhatsApp shown at checkout');
                };
                return (
                  <div className="card adm-settings-card" style={{ borderTop:`3px solid ${isActive?'#2ecc71':'#64748b'}` }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                      <h3 style={{ margin:0 }}>💬 WhatsApp Pay</h3>
                      <button onClick={toggle} style={{
                        padding:'6px 16px', borderRadius:20, border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:'0.8rem',
                        background: isActive ? 'rgba(46,204,113,0.15)' : 'rgba(231,76,60,0.12)',
                        color: isActive ? '#2ecc71' : '#e74c3c',
                      }}>{isActive ? '✓ Active' : '✕ Inactive'}</button>
                    </div>
                    <p style={{ fontSize:'0.82rem', color:'var(--muted)' }}>Customer sends payment then confirms via WhatsApp. Manual unlock required.</p>
                  </div>
                );
              })()}

              {/* PayPal */}
              {(() => {
                const key = 'paypal';
                const activeMethods = sForm.payMethods || ['mpesa','paystack','airtel','card'];
                const isActive = activeMethods.includes(key);
                const toggle = () => {
                  const next = isActive ? activeMethods.filter(x=>x!==key) : [...activeMethods, key];
                  setSetting('payMethods', next);
                  setSetting('paypalEnabled', !isActive);
                  updateSettings({ ...sForm, payMethods: next, paypalEnabled: !isActive });
                  showToast(isActive ? '🅿 PayPal hidden from checkout' : '🅿 PayPal shown at checkout');
                };
                return (
                  <div className="card adm-settings-card" style={{ borderTop:`3px solid ${isActive?'#2ecc71':'#64748b'}` }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                      <h3 style={{ margin:0 }}>🅿 PayPal</h3>
                      <button onClick={toggle} style={{
                        padding:'6px 16px', borderRadius:20, border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:'0.8rem',
                        background: isActive ? 'rgba(46,204,113,0.15)' : 'rgba(231,76,60,0.12)',
                        color: isActive ? '#2ecc71' : '#e74c3c',
                      }}>{isActive ? '✓ Active' : '✕ Inactive'}</button>
                    </div>
                    <p style={{ fontSize:'0.82rem', color:'var(--muted)', marginBottom:16 }}>International payments — USD. Books unlock automatically.</p>
                    <div className="adm-field-group">
                      <label>PayPal Client ID</label>
                      <input className="field" value={sForm.paypalClientId || ''} onChange={e => setSetting('paypalClientId', e.target.value)} placeholder="AXxxx…" />
                    </div>
                    <div className="adm-info-note" style={{ marginTop:8, fontSize:'0.75rem' }}>
                      Set <code>PAYPAL_CLIENT_ID</code>, <code>PAYPAL_CLIENT_SECRET</code>, <code>PAYPAL_MODE</code> as Firebase secrets.
                    </div>
                    <button className="btn btn-primary btn-sm" style={{ marginTop:10 }} onClick={() => saveSettings('PayPal settings')}>Save PayPal</button>
                  </div>
                );
              })()}

              {/* Stripe / Card */}
              {(() => {
                const key = 'card';
                const activeMethods = sForm.payMethods || ['mpesa','paystack','airtel','card'];
                const isActive = activeMethods.includes(key);
                const toggle = () => {
                  const next = isActive ? activeMethods.filter(x=>x!==key) : [...activeMethods, key];
                  setSetting('payMethods', next);
                  setSetting('stripeEnabled', !isActive);
                  updateSettings({ ...sForm, payMethods: next, stripeEnabled: !isActive });
                  showToast(isActive ? '💳 Stripe hidden from checkout' : '💳 Stripe shown at checkout');
                };
                return (
                  <div className="card adm-settings-card" style={{ borderTop:`3px solid ${isActive?'#2ecc71':'#64748b'}` }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                      <h3 style={{ margin:0 }}>💳 Card / Stripe</h3>
                      <button onClick={toggle} style={{
                        padding:'6px 16px', borderRadius:20, border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:700, fontSize:'0.8rem',
                        background: isActive ? 'rgba(46,204,113,0.15)' : 'rgba(231,76,60,0.12)',
                        color: isActive ? '#2ecc71' : '#e74c3c',
                      }}>{isActive ? '✓ Active' : '✕ Inactive'}</button>
                    </div>
                    <p style={{ fontSize:'0.82rem', color:'var(--muted)', marginBottom:16 }}>Stripe card payments (requires Stripe setup).</p>
                    <div className="adm-field-group">
                      <label>Stripe Secret Key</label>
                      <input className="field" type="password" value={sForm.stripeKey || ''} onChange={e => setSetting('stripeKey', e.target.value)} placeholder="sk_live_..." />
                    </div>
                    <div className="adm-field-group">
                      <label>Currency</label>
                      <select className="field" value={sForm.currency || 'KES'} onChange={e => setSetting('currency', e.target.value)}>
                        <option value="KES">KES — Kenyan Shilling</option>
                        <option value="USD">USD — US Dollar</option>
                        <option value="EUR">EUR — Euro</option>
                      </select>
                    </div>
                    <button className="btn btn-primary btn-sm" style={{ marginTop:8 }} onClick={() => saveSettings('Card settings')}>Save Stripe</button>
                  </div>
                );
              })()}

              {/* Custom Payment Methods */}
              <div className="card adm-settings-card" style={{ gridColumn:'1/-1' }}>
                <h3>➕ Custom Payment Methods</h3>
                <p style={{ fontSize:'0.82rem', color:'var(--muted)', marginBottom:16 }}>Add bank transfer, Pesalink, PayPal, or any other method. They appear at checkout alongside the built-in methods.</p>
                {customMethods.length > 0 && (
                  <table className="adm-table" style={{ marginBottom:20 }}>
                    <thead><tr><th>Name</th><th>Type</th><th>Account / Number</th><th>Active</th><th>Remove</th></tr></thead>
                    <tbody>
                      {customMethods.map((m, i) => (
                        <tr key={i}>
                          <td><strong>{m.name}</strong></td>
                          <td><span className="adm-badge">{m.type}</span></td>
                          <td style={{ fontSize:'0.82rem' }}>{m.number}</td>
                          <td>
                            <button className={'adm-flag-btn' + (m.enabled ? ' on' : '')}
                              onClick={() => setCustomMethods(prev => prev.map((x,j) => j===i ? {...x, enabled:!x.enabled} : x))}>
                              {m.enabled ? 'On' : 'Off'}
                            </button>
                          </td>
                          <td>
                            <button className="adm-act-btn adm-act-del"
                              onClick={() => { setCustomMethods(prev => prev.filter((_,j) => j!==i)); showToast('Payment method removed'); }}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="adm-pay-add-form">
                  <p style={{ fontSize:'0.78rem', color:'var(--gold)', fontWeight:700, marginBottom:12, textTransform:'uppercase', letterSpacing:1 }}>Add New Method</p>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr auto', gap:12, alignItems:'end' }}>
                    <div className="adm-field-group" style={{ marginBottom:0 }}>
                      <label>Method Name</label>
                      <input className="field" value={newPayMethod.name} onChange={e => setNewPayMethod(p => ({...p, name:e.target.value}))} placeholder="e.g. Pesalink, PayPal" />
                    </div>
                    <div className="adm-field-group" style={{ marginBottom:0 }}>
                      <label>Type</label>
                      <select className="field" value={newPayMethod.type} onChange={e => setNewPayMethod(p => ({...p, type:e.target.value}))}>
                        <option value="mobile">Mobile Money</option>
                        <option value="bank">Bank Transfer</option>
                        <option value="card">Card</option>
                        <option value="digital">Digital Wallet</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="adm-field-group" style={{ marginBottom:0 }}>
                      <label>Account / Number</label>
                      <input className="field" value={newPayMethod.number} onChange={e => setNewPayMethod(p => ({...p, number:e.target.value}))} placeholder="Account number or details" />
                    </div>
                    <button className="btn btn-primary btn-sm" style={{ height:42 }}
                      onClick={() => {
                        if (!newPayMethod.name.trim()) return;
                        setCustomMethods(prev => [...prev, { ...newPayMethod, id:'pm_'+Date.now() }]);
                        setNewPayMethod({ name:'', type:'mobile', number:'', enabled:true });
                        showToast('Payment method added');
                      }}>+ Add</button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* -- FEE CALCULATOR TAB -- */}
        {tab === 'payfees' && (
          <Suspense fallback={<PanelLoader />}>
            <PaymentFeesPanel />
          </Suspense>
        )}

        {/* -- PERMISSIONS TAB -- */}
        {tab === 'permissions' && (
          <div className="adm-page">
            <div className="adm-page-head">
              <div>
                <h1>User Permissions</h1>
                <span className="adm-page-sub">Grant or deny specific capabilities per user</span>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => {
                saveUserPerms({});
                showToast('All permissions reset to defaults');
              }}>Reset All to Default</button>
            </div>

            {/* Legend */}
            <div className="adm-alert-box" style={{ marginBottom:20 }}>
              <strong>How it works:</strong> Toggle any permission on/off per user. Changes take effect immediately on their next action. Green = allowed, Red = denied.
            </div>

            <div className="card" style={{ overflow:'auto' }}>
              <table className="adm-table adm-perms-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th style={{textAlign:'center'}}>Browse</th>
                    <th style={{textAlign:'center'}}>Purchase</th>
                    <th style={{textAlign:'center'}}>Reviews</th>
                    <th style={{textAlign:'center'}}>Download</th>
                    <th style={{textAlign:'center'}}>Read Online</th>
                    <th style={{textAlign:'center'}}>My Library</th>
                    <th style={{textAlign:'center'}}>Book Details</th>
                    <th style={{textAlign:'center'}}>Place Orders</th>
                    <th style={{textAlign:'center'}}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr><td colSpan={11} style={{textAlign:'center',padding:'32px 0',color:'var(--muted)',fontSize:'0.85rem'}}>No users found</td></tr>
                  ) : users.filter(u => u.role !== 'superadmin' && u.role !== 'admin').length === 0 ? (
                    <tr><td colSpan={11} style={{textAlign:'center',padding:'32px 0',color:'var(--muted)',fontSize:'0.85rem'}}>No regular users yet. Admin accounts are managed in Admin Control.</td></tr>
                  ) : null}
                  {users.filter(u => u.role !== 'superadmin' && u.role !== 'admin').map(u => {
                    const p = getPerms(u.email);
                    const isSuspended = isUserSuspended(u.email);
                    const PermToggle = ({ field }) => (
                      <td style={{textAlign:'center'}}>
                        <button
                          className={'adm-perm-btn' + (p[field] && !isSuspended ? ' on' : ' off')}
                          onClick={() => localSetPerm(u.email, field, !p[field])}
                          disabled={isSuspended}
                          title={isSuspended ? 'User is suspended' : (p[field] ? 'Click to deny' : 'Click to allow')}
                        >
                          {isSuspended ? '–' : p[field] ? 'ON' : 'OFF'}
                        </button>
                      </td>
                    );
                    return (
                      <tr key={u.id} style={isSuspended ? { opacity:0.5 } : {}}>
                        <td>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <div className="adm-user-avatar" style={{flexShrink:0,width:28,height:28,fontSize:'0.75rem'}}>
                              {u.name.charAt(0)}
                            </div>
                            <div style={{minWidth:0}}>
                              <strong style={{fontSize:'0.85rem',display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{u.name}</strong>
                              <span style={{display:'block',fontSize:'0.72rem',color:'var(--muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{u.email}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="adm-role adm-role--user">{u.role || 'user'}</span>
                        </td>
                        <PermToggle field="canBrowse"           />
                        <PermToggle field="canPurchase"         />
                        <PermToggle field="canReview"           />
                        <PermToggle field="canDownload"         />
                        <PermToggle field="canReadOnline"       />
                        <PermToggle field="canAccessMyLibrary"  />
                        <PermToggle field="canViewBookDetails"  />
                        <PermToggle field="canPlaceOrders"      />
                        <td style={{textAlign:'center'}}>
                          <button
                            className={'adm-perm-btn' + (isSuspended ? ' off' : ' on')}
                            onClick={async () => {
                              await setSuspended(u.email, !isSuspended);
                              setUsers(prev => prev.map(x => x.id === u.id ? { ...x, status: !isSuspended ? 'Suspended' : 'Active' } : x));
                              showToast(u.name + (!isSuspended ? ' suspended — logged out instantly' : ' reactivated ✅'));
                            }}>
                            {isSuspended ? 'Suspended' : 'Active'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Quick actions */}
            {isSuper && (
              <div className="adm-dash-grid" style={{marginTop:24}}>
                <div className="card" style={{padding:24}}>
                  <h3 style={{marginBottom:16,fontSize:'0.95rem'}}>Bulk Actions</h3>
                  <div style={{display:'flex',flexDirection:'column',gap:10}}>
                    {[
                      { label:'Disable purchases for all users', action: () => {
                        const updated = {};
                        users.forEach(u => { updated[u.email.toLowerCase()] = { ...getPerms(u.email), canPurchase: false }; });
                        saveUserPerms(updated); showToast('Purchases disabled for all users');
                      }},
                      { label:'Enable purchases for all users', action: () => {
                        const updated = {...userPerms};
                        users.forEach(u => { updated[u.email.toLowerCase()] = { ...getPerms(u.email), canPurchase: true }; });
                        saveUserPerms(updated); showToast('Purchases enabled for all users');
                      }},
                      { label:'Disable reviews site-wide', action: () => {
                        const updated = {};
                        users.forEach(u => { updated[u.email.toLowerCase()] = { ...getPerms(u.email), canReview: false }; });
                        saveUserPerms(updated); showToast('Reviews disabled site-wide');
                      }},
                      { label:'Reset all user permissions to default', action: () => {
                        localStorage.removeItem('eh_user_perms'); saveUserPerms({}); showToast('✅ Permissions reset to defaults');
                      }},
                    ].map(action => (
                      <button key={action.label} className="btn btn-ghost btn-sm" style={{textAlign:'left',justifyContent:'flex-start'}} onClick={action.action}>
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="card" style={{padding:24}}>
                  <h3 style={{marginBottom:16,fontSize:'0.95rem'}}>Permission Guide</h3>
                  {[
                    { perm:'Browse Library',   desc:'View book catalogue and details page' },
                    { perm:'Purchase Books',   desc:'Add to cart and checkout' },
                    { perm:'Write Reviews',    desc:'Submit star ratings and text reviews' },
                    { perm:'Download PDFs',    desc:'Download purchased books as PDF files' },
                    { perm:'Read Online',      desc:'Access the online reader for owned books' },
                    { perm:'My Library',       desc:'Access the My Library page' },
                    { perm:'Book Details',     desc:'View individual book detail pages' },
                    { perm:'Place Orders',     desc:'Submit payment and place orders' },
                    { perm:'Account Status',   desc:'Suspended = blocked from all site actions' },
                  ].map(g => (
                    <div key={g.perm} style={{padding:'8px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      <strong style={{fontSize:'0.82rem',color:'var(--gold)'}}>{g.perm}</strong>
                      <p style={{fontSize:'0.75rem',color:'var(--muted)',margin:'2px 0 0'}}>{g.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* -- SUPER ADMIN: ADMIN CONTROL -- */}
        {tab === 'admins' && isSuper && (
          <div className="adm-page">
            <div className="adm-page-head">
              <div>
                <h1>Admin Control <span className="adm-super-tag" style={{verticalAlign:'middle',marginLeft:10}}>SUPER ADMIN</span></h1>
                <span className="adm-page-sub">Manage admin accounts, permissions and access levels</span>
              </div>
              <button className="btn btn-primary" onClick={() => {
                setAddUserForm({ name:'', email:'', password:'Admin@' + Math.floor(1000+Math.random()*9000), role:'admin' });
                setAddUserModal('admin');
              }}>+ Add Admin</button>
            </div>

            {/* Admin stats */}
            <div className="adm-stats-grid" style={{ gridTemplateColumns:'repeat(4,1fr)', marginBottom:24 }}>
              {[
                { label:'Super Admins',  value: users.filter(u=>u.role==='superadmin').length,  color:'#c9a84c' },
                { label:'Admins',        value: users.filter(u=>u.role==='admin').length,       color:'#4a9eff' },
                { label:'Active Admins', value: users.filter(u=>u.role==='admin'&&u.status==='Active').length, color:'#2ecc71' },
                { label:'Total Staff',   value: users.filter(u=>u.role!=='user').length,        color:'#c97fff' },
              ].map(s=>(
                <div key={s.label} className="adm-stat-card card">
                  <div className="adm-stat-body"><strong style={{color:s.color}}>{s.value}</strong><span>{s.label}</span></div>
                </div>
              ))}
            </div>

            {/* Admin accounts table */}
            <div className="card" style={{ overflow:'hidden', marginBottom:24 }}>
              <div className="adm-card-head"><h3>Admin Accounts</h3></div>
              <table className="adm-table">
                <thead><tr><th>Avatar</th><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
                <tbody>
                  {users.filter(u => u.role === 'admin' || u.role === 'superadmin').map(u => (
                    <tr key={u.id}>
                      <td>
                        <div className="adm-user-avatar" style={u.role==='superadmin'?{background:'linear-gradient(135deg,#c9a84c,#e8c96d)',color:'#000'}:{}}>
                          {u.name.charAt(0)}
                        </div>
                      </td>
                      <td>
                        <strong>{u.name}</strong>
                        <span style={{display:'block',fontSize:'0.7rem',color:'var(--muted)'}}>
                          {u.role === 'superadmin' ? 'Full system access' : 'Books, Orders, Users'}
                        </span>
                      </td>
                      <td style={{fontSize:'0.8rem',color:'var(--muted)'}}>{u.email}</td>
                      <td>
                        {u.id !== user.id ? (
                          <select className="field" style={{padding:'3px 8px',fontSize:'0.78rem',width:'auto'}}
                            value={u.role}
                            onChange={e => { setUsers(prev=>prev.map(x=>x.id===u.id?{...x,role:e.target.value}:x)); showToast('Role updated for ' + u.name); }}>
                            <option value="admin">Admin</option>
                            <option value="superadmin">Super Admin</option>
                          </select>
                        ) : (
                          <span className="adm-role adm-role--admin">{u.role}</span>
                        )}
                      </td>
                      <td>
                        <span className={'adm-status adm-status--' + (isUserSuspended(u.email)?'refunded':'completed')}>
                          {isUserSuspended(u.email)?'Suspended':'Active'}
                        </span>
                      </td>
                      <td style={{fontSize:'0.78rem',color:'var(--muted)'}}>{u.joined}</td>
                      <td className="adm-actions">
                        {u.id !== user.id && (
                          <>
                            <button className="adm-act-btn adm-act-edit" onClick={() => { setResetPwUser(u); setNewPw(''); setTab('users'); setTimeout(()=>setTab('admins'),50); }}>
                              Reset PW
                            </button>
                            <button className="adm-act-btn adm-act-edit" style={{marginLeft:4}}
                              onClick={async () => {
                                const isSusp = isUserSuspended(u.email);
                                await setSuspended(u.email, !isSusp);
                                setUsers(prev=>prev.map(x=>x.id===u.id?{...x,status:!isSusp?'Suspended':'Active'}:x));
                                showToast(u.name + (!isSusp?' suspended':' reactivated ✅'));
                              }}>
                              {isUserSuspended(u.email)?'Activate':'Suspend'}
                            </button>
                            {u.role !== 'superadmin' && (
                              <button className="adm-act-btn adm-act-del" style={{marginLeft:4}}
                                onClick={() => handleDeleteUser(u)}>
                                Remove
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Permissions matrix */}
            <div className="adm-dash-grid">
              <div className="card" style={{padding:24}}>
                <h3 style={{marginBottom:18,fontSize:'0.95rem'}}>Permission Matrix</h3>
                {[
                  { feature:'Manage Books',        admin:true,  superadmin:true  },
                  { feature:'Manage Orders',        admin:true,  superadmin:true  },
                  { feature:'Manage Users',         admin:true,  superadmin:true  },
                  { feature:'Moderate Reviews',     admin:true,  superadmin:true  },
                  { feature:'Promo Codes',          admin:true,  superadmin:true  },
                  { feature:'Analytics',            admin:true,  superadmin:true  },
                  { feature:'Site Settings',        admin:false, superadmin:true  },
                  { feature:'Payment Settings',     admin:false, superadmin:true  },
                  { feature:'Admin Control',        admin:false, superadmin:true  },
                  { feature:'System Logs',          admin:false, superadmin:true  },
                  { feature:'Backup & Restore',     admin:false, superadmin:true  },
                  { feature:'Promote to Admin',     admin:false, superadmin:true  },
                ].map(row => (
                  <div key={row.feature} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                    <span style={{fontSize:'0.85rem'}}>{row.feature}</span>
                    <div style={{display:'flex',gap:12}}>
                      <span style={{fontSize:'0.78rem',color:row.admin?'var(--ok)':'var(--err)',fontWeight:600,minWidth:50,textAlign:'center'}}>
                        {row.admin ? '✅ Admin' : '✗ Admin'}
                      </span>
                      <span style={{fontSize:'0.78rem',color:'var(--gold)',fontWeight:600,minWidth:70,textAlign:'center'}}>
                        ✅ Super
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="card" style={{padding:24}}>
                <h3 style={{marginBottom:18,fontSize:'0.95rem'}}>Recent Admin Activity</h3>
                {[
                  { action:'Book "Pain" price updated',        by:'Admin',       time:'2 hrs ago',   type:'edit'   },
                  { action:'Order ORD-003 confirmed',          by:'Admin',       time:'5 hrs ago',   type:'ok'     },
                  { action:'User Peter Waweru suspended',      by:'Super Admin', time:'1 day ago',   type:'warn'   },
                  { action:'Promo HAVEN10 deactivated',        by:'Admin',       time:'2 days ago',  type:'edit'   },
                  { action:'New book "The Acacia Road" added', by:'Super Admin', time:'3 days ago',  type:'ok'     },
                  { action:'Review by Sarah Kamau approved',   by:'Admin',       time:'4 days ago',  type:'ok'     },
                  { action:'Settings: M-Pesa number updated',  by:'Super Admin', time:'5 days ago',  type:'edit'   },
                ].map((a,i) => (
                  <div key={i} style={{display:'flex',gap:10,padding:'9px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',alignItems:'flex-start'}}>
                    <span style={{fontSize:'1rem',marginTop:2}}>{a.type==='ok'?'✅':a.type==='warn'?'⚠️':'✏️'}</span>
                    <div>
                      <div style={{fontSize:'0.82rem'}}>{a.action}</div>
                      <div style={{fontSize:'0.72rem',color:'var(--muted)',marginTop:2}}>by {a.by}  {a.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Admin Rights Management — Super Admin grants/revokes per-admin capabilities */}
            <div className="card" style={{padding:24,marginTop:24}}>
              <h3 style={{marginBottom:6,fontSize:'0.95rem'}}>Admin Rights Management</h3>
              <p style={{fontSize:'0.78rem',color:'var(--muted)',marginBottom:18}}>
                Grant or revoke specific capabilities for each admin account. Changes take effect immediately.
              </p>
              {users.filter(u => u.role === 'admin').length === 0 ? (
                <p style={{color:'var(--muted)',fontSize:'0.85rem'}}>No admin accounts yet. Add one above.</p>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:14}}>
                  {users.filter(u => u.role === 'admin').map(u => {
                    const perms = getUserPerms(u.email);
                    const rights = [
                      { field:'canManageBooks',    label:'Manage Books' },
                      { field:'canManageOrders',   label:'Manage Orders' },
                      { field:'canManageUsers',    label:'Manage Users' },
                      { field:'canViewAnalytics',  label:'View Analytics' },
                      { field:'canManagePromos',   label:'Promo Codes' },
                      { field:'canManageSettings', label:'Site Settings' },
                      { field:'canViewLogs',       label:'View Logs' },
                    ];
                    return (
                      <div key={u.id} style={{background:'rgba(255,255,255,0.02)',border:'1px solid var(--dim)',borderRadius:'var(--r-sm)',padding:'14px 16px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                          <div className="adm-user-avatar" style={{width:30,height:30,fontSize:'0.8rem',flexShrink:0}}>{u.name.charAt(0)}</div>
                          <div>
                            <strong style={{fontSize:'0.88rem'}}>{u.name}</strong>
                            <span style={{display:'block',fontSize:'0.72rem',color:'var(--muted)'}}>{u.email}</span>
                          </div>
                          {isUserSuspended(u.email) && <span style={{fontSize:'0.7rem',padding:'2px 8px',borderRadius:10,background:'rgba(231,76,60,0.1)',color:'#e74c3c',border:'1px solid rgba(231,76,60,0.3)',marginLeft:'auto'}}>SUSPENDED</span>}
                        </div>
                        <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                          {rights.map(r => (
                            <button key={r.field} type="button"
                              className={'adm-toggle' + (perms[r.field] !== false ? ' on' : '')}
                              style={{fontSize:'0.72rem',padding:'4px 10px'}}
                              onClick={async () => {
                                await setPermField(u.email, r.field, perms[r.field] === false ? true : false);
                                addLog('system', `Admin right "${r.label}" ${perms[r.field]===false?'granted to':'revoked from'} ${u.email}`);
                                showToast(`${r.label} ${perms[r.field]===false?'granted':'revoked'} for ${u.name}`);
                              }}>
                              {r.label}: {perms[r.field] !== false ? 'ON' : 'OFF'}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* -- SYSTEM LOGS -- */}
        {tab === 'logs' && (
          <div className="adm-page">
            <div className="adm-page-head">
              <div>
                <h1>System Logs</h1>
                <span className="adm-page-sub">Full audit trail of all system events</span>
              </div>
              <div style={{display:'flex',gap:10}}>
                <button className="btn btn-ghost btn-sm" onClick={() => {
                  // Export as CSV
                  const header = 'Time,Type,Event,User,IP,Status';
                  const rows = systemLogs.map(l =>
                    `"${l.time}","${l.type}","${l.event}","${l.user}","${l.ip}","${l.status}"`
                  ).join('\n');
                  const blob = new Blob([header + '\n' + rows], { type:'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = 'ellines-haven-logs.csv'; a.click();
                  URL.revokeObjectURL(url);
                  showToast('✅ Logs exported as CSV');
                }}>Export CSV</button>
                <button className="btn btn-ghost btn-sm" style={{color:'var(--err)',borderColor:'rgba(231,76,60,0.4)'}}
                  onClick={() => {
                    if (!window.confirm('Clear all system logs? This cannot be undone.')) return;
                    setSystemLogs([]);
                    // Clear from Firestore (the source of truth)
                    setDoc(doc(db, 'site_data', 'system_logs'), { logs: [], updatedAt: serverTimestamp() }, { merge: false })
                      .catch(() => {});
                    try { localStorage.removeItem('eh_system_logs'); } catch {}
                    showToast('🗑 System logs cleared');
                  }}>Clear Logs</button>
              </div>
            </div>

            {/* Log type filters */}
            <div className="adm-toolbar card" style={{gap:8,marginBottom:20}}>
              {['all','auth','order','book','user','system'].map(f => (
                <button key={f} className={'adm-filter-btn' + (logFilter===f?' on':'')} onClick={() => setLogFilter(f)}>
                  {f.charAt(0).toUpperCase()+f.slice(1)}
                </button>
              ))}
              <span className="adm-toolbar-count" style={{marginLeft:'auto'}}>
                {systemLogs.filter(l => logFilter==='all' || l.type===logFilter).length} entries
              </span>
            </div>

            {/* Stats */}
            <div className="adm-stats-grid" style={{gridTemplateColumns:'repeat(5,1fr)',marginBottom:24}}>
              {[
                { label:'Auth Events',   value: systemLogs.filter(l=>l.type==='auth').length,   color:'#4a9eff' },
                { label:'Order Events',  value: systemLogs.filter(l=>l.type==='order').length,  color:'#c9a84c' },
                { label:'Book Changes',  value: systemLogs.filter(l=>l.type==='book').length,   color:'#7ab648' },
                { label:'User Events',   value: systemLogs.filter(l=>l.type==='user').length,   color:'#c97fff' },
                { label:'System Events', value: systemLogs.filter(l=>l.type==='system').length, color:'#e8832a' },
              ].map(s=>(
                <div key={s.label} className="adm-stat-card card">
                  <div className="adm-stat-body"><strong style={{color:s.color}}>{s.value}</strong><span>{s.label}</span></div>
                </div>
              ))}
            </div>

            <div className="card" style={{overflow:'hidden'}}>
              <table className="adm-table">
                <thead><tr><th>Time</th><th>Type</th><th>Event</th><th>User</th><th>IP</th><th>Status</th></tr></thead>
                <tbody>
                  {systemLogs
                    .filter(l => logFilter==='all' || l.type===logFilter)
                    .map((l,i) => (
                    <tr key={i}>
                      <td style={{fontSize:'0.75rem',color:'var(--muted)',whiteSpace:'nowrap'}}>{l.time}</td>
                      <td><span className="adm-badge" style={{
                        background: l.type==='auth'?'rgba(74,158,255,0.1)':l.type==='order'?'rgba(201,168,76,0.1)':l.type==='book'?'rgba(122,182,72,0.1)':l.type==='user'?'rgba(201,127,255,0.1)':'rgba(232,131,42,0.1)',
                        color: l.type==='auth'?'#7eb6ff':l.type==='order'?'var(--gold)':l.type==='book'?'#a5d679':l.type==='user'?'#d49fff':'#f0a055',
                        borderColor: 'transparent'
                      }}>{l.type}</span></td>
                      <td style={{fontSize:'0.83rem'}}>{l.event}</td>
                      <td style={{fontSize:'0.8rem',color:'var(--muted)'}}>{l.user}</td>
                      <td><code className="adm-code">{l.ip}</code></td>
                      <td><span className={'adm-status adm-status--' + (l.status==='success'?'completed':l.status==='warning'?'pending':'refunded')}>{l.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* -- NOTIFICATIONS -- */}
        {tab === 'notifications' && (
          <NotificationsPanel books={books} showToast={showToast} saveBook={saveBook} addLog={addLog} />
        )}

        {/* -- MESSAGES -- */}
        {/* handled above in adm-main-messages wrapper */}

        {/* -- EMAIL CONFIG -- */}
        {tab === 'email' && (
          <Suspense fallback={<PanelLoader />}>
            <EmailPanel showToast={showToast} isSuper={isSuper} />
          </Suspense>
        )}

        {/* -- SITE CONTROLS -- */}
        {tab === 'sitecontrols' && (
          <SiteControlsPanel
            siteControls={siteControls}
            saveSiteControls={saveSiteControls}
            showToast={showToast}
            isSuper={isSuper}
          />
        )}

        {/* -- PAGE EDITOR -- */}
        {tab === 'pageeditor' && (
          <Suspense fallback={<PanelLoader />}>
            <PageEditorPanel showToast={showToast} />
          </Suspense>
        )}

        {/* -- DESIGN STUDIO -- */}
        {tab === 'design' && (
          <Suspense fallback={<PanelLoader />}>
            <DesignStudioPanel showToast={showToast} />
          </Suspense>
        )}

        {/* -- SECURITY -- */}
        {tab === 'security' && (
          <Suspense fallback={<PanelLoader />}>
            <SecurityPanel showToast={showToast} siteControls={siteControls} saveSiteControls={saveSiteControls} isSuper={isSuper} />
          </Suspense>
        )}

        {/* -- PLUGINS -- */}
        {tab === 'plugins' && (
          <Suspense fallback={<PanelLoader />}>
            <PluginsPanel showToast={showToast} isSuper={isSuper} />
          </Suspense>
        )}

        {/* -- GOD MODE — superadmin only -- */}
        {tab === 'godmode' && isSuper && (
          <Suspense fallback={<PanelLoader />}>
            <GodModePanel showToast={showToast} books={books} saveBook={saveBook} users={users} isSuper={isSuper} />
          </Suspense>
        )}

        {/* -- INTEGRATIONS -- */}
        {tab === 'integrations' && (
          <Suspense fallback={<PanelLoader />}>
            <IntegrationsPanel showToast={showToast} isSuper={isSuper} />
          </Suspense>
        )}

        {/* -- BACKUP & RESTORE -- */}
        {tab === 'backup' && (
          <div className="adm-page">
            <div className="adm-page-head">
              <div>
                <h1>Backup &amp; Restore</h1>
                <span className="adm-page-sub">Export, import, and restore site data</span>
              </div>
            </div>

            {/* DANGER ZONE - Super Admin only nuclear reset */}
            <div className="card" style={{padding:24,marginBottom:24,border:'1px solid rgba(231,76,60,0.4)',background:'rgba(231,76,60,0.04)'}}>
              <h3 style={{color:'var(--err)',marginBottom:8}}>Danger Zone</h3>
              <p style={{fontSize:'0.82rem',color:'var(--muted)',marginBottom:16}}>
                These actions permanently wipe data. Use when you need to clear stale/orphaned data from old browser sessions or testing.
              </p>
              <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
                <button className="btn btn-sm" style={{background:'rgba(231,76,60,0.15)',color:'#e74c3c',border:'1px solid rgba(231,76,60,0.4)'}}
                  onClick={() => {
                    if (!window.confirm('Clear ALL orders? This cannot be undone.')) return;
                    localStorage.removeItem('eh_orders');
                    setLiveOrders([]);
                    syncOrders();
                    setTick(t => t + 1);
                    showToast('All orders cleared');
                  }}>
                  Clear All Orders
                </button>
                <button className="btn btn-sm" style={{background:'rgba(231,76,60,0.15)',color:'#e74c3c',border:'1px solid rgba(231,76,60,0.4)'}}
                  onClick={() => {
                    if (!window.confirm('Clear ALL library data for all users? This cannot be undone.')) return;
                    Object.keys(localStorage).filter(k => k.startsWith('eh_lib')).forEach(k => localStorage.removeItem(k));
                    showToast('All library data cleared');
                  }}>
                  Clear All Libraries
                </button>
                <button className="btn btn-sm" style={{background:'rgba(231,76,60,0.15)',color:'#e74c3c',border:'1px solid rgba(231,76,60,0.4)'}}
                  onClick={() => {
                    if (!window.confirm('NUCLEAR RESET: Clear ALL site data including orders, libraries, users, settings? This cannot be undone.')) return;
                    const keep = ['eh_user']; // keep current admin session
                    const current = localStorage.getItem('eh_user');
                    localStorage.clear();
                    if (current) localStorage.setItem('eh_user', current);
                    setLiveOrders([]);
                    syncOrders();
                    setUsers(buildUserList(suspendedList));
                    setTick(t => t + 1);
                    showToast('Full reset complete - all data cleared');
                  }}>
                  Nuclear Reset (Clear Everything)
                </button>
              </div>
            </div>

            {/* Backup actions */}
            <div className="adm-stats-grid" style={{gridTemplateColumns:'repeat(3,1fr)',marginBottom:28}}>
              <div className="card" style={{padding:28,textAlign:'center'}}>
                <div style={{fontSize:'2.5rem',marginBottom:12}}>💾</div>
                <h3 style={{fontSize:'1rem',marginBottom:8}}>Full Backup</h3>
                <p style={{fontSize:'0.82rem',color:'var(--muted)',marginBottom:16}}>Export all books, orders, users, and settings as a JSON file.</p>
                <button className="btn btn-primary btn-sm" style={{width:'100%'}} onClick={() => {
                  const data = {
                    books: JSON.parse(localStorage.getItem('eh_books')||'[]'),
                    orders: JSON.parse(localStorage.getItem('eh_orders')||'[]'),
                    users: JSON.parse(localStorage.getItem('eh_registered_users')||'[]'),
                    settings: JSON.parse(localStorage.getItem('eh_settings')||'{}'),
                    pwOverrides: JSON.parse(localStorage.getItem('eh_pw_overrides')||'{}'),
                    exportedAt: new Date().toISOString(),
                    version: '1.0',
                  };
                  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href=url; a.download='ellines-haven-backup-'+Date.now()+'.json'; a.click();
                  URL.revokeObjectURL(url);
                  showToast('Full backup downloaded');
                }}>Download Backup</button>
              </div>
              <div className="card" style={{padding:28,textAlign:'center'}}>
                <div style={{fontSize:'2.5rem',marginBottom:12}}>📚</div>
                <h3 style={{fontSize:'1rem',marginBottom:8}}>Books Only</h3>
                <p style={{fontSize:'0.82rem',color:'var(--muted)',marginBottom:16}}>Export only the books catalogue as JSON.</p>
                <button className="btn btn-outline btn-sm" style={{width:'100%'}} onClick={() => {
                  const data = JSON.parse(localStorage.getItem('eh_books')||'[]');
                  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href=url; a.download='ellines-haven-books-'+Date.now()+'.json'; a.click();
                  URL.revokeObjectURL(url);
                  showToast('Books exported');
                }}>Export Books</button>
              </div>
              <div className="card" style={{padding:28,textAlign:'center'}}>
                <div style={{fontSize:'2.5rem',marginBottom:12}}>🛒</div>
                <h3 style={{fontSize:'1rem',marginBottom:8}}>Orders Export</h3>
                <p style={{fontSize:'0.82rem',color:'var(--muted)',marginBottom:16}}>Export all order records as JSON.</p>
                <button className="btn btn-outline btn-sm" style={{width:'100%'}} onClick={() => {
                  const data = JSON.parse(localStorage.getItem('eh_orders')||'[]');
                  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href=url; a.download='ellines-haven-orders-'+Date.now()+'.json'; a.click();
                  URL.revokeObjectURL(url);
                  showToast('Orders exported');
                }}>Export Orders</button>
              </div>
            </div>

            {/* Restore */}
            <div className="adm-dash-grid">
              <div className="card" style={{padding:28}}>
                <h3 style={{marginBottom:8,fontSize:'0.95rem'}}>Restore from Backup</h3>
                <p style={{fontSize:'0.82rem',color:'var(--muted)',marginBottom:20}}>Upload a previously exported JSON backup file. This will overwrite current data.</p>
                <div className="adm-restore-zone" onClick={() => document.getElementById('restore-input').click()}>
                  <div style={{fontSize:'2rem',marginBottom:8}}>📂</div>
                  <p style={{fontSize:'0.85rem',color:'var(--muted)'}}>Click to select backup JSON file</p>
                  <p style={{fontSize:'0.72rem',color:'var(--muted)',marginTop:4}}>Only .json files from Ellines Haven backups</p>
                </div>
                <input id="restore-input" type="file" accept=".json" style={{display:'none'}} onChange={e => {
                  const file = e.target.files[0]; if (!file) return;
                  const reader = new FileReader();
                  reader.onload = evt => {
                    try {
                      const data = JSON.parse(evt.target.result);
                      if (data.version && data.exportedAt) {
                        if (data.books)       localStorage.setItem('eh_books', JSON.stringify(data.books));
                        if (data.orders)      localStorage.setItem('eh_orders', JSON.stringify(data.orders));
                        if (data.users)       localStorage.setItem('eh_registered_users', JSON.stringify(data.users));
                        if (data.settings)    localStorage.setItem('eh_settings', JSON.stringify(data.settings));
                        if (data.pwOverrides) localStorage.setItem('eh_pw_overrides', JSON.stringify(data.pwOverrides));
                        showToast('Backup restored successfully  refresh to see changes ?');
                      } else { showToast('Invalid backup file'); }
                    } catch { showToast('Could not read backup file'); }
                  };
                  reader.readAsText(file);
                  e.target.value = '';
                }} />
              </div>
              <div className="card" style={{padding:28}}>
                <h3 style={{marginBottom:8,fontSize:'0.95rem'}}>Storage Overview</h3>
                <p style={{fontSize:'0.82rem',color:'var(--muted)',marginBottom:20}}>Current data stored in this browser's localStorage.</p>
                {[
                  { key:'eh_books',            label:'Books catalogue',    icon:'📚' },
                  { key:'eh_orders',           label:'Orders',             icon:'🛒' },
                  { key:'eh_registered_users', label:'Registered users',   icon:'👥' },
                  { key:'eh_settings',         label:'Site settings',      icon:'⚙️' },
                  { key:'eh_pay_methods',      label:'Custom pay methods', icon:'💳' },
                  { key:'eh_pw_overrides',     label:'Password overrides', icon:'🔑' },
                ].map(item => {
                  const raw = localStorage.getItem(item.key);
                  const parsed = raw ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : null;
                  const count = Array.isArray(parsed) ? parsed.length : (parsed ? Object.keys(parsed).length : 0);
                  const size = raw ? (raw.length / 1024).toFixed(1) + ' KB' : '0 KB';
                  return (
                    <div key={item.key} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      <span style={{fontSize:'0.85rem'}}>{item.icon} {item.label}</span>
                      <div style={{display:'flex',gap:12,alignItems:'center'}}>
                        <span style={{fontSize:'0.75rem',color:'var(--gold)'}}>{count} records</span>
                        <span style={{fontSize:'0.72rem',color:'var(--muted)'}}>{size}</span>
                        <button className="adm-act-btn adm-act-del" style={{fontSize:'0.68rem',padding:'2px 7px'}}
                          onClick={() => { if(window.confirm('Clear '+item.label+'?')){ localStorage.removeItem(item.key); showToast(item.label+' cleared'); } }}>
                          Clear
                        </button>
                      </div>
                    </div>
                  );
                })}
                <div className="adm-info-note" style={{marginTop:16}}>
                  Deploy note: localStorage data lives in this browser only. For production, connect a real database (Firebase, Supabase, MongoDB).
                </div>
              </div>
            </div>
          </div>
        )}

          </div>
        )}

      </main>
    </div>
  );
}