import { useState, useEffect, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, onSnapshot, getDoc } from "firebase/firestore";

// ════════════════════════════════════════════════════
//  🔥 FIREBASE CONFIG — 아래 값을 본인 것으로 교체하세요
// ════════════════════════════════════════════════════
// Import the functions you need from the SDKs you need
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDBRCKA-yd7oUr19_UiIP6TTlObJ52DQ08",
  authDomain: "kgolf-booking-b909e.firebaseapp.com",
  projectId: "kgolf-booking-b909e",
  storageBucket: "kgolf-booking-b909e.firebasestorage.app",
  messagingSenderId: "165994639150",
  appId: "1:165994639150:web:7285f0502f3639185654bf"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
// ── Constants ──────────────────────────────────────
const NUM_BAYS = 11;
const OPEN_H = 9, CLOSE_H = 23;
const HOURS = Array.from({ length: CLOSE_H - OPEN_H }, (_, i) => i + OPEN_H);

const fmt = (h) => `${String(h).padStart(2, "0")}:00`;
const fmtDate = (d) => d ? new Date(d + "T12:00").toLocaleDateString("en-NZ", { weekday: "short", month: "short", day: "numeric" }) : "";
const fmtDateLong = (d) => d ? new Date(d + "T12:00").toLocaleDateString("en-NZ", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : "";
const getDates = (n = 14) => Array.from({ length: n }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d.toISOString().split("T")[0]; });
const DATES = getDates();
const isConsecutive = (hours) => {
  if (hours.length <= 1) return true;
  const s = [...hours].sort((a, b) => a - b);
  for (let i = 1; i < s.length; i++) if (s[i] !== s[i - 1] + 1) return false;
  return true;
};
// 이름 첫글자만 표시 (프라이버시)
const displayName = (b) => {
  const n = b.userNick || b.userName || "";
  return n.length > 6 ? n.slice(0, 6) + "…" : n;
};

// ── Colour palette ─────────────────────────────────
const C = {
  bg: "#f2f7f4", white: "#ffffff",
  green: "#1b8a3d", greenDark: "#156b2f", greenLight: "#27b550",
  greenPale: "#e8f5ed", greenPale2: "#d0ebd8",
  gold: "#e09820",
  text: "#101f15", textMid: "#3a5040", muted: "#7a9880",
  border: "#d5e5db", borderMed: "#b8d4bf",
  red: "#d42b20", redPale: "#fde8e6",
  shadow: "0 2px 12px rgba(27,138,61,0.07)",
  shadowMd: "0 4px 24px rgba(27,138,61,0.11)",
  shadowLg: "0 8px 40px rgba(27,138,61,0.14)",
};

// ── KGolf SVG Logo ─────────────────────────────────
function KGolfLogo({ h = 28 }) {
  const s = h / 36;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: Math.round(8 * s) }}>
      <div style={{ width: Math.round(34 * s), height: Math.round(34 * s), borderRadius: Math.round(8 * s), background: `linear-gradient(135deg,${C.green},${C.greenLight})`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 12px rgba(27,138,61,.35)", flexShrink: 0 }}>
        <svg width={Math.round(20 * s)} height={Math.round(20 * s)} viewBox="0 0 20 20" fill="none">
          <path d="M2 3h3v6l5-6h4l-5 6 5 8h-4l-3-5v5H2V3z" fill="white" />
        </svg>
      </div>
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
        <span style={{ fontSize: Math.round(18 * s), fontWeight: 900, color: C.green, letterSpacing: "0.06em", fontFamily: "'Georgia','Times New Roman',serif" }}>KGOLF</span>
        <span style={{ fontSize: Math.round(7 * s), color: C.muted, letterSpacing: "0.14em", fontWeight: 700, textTransform: "uppercase", marginTop: 1 }}>Screen Golf NZ</span>
      </div>
    </div>
  );
}

// ── Toast ──────────────────────────────────────────
function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{ position: "fixed", top: 18, left: "50%", transform: "translateX(-50%)", zIndex: 9999, padding: "13px 22px", borderRadius: 14, background: toast.type === "err" ? C.red : C.green, color: "#fff", fontWeight: 700, fontSize: 13.5, boxShadow: "0 10px 36px rgba(0,0,0,0.18)", maxWidth: "88vw", textAlign: "center", animation: "toastIn .3s cubic-bezier(.34,1.56,.64,1)", whiteSpace: "pre-line", lineHeight: 1.5 }}>{toast.msg}</div>
  );
}

// ── Modal ──────────────────────────────────────────
function Modal({ show, onClose, title, children }) {
  if (!show) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 8000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: C.white, borderRadius: 20, padding: 24, width: "100%", maxWidth: 420, boxShadow: C.shadowLg, animation: "fadeUp .3s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{title}</div>
          <button onClick={onClose} style={{ background: C.bg, border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 16, color: C.muted }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Input ──────────────────────────────────────────
function Inp({ label, value, onChange, type = "text", placeholder = "", req }) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ marginBottom: 15 }}>
      {label && <div style={{ color: C.textMid, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: 5 }}>{label}{req && <span style={{ color: C.red }}> *</span>}</div>}
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{ width: "100%", padding: "12px 14px", background: focus ? "#f0fbf4" : C.white, border: `1.5px solid ${focus ? C.green : C.border}`, borderRadius: 10, color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box", transition: "all .18s", boxShadow: focus ? `0 0 0 3px ${C.greenPale}` : "none", fontFamily: "inherit" }} />
    </div>
  );
}

// ── Button ─────────────────────────────────────────
function Btn({ children, onClick, v = "primary", sz = "md", full, disabled }) {
  const [hov, setHov] = useState(false);
  const styles = {
    primary: { bg: hov ? C.greenLight : C.green, color: "#fff", border: "none", shadow: "0 4px 16px rgba(27,138,61,.28)" },
    ghost:   { bg: hov ? C.greenPale : C.white, color: C.green, border: `1.5px solid ${C.border}`, shadow: "none" },
    danger:  { bg: hov ? "#b5211a" : C.red, color: "#fff", border: "none", shadow: "none" },
    outline: { bg: "transparent", color: C.muted, border: `1.5px solid ${C.border}`, shadow: "none" },
    gold:    { bg: hov ? "#c8860e" : C.gold, color: "#fff", border: "none", shadow: "0 4px 16px rgba(224,152,32,.28)" },
  };
  const szs = { sm: { p: "6px 13px", fs: 12 }, md: { p: "11px 22px", fs: 14 }, lg: { p: "14px 28px", fs: 15 } };
  const st = styles[v], z = szs[sz];
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background: st.bg, color: st.color, border: st.border || "none", padding: z.p, fontSize: z.fs, width: full ? "100%" : undefined, borderRadius: 10, cursor: disabled ? "not-allowed" : "pointer", fontWeight: 700, opacity: disabled ? 0.5 : 1, fontFamily: "inherit", transition: "all .15s", transform: hov && !disabled ? "translateY(-1px)" : "none", boxShadow: disabled ? "none" : st.shadow }}>{children}</button>
  );
}

