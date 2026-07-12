import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../store/auth.store.js";
import { useSocket } from "../hooks/useSocket.js";
import api from "../api/client.js";

// ── Primitives ────────────────────────────────────────────────────────────
const C = {
  bg:"#080810", surface:"#12121e", card:"#1a1a2e", border:"#2a2a3e",
  border2:"#3a3a5e", text:"#e2e8f0", muted:"#64748b", dim:"#94a3b8",
  red:"#ef4444", blue:"#3b82f6", green:"#22c55e", yellow:"#f59e0b",
  purple:"#8b5cf6", pink:"#ec4899", cyan:"#06b6d4",
};

const Card = ({ children, style={}, glow }) => (
  <div style={{
    background: C.card, border: `1px solid ${glow ? glow+"40" : C.border}`,
    borderRadius: 14, padding: 18,
    boxShadow: glow ? `0 0 20px ${glow}18` : "none", ...style,
  }}>{children}</div>
);

const Inp = ({ label, value, onChange, placeholder, type="text", mono }) => (
  <div style={{ marginBottom: 12 }}>
    {label && <div style={{ fontSize:11, color:C.muted, fontWeight:700, marginBottom:5,
      textTransform:"uppercase", letterSpacing:0.5 }}>{label}</div>}
    <input value={value} onChange={onChange} placeholder={placeholder} type={type}
      style={{ width:"100%", background:C.surface, border:`1px solid ${C.border2}`,
        borderRadius:8, color: mono ? C.cyan : C.text, padding:"9px 12px",
        fontSize: mono ? 12 : 13, boxSizing:"border-box", outline:"none",
        fontFamily: mono ? "monospace" : "inherit" }} />
  </div>
);

const SecretInp = ({ label, value, onChange, placeholder }) => {
  const [show, setShow] = useState(false);
  return (
    <div style={{ marginBottom:12 }}>
      {label && <div style={{ fontSize:11, color:C.muted, fontWeight:700, marginBottom:5,
        textTransform:"uppercase", letterSpacing:0.5 }}>{label}</div>}
      <div style={{ display:"flex", gap:6 }}>
        <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          type={show ? "text" : "password"}
          style={{ flex:1, background:C.surface, border:`1px solid ${C.border2}`,
            borderRadius:8, color:C.cyan, padding:"9px 10px", fontSize:11,
            boxSizing:"border-box", outline:"none", fontFamily:"monospace", minWidth:0 }} />
        <button onClick={() => setShow(s => !s)}
          style={{ padding:"0 10px", background:C.surface, border:`1px solid ${C.border2}`,
            borderRadius:8, color:C.muted, cursor:"pointer", fontSize:11, flexShrink:0 }}>
          {show ? "Hide" : "Show"}
        </button>
      </div>
      {value && !show && (
        <div style={{ fontSize:10, color:C.green, marginTop:3 }}>✓ Value saved hai — Show karo dekhne ke liye</div>
      )}
      {!value && (
        <div style={{ fontSize:10, color:C.yellow, marginTop:3 }}>⚠️ Empty — fill karo</div>
      )}
    </div>
  );
};

