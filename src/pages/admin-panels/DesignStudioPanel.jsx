import { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';

const DEFAULTS = {
  '--bg':'#0d0d1a','--surface':'#13132b','--card':'#161628','--gold':'#c9a84c',
  '--text':'#f0ece2','--muted':'#9490a0','--ok':'#2ecc71','--err':'#e74c3c',
  '--r':'12', fontFamily:'Inter', headingFont:'Playfair Display', fontSize:'medium',
  sectionPad:'88', cardShadow:'medium', goldGlow:'medium',
  animButtons:true, animCards:true, animTransitions:false,
  customCss:'',
};

const PRESETS = {
  'Dark Gold':     {'--bg':'#0d0d1a','--surface':'#13132b','--card':'#161628','--gold':'#c9a84c','--text':'#f0ece2','--muted':'#9490a0','--ok':'#2ecc71','--err':'#e74c3c'},
  'Midnight Blue': {'--bg':'#030d1f','--surface':'#071428','--card':'#0a1830','--gold':'#4a9eff','--text':'#e8f4fd','--muted':'#8aabcc','--ok':'#00d4aa','--err':'#ff6b6b'},
  'Forest Green':  {'--bg':'#050f08','--surface':'#0a1f10','--card':'#0d2514','--gold':'#4caf68','--text':'#e8f5e9','--muted':'#7aab85','--ok':'#00c853','--err':'#ff5252'},
  'Royal Purple':  {'--bg':'#0d0818','--surface':'#150d2b','--card':'#1a0f32','--gold':'#b39ddb','--text':'#ede7f6','--muted':'#9575cd','--ok':'#69f0ae','--err':'#ff5252'},
  'Blood Red':     {'--bg':'#130808','--surface':'#1f0e0e','--card':'#270f0f','--gold':'#e74c3c','--text':'#fce8e8','--muted':'#c89090','--ok':'#2ecc71','--err':'#ff1744'},
  'Ocean Teal':    {'--bg':'#040f10','--surface':'#081a1c','--card':'#0a2224','--gold':'#26c6da','--text':'#e0f7fa','--muted':'#80cbc4','--ok':'#00e676','--err':'#ff5252'},
  'Sunset Orange': {'--bg':'#120a04','--surface':'#1e1006','--card':'#281608','--gold':'#ff6d00','--text':'#fff3e0','--muted':'#c8956a','--ok':'#69f0ae','--err':'#ff1744'},
};

const FONTS = ['Inter','Roboto','Poppins','Lato','Source Sans Pro'];
const HEAD_FONTS = ['Playfair Display','Georgia','Times New Roman','Cinzel','Merriweather'];
const CVARS = [
  ['--bg','Background'],['--surface','Surface'],['--card','Card'],['--gold','Accent/Gold'],
  ['--text','Text'],['--muted','Muted Text'],['--ok','Success'],['--err','Error'],
];

function applyTheme(s) {
  let el = document.getElementById('eh-design-studio');
  if (!el) { el=document.createElement('style'); el.id='eh-design-studio'; document.head.appendChild(el); }
  const r = s['--r']||'12';
  const vars = CVARS.map(([v])=>`${v}:${s[v]}`).join(';');
  const rVars = `--r:${r}px;--r-sm:${Math.max(2,Math.round(r/2))}px;--r-lg:${Math.round(r*1.6)}px`;
  const sp = s.sectionPad ? `--section-pad:${s.sectionPad}px;` : '';
  const sh = s.cardShadow==='heavy'?'0 12px 48px rgba(0,0,0,0.65)':s.cardShadow==='light'?'0 2px 12px rgba(0,0,0,0.25)':'0 8px 36px rgba(0,0,0,0.45)';
  const glow = s.goldGlow==='strong'?`0 4px 28px rgba(${hexToRgb(s['--gold']||'#c9a84c')},0.5)`:s.goldGlow==='none'?'none':`0 4px 22px rgba(${hexToRgb(s['--gold']||'#c9a84c')},0.28)`;
  el.textContent = `:root{${vars};${rVars};${sp}--sh-card:${sh};--sh-gold:${glow};}${s.customCss||''}`;
  if (s.fontFamily) document.body.style.setProperty('font-family', s.fontFamily+', sans-serif');
  if (!s.animButtons) {
    let ab=document.getElementById('eh-no-anim');
    if(!ab){ab=document.createElement('style');ab.id='eh-no-anim';document.head.appendChild(ab);}
    ab.textContent='.btn{transition:none!important;}';
  } else { document.getElementById('eh-no-anim')?.remove(); }
}

function hexToRgb(hex) {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return isNaN(r)?'201,168,76':`${r},${g},${b}`;
}

export default function DesignStudioPanel({ showToast }) {
  const fileRef = useRef(null);
  const [s, setS] = useState(()=>{ try{return JSON.parse(localStorage.getItem('eh_design')||'null')||{...DEFAULTS};}catch{return{...DEFAULTS};} });
  const [saving, setSaving] = useState(false);
  const [activePreset, setActivePreset] = useState('Dark Gold');

  useEffect(()=>{
    getDoc(doc(db,'site_data','design_settings')).then(snap=>{
      if(snap.exists()){const d={...DEFAULTS,...snap.data()};setS(d);applyTheme(d);localStorage.setItem('eh_design',JSON.stringify(d));}
    }).catch(()=>{});
  },[]);

  const upd = (k,v) => { const n={...s,[k]:v}; setS(n); applyTheme(n); };
  const preset = name => { const p={...s,...PRESETS[name]}; setS(p); applyTheme(p); setActivePreset(name); showToast?.('🎨 '+name+' applied'); };
  const reset = () => { setS({...DEFAULTS}); applyTheme({...DEFAULTS}); showToast?.('🔄 Reset to defaults'); };

  const save = async () => {
    setSaving(true);
    try { await setDoc(doc(db,'site_data','design_settings'),{...s,updatedAt:serverTimestamp()},{merge:true}); localStorage.setItem('eh_design',JSON.stringify(s)); showToast?.('✅ Theme saved & live!'); }
    catch(e){ showToast?.('❌ '+e.message); }
    setSaving(false);
  };

  const exportTheme = () => {
    const b=new Blob([JSON.stringify(s,null,2)],{type:'application/json'});
    const u=URL.createObjectURL(b); const a=document.createElement('a'); a.href=u; a.download='ellines-theme.json'; a.click(); URL.revokeObjectURL(u);
  };

  const importTheme = e => {
    const file=e.target.files?.[0]; if(!file) return;
    const r=new FileReader(); r.onload=evt=>{ try{const d=JSON.parse(evt.target.result); setS({...DEFAULTS,...d}); applyTheme({...DEFAULTS,...d}); showToast?.('✅ Theme imported');}catch{showToast?.('❌ Invalid theme file');} }; r.readAsText(file); e.target.value='';
  };

  const applyCustomCss = () => { applyTheme(s); showToast?.('🎨 CSS applied'); };

  const sampleCard = { background:s['--card'], border:`1px solid ${s['--gold']}30`, borderRadius:(s['--r']||'12')+'px', padding:'14px 16px', color:s['--text'] };

  const Toggle = ({label, desc, field}) => (
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
      <div><div style={{fontSize:'0.85rem',fontWeight:600}}>{label}</div>{desc&&<div style={{fontSize:'0.72rem',color:'var(--muted)',marginTop:2}}>{desc}</div>}</div>
      <button onClick={()=>upd(field,!s[field])} style={{width:40,height:22,borderRadius:11,border:'none',cursor:'pointer',position:'relative',background:s[field]?'var(--gold)':'rgba(255,255,255,0.15)',transition:'background 0.2s',flexShrink:0}}>
        <span style={{position:'absolute',top:2,left:s[field]?20:2,width:18,height:18,borderRadius:'50%',background:'#fff',transition:'left 0.2s'}}/>
      </button>
    </div>
  );

  return (
    <div className="adm-page">
      <div className="adm-page-head">
        <div><h1>Design Studio</h1><span className="adm-page-sub">Live theme editor — changes preview instantly across the site</span></div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-ghost btn-sm" onClick={reset}>Reset</button>
          <button className="btn btn-ghost btn-sm" onClick={exportTheme}>⬇ Export</button>
          <button className="btn btn-ghost btn-sm" onClick={()=>fileRef.current?.click()}>⬆ Import</button>
          <input ref={fileRef} type="file" accept=".json" style={{display:'none'}} onChange={importTheme} />
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'⏳':'💾 Save & Publish'}</button>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
        {/* LEFT */}
        <div style={{display:'flex',flexDirection:'column',gap:18}}>
          {/* Presets */}
          <div className="card" style={{padding:18}}>
            <h3 style={{fontSize:'0.88rem',marginBottom:12,color:'var(--gold)'}}>🎨 Preset Themes</h3>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              {Object.entries(PRESETS).map(([name,p])=>(
                <button key={name} onClick={()=>preset(name)}
                  style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',border:activePreset===name?'1px solid var(--gold)':'1px solid var(--border)',borderRadius:'var(--r-sm)',background:p['--bg'],cursor:'pointer',transition:'all 0.15s'}}>
                  <div style={{display:'flex',gap:3}}>
                    {[p['--bg'],p['--gold'],p['--text']].map((c,i)=><div key={i} style={{width:10,height:10,borderRadius:'50%',background:c}}/>)}
                  </div>
                  <span style={{fontSize:'0.75rem',fontWeight:600,color:p['--text'],fontFamily:'Inter'}}>{name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Colors */}
          <div className="card" style={{padding:18}}>
            <h3 style={{fontSize:'0.88rem',marginBottom:12,color:'var(--gold)'}}>🖌️ Color Palette</h3>
            {CVARS.map(([v,l])=>(
              <div key={v} style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                <input type="color" value={s[v]||'#000'} onChange={e=>upd(v,e.target.value)} style={{width:32,height:32,border:'none',borderRadius:6,cursor:'pointer',padding:2,background:'transparent',flexShrink:0}} />
                <div style={{flex:1}}><div style={{fontSize:'0.8rem',fontWeight:600}}>{l}</div><div style={{fontSize:'0.68rem',color:'var(--muted)',fontFamily:'monospace'}}>{v}</div></div>
                <input className="field" value={s[v]||''} onChange={e=>upd(v,e.target.value)} style={{width:88,fontSize:'0.78rem',fontFamily:'monospace',padding:'4px 7px'}} />
              </div>
            ))}
          </div>

          {/* Typography */}
          <div className="card" style={{padding:18}}>
            <h3 style={{fontSize:'0.88rem',marginBottom:12,color:'var(--gold)'}}>🔤 Typography</h3>
            <div style={{marginBottom:12}}>
              <label style={{fontSize:'0.78rem',color:'var(--muted)',display:'block',marginBottom:6}}>Body Font</label>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>{FONTS.map(f=><button key={f} onClick={()=>upd('fontFamily',f)} className={s.fontFamily===f?'btn btn-primary btn-sm':'btn btn-ghost btn-sm'} style={{fontFamily:f,fontSize:'0.78rem'}}>{f}</button>)}</div>
            </div>
            <div style={{marginBottom:12}}>
              <label style={{fontSize:'0.78rem',color:'var(--muted)',display:'block',marginBottom:6}}>Heading Font</label>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>{HEAD_FONTS.map(f=><button key={f} onClick={()=>upd('headingFont',f)} className={s.headingFont===f?'btn btn-primary btn-sm':'btn btn-ghost btn-sm'} style={{fontFamily:f,fontSize:'0.78rem'}}>{f}</button>)}</div>
            </div>
            <div>
              <label style={{fontSize:'0.78rem',color:'var(--muted)',display:'block',marginBottom:6}}>Size Scale</label>
              <div style={{display:'flex',gap:6}}>{['small','medium','large'].map(sz=><button key={sz} onClick={()=>upd('fontSize',sz)} className={s.fontSize===sz?'btn btn-primary btn-sm':'btn btn-ghost btn-sm'} style={{textTransform:'capitalize',fontSize:'0.78rem'}}>{sz}</button>)}</div>
            </div>
          </div>

          {/* Animations */}
          <div className="card" style={{padding:18}}>
            <h3 style={{fontSize:'0.88rem',marginBottom:8,color:'var(--gold)'}}>✨ Animations</h3>
            <Toggle label="Button hover effects" field="animButtons" />
            <Toggle label="Card hover lift" field="animCards" />
            <Toggle label="Page transitions" desc="Fade between pages" field="animTransitions" />
          </div>
        </div>

        {/* RIGHT */}
        <div style={{display:'flex',flexDirection:'column',gap:18}}>
          {/* Live Preview */}
          <div className="card" style={{padding:18}}>
            <h3 style={{fontSize:'0.88rem',marginBottom:12,color:'var(--gold)'}}>👁️ Live Preview</h3>
            <div style={{background:s['--bg'],borderRadius:10,padding:16}}>
              <div style={sampleCard}>
                <div style={{fontWeight:700,marginBottom:6,color:s['--gold'],fontFamily:s.headingFont||'Playfair Display'}}>Sample Card Title</div>
                <p style={{fontSize:'0.85rem',color:s['--text'],marginBottom:10,lineHeight:1.6,fontFamily:s.fontFamily||'Inter'}}>This is body text. Your theme updates in real time as you make changes.</p>
                <div style={{display:'flex',gap:8,marginBottom:10}}>
                  <button style={{background:s['--gold'],color:'#000',border:'none',borderRadius:(s['--r']||'12')+'px',padding:'7px 14px',fontSize:'0.8rem',fontWeight:600,cursor:'pointer'}}>Primary</button>
                  <button style={{background:'transparent',color:s['--gold'],border:`1px solid ${s['--gold']}60`,borderRadius:(s['--r']||'12')+'px',padding:'7px 14px',fontSize:'0.8rem',cursor:'pointer'}}>Outline</button>
                </div>
                <div style={{display:'flex',gap:8}}>
                  <span style={{background:s['--ok']+'22',color:s['--ok'],borderRadius:4,padding:'2px 8px',fontSize:'0.72rem'}}>✓ Success</span>
                  <span style={{background:s['--err']+'22',color:s['--err'],borderRadius:4,padding:'2px 8px',fontSize:'0.72rem'}}>✗ Error</span>
                  <span style={{color:s['--muted'],fontSize:'0.72rem',alignSelf:'center'}}>Muted</span>
                </div>
              </div>
            </div>
          </div>

          {/* Spacing */}
          <div className="card" style={{padding:18}}>
            <h3 style={{fontSize:'0.88rem',marginBottom:14,color:'var(--gold)'}}>📐 Spacing & Shape</h3>
            <div style={{marginBottom:14}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}><label style={{fontSize:'0.78rem',color:'var(--muted)'}}>Section Padding</label><span style={{fontSize:'0.78rem',color:'var(--gold)',fontFamily:'monospace'}}>{s.sectionPad||88}px</span></div>
              <input type="range" min="40" max="120" step="8" value={s.sectionPad||88} onChange={e=>upd('sectionPad',e.target.value)} style={{width:'100%',accentColor:'var(--gold)'}} />
            </div>
            <div style={{marginBottom:14}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}><label style={{fontSize:'0.78rem',color:'var(--muted)'}}>Border Radius</label><span style={{fontSize:'0.78rem',color:'var(--gold)',fontFamily:'monospace'}}>{s['--r']||12}px</span></div>
              <input type="range" min="2" max="24" value={s['--r']||12} onChange={e=>upd('--r',e.target.value)} style={{width:'100%',accentColor:'var(--gold)'}} />
              <div style={{display:'flex',gap:8,marginTop:8}}>
                {[2,4,8,12,16,20,24].map(r=><div key={r} onClick={()=>upd('--r',String(r))} style={{width:28,height:28,background:String(s['--r'])===String(r)?'var(--gold)':'var(--surface)',border:'1px solid var(--border)',borderRadius:r+'px',cursor:'pointer',transition:'all 0.15s',flexShrink:0}}/>)}
              </div>
            </div>
          </div>

          {/* Shadows */}
          <div className="card" style={{padding:18}}>
            <h3 style={{fontSize:'0.88rem',marginBottom:12,color:'var(--gold)'}}>🌑 Shadows & Glow</h3>
            <div style={{marginBottom:12}}>
              <label style={{fontSize:'0.78rem',color:'var(--muted)',display:'block',marginBottom:6}}>Card Shadow</label>
              <div style={{display:'flex',gap:6}}>{['light','medium','heavy'].map(v=><button key={v} onClick={()=>upd('cardShadow',v)} className={(s.cardShadow||'medium')===v?'btn btn-primary btn-sm':'btn btn-ghost btn-sm'} style={{textTransform:'capitalize',fontSize:'0.78rem'}}>{v}</button>)}</div>
            </div>
            <div>
              <label style={{fontSize:'0.78rem',color:'var(--muted)',display:'block',marginBottom:6}}>Gold Glow</label>
              <div style={{display:'flex',gap:6}}>{['none','medium','strong'].map(v=><button key={v} onClick={()=>upd('goldGlow',v)} className={(s.goldGlow||'medium')===v?'btn btn-primary btn-sm':'btn btn-ghost btn-sm'} style={{textTransform:'capitalize',fontSize:'0.78rem'}}>{v}</button>)}</div>
            </div>
          </div>

          {/* Custom CSS */}
          <div className="card" style={{padding:18}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
              <h3 style={{fontSize:'0.88rem',color:'var(--gold)'}}>💻 Custom CSS</h3>
              <button className="btn btn-primary btn-sm" onClick={applyCustomCss}>Apply CSS</button>
            </div>
            <textarea className="field" rows={8} value={s.customCss||''} onChange={e=>upd('customCss',e.target.value)}
              placeholder="/* Custom CSS — applied site-wide */&#10;.my-class { color: red; }"
              style={{width:'100%',resize:'vertical',fontFamily:'monospace',fontSize:'0.78rem'}} />
          </div>
        </div>
      </div>
    </div>
  );
}