// ── Tag ────────────────────────────────────────────
function Tag({ children, color, bg }) {
  return <span style={{ padding: "4px 11px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: bg || (color + "18"), color: color || C.green, letterSpacing: "0.03em" }}>{children}</span>;
}

// ── Bottom Nav ─────────────────────────────────────
function NavBar({ active, onTab, newBooking }) {
  const tabs = [
    { id: "home", icon: "⛳", label: "Book" },
    { id: "mybookings", icon: "📅", label: "My Bookings", badge: newBooking },
    { id: "profile", icon: "👤", label: "Profile" },
  ];
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: C.white, borderTop: `1px solid ${C.border}`, display: "flex", zIndex: 200, boxShadow: "0 -4px 20px rgba(0,0,0,0.06)" }}>
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onTab(t.id)} style={{ flex: 1, padding: "10px 0 12px", border: "none", background: "transparent", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, fontFamily: "inherit", position: "relative" }}>
          <span style={{ fontSize: 21, lineHeight: 1 }}>{t.icon}</span>
          {t.badge && <div style={{ position: "absolute", top: 8, right: "28%", width: 8, height: 8, borderRadius: "50%", background: C.red, border: "1.5px solid white" }} />}
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", color: active === t.id ? C.green : C.muted, textTransform: "uppercase" }}>{t.label}</span>
          {active === t.id && <div style={{ width: 22, height: 2.5, borderRadius: 2, background: C.green }} />}
        </button>
      ))}
    </div>
  );
}

