/**
 * KGolf Booking — v5
 * KGOLF.ai brand-aligned dark premium UI
 * "Engineered for excellence. Designed to impress."
 *
 * Security: PBKDF2-SHA256, RBAC, BruteForce lockout,
 * Session timeout, AuditLog, XSS sanitization, ErrorMask
 */

import { useState, useEffect, useCallback, useRef, memo, useMemo } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, onSnapshot, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDBRCKA-yd7oUr19_UiIP6TTlObJ52DQ08",
  authDomain: "kgolf-booking-b909e.firebaseapp.com",
  projectId: "kgolf-booking-b909e",
  storageBucket: "kgolf-booking-b909e.firebasestorage.app",
  messagingSenderId: "165994639150",
  appId: "1:165994639150:web:7285f0502f3639185654bf"
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// ─── Crypto ───────────────────────────────────────────────
const PBKDF2_ITER = 100_000;
async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name:"PBKDF2", salt:enc.encode(salt), iterations:PBKDF2_ITER, hash:"SHA-256" }, key, 256);
  return Array.from(new Uint8Array(bits)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
function generateSalt() { const a=new Uint8Array(16); crypto.getRandomValues(a); return Array.from(a).map(b=>b.toString(16).padStart(2,"0")).join(""); }

// ─── Sanitization ─────────────────────────────────────────
// sanitize: 저장할 때 사용 (trim 포함)
const sanitize = (v,max=300) => String(v??"").replace(/[\x00-\x1F\x7F<>"'`&;\\]/g,"").replace(/\.\./g,"").trim().slice(0,max);
// sanitizeInput: 입력 중 사용 (trim 없음 → 스페이스 입력 가능)
const sanitizeInput = (v,max=300) => String(v??"").replace(/[\x00-\x1F\x7F<>"'`&;\\]/g,"").replace(/\.\./g,"").slice(0,max);
const sanitizeEmail = (v) => String(v??"").toLowerCase().replace(/[^a-z0-9@._+-]/g,"").trim().slice(0,254);
const validateEmail = (e) => /^[^\s@]+@[^\s@]{1,63}\.[^\s@]{2,}$/.test(e);
const validatePassword = (p) => p.length>=8 && p.length<=128;
const validateName = (n) => n.trim().length>=2 && n.trim().length<=80;
const genericErr = () => "Something went wrong. Please try again.";

// ─── Rate Limit ────────────────────────────────────────────
const RL_MAX=5, RL_WIN=15*60*1000;
const rlKey  = (e) => `rl_${sanitizeEmail(e)}`;
const rlCheck= (email) => { try { const d=JSON.parse(sessionStorage.getItem(rlKey(email))||"{}"); if(d.lockedUntil&&Date.now()<d.lockedUntil) return {blocked:true,mins:Math.ceil((d.lockedUntil-Date.now())/60000)}; if(d.lockedUntil) sessionStorage.removeItem(rlKey(email)); return {blocked:false,attempts:d.attempts||0}; } catch { return {blocked:false,attempts:0}; }};
const rlFail = (email) => { try { const d=JSON.parse(sessionStorage.getItem(rlKey(email))||"{}"); const a=(d.attempts||0)+1; sessionStorage.setItem(rlKey(email),JSON.stringify(a>=RL_MAX?{attempts:a,lockedUntil:Date.now()+RL_WIN}:{attempts:a})); } catch {} };
const rlClear= (email) => { try { sessionStorage.removeItem(rlKey(email)); } catch {} };

// ─── Audit ────────────────────────────────────────────────
async function auditLog(action, meta={}) {
  try {
    const entry = { ts:new Date().toISOString(), action, ua:navigator.userAgent.slice(0,120), ...meta };
    const snap = await getDoc(doc(db,"kgolf","auditlog"));
    const prev = snap.exists() ? JSON.parse(snap.data().data||"[]") : [];
    await setDoc(doc(db,"kgolf","auditlog"),{data:JSON.stringify([entry,...prev].slice(0,2000))});
  } catch(e) { console.error("[audit]",e); }
}

// ─── Admin ─────────────────────────────────────────────────
const ADMIN_EMAIL = "admin@kgolf.nz";
const ADMIN_SALT  = "kgolf-admin-salt-2024";
const ADMIN_HASH  = import.meta.env.VITE_ADMIN_HASH ?? "__REPLACE_IN_PRODUCTION__";

// ═══════════════════════════════════════════════════════
//  EMAIL — EmailJS (https://www.emailjs.com)
//  Vercel 환경변수에 아래 3가지 추가 필요:
//  VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID, VITE_EMAILJS_PUBLIC_KEY
// ═══════════════════════════════════════════════════════
const EJ_SVC = import.meta.env.VITE_EMAILJS_SERVICE_ID ?? "";
const EJ_TPL = import.meta.env.VITE_EMAILJS_TEMPLATE_ID ?? "";
const EJ_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY ?? "";

const SHOP_NAME    = "KGolf Screen Golf New Zealand";
const SHOP_ADDRESS = "Cnr Stoddard Rd & Maioro St, Mt Roskill, Auckland 1041";
const SHOP_PHONE   = "+64 9 XXX XXXX";
const SHOP_EMAIL   = "info@kgolf.nz";
const SHOP_URL     = "https://kgolf-booking.vercel.app";

async function sendConfirmationEmail(bkg, allUsers) {
  if (!EJ_KEY || !EJ_SVC || !EJ_TPL) return; // 설정 안됐으면 skip
  if (!bkg.userEmail) return;                   // 이메일 없으면 skip
  try {
    const sorted = [...(bkg.slots||[])].sort((a,b)=>slotIdx(a)-slotIdx(b));
    const member = allUsers.find(u=>u.id===bkg.userId);
    // EmailJS 동적 로드 (번들 크기 절약)
    const ejLib = await import("https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js")
      .catch(()=>null);
    const ej = ejLib?.default ?? window.emailjs;
    if (!ej) return;
    await ej.send(EJ_SVC, EJ_TPL, {
      to_email:     bkg.userEmail,
      to_name:      sanitize(bkg.userName),
      booking_ref:  "#" + bkg.id.slice(-8).toUpperCase(),
      member_no:    member?.memberNo || "Walk-in",
      bay:          `Bay ${bkg.bay}`,
      date:         fmtDateLng(bkg.date),
      start_time:   sorted[0] || "",
      end_time:     sorted.length>0 ? slotEnd(sorted[sorted.length-1]) : "",
      duration:     totalDur(bkg.slots||[]),
      slots_count:  String(bkg.slots?.length||0),
      shop_name:    SHOP_NAME,
      shop_address: SHOP_ADDRESS,
      shop_phone:   SHOP_PHONE,
      shop_email:   SHOP_EMAIL,
      shop_url:     SHOP_URL,
      cancel_url:   SHOP_URL,
    }, EJ_KEY);
  } catch(e) { console.error("[email]", e); }
}

// ─── Time slots ────────────────────────────────────────────
const NUM_BAYS=11, OPEN_H=9, CLOSE_H=23;
const SLOTS=[];
for (let h=OPEN_H;h<CLOSE_H;h++) { SLOTS.push(`${String(h).padStart(2,"0")}:00`); SLOTS.push(`${String(h).padStart(2,"0")}:30`); }
const HOUR_GROUPS=[];
for (let h=OPEN_H;h<CLOSE_H;h++) HOUR_GROUPS.push({ label:`${String(h).padStart(2,"0")}:00`, slots:[`${String(h).padStart(2,"0")}:00`,`${String(h).padStart(2,"0")}:30`] });
const slotEnd  = (s) => { const[hh,mm]=s.split(":").map(Number); const t=hh*60+mm+30; return `${String(Math.floor(t/60)).padStart(2,"0")}:${String(t%60).padStart(2,"0")}`; };
const slotIdx  = (s) => SLOTS.indexOf(s);
const isConsec = (slots) => { if(slots.length<=1) return true; const ix=slots.map(slotIdx).sort((a,b)=>a-b); for(let i=1;i<ix.length;i++) if(ix[i]!==ix[i-1]+1) return false; return true; };
const totalDur = (slots) => { const m=(slots?.length||0)*30; const h=Math.floor(m/60),r=m%60; return h>0?(r>0?`${h}h ${r}m`:`${h}h`):`${m}m`; };
const fmtDate   = (d) => d?new Date(d+"T12:00").toLocaleDateString("en-NZ",{weekday:"short",month:"short",day:"numeric"}):"";
const fmtDateLng= (d) => d?new Date(d+"T12:00").toLocaleDateString("en-NZ",{weekday:"long",year:"numeric",month:"long",day:"numeric"}):"";
const getDates  = (n=14) => Array.from({length:n},(_,i)=>{ const d=new Date(); d.setDate(d.getDate()+i); return d.toISOString().split("T")[0]; });
const DATES     = getDates();
const SESSION_MS= 30*60*1000;
const genMemberNo = (users) => `KG-${String(users.length+1).padStart(4,"0")}`;

// ════════════════════════════════════════════════════════
//  KGOLF.ai DARK PREMIUM PALETTE
// ════════════════════════════════════════════════════════
const C = {
  // Backgrounds — deep dark green-black
  bg:       "#070c08",
  surface:  "#0d1410",
  surface2: "#111a12",
  card:     "#141f15",
  cardHov:  "#192216",
  // KGOLF accent — vivid lime green
  lime:     "#65e83a",
  limeHov:  "#7eff50",
  limeDim:  "#65e83a22",
  limeGlow: "0 0 20px rgba(101,232,58,0.3)",
  limeGlowSm:"0 0 10px rgba(101,232,58,0.2)",
  // Text
  white:    "#ffffff",
  textSub:  "#8a9e8c",
  textMute: "#4a5e4c",
  // Borders
  border:   "rgba(101,232,58,0.12)",
  borderMd: "rgba(101,232,58,0.22)",
  borderBright:"rgba(101,232,58,0.4)",
  // Status
  red:      "#ff4444",
  redDim:   "#ff444422",
  gold:     "#f0c040",
  goldDim:  "#f0c04022",
  blue:     "#4da8ff",
  blueDim:  "#4da8ff22",
  // Shadows
  shadowSm: "0 2px 12px rgba(0,0,0,0.4)",
  shadowMd: "0 4px 24px rgba(0,0,0,0.5)",
  shadowLg: "0 8px 48px rgba(0,0,0,0.6)",
};

// ════════════════════════════════════════════════════════
//  GLOBAL CSS
// ════════════════════════════════════════════════════════
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:${C.bg};font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${C.white};-webkit-font-smoothing:antialiased;}
  input,select,button,textarea{font-family:inherit;}
  input::placeholder{color:${C.textMute};}
  select option{background:#1a2a1c;color:${C.white};}
  ::-webkit-scrollbar{width:4px;height:4px;}
  ::-webkit-scrollbar-track{background:${C.surface};}
  ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
  @keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(-16px) scale(.9);}to{opacity:1;transform:translateX(-50%) translateY(0) scale(1);}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
  @keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
  @keyframes spin{to{transform:rotate(360deg);}}
  @keyframes glowPulse{0%,100%{box-shadow:0 0 8px rgba(101,232,58,.2);}50%{box-shadow:0 0 24px rgba(101,232,58,.5);}}
  @keyframes scanLine{0%{transform:translateY(-100%);}100%{transform:translateY(100vh);}}
  .bay-btn:hover:not(:disabled){transform:translateY(-4px)!important;border-color:${C.borderBright}!important;box-shadow:${C.limeGlow}!important;}
  .date-btn:hover{border-color:${C.borderMd}!important;background:${C.surface2}!important;}
  .slot-btn:hover:not(:disabled){border-color:${C.borderBright}!important;background:${C.surface2}!important;}
  .card-hover:hover{border-color:${C.borderMd}!important;background:${C.cardHov}!important;}
  .stat-card:hover{transform:translateY(-3px)!important;border-color:${C.borderBright}!important;}
  .user-row:hover{background:${C.surface2}!important;}
  .nav-btn:hover span{color:${C.lime}!important;}
`;

// ════════════════════════════════════════════════════════
//  KGOLF LOGO (brand-faithful)
// ════════════════════════════════════════════════════════
function KGolfLogo({ size = "md" }) {
  const sizes = { sm: { box:28, font:13, sub:6 }, md: { box:36, font:17, sub:7 }, lg: { box:52, font:24, sub:9 } };
  const s = sizes[size];
  return (
    <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
      {/* K icon — black square with white K and lime diagonal */}
      <div style={{width:s.box,height:s.box,background:"#000",borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",border:`1px solid ${C.borderMd}`,boxShadow:`0 0 12px rgba(101,232,58,0.15)`,flexShrink:0,overflow:"hidden"}}>
        <svg width={s.box*0.7} height={s.box*0.7} viewBox="0 0 28 28" fill="none">
          <path d="M4 4h5v8l8-8h7L15 14l9 10h-7l-5-6v6H4V4z" fill="white"/>
          <path d="M18 4L28 14 18 24V4z" fill={C.lime} opacity="0.7"/>
        </svg>
      </div>
      <div style={{display:"flex",flexDirection:"column",lineHeight:1}}>
        <span style={{fontSize:s.font,fontWeight:900,color:C.white,letterSpacing:"0.1em",textTransform:"uppercase"}}>KGOLF</span>
        <span style={{fontSize:s.sub,color:C.lime,letterSpacing:"0.2em",fontWeight:600,textTransform:"uppercase",marginTop:2,opacity:0.9}}>NEW ZEALAND</span>
      </div>
    </div>
  );
}

// ─── Toast ─────────────────────────────────────────────
function Toast({toast}) {
  if (!toast) return null;
  const bg = toast.type==="err" ? "linear-gradient(135deg,#c0392b,#e74c3c)" : "linear-gradient(135deg,#2a5a1a,#3a7a22)";
  const border = toast.type==="err" ? "#ff4444" : C.lime;
  return <div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",zIndex:9999,padding:"13px 24px",borderRadius:10,background:bg,color:C.white,fontWeight:700,fontSize:13,boxShadow:`0 8px 32px rgba(0,0,0,0.6),0 0 0 1px ${border}40`,maxWidth:"88vw",textAlign:"center",animation:"toastIn .3s cubic-bezier(.34,1.56,.64,1)",whiteSpace:"pre-line",lineHeight:1.5,border:`1px solid ${border}40`}}>{toast.msg}</div>;
}

// ─── Modal ─────────────────────────────────────────────
function Modal({show,onClose,title,children,wide}) {
  if (!show) return null;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:8000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:C.surface,borderRadius:16,padding:24,width:"100%",maxWidth:wide?660:420,boxShadow:C.shadowLg,animation:"fadeUp .3s ease",maxHeight:"90vh",overflowY:"auto",border:`1px solid ${C.border}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontSize:17,fontWeight:800,color:C.white,letterSpacing:"-0.02em"}}>{title}</div>
          <button onClick={onClose} style={{background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:14,color:C.textSub,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Input ─────────────────────────────────────────────
function Inp({label,value,onChange,type="text",placeholder="",req,maxLen=300,hint,autoFocus}) {
  const [focus,setFocus]=useState(false);
  return (
    <div style={{marginBottom:16}}>
      {label && <div style={{color:C.textSub,fontSize:10,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:7}}>{label}{req&&<span style={{color:C.lime}}> *</span>}</div>}
      <input type={type} value={value} autoFocus={autoFocus}
        onChange={e=>onChange(type==="email"?sanitizeEmail(e.target.value):sanitizeInput(e.target.value,maxLen))}
        placeholder={placeholder} maxLength={maxLen}
        onFocus={()=>setFocus(true)} onBlur={()=>setFocus(false)}
        style={{width:"100%",padding:"12px 16px",background:focus?C.surface2:C.card,border:`1px solid ${focus?C.borderBright:C.border}`,borderRadius:10,color:C.white,fontSize:14,outline:"none",boxSizing:"border-box",transition:"all .18s",boxShadow:focus?C.limeGlowSm:"none",fontFamily:"inherit"}}/>
      {hint&&<div style={{fontSize:10.5,color:C.textMute,marginTop:5}}>{hint}</div>}
    </div>
  );
}

// ─── Button ────────────────────────────────────────────
function Btn({children,onClick,v="primary",sz="md",full,disabled}) {
  const [hov,setHov]=useState(false);
  const styles={
    primary:{bg:hov?C.limeHov:C.lime,c:"#030803",sh:hov?`0 4px 24px rgba(101,232,58,.5)`:C.limeGlowSm,b:"none"},
    ghost:{bg:"transparent",c:C.lime,b:`1px solid ${hov?C.borderBright:C.border}`,sh:"none"},
    danger:{bg:hov?"#cc2222":C.red,c:C.white,b:"none",sh:"none"},
    outline:{bg:"transparent",c:C.textSub,b:`1px solid ${C.border}`,sh:"none"},
    dark:{bg:hov?C.surface2:C.card,c:C.white,b:`1px solid ${C.border}`,sh:"none"},
  };
  const szs={sm:{p:"6px 14px",fs:12},md:{p:"11px 22px",fs:14},lg:{p:"14px 28px",fs:15}};
  const s=styles[v],z=szs[sz];
  return (
    <button onClick={onClick} disabled={disabled} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{background:s.bg,color:s.c,border:s.b||"none",padding:z.p,fontSize:z.fs,width:full?"100%":undefined,borderRadius:10,cursor:disabled?"not-allowed":"pointer",fontWeight:700,opacity:disabled?.4:1,fontFamily:"inherit",transition:"all .15s",transform:hov&&!disabled?"translateY(-1px)":"none",boxShadow:disabled?"none":s.sh,letterSpacing:v==="primary"?"0.02em":"normal"}}>
      {children}
    </button>
  );
}

// ─── Tag ───────────────────────────────────────────────
function Tag({children,color}) {
  const col = color||C.lime;
  return <span style={{padding:"3px 10px",borderRadius:20,fontSize:10.5,fontWeight:700,background:col+"18",color:col,letterSpacing:"0.05em",border:`1px solid ${col}30`}}>{children}</span>;
}

// ─── Section label ──────────────────────────────────────
function SectionLabel({children}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
      <div style={{width:3,height:14,background:C.lime,borderRadius:2}}/>
      <span style={{fontSize:10,fontWeight:700,color:C.textSub,letterSpacing:"0.15em",textTransform:"uppercase"}}>{children}</span>
    </div>
  );
}

// ─── Nav bar ───────────────────────────────────────────
function NavBar({active,onTab,newBooking}) {
  const tabs=[{id:"home",label:"BOOK",icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>},{id:"mybookings",label:"BOOKINGS",icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,badge:newBooking},{id:"profile",label:"PROFILE",icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}];
  return (
    <div style={{position:"fixed",bottom:0,left:0,right:0,background:C.surface,borderTop:`1px solid ${C.border}`,display:"flex",zIndex:200}}>
      {tabs.map(t=>{
        const isActive = active===t.id;
        return (
          <button key={t.id} className="nav-btn" onClick={()=>onTab(t.id)} style={{flex:1,padding:"12px 0 10px",border:"none",background:"transparent",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4,fontFamily:"inherit",position:"relative"}}>
            {t.badge&&<div style={{position:"absolute",top:10,right:"26%",width:7,height:7,borderRadius:"50%",background:C.lime,boxShadow:C.limeGlowSm}}/>}
            <span style={{color:isActive?C.lime:C.textMute,transition:"color .15s",display:"flex"}}>{t.icon}</span>
            <span style={{fontSize:8.5,fontWeight:700,letterSpacing:"0.12em",color:isActive?C.lime:C.textMute,transition:"color .15s"}}>{t.label}</span>
            {isActive&&<div style={{position:"absolute",top:0,left:"20%",right:"20%",height:1.5,background:C.lime,boxShadow:C.limeGlowSm,borderRadius:2}}/>}
          </button>
        );
      })}
    </div>
  );
}

// ─── Header ────────────────────────────────────────────
function Header({onBack,subtitle,right}) {
  return (
    <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:100}}>
      {onBack&&<button onClick={onBack} style={{background:C.surface2,border:`1px solid ${C.border}`,color:C.lime,cursor:"pointer",borderRadius:8,width:34,height:34,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s"}}>←</button>}
      <div style={{flex:1}}><KGolfLogo size="sm"/>{subtitle&&<div style={{fontSize:9.5,color:C.textMute,marginTop:2,marginLeft:2,letterSpacing:"0.08em"}}>{subtitle}</div>}</div>
      {right}
    </div>
  );
}

// ─── Card ──────────────────────────────────────────────
function Card({children,style={},hover,glow}) {
  return (
    <div className={hover?"card-hover":""} style={{background:C.card,borderRadius:14,border:`1px solid ${glow?C.borderMd:C.border}`,padding:"18px 16px",boxShadow:glow?C.limeGlowSm:C.shadowSm,transition:"all .2s",...style}}>
      {children}
    </div>
  );
}

// ════════════════════════════════════════════════════════
//  DRAG GRID
// ════════════════════════════════════════════════════════
function DragGrid({ bookings, ctrDate, onBookSlots, onContextMenu }) {
  const [dragBay,setDragBay]     = useState(null);
  const [dragStart,setDragStart] = useState(null);
  const [dragCur,setDragCur]     = useState(null);
  const isDragging = useRef(false);

  const isSlotTaken = (bay,slot) => bookings.some(b=>b.date===ctrDate&&b.bay===bay&&b.slots?.includes(slot)&&b.status==="confirmed");
  const getSlotBkg  = (bay,slot) => bookings.find(b=>b.date===ctrDate&&b.bay===bay&&b.slots?.includes(slot)&&b.status==="confirmed");

  const getDragSlots = useCallback(() => {
    if(!dragBay||!dragStart||!dragCur) return [];
    const si=slotIdx(dragStart),ei=slotIdx(dragCur);
    const[from,to]=si<=ei?[si,ei]:[ei,si];
    return SLOTS.slice(from,to+1);
  },[dragBay,dragStart,dragCur]);

  useEffect(()=>{
    const up = () => {
      if(!isDragging.current) return;
      isDragging.current=false;
      const slots=getDragSlots();
      if(slots.length>0&&dragBay) {
        const free=slots.filter(s=>!isSlotTaken(dragBay,s));
        if(free.length>0) onBookSlots(dragBay,free);
      }
      setDragBay(null);setDragStart(null);setDragCur(null);
    };
    window.addEventListener("mouseup",up);
    return()=>window.removeEventListener("mouseup",up);
  },[getDragSlots,dragBay]);

  const dragSlots=getDragSlots();

  return (
    <div style={{overflowX:"auto",borderRadius:12,border:`1px solid ${C.border}`,background:C.surface,userSelect:"none"}}>
      <div style={{minWidth:960,padding:14}}>
        {/* Hour labels */}
        <div style={{display:"flex",paddingLeft:72,marginBottom:6,gap:0}}>
          {Array.from({length:14},(_,i)=>(
            <div key={i} style={{width:46,flexShrink:0,fontSize:8,color:C.textMute,fontWeight:700,textAlign:"center",letterSpacing:"0.05em"}}>
              {String(OPEN_H+i).padStart(2,"0")}:00
            </div>
          ))}
        </div>

        {/* Bay rows */}
        {Array.from({length:NUM_BAYS},(_,bi)=>bi+1).map(bay=>(
          <div key={bay} style={{display:"flex",alignItems:"stretch",marginBottom:3,gap:2}}>
            <div style={{width:68,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:C.surface2,borderRadius:8,fontSize:11,fontWeight:800,color:C.lime,letterSpacing:"0.05em",border:`1px solid ${C.border}`}}>B{bay}</div>
            {SLOTS.map(slot=>{
              const taken=isSlotTaken(bay,slot);
              const bkg=taken?getSlotBkg(bay,slot):null;
              const inDrag=dragBay===bay&&dragSlots.includes(slot);
              const isStart=bkg&&bkg.slots&&[...bkg.slots].sort((a,b)=>slotIdx(a)-slotIdx(b))[0]===slot;
              const span=bkg?bkg.slots?.length:1;
              return (
                <div key={slot}
                  onMouseDown={e=>{e.preventDefault();if(isSlotTaken(bay,slot))return;isDragging.current=true;setDragBay(bay);setDragStart(slot);setDragCur(slot);}}
                  onMouseEnter={()=>{if(!isDragging.current||bay!==dragBay)return;setDragCur(slot);}}
                  onContextMenu={e=>{e.preventDefault();if(bkg)onContextMenu(e,bkg,bay,slot);}}
                  style={{
                    width:23,minHeight:42,flexShrink:0,borderRadius:4,
                    background:inDrag?C.lime+"44":taken?(bkg?.adminCreated?"#1a3a1a":"#1a2a3a"):C.surface2,
                    border:`1px solid ${inDrag?C.lime:taken?(bkg?.adminCreated?C.lime+"55":"#4da8ff55"):C.border}`,
                    cursor:taken?"context-menu":"crosshair",
                    position:"relative",transition:"background .06s",
                    boxSizing:"border-box",overflow:"visible",
                  }}>
                  {taken&&isStart&&(
                    <div style={{position:"absolute",top:0,left:0,width:Math.max(span*25-2,50),zIndex:10,
                      background:bkg.adminCreated?`linear-gradient(135deg,#1e4a1e,#2a6b2a)`:`linear-gradient(135deg,#1a2e4a,#1a3d6b)`,
                      borderRadius:5,padding:"4px 7px",
                      border:`1px solid ${bkg.adminCreated?C.lime+"60":"#4da8ff60"}`,
                      boxShadow:bkg.adminCreated?`0 2px 8px rgba(101,232,58,0.15)`:`0 2px 8px rgba(77,168,255,0.15)`,
                      pointerEvents:"none"}}>
                      <div style={{fontSize:9,fontWeight:800,color:bkg.adminCreated?C.lime:"#4da8ff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{sanitize(bkg.userName||"")}</div>
                      <div style={{fontSize:7.5,color:"rgba(255,255,255,0.6)",whiteSpace:"nowrap"}}>{bkg.slots?.[0]}–{bkg.slots?.length>0?slotEnd(bkg.slots[bkg.slots.length-1]):"?"}</div>
                      {bkg.userPhone&&bkg.userPhone!=="-"&&<div style={{fontSize:7,color:"rgba(255,255,255,0.4)",whiteSpace:"nowrap"}}>{bkg.userPhone}</div>}
                    </div>
                  )}
                  {inDrag&&!taken&&<div style={{position:"absolute",inset:0,background:C.lime,opacity:.2,borderRadius:3,pointerEvents:"none"}}/>}
                </div>
              );
            })}
          </div>
        ))}

        {isDragging.current&&dragSlots.length>0&&(
          <div style={{marginTop:10,padding:"6px 14px",background:C.lime,color:"#030803",borderRadius:8,fontSize:12,fontWeight:800,display:"inline-block",boxShadow:C.limeGlow}}>
            Bay {dragBay} · {dragSlots[0]} → {slotEnd(dragSlots[dragSlots.length-1])} · {totalDur(dragSlots)}
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
//  BOOKING MODAL
// ════════════════════════════════════════════════════════
// React.memo → 부모 재렌더링 시 불필요한 재렌더 방지
const BookingModal = memo(function BookingModal({show,onClose,bay,slots,date,regUsers,onConfirm,busy}) {
  const [search,setSearch]       = useState("");
  const [selMember,setSelMember] = useState(null);
  const [walkName,setWalkName]   = useState("");
  const [walkPhone,setWalkPhone] = useState("");
  const [mode,setMode]           = useState("search");
  const searchInputRef           = useRef(null);  // autoFocus 대신 ref 사용

  // 모달이 열릴 때만 초기화 + 포커스 (타이핑 중엔 절대 실행 안됨)
  useEffect(()=>{
    if(show){
      setSearch(""); setSelMember(null); setWalkName(""); setWalkPhone(""); setMode("search");
      // 짧은 딜레이 후 포커스 — 모달 애니메이션 완료 후
      const t = setTimeout(()=>{ searchInputRef.current?.focus(); }, 120);
      return ()=>clearTimeout(t);
    }
  },[show]);

  // useMemo → search/regUsers가 바뀔 때만 재계산
  const filtered = useMemo(()=>
    search.length>0
      ? regUsers.filter(u=>
          sanitize(u.name||"").toLowerCase().includes(search.toLowerCase()) ||
          sanitize(u.phone||"").includes(search) ||
          (u.memberNo||"").toLowerCase().includes(search.toLowerCase())
        ).slice(0,8)
      : []
  ,[search, regUsers]);

  const sorted = useMemo(()=>
    slots ? [...slots].sort((a,b)=>slotIdx(a)-slotIdx(b)) : []
  ,[slots]);

  const handleConfirm = useCallback(()=>{
    if(mode==="search"&&!selMember) return;
    const info = selMember
      ? {userId:selMember.id,userName:selMember.name,userNick:selMember.nick||"",userPhone:selMember.phone||"-",userEmail:selMember.email||""}
      : {userId:"walkin_"+Date.now(),userName:sanitize(walkName,80),userNick:"",userPhone:sanitize(walkPhone,30)||"-",userEmail:""};
    onConfirm(bay,sorted,info);
  },[mode,selMember,walkName,walkPhone,onConfirm,bay,sorted]);

  return (
    <Modal show={show} onClose={onClose} title="New Booking" wide>
      {/* Time summary */}
      <div style={{background:`linear-gradient(135deg,${C.surface2},${C.card})`,borderRadius:12,padding:"16px 18px",marginBottom:20,border:`1px solid ${C.borderMd}`,boxShadow:C.limeGlowSm}}>
        <div style={{fontSize:9,color:C.lime,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.15em",marginBottom:6}}>Selected Time</div>
        <div style={{fontSize:22,fontWeight:800,color:C.white}}>Bay {bay} · {sorted[0]} <span style={{color:C.textSub}}>→</span> {sorted.length>0?slotEnd(sorted[sorted.length-1]):"?"}</div>
        <div style={{display:"flex",gap:12,marginTop:6}}>
          <Tag color={C.lime}>{totalDur(sorted)}</Tag>
          <Tag color={C.textSub}>{fmtDate(date)}</Tag>
          <Tag color={C.textSub}>{sorted.length} slots</Tag>
        </div>
      </div>
      {/* Mode toggle */}
      <div style={{display:"flex",gap:8,marginBottom:18,background:C.surface2,borderRadius:10,padding:4,border:`1px solid ${C.border}`}}>
        {[["search","🔍 Existing Member"],["walkin","➕ Walk-in"]].map(([m,l])=>(
          <button key={m} onClick={()=>{setMode(m);setSelMember(null);}} style={{flex:1,padding:"9px",borderRadius:8,border:"none",background:mode===m?C.lime:"transparent",color:mode===m?"#030803":C.textSub,fontWeight:700,fontSize:12,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>{l}</button>
        ))}
      </div>
      {mode==="search"&&(
        <div>
          <div style={{position:"relative",marginBottom:12}}>
            {/* autoFocus 제거 — ref로 직접 포커스 관리 */}
            <input
              ref={searchInputRef}
              value={search}
              onChange={e=>setSearch(sanitize(e.target.value,80))}
              placeholder="Name, phone or member number…"
              style={{width:"100%",padding:"11px 14px 11px 40px",background:C.surface2,border:`1px solid ${C.border}`,borderRadius:10,color:C.white,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
            <div style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:C.textMute,fontSize:14}}>🔍</div>
          </div>
          {/* 결과 영역 — min-height로 레이아웃 점프 방지 */}
          <div style={{minHeight:40}}>
            {filtered.length>0&&(
              <div style={{background:C.surface2,borderRadius:10,border:`1px solid ${C.border}`,overflow:"hidden",marginBottom:12}}>
                {filtered.map((u,idx)=>(
                  <div key={u.id} onClick={()=>setSelMember(selMember?.id===u.id?null:u)}
                    style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",borderBottom:idx<filtered.length-1?`1px solid ${C.border}`:"none",cursor:"pointer",background:selMember?.id===u.id?C.limeDim:"transparent",transition:"background .15s"}}>
                    <div style={{width:36,height:36,borderRadius:10,background:selMember?.id===u.id?C.lime:C.card,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:900,color:selMember?.id===u.id?"#030803":C.lime,flexShrink:0,border:`1px solid ${selMember?.id===u.id?C.lime:C.border}`}}>
                      {(u.nick||u.name||"?")[0].toUpperCase()}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontWeight:700,fontSize:13,color:C.white}}>{sanitize(u.name)}</span>{u.memberNo&&<Tag color={C.blue}>{u.memberNo}</Tag>}</div>
                      <div style={{fontSize:11,color:C.textMute,marginTop:2}}>{u.phone||"—"}</div>
                    </div>
                    {selMember?.id===u.id&&<div style={{color:C.lime,fontSize:18}}>✓</div>}
                  </div>
                ))}
              </div>
            )}
            {search.length>0&&filtered.length===0&&<div style={{padding:"18px",textAlign:"center",color:C.textMute,fontSize:13,background:C.surface2,borderRadius:10,marginBottom:12}}>No member found — try Walk-in mode</div>}
          </div>
          {selMember&&(
            <div style={{background:C.limeDim,borderRadius:10,padding:14,border:`1px solid ${C.borderMd}`,marginBottom:16,marginTop:4}}>
              <div style={{fontSize:9,color:C.lime,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:6}}>✓ Selected</div>
              <div style={{fontSize:17,fontWeight:800,color:C.white}}>{sanitize(selMember.name)}</div>
              {selMember.memberNo&&<div style={{fontSize:11,color:C.blue,fontWeight:700,marginTop:2}}>{selMember.memberNo}</div>}
              <div style={{fontSize:12,color:C.textMute,marginTop:3}}>{selMember.phone||"—"}</div>
            </div>
          )}
        </div>
      )}
      {mode==="walkin"&&(
        <div>
          {/* Walk-in 모드 — 이름 필드에만 포커스 */}
          <Inp req label="Customer Name" value={walkName} onChange={v=>setWalkName(sanitizeInput(v,80))} placeholder="John Smith" maxLen={80} autoFocus/>
          <Inp label="Phone Number" value={walkPhone} onChange={v=>setWalkPhone(sanitizeInput(v,30))} placeholder="+64 21 xxx xxxx" maxLen={30}/>
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:4}}>
        <Btn full v="dark" onClick={onClose}>Cancel</Btn>
        <Btn full v="primary" sz="lg" onClick={handleConfirm} disabled={busy||(mode==="search"&&!selMember)||(mode==="walkin"&&walkName.length<2)}>{busy?"Confirming…":"Confirm Booking"}</Btn>
      </div>
    </Modal>
  );
});

// ════════════════════════════════════════════════════════
//  CONTEXT MENU
// ════════════════════════════════════════════════════════
function ContextMenu({menu,onClose,onCancel,onViewInfo,onChangeTime}) {
  useEffect(()=>{ const h=()=>onClose(); window.addEventListener("click",h); return()=>window.removeEventListener("click",h); },[onClose]);
  if(!menu) return null;
  return (
    <div style={{position:"fixed",top:menu.y,left:Math.min(menu.x,window.innerWidth-220),zIndex:9500,background:C.surface,borderRadius:12,boxShadow:C.shadowLg,border:`1px solid ${C.borderMd}`,overflow:"hidden",minWidth:210,animation:"fadeUp .15s ease"}}>
      <div style={{padding:"10px 16px",borderBottom:`1px solid ${C.border}`,background:C.surface2}}>
        <div style={{fontSize:9,fontWeight:700,color:C.textMute,textTransform:"uppercase",letterSpacing:"0.1em"}}>Bay {menu.bay} · {menu.booking?.slots?.[0]}</div>
        <div style={{fontSize:14,fontWeight:800,color:C.white,marginTop:3}}>{sanitize(menu.booking?.userName||"")}</div>
      </div>
      {[["👤","View Member Info",onViewInfo,false],["🕐","Change Date / Time",onChangeTime,false],["✕","Cancel Booking",onCancel,true]].map(([icon,label,action,danger])=>(
        <button key={label} onClick={e=>{e.stopPropagation();action();onClose();}}
          style={{display:"flex",alignItems:"center",gap:12,width:"100%",padding:"12px 16px",border:"none",background:"transparent",cursor:"pointer",textAlign:"left",fontFamily:"inherit",fontSize:13,fontWeight:600,color:danger?C.red:C.white,transition:"background .1s",letterSpacing:"-0.01em"}}
          onMouseEnter={e=>e.currentTarget.style.background=danger?C.redDim:C.limeDim}
          onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          <span style={{fontSize:15,width:20,textAlign:"center"}}>{icon}</span>{label}
        </button>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════
//  MEMBER INFO MODAL
// ════════════════════════════════════════════════════════
function MemberInfoModal({show,onClose,booking,regUsers}) {
  if(!show||!booking) return null;
  const member=regUsers.find(u=>u.id===booking.userId);
  const sorted=booking.slots?[...booking.slots].sort((a,b)=>slotIdx(a)-slotIdx(b)):[];
  return (
    <Modal show={show} onClose={onClose} title="Member Info">
      <div style={{background:`linear-gradient(135deg,${C.surface2},${C.card})`,borderRadius:12,padding:16,marginBottom:16,border:`1px solid ${C.borderMd}`}}>
        <div style={{fontSize:9,color:C.lime,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.15em",marginBottom:6}}>Booking</div>
        <div style={{fontSize:19,fontWeight:800,color:C.white}}>Bay {booking.bay} · {sorted[0]} → {sorted.length>0?slotEnd(sorted[sorted.length-1]):"?"}</div>
        <div style={{fontSize:12,color:C.textMute,marginTop:4}}>{fmtDateLng(booking.date)} · {totalDur(booking.slots||[])} · #{booking.id?.slice(-8).toUpperCase()}</div>
      </div>
      <div style={{background:C.surface2,borderRadius:12,border:`1px solid ${C.border}`,overflow:"hidden",marginBottom:16}}>
        {[["Name",sanitize(booking.userName||"")],["Nickname",sanitize(booking.userNick||"—")],["Phone",booking.userPhone!=="-"?booking.userPhone||"—":"—"],["Email",booking.userEmail||"—"],["Member#",member?.memberNo||"(walk-in)"],["Source",booking.adminCreated?"Counter (📋)":"App (📱)"]].map(([k,v])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 16px",borderBottom:`1px solid ${C.border}`,fontSize:13}}>
            <span style={{color:C.textMute,fontWeight:600,fontSize:11,letterSpacing:"0.05em"}}>{k}</span>
            <span style={{color:C.white,fontWeight:700,textAlign:"right",maxWidth:"60%"}}>{v}</span>
          </div>
        ))}
      </div>
      <Btn full v="dark" onClick={onClose}>Close</Btn>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════
//  CHANGE TIME MODAL
// ════════════════════════════════════════════════════════
function ChangeTimeModal({show,onClose,booking,onConfirm,busy}) {
  const [newDate,setNewDate]=useState(booking?.date||DATES[0]);
  const [newSlot,setNewSlot]=useState(booking?.slots?.[0]||SLOTS[0]);
  const [dur,setDur]=useState(booking?.slots?.length||1);
  useEffect(()=>{if(show&&booking){setNewDate(booking.date);setNewSlot(booking.slots?.[0]||SLOTS[0]);setDur(booking.slots?.length||1);}},[show,booking]);
  const newSlots=SLOTS.slice(slotIdx(newSlot),slotIdx(newSlot)+dur);
  return (
    <Modal show={show} onClose={onClose} title="Change Date / Time">
      <div style={{marginBottom:16}}>
        <div style={{fontSize:10,color:C.textSub,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:8}}>Date</div>
        <select value={newDate} onChange={e=>setNewDate(e.target.value)} style={{width:"100%",padding:"11px 14px",background:C.surface2,border:`1px solid ${C.border}`,borderRadius:10,fontSize:14,outline:"none",fontFamily:"inherit",color:C.white}}>
          {DATES.slice(0,14).map((d,i)=><option key={d} value={d}>{i===0?"Today":fmtDate(d)}</option>)}
        </select>
      </div>
      <div style={{marginBottom:16}}>
        <div style={{fontSize:10,color:C.textSub,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:8}}>Start Time</div>
        <select value={newSlot} onChange={e=>setNewSlot(e.target.value)} style={{width:"100%",padding:"11px 14px",background:C.surface2,border:`1px solid ${C.border}`,borderRadius:10,fontSize:14,outline:"none",fontFamily:"inherit",color:C.white}}>
          {SLOTS.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div style={{marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{fontSize:10,color:C.textSub,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase"}}>Duration</div>
          <span style={{fontSize:13,fontWeight:800,color:C.lime}}>{totalDur(newSlots)}</span>
        </div>
        <input type="range" min={1} max={16} value={dur} onChange={e=>setDur(Number(e.target.value))} style={{width:"100%",accentColor:C.lime}}/>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.textMute,marginTop:4}}><span>30m</span><span>8h</span></div>
      </div>
      <div style={{background:C.limeDim,borderRadius:10,padding:"12px 14px",marginBottom:16,border:`1px solid ${C.borderMd}`}}>
        <div style={{fontSize:14,fontWeight:800,color:C.white}}>Bay {booking?.bay} · {newSlot} → {newSlots.length>0?slotEnd(newSlots[newSlots.length-1]):"?"}</div>
        <div style={{fontSize:11,color:C.lime,marginTop:3,fontWeight:600}}>{fmtDate(newDate)} · {totalDur(newSlots)}</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <Btn full v="dark" onClick={onClose}>Cancel</Btn>
        <Btn full v="primary" onClick={()=>onConfirm(booking,newDate,newSlots)} disabled={busy}>{busy?"Saving…":"Save Changes"}</Btn>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════
//  EDIT MEMBER MODAL — 전체 프로필 편집 (어드민)
// ════════════════════════════════════════════════════════
function EditMemberModal({show,onClose,member,onSave,busy}) {
  const [form,setForm] = useState({name:"",nick:"",email:"",phone:"",address:"",memberNo:""});
  useEffect(()=>{
    if(show&&member) setForm({name:member.name||"",nick:member.nick||"",email:member.email||"",phone:member.phone||"",address:member.address||"",memberNo:member.memberNo||""});
  },[show,member]);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  return (
    <Modal show={show} onClose={onClose} title="Edit Member Profile">
      {/* Member badge */}
      <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:C.surface2,borderRadius:10,marginBottom:18,border:`1px solid ${C.border}`}}>
        <div style={{width:42,height:42,borderRadius:12,background:C.limeDim,border:`1px solid ${C.borderMd}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:900,color:C.lime,flexShrink:0}}>
          {(form.nick||form.name||"?")[0].toUpperCase()}
        </div>
        <div>
          <div style={{fontSize:14,fontWeight:800,color:C.white}}>{form.name||"—"}</div>
          {member?.memberNo&&<div style={{fontSize:11,color:C.blue,fontWeight:700,marginTop:2}}>{member.memberNo}</div>}
          {member?.walkin&&<Tag color={C.gold}>Walk-in member</Tag>}
        </div>
      </div>
      <Inp label="Member Number" value={form.memberNo} onChange={v=>set("memberNo",sanitizeInput(v,20))} placeholder="KG-0001" maxLen={20}/>
      <Inp req label="Full Name" value={form.name} onChange={v=>set("name",sanitizeInput(v,80))} placeholder="John Smith" maxLen={80}/>
      <Inp label="Nickname" value={form.nick} onChange={v=>set("nick",sanitizeInput(v,40))} placeholder="@GolfKing" maxLen={40}/>
      <Inp label="Email" value={form.email} onChange={v=>set("email",v)} type="email" placeholder="john@example.com"/>
      <Inp label="Phone" value={form.phone} onChange={v=>set("phone",sanitizeInput(v,30))} placeholder="+64 21 xxx xxxx" maxLen={30}/>
      <Inp label="Address" value={form.address} onChange={v=>set("address",sanitizeInput(v,200))} placeholder="Auckland, NZ" maxLen={200}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:4}}>
        <Btn full v="dark" onClick={onClose}>Cancel</Btn>
        <Btn full v="primary" onClick={()=>onSave(member,form)} disabled={busy||!form.name.trim()}>{busy?"Saving…":"Save Changes"}</Btn>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════
//  MAIN APP
// ════════════════════════════════════════════════════════
export default function KGolfApp() {
  const [view,setView]       = useState("login");
  const [isAdmin,setIsAdmin] = useState(false);
  const [tabView,setTabView] = useState("home");
  const [ctrTab,setCtrTab]   = useState("timetable");
  const [user,setUser]       = useState(null);
  const [bookings,setBookings]   = useState([]);
  const [regUsers,setRegUsers]   = useState([]);
  const [toast,setToast]         = useState(null);
  const [newBkg,setNewBkg]       = useState(false);
  const [loading,setLoading]     = useState(true);
  const [busy,setBusy]           = useState(false);

  const [selDate,setSelDate]   = useState(DATES[0]);
  const [selBay,setSelBay]     = useState(null);
  const [selSlots,setSelSlots] = useState([]);
  const [lastBkg,setLastBkg]   = useState(null);
  const [ctrDate,setCtrDate]   = useState(DATES[0]);

  const [bookModal,setBookModal]   = useState({show:false,bay:null,slots:[]});
  const [ctxMenu,setCtxMenu]       = useState(null);
  const [infoModal,setInfoModal]   = useState({show:false,booking:null});
  const [changeModal,setChangeModal]= useState({show:false,booking:null});

  const [userSearch,setUserSearch]   = useState("");
  const [statsFilter,setStatsFilter] = useState(null);
  const [editMemberNo,setEditMemberNo]=useState(null);
  const [editMember,setEditMember]   = useState(null); // 전체 프로필 편집

  const [lf,setLf] = useState({email:"",pass:""});
  const [rf,setRf] = useState({name:"",nick:"",email:"",phone:"",address:"",pass:"",passConfirm:""});
  const [showForgot,setShowForgot]   = useState(false);
  const [forgotEmail,setForgotEmail] = useState("");
  const [forgotStep,setForgotStep]   = useState(1);
  const [forgotNew,setForgotNew]     = useState("");
  const [forgotUser,setForgotUser]   = useState(null);

  const pop = (msg,type="ok") => { setToast({msg,type}); setTimeout(()=>setToast(null),4000); };
  const lastActive = useRef(Date.now());

  useEffect(()=>{
    const touch=()=>{lastActive.current=Date.now();};
    ["mousemove","keydown","touchstart","click"].forEach(e=>window.addEventListener(e,touch,{passive:true}));
    const tick=setInterval(()=>{ if((view==="app"||view==="counter")&&Date.now()-lastActive.current>SESSION_MS){auditLog("SESSION_TIMEOUT",{email:user?.email||"admin"});setUser(null);setIsAdmin(false);setView("login");pop("Session expired. Please sign in again.","err");} },30000);
    return()=>{["mousemove","keydown","touchstart","click"].forEach(e=>window.removeEventListener(e,touch));clearInterval(tick);};
  },[view,user]);

  useEffect(()=>{
    Promise.all([getDoc(doc(db,"kgolf","bookings")),getDoc(doc(db,"kgolf","users"))]).then(([bS,uS])=>{
      if(bS.exists()) try{setBookings(JSON.parse(bS.data().data||"[]"));}catch(e){console.error(e);}
      if(uS.exists()) try{setRegUsers(JSON.parse(uS.data().data||"[]"));}catch(e){console.error(e);}
      setLoading(false);
    }).catch(e=>{console.error(e);setLoading(false);});
    const u1=onSnapshot(doc(db,"kgolf","bookings"),s=>{if(s.exists())try{setBookings(JSON.parse(s.data().data||"[]"));}catch{}});
    const u2=onSnapshot(doc(db,"kgolf","users"),s=>{if(s.exists())try{setRegUsers(JSON.parse(s.data().data||"[]"));}catch{}});
    return()=>{u1();u2();};
  },[]);

  const saveBkgs=useCallback(async(b)=>{setBookings(b);try{await setDoc(doc(db,"kgolf","bookings"),{data:JSON.stringify(b)});}catch(e){console.error(e);pop(genericErr(),"err");}});
  const saveUsrs=useCallback(async(u)=>{setRegUsers(u);try{await setDoc(doc(db,"kgolf","users"),{data:JSON.stringify(u)});}catch(e){console.error(e);pop(genericErr(),"err");}});

  const isSlotTaken=(date,bay,slot)=>bookings.some(b=>b.date===date&&b.bay===bay&&b.slots?.includes(slot)&&b.status==="confirmed");
  const getSlotBkg=(date,bay,slot)=>bookings.find(b=>b.date===date&&b.bay===bay&&b.slots?.includes(slot)&&b.status==="confirmed");
  const bayFreeSlots=(date,bay)=>{const t=new Set();bookings.filter(b=>b.date===date&&b.bay===bay&&b.status==="confirmed").forEach(b=>b.slots?.forEach(s=>t.add(s)));return SLOTS.length-t.size;};
  const toggleSlot=(s)=>{if(isSlotTaken(selDate,selBay,s))return;const nx=selSlots.includes(s)?selSlots.filter(x=>x!==s):[...selSlots,s];if(!isConsec(nx)){pop("Please select consecutive time slots only.","err");return;}setSelSlots(nx);};

  const doLogin=async()=>{
    if(busy) return;
    const email=sanitizeEmail(lf.email),pass=sanitize(lf.pass,128);
    if(!validateEmail(email)||!pass){pop("Please enter a valid email and password.","err");return;}
    const rl=rlCheck(email);
    if(rl.blocked){pop(`Too many attempts. Try again in ${rl.mins} min.`,"err");return;}
    setBusy(true);
    try{
      if(email===ADMIN_EMAIL){
        const h=await hashPassword(pass,ADMIN_SALT);
        if(h!==ADMIN_HASH){rlFail(email);await auditLog("LOGIN_FAIL",{email,reason:"bad_admin_password"});pop("Incorrect email or password.","err");return;}
        rlClear(email);await auditLog("LOGIN_OK",{email,role:"admin"});setIsAdmin(true);setView("counter");return;
      }
      const u=regUsers.find(u=>sanitizeEmail(u.email)===email);
      if(!u){rlFail(email);await auditLog("LOGIN_FAIL",{email});pop("Incorrect email or password.","err");return;}
      let match=false;
      if(u.salt&&u.passHash){match=(await hashPassword(pass,u.salt))===u.passHash;}
      else{match=u.pass===pass;if(match){const salt=generateSalt();const passHash=await hashPassword(pass,salt);await saveUsrs(regUsers.map(x=>x.id===u.id?{...x,salt,passHash,pass:undefined}:x));}}
      if(!match){rlFail(email);await auditLog("LOGIN_FAIL",{email});pop("Incorrect email or password.","err");return;}
      rlClear(email);lastActive.current=Date.now();await auditLog("LOGIN_OK",{email,role:"user"});
      setUser(u);setIsAdmin(false);setTabView("home");setView("app");pop(`Welcome back, ${u.nick||u.name}!`);
    }catch(e){console.error(e);pop(genericErr(),"err");}
    finally{setBusy(false);}
  };

  const doRegister=async()=>{
    if(busy) return;
    const name=sanitize(rf.name,80),nick=sanitize(rf.nick,40),email=sanitizeEmail(rf.email),phone=sanitize(rf.phone,30),address=sanitize(rf.address,200),pass=rf.pass;
    if(!validateName(name)){pop("Name must be 2–80 characters.","err");return;}
    if(!validateEmail(email)){pop("Please enter a valid email.","err");return;}
    if(!validatePassword(pass)){pop("Password must be 8–128 characters.","err");return;}
    if(pass!==rf.passConfirm){pop("Passwords do not match.","err");return;}
    if(email===ADMIN_EMAIL){pop("That email is reserved.","err");return;}
    if(regUsers.find(u=>sanitizeEmail(u.email)===email)){pop("Email already registered.","err");return;}
    setBusy(true);
    try{
      const salt=generateSalt(),passHash=await hashPassword(pass,salt);
      const memberNo=genMemberNo(regUsers);
      const nu={id:Date.now().toString(),name,nick,email,phone,address,salt,passHash,memberNo};
      await saveUsrs([...regUsers,nu]);await auditLog("REGISTER",{email});
      lastActive.current=Date.now();setUser(nu);setIsAdmin(false);setTabView("home");setView("app");
      pop(`Welcome to KGOLF NZ, ${nick||name}!`);
    }catch(e){console.error(e);pop(genericErr(),"err");}
    finally{setBusy(false);}
  };

  const doForgotStep1=()=>{const email=sanitizeEmail(forgotEmail);if(!validateEmail(email)){pop("Please enter a valid email.","err");return;}const u=regUsers.find(u=>sanitizeEmail(u.email)===email);if(!u){pop("If that email exists, you can now set a new password.");setForgotStep(2);setForgotUser(null);return;}setForgotUser(u);setForgotStep(2);};
  const doForgotStep2=async()=>{if(!forgotUser){pop("Please go back.","err");return;}if(!validatePassword(forgotNew)){pop("Password must be 8–128 characters.","err");return;}setBusy(true);try{const salt=generateSalt(),passHash=await hashPassword(forgotNew,salt);await saveUsrs(regUsers.map(u=>u.id===forgotUser.id?{...u,salt,passHash,pass:undefined}:u));await auditLog("PASS_RESET",{email:forgotUser.email});pop("Password updated. Please sign in.");setShowForgot(false);setForgotEmail("");setForgotNew("");setForgotStep(1);setForgotUser(null);}catch(e){console.error(e);pop(genericErr(),"err");}finally{setBusy(false);};};

  const doConfirm=async()=>{
    if(busy) return;
    for(const s of selSlots) if(isSlotTaken(selDate,selBay,s)){pop("A slot was just taken. Please re-select.","err");setTabView("home");setSelSlots([]);return;}
    const sorted=[...selSlots].sort((a,b)=>slotIdx(a)-slotIdx(b));
    setBusy(true);
    try{
      const bkg={id:Date.now().toString(),userId:user.id,userName:sanitize(user.name),userNick:sanitize(user.nick||""),userPhone:sanitize(user.phone||""),userEmail:sanitizeEmail(user.email),bay:selBay,date:selDate,slots:sorted,status:"confirmed",createdAt:new Date().toISOString(),adminCreated:false};
      await saveBkgs([...bookings,bkg]);
      await auditLog("BOOKING_CREATED",{userId:user.id,bay:selBay,date:selDate});
      // 확인 이메일 발송 (비동기 — 실패해도 예약은 유지)
      sendConfirmationEmail(bkg, regUsers).catch(e=>console.error("[email]",e));
      setLastBkg(bkg);setNewBkg(true);setTabView("confirmed");
      pop(`Bay ${selBay} booked — ${totalDur(sorted)}`);
    }catch(e){console.error(e);pop(genericErr(),"err");}
    finally{setBusy(false);}
  };

  const doCancel=async(id)=>{setBusy(true);try{await saveBkgs(bookings.map(b=>b.id===id?{...b,status:"cancelled"}:b));await auditLog("BOOKING_CANCELLED",{id,by:user?.email||"admin"});pop("Booking cancelled.");}catch(e){console.error(e);pop(genericErr(),"err");}finally{setBusy(false);};};
  const doAdminBook=async(bay,slots,memberInfo)=>{
    setBusy(true);
    try{
      const bkg={id:Date.now().toString(),...memberInfo,bay,date:ctrDate,slots,status:"confirmed",adminCreated:true,createdAt:new Date().toISOString()};
      const updatedBkgs=[...bookings,bkg];
      await saveBkgs(updatedBkgs);
      // Walk-in이면 멤버로 자동 등록
      let finalUsers=regUsers;
      if(memberInfo.userId?.startsWith("walkin_")){
        const exists=regUsers.find(u=>sanitize(u.name).toLowerCase()===sanitize(memberInfo.userName).toLowerCase());
        if(!exists){
          const memberNo=genMemberNo(regUsers);
          const nm={id:memberInfo.userId,name:sanitize(memberInfo.userName),nick:"",email:"",phone:sanitize(memberInfo.userPhone||""),address:"",memberNo,walkin:true,createdAt:new Date().toISOString()};
          finalUsers=[...regUsers,nm];
          await saveUsrs(finalUsers);
        }
      }
      await auditLog("ADMIN_BOOKING",{bay,date:ctrDate,user:memberInfo.userName});
      if(memberInfo.userEmail){
        sendConfirmationEmail(bkg,finalUsers).catch(e=>console.error("[email]",e));
      }
      setBookModal({show:false,bay:null,slots:[]});
      pop(`Bay ${bay} · ${slots[0]}–${slotEnd(slots[slots.length-1])} — ${sanitize(memberInfo.userName)}`);
    }catch(e){console.error(e);pop(genericErr(),"err");}
    finally{setBusy(false);}
  };
  const doChangeTime=async(booking,newDate,newSlots)=>{setBusy(true);try{for(const s of newSlots)if(bookings.some(b=>b.id!==booking.id&&b.date===newDate&&b.bay===booking.bay&&b.slots?.includes(s)&&b.status==="confirmed")){pop("Some of those slots are already taken!","err");return;}await saveBkgs(bookings.map(b=>b.id===booking.id?{...b,date:newDate,slots:newSlots}:b));await auditLog("BOOKING_CHANGED",{id:booking.id});setChangeModal({show:false,booking:null});pop("Booking updated.");}catch(e){console.error(e);pop(genericErr(),"err");}finally{setBusy(false);};};
  const saveEditMemberNo=async()=>{if(!editMemberNo)return;const val=sanitize(editMemberNo.val,20);if(!val){pop("Member number cannot be empty.","err");return;}if(regUsers.some(u=>u.id!==editMemberNo.id&&u.memberNo===val)){pop("That member number is already in use.","err");return;}await saveUsrs(regUsers.map(u=>u.id===editMemberNo.id?{...u,memberNo:val}:u));setEditMemberNo(null);pop("Member number updated.");};

  // 전체 멤버 프로필 저장
  const saveEditMember=async(member,form)=>{
    if(!form.name.trim()){pop("Name is required.","err");return;}
    const val=sanitize(form.memberNo,20);
    if(val&&regUsers.some(u=>u.id!==member.id&&u.memberNo===val)){pop("That member number is already in use.","err");return;}
    setBusy(true);
    try{
      await saveUsrs(regUsers.map(u=>u.id===member.id?{
        ...u,
        name:    sanitize(form.name,80),
        nick:    sanitize(form.nick,40),
        email:   sanitizeEmail(form.email),
        phone:   sanitize(form.phone,30),
        address: sanitize(form.address,200),
        memberNo:val||u.memberNo||"",
        walkin:  undefined,   // 정식 등록되면 walk-in 플래그 제거
      }:u));
      await auditLog("MEMBER_UPDATED",{id:member.id,by:"admin"});
      setEditMember(null);
      pop("Member profile updated. ✅");
    }catch(e){console.error(e);pop(genericErr(),"err");}
    finally{setBusy(false);}
  };
  const doDeleteUser=async(uid)=>{if(!window.confirm("Delete this user?"))return;setBusy(true);try{await saveUsrs(regUsers.filter(u=>u.id!==uid));await auditLog("USER_DELETED",{uid,by:"admin"});pop("User deleted.");}catch(e){console.error(e);pop(genericErr(),"err");}finally{setBusy(false);};};
  const doLogout=async(role="user")=>{await auditLog("LOGOUT",{email:user?.email||"admin",role});setUser(null);setIsAdmin(false);setSelSlots([]);setSelBay(null);setView("login");};

  const myBkgs=user?bookings.filter(b=>b.userId===user.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)):[];
  const allConfBkgs=bookings.filter(b=>b.status==="confirmed"&&b.userId!=="admin");
  const todayAllBkgs=bookings.filter(b=>b.date===DATES[0]&&b.status==="confirmed");
  const filteredUsers=regUsers.filter(u=>sanitize(u.name||"").toLowerCase().includes(userSearch.toLowerCase())||sanitizeEmail(u.email||"").includes(userSearch.toLowerCase())||sanitize(u.nick||"").toLowerCase().includes(userSearch.toLowerCase())||sanitize(u.phone||"").includes(userSearch)||(u.memberNo||"").toLowerCase().includes(userSearch.toLowerCase()));

  const ForgotModal=(
    <Modal show={showForgot} onClose={()=>{setShowForgot(false);setForgotStep(1);setForgotEmail("");setForgotNew("");}} title="Reset Password">
      {forgotStep===1?(<><p style={{color:C.textSub,fontSize:13,marginBottom:18,lineHeight:1.6}}>Enter your registered email to reset your password.</p><Inp label="Email" value={forgotEmail} onChange={setForgotEmail} type="email" placeholder="your@email.com" autoFocus/><Btn full v="primary" onClick={doForgotStep1} disabled={busy}>Find Account →</Btn></>)
      :(<>{forgotUser&&<div style={{background:C.limeDim,borderRadius:10,padding:"12px 16px",marginBottom:16,border:`1px solid ${C.borderMd}`}}><div style={{fontSize:9,color:C.lime,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase"}}>Account found</div><div style={{fontSize:16,fontWeight:800,color:C.white,marginTop:4}}>{forgotUser.name}</div></div>}<Inp label="New Password" value={forgotNew} onChange={setForgotNew} type="password" placeholder="Min 8 characters" maxLen={128} autoFocus/><Btn full v="primary" onClick={doForgotStep2} disabled={busy}>Update Password</Btn></>)}
    </Modal>
  );

  // ─── LOADING ──────────────────────────────────────────
  if(loading) return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:24}}>
      <style>{CSS}</style>
      <KGolfLogo size="lg"/>
      <div style={{width:32,height:32,border:`2px solid ${C.border}`,borderTop:`2px solid ${C.lime}`,borderRadius:"50%",animation:"spin .8s linear infinite"}}/>
      <div style={{fontSize:11,color:C.textMute,letterSpacing:"0.15em",textTransform:"uppercase"}}>Loading</div>
    </div>
  );

  // ─── LOGIN ────────────────────────────────────────────
  if(view==="login") return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px 16px",position:"relative",overflow:"hidden"}}>
      <style>{CSS}</style>
      {/* Background decoration */}
      <div style={{position:"absolute",top:"20%",left:"50%",transform:"translateX(-50%)",width:500,height:500,background:`radial-gradient(circle,${C.lime}08 0%,transparent 70%)`,pointerEvents:"none"}}/>
      <div style={{position:"absolute",bottom:0,left:0,right:0,height:1,background:`linear-gradient(90deg,transparent,${C.borderMd},transparent)`}}/>

      <Toast toast={toast}/>
      {ForgotModal}

      {/* Hero */}
      <div style={{textAlign:"center",marginBottom:40,animation:"fadeUp .5s ease"}}>
        <div style={{marginBottom:16}}><KGolfLogo size="lg"/></div>
        <div style={{fontSize:11,color:C.textMute,letterSpacing:"0.2em",textTransform:"uppercase",marginTop:8}}>Engineered for Excellence · New Zealand</div>
      </div>

      {/* Form card */}
      <div style={{width:"100%",maxWidth:400,background:C.surface,borderRadius:16,padding:28,border:`1px solid ${C.border}`,boxShadow:C.shadowLg,animation:"fadeUp .55s ease"}}>
        <div style={{fontSize:11,color:C.lime,fontWeight:700,letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:6}}>Sign In</div>
        <div style={{fontSize:22,fontWeight:800,color:C.white,marginBottom:24,letterSpacing:"-0.02em"}}>Welcome back</div>

        <Inp label="Email" value={lf.email} onChange={v=>setLf(p=>({...p,email:v}))} type="email" placeholder="your@email.com" maxLen={254}/>
        <Inp label="Password" value={lf.pass} onChange={v=>setLf(p=>({...p,pass:v}))} type="password" placeholder="••••••••" maxLen={128}/>

        <div style={{textAlign:"right",marginTop:-8,marginBottom:20}}>
          <button onClick={()=>{setShowForgot(true);setForgotStep(1);}} style={{background:"none",border:"none",color:C.textSub,fontSize:11,cursor:"pointer",fontWeight:600,letterSpacing:"0.05em"}}>Forgot password?</button>
        </div>

        <div style={{marginBottom:10}}><Btn full v="primary" sz="lg" onClick={doLogin} disabled={busy}>{busy?"Signing in…":"Sign In"}</Btn></div>
        <Btn full v="ghost" onClick={()=>setView("register")}>Create Account</Btn>

        <div style={{marginTop:20,padding:"11px 14px",background:C.surface2,borderRadius:10,fontSize:11,color:C.textMute,border:`1px solid ${C.border}`,textAlign:"center"}}>
          Staff access — use your admin credentials
        </div>
      </div>

      {/* Bottom line */}
      <div style={{marginTop:32,fontSize:10,color:C.textMute,letterSpacing:"0.1em",textTransform:"uppercase",textAlign:"center",lineHeight:2}}>
        KGOLF NZ · Screen Golf · 11 Bays · Auckland
      </div>
    </div>
  );

  // ─── REGISTER ─────────────────────────────────────────
  if(view==="register") return (
    <div style={{minHeight:"100vh",background:C.bg,color:C.white}}>
      <style>{CSS}</style><Toast toast={toast}/>
      <Header onBack={()=>setView("login")} subtitle="New member registration"/>
      <div style={{maxWidth:440,margin:"0 auto",padding:"24px 16px 80px",animation:"fadeUp .4s ease"}}>
        <div style={{marginBottom:24}}>
          <div style={{fontSize:10,color:C.lime,fontWeight:700,letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:6}}>Join KGOLF NZ</div>
          <div style={{fontSize:22,fontWeight:800,letterSpacing:"-0.02em"}}>Create your account</div>
        </div>
        <Card>
          <Inp req label="Full Name" value={rf.name} onChange={v=>setRf(p=>({...p,name:v}))} placeholder="John Smith" maxLen={80}/>
          <Inp label="KGOLF Nickname" value={rf.nick} onChange={v=>setRf(p=>({...p,nick:v}))} placeholder="@GolfKing (optional)" maxLen={40}/>
          <Inp req label="Email" value={rf.email} onChange={v=>setRf(p=>({...p,email:v}))} type="email" placeholder="john@example.com"/>
          <Inp label="Phone" value={rf.phone} onChange={v=>setRf(p=>({...p,phone:v}))} placeholder="+64 21 xxx xxxx" maxLen={30}/>
          <Inp label="Address" value={rf.address} onChange={v=>setRf(p=>({...p,address:v}))} placeholder="Auckland, NZ" maxLen={200}/>
          <Inp req label="Password" value={rf.pass} onChange={v=>setRf(p=>({...p,pass:v}))} type="password" placeholder="Minimum 8 characters" hint="8–128 characters" maxLen={128}/>
          <Inp req label="Confirm Password" value={rf.passConfirm} onChange={v=>setRf(p=>({...p,passConfirm:v}))} type="password" placeholder="Re-enter password" maxLen={128}/>
        </Card>
        <div style={{marginTop:16}}><Btn full v="primary" sz="lg" onClick={doRegister} disabled={busy}>{busy?"Creating…":"Create Account"}</Btn></div>
      </div>
    </div>
  );

  // ─── APP ──────────────────────────────────────────────
  if(view==="app") {
    const tab=tabView;

    // HOME
    if(tab==="home") return (
      <div style={{minHeight:"100vh",background:C.bg}}>
        <style>{CSS}</style><Toast toast={toast}/>
        <Header subtitle="Book a bay"/>
        <div style={{maxWidth:500,margin:"0 auto",padding:"20px 16px 0",animation:"fadeUp .35s ease"}}>
          {/* Greeting */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24,padding:"16px 18px",background:C.surface,borderRadius:14,border:`1px solid ${C.border}`}}>
            <div>
              <div style={{fontSize:11,color:C.textMute,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase"}}>Welcome back</div>
              <div style={{fontSize:20,fontWeight:800,color:C.white,marginTop:3,letterSpacing:"-0.01em"}}>{sanitize(user?.nick||user?.name||"")}</div>
              {user?.memberNo&&<div style={{fontSize:11,color:C.lime,fontWeight:600,marginTop:2}}>{user.memberNo}</div>}
            </div>
            <div style={{width:46,height:46,borderRadius:12,background:C.limeDim,border:`1px solid ${C.borderMd}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>⛳</div>
          </div>

          {/* Date selector */}
          <SectionLabel>Select Date</SectionLabel>
          <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:8,marginBottom:24}}>
            {DATES.map((d,idx)=>{
              const dt=new Date(d+"T12:00"),sel=d===selDate;
              return <button key={d} className="date-btn" onClick={()=>{setSelDate(d);setSelSlots([]);setSelBay(null);}} style={{flexShrink:0,padding:"11px 12px",borderRadius:12,background:sel?C.lime:C.card,border:`1px solid ${sel?C.lime:C.border}`,color:sel?"#030803":C.white,cursor:"pointer",textAlign:"center",minWidth:54,transition:"all .15s",boxShadow:sel?C.limeGlow:"none"}}>
                <div style={{fontSize:8,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:3,opacity:.8}}>{idx===0?"Today":dt.toLocaleDateString("en-NZ",{weekday:"short"})}</div>
                <div style={{fontSize:22,fontWeight:900,lineHeight:1}}>{dt.getDate()}</div>
                <div style={{fontSize:8,marginTop:3,opacity:.7}}>{dt.toLocaleDateString("en-NZ",{month:"short"})}</div>
              </button>;
            })}
          </div>

          {/* Legend */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <SectionLabel>Select Bay</SectionLabel>
            <div style={{display:"flex",gap:12}}>
              {[[C.lime,"Free"],[C.gold,"Busy"],[C.red,"Full"]].map(([c,l])=><div key={l} style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:C.textMute}}><div style={{width:6,height:6,borderRadius:"50%",background:c,boxShadow:`0 0 6px ${c}80`}}/>{l}</div>)}
            </div>
          </div>

          {/* Bay grid */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,paddingBottom:90}}>
            {Array.from({length:NUM_BAYS},(_,i)=>i+1).map(bay=>{
              const free=bayFreeSlots(selDate,bay),pct=((SLOTS.length-free)/SLOTS.length)*100,full=free===0;
              const barCol=pct>75?C.red:pct>40?C.gold:C.lime;
              return (
                <button key={bay} className="bay-btn" onClick={()=>{if(!full){setSelBay(bay);setSelSlots([]);setTabView("selectTime");}}} disabled={full}
                  style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"18px 10px",cursor:full?"not-allowed":"pointer",textAlign:"center",transition:"all .2s",opacity:full?.4:1,boxShadow:C.shadowSm}}>
                  <div style={{fontSize:8,color:C.textMute,marginBottom:4,letterSpacing:"0.15em",textTransform:"uppercase",fontWeight:700}}>BAY</div>
                  <div style={{fontSize:32,fontWeight:900,color:C.lime,lineHeight:1,letterSpacing:"-0.02em"}}>{bay}</div>
                  <div style={{fontSize:10,fontWeight:700,color:full?C.red:free<6?C.gold:C.lime,marginTop:6}}>{full?"FULL":`${free/2}h free`}</div>
                  <div style={{marginTop:10,height:2,background:C.border,borderRadius:2,overflow:"hidden"}}>
                    <div style={{width:`${pct}%`,height:"100%",background:barCol,borderRadius:2,boxShadow:`0 0 6px ${barCol}80`,transition:"width .4s"}}/>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <NavBar active="home" onTab={t=>{setNewBkg(false);setTabView(t);}} newBooking={newBkg}/>
      </div>
    );

    // SELECT TIME
    if(tab==="selectTime") {
      const sortedSel=[...selSlots].sort((a,b)=>slotIdx(a)-slotIdx(b));
      return (
        <div style={{minHeight:"100vh",background:C.bg}}>
          <style>{CSS}</style><Toast toast={toast}/>
          <Header onBack={()=>setTabView("home")} subtitle={`Bay ${selBay} · ${fmtDate(selDate)}`}/>
          <div style={{maxWidth:500,margin:"0 auto",padding:"20px 16px 100px",animation:"fadeUp .35s ease"}}>

            {/* Selection banner */}
            {selSlots.length>0?(
              <div style={{background:`linear-gradient(135deg,${C.surface2},${C.card})`,borderRadius:14,padding:"14px 18px",marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center",border:`1px solid ${C.borderMd}`,boxShadow:C.limeGlowSm,animation:"fadeUp .3s ease"}}>
                <div>
                  <div style={{fontSize:9,color:C.lime,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.15em"}}>Selected</div>
                  <div style={{fontSize:19,fontWeight:800,color:C.white,marginTop:3}}>{sortedSel[0]} <span style={{color:C.textMute}}>→</span> {slotEnd(sortedSel[sortedSel.length-1])}</div>
                  <div style={{display:"flex",gap:8,marginTop:6}}><Tag color={C.lime}>{totalDur(selSlots)}</Tag><Tag color={C.textSub}>{selSlots.length} slots</Tag></div>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8}}>
                  <button onClick={()=>setSelSlots([])} style={{background:C.surface,border:`1px solid ${C.border}`,color:C.textSub,borderRadius:8,padding:"5px 12px",cursor:"pointer",fontSize:11,fontWeight:600}}>Clear</button>
                  <button onClick={()=>setTabView("confirmView")} style={{background:C.lime,border:"none",color:"#030803",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:800,boxShadow:C.limeGlowSm}}>Book →</button>
                </div>
              </div>
            ):(
              <div style={{background:C.surface,borderRadius:12,padding:"12px 16px",marginBottom:20,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:12}}>
                <div style={{color:C.lime,fontSize:18}}>→</div>
                <div><div style={{fontSize:13,fontWeight:700,color:C.white}}>Tap to select time slots</div><div style={{fontSize:11,color:C.textMute,marginTop:2}}>Select consecutive 30-min slots</div></div>
              </div>
            )}

            {/* AM/PM/Evening groups */}
            {[["AM  ·  09:00–12:00",[9,12]],["PM  ·  12:00–17:00",[12,17]],["Evening  ·  17:00–23:00",[17,23]]].map(([label,[from,to]])=>{
              const groups=HOUR_GROUPS.filter(g=>{const h=parseInt(g.label);return h>=from&&h<to;});
              if(!groups.length) return null;
              return (
                <div key={label} style={{marginBottom:24}}>
                  <div style={{fontSize:9,fontWeight:700,color:C.textMute,textTransform:"uppercase",letterSpacing:"0.15em",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                    <div style={{flex:1,height:1,background:C.border}}/>
                    {label}
                    <div style={{flex:1,height:1,background:C.border}}/>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:5}}>
                    {groups.map(({label:hl,slots})=>(
                      <div key={hl} style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:40,fontSize:11,fontWeight:700,color:C.textMute,flexShrink:0,textAlign:"right"}}>{hl}</div>
                        {slots.map(slot=>{
                          const taken=isSlotTaken(selDate,selBay,slot),sel=selSlots.includes(slot);
                          const bkg=taken?getSlotBkg(selDate,selBay,slot):null,isHalf=slot.endsWith(":30");
                          return (
                            <button key={slot} className={!taken&&!sel?"slot-btn":""} onClick={()=>!taken&&toggleSlot(slot)} disabled={taken}
                              style={{flex:1,padding:"11px 4px",borderRadius:10,background:sel?C.lime:taken?C.surface2:C.card,border:`1px solid ${sel?C.lime:taken?C.border:C.border}`,color:sel?"#030803":taken?C.textMute:C.white,cursor:taken?"not-allowed":"pointer",textAlign:"center",transition:"all .12s",boxShadow:sel?C.limeGlowSm:"none",opacity:taken?.5:1}}>
                              <div style={{fontSize:11,fontWeight:800,letterSpacing:"0.02em"}}>{isHalf?":30":":00"}</div>
                              {taken?<div style={{fontSize:8,marginTop:3,color:C.textMute,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"100%",padding:"0 2px"}}>{bkg?(bkg.userNick||bkg.userName||"").slice(0,5):"·"}</div>
                              :sel?<div style={{fontSize:8,marginTop:3,color:"#030803",fontWeight:700}}>✓</div>
                              :<div style={{fontSize:8,marginTop:3,color:C.lime,opacity:.7}}>free</div>}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    // CONFIRM VIEW
    if(tab==="confirmView") {
      const sorted=[...selSlots].sort((a,b)=>slotIdx(a)-slotIdx(b));
      return (
        <div style={{minHeight:"100vh",background:C.bg}}>
          <style>{CSS}</style><Toast toast={toast}/>
          <Header onBack={()=>setTabView("selectTime")} subtitle="Review & Confirm"/>
          <div style={{maxWidth:480,margin:"0 auto",padding:"20px 16px",animation:"fadeUp .35s ease"}}>
            <Card style={{marginBottom:14}} glow>
              <SectionLabel>Booking Details</SectionLabel>
              {[["Date",fmtDateLng(selDate)],["Bay",`Bay ${selBay}`],["Start",sorted[0]],["End",slotEnd(sorted[sorted.length-1])],["Duration",totalDur(sorted)]].map(([k,v])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 0",borderBottom:`1px solid ${C.border}`,fontSize:14}}>
                  <span style={{color:C.textSub,fontSize:11,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>{k}</span>
                  <span style={{color:k==="Start"||k==="End"?C.lime:C.white,fontWeight:700,textAlign:"right",maxWidth:"60%"}}>{v}</span>
                </div>
              ))}
            </Card>
            <Card style={{marginBottom:20}}>
              <SectionLabel>Your Details</SectionLabel>
              {[["Name",user?.name],["Nickname",user?.nick||"—"],["Email",user?.email],["Phone",user?.phone||"—"]].map(([k,v])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${C.border}`,fontSize:13}}>
                  <span style={{color:C.textSub,fontSize:11,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>{k}</span>
                  <span style={{color:C.white,fontWeight:600}}>{v}</span>
                </div>
              ))}
            </Card>
            <Btn full v="primary" sz="lg" onClick={doConfirm} disabled={busy}>{busy?"Confirming…":"Confirm Booking"}</Btn>
          </div>
        </div>
      );
    }

    // CONFIRMED
    if(tab==="confirmed") {
      const sorted=lastBkg?[...lastBkg.slots].sort((a,b)=>slotIdx(a)-slotIdx(b)):[];
      return (
        <div style={{minHeight:"100vh",background:C.bg}}>
          <style>{CSS}</style><Toast toast={toast}/>
          <div style={{maxWidth:460,margin:"0 auto",padding:"40px 16px 20px",animation:"fadeUp .4s ease"}}>
            <div style={{textAlign:"center",padding:"20px 0 28px"}}>
              <div style={{width:80,height:80,borderRadius:"50%",background:C.limeDim,border:`2px solid ${C.lime}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:34,margin:"0 auto 18px",boxShadow:C.limeGlow,animation:"glowPulse 2s infinite"}}>✓</div>
              <div style={{fontSize:26,fontWeight:900,color:C.white,letterSpacing:"-0.02em"}}>Booking Confirmed</div>
              <div style={{color:C.textSub,fontSize:13,marginTop:6}}>See you on the course.</div>
            </div>
            {lastBkg&&(
              <Card glow style={{marginBottom:20}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                  <div style={{fontSize:9,fontWeight:700,color:C.lime,textTransform:"uppercase",letterSpacing:"0.15em"}}>Booking Receipt</div>
                  <Tag color={C.lime}>Confirmed</Tag>
                </div>
                {[["Bay",`Bay ${lastBkg.bay}`],["Date",fmtDateLng(lastBkg.date)],["Start",sorted[0]],["End",sorted.length>0?slotEnd(sorted[sorted.length-1]):"—"],["Duration",totalDur(lastBkg.slots)],["Ref","#"+lastBkg.id?.slice(-8).toUpperCase()]].map(([k,v])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${C.border}`,fontSize:13}}>
                    <span style={{color:C.textSub,fontSize:10,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>{k}</span>
                    <span style={{color:k==="Bay"?C.lime:k==="Ref"?C.gold:C.white,fontWeight:700}}>{v}</span>
                  </div>
                ))}
              </Card>
            )}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <Btn full v="ghost" onClick={()=>{setNewBkg(false);setTabView("mybookings");}}>My Bookings</Btn>
              <Btn full v="primary" onClick={()=>{setSelBay(null);setSelSlots([]);setTabView("home");}}>Book Another</Btn>
            </div>
          </div>
          <NavBar active="mybookings" onTab={t=>{setNewBkg(false);setTabView(t);}} newBooking={newBkg}/>
        </div>
      );
    }

    // MY BOOKINGS
    if(tab==="mybookings") {
      const active=myBkgs.filter(b=>b.status==="confirmed"),cancelled=myBkgs.filter(b=>b.status==="cancelled");
      return (
        <div style={{minHeight:"100vh",background:C.bg}}>
          <style>{CSS}</style><Toast toast={toast}/>
          <Header subtitle="Your reservations"/>
          <div style={{maxWidth:500,margin:"0 auto",padding:"20px 16px",animation:"fadeUp .35s ease"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:22}}>
              <div><div style={{fontSize:10,color:C.lime,fontWeight:700,letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:4}}>Reservations</div><div style={{fontSize:22,fontWeight:800,color:C.white,letterSpacing:"-0.02em"}}>My Bookings</div><div style={{color:C.textMute,fontSize:12,marginTop:3}}>{active.length} active · {cancelled.length} cancelled</div></div>
              {active.length>0&&<Tag color={C.lime}>{active.length} Active</Tag>}
            </div>
            {myBkgs.length===0?(
              <div style={{textAlign:"center",padding:"60px 20px"}}>
                <div style={{fontSize:48,marginBottom:14,opacity:.3}}>📅</div>
                <div style={{fontSize:17,fontWeight:700,color:C.white}}>No bookings yet</div>
                <div style={{color:C.textMute,fontSize:13,marginTop:6,marginBottom:22}}>Reserve a bay to get started</div>
                <Btn v="primary" onClick={()=>setTabView("home")}>Book a Bay</Btn>
              </div>
            ):(
              <>
                {active.length>0&&(<>
                  <SectionLabel>Upcoming</SectionLabel>
                  {active.map(b=>{const s=b.slots?[...b.slots].sort((a,c)=>slotIdx(a)-slotIdx(c)):[];return(
                    <div key={b.id} className="card-hover" style={{background:C.card,borderRadius:14,padding:18,marginBottom:12,border:`1px solid ${C.border}`,transition:"all .2s"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                        <div><div style={{fontSize:22,fontWeight:900,color:C.lime,letterSpacing:"-0.02em"}}>Bay {b.bay}</div><div style={{color:C.textMute,fontSize:12,marginTop:2}}>{fmtDateLng(b.date)}</div></div>
                        <Tag color={C.lime}>Confirmed</Tag>
                      </div>
                      <div style={{background:C.surface2,borderRadius:10,padding:"10px 14px",marginBottom:14,border:`1px solid ${C.border}`}}>
                        <div style={{fontSize:18,fontWeight:800,color:C.white}}>{s[0]} – {s.length>0?slotEnd(s[s.length-1]):"—"}</div>
                        <div style={{fontSize:11,color:C.textMute,marginTop:3}}>{totalDur(b.slots||[])} · {b.slots?.length||0} slots</div>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div style={{fontSize:10,color:C.textMute,fontFamily:"monospace"}}>#{b.id?.slice(-8).toUpperCase()}</div>
                        <Btn v="danger" sz="sm" onClick={()=>doCancel(b.id)} disabled={busy}>Cancel</Btn>
                      </div>
                    </div>
                  );})}
                </>)}
                {cancelled.length>0&&(<>
                  <SectionLabel>Cancelled</SectionLabel>
                  {cancelled.map(b=>{const s=b.slots?[...b.slots].sort((a,c)=>slotIdx(a)-slotIdx(c)):[];return(
                    <div key={b.id} style={{background:C.surface,borderRadius:12,padding:14,marginBottom:8,border:`1px solid ${C.border}`,opacity:.4}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:14,fontWeight:700,color:C.white}}>Bay {b.bay} · {fmtDate(b.date)}</div><div style={{fontSize:12,color:C.textMute,marginTop:2}}>{s[0]} – {s.length>0?slotEnd(s[s.length-1]):"—"}</div></div><Tag color={C.textMute}>Cancelled</Tag></div>
                    </div>
                  );})}
                </>)}
                <div style={{paddingBottom:90}}/>
              </>
            )}
          </div>
          <NavBar active="mybookings" onTab={t=>{setNewBkg(false);setTabView(t);}} newBooking={newBkg}/>
        </div>
      );
    }

    // PROFILE
    if(tab==="profile") return (
      <div style={{minHeight:"100vh",background:C.bg}}>
        <style>{CSS}</style><Toast toast={toast}/>
        <Header subtitle="Your account"/>
        <div style={{maxWidth:460,margin:"0 auto",padding:"20px 16px",animation:"fadeUp .35s ease"}}>
          <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:22,background:C.surface,borderRadius:14,padding:20,border:`1px solid ${C.border}`}}>
            <div style={{width:56,height:56,borderRadius:14,background:C.limeDim,border:`1px solid ${C.borderMd}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:900,color:C.lime,flexShrink:0,boxShadow:C.limeGlowSm}}>
              {(user?.nick||user?.name||"?")[0].toUpperCase()}
            </div>
            <div>
              <div style={{fontSize:18,fontWeight:800,color:C.white}}>{user?.name}</div>
              <div style={{fontSize:12,color:C.lime,fontWeight:600,marginTop:2}}>{user?.nick||"No nickname"}</div>
              {user?.memberNo&&<div style={{fontSize:11,color:C.blue,fontWeight:700,marginTop:2}}>{user.memberNo}</div>}
              <div style={{fontSize:11,color:C.textMute,marginTop:3}}>{myBkgs.filter(b=>b.status==="confirmed").length} active booking{myBkgs.filter(b=>b.status==="confirmed").length!==1?"s":""}</div>
            </div>
          </div>
          <Card style={{marginBottom:16}}>
            <SectionLabel>Account Info</SectionLabel>
            {[["Email",user?.email],["Phone",user?.phone||"—"],["Address",user?.address||"—"]].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${C.border}`,fontSize:13}}>
                <span style={{color:C.textSub,fontSize:10,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>{k}</span>
                <span style={{color:C.white,fontWeight:600,maxWidth:"60%",textAlign:"right"}}>{v}</span>
              </div>
            ))}
          </Card>
          <div style={{paddingBottom:90}}><Btn full v="danger" sz="md" onClick={()=>doLogout("user")} disabled={busy}>Sign Out</Btn></div>
        </div>
        <NavBar active="profile" onTab={t=>{setNewBkg(false);setTabView(t);}} newBooking={newBkg}/>
      </div>
    );

    return null;
  }

  // ─── COUNTER ──────────────────────────────────────────
  if(view==="counter") {
    if(!isAdmin) return (
      <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
        <style>{CSS}</style>
        <div style={{fontSize:40,opacity:.3}}>🔒</div>
        <div style={{fontSize:18,fontWeight:800,color:C.white}}>Access Restricted</div>
        <Btn v="ghost" onClick={()=>{setIsAdmin(false);setView("login");}}>← Back to Login</Btn>
      </div>
    );

    const todayBkgs=bookings.filter(b=>b.date===ctrDate&&b.status==="confirmed").sort((a,b)=>{const sa=a.slots?.[0]||"",sb=b.slots?.[0]||"";return sa.localeCompare(sb)||a.bay-b.bay;});
    const allConfBkgs2=bookings.filter(b=>b.status==="confirmed"&&b.userId!=="admin");
    const todayAll2=bookings.filter(b=>b.date===DATES[0]&&b.status==="confirmed");
    const statsData2={members:{title:"All Members",items:filteredUsers,type:"users"},bookings:{title:"Total Bookings",items:allConfBkgs2,type:"bookings"},today:{title:"Active Today",items:todayAll2,type:"bookings"}};

    return (
      <div style={{minHeight:"100vh",background:C.bg,color:C.white}}>
        <style>{CSS}</style>
        <Toast toast={toast}/>
        <BookingModal show={bookModal.show} onClose={()=>setBookModal({show:false,bay:null,slots:[]})} bay={bookModal.bay} slots={bookModal.slots} date={ctrDate} regUsers={regUsers} onConfirm={doAdminBook} busy={busy}/>
        {ctxMenu&&<ContextMenu menu={ctxMenu} onClose={()=>setCtxMenu(null)} onCancel={()=>doCancel(ctxMenu.booking.id)} onViewInfo={()=>setInfoModal({show:true,booking:ctxMenu.booking})} onChangeTime={()=>setChangeModal({show:true,booking:ctxMenu.booking})}/>}
        <MemberInfoModal show={infoModal.show} onClose={()=>setInfoModal({show:false,booking:null})} booking={infoModal.booking} regUsers={regUsers}/>
        <EditMemberModal show={!!editMember} onClose={()=>setEditMember(null)} member={editMember} onSave={saveEditMember} busy={busy}/>
        <ChangeTimeModal show={changeModal.show} onClose={()=>setChangeModal({show:false,booking:null})} booking={changeModal.booking} onConfirm={doChangeTime} busy={busy}/>

        {/* Admin header */}
        <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"12px 20px",display:"flex",alignItems:"center",gap:14,position:"sticky",top:0,zIndex:100}}>
          <KGolfLogo size="sm"/>
          <div style={{display:"flex",gap:8}}>
            <div style={{display:"flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:20,background:C.limeDim,border:`1px solid ${C.borderMd}`}}>
              <div style={{width:5,height:5,borderRadius:"50%",background:C.lime,animation:"glowPulse 1.5s infinite"}}/>
              <span style={{fontSize:10,fontWeight:700,color:C.lime,letterSpacing:"0.1em"}}>LIVE</span>
            </div>
            <Tag color={C.gold}>Admin</Tag>
          </div>
          <div style={{flex:1}}/>
          <button onClick={()=>doLogout("admin")} style={{background:"transparent",border:`1px solid ${C.border}`,color:C.textSub,borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:11,fontWeight:600,letterSpacing:"0.05em"}}>Sign Out</button>
        </div>

        {/* Tab bar */}
        <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,display:"flex",padding:"0 20px"}}>
          {[["timetable","Timetable"],["users",`Members (${regUsers.length})`]].map(([id,label])=>(
            <button key={id} onClick={()=>{setCtrTab(id);setStatsFilter(null);}} style={{padding:"14px 20px",border:"none",background:"transparent",cursor:"pointer",fontWeight:700,fontSize:12,color:ctrTab===id?C.lime:C.textMute,borderBottom:ctrTab===id?`2px solid ${C.lime}`:"2px solid transparent",transition:"all .15s",letterSpacing:"0.08em",textTransform:"uppercase"}}>{label}</button>
          ))}
        </div>

        {/* TIMETABLE */}
        {ctrTab==="timetable"&&(<>
          <div style={{padding:"10px 20px",display:"flex",gap:8,overflowX:"auto",borderBottom:`1px solid ${C.border}`,background:C.surface}}>
            {DATES.slice(0,7).map((d,i)=>(
              <button key={d} onClick={()=>setCtrDate(d)} style={{flexShrink:0,padding:"7px 14px",borderRadius:8,background:d===ctrDate?C.lime:C.surface2,border:`1px solid ${d===ctrDate?C.lime:C.border}`,color:d===ctrDate?"#030803":C.white,cursor:"pointer",fontWeight:700,fontSize:11,letterSpacing:"0.05em",boxShadow:d===ctrDate?C.limeGlowSm:"none",transition:"all .15s"}}>
                {i===0?"Today":fmtDate(d)}
              </button>
            ))}
          </div>

          <div style={{padding:"18px 20px"}}>
            {/* Tip */}
            <div style={{background:C.surface2,borderRadius:10,padding:"10px 16px",marginBottom:16,border:`1px solid ${C.borderMd}`,display:"flex",alignItems:"center",gap:10}}>
              <div style={{color:C.lime,fontSize:16}}>↔</div>
              <div style={{fontSize:12,color:C.textSub}}><strong style={{color:C.white}}>Drag</strong> across slots to create a booking · <strong style={{color:C.white}}>Right-click</strong> any booking to edit or cancel</div>
            </div>

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div>
                <div style={{fontSize:10,color:C.lime,fontWeight:700,letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:3}}>Timetable</div>
                <div style={{fontSize:16,fontWeight:800,color:C.white}}>{fmtDate(ctrDate)} <span style={{fontSize:12,color:C.textMute,fontWeight:400}}>· {todayBkgs.length} bookings</span></div>
              </div>
              <div style={{display:"flex",gap:10,fontSize:10,color:C.textMute}}>
                {[["#1a3a1a",C.lime,"Counter"],["#1a2a3a","#4da8ff","App"]].map(([bg,col,lbl])=>(
                  <div key={lbl} style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:12,height:8,borderRadius:2,background:bg,border:`1px solid ${col}55`}}/>{lbl}</div>
                ))}
              </div>
            </div>

            <div style={{marginBottom:18}}>
              <DragGrid bookings={bookings} ctrDate={ctrDate} onBookSlots={(bay,slots)=>setBookModal({show:true,bay,slots})} onContextMenu={(e,bkg,bay,slot)=>setCtxMenu({x:e.clientX,y:e.clientY,booking:bkg,bay,slot})}/>
            </div>

            {/* Booking list */}
            <Card>
              <SectionLabel>Today's Bookings ({todayBkgs.length})</SectionLabel>
              {todayBkgs.length===0?<div style={{color:C.textMute,fontSize:13,textAlign:"center",padding:"20px 0"}}>No bookings for this date</div>
              :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:8}}>
                {todayBkgs.map(b=>{
                  const s=b.slots?[...b.slots].sort((a,c)=>slotIdx(a)-slotIdx(c)):[];
                  return <div key={b.id} onContextMenu={e=>{e.preventDefault();setCtxMenu({x:e.clientX,y:e.clientY,booking:b,bay:b.bay});}} style={{padding:"12px 14px",background:C.surface2,borderRadius:10,border:`1px solid ${b.adminCreated?C.lime+"33":"#4da8ff33"}`,cursor:"context-menu"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div>
                        <div style={{fontSize:12,fontWeight:800,color:b.adminCreated?C.lime:"#4da8ff"}}>Bay {b.bay} · {s[0]}–{s.length>0?slotEnd(s[s.length-1]):"?"}</div>
                        <div style={{fontSize:13,fontWeight:700,color:C.white,marginTop:3}}>{sanitize(b.userName)}</div>
                        <div style={{fontSize:10,color:C.textMute,marginTop:2}}>{totalDur(b.slots||[])} {b.userPhone!=="-"?`· ${b.userPhone}`:""}</div>
                      </div>
                      <div style={{fontSize:9,color:C.textMute,textAlign:"right",paddingTop:2}}>right-click</div>
                    </div>
                  </div>;
                })}
              </div>}
            </Card>
          </div>
        </>)}

        {/* MEMBERS */}
        {ctrTab==="users"&&(
          <div style={{padding:"18px 20px"}}>
            {/* Search */}
            <div style={{position:"relative",marginBottom:18}}>
              <input value={userSearch} onChange={e=>setUserSearch(sanitize(e.target.value,100))} placeholder="Search name, phone, email, member no…"
                style={{width:"100%",padding:"12px 16px 12px 44px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,fontSize:13,outline:"none",boxSizing:"border-box",fontFamily:"inherit",color:C.white}}/>
              <div style={{position:"absolute",left:15,top:"50%",transform:"translateY(-50%)",color:C.textMute,fontSize:15}}>🔍</div>
            </div>

            {/* Stats */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20}}>
              {[{key:"members",icon:"👥",label:"Members",val:regUsers.length,color:C.lime},{key:"bookings",icon:"📅",label:"Total Bookings",val:allConfBkgs.length,color:C.blue},{key:"today",icon:"●",label:"Active Today",val:todayAllBkgs.length,color:C.gold}].map(({key,icon,label,val,color})=>{
                const isAct=statsFilter===key;
                return <button key={key} className="stat-card" onClick={()=>setStatsFilter(isAct?null:key)} style={{background:isAct?color+"22":C.card,borderRadius:12,padding:"14px 10px",textAlign:"center",border:`1px solid ${isAct?color:C.border}`,boxShadow:isAct?`0 0 16px ${color}33`:"none",cursor:"pointer",transition:"all .2s",fontFamily:"inherit"}}>
                  <div style={{fontSize:20}}>{icon}</div>
                  <div style={{fontSize:24,fontWeight:900,color:isAct?color:C.white,marginTop:4}}>{val}</div>
                  <div style={{fontSize:9,color:isAct?color:C.textMute,marginTop:3,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em"}}>{label}</div>
                </button>;
              })}
            </div>

            {/* Stats filter panel */}
            {statsFilter&&(
              <div style={{background:C.surface,borderRadius:14,border:`1px solid ${statsFilter==="members"?C.lime:statsFilter==="bookings"?C.blue:C.gold}33`,marginBottom:18,overflow:"hidden",animation:"fadeUp .3s ease"}}>
                <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontWeight:800,fontSize:14,color:C.white}}>{statsData2[statsFilter].title}</div>
                  <div style={{fontSize:11,color:C.textMute}}>{statsData2[statsFilter].items.length} items</div>
                </div>
                {statsData2[statsFilter].type==="users"&&statsData2[statsFilter].items.map((u,idx,arr)=>{
                  const ub=bookings.filter(b=>b.userId===u.id&&b.status==="confirmed").length;
                  return <div key={u.id} className="user-row" style={{display:"flex",alignItems:"center",gap:12,padding:"11px 16px",borderBottom:idx<arr.length-1?`1px solid ${C.border}`:"none",transition:"background .15s"}}>
                    <div style={{width:36,height:36,borderRadius:10,background:C.limeDim,border:`1px solid ${C.borderMd}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:900,color:C.lime,flexShrink:0}}>{(u.nick||u.name||"?")[0].toUpperCase()}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}><span style={{fontWeight:700,fontSize:13,color:C.white}}>{sanitize(u.name)}</span>{u.memberNo&&<Tag color={C.blue}>{u.memberNo}</Tag>}{ub>0&&<Tag color={C.gold}>{ub} bkg</Tag>}</div>
                      <div style={{fontSize:11,color:C.textMute,marginTop:2}}>{u.email} {u.phone?`· ${sanitize(u.phone)}`:""}</div>
                    </div>
                    <button onClick={()=>doDeleteUser(u.id)} disabled={busy} style={{background:C.redDim,border:`1px solid ${C.red}44`,color:C.red,borderRadius:7,padding:"4px 9px",cursor:"pointer",fontSize:11,fontWeight:700,flexShrink:0}}>Del</button>
                  </div>;
                })}
                {statsData2[statsFilter].type==="bookings"&&statsData2[statsFilter].items.map((b,idx,arr)=>{
                  const s=b.slots?[...b.slots].sort((a,c)=>slotIdx(a)-slotIdx(c)):[];
                  return <div key={b.id} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 16px",borderBottom:idx<arr.length-1?`1px solid ${C.border}`:"none"}}>
                    <div style={{width:36,height:36,borderRadius:10,background:C.surface2,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:C.lime,flexShrink:0,border:`1px solid ${C.border}`}}>B{b.bay}</div>
                    <div style={{flex:1}}><div style={{fontWeight:700,fontSize:13,color:C.white}}>{sanitize(b.userName)}</div><div style={{fontSize:11,color:C.textMute,marginTop:2}}>{fmtDate(b.date)} · {s[0]}–{s.length>0?slotEnd(s[s.length-1]):"?"} · {totalDur(b.slots||[])}</div></div>
                    <button onClick={()=>doCancel(b.id)} disabled={busy} style={{background:C.redDim,border:`1px solid ${C.red}44`,color:C.red,borderRadius:7,padding:"4px 9px",cursor:"pointer",fontSize:11,fontWeight:700,flexShrink:0}}>Cancel</button>
                  </div>;
                })}
                {statsData2[statsFilter].items.length===0&&<div style={{padding:"28px 20px",textAlign:"center",color:C.textMute,fontSize:13}}>No data found</div>}
              </div>
            )}

            {/* Member list */}
            <SectionLabel>All Members ({filteredUsers.length})</SectionLabel>
            <div style={{background:C.surface,borderRadius:14,border:`1px solid ${C.border}`,overflow:"hidden"}}>
              {filteredUsers.length===0?<div style={{padding:"40px 20px",textAlign:"center",color:C.textMute}}>No members found</div>
              :filteredUsers.map((u,idx)=>{
                const ub=bookings.filter(b=>b.userId===u.id&&b.status==="confirmed").length;
                return (
                  <div key={u.id} className="user-row" style={{display:"flex",alignItems:"center",gap:14,padding:"14px 18px",borderBottom:idx<filteredUsers.length-1?`1px solid ${C.border}`:"none",transition:"background .15s"}}>
                    {/* Avatar */}
                    <div style={{width:44,height:44,borderRadius:12,background:u.walkin?C.goldDim:C.limeDim,border:`1px solid ${u.walkin?C.gold:C.borderMd}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,fontWeight:900,color:u.walkin?C.gold:C.lime,flexShrink:0}}>
                      {(u.nick||u.name||"?")[0].toUpperCase()}
                    </div>
                    {/* Info */}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap",marginBottom:4}}>
                        <span style={{fontWeight:800,fontSize:14,color:C.white}}>{sanitize(u.name)}</span>
                        <Tag color={C.blue}>{u.memberNo||"No #"}</Tag>
                        {u.walkin&&<Tag color={C.gold}>Walk-in</Tag>}
                        {u.nick&&<Tag color={C.lime}>{sanitize(u.nick)}</Tag>}
                        {ub>0&&<Tag color={C.gold}>{ub} booking{ub>1?"s":""}</Tag>}
                      </div>
                      <div style={{fontSize:11,color:C.textMute}}>{u.email||<span style={{color:C.textMute,fontStyle:"italic"}}>no email</span>}</div>
                      <div style={{fontSize:11,color:C.textMute,marginTop:1}}>
                        {u.phone&&<span>{sanitize(u.phone)}</span>}
                        {u.address&&<span style={{marginLeft:8}}>· {sanitize(u.address)}</span>}
                      </div>
                    </div>
                    {/* Actions */}
                    <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
                      <button onClick={()=>setEditMember(u)} style={{background:C.limeDim,border:`1px solid ${C.borderMd}`,color:C.lime,borderRadius:7,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>Edit</button>
                      <button onClick={()=>doDeleteUser(u.id)} disabled={busy} style={{background:C.redDim,border:`1px solid ${C.red}44`,color:C.red,borderRadius:7,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:700}}>Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