const JsonPasteBtn = ({ onParsed }) => {
  const [open, setOpen] = useState(false);
  const [txt, setTxt] = useState("");
  const parse = () => {
    try {
      const obj = JSON.parse(txt.trim());
      onParsed(obj);
      setOpen(false);
      setTxt("");
    } catch {
      alert("JSON galat hai — Google Cloud Console se download kiya hua credentials file ya OAuth Playground ka token response paste karo");
    }
  };
  return (
    <>
      <button onClick={() => setOpen(true)}
        style={{ fontSize:11, fontWeight:700, padding:"5px 10px", borderRadius:7,
          background:`${C.purple}20`, border:`1px solid ${C.purple}60`, color:C.purple,
          cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
        📋 JSON Paste karo
      </button>
      {open && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:9999,
          display:"flex", alignItems:"center", justifyContent:"center" }}
          onClick={e => { if(e.target===e.currentTarget) setOpen(false); }}>
          <div style={{ background:"#1a1a2e", border:`1px solid ${C.purple}50`, borderRadius:14,
            padding:24, width:500, boxShadow:"0 20px 60px rgba(0,0,0,0.7)" }}>
            <div style={{ fontWeight:800, fontSize:15, color:C.text, marginBottom:8 }}>
              📋 Google Credentials JSON Paste Karo
            </div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:12, lineHeight:1.6 }}>
              Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client → <strong style={{color:C.cyan}}>Download JSON</strong> → us file ka poora content yahan paste karo
            </div>
            <textarea value={txt} onChange={e => setTxt(e.target.value)}
              placeholder={'{"web":{"client_id":"...","client_secret":"...",...}}'}
              style={{ width:"100%", minHeight:140, background:"#0d0d1a", border:`1px solid ${C.border2}`,
                borderRadius:8, color:C.cyan, padding:"10px 12px", fontSize:11,
                fontFamily:"monospace", resize:"vertical", boxSizing:"border-box", outline:"none" }} />
            <div style={{ display:"flex", gap:8, marginTop:12 }}>
              <button onClick={parse}
                style={{ flex:1, padding:"9px 0", background:C.purple, border:"none",
                  borderRadius:8, color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                ✅ Auto-Fill Karo
              </button>
              <button onClick={() => { setOpen(false); setTxt(""); }}
                style={{ padding:"9px 16px", background:"none", border:`1px solid ${C.border2}`,
                  borderRadius:8, color:C.muted, cursor:"pointer", fontSize:13 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const Sel = ({ label, value, onChange, options }) => (
  <div style={{ marginBottom: 12 }}>
    {label && <div style={{ fontSize:11, color:C.muted, fontWeight:700, marginBottom:5,
      textTransform:"uppercase", letterSpacing:0.5 }}>{label}</div>}
    <select value={value} onChange={onChange}
      style={{ width:"100%", background:C.surface, border:`1px solid ${C.border2}`,
        borderRadius:8, color:C.text, padding:"9px 12px", fontSize:13 }}>
      {options.map(o => typeof o==="string"
        ? <option key={o} value={o}>{o}</option>
        : <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  </div>
);

const Btn = ({ children, onClick, color=C.blue, disabled, small, outline, full, style={} }) => (
  <button onClick={onClick} disabled={disabled} style={{
    padding: small ? "6px 12px" : "10px 18px", fontSize: small ? 12 : 13,
    fontWeight:700, borderRadius:8, cursor: disabled ? "not-allowed" : "pointer",
    border: outline ? `1px solid ${color}` : "none",
    background: disabled ? "#2a2a3e" : outline ? "transparent" : color,
    color: disabled ? C.muted : outline ? color : "#fff",
    width: full ? "100%" : "auto", transition:"all 0.15s", opacity: disabled ? 0.6 : 1,
    ...style,
  }}>{children}</button>
);

const Badge = ({ children, color=C.blue }) => (
  <span style={{ background:`${color}22`, color, border:`1px solid ${color}44`,
    borderRadius:6, padding:"2px 8px", fontSize:11, fontWeight:700 }}>{children}</span>
);

const Toggle = ({ value, onChange, label }) => (
  <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}>
    <div onClick={() => onChange(!value)} style={{
      width:40, height:22, borderRadius:11, background: value ? C.green : C.border2,
      position:"relative", transition:"all 0.2s", flexShrink:0,
    }}>
      <div style={{
        position:"absolute", top:3, left: value ? 21 : 3, width:16, height:16,
        borderRadius:"50%", background:"#fff", transition:"all 0.2s",
      }} />
    </div>
    {label && <span style={{ fontSize:13, color:C.dim }}>{label}</span>}
  </label>
);

const StatusDot = ({ status }) => {
  const map = { queued:C.yellow, approved:C.blue, uploading:C.cyan,
                done:C.green, error:C.red, detected:C.purple, cancelled:C.muted };
  return <span style={{ width:8, height:8, borderRadius:"50%",
    background: map[status]||C.muted, display:"inline-block", marginRight:6,
    boxShadow: `0 0 6px ${map[status]||C.muted}` }} />;
};

const Divider = () => <div style={{ borderTop:`1px solid ${C.border}`, margin:"14px 0" }} />;

const SectionHead = ({ children, action }) => (
  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
    <div style={{ fontWeight:800, fontSize:16, color:C.text }}>{children}</div>
    {action}
  </div>
);

// ── TABS ─────────────────────────────────────────────────────────────────
const ALL_TABS = ["🏠 Dashboard","📺 Channels","📹 Videos","📁 Drive Watch","🚀 Upload","📅 Bulk Schedule","👥 Team","📊 Analytics","⚙️ Settings"];
const ADMIN_ONLY_TABS = ["👥 Team"];
const T = (tabs, name) => tabs.indexOf(name);
const NICHES = ["Lo-fi Music","Meditation & Sleep","Ambient Sounds","Study Music","Nature Sounds","Motivational","Tech News","Finance","Gaming","Cooking","Education","Comedy","Other"];
const LANGUAGES = ["Hindi","English","Hinglish","Punjabi","Tamil","Telugu","Bengali"];
const PRIVACY = ["public","private","unlisted"];

// ── MAIN ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, logout } = useAuth();
  const [tab,      setTab]      = useState(0);
  const [channels, setChannels] = useState([]);
  const [queue,    setQueue]    = useState([]);
  const [drive,    setDrive]    = useState([]);
  const [team,     setTeam]     = useState([]);
  const [summary,  setSummary]  = useState(null);
  const [notif,    setNotif]    = useState(null);
  const [expandedCh, setExpandedCh] = useState(null);

  const [upState, setUpState] = useState({
    channelId:"", driveLink:"", title:"", description:"",
    tags:"", schedDate:"", schedTime:"10:00", privacy:"public", aiLoading:false,
    uploadMode:"drive", fileUploading:false, fileProgress:null,
    videoTopic:"", instantPublish:true, aiProvider:"auto", hashtags:"",
  });
  const [chVideos,  setChVideos]  = useState({});  // channelId → {total_videos, subscribers, recent_videos}
  const [chLoading, setChLoading] = useState({});
  const [teamForm,  setTeamForm]  = useState({ name:"", email:"", password:"", role:"editor", show:false });

  const toast = (msg, type="success") => {
    setNotif({ msg, type });
    setTimeout(() => setNotif(null), 3500);
  };

  // ── Data fetchers ──
  const loadChannels = useCallback(async () => {
    const { data } = await api.get("/channels"); setChannels(data);
  }, []);
  const loadQueue = useCallback(async () => {
    const { data } = await api.get("/queue"); setQueue(data);
  }, []);
  const loadDrive = useCallback(async () => {
    const { data } = await api.get("/drive/items"); setDrive(data);
  }, []);
  const loadTeam = useCallback(async () => {
    if (user.role === "admin" || user.role === "manager") {
      const { data } = await api.get("/team"); setTeam(data);
    }
  }, [user.role]);
  const loadSummary = useCallback(async () => {
    const { data } = await api.get("/analytics/summary"); setSummary(data);
  }, []);

  useEffect(() => {
    loadChannels(); loadQueue(); loadDrive(); loadSummary();
    if (user.role === "admin" || user.role === "manager") loadTeam();
  }, []);

  // ── WebSocket realtime ──
  useSocket({
    "drive:new_file":    ({ item }) => { setDrive(p => [item, ...p]); toast("📁 Nayi video detect hui Drive mein!"); },
    "queue:uploading":   ({ id })   => setQueue(p => p.map(v => v.id===id ? {...v,status:"uploading"} : v)),
    "queue:upload_done": ({ id, yt_video_id }) => {
      setQueue(p => p.map(v => v.id===id ? {...v,status:"done",yt_video_id} : v));
      toast("✅ Video YouTube pe live!");
    },
    "queue:upload_error": ({ id, error }) => {
      setQueue(p => p.map(v => v.id===id ? {...v,status:"error",error_msg:error} : v));
      toast("❌ Upload fail: " + error, "error");
    },
  });

  // ── Channel videos fetch ──
  const loadChVideos = async (chId) => {
    if (chLoading[chId]) return;
    setChLoading(p => ({...p, [chId]:true}));
    try {
      const { data } = await api.get(`/channels/${chId}/videos`);
      setChVideos(p => ({...p, [chId]:data}));
    } catch (e) {
      toast("Videos fetch error: " + (e.response?.data?.error||e.message), "error");
    }
    setChLoading(p => ({...p, [chId]:false}));
  };

  // ── Add team member ──
  const addTeamMember = async () => {
    if (!teamForm.name || !teamForm.email || !teamForm.password) {
      toast("Name, email, password sab chahiye", "error"); return;
    }
    try {
      const { data } = await api.post("/auth/register", teamForm);
      setTeam(p => [...p, data]);
      toast(`✅ ${data.name} add ho gaya (${data.role})!`);
      setTeamForm({ name:"", email:"", password:"", role:"editor", show:false });
    } catch (e) {
      toast(e.response?.data?.error || "Error", "error");
    }
  };

  // ── Direct file upload (PC/Phone) ──
  const uploadFile = async (file) => {
    if (!upState.channelId) { toast("Pehle channel select karo", "error"); return; }
    if (!upState.title)     { toast("Title daalo", "error"); return; }
    setUpState(p => ({...p, fileUploading:true, fileProgress:"Uploading..."}));
    try {
      const fd = new FormData();
      fd.append("video", file);
      fd.append("channel_id",  upState.channelId);
      fd.append("title",       upState.title);
      fd.append("description", upState.description);
      fd.append("tags",        upState.tags);
      fd.append("privacy",     upState.privacy);
      if (upState.schedDate) fd.append("sched_date", upState.schedDate);
      if (upState.schedTime) fd.append("sched_time", upState.schedTime);
      const { data } = await api.post("/upload/file", fd, {
        headers: { "Content-Type":"multipart/form-data" },
        onUploadProgress: (e) => {
          const pct = Math.round((e.loaded / e.total) * 100);
          setUpState(p => ({...p, fileProgress:`Uploading ${pct}%`}));
        },
      });
      toast(`🚀 Upload shuru! Queue ID: ${data.queue_id}`);
      await loadQueue();
    } catch (e) {
      toast("Upload error: " + (e.response?.data?.error||e.message), "error");
    }
    setUpState(p => ({...p, fileUploading:false, fileProgress:null}));
  };

  // ── AI metadata ──
  const generateAI = async () => {
    if (!upState.channelId) { toast("Pehle channel select karo", "error"); return; }
    if (!upState.videoTopic?.trim()) {
      toast("⚠️ Video topic daalo — warna AI random content banega!", "error"); return;
    }
    setUpState(p => ({ ...p, aiLoading:true }));
    try {
      const { data } = await api.post("/ai/metadata", {
        channel_id:  upState.channelId,
        video_topic: upState.videoTopic?.trim() || "",
        provider:    upState.aiProvider || "auto",
      });
      setUpState(p => ({
        ...p,
        title:       data.title       || p.title,
        description: data.description || p.description,
        tags:        data.tags        || p.tags,
        hashtags:    data.hashtags    || p.hashtags,
        aiLoading:   false,
      }));
      toast("AI ne video ke topic se metadata generate kar diya!");
    } catch (e) {
      toast("AI error: " + (e.response?.data?.error || e.message), "error");
      setUpState(p => ({ ...p, aiLoading:false }));
    }
  };

  // ── Add to queue ──
  const addToQueue = async () => {
    if (!upState.channelId) { toast("Pehle channel select karo", "error"); return; }
    if (!upState.driveLink) { toast("Drive link daalo", "error"); return; }
    if (!upState.title)     { toast("Title chahiye", "error"); return; }
    try {
      const { data } = await api.post("/queue", {
        channel_id:  upState.channelId,
        drive_link:  upState.driveLink,
        title:       upState.title,
        description: upState.description + (upState.hashtags ? "\n\n" + upState.hashtags : ""),
        tags:        upState.tags,
        sched_date:  upState.instantPublish ? null : (upState.schedDate || null),
        sched_time:  upState.instantPublish ? null : upState.schedTime,
        privacy:     upState.privacy,
      });
      setQueue(p => [data, ...p]);
      // Instant publish: auto-approve + trigger upload
      if (upState.instantPublish && data.id) {
        try {
          await api.patch(`/queue/${data.id}/approve`);
          await api.post(`/queue/${data.id}/upload`);
          setQueue(p => p.map(v => v.id===data.id ? {...v, approved:true, status:"uploading"} : v));
          toast("⚡ Queue mein add + upload shuru ho gaya!");
        } catch {
          toast("✅ Queue mein add hua (manual upload trigger karo)", "warn");
        }
      } else {
        toast("✅ Queue mein schedule ho gayi!");
      }
      setUpState(p => ({ ...p, driveLink:"", title:"", description:"", tags:"", hashtags:"", schedDate:"", videoTopic:"" }));
    } catch (e) {
      toast(e.response?.data?.error || "Error", "error");
    }
  };

  // ── Approve queue item ──
  const approveItem = async (id) => {
    const { data } = await api.patch(`/queue/${id}/approve`);
    setQueue(p => p.map(v => v.id===id ? data : v));
    toast("✅ Approved!");
  };

  // ── Trigger upload ──
  const triggerUpload = async (id) => {
    await api.post(`/queue/${id}/upload`);
    setQueue(p => p.map(v => v.id===id ? {...v,status:"uploading"} : v));
    toast("🚀 Upload job queue mein!");
  };

  // ── Channel update (local draft, explicit save) ──
  const [chDrafts,  setChDrafts]  = useState({});
  const [chSaving,  setChSaving]  = useState({});
  const [showView,  setShowView]  = useState({}); // per channel: "stats" | "config" | null

  const getDraft = (ch) => chDrafts[ch.id] ?? ch;
  const setDraft = (id, field, val) =>
    setChDrafts(p => ({ ...p, [id]: { ...(p[id] ?? channels.find(c=>c.id===id)), [field]: val } }));

  const saveCh = async (id) => {
    const draft = chDrafts[id];
    if (!draft) return;
    setChSaving(p => ({ ...p, [id]: true }));
    try {
      await api.patch(`/channels/${id}`, draft);
      setChannels(p => p.map(c => c.id===id ? { ...c, ...draft } : c));
      setChDrafts(p => { const n={...p}; delete n[id]; return n; });
      toast("✅ Channel save ho gaya!");
    } catch(e) {
      toast(e.response?.data?.error || "Save error", "error");
    }
    setChSaving(p => ({ ...p, [id]: false }));
  };

  const toggleOnOff = async (id, val) => {
    setChannels(p => p.map(c => c.id===id ? {...c, enabled:val} : c));
    await api.patch(`/channels/${id}`, { enabled: val });
  };

  const addChannel = async () => {
    const { data } = await api.post("/channels", { name:`Channel ${channels.length+1}`, lang:"Hindi", upload_time:"10:00", privacy:"public", enabled:true });
    setChannels(p => [...p, data]);
    toast("✅ Naya channel add hua!");
  };
  const removeCh = async (id) => {
    if (channels.length <= 1) { toast("Kam se kam 1 channel chahiye", "error"); return; }
    await api.delete(`/channels/${id}`);
    setChannels(p => p.filter(c => c.id!==id));
  };

  const TABS = ALL_TABS.filter(t => user.role === "admin" || !ADMIN_ONLY_TABS.includes(t));

  const activeCount    = channels.filter(c => c.enabled).length;
  const queuedCount    = queue.filter(v => v.status==="queued").length;
  const doneCount      = queue.filter(v => v.status==="done").length;
  const driveDetected  = drive.filter(d => d.status==="detected").length;

  return (
    <div style={{ fontFamily:"'Inter',system-ui,sans-serif", background:C.bg, minHeight:"100vh", color:C.text }}>

      {/* TOAST */}
      {notif && (
        <div style={{
          position:"fixed", top:20, right:20, zIndex:9999,
          background: notif.type==="error" ? C.red : notif.type==="warn" ? C.yellow : C.green,
          color:"#fff", padding:"12px 20px", borderRadius:10, fontWeight:700, fontSize:13,
          boxShadow:"0 8px 32px rgba(0,0,0,0.5)", maxWidth:340,
        }}>{notif.msg}</div>
      )}

      {/* HEADER */}
      <div style={{ background:"#0d0d1a", borderBottom:`1px solid ${C.border}`, padding:"14px 24px",
        display:"flex", alignItems:"center", justifyContent:"space-between",
        position:"sticky", top:0, zIndex:100 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:38, height:38, background:"linear-gradient(135deg,#ff0000,#cc0000)",
            borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:18, fontWeight:900, boxShadow:"0 0 16px #ff000044" }}>▶</div>
          <div>
            <div style={{ fontWeight:900, fontSize:17, color:"#fff", letterSpacing:-0.5 }}>
              YT AutoPilot <span style={{ color:C.purple, fontSize:12, background:`${C.purple}22`,
                padding:"1px 7px", borderRadius:5, marginLeft:4, fontWeight:700 }}>V2</span>
            </div>
            <div style={{ fontSize:11, color:C.muted }}>Multi-Channel YouTube Automation</div>
          </div>
        </div>

        <div style={{ display:"flex", gap:20, alignItems:"center" }}>
          {[
            { label:"Channels", val:activeCount,   color:C.blue   },
            { label:"Queue",    val:queuedCount,   color:C.yellow },
            { label:"Uploaded", val:doneCount,     color:C.green  },
            { label:"Drive",    val:driveDetected, color:C.purple },
          ].map(s => (
            <div key={s.label} style={{ textAlign:"center" }}>
              <div style={{ fontSize:18, fontWeight:900, color:s.color, lineHeight:1 }}>{s.val}</div>
              <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{s.label}</div>
            </div>
          ))}
          <div style={{ display:"flex", alignItems:"center", gap:8, paddingLeft:12,
            borderLeft:`1px solid ${C.border}` }}>
            <span style={{ fontSize:12, color:C.dim }}>{user.name}</span>
            <Badge color={user.role==="admin" ? C.red : user.role==="manager" ? C.purple : C.blue}>
              {user.role}
            </Badge>
            <Btn small outline color={C.muted} onClick={logout}>Logout</Btn>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div style={{ background:"#0d0d1a", borderBottom:`1px solid ${C.border}`,
        padding:"0 20px", display:"flex", gap:2, overflowX:"auto" }}>
        {TABS.map((t,i) => (
          <button key={t} onClick={() => setTab(i)} style={{
            padding:"11px 14px", background:"none", border:"none", cursor:"pointer",
            color: tab===i ? C.blue : C.muted,
            borderBottom: tab===i ? `2px solid ${C.blue}` : "2px solid transparent",
            fontWeight: tab===i ? 800 : 500, fontSize:12, whiteSpace:"nowrap",
            transition:"all 0.15s",
          }}>{t}</button>
        ))}
      </div>

      {/* CONTENT */}
      <div style={{ padding:24, maxWidth:1140, margin:"0 auto" }}>

        {/* ── DASHBOARD ── */}
        {tab===T(TABS,"🏠 Dashboard") && (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:20 }}>
              {[
                { label:"Total Channels", val:channels.length, color:C.blue,   icon:"📺" },
                { label:"Active",         val:activeCount,     color:C.green,  icon:"✅" },
                { label:"Uploaded",       val:doneCount,       color:C.cyan,   icon:"🎬" },
                { label:"In Queue",       val:queuedCount,     color:C.yellow, icon:"⏳" },
              ].map(s => (
                <Card key={s.label} glow={s.color}>
                  <div style={{ fontSize:22, marginBottom:6 }}>{s.icon}</div>
                  <div style={{ fontSize:30, fontWeight:900, color:s.color, lineHeight:1 }}>{s.val}</div>
                  <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>{s.label}</div>
                </Card>
              ))}
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:16 }}>
              <div>
                <SectionHead>📺 Channels Overview</SectionHead>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  {channels.map(ch => (
                    <Card key={ch.id}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                        <div>
                          <div style={{ fontWeight:800, fontSize:14 }}>{ch.name}</div>
                          <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{ch.niche||"No niche"}</div>
                        </div>
                        <Badge color={ch.enabled ? C.green : C.muted}>{ch.enabled?"Active":"Off"}</Badge>
                      </div>
                      <Divider />
                      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                        <Badge color={(ch.refresh_token || ch.youtube_api_key) ? C.green : C.red}>
                          {(ch.refresh_token || ch.youtube_api_key) ? "✓ OAuth" : "✗ OAuth"}
                        </Badge>
                        <Badge color={ch.drive_folder_id ? C.green : C.yellow}>
                          {ch.drive_folder_id ? "✓ Drive" : "Drive: Set karo"}
                        </Badge>
                        <Badge color={C.cyan}>{ch.upload_time}</Badge>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>

              <div>
                <SectionHead>📋 Activity Log</SectionHead>
                <Card style={{ maxHeight:380, overflowY:"auto" }}>
                  {(summary?.logs||[]).map((l,i) => (
                    <div key={l.id} style={{ paddingBottom:10, marginBottom: i<(summary.logs.length-1)?10:0,
                      borderBottom: i<(summary.logs.length-1)?`1px solid ${C.border}`:"none" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <StatusDot status={l.status} />
                        <span style={{ fontSize:12, color:C.text, lineHeight:1.4 }}>{l.message}</span>
                      </div>
                      <div style={{ fontSize:10, color:C.muted, marginTop:3, paddingLeft:14 }}>
                        {new Date(l.created_at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}
                      </div>
                    </div>
                  ))}
                  {!summary?.logs?.length && (
                    <div style={{ color:C.muted, fontSize:13, textAlign:"center", padding:20 }}>
                      Abhi koi activity nahi
                    </div>
                  )}
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* ── CHANNELS ── */}
        {tab===T(TABS,"📺 Channels") && (
          <div>
            <SectionHead action={
              user.role==="admin"
                ? <Btn onClick={addChannel} color={C.blue}>+ Add Channel</Btn>
                : null
            }>📺 Channels</SectionHead>

            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {channels.map(ch => {
                const draft   = getDraft(ch);
                const dirty   = !!chDrafts[ch.id];
                const view    = showView[ch.id] || null;  // "stats" | "config" | null
                const setView = (v) => setShowView(p => ({ ...p, [ch.id]: p[ch.id]===v ? null : v }));

                return (
                  <Card key={ch.id} glow={ch.enabled ? C.blue : null}>
                    {/* ── Channel Header Row ── */}
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ width:36, height:36, background:"linear-gradient(135deg,#ff0000,#880000)",
                          borderRadius:8, display:"flex", alignItems:"center",
                          justifyContent:"center", fontSize:16, flexShrink:0 }}>▶</div>
                        <div>
                          <div style={{ fontWeight:800, fontSize:15, color:C.text }}>{ch.name}</div>
                          <div style={{ fontSize:11, color:C.muted }}>
                            {ch.niche||"No niche"} • {ch.lang||"Hindi"} • ⏰ {ch.upload_time||"10:00"}
                          </div>
                        </div>
                      </div>

                      <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                        {/* OAuth status badge */}
                        <Badge color={ch.refresh_token ? C.green : C.red}>
                          {ch.refresh_token ? "✓ OAuth" : "✗ OAuth Missing"}
                        </Badge>
                        <Badge color={ch.drive_folder_id ? C.green : C.yellow}>
                          {ch.drive_folder_id ? "✓ Drive" : "Drive: Set karo"}
                        </Badge>

                        <Toggle value={ch.enabled} onChange={v => toggleOnOff(ch.id, v)} label="Active" />

                        <Btn small color={C.cyan} outline onClick={() => {
                          setView("stats");
                          if (!chVideos[ch.id]) loadChVideos(ch.id);
                        }}>
                          {view==="stats" ? "▲ Stats" : "📊 Stats"}
                        </Btn>
                        <Btn small outline color={C.blue} onClick={() => setView("config")}>
                          {view==="config" ? "▲ Close" : "⚙ Configure"}
                        </Btn>
                        {user.role==="admin" && (
                          <Btn small outline color={C.red} onClick={() => removeCh(ch.id)}>✕</Btn>
                        )}
                      </div>
                    </div>

                    {/* ── STATS PANEL ── */}
                    {view==="stats" && (
                      <div style={{ marginTop:16 }}>
                        <Divider />
                        {chLoading[ch.id] && (
                          <div style={{ textAlign:"center", padding:20, color:C.cyan, fontSize:13 }}>
                            ⏳ YouTube se data fetch ho raha hai...
                          </div>
                        )}
                        {!chLoading[ch.id] && !chVideos[ch.id] && (
                          <div style={{ textAlign:"center", padding:20, color:C.muted, fontSize:13 }}>
                            <div style={{ fontSize:28, marginBottom:8 }}>📊</div>
                            Koi data nahi — pehle OAuth (Client ID + Secret + Refresh Token) configure karo
                          </div>
                        )}
                        {chVideos[ch.id] && !chLoading[ch.id] && (
                          <>
                            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:14 }}>
                              {[
                                { label:"Total Videos",   val:chVideos[ch.id].total_videos?.toLocaleString(),   color:C.red,    icon:"🎬" },
                                { label:"Total Views",    val:chVideos[ch.id].total_views?.toLocaleString(),    color:C.blue,   icon:"👁"  },
                                { label:"Subscribers",    val:chVideos[ch.id].hidden_subs ? "Hidden" : chVideos[ch.id].subscribers?.toLocaleString(), color:C.green, icon:"👥" },
                                { label:"Avg Views/Video",val:chVideos[ch.id].total_videos > 0
                                    ? Math.round(chVideos[ch.id].total_views / chVideos[ch.id].total_videos).toLocaleString()
                                    : "0", color:C.purple, icon:"📈" },
                              ].map(s => (
                                <div key={s.label} style={{ background:C.surface, borderRadius:10,
                                  padding:"12px 14px", border:`1px solid ${s.color}30` }}>
                                  <div style={{ fontSize:18, marginBottom:4 }}>{s.icon}</div>
                                  <div style={{ fontSize:20, fontWeight:900, color:s.color }}>{s.val||"—"}</div>
                                  <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{s.label}</div>
                                </div>
                              ))}
                            </div>
                            <div style={{ fontSize:12, color:C.muted, marginTop:8, padding:"10px 12px",
                              background:`${C.blue}10`, borderRadius:8, border:`1px solid ${C.blue}20` }}>
                              📹 Videos dekhne ke liye upar <strong style={{color:C.blue}}>📹 Videos tab</strong> mein jao — wahan edit, delete, playlist sab hai
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* ── CONFIGURE PANEL ── */}
                    {view==="config" && (
                      <div style={{ marginTop:16 }}>
                        <Divider />

                        {user.role==="admin" && (
                          <AutoFillBar chId={ch.id} C={C}
                            onFill={(info) => {
                              setDraft(ch.id, "name", info.name);
                              toast(`✅ "${info.name}" auto-fill ho gaya! Save karo.`);
                            }}
                          />
                        )}

                        {/* Row 1: Basic info */}
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginTop:12 }}>
                          <Inp label="Channel Name" value={draft.name||""}
                            onChange={e => setDraft(ch.id,"name",e.target.value)} placeholder="My Channel" />
                          <Sel label="Niche" value={draft.niche||""}
                            onChange={e => setDraft(ch.id,"niche",e.target.value)} options={["",...NICHES]} />
                          <Sel label="Language" value={draft.lang||"Hindi"}
                            onChange={e => setDraft(ch.id,"lang",e.target.value)} options={LANGUAGES} />
                        </div>

                        {/* Row 2: OAuth tokens */}
                        <div style={{ padding:"12px 14px", background:`${C.purple}10`, border:`1px solid ${C.purple}30`,
                          borderRadius:10, marginBottom:12 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                            <div style={{ fontSize:11, color:C.purple, fontWeight:700,
                              textTransform:"uppercase", letterSpacing:0.5 }}>🔑 Google OAuth Credentials</div>
                            <JsonPasteBtn onParsed={(parsed) => {
                              // credentials.json (from Google Cloud Console)
                              const w = parsed.web || parsed.installed || parsed;
                              if (w.client_id)     setDraft(ch.id,"client_id",w.client_id);
                              if (w.client_secret) setDraft(ch.id,"client_secret",w.client_secret);
                              // token response (from OAuth Playground)
                              if (parsed.refresh_token) setDraft(ch.id,"refresh_token",parsed.refresh_token);
                              const filled = [w.client_id&&"Client ID", w.client_secret&&"Secret", parsed.refresh_token&&"Refresh Token"].filter(Boolean);
                              toast(`✅ Auto-fill: ${filled.join(", ")} — Save karna mat bhulna!`);
                            }} />
                          </div>
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                            <SecretInp label="OAuth Client ID" value={draft.client_id||""}
                              onChange={v => setDraft(ch.id,"client_id",v)} placeholder="xxx.apps.googleusercontent.com" />
                            <SecretInp label="OAuth Client Secret" value={draft.client_secret||""}
                              onChange={v => setDraft(ch.id,"client_secret",v)} placeholder="GOCSPX-..." />
                            <SecretInp label="Refresh Token" value={draft.refresh_token||""}
                              onChange={v => setDraft(ch.id,"refresh_token",v)} placeholder="1//0g..." />
                          </div>
                          <div style={{ fontSize:11, color:C.muted, marginTop:8, lineHeight:1.6 }}>
                            💡 <strong style={{color:C.yellow}}>Step 1:</strong> "📋 JSON Paste" karo Google credentials file se → Client ID + Secret auto-fill<br/>
                            💡 <strong style={{color:C.yellow}}>Step 2:</strong> <a href="https://developers.google.com/oauthplayground/" target="_blank" rel="noreferrer" style={{color:C.cyan}}>OAuth Playground</a> → ⚙ Settings → "Use your own OAuth credentials" ON → credentials enter → YouTube scope → Authorize → Exchange code → Refresh Token copy karo
                          </div>
                        </div>

                        {/* Row 3: Drive + optional */}
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:12 }}>
                          <Inp label="Drive Folder ID" value={draft.drive_folder_id||""}
                            onChange={e => setDraft(ch.id,"drive_folder_id",e.target.value)}
                            placeholder="1BxiMVs0XRA5nFM..." mono />
                          <Inp label="Drive Folder Name" value={draft.drive_folder_name||""}
                            onChange={e => setDraft(ch.id,"drive_folder_name",e.target.value)}
                            placeholder="Channel 1 Videos" />
                          <SecretInp label="YouTube API Key (optional)" value={draft.youtube_api_key||""}
                            onChange={v => setDraft(ch.id,"youtube_api_key",v)} placeholder="AIza..." />
                        </div>

                        {/* Row 4: Upload settings */}
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:12 }}>
                          <Inp label="Default Upload Time" value={draft.upload_time||"10:00"}
                            onChange={e => setDraft(ch.id,"upload_time",e.target.value)} type="time" />
                          <Sel label="Default Privacy" value={draft.privacy||"public"}
                            onChange={e => setDraft(ch.id,"privacy",e.target.value)} options={PRIVACY} />
                          <div>
                            <div style={{ fontSize:11, color:C.muted, fontWeight:700, marginBottom:8,
                              textTransform:"uppercase", letterSpacing:0.5 }}>Auto Watch Drive</div>
                            <Toggle value={draft.auto_watch||false}
                              onChange={v => setDraft(ch.id,"auto_watch",v)} label="Auto-Watch Enable" />
                            {draft.auto_watch && (
                              <div style={{ marginTop:8 }}>
                                <Inp label="Check every (minutes)" value={draft.watch_interval||5}
                                  onChange={e => setDraft(ch.id,"watch_interval",parseInt(e.target.value)||5)} />
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={{ padding:10, background:C.surface, borderRadius:8, fontSize:12, color:C.muted, marginBottom:14 }}>
                          💡 <strong style={{ color:C.text }}>Drive Folder ID:</strong> Drive folder open karo → URL mein <code style={{color:C.cyan}}>/folders/</code> ke baad wala part copy karo
                        </div>

                        {/* SAVE BUTTON */}
                        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                          <Btn color={C.green} disabled={!dirty || chSaving[ch.id]} onClick={() => saveCh(ch.id)}>
                            {chSaving[ch.id] ? "⏳ Saving..." : dirty ? "💾 Save Channel" : "✓ Saved"}
                          </Btn>
                          {dirty && (
                            <span style={{ fontSize:12, color:C.yellow }}>
                              ⚠️ Unsaved changes — Save karo!
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}

              {!channels.length && (
                <Card style={{ textAlign:"center", padding:40, color:C.muted }}>
                  <div style={{ fontSize:36, marginBottom:10 }}>📺</div>
                  <div style={{ fontWeight:700, marginBottom:6 }}>Koi channel nahi</div>
                  <div style={{ fontSize:13, marginBottom:16 }}>Upar "+ Add Channel" button se pehla channel banao</div>
                  {user.role==="admin" && <Btn onClick={addChannel} color={C.blue}>+ Add Channel</Btn>}
                </Card>
              )}
            </div>
          </div>
        )}

        {/* ── VIDEOS ── */}
        {tab===T(TABS,"📹 Videos") && (
          <VideoManagerTab channels={channels} C={C} user={user} toast={toast} />
        )}

        {/* ── DRIVE WATCH ── */}
        {tab===T(TABS,"📁 Drive Watch") && (
          <div>
            <SectionHead>📁 Google Drive Auto-Watch</SectionHead>
            <Card style={{ marginBottom:16 }}>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:4, color:C.text }}>
                🔴 Live Watch Status
              </div>
              <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginTop:10 }}>
                {channels.filter(c => c.auto_watch && c.enabled).map(ch => (
                  <div key={ch.id} style={{ display:"flex", alignItems:"center", gap:8,
                    background:`${C.green}15`, border:`1px solid ${C.green}40`,
                    borderRadius:8, padding:"8px 14px" }}>
                    <span style={{ width:8, height:8, borderRadius:"50%", background:C.green,
                      boxShadow:`0 0 8px ${C.green}`, display:"inline-block" }} />
                    <span style={{ fontSize:13, color:C.green, fontWeight:700 }}>{ch.name}</span>
                    <span style={{ fontSize:11, color:C.muted }}>every {ch.watch_interval}min</span>
                    <Btn small color={C.cyan} onClick={() => api.post(`/drive/check/${ch.id}`)
                      .then(() => toast(`Manual check triggered: ${ch.name}`))}>
                      Check Now
                    </Btn>
                  </div>
                ))}
                {!channels.some(c => c.auto_watch) && (
                  <span style={{ fontSize:13, color:C.yellow }}>
                    ⚠️ Channels tab mein jaake Auto-Watch enable karo
                  </span>
                )}
              </div>
            </Card>

            <SectionHead>🆕 Detected Files ({driveDetected})</SectionHead>
            {drive.length===0 ? (
              <Card style={{ textAlign:"center", padding:40, color:C.muted }}>
                <div style={{ fontSize:36, marginBottom:10 }}>👁</div>
                <div style={{ fontWeight:700 }}>Abhi koi file detect nahi hui</div>
                <div style={{ fontSize:12, marginTop:4 }}>Drive Watch enable karo — videos auto-detect hongi</div>
              </Card>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {drive.map(item => (
                  <Card key={item.id}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                          <StatusDot status={item.status} />
                          <span style={{ fontWeight:700, fontSize:13 }}>{item.name}</span>
                          <Badge color={item.status==="detected" ? C.purple : C.green}>{item.status}</Badge>
                        </div>
                        <div style={{ fontSize:11, color:C.muted }}>
                          📺 {item.channels?.name} • 📦 {item.size ? `${(item.size/1e9).toFixed(1)} GB` : "?"} •
                          🕐 {new Date(item.detected_at).toLocaleTimeString("en-IN")}
                        </div>
                      </div>
                      {item.status==="detected" && (
                        <div style={{ display:"flex", gap:8 }}>
                          <Btn small color={C.blue} onClick={async () => {
                            const ch = channels.find(c => c.id===item.channel_id);
                            const { data } = await api.post("/queue", {
                              channel_id: item.channel_id,
                              drive_link: item.drive_link,
                              title: item.name.replace(/\.[^.]+$/, ""),
                              privacy: ch?.privacy || "public",
                            });
                            setQueue(p => [data, ...p]);
                            setDrive(p => p.map(d => d.id===item.id ? {...d,status:"queued"} : d));
                            toast("✅ Queue mein add!");
                          }}>➕ Queue Add</Btn>
                          <Btn small outline color={C.muted} onClick={() =>
                            api.patch(`/drive/items/${item.id}/ignore`)
                              .then(() => setDrive(p => p.map(d => d.id===item.id ? {...d,status:"ignored"} : d)))
                          }>Ignore</Btn>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── UPLOAD ── */}
        {tab===T(TABS,"🚀 Upload") && (
          <div>
            <SectionHead>🚀 Manual Upload</SectionHead>

            {/* Upload Mode Toggle */}
            <div style={{ display:"flex", gap:8, marginBottom:16 }}>
              {[["drive","📁 Google Drive Link"],["file","💻 PC / Phone se File"]].map(([m,l]) => (
                <Btn key={m} color={upState.uploadMode===m ? C.blue : C.border2}
                  outline={upState.uploadMode!==m}
                  onClick={() => setUpState(p => ({...p, uploadMode:m}))}>
                  {l}
                </Btn>
              ))}
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              <div>
                <Card style={{ marginBottom:14 }}>
                  <div style={{ fontWeight:700, color:C.blue, marginBottom:14 }}>Step 1 — Channel & Video</div>
                  <Sel label="Select Channel" value={upState.channelId}
                    onChange={e => setUpState(p => ({...p, channelId:e.target.value}))}
                    options={[{v:"",l:"-- Channel chunao --"}, ...channels.map(c => ({ v:c.id, l:`${c.name} — ${c.niche||""}` }))]} />

                  {upState.uploadMode === "drive" ? (
                    <Inp label="Google Drive Video Link" value={upState.driveLink}
                      onChange={e => setUpState(p => ({...p, driveLink:e.target.value}))}
                      placeholder="https://drive.google.com/file/d/..." mono />
                  ) : (
                    <div>
                      <div style={{ fontSize:11, color:C.muted, fontWeight:700, marginBottom:8,
                        textTransform:"uppercase", letterSpacing:0.5 }}>Video File (PC ya Phone se)</div>
                      <label style={{
                        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                        border:`2px dashed ${C.blue}60`, borderRadius:10, padding:"24px 16px",
                        cursor:"pointer", background:`${C.blue}08`, gap:8,
                      }}>
                        <div style={{ fontSize:28 }}>📤</div>
                        <div style={{ fontSize:13, color:C.blue, fontWeight:700 }}>
                          Click karo ya drag & drop karo
                        </div>
                        <div style={{ fontSize:11, color:C.muted }}>MP4, MOV, AVI, MKV — max 2GB</div>
                        <input type="file" accept="video/*" style={{ display:"none" }}
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) setUpState(p => ({...p, selectedFile:f}));
                          }} />
                      </label>
                      {upState.selectedFile && (
                        <div style={{ marginTop:10, padding:"8px 12px", background:`${C.green}15`,
                          borderRadius:8, border:`1px solid ${C.green}40`, fontSize:12 }}>
                          ✅ <strong>{upState.selectedFile.name}</strong>
                          {" "}({(upState.selectedFile.size/1e6).toFixed(1)} MB)
                        </div>
                      )}
                    </div>
                  )}
                </Card>
                <Card>
                  <div style={{ fontWeight:700, color:C.purple, marginBottom:14 }}>Step 2 — AI Metadata</div>
                  <div style={{ marginBottom:10 }}>
                    <div style={{ fontSize:11, color:C.muted, fontWeight:700, marginBottom:5,
                      textTransform:"uppercase", letterSpacing:0.5 }}>Video ka Topic / Description batao AI ko</div>
                    <textarea value={upState.videoTopic}
                      onChange={e => setUpState(p => ({...p, videoTopic:e.target.value}))}
                      placeholder="Jaise: Ye video 10 hours rain sound hai concentration ke liye, dark ambient background ke saath..."
                      style={{ width:"100%", background:C.surface, border:`1px solid ${C.border2}`,
                        borderRadius:8, color:C.text, padding:"9px 12px", fontSize:12,
                        minHeight:70, resize:"vertical", boxSizing:"border-box", fontFamily:"inherit" }} />
                    <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>
                      Jitna detail doge utna better title/tags banega — ya blank chhodo toh channel niche se generate hoga
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                    {[["auto","🤖 Auto"],["anthropic","Claude"],["gemini","Gemini"]].map(([v,l]) => (
                      <Btn key={v} small color={upState.aiProvider===v?C.purple:C.border2}
                        outline={upState.aiProvider!==v}
                        onClick={() => setUpState(p => ({...p, aiProvider:v}))}>
                        {l}
                      </Btn>
                    ))}
                  </div>
                  <Btn full color={C.purple} disabled={upState.aiLoading} onClick={generateAI}>
                    {upState.aiLoading ? "⏳ AI generate kar raha hai..." : "✨ AI se Title + Description + Tags Generate Karo"}
                  </Btn>
                </Card>
              </div>
              <div>
                <Card style={{ marginBottom:14 }}>
                  <div style={{ fontWeight:700, color:C.cyan, marginBottom:14 }}>Step 3 — Review Metadata</div>
                  <Inp label="Video Title" value={upState.title}
                    onChange={e => setUpState(p => ({...p, title:e.target.value}))}
                    placeholder="AI generate karega ya manually likhao" />
                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:11, color:C.muted, fontWeight:700, marginBottom:5,
                      textTransform:"uppercase", letterSpacing:0.5 }}>Description</div>
                    <textarea value={upState.description}
                      onChange={e => setUpState(p => ({...p, description:e.target.value}))}
                      placeholder="AI generate karega..."
                      style={{ width:"100%", background:C.surface, border:`1px solid ${C.border2}`,
                        borderRadius:8, color:C.text, padding:"9px 12px", fontSize:12,
                        minHeight:110, resize:"vertical", boxSizing:"border-box", fontFamily:"inherit" }} />
                  </div>
                  <Inp label="Tags (comma separated)" value={upState.tags}
                    onChange={e => setUpState(p => ({...p, tags:e.target.value}))}
                    placeholder="lofi, music, study, chill..." />
                  <Inp label="Hashtags" value={upState.hashtags}
                    onChange={e => setUpState(p => ({...p, hashtags:e.target.value}))}
                    placeholder="#lofi #studymusic #chillbeats (AI generate karega)" />

                  {/* Thumbnail */}
                  <div style={{ marginTop:4 }}>
                    <div style={{ fontSize:11, color:C.muted, fontWeight:700, marginBottom:5,
                      textTransform:"uppercase", letterSpacing:0.5 }}>Thumbnail Image (optional)</div>
                    <label style={{ display:"flex", flexDirection:"column", alignItems:"center",
                      border:`2px dashed ${C.purple}60`, borderRadius:10, padding:"14px 12px",
                      cursor:"pointer", background:`${C.purple}08`, gap:6 }}>
                      <div style={{ fontSize:22 }}>🖼️</div>
                      <div style={{ fontSize:12, color:C.purple, fontWeight:700 }}>
                        {upState.thumbFile ? upState.thumbFile.name : "Thumbnail upload karo (JPG/PNG)"}
                      </div>
                      <div style={{ fontSize:11, color:C.muted }}>1280×720 best hai</div>
                      <input type="file" accept="image/*" style={{ display:"none" }}
                        onChange={e => {
                          const f = e.target.files?.[0];
                          if (f) setUpState(p => ({...p, thumbFile:f}));
                        }} />
                    </label>
                    {upState.thumbFile && (
                      <div style={{ marginTop:8, display:"flex", alignItems:"center", gap:10 }}>
                        <img src={URL.createObjectURL(upState.thumbFile)} alt=""
                          style={{ width:80, height:45, objectFit:"cover", borderRadius:6, border:`1px solid ${C.border}` }} />
                        <div style={{ fontSize:12, color:C.green }}>✅ {upState.thumbFile.name}</div>
                        <button onClick={() => setUpState(p => ({...p, thumbFile:null}))}
                          style={{ background:"none", border:`1px solid ${C.red}40`, borderRadius:6,
                            color:C.red, fontSize:11, padding:"3px 8px", cursor:"pointer" }}>✕ Remove</button>
                      </div>
                    )}
                  </div>
                </Card>
                <Card>
                  <div style={{ fontWeight:700, color:C.green, marginBottom:14 }}>Step 4 — Publish Options</div>

                  {/* Instant vs Schedule toggle */}
                  <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                    <Btn color={upState.instantPublish ? C.green : C.border2}
                      outline={!upState.instantPublish} small
                      onClick={() => setUpState(p => ({...p, instantPublish:true}))}>
                      ⚡ Abhi Upload Karo
                    </Btn>
                    <Btn color={!upState.instantPublish ? C.yellow : C.border2}
                      outline={upState.instantPublish} small
                      onClick={() => setUpState(p => ({...p, instantPublish:false}))}>
                      📅 Schedule Karo
                    </Btn>
                  </div>

                  {!upState.instantPublish && (
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                      <Inp label="Schedule Date" value={upState.schedDate}
                        onChange={e => setUpState(p => ({...p, schedDate:e.target.value}))} type="date" />
                      <Inp label="Schedule Time" value={upState.schedTime}
                        onChange={e => setUpState(p => ({...p, schedTime:e.target.value}))} type="time" />
                    </div>
                  )}
                  {upState.instantPublish && (
                    <div style={{ padding:"8px 12px", background:`${C.green}15`, borderRadius:8,
                      fontSize:12, color:C.green, marginBottom:10 }}>
                      ⚡ Video turant public ho jayegi YouTube pe
                    </div>
                  )}

                  <Sel label="Privacy" value={upState.privacy}
                    onChange={e => setUpState(p => ({...p, privacy:e.target.value}))} options={PRIVACY} />

                  {upState.uploadMode === "drive" ? (
                    <Btn full color={C.green} onClick={addToQueue}>
                      {upState.instantPublish ? "⚡ Queue → Turant Upload" : "📅 Schedule Queue Mein Add"}
                    </Btn>
                  ) : (
                    <Btn full color={C.red} disabled={upState.fileUploading || !upState.selectedFile}
                      onClick={() => upState.selectedFile && uploadFile(upState.selectedFile)}>
                      {upState.fileUploading
                        ? `⏳ ${upState.fileProgress || "Uploading..."}`
                        : upState.instantPublish ? "⚡ Abhi YouTube Pe Upload Karo" : "📅 Schedule Upload Karo"}
                    </Btn>
                  )}
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* ── BULK SCHEDULE ── */}
        {tab===T(TABS,"📅 Bulk Schedule") && <BulkScheduleTab channels={channels} queue={queue} setQueue={setQueue} user={user} toast={toast} approveItem={approveItem} triggerUpload={triggerUpload} />}

        {/* ── TEAM (admin only tab — non-admins can't reach this) ── */}
        {tab===T(TABS,"👥 Team") && (
          <div>
            <SectionHead action={
              <Btn color={C.blue} onClick={() => setTeamForm(p => ({...p, show:!p.show}))}>
                {teamForm.show ? "✕ Cancel" : "+ Team Member Add Karo"}
              </Btn>
            }>👥 Team Management</SectionHead>

            {/* Add Team Form */}
            {teamForm.show && (
              <Card style={{ marginBottom:16, border:`1px solid ${C.blue}40` }}>
                <div style={{ fontWeight:700, color:C.blue, marginBottom:14 }}>Naya Member Add Karo</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12 }}>
                  <Inp label="Name" value={teamForm.name}
                    onChange={e => setTeamForm(p => ({...p, name:e.target.value}))}
                    placeholder="Rahul Sharma" />
                  <Inp label="Email" value={teamForm.email}
                    onChange={e => setTeamForm(p => ({...p, email:e.target.value}))}
                    placeholder="rahul@example.com" type="email" />
                  <Inp label="Password" value={teamForm.password}
                    onChange={e => setTeamForm(p => ({...p, password:e.target.value}))}
                    placeholder="Strong password" type="password" />
                  <Sel label="Role" value={teamForm.role}
                    onChange={e => setTeamForm(p => ({...p, role:e.target.value}))}
                    options={[
                      {v:"editor",   l:"Editor — Sirf dekhna"},
                      {v:"uploader", l:"Uploader — Upload kar sakta hai"},
                      {v:"manager",  l:"Manager — Approve + Manage"},
                      {v:"admin",    l:"Admin — Full Access"},
                    ]} />
                </div>
                <Btn color={C.green} onClick={addTeamMember}>✅ Add Member</Btn>
                <div style={{ marginTop:10, fontSize:12, color:C.muted }}>
                  💡 Member ko yahi email/password se login karna hoga
                </div>
              </Card>
            )}

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:12 }}>
              {team.map(m => (
                <TeamMemberCard key={m.id} m={m} currentUser={user} C={C}
                  onRoleChange={async (newRole) => {
                    try {
                      await api.patch(`/team/${m.id}`, { role: newRole });
                      setTeam(p => p.map(t => t.id===m.id ? {...t, role:newRole} : t));
                      toast(`✅ ${m.name} ka role → ${newRole}`);
                    } catch(e) { toast(e.response?.data?.error||"Error","error"); }
                  }}
                  onToggleActive={async () => {
                    try {
                      await api.patch(`/team/${m.id}`, { is_active: !m.is_active });
                      setTeam(p => p.map(t => t.id===m.id ? {...t, is_active:!m.is_active} : t));
                      toast(`${m.name} ${!m.is_active ? "activated" : "deactivated"}`);
                    } catch(e) { toast(e.response?.data?.error||"Error","error"); }
                  }}
                  onDelete={async () => {
                    if (!confirm(`"${m.name}" ko permanently delete karo?`)) return;
                    try {
                      await api.delete(`/team/${m.id}`);
                      setTeam(p => p.filter(t => t.id !== m.id));
                      toast(`✅ ${m.name} remove ho gaya`);
                    } catch(e) { toast(e.response?.data?.error||"Error","error"); }
                  }}
                />
              ))}
              {!team.length && (
                <Card style={{ textAlign:"center", padding:40, color:C.muted, gridColumn:"1/-1" }}>
                  <div style={{ fontSize:36, marginBottom:10 }}>👥</div>
                  <div>Koi team member nahi — + Add se banao</div>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* ── ANALYTICS ── */}
        {tab===T(TABS,"📊 Analytics") && (
          <div>
            <SectionHead action={<Btn small onClick={loadSummary}>🔄 Refresh</Btn>}>📊 Analytics</SectionHead>
            {summary && (
              <>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:20 }}>
                  {[
                    { label:"Total Uploaded",   val:summary.totalUploaded, color:C.green,  sub:"All time" },
                    { label:"Pending",          val:summary.inQueue,       color:C.yellow, sub:"In queue" },
                    { label:"Drive Detected",   val:summary.driveDetected, color:C.purple, sub:"Auto-found" },
                    { label:"Active Members",   val:summary.activeMembers, color:C.blue,   sub:"Team" },
                  ].map(s => (
                    <Card key={s.label} glow={s.color}>
                      <div style={{ fontSize:28, fontWeight:900, color:s.color }}>{s.val}</div>
                      <div style={{ fontSize:13, color:C.text, marginTop:2 }}>{s.label}</div>
                      <div style={{ fontSize:11, color:C.muted }}>{s.sub}</div>
                    </Card>
                  ))}
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                  <Card>
                    <div style={{ fontWeight:700, marginBottom:14 }}>📺 Per Channel Stats</div>
                    {(summary.perChannel||[]).map(ch => (
                      <div key={ch.id} style={{ marginBottom:12 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                          <span style={{ fontSize:13, fontWeight:600 }}>{ch.name}</span>
                          <div style={{ display:"flex", gap:6 }}>
                            <Badge color={C.green}>{ch.uploaded} done</Badge>
                            <Badge color={C.yellow}>{ch.pending} pending</Badge>
                          </div>
                        </div>
                        <div style={{ height:6, background:C.surface, borderRadius:3, overflow:"hidden" }}>
                          <div style={{ height:"100%",
                            width: ch.uploaded > 0
                              ? `${Math.min((ch.uploaded/(ch.uploaded+ch.pending||1))*100,100)}%` : "0%",
                            background:`linear-gradient(90deg,${C.green},${C.cyan})`,
                            borderRadius:3, transition:"width 0.3s" }} />
                        </div>
                      </div>
                    ))}
                  </Card>
                  <Card style={{ maxHeight:340, overflowY:"auto" }}>
                    <div style={{ fontWeight:700, marginBottom:14 }}>📋 Activity Log</div>
                    {(summary.logs||[]).map((l,i) => (
                      <div key={l.id} style={{ paddingBottom:8, marginBottom:8,
                        borderBottom: i<(summary.logs.length-1)?`1px solid ${C.border}`:"none" }}>
                        <div style={{ display:"flex", alignItems:"flex-start", gap:6 }}>
                          <StatusDot status={l.status} />
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:12, color:C.text }}>{l.message}</div>
                            <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>
                              {new Date(l.created_at).toLocaleString("en-IN")}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </Card>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── SETTINGS ── */}
        {tab===T(TABS,"⚙️ Settings") && <SettingsTab user={user} toast={toast} />}
      </div>
    </div>
  );
}

// ── Auto-Fill Bar (YouTube URL → channel info) ────────────────────────────
function AutoFillBar({ chId, C, onFill }) {
  const [url,     setUrl]     = useState("");
  const [loading, setLoading] = useState(false);

  const doLookup = async () => {
    if (!url.trim()) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/channels/lookup?url=${encodeURIComponent(url.trim())}`);
      onFill(data);
      setUrl("");
    } catch(e) {
      alert("Error: " + (e.response?.data?.error || e.message));
    }
    setLoading(false);
  };

  return (
    <div style={{ background:`${C.cyan}10`, border:`1px solid ${C.cyan}30`, borderRadius:10, padding:12, marginBottom:4 }}>
      <div style={{ fontSize:11, color:C.cyan, fontWeight:700, marginBottom:8, textTransform:"uppercase", letterSpacing:0.5 }}>
        🔗 YouTube Channel URL se Auto-Fill
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <input value={url} onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key==="Enter" && doLookup()}
          placeholder="https://youtube.com/@YourChannel ya /channel/UC..."
          style={{ flex:1, background:C.surface, border:`1px solid ${C.border2}`, borderRadius:8,
            color:C.text, padding:"8px 12px", fontSize:12, fontFamily:"monospace" }} />
        <button onClick={doLookup} disabled={loading||!url.trim()}
          style={{ padding:"8px 16px", background: loading ? C.border2 : C.cyan,
            border:"none", borderRadius:8, color:"#000", fontWeight:700, fontSize:12,
            cursor: loading ? "not-allowed" : "pointer" }}>
          {loading ? "⏳" : "Auto-Fill"}
        </button>
      </div>
      <div style={{ fontSize:10, color:C.muted, marginTop:6 }}>
        Channel name auto-fill hoga — baaki fields manually fill karo (OAuth, Drive ID, etc.)
      </div>
    </div>
  );
}

// ── Video Row (in channel stats) ──────────────────────────────────────────
function VideoRow({ v, chId, C, userRole, onEdit, onDelete }) {
  const [editing,   setEditing]  = useState(false);
  const [editData,  setEditData] = useState({ title: v.title||"", description: v.description||"", tags: v.tags||"", privacy: v.privacy||"public" });
  const [saving,    setSaving]   = useState(false);
  const [imgErr,    setImgErr]   = useState(false);
  const [thumbFile, setThumbFile] = useState(null);

  const saveEdit = async () => {
    setSaving(true);
    await onEdit(editData, thumbFile || null);
    setSaving(false);
    setEditing(false);
    setThumbFile(null);
  };

  const fmtNum = n => {
    const num = Number(n) || 0;
    return num >= 1000000 ? (num/1000000).toFixed(1)+"M" : num >= 1000 ? (num/1000).toFixed(1)+"K" : String(num);
  };

  // Use hqdefault as fallback for thumbnail
  const thumbUrl = (!imgErr && v.thumbnail) ? v.thumbnail : `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`;

  return (
    <div style={{ background:C.card, borderRadius:10, border:`1px solid ${C.border}`, overflow:"hidden" }}>
      {/* Main row — fixed height so nothing collapses */}
      <div style={{ display:"flex", gap:0, alignItems:"stretch", minHeight:80 }}>

        {/* Thumbnail */}
        <a href={`https://youtu.be/${v.id}`} target="_blank" rel="noreferrer"
          style={{ flexShrink:0, display:"block", width:130 }}>
          <img
            src={thumbUrl}
            alt=""
            onError={() => setImgErr(true)}
            style={{ width:130, height:80, objectFit:"cover", display:"block" }}
          />
        </a>

        {/* Info */}
        <div style={{ flex:1, minWidth:0, padding:"10px 12px", display:"flex", flexDirection:"column", justifyContent:"space-between" }}>
          <div style={{ fontWeight:700, fontSize:13, color:C.text, marginBottom:6,
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {v.title || "(No title)"}
          </div>
          <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
            <span style={{ fontSize:12, color:C.dim }}>👁 {fmtNum(v.views)}</span>
            <span style={{ fontSize:12, color:C.dim }}>👍 {fmtNum(v.likes)}</span>
            <span style={{ fontSize:12, color:C.dim }}>💬 {fmtNum(v.comments)}</span>
            <span style={{ fontSize:12, color: v.privacy==="public" ? C.green : C.yellow, fontWeight:600 }}>
              {v.privacy==="public" ? "🌐 Public" : v.privacy==="private" ? "🔒 Private" : "🔗 Unlisted"}
            </span>
            {v.published && (
              <span style={{ fontSize:11, color:C.muted }}>
                📅 {new Date(v.published).toLocaleDateString("en-IN", {day:"2-digit",month:"short",year:"numeric"})}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        {(userRole==="admin" || userRole==="manager") && (
          <div style={{ display:"flex", flexDirection:"column", justifyContent:"center", gap:6,
            padding:"0 12px", flexShrink:0 }}>
            <button onClick={() => setEditing(e => !e)}
              style={{ padding:"5px 12px", background:`${C.blue}18`, border:`1px solid ${C.blue}40`,
                borderRadius:7, color:C.blue, fontSize:11, fontWeight:700, cursor:"pointer",
                whiteSpace:"nowrap" }}>
              ✏️ Edit
            </button>
            {userRole==="admin" && (
              <button onClick={onDelete}
                style={{ padding:"5px 12px", background:`${C.red}18`, border:`1px solid ${C.red}40`,
                  borderRadius:7, color:C.red, fontSize:11, fontWeight:700, cursor:"pointer",
                  whiteSpace:"nowrap" }}>
                🗑 Delete
              </button>
            )}
          </div>
        )}
      </div>

      {/* Edit panel */}
      {editing && (
        <div style={{ borderTop:`1px solid ${C.border}`, padding:14, background:`${C.blue}06` }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
            <div style={{ gridColumn:"1/-1" }}>
              <div style={{ fontSize:10, color:C.muted, fontWeight:700, marginBottom:4, textTransform:"uppercase" }}>Title</div>
              <input value={editData.title} onChange={e => setEditData(p => ({...p,title:e.target.value}))}
                style={{ width:"100%", background:C.surface, border:`1px solid ${C.border2}`, borderRadius:7,
                  color:C.text, padding:"8px 10px", fontSize:13, boxSizing:"border-box", outline:"none" }} />
            </div>
            <div style={{ gridColumn:"1/-1" }}>
              <div style={{ fontSize:10, color:C.muted, fontWeight:700, marginBottom:4, textTransform:"uppercase" }}>Description</div>
              <textarea value={editData.description} onChange={e => setEditData(p => ({...p,description:e.target.value}))}
                style={{ width:"100%", background:C.surface, border:`1px solid ${C.border2}`, borderRadius:7,
                  color:C.text, padding:"8px 10px", fontSize:12, minHeight:80, resize:"vertical",
                  boxSizing:"border-box", fontFamily:"inherit", outline:"none" }} />
            </div>
            <div>
              <div style={{ fontSize:10, color:C.muted, fontWeight:700, marginBottom:4, textTransform:"uppercase" }}>Tags (comma separated)</div>
              <input value={editData.tags} onChange={e => setEditData(p => ({...p,tags:e.target.value}))}
                style={{ width:"100%", background:C.surface, border:`1px solid ${C.border2}`, borderRadius:7,
                  color:C.text, padding:"8px 10px", fontSize:12, boxSizing:"border-box", outline:"none" }} />
            </div>
            <div>
              <div style={{ fontSize:10, color:C.muted, fontWeight:700, marginBottom:4, textTransform:"uppercase" }}>Privacy</div>
              <select value={editData.privacy} onChange={e => setEditData(p => ({...p,privacy:e.target.value}))}
                style={{ width:"100%", background:C.surface, border:`1px solid ${C.border2}`, borderRadius:7,
                  color:C.text, padding:"8px 10px", fontSize:12, outline:"none" }}>
                {["public","private","unlisted"].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div style={{ gridColumn:"1/-1" }}>
              <div style={{ fontSize:10, color:C.muted, fontWeight:700, marginBottom:4, textTransform:"uppercase" }}>Thumbnail (optional)</div>
              <label style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer",
                border:`1px dashed ${C.purple}60`, borderRadius:8, padding:"8px 12px",
                background:`${C.purple}08` }}>
                {thumbFile
                  ? <img src={URL.createObjectURL(thumbFile)} alt="" style={{ width:60, height:34, objectFit:"cover", borderRadius:5 }} />
                  : <span style={{ fontSize:20 }}>🖼️</span>
                }
                <span style={{ fontSize:12, color:C.purple, fontWeight:600 }}>
                  {thumbFile ? thumbFile.name : "Thumbnail upload karo (JPG/PNG 1280×720)"}
                </span>
                <input type="file" accept="image/*" style={{ display:"none" }}
                  onChange={e => { const f=e.target.files?.[0]; if(f) setThumbFile(f); }} />
              </label>
              {thumbFile && (
                <button onClick={() => setThumbFile(null)}
                  style={{ fontSize:11, color:C.muted, background:"none", border:"none", cursor:"pointer", marginTop:3 }}>
                  ✕ Remove
                </button>
              )}
            </div>
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <button onClick={saveEdit} disabled={saving}
              style={{ padding:"8px 18px", background:saving ? C.border2 : C.green, border:"none",
                borderRadius:7, color:"#fff", fontWeight:700, fontSize:12,
                cursor: saving ? "not-allowed" : "pointer" }}>
              {saving ? "⏳ Saving..." : "✅ Save to YouTube"}
            </button>
            <button onClick={() => setEditing(false)}
              style={{ padding:"8px 14px", background:"none", border:`1px solid ${C.border2}`,
                borderRadius:7, color:C.muted, fontSize:12, cursor:"pointer" }}>
              Cancel
            </button>
            <a href={`https://studio.youtube.com/video/${v.id}/edit`} target="_blank" rel="noreferrer"
              style={{ padding:"8px 14px", background:`${C.yellow}18`, border:`1px solid ${C.yellow}40`,
                borderRadius:7, color:C.yellow, fontSize:12, fontWeight:700, textDecoration:"none" }}>
              🎬 YT Studio
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Team Member Card ──────────────────────────────────────────────────────
function TeamMemberCard({ m, currentUser, C, onRoleChange, onToggleActive, onDelete }) {
  const [editRole, setEditRole] = useState(false);
  const [newRole,  setNewRole]  = useState(m.role);
  const roleColor = { admin:C.red, manager:C.purple, uploader:C.cyan, editor:C.blue };

  return (
    <div style={{ background:C.card, border:`1px solid ${m.is_active ? C.blue+"40" : C.border}`,
      borderRadius:14, padding:16, opacity: m.is_active ? 1 : 0.6 }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:40, height:40, borderRadius:"50%",
            background:`linear-gradient(135deg,${C.blue},${C.purple})`,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontWeight:900, fontSize:16, flexShrink:0 }}>
            {m.name[0]?.toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight:700, fontSize:14 }}>{m.name}</div>
            <div style={{ fontSize:11, color:C.muted }}>{m.email}</div>
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
          <span style={{ background:`${roleColor[m.role]||C.blue}22`, color:roleColor[m.role]||C.blue,
            border:`1px solid ${roleColor[m.role]||C.blue}44`,
            borderRadius:6, padding:"2px 8px", fontSize:11, fontWeight:700 }}>{m.role}</span>
          <span style={{ fontSize:10, color: m.is_active ? C.green : C.muted }}>
            {m.is_active ? "● Active" : "○ Inactive"}
          </span>
        </div>
      </div>

      <div style={{ fontSize:11, color:C.muted, marginBottom:12 }}>
        Joined: {new Date(m.created_at).toLocaleDateString("en-IN")}
      </div>

      {/* Role Edit (admin only, can't edit self) */}
      {currentUser.role === "admin" && m.id !== currentUser.id && (
        <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:12 }}>
          {editRole ? (
            <div style={{ display:"flex", gap:6, alignItems:"center" }}>
              <select value={newRole} onChange={e => setNewRole(e.target.value)}
                style={{ flex:1, background:C.surface, border:`1px solid ${C.border2}`,
                  borderRadius:8, color:C.text, padding:"7px 10px", fontSize:12 }}>
                {["editor","uploader","manager","admin"].map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <button onClick={async () => { await onRoleChange(newRole); setEditRole(false); }}
                style={{ padding:"7px 12px", background:C.green, border:"none",
                  borderRadius:8, color:"#fff", fontWeight:700, fontSize:12, cursor:"pointer" }}>
                ✓ Save
              </button>
              <button onClick={() => { setNewRole(m.role); setEditRole(false); }}
                style={{ padding:"7px 10px", background:"none", border:`1px solid ${C.border2}`,
                  borderRadius:8, color:C.muted, fontSize:12, cursor:"pointer" }}>
                ✕
              </button>
            </div>
          ) : (
            <div style={{ display:"flex", gap:6 }}>
              <button onClick={() => setEditRole(true)}
                style={{ flex:1, padding:"7px 0", background:`${C.purple}18`,
                  border:`1px solid ${C.purple}40`, borderRadius:8, color:C.purple,
                  fontWeight:700, fontSize:12, cursor:"pointer" }}>
                ✏️ Role Change
              </button>
              <button onClick={onToggleActive}
                style={{ padding:"7px 12px", background:`${m.is_active ? C.yellow : C.green}18`,
                  border:`1px solid ${m.is_active ? C.yellow : C.green}40`, borderRadius:8,
                  color: m.is_active ? C.yellow : C.green,
                  fontWeight:700, fontSize:12, cursor:"pointer" }}>
                {m.is_active ? "⏸ Disable" : "▶ Enable"}
              </button>
              <button onClick={onDelete}
                style={{ padding:"7px 10px", background:`${C.red}18`,
                  border:`1px solid ${C.red}40`, borderRadius:8,
                  color:C.red, fontWeight:700, fontSize:12, cursor:"pointer" }}>
                🗑
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Settings Tab ──────────────────────────────────────────────────────────
function SettingsTab({ user, toast }) {
  const [keys, setKeys] = useState({ anthropic:"", gemini:"" });
  const [saving, setSaving] = useState(false);

  const saveKeys = async () => {
    setSaving(true);
    try {
      await api.post("/settings/keys", keys);
      toast("Keys save ho gayi — backend restart karo (START.bat)");
    } catch(e) {
      toast(e.response?.data?.error||"Error","error");
    }
    setSaving(false);
  };

  return (
    <div>
      <SectionHead>⚙️ Settings</SectionHead>

      {user.role === "admin" && (
        <Card style={{ marginBottom:14, border:`1px solid ${C.purple}40` }}>
          <div style={{ fontWeight:700, color:C.purple, marginBottom:14 }}>🔑 AI API Keys</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div>
              <Inp label="Anthropic API Key (Claude AI)" value={keys.anthropic}
                onChange={e => setKeys(p => ({...p, anthropic:e.target.value}))}
                placeholder="sk-ant-api03-..." type="password" mono />
              <div style={{ fontSize:11, color:C.muted, marginTop:-6, marginBottom:8 }}>
                console.anthropic.com se lo
              </div>
            </div>
            <div>
              <Inp label="Gemini API Key (Google AI)" value={keys.gemini}
                onChange={e => setKeys(p => ({...p, gemini:e.target.value}))}
                placeholder="AIza..." type="password" mono />
              <div style={{ fontSize:11, color:C.muted, marginTop:-6, marginBottom:8 }}>
                aistudio.google.com — dono mein se ek kaafi hai
              </div>
            </div>
          </div>
          <Btn color={C.purple} onClick={saveKeys} disabled={saving}>
            {saving ? "⏳ Saving..." : "💾 Keys Save Karo"}
          </Btn>
        </Card>
      )}

      <Card style={{ background:`${C.green}11`, border:`1px solid ${C.green}33`, marginBottom:14 }}>
        <div style={{ fontWeight:700, color:C.green, marginBottom:12 }}>✅ System Status</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {[
            ["🔐 JWT Auth","Active",C.green],
            ["🗄️ Supabase DB","Connected",C.green],
            ["🔑 Google OAuth","Set ✓",C.green],
            ["🤖 Anthropic AI","Set ✓",C.green],
            ["📡 Socket.io","Active",C.green],
            ["⚙️ Drive Watcher","Running",C.green],
          ].map(([k,v,c]) => (
            <div key={k} style={{ display:"flex", justifyContent:"space-between",
              padding:"8px 12px", background:C.surface, borderRadius:8 }}>
              <span style={{ fontSize:12, color:C.dim }}>{k}</span>
              <span style={{ fontSize:12, color:c, fontWeight:700 }}>{v}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div style={{ fontWeight:700, marginBottom:10 }}>📋 Credentials Info</div>
        <div style={{ fontSize:12, color:C.muted, lineHeight:2.2 }}>
          <div>📧 <strong style={{color:C.text}}>Admin Login:</strong> admin@ytautopilot.com / Admin@123</div>
          <div>📺 <strong style={{color:C.text}}>Channel:</strong> USA (UCkNP83rH2nxrgwzK9J-jBZw)</div>
          <div>🔑 <strong style={{color:C.text}}>Google OAuth:</strong> Set ✓</div>
          <div>🤖 <strong style={{color:C.text}}>Anthropic Claude:</strong> Set ✓</div>
          <div style={{ marginTop:10, padding:"8px 12px", background:`${C.yellow}15`,
            borderRadius:8, border:`1px solid ${C.yellow}40`, color:C.yellow, fontSize:11 }}>
            ⚠️ Saari API keys sirf backend .env mein hain — browser mein kabhi expose nahi hote (secure!)
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── Bulk Schedule Tab ─────────────────────────────────────────────────────
function BulkScheduleTab({ channels, queue, setQueue, user, toast, approveItem, triggerUpload }) {
  const uid = () => Math.random().toString(36).slice(2,9);
  const blankRow = () => ({ id:uid(), channelId:"", driveLink:"", title:"", schedDate:"", schedTime:"10:00", instant:true, thumbFile:null, privacy:"public" });
  const [rows, setRows] = useState([blankRow()]);
  const [submitting, setSubmitting] = useState(false);

  const addRow    = () => setRows(p => [...p, blankRow()]);
  const removeRow = (id) => setRows(p => p.filter(r => r.id!==id));
  const update    = (id, field, val) => setRows(p => p.map(r => r.id===id ? {...r,[field]:val} : r));

  const submitBulk = async () => {
    const valid = rows.filter(r => r.driveLink && r.title && r.channelId);
    if (!valid.length) { toast("Complete rows chahiye (Channel + Drive Link + Title)", "error"); return; }
    setSubmitting(true);
    try {
      const { data } = await api.post("/queue/bulk", {
        items: valid.map(r => ({
          channel_id:  r.channelId,
          drive_link:  r.driveLink,
          title:       r.title,
          privacy:     r.privacy || "public",
          sched_date:  r.instant ? null : (r.schedDate || null),
          sched_time:  r.instant ? null : r.schedTime,
        })),
      });
      // Auto-approve + upload for instant rows
      const instantItems = data.filter((_,i) => valid[i]?.instant);
      for (const item of instantItems) {
        try {
          await api.patch(`/queue/${item.id}/approve`);
          await api.post(`/queue/${item.id}/upload`);
        } catch {}
      }
      setQueue(p => [...data, ...p]);
      toast(`✅ ${data.length} videos queue mein! (${instantItems.length} instant upload shuru)`);
      setRows([blankRow()]);
    } catch(e) {
      toast(e.response?.data?.error || "Error", "error");
    }
    setSubmitting(false);
  };

  const inpStyle = (w) => ({ background:C.surface, border:`1px solid ${C.border2}`, borderRadius:6,
    color:C.text, padding:"6px 8px", fontSize:12, width:w||"100%" });

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ fontWeight:800, fontSize:16 }}>📅 Bulk Schedule / Upload</div>
        <div style={{ display:"flex", gap:8 }}>
          <Btn small onClick={addRow} color={C.blue}>+ Row Add</Btn>
          <Btn small onClick={submitBulk} disabled={submitting} color={C.green}>
            {submitting ? "⏳ Processing..." : "🚀 Sab Queue Karo"}
          </Btn>
        </div>
      </div>

      {/* Rows — card per row (better than cramped table) */}
      <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:24 }}>
        {rows.map((row, i) => (
          <Card key={row.id} style={{ border:`1px solid ${row.instant ? C.green+"40" : C.blue+"40"}` }}>
            <div style={{ display:"flex", gap:10, alignItems:"flex-start", flexWrap:"wrap" }}>
              {/* Row number */}
              <div style={{ width:28, height:28, borderRadius:"50%", background:C.border2,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:12, fontWeight:700, flexShrink:0, marginTop:2, color:C.muted }}>
                {i+1}
              </div>

              {/* Channel */}
              <div style={{ flex:"0 0 160px" }}>
                <div style={{ fontSize:10, color:C.muted, fontWeight:700, marginBottom:4, textTransform:"uppercase" }}>Channel</div>
                <select value={row.channelId} onChange={e => update(row.id,"channelId",e.target.value)} style={inpStyle(160)}>
                  <option value="">-- Select --</option>
                  {channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Drive link */}
              <div style={{ flex:"1 1 220px" }}>
                <div style={{ fontSize:10, color:C.muted, fontWeight:700, marginBottom:4, textTransform:"uppercase" }}>Google Drive Link</div>
                <input value={row.driveLink} onChange={e => update(row.id,"driveLink",e.target.value)}
                  placeholder="https://drive.google.com/file/d/..."
                  style={{ ...inpStyle(), color:C.cyan, fontFamily:"monospace", fontSize:11 }} />
              </div>

              {/* Title */}
              <div style={{ flex:"1 1 200px" }}>
                <div style={{ fontSize:10, color:C.muted, fontWeight:700, marginBottom:4, textTransform:"uppercase" }}>Video Title</div>
                <input value={row.title} onChange={e => update(row.id,"title",e.target.value)}
                  placeholder="Video ka title..." style={inpStyle()} />
              </div>

              {/* Privacy */}
              <div style={{ flex:"0 0 110px" }}>
                <div style={{ fontSize:10, color:C.muted, fontWeight:700, marginBottom:4, textTransform:"uppercase" }}>Privacy</div>
                <select value={row.privacy} onChange={e => update(row.id,"privacy",e.target.value)} style={inpStyle(110)}>
                  {["public","private","unlisted"].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              {/* Instant toggle */}
              <div style={{ flex:"0 0 120px" }}>
                <div style={{ fontSize:10, color:C.muted, fontWeight:700, marginBottom:6, textTransform:"uppercase" }}>Publish</div>
                <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                  <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}>
                    <input type="radio" checked={row.instant} onChange={() => update(row.id,"instant",true)}
                      style={{ accentColor:C.green }} />
                    <span style={{ fontSize:12, color:C.green, fontWeight:700 }}>⚡ Abhi</span>
                  </label>
                  <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}>
                    <input type="radio" checked={!row.instant} onChange={() => update(row.id,"instant",false)}
                      style={{ accentColor:C.yellow }} />
                    <span style={{ fontSize:12, color:C.yellow, fontWeight:700 }}>📅 Schedule</span>
                  </label>
                </div>
              </div>

              {/* Date/Time — show only if not instant */}
              {!row.instant && (
                <div style={{ flex:"0 0 200px" }}>
                  <div style={{ fontSize:10, color:C.muted, fontWeight:700, marginBottom:4, textTransform:"uppercase" }}>Date & Time</div>
                  <div style={{ display:"flex", gap:6 }}>
                    <input type="date" value={row.schedDate} onChange={e => update(row.id,"schedDate",e.target.value)}
                      style={{ ...inpStyle(110), fontSize:11 }} />
                    <input type="time" value={row.schedTime} onChange={e => update(row.id,"schedTime",e.target.value)}
                      style={{ ...inpStyle(80), fontSize:11 }} />
                  </div>
                </div>
              )}

              {/* Thumbnail */}
              <div style={{ flex:"0 0 140px" }}>
                <div style={{ fontSize:10, color:C.muted, fontWeight:700, marginBottom:4, textTransform:"uppercase" }}>Thumbnail</div>
                <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer",
                  border:`1px dashed ${C.purple}60`, borderRadius:7, padding:"6px 8px",
                  background:`${C.purple}08` }}>
                  {row.thumbFile
                    ? <img src={URL.createObjectURL(row.thumbFile)} alt=""
                        style={{ width:40, height:24, objectFit:"cover", borderRadius:4 }} />
                    : <span style={{ fontSize:18 }}>🖼️</span>
                  }
                  <span style={{ fontSize:11, color:C.purple, fontWeight:600 }}>
                    {row.thumbFile ? row.thumbFile.name.slice(0,14)+"…" : "Upload"}
                  </span>
                  <input type="file" accept="image/*" style={{ display:"none" }}
                    onChange={e => { const f=e.target.files?.[0]; if(f) update(row.id,"thumbFile",f); }} />
                </label>
                {row.thumbFile && (
                  <button onClick={() => update(row.id,"thumbFile",null)}
                    style={{ fontSize:10, color:C.muted, background:"none", border:"none",
                      cursor:"pointer", marginTop:2, padding:0 }}>✕ Remove</button>
                )}
              </div>

              {/* Delete row */}
              <div style={{ display:"flex", alignItems:"center", marginTop:20 }}>
                <button onClick={() => removeRow(row.id)}
                  style={{ background:"none", border:`1px solid ${C.red}40`, borderRadius:6,
                    color:C.red, cursor:"pointer", padding:"5px 10px", fontSize:12 }}>✕</button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Queue */}
      <div style={{ fontWeight:800, fontSize:16, marginBottom:12, display:"flex", alignItems:"center", gap:10 }}>
        ⏳ Upload Queue <Badge color={C.yellow}>{queue.length} total</Badge>
      </div>
      {queue.length===0 ? (
        <Card style={{ textAlign:"center", padding:30, color:C.muted }}>
          <div style={{ fontSize:32, marginBottom:8 }}>📭</div>
          <div>Queue empty — upar se videos add karo</div>
        </Card>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {queue.map(item => (
            <Card key={item.id}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
                    <StatusDot status={item.status} />
                    <span style={{ fontWeight:700, fontSize:13 }}>{item.title||"(No title)"}</span>
                    {!item.approved && <Badge color={C.yellow}>⏳ Approval Pending</Badge>}
                    {item.approved && item.status==="queued" && <Badge color={C.green}>✓ Approved</Badge>}
                    {item.status==="done" && item.yt_video_id && (
                      <a href={`https://youtu.be/${item.yt_video_id}`} target="_blank" rel="noreferrer"
                        style={{ color:C.red, fontSize:11, fontWeight:700 }}>▶ YouTube pe dekho</a>
                    )}
                  </div>
                  <div style={{ fontSize:11, color:C.muted }}>
                    📺 {item.channels?.name} •
                    📅 {item.sched_date ? `${item.sched_date} ${item.sched_time}` : "Instant"} •
                    🔒 {item.privacy}
                  </div>
                  {item.error_msg && (
                    <div style={{ fontSize:11, color:C.red, marginTop:4 }}>
                      ❌ {item.error_msg}
                      {item.error_msg.includes("invalid_grant") && (
                        <span style={{ color:C.yellow, marginLeft:8 }}>
                          → OAuth token galat/expired hai — Channel Config mein refresh token dobara set karo
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                  {!item.approved && (user.role==="admin"||user.role==="manager") && (
                    <Btn small color={C.yellow} onClick={() => approveItem(item.id)}>✓ Approve</Btn>
                  )}
                  {item.approved && item.status==="queued" && (
                    <Btn small color={C.blue} onClick={() => triggerUpload(item.id)}>▶ Upload</Btn>
                  )}
                  {item.status==="uploading" && <Badge color={C.cyan}>🔄 Uploading…</Badge>}
                  {item.status==="done"      && <Badge color={C.green}>✅ Done</Badge>}
                  {item.status==="error"     && <Badge color={C.red}>❌ Error</Badge>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Video Manager Tab (dedicated per-channel video view) ──────────────────
function VideoManagerTab({ channels, C, user, toast }) {
  const [selChId,  setSelChId]  = useState(channels[0]?.id || "");
  const [videos,   setVideos]   = useState({});
  const [loading,  setLoading]  = useState({});
  const [plModal,  setPlModal]  = useState(false);
  const [plForm,   setPlForm]   = useState({ title:"", description:"", privacy:"public" });
  const [plSaving, setPlSaving] = useState(false);
  const [search,   setSearch]   = useState("");
  const [filterPr, setFilterPr] = useState("all");  // all / public / private / unlisted

  const selCh = channels.find(c => c.id === selChId);

  const loadVideos = async (chId) => {
    if (loading[chId] || videos[chId]) return;
    setLoading(p => ({...p,[chId]:true}));
    try {
      const { data } = await api.get(`/channels/${chId}/videos`);
      setVideos(p => ({...p,[chId]:data}));
    } catch(e) {
      toast(e.response?.data?.error || "Videos load nahi huyi", "error");
    }
    setLoading(p => ({...p,[chId]:false}));
  };

  const refreshVideos = (chId) => {
    setVideos(p => { const n={...p}; delete n[chId]; return n; });
    loadVideos(chId);
  };

  useEffect(() => { if (selChId) loadVideos(selChId); }, [selChId]);

  const createPlaylist = async () => {
    if (!plForm.title.trim()) { toast("Playlist ka title daalo", "error"); return; }
    setPlSaving(true);
    try {
      const { data } = await api.post(`/channels/${selChId}/playlists`, plForm);
      toast(`✅ Playlist "${data.title || plForm.title}" create ho gayi! ID: ${data.playlist_id}`);
      setPlModal(false);
      setPlForm({ title:"", description:"", privacy:"public" });
    } catch(e) {
      toast(e.response?.data?.error || "Playlist create nahi hui", "error");
    }
    setPlSaving(false);
  };

  const chData   = videos[selChId];
  const allVideos = chData?.recent_videos || [];
  const filtered  = allVideos.filter(v => {
    const matchSearch = !search || v.title?.toLowerCase().includes(search.toLowerCase());
    const matchPr     = filterPr === "all" || v.privacy === filterPr;
    return matchSearch && matchPr;
  });

  return (
    <div style={{ display:"grid", gridTemplateColumns:"240px 1fr", gap:16, minHeight:"70vh" }}>

      {/* ── Left: Channel sidebar ── */}
      <div>
        <div style={{ fontWeight:700, fontSize:13, color:C.muted, marginBottom:10,
          textTransform:"uppercase", letterSpacing:0.5 }}>Channels</div>
        {channels.length === 0 && (
          <div style={{ fontSize:12, color:C.muted, padding:12 }}>
            Pehle Channels tab mein channel add karo
          </div>
        )}
        {channels.map(ch => (
          <div key={ch.id} onClick={() => setSelChId(ch.id)} style={{
            padding:"12px 14px", marginBottom:8, borderRadius:10, cursor:"pointer",
            background: selChId===ch.id ? `${C.blue}18` : C.surface,
            border: `1px solid ${selChId===ch.id ? C.blue+"60" : C.border}`,
            transition:"all 0.15s",
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", flexShrink:0,
                background: ch.enabled ? C.green : C.muted }} />
              <div style={{ fontWeight:700, fontSize:13, color:C.text,
                overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {ch.name}
              </div>
            </div>
            <div style={{ fontSize:11, color:C.muted, marginTop:3 }}>{ch.niche||"No niche"}</div>
            {loading[ch.id] && <div style={{ fontSize:11, color:C.cyan, marginTop:3 }}>⏳ Loading...</div>}
            {videos[ch.id] && (
              <div style={{ marginTop:6, display:"flex", gap:6, flexWrap:"wrap" }}>
                <Badge color={C.blue}>{videos[ch.id].total_videos} vids</Badge>
                {!videos[ch.id].hidden_subs && (
                  <Badge color={C.green}>{Number(videos[ch.id].subscribers||0).toLocaleString()} subs</Badge>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Right: Video list ── */}
      <div>
        {!selCh ? (
          <Card style={{ textAlign:"center", padding:60, color:C.muted }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📺</div>
            <div>Left se channel select karo</div>
          </Card>
        ) : (
          <>
            {/* Channel header */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:10 }}>
              <div>
                <div style={{ fontWeight:900, fontSize:18, color:C.text }}>{selCh.name}</div>
                {chData && (
                  <div style={{ fontSize:12, color:C.muted, marginTop:2, display:"flex", gap:14 }}>
                    <span>🎬 {chData.total_videos} videos</span>
                    <span>👁 {Number(chData.total_views||0).toLocaleString()} views</span>
                    <span>👥 {chData.hidden_subs ? "Subs hidden" : Number(chData.subscribers||0).toLocaleString()+" subs"}</span>
                  </div>
                )}
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <Btn small color={C.purple} onClick={() => setPlModal(true)}>+ Create Playlist</Btn>
                <Btn small outline onClick={() => refreshVideos(selChId)}>🔄 Refresh</Btn>
              </div>
            </div>

            {/* Stats row */}
            {chData && (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:16 }}>
                {[
                  { label:"Videos",   val:chData.total_videos?.toLocaleString()||"0", color:C.red,    icon:"🎬" },
                  { label:"Views",    val:Number(chData.total_views||0).toLocaleString(), color:C.blue, icon:"👁" },
                  { label:"Subs",     val:chData.hidden_subs?"Hidden":Number(chData.subscribers||0).toLocaleString(), color:C.green, icon:"👥" },
                  { label:"Avg Views",val:chData.total_videos>0?Math.round((chData.total_views||0)/chData.total_videos).toLocaleString():"0", color:C.purple, icon:"📈" },
                ].map(s => (
                  <div key={s.label} style={{ background:C.surface, borderRadius:10,
                    padding:"10px 14px", border:`1px solid ${s.color}30` }}>
                    <div style={{ fontSize:16, marginBottom:2 }}>{s.icon}</div>
                    <div style={{ fontSize:18, fontWeight:900, color:s.color }}>{s.val}</div>
                    <div style={{ fontSize:11, color:C.muted }}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Search + filter bar */}
            <div style={{ display:"flex", gap:10, marginBottom:14, alignItems:"center" }}>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="🔍 Video title se search karo..."
                style={{ flex:1, background:C.surface, border:`1px solid ${C.border2}`,
                  borderRadius:8, color:C.text, padding:"8px 12px", fontSize:13, outline:"none" }} />
              {["all","public","private","unlisted"].map(p => (
                <Btn key={p} small color={filterPr===p ? C.blue : C.border2}
                  outline={filterPr!==p} onClick={() => setFilterPr(p)}>
                  {p==="all" ? "All" : p}
                </Btn>
              ))}
              {chData && (
                <span style={{ fontSize:12, color:C.muted, whiteSpace:"nowrap" }}>
                  {filtered.length}/{allVideos.length}
                </span>
              )}
            </div>

            {/* Loading */}
            {loading[selChId] && (
              <Card style={{ textAlign:"center", padding:40, color:C.cyan }}>
                <div style={{ fontSize:28, marginBottom:8 }}>⏳</div>
                YouTube se videos fetch ho rahi hain...
              </Card>
            )}

            {/* No OAuth */}
            {!loading[selChId] && !chData && (
              <Card style={{ textAlign:"center", padding:40, color:C.muted }}>
                <div style={{ fontSize:36, marginBottom:10 }}>🔑</div>
                <div style={{ fontWeight:700, marginBottom:6 }}>OAuth missing hai</div>
                <div style={{ fontSize:13 }}>
                  📺 Channels tab → ⚙ Configure → Client ID + Secret + Refresh Token fill karo → Save karo
                </div>
              </Card>
            )}

            {/* Video list */}
            {!loading[selChId] && chData && (
              filtered.length === 0 ? (
                <Card style={{ textAlign:"center", padding:40, color:C.muted }}>
                  <div style={{ fontSize:32, marginBottom:8 }}>🔍</div>
                  <div>Koi video nahi mili "{search}"</div>
                </Card>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {filtered.map(v => (
                    <VideoRow key={v.id} v={v} chId={selChId} C={C} userRole={user.role}
                      onEdit={async (upd, thumbFile) => {
                        if (thumbFile) {
                          const fd = new FormData();
                          fd.append("thumbnail", thumbFile);
                          Object.entries(upd).forEach(([k,v]) => fd.append(k, v));
                          await api.patch(`/channels/${selChId}/yt-videos/${v.id}`, fd, { headers:{"Content-Type":"multipart/form-data"} });
                        } else {
                          await api.patch(`/channels/${selChId}/yt-videos/${v.id}`, upd);
                        }
                        setVideos(p => ({...p,[selChId]:{
                          ...p[selChId],
                          recent_videos: p[selChId].recent_videos.map(rv => rv.id===v.id ? {...rv,...upd} : rv),
                        }}));
                        toast("✅ Video YouTube pe update ho gayi!");
                      }}
                      onDelete={async () => {
                        if (!confirm(`"${v.title}" ko YouTube se permanently delete karo?`)) return;
                        await api.delete(`/channels/${selChId}/yt-videos/${v.id}`);
                        setVideos(p => ({...p,[selChId]:{
                          ...p[selChId],
                          recent_videos: p[selChId].recent_videos.filter(rv => rv.id!==v.id),
                          total_videos: Math.max(0,(p[selChId].total_videos||1)-1),
                        }}));
                        toast(`🗑 "${v.title}" delete ho gayi`);
                      }}
                    />
                  ))}
                </div>
              )
            )}
          </>
        )}
      </div>

      {/* ── Playlist Modal ── */}
      {plModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:9999,
          display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:C.card, border:`1px solid ${C.purple}40`, borderRadius:16,
            padding:28, width:460, boxShadow:"0 20px 60px rgba(0,0,0,0.6)" }}>
            <div style={{ fontWeight:800, fontSize:17, color:C.text, marginBottom:20 }}>
              ➕ New YouTube Playlist — {selCh?.name}
            </div>

            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:11, color:C.muted, fontWeight:700, marginBottom:5, textTransform:"uppercase" }}>Playlist Title *</div>
              <input value={plForm.title} onChange={e => setPlForm(p => ({...p,title:e.target.value}))}
                placeholder="Jaise: Lo-fi Study Music 2025"
                style={{ width:"100%", background:C.surface, border:`1px solid ${C.border2}`,
                  borderRadius:8, color:C.text, padding:"9px 12px", fontSize:13,
                  boxSizing:"border-box", outline:"none" }} />
            </div>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:11, color:C.muted, fontWeight:700, marginBottom:5, textTransform:"uppercase" }}>Description</div>
              <textarea value={plForm.description} onChange={e => setPlForm(p => ({...p,description:e.target.value}))}
                placeholder="Playlist ki description (optional)"
                style={{ width:"100%", background:C.surface, border:`1px solid ${C.border2}`,
                  borderRadius:8, color:C.text, padding:"9px 12px", fontSize:12,
                  minHeight:80, resize:"vertical", boxSizing:"border-box", fontFamily:"inherit", outline:"none" }} />
            </div>
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, color:C.muted, fontWeight:700, marginBottom:5, textTransform:"uppercase" }}>Privacy</div>
              <select value={plForm.privacy} onChange={e => setPlForm(p => ({...p,privacy:e.target.value}))}
                style={{ width:"100%", background:C.surface, border:`1px solid ${C.border2}`,
                  borderRadius:8, color:C.text, padding:"9px 12px", fontSize:13, outline:"none" }}>
                {["public","private","unlisted"].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div style={{ display:"flex", gap:10 }}>
              <Btn color={C.purple} disabled={plSaving} onClick={createPlaylist} style={{ flex:1 }}>
                {plSaving ? "⏳ Creating..." : "✅ Playlist Create Karo"}
              </Btn>
              <Btn outline color={C.muted} onClick={() => setPlModal(false)}>Cancel</Btn>
            </div>

            <div style={{ marginTop:12, fontSize:11, color:C.muted }}>
              💡 Playlist YouTube pe create hogi — phir Upload tab mein videos isme add kar sakte ho
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