// ── Header ─────────────────────────────────────────
function Header({ onBack, subtitle }) {
  return (
    <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: "11px 16px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 100, boxShadow: C.shadow }}>
      {onBack && <button onClick={onBack} style={{ background: C.greenPale, border: "none", color: C.green, cursor: "pointer", borderRadius: 8, width: 34, height: 34, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>←</button>}
      <div style={{ flex: 1 }}>
        <KGolfLogo h={26} />
        {subtitle && <div style={{ fontSize: 10.5, color: C.muted, marginTop: 1, paddingLeft: 42 }}>{subtitle}</div>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
//  MAIN APP
// ══════════════════════════════════════════════════
export default function KGolfApp() {
  const [view, setView] = useState("login");
  const [isAdmin, setIsAdmin] = useState(false);
  const [tabView, setTabView] = useState("home");
  const [ctrTab, setCtrTab] = useState("timetable"); // timetable | users
  const [user, setUser] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [regUsers, setRegUsers] = useState([]);
  const [toast, setToast] = useState(null);
  const [newBkg, setNewBkg] = useState(false);
  const [loading, setLoading] = useState(true);

  const [selDate, setSelDate] = useState(DATES[0]);
  const [selBay, setSelBay] = useState(null);
  const [selHours, setSelHours] = useState([]);
  const [lastBkg, setLastBkg] = useState(null);

  const [ctrDate, setCtrDate] = useState(DATES[0]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [af, setAf] = useState({ name: "", phone: "", bay: "1", date: DATES[0], hour: "9" });
  const [lf, setLf] = useState({ email: "", pass: "" });
  const [rf, setRf] = useState({ name: "", nick: "", email: "", phone: "", address: "", pass: "" });

  // 비밀번호 찾기
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotStep, setForgotStep] = useState(1); // 1=이메일입력 2=새비번입력
  const [forgotNewPass, setForgotNewPass] = useState("");
  const [forgotUser, setForgotUser] = useState(null);

  // 유저 검색 (어드민)
  const [userSearch, setUserSearch] = useState("");

  const pop = (msg, type = "ok") => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000); };

  // ── Firebase 실시간 리스너 (최적화: 1회 로드 후 실시간) ──
  useEffect(() => {
    // 빠른 초기 로드를 위해 getDoc 먼저
    Promise.all([
      getDoc(doc(db, "kgolf", "bookings")),
      getDoc(doc(db, "kgolf", "users")),
    ]).then(([bSnap, uSnap]) => {
      if (bSnap.exists()) { try { setBookings(JSON.parse(bSnap.data().data || "[]")); } catch {} }
      if (uSnap.exists()) { try { setRegUsers(JSON.parse(uSnap.data().data || "[]")); } catch {} }
      setLoading(false);
    }).catch(() => setLoading(false));

    // 실시간 업데이트
    const unsubB = onSnapshot(doc(db, "kgolf", "bookings"), (snap) => {
      if (snap.exists()) { try { setBookings(JSON.parse(snap.data().data || "[]")); } catch {} }
    }, () => {});
    const unsubU = onSnapshot(doc(db, "kgolf", "users"), (snap) => {
      if (snap.exists()) { try { setRegUsers(JSON.parse(snap.data().data || "[]")); } catch {} }
    }, () => {});
    return () => { unsubB(); unsubU(); };
  }, []);

  const saveBkgs = useCallback(async (b) => {
    setBookings(b);
    try { await setDoc(doc(db, "kgolf", "bookings"), { data: JSON.stringify(b) }); } catch (e) { console.error(e); }
  }, []);
  const saveUsrs = useCallback(async (u) => {
    setRegUsers(u);
    try { await setDoc(doc(db, "kgolf", "users"), { data: JSON.stringify(u) }); } catch (e) { console.error(e); }
  }, []);

  // ── Slot helpers ──
  const isTaken = (date, bay, hour) => bookings.some((b) => b.date === date && b.bay === bay && b.hours?.includes(hour) && b.status === "confirmed");
  const getSlotBkg = (date, bay, hour) => bookings.find((b) => b.date === date && b.bay === bay && b.hours?.includes(hour) && b.status === "confirmed");
  const bayFreeSlots = (date, bay) => {
    const booked = new Set();
    bookings.filter((b) => b.date === date && b.bay === bay && b.status === "confirmed").forEach((b) => b.hours?.forEach((h) => booked.add(h)));
    return HOURS.length - booked.size;
  };
  const toggleHour = (h) => {
    if (isTaken(selDate, selBay, h)) return;
    const next = selHours.includes(h) ? selHours.filter((x) => x !== h) : [...selHours, h];
    if (!isConsecutive(next)) { pop("Please select consecutive time slots only.", "err"); return; }
    setSelHours(next);
  };

  // ── Auth ──
  const doLogin = () => {
    if (lf.email === "admin@kgolf.nz" && lf.pass === "admin123") { setIsAdmin(true); setView("counter"); return; }
    if (lf.email === "admin@kgolf.nz") { pop("Invalid password.", "err"); return; }
    const u = regUsers.find((u) => u.email === lf.email && u.pass === lf.pass);
    if (!u) { pop("Incorrect email or password.", "err"); return; }
    setUser(u); setIsAdmin(false); setTabView("home"); setView("app");
    pop(`Welcome back, ${u.nick || u.name}! 🏌️`);
  };

  const doRegister = async () => {
    if (!rf.name || !rf.email || !rf.pass) { pop("Please fill in all required fields.", "err"); return; }
    if (regUsers.find((u) => u.email === rf.email)) { pop("Email already registered.", "err"); return; }
    const nu = { id: Date.now().toString(), ...rf };
    await saveUsrs([...regUsers, nu]);
    setUser(nu); setIsAdmin(false); setTabView("home"); setView("app");
    pop(`Welcome to KGolf, ${rf.nick || rf.name}! 🎉`);
  };

  // ── 비밀번호 찾기 ──
  const doForgotStep1 = () => {
    const u = regUsers.find((u) => u.email === forgotEmail);
    if (!u) { pop("Email not found.", "err"); return; }
    setForgotUser(u);
    setForgotStep(2);
  };
  const doForgotStep2 = async () => {
    if (!forgotNewPass || forgotNewPass.length < 6) { pop("Password must be at least 6 characters.", "err"); return; }
    const updated = regUsers.map((u) => u.id === forgotUser.id ? { ...u, pass: forgotNewPass } : u);
    await saveUsrs(updated);
    pop("Password updated! Please sign in. ✅");
    setShowForgot(false);
    setForgotEmail(""); setForgotNewPass(""); setForgotStep(1); setForgotUser(null);
  };

  const doConfirm = async () => {
    for (const h of selHours) {
      if (isTaken(selDate, selBay, h)) { pop("A slot was just taken.\nPlease re-select.", "err"); setTabView("home"); setSelHours([]); return; }
    }
    const sorted = [...selHours].sort((a, b) => a - b);
    const bkg = {
      id: Date.now().toString(), userId: user.id, userName: user.name,
      userNick: user.nick, userPhone: user.phone, userEmail: user.email,
      bay: selBay, date: selDate, hours: sorted,
      status: "confirmed", createdAt: new Date().toISOString(), adminCreated: false,
    };
    await saveBkgs([...bookings, bkg]);
    setLastBkg(bkg); setNewBkg(true); setTabView("confirmed");
    pop(`✅ Bay ${selBay} booked for ${sorted.length} hour${sorted.length > 1 ? "s" : ""}!`);
  };

  const doCancel = async (id) => {
    const upd = bookings.map((b) => b.id === id ? { ...b, status: "cancelled" } : b);
    await saveBkgs(upd); pop("Booking cancelled.");
  };

  const doAdminAdd = async () => {
    const bay = parseInt(af.bay), hour = parseInt(af.hour);
    if (!af.name) { pop("Please enter customer name.", "err"); return; }
    if (isTaken(af.date, bay, hour)) { pop("That slot is already booked!", "err"); return; }
    const bkg = {
      id: Date.now().toString(), userId: "admin", userName: af.name,
      userNick: af.name, userPhone: af.phone || "-", userEmail: "",
      bay, date: af.date, hours: [hour],
      status: "confirmed", adminCreated: true, createdAt: new Date().toISOString(),
    };
    await saveBkgs([...bookings, bkg]);
    setAf((p) => ({ ...p, name: "", phone: "" }));
    setShowAddForm(false); pop(`Bay ${bay} · ${fmt(hour)} booked!`);
  };

  // 어드민 유저 삭제
  const doDeleteUser = async (uid) => {
    if (!window.confirm("Delete this user?")) return;
    const updated = regUsers.filter((u) => u.id !== uid);
    await saveUsrs(updated); pop("User deleted.");
  };

  const myBkgs = user ? bookings.filter((b) => b.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];

  const CSS = `
    *{box-sizing:border-box;margin:0;padding:0;}
    body{background:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;}
    input,select,button{font-family:inherit;}
    input::placeholder{color:${C.muted};}
    ::-webkit-scrollbar{width:4px;height:4px;}
    ::-webkit-scrollbar-thumb{background:${C.borderMed};border-radius:2px;}
    @keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(-14px) scale(.92);}to{opacity:1;transform:translateX(-50%) translateY(0) scale(1);}}
    @keyframes fadeUp{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}
    @keyframes spin{to{transform:rotate(360deg);}}
    @keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(27,138,61,.3);}50%{box-shadow:0 0 0 7px rgba(27,138,61,0);}}
    .bay-card:hover:not(:disabled){transform:translateY(-3px)!important;box-shadow:0 8px 26px rgba(27,138,61,.14)!important;}
    .slot-free:hover{border-color:${C.green}!important;background:${C.greenPale}!important;}
    .date-btn:hover{border-color:${C.green}!important;}
    .bkg-card:hover{box-shadow:0 4px 18px rgba(27,138,61,.11)!important;}
    .grid-cell-booked:hover{opacity:.7!important;cursor:pointer!important;}
    .user-row:hover{background:#f5fbf7!important;}
  `;

  // ── 비밀번호 찾기 모달 ──
  const ForgotModal = (
    <Modal show={showForgot} onClose={() => { setShowForgot(false); setForgotStep(1); setForgotEmail(""); setForgotNewPass(""); }} title="🔑 Reset Password">
      {forgotStep === 1 ? (
        <>
          <p style={{ color: C.muted, fontSize: 13, marginBottom: 18 }}>Enter your registered email address.</p>
          <Inp label="Email" value={forgotEmail} onChange={setForgotEmail} type="email" placeholder="your@email.com" />
          <Btn full v="primary" onClick={doForgotStep1}>Find Account →</Btn>
        </>
      ) : (
        <>
          <div style={{ background: C.greenPale, borderRadius: 10, padding: "12px 14px", marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: C.muted }}>Account found</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.green }}>{forgotUser?.name}</div>
          </div>
          <Inp label="New Password" value={forgotNewPass} onChange={setForgotNewPass} type="password" placeholder="Minimum 6 characters" />
          <Btn full v="primary" onClick={doForgotStep2}>Update Password ✅</Btn>
        </>
      )}
    </Modal>
  );

  // ── Loading splash ──
  if (loading) return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(155deg,#e5f5ea 0%,#f2f7f4 45%,#fff9ee 100%)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
      <style>{CSS}</style>
      <KGolfLogo h={44} />
      <div style={{ width: 28, height: 28, border: `3px solid ${C.greenPale2}`, borderTop: `3px solid ${C.green}`, borderRadius: "50%", animation: "spin .8s linear infinite" }} />
      <div style={{ color: C.muted, fontSize: 12 }}>Loading...</div>
    </div>
  );

  // ══════════════════════
  // LOGIN
  // ══════════════════════
  if (view === "login") return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(155deg,#e5f5ea 0%,#f2f7f4 45%,#fff9ee 100%)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <style>{CSS}</style>
      <Toast toast={toast} />
      {ForgotModal}
      <div style={{ textAlign: "center", marginBottom: 36, animation: "fadeUp .5s ease" }}>
        <div style={{ marginBottom: 14 }}><KGolfLogo h={40} /></div>
        <div style={{ color: C.muted, fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>Indoor Screen Golf · New Zealand</div>
        <div style={{ marginTop: 7, color: C.textMid, fontSize: 13.5 }}>Book a bay · Play your best round</div>
      </div>
      <div style={{ width: "100%", maxWidth: 390, background: C.white, borderRadius: 22, padding: 28, border: `1px solid ${C.border}`, boxShadow: C.shadowLg, animation: "fadeUp .55s ease" }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 22 }}>Sign In</div>
        <Inp label="Email" value={lf.email} onChange={(v) => setLf((p) => ({ ...p, email: v }))} type="email" placeholder="your@email.com" />
        <Inp label="Password" value={lf.pass} onChange={(v) => setLf((p) => ({ ...p, pass: v }))} type="password" placeholder="••••••••" />
        {/* 비밀번호 찾기 링크 */}
        <div style={{ textAlign: "right", marginTop: -8, marginBottom: 16 }}>
          <button onClick={() => { setShowForgot(true); setForgotStep(1); }} style={{ background: "none", border: "none", color: C.green, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
            Forgot password?
          </button>
        </div>
        <div style={{ marginBottom: 12 }}><Btn full v="primary" sz="lg" onClick={doLogin}>Sign In</Btn></div>
        <Btn full v="ghost" onClick={() => setView("register")}>Create Account</Btn>
        <div style={{ marginTop: 16, padding: "12px 14px", background: "#fffbf0", borderRadius: 10, fontSize: 11.5, color: "#7a6020", border: `1px solid #f0d080` }}>
          🔑 Staff? Sign in with your admin credentials
        </div>
      </div>
    </div>
  );

  // ══════════════════════
  // REGISTER
  // ══════════════════════
  if (view === "register") return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text }}>
      <style>{CSS}</style>
      <Toast toast={toast} />
      <Header onBack={() => setView("login")} subtitle="Create your account" />
      <div style={{ maxWidth: 440, margin: "0 auto", padding: "22px 16px 80px", animation: "fadeUp .4s ease" }}>
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 23, fontWeight: 800 }}>Join KGolf</div>
          <div style={{ color: C.muted, fontSize: 13.5, marginTop: 4 }}>Fill in your details to get started</div>
        </div>
        <div style={{ background: C.white, borderRadius: 18, padding: 22, border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
          <Inp req label="Full Name" value={rf.name} onChange={(v) => setRf((p) => ({ ...p, name: v }))} placeholder="John Smith" />
          <Inp label="KGolf Nickname" value={rf.nick} onChange={(v) => setRf((p) => ({ ...p, nick: v }))} placeholder="@GolfKing (optional)" />
          <Inp req label="Email" value={rf.email} onChange={(v) => setRf((p) => ({ ...p, email: v }))} type="email" placeholder="john@example.com" />
          <Inp label="Phone" value={rf.phone} onChange={(v) => setRf((p) => ({ ...p, phone: v }))} placeholder="+64 21 xxx xxxx" />
          <Inp label="Address" value={rf.address} onChange={(v) => setRf((p) => ({ ...p, address: v }))} placeholder="Auckland, NZ" />
          <Inp req label="Password" value={rf.pass} onChange={(v) => setRf((p) => ({ ...p, pass: v }))} type="password" placeholder="Minimum 6 characters" />
        </div>
        <div style={{ marginTop: 16 }}><Btn full v="primary" sz="lg" onClick={doRegister}>Create Account →</Btn></div>
      </div>
    </div>
  );

  // ══════════════════════
  // APP SHELL
  // ══════════════════════
  if (view === "app") {
    const tab = tabView;

    // ── HOME ──
    if (tab === "home") return (
      <div style={{ minHeight: "100vh", background: C.bg }}>
        <style>{CSS}</style>
        <Toast toast={toast} />
        <Header subtitle="New Zealand" />
        <div style={{ maxWidth: 500, margin: "0 auto", padding: "16px 16px 0", animation: "fadeUp .35s ease" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 12.5, color: C.muted, fontWeight: 500 }}>Good to see you,</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>{user?.nick || user?.name} 👋</div>
            </div>
            <div style={{ width: 46, height: 46, borderRadius: 14, background: C.greenPale, border: `2px solid ${C.greenPale2}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🏌️</div>
          </div>
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 10.5, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, marginBottom: 10 }}>Select Date</div>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6 }}>
              {DATES.map((d, idx) => {
                const dt = new Date(d + "T12:00"), sel = d === selDate;
                return (
                  <button key={d} className="date-btn" onClick={() => { setSelDate(d); setSelHours([]); setSelBay(null); }} style={{ flexShrink: 0, padding: "10px 12px", borderRadius: 14, background: sel ? C.green : C.white, border: `1.5px solid ${sel ? C.green : C.border}`, color: sel ? "#fff" : C.text, cursor: "pointer", textAlign: "center", minWidth: 54, transition: "all .15s", boxShadow: sel ? "0 4px 14px rgba(27,138,61,.28)" : C.shadow }}>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", marginBottom: 2, opacity: .85 }}>{idx === 0 ? "Today" : dt.toLocaleDateString("en-NZ", { weekday: "short" })}</div>
                    <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1 }}>{dt.getDate()}</div>
                    <div style={{ fontSize: 9, marginTop: 2, opacity: .75 }}>{dt.toLocaleDateString("en-NZ", { month: "short" })}</div>
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 13 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: C.text }}>{fmtDate(selDate)} — Pick a Bay</div>
            <div style={{ display: "flex", gap: 10 }}>
              {[[C.greenLight, "Free"], [C.gold, "Busy"], [C.red, "Full"]].map(([c, l]) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: C.muted }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: c }} />{l}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, paddingBottom: 90 }}>
            {Array.from({ length: NUM_BAYS }, (_, i) => i + 1).map((bay) => {
              const free = bayFreeSlots(selDate, bay);
              const pct = ((HOURS.length - free) / HOURS.length) * 100;
              const full = free === 0;
              const barCol = pct > 75 ? C.red : pct > 40 ? C.gold : C.greenLight;
              return (
                <button key={bay} className="bay-card" onClick={() => { if (!full) { setSelBay(bay); setSelHours([]); setTabView("selectTime"); } }} disabled={full}
                  style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 16, padding: "18px 10px", cursor: full ? "not-allowed" : "pointer", textAlign: "center", transition: "all .18s", opacity: full ? .5 : 1, boxShadow: C.shadow }}>
                  <div style={{ fontSize: 9, color: C.muted, marginBottom: 2, letterSpacing: "0.13em", textTransform: "uppercase", fontWeight: 700 }}>BAY</div>
                  <div style={{ fontSize: 30, fontWeight: 900, color: C.green, lineHeight: 1 }}>{bay}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: full ? C.red : free < 4 ? C.gold : C.greenLight, marginTop: 6 }}>{full ? "Full" : `${free} free`}</div>
                  <div style={{ marginTop: 8, height: 3, background: C.border, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: barCol, borderRadius: 2, transition: "width .4s" }} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <NavBar active="home" onTab={(t) => { setNewBkg(false); setTabView(t); }} newBooking={newBkg} />
      </div>
    );

    // ── SELECT TIME ──
    if (tab === "selectTime") {
      const sorted = [...selHours].sort((a, b) => a - b);
      return (
        <div style={{ minHeight: "100vh", background: C.bg }}>
          <style>{CSS}</style>
          <Toast toast={toast} />
          <Header onBack={() => setTabView("home")} subtitle={`Bay ${selBay} · ${fmtDate(selDate)}`} />
          <div style={{ maxWidth: 500, margin: "0 auto", padding: "16px 16px 0", animation: "fadeUp .35s ease" }}>
            <div style={{ display: "flex", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
              {[[C.white, C.border, "Available"], [C.green, C.green, "Selected"], [C.bg, C.border, "Booked"]].map(([bg, bdr, l]) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.muted }}>
                  <div style={{ width: 16, height: 16, borderRadius: 5, background: bg, border: `1.5px solid ${bdr}` }} />{l}
                </div>
              ))}
              {selHours.length > 0 && <div style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: C.green }}>{selHours.length} hour{selHours.length > 1 ? "s" : ""} selected</div>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 20 }}>
              {HOURS.map((h) => {
                const taken = isTaken(selDate, selBay, h), sel = selHours.includes(h);
                const bkg = taken ? getSlotBkg(selDate, selBay, h) : null;
                return (
                  <button key={h} className={!taken && !sel ? "slot-free" : ""}
                    onClick={() => !taken && toggleHour(h)} disabled={taken}
                    style={{ padding: "14px 6px", borderRadius: 12, background: sel ? C.green : taken ? C.bg : C.white, border: `1.5px solid ${sel ? C.green : C.border}`, color: sel ? "#fff" : taken ? C.muted : C.text, cursor: taken ? "not-allowed" : "pointer", textAlign: "center", opacity: taken ? .5 : 1, transition: "all .12s", boxShadow: sel ? "0 4px 14px rgba(27,138,61,.25)" : taken ? "none" : C.shadow }}>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>{fmt(h)}</div>
                    {/* 예약자 이름만 표시 (개인정보 보호) */}
                    <div style={{ fontSize: 10, marginTop: 4, fontWeight: 600, color: sel ? "#ffffffcc" : C.muted }}>
                      {taken ? (bkg ? displayName(bkg) : "Booked") : sel ? "✓ Selected" : "Free"}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* All Bays Overview */}
            <div style={{ background: C.white, borderRadius: 16, padding: 14, border: `1px solid ${C.border}`, boxShadow: C.shadow, marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMid, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 10 }}>📊 All Bays — {fmtDate(selDate)}</div>
              <div style={{ display: "grid", gridTemplateColumns: "36px repeat(14,1fr)", gap: 2, marginBottom: 3 }}>
                <div />
                {HOURS.map(h => <div key={h} style={{ fontSize: 7, color: C.muted, textAlign: "center", fontWeight: 700 }}>{String(h).padStart(2, "0")}</div>)}
              </div>
              {Array.from({ length: NUM_BAYS }, (_, i) => i + 1).map(bay => (
                <div key={bay} style={{ display: "grid", gridTemplateColumns: "36px repeat(14,1fr)", gap: 2, marginBottom: 2 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", background: bay === selBay ? C.green : C.greenPale, borderRadius: 5, fontSize: 9, fontWeight: 800, color: bay === selBay ? "#fff" : C.green }}>B{bay}</div>
                  {HOURS.map(h => {
                    const taken = isTaken(selDate, bay, h);
                    const isMine = bay === selBay && selHours.includes(h);
                    const isThisBay = bay === selBay;
                    return (
                      <div key={h} style={{ height: 18, borderRadius: 3, background: isMine ? C.green : taken ? (isThisBay ? "#f5b8b2" : "#d0d8d4") : (isThisBay ? C.greenPale : "#f0f4f2"), border: `1px solid ${isMine ? C.green : taken ? (isThisBay ? "#e08080" : "#b8c4be") : (isThisBay ? C.greenPale2 : C.border)}`, opacity: isThisBay ? 1 : 0.7 }} />
                    );
                  })}
                </div>
              ))}
            </div>

            {selHours.length > 0 && (
              <div style={{ background: C.white, borderRadius: 18, padding: 18, border: `1.5px solid ${C.green}44`, boxShadow: C.shadowMd, marginBottom: 20, animation: "fadeUp .3s ease" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, animation: "pulse 1.5s infinite" }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.green, textTransform: "uppercase", letterSpacing: "0.07em" }}>Your Selection</span>
                </div>
                {[["Bay", `Bay ${selBay}`], ["Date", fmtDate(selDate)], ["Start", fmt(sorted[0])], ["End", fmt(sorted[sorted.length - 1] + 1)], ["Duration", `${selHours.length} hour${selHours.length > 1 ? "s" : ""}`]].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}`, fontSize: 14 }}>
                    <span style={{ color: C.muted }}>{k}</span>
                    <span style={{ color: k === "Duration" ? C.green : C.text, fontWeight: 700 }}>{v}</span>
                  </div>
                ))}
                <div style={{ marginTop: 16 }}><Btn full v="primary" sz="lg" onClick={() => setTabView("confirmView")}>Review Booking →</Btn></div>
              </div>
            )}
            <div style={{ paddingBottom: 80 }} />
          </div>
        </div>
      );
    }

    // ── CONFIRM VIEW ──
    if (tab === "confirmView") {
      const sorted = [...selHours].sort((a, b) => a - b);
      return (
        <div style={{ minHeight: "100vh", background: C.bg }}>
          <style>{CSS}</style>
          <Toast toast={toast} />
          <Header onBack={() => setTabView("selectTime")} subtitle="Review & Confirm" />
          <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px", animation: "fadeUp .35s ease" }}>
            <div style={{ background: C.white, borderRadius: 18, padding: 20, border: `1px solid ${C.border}`, boxShadow: C.shadow, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.09em", fontWeight: 700, marginBottom: 14 }}>Booking Details</div>
              {[["Date", fmtDateLong(selDate)], ["Bay", `Bay ${selBay}`], ["Time", `${fmt(sorted[0])} – ${fmt(sorted[sorted.length - 1] + 1)}`], ["Duration", `${selHours.length} hour${selHours.length > 1 ? "s" : ""}`]].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${C.border}`, fontSize: 14 }}>
                  <span style={{ color: C.muted }}>{k}</span>
                  <span style={{ color: k === "Time" ? C.green : C.text, fontWeight: 700, textAlign: "right", maxWidth: "60%" }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ background: C.white, borderRadius: 18, padding: 20, border: `1px solid ${C.border}`, boxShadow: C.shadow, marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.09em", fontWeight: 700, marginBottom: 14 }}>Your Details</div>
              {[["Name", user?.name], ["Nickname", user?.nick || "—"], ["Email", user?.email], ["Phone", user?.phone || "—"]].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${C.border}`, fontSize: 14 }}>
                  <span style={{ color: C.muted }}>{k}</span>
                  <span style={{ color: C.text, fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
            <Btn full v="primary" sz="lg" onClick={doConfirm}>✅ Confirm Booking</Btn>
          </div>
        </div>
      );
    }

    // ── CONFIRMED ──
    if (tab === "confirmed") {
      const sorted = lastBkg ? [...lastBkg.hours].sort((a, b) => a - b) : [];
      return (
        <div style={{ minHeight: "100vh", background: C.bg }}>
          <style>{CSS}</style>
          <Toast toast={toast} />
          <Header subtitle="Booking Confirmed" />
          <div style={{ maxWidth: 460, margin: "0 auto", padding: "20px 16px", animation: "fadeUp .4s ease" }}>
            <div style={{ textAlign: "center", padding: "24px 0 20px" }}>
              <div style={{ width: 80, height: 80, borderRadius: "50%", background: `linear-gradient(135deg,${C.greenPale2},${C.greenPale})`, border: `3px solid ${C.green}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, margin: "0 auto 16px", boxShadow: "0 6px 24px rgba(27,138,61,.2)" }}>✅</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: C.text }}>Booking Confirmed!</div>
              <div style={{ color: C.muted, fontSize: 14, marginTop: 5 }}>See you on the course. Have a great game!</div>
            </div>
            {lastBkg && (
              <div style={{ background: C.white, borderRadius: 20, padding: 22, border: `1.5px solid ${C.greenPale2}`, marginBottom: 20, boxShadow: C.shadowMd }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.green, textTransform: "uppercase", letterSpacing: "0.07em" }}>Booking Receipt</span>
                  <Tag color={C.green}>✓ Confirmed</Tag>
                </div>
                {[["Bay", `Bay ${lastBkg.bay}`], ["Date", fmtDateLong(lastBkg.date)], ["Time", `${fmt(sorted[0])} – ${fmt(sorted[sorted.length - 1] + 1)}`], ["Duration", `${lastBkg.hours.length} hour${lastBkg.hours.length > 1 ? "s" : ""}`], ["Booking Ref", "#" + lastBkg.id.slice(-8).toUpperCase()]].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${C.border}`, fontSize: 14 }}>
                    <span style={{ color: C.muted }}>{k}</span>
                    <span style={{ color: k === "Bay" ? C.green : k === "Booking Ref" ? C.gold : C.text, fontWeight: 700 }}>{v}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Btn full v="ghost" onClick={() => { setNewBkg(false); setTabView("mybookings"); }}>📅 My Bookings</Btn>
              <Btn full v="primary" onClick={() => { setSelBay(null); setSelHours([]); setTabView("home"); }}>Book Another</Btn>
            </div>
          </div>
          <NavBar active="mybookings" onTab={(t) => { setNewBkg(false); setTabView(t); }} newBooking={newBkg} />
        </div>
      );
    }

    // ── MY BOOKINGS ──
    if (tab === "mybookings") {
      const active = myBkgs.filter(b => b.status === "confirmed");
      const cancelled = myBkgs.filter(b => b.status === "cancelled");
      return (
        <div style={{ minHeight: "100vh", background: C.bg }}>
          <style>{CSS}</style>
          <Toast toast={toast} />
          <Header subtitle="Your reservations" />
          <div style={{ maxWidth: 500, margin: "0 auto", padding: "18px 16px", animation: "fadeUp .35s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>My Bookings</div>
                <div style={{ color: C.muted, fontSize: 13, marginTop: 3 }}>{active.length} active · {cancelled.length} cancelled</div>
              </div>
              {active.length > 0 && <Tag color={C.green}>{active.length} Active</Tag>}
            </div>
            {myBkgs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px" }}>
                <div style={{ fontSize: 54, marginBottom: 14 }}>📅</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.textMid }}>No bookings yet</div>
                <div style={{ color: C.muted, fontSize: 13.5, marginTop: 6, marginBottom: 20 }}>Head to Book tab to reserve a bay</div>
                <Btn v="primary" onClick={() => setTabView("home")}>Book a Bay ⛳</Btn>
              </div>
            ) : (
              <>
                {active.length > 0 && (
                  <>
                    <div style={{ fontSize: 10.5, color: C.muted, textTransform: "uppercase", letterSpacing: "0.09em", fontWeight: 700, marginBottom: 10 }}>Upcoming Reservations</div>
                    {active.map((b) => {
                      const s = [...b.hours].sort((a, c) => a - c);
                      return (
                        <div key={b.id} className="bkg-card" style={{ background: C.white, borderRadius: 16, padding: 18, marginBottom: 12, border: `1.5px solid ${C.greenPale2}`, boxShadow: C.shadow, transition: "box-shadow .2s" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                            <div>
                              <div style={{ fontSize: 21, fontWeight: 900, color: C.green }}>Bay {b.bay}</div>
                              <div style={{ color: C.muted, fontSize: 12.5, marginTop: 2 }}>{fmtDateLong(b.date)}</div>
                            </div>
                            <Tag color={C.green}>✓ Confirmed</Tag>
                          </div>
                          <div style={{ background: C.greenPale, borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
                            <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{fmt(s[0])} – {fmt(s[s.length - 1] + 1)}</div>
                            <div style={{ fontSize: 12, color: C.textMid, marginTop: 2 }}>{b.hours.length} hour{b.hours.length > 1 ? "s" : ""} · {s.map(fmt).join(", ")}</div>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ fontSize: 11, color: C.muted }}>Ref #{b.id.slice(-8).toUpperCase()}</div>
                            <Btn v="danger" sz="sm" onClick={() => doCancel(b.id)}>Cancel Booking</Btn>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
                {cancelled.length > 0 && (
                  <>
                    <div style={{ fontSize: 10.5, color: C.muted, textTransform: "uppercase", letterSpacing: "0.09em", fontWeight: 700, margin: "20px 0 10px" }}>Cancelled</div>
                    {cancelled.map((b) => {
                      const s = [...b.hours].sort((a, c) => a - c);
                      return (
                        <div key={b.id} style={{ background: C.white, borderRadius: 14, padding: 14, marginBottom: 8, border: `1px solid ${C.border}`, opacity: .55 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                              <div style={{ fontSize: 14.5, fontWeight: 700, color: C.textMid }}>Bay {b.bay} · {fmtDate(b.date)}</div>
                              <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{fmt(s[0])} – {fmt(s[s.length - 1] + 1)}</div>
                            </div>
                            <Tag color={C.muted}>Cancelled</Tag>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
                <div style={{ paddingBottom: 90 }} />
              </>
            )}
          </div>
          <NavBar active="mybookings" onTab={(t) => { setNewBkg(false); setTabView(t); }} newBooking={newBkg} />
        </div>
      );
    }

    // ── PROFILE ──
    if (tab === "profile") return (
      <div style={{ minHeight: "100vh", background: C.bg }}>
        <style>{CSS}</style>
        <Toast toast={toast} />
        <Header subtitle="Your account" />
        <div style={{ maxWidth: 460, margin: "0 auto", padding: "18px 16px", animation: "fadeUp .35s ease" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22, background: C.white, borderRadius: 18, padding: 20, border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
            <div style={{ width: 60, height: 60, borderRadius: 18, background: `linear-gradient(135deg,${C.green},${C.greenLight})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 900, color: "#fff", flexShrink: 0, boxShadow: "0 4px 16px rgba(27,138,61,.3)" }}>
              {(user?.nick || user?.name || "?")[0].toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 19, fontWeight: 800, color: C.text }}>{user?.name}</div>
              <div style={{ fontSize: 13.5, color: C.green, fontWeight: 600, marginTop: 2 }}>{user?.nick || "No nickname"}</div>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>{myBkgs.filter(b => b.status === "confirmed").length} active booking{myBkgs.filter(b => b.status === "confirmed").length !== 1 ? "s" : ""}</div>
            </div>
          </div>
          <div style={{ background: C.white, borderRadius: 18, padding: 20, border: `1px solid ${C.border}`, boxShadow: C.shadow, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.09em", fontWeight: 700, marginBottom: 14 }}>Account Info</div>
            {[["Email", user?.email], ["Phone", user?.phone || "—"], ["Address", user?.address || "—"]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", borderBottom: `1px solid ${C.border}`, fontSize: 14 }}>
                <span style={{ color: C.muted, fontWeight: 600 }}>{k}</span>
                <span style={{ color: C.text, fontWeight: 600, maxWidth: "60%", textAlign: "right" }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ paddingBottom: 90 }}>
            <Btn full v="danger" sz="md" onClick={() => { setUser(null); setView("login"); }}>Sign Out</Btn>
          </div>
        </div>
        <NavBar active="profile" onTab={(t) => { setNewBkg(false); setTabView(t); }} newBooking={newBkg} />
      </div>
    );

    return null;
  }

  // ══════════════════════
  // COUNTER (Admin only)
  // ══════════════════════
  if (view === "counter") {
    if (!isAdmin) return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <style>{CSS}</style>
        <div style={{ fontSize: 48 }}>🔒</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>Access Restricted</div>
        <Btn v="primary" onClick={() => { setIsAdmin(false); setView("login"); }}>← Back to Login</Btn>
      </div>
    );

    const todayBkgs = bookings.filter((b) => b.date === ctrDate && b.status === "confirmed").sort((a, b) => a.hours[0] - b.hours[0] || a.bay - b.bay);
    const filteredUsers = regUsers.filter(u =>
      u.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email?.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.nick?.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.phone?.includes(userSearch)
    );

    return (
      <div style={{ minHeight: "100vh", background: "#f0f6f2", color: C.text }}>
        <style>{CSS}</style>
        <Toast toast={toast} />

        {/* Admin Header */}
        <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: "11px 20px", display: "flex", alignItems: "center", gap: 14, boxShadow: C.shadow, position: "sticky", top: 0, zIndex: 100 }}>
          <KGolfLogo h={22} />
          <div style={{ display: "flex", gap: 8 }}>
            <Tag color={C.greenLight}>● LIVE</Tag>
            <Tag color={C.gold} bg={C.gold + "18"}>Admin</Tag>
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={() => { setIsAdmin(false); setView("login"); }} style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.textMid, borderRadius: 8, padding: "7px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>← Sign Out</button>
        </div>

        {/* Tab bar */}
        <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, display: "flex", padding: "0 20px" }}>
          {[["timetable", "📅 Timetable"], ["users", `👥 Members (${regUsers.length})`]].map(([id, label]) => (
            <button key={id} onClick={() => setCtrTab(id)} style={{ padding: "14px 20px", border: "none", background: "transparent", cursor: "pointer", fontWeight: 700, fontSize: 13, color: ctrTab === id ? C.green : C.muted, borderBottom: ctrTab === id ? `2.5px solid ${C.green}` : "2.5px solid transparent", transition: "all .15s" }}>{label}</button>
          ))}
        </div>

        {/* ── 타임테이블 탭 ── */}
        {ctrTab === "timetable" && (
          <>
            {/* Date tabs */}
            <div style={{ padding: "10px 20px", display: "flex", gap: 8, overflowX: "auto", borderBottom: `1px solid ${C.border}`, background: C.white }}>
              {DATES.slice(0, 7).map((d, i) => (
                <button key={d} onClick={() => setCtrDate(d)} style={{ flexShrink: 0, padding: "8px 16px", borderRadius: 10, background: d === ctrDate ? C.green : C.bg, border: `1.5px solid ${d === ctrDate ? C.green : C.border}`, color: d === ctrDate ? "#fff" : C.text, cursor: "pointer", fontWeight: 700, fontSize: 12, boxShadow: d === ctrDate ? "0 4px 14px rgba(27,138,61,.25)" : "none", transition: "all .15s" }}>{i === 0 ? "Today" : fmtDate(d)}</button>
              ))}
            </div>

            <div style={{ padding: "16px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Timetable — <span style={{ color: C.green }}>{fmtDate(ctrDate)}</span><span style={{ marginLeft: 10, fontSize: 12, color: C.muted }}>({todayBkgs.length} bookings)</span></div>
                <button onClick={() => setShowAddForm(p => !p)} style={{ background: showAddForm ? C.bg : C.green, border: `1.5px solid ${showAddForm ? C.border : C.green}`, borderRadius: 10, padding: "8px 16px", color: showAddForm ? C.textMid : "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: showAddForm ? "none" : "0 4px 14px rgba(27,138,61,.25)", transition: "all .15s" }}>{showAddForm ? "✕ Close" : "+ Add Booking"}</button>
              </div>

              {showAddForm && (
                <div style={{ background: C.white, borderRadius: 14, padding: 18, border: `1.5px solid ${C.greenPale2}`, marginBottom: 16, animation: "fadeUp .3s ease", boxShadow: C.shadow }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>+ Add Walk-in Booking</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10, marginBottom: 10 }}>
                    <Inp label="Customer Name *" value={af.name} onChange={(v) => setAf(p => ({ ...p, name: v }))} placeholder="John Smith" />
                    <Inp label="Phone" value={af.phone} onChange={(v) => setAf(p => ({ ...p, phone: v }))} placeholder="+64 21 xxx" />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                    {[["Date", "date", DATES.slice(0, 7).map((d, i) => ({ v: d, l: i === 0 ? "Today" : fmtDate(d) }))], ["Bay", "bay", Array.from({ length: NUM_BAYS }, (_, i) => ({ v: String(i + 1), l: `Bay ${i + 1}` }))], ["Time", "hour", HOURS.map(h => ({ v: String(h), l: fmt(h) }))]].map(([lbl, field, opts]) => (
                      <div key={field}>
                        <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, marginBottom: 6 }}>{lbl}</div>
                        <select value={af[field]} onChange={(e) => setAf(p => ({ ...p, [field]: e.target.value }))} style={{ width: "100%", padding: "10px", background: C.bg, border: `1.5px solid ${C.border}`, borderRadius: 9, color: C.text, fontSize: 13, outline: "none" }}>
                          {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 14 }}><Btn v="primary" sz="md" onClick={doAdminAdd}>Add Booking</Btn></div>
                </div>
              )}

              {/* Grid */}
              <div style={{ overflowX: "auto", borderRadius: 14, border: `1px solid ${C.border}`, background: C.white, boxShadow: C.shadow, marginBottom: 20 }}>
                <div style={{ minWidth: 820, padding: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "60px repeat(14,1fr)", gap: 2, marginBottom: 4 }}>
                    <div />
                    {HOURS.map(h => <div key={h} style={{ fontSize: 9, color: C.muted, textAlign: "center", padding: "3px 1px", fontWeight: 700 }}>{fmt(h)}</div>)}
                  </div>
                  {Array.from({ length: NUM_BAYS }, (_, i) => i + 1).map(bay => (
                    <div key={bay} style={{ display: "grid", gridTemplateColumns: "60px repeat(14,1fr)", gap: 2, marginBottom: 2 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", background: C.greenPale, borderRadius: 7, fontSize: 11, fontWeight: 800, color: C.green, padding: "6px 2px" }}>B{bay}</div>
                      {HOURS.map(h => {
                        const bkg = getSlotBkg(ctrDate, bay, h);
                        return (
                          <div key={h} className={bkg ? "grid-cell-booked" : ""} onClick={() => bkg && doCancel(bkg.id)}
                            title={bkg ? `${bkg.userName} · ${bkg.userPhone !== "-" ? bkg.userPhone : ""} · ${bkg.userEmail}\nClick to cancel` : ""}
                            style={{ minHeight: 42, borderRadius: 6, background: bkg ? (bkg.adminCreated ? "#d4f0df" : "#dbeeff") : C.bg, border: `1px solid ${bkg ? (bkg.adminCreated ? C.greenPale2 : "#b3d4ff") : C.border}`, cursor: bkg ? "pointer" : "default", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2px 1px", overflow: "hidden", transition: "opacity .15s" }}>
                            {bkg ? (
                              <>
                                {/* 어드민은 이름 전체 표시 */}
                                <div style={{ fontSize: 8, fontWeight: 700, color: bkg.adminCreated ? C.green : "#1a5fa8", textAlign: "center", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%", padding: "0 1px" }}>{bkg.userNick || bkg.userName}</div>
                                {bkg.adminCreated && <div style={{ fontSize: 7, color: C.green, marginTop: 1 }}>📋</div>}
                              </>
                            ) : <div style={{ width: 10, height: 1, background: C.border, opacity: .4 }} />}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {/* Legend */}
              <div style={{ display: "flex", gap: 18, marginBottom: 18, fontSize: 11, color: C.muted }}>
                {[["#dbeeff", "#b3d4ff", "#1a5fa8", "App Booking"], ["#d4f0df", C.greenPale2, C.green, "Counter Booking"]].map(([bg, bdr, col, label]) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 16, height: 11, borderRadius: 3, background: bg, border: `1px solid ${bdr}` }} />
                    <span style={{ color: col, fontWeight: 600 }}>{label}</span>
                  </div>
                ))}
                <span>· Hover for details · Click to cancel</span>
              </div>

              {/* Booking list */}
              <div style={{ background: C.white, borderRadius: 16, padding: 18, border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Booking List <span style={{ fontSize: 12, color: C.muted, fontWeight: 400 }}>({todayBkgs.length})</span></div>
                {todayBkgs.length === 0 ? (
                  <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "20px 0" }}>No bookings for this date</div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(252px,1fr))", gap: 8 }}>
                    {todayBkgs.map((b) => {
                      const s = [...b.hours].sort((a, c) => a - c);
                      return (
                        <div key={b.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", background: C.bg, borderRadius: 10, border: `1px solid ${C.border}` }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.green }}>Bay {b.bay} · {fmt(s[0])}–{fmt(s[s.length - 1] + 1)}</div>
                            {/* 어드민은 전체 정보 표시 */}
                            <div style={{ fontSize: 11, color: C.textMid, marginTop: 1, fontWeight: 600 }}>{b.userName} {b.userNick ? `(${b.userNick})` : ""}</div>
                            <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{b.userPhone !== "-" ? b.userPhone : ""} {b.userEmail ? `· ${b.userEmail}` : ""} {b.adminCreated ? "📋" : "📱"}</div>
                          </div>
                          <button onClick={() => doCancel(b.id)} style={{ background: "#fde8e6", border: `1px solid #f5b8b2`, color: C.red, borderRadius: 7, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>Cancel</button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── 회원 목록 탭 ── */}
        {ctrTab === "users" && (
          <div style={{ padding: "16px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                Members <span style={{ fontSize: 12, color: C.muted, fontWeight: 400 }}>({regUsers.length} registered)</span>
              </div>
            </div>

            {/* 검색 */}
            <div style={{ marginBottom: 16, position: "relative" }}>
              <input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="🔍  Search by name, email, phone..."
                style={{ width: "100%", padding: "12px 16px", background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, fontSize: 14, outline: "none", boxSizing: "border-box", boxShadow: C.shadow }}
              />
            </div>

            {/* 통계 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 20 }}>
              {[
                ["👥", "Total Members", regUsers.length],
                ["📅", "Total Bookings", bookings.filter(b => b.status === "confirmed" && b.userId !== "admin").length],
                ["✅", "Active Today", bookings.filter(b => b.date === DATES[0] && b.status === "confirmed").length],
              ].map(([icon, label, val]) => (
                <div key={label} style={{ background: C.white, borderRadius: 12, padding: "14px 12px", textAlign: "center", border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
                  <div style={{ fontSize: 22 }}>{icon}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: C.green, marginTop: 4 }}>{val}</div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* 유저 리스트 */}
            <div style={{ background: C.white, borderRadius: 16, border: `1px solid ${C.border}`, boxShadow: C.shadow, overflow: "hidden" }}>
              {filteredUsers.length === 0 ? (
                <div style={{ padding: "40px 20px", textAlign: "center", color: C.muted }}>No members found</div>
              ) : filteredUsers.map((u, idx) => {
                const userBkgs = bookings.filter(b => b.userId === u.id && b.status === "confirmed").length;
                return (
                  <div key={u.id} className="user-row" style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderBottom: idx < filteredUsers.length - 1 ? `1px solid ${C.border}` : "none", transition: "background .15s" }}>
                    {/* 아바타 */}
                    <div style={{ width: 42, height: 42, borderRadius: 13, background: `linear-gradient(135deg,${C.green},${C.greenLight})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900, color: "#fff", flexShrink: 0 }}>
                      {(u.nick || u.name || "?")[0].toUpperCase()}
                    </div>
                    {/* 정보 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{u.name}</span>
                        {u.nick && <Tag color={C.green}>{u.nick}</Tag>}
                        {userBkgs > 0 && <Tag color={C.gold} bg={C.gold + "18"}>{userBkgs} booking{userBkgs > 1 ? "s" : ""}</Tag>}
                      </div>
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{u.email}</div>
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>
                        {u.phone && <span>{u.phone}</span>}
                        {u.address && <span style={{ marginLeft: 8 }}>· {u.address}</span>}
                      </div>
                    </div>
                    {/* 액션 */}
                    <button onClick={() => doDeleteUser(u.id)} style={{ background: "#fde8e6", border: `1px solid #f5b8b2`, color: C.red, borderRadius: 7, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>Delete</button>
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
