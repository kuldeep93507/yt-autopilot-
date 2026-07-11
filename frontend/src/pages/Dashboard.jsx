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
const ALL_TABS = ["🏠 Dashboard","📺 Channels","📁 Drive Watch","🚀 Upload","📅 Bulk Schedule","👥 Team","📊 Analytics","⚙️ Settings"];
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

  // ── Channel update ──
  const updateCh = async (id, field, val) => {
    setChannels(p => p.map(c => c.id===id ? {...c,[field]:val} : c));
    await api.patch(`/channels/${id}`, { [field]: val });
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
            }>📺 Channel Settings</SectionHead>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {channels.map(ch => (
                <Card key={ch.id} glow={ch.enabled ? C.blue : null}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ width:34, height:34, background:"linear-gradient(135deg,#ff0000,#880000)",
                        borderRadius:8, display:"flex", alignItems:"center",
                        justifyContent:"center", fontSize:16 }}>▶</div>
                      <div>
                        <div style={{ fontWeight:800, fontSize:15 }}>{ch.name}</div>
                        <div style={{ fontSize:11, color:C.muted }}>
                          {ch.niche} • {ch.lang} • {ch.upload_time}
                        </div>
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                      <Toggle value={ch.enabled} onChange={v => updateCh(ch.id,"enabled",v)} label="Active" />
                      <Btn small color={C.cyan} outline
                        onClick={() => { loadChVideos(ch.id); setExpandedCh(ch.id); }}>
                        📊 Stats
                      </Btn>
                      <Btn small outline color={C.blue}
                        onClick={() => setExpandedCh(expandedCh===ch.id ? null : ch.id)}>
                        {expandedCh===ch.id ? "▲ Close" : "⚙ Configure"}
                      </Btn>
                      {user.role==="admin" && (
                        <Btn small outline color={C.red} onClick={() => removeCh(ch.id)}>✕</Btn>
                      )}
                    </div>
                  </div>

                  {expandedCh===ch.id && (
                    <div style={{ marginTop:16 }}>
                      <Divider />

                      {/* ── Stats Section ── */}
                      {chLoading[ch.id] && (
                        <div style={{ textAlign:"center", padding:20, color:C.cyan, fontSize:13 }}>
                          ⏳ YouTube se data fetch ho raha hai...
                        </div>
                      )}
                      {chVideos[ch.id] && !chLoading[ch.id] && (
                        <div style={{ marginBottom:18 }}>
                          {/* Stat cards */}
                          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:14 }}>
                            {[
                              { label:"Total Videos",   val: chVideos[ch.id].total_videos?.toLocaleString(),   color:C.red,    icon:"🎬" },
                              { label:"Total Views",    val: chVideos[ch.id].total_views?.toLocaleString(),    color:C.blue,   icon:"👁"  },
                              { label:"Subscribers",    val: chVideos[ch.id].hidden_subs ? "Hidden" : chVideos[ch.id].subscribers?.toLocaleString(), color:C.green, icon:"👥" },
                              { label:"Avg Views/Video",val: chVideos[ch.id].total_videos > 0
                                  ? Math.round(chVideos[ch.id].total_views / chVideos[ch.id].total_videos).toLocaleString()
                                  : "0", color:C.purple, icon:"📈" },
                            ].map(s => (
                              <div key={s.label} style={{ background:C.surface, borderRadius:10,
                                padding:"12px 14px", border:`1px solid ${s.color}30` }}>
                                <div style={{ fontSize:18, marginBottom:4 }}>{s.icon}</div>
                                <div style={{ fontSize:20, fontWeight:900, color:s.color }}>{s.val}</div>
                                <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{s.label}</div>
                              </div>
                            ))}
                          </div>

                          {/* Video list with edit/delete */}
                          {chVideos[ch.id].recent_videos?.length > 0 && (
                            <div>
                              <div style={{ fontWeight:700, fontSize:12, color:C.muted, marginBottom:8,
                                textTransform:"uppercase", letterSpacing:0.5 }}>
                                Videos ({chVideos[ch.id].recent_videos.length})
                              </div>
                              <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:420, overflowY:"auto" }}>
                                {chVideos[ch.id].recent_videos.map(v => (
                                  <VideoRow key={v.id} v={v} chId={ch.id} C={C}
                                    userRole={user.role}
                                    onEdit={async (upd) => {
                                      try {
                                        await api.patch(`/channels/${ch.id}/yt-videos/${v.id}`, upd);
                                        setChVideos(p => ({...p, [ch.id]: {
                                          ...p[ch.id],
                                          recent_videos: p[ch.id].recent_videos.map(rv =>
                                            rv.id===v.id ? {...rv,...upd} : rv)
                                        }}));
                                        toast("✅ Video update ho gayi YouTube pe!");
                                      } catch(e) { toast(e.response?.data?.error||"Error","error"); }
                                    }}
                                    onDelete={async () => {
                                      if (!confirm(`"${v.title}" ko YouTube se permanently delete karo?`)) return;
                                      try {
                                        await api.delete(`/channels/${ch.id}/yt-videos/${v.id}`);
                                        setChVideos(p => ({...p, [ch.id]: {
                                          ...p[ch.id],
                                          recent_videos: p[ch.id].recent_videos.filter(rv => rv.id!==v.id),
                                          total_videos: (p[ch.id].total_videos||1) - 1,
                                        }}));
                                        toast(`🗑 "${v.title}" delete ho gayi`);
                                      } catch(e) { toast(e.response?.data?.error||"Error","error"); }
                                    }}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                          <Divider />
                        </div>
                      )}

                      {/* ── Configure Section ── */}
                      {/* Auto-fill from YouTube URL */}
                      {user.role==="admin" && (
                        <AutoFillBar chId={ch.id} C={C}
                          onFill={(info) => {
                            updateCh(ch.id, "name", info.name);
                            toast(`✅ "${info.name}" ka data fill ho gaya! Subscribers: ${Number(info.subscribers).toLocaleString()}`);
                          }}
                        />
                      )}

                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginTop:12 }}>
                        <Inp label="Channel Name" value={ch.name||""} onChange={e => updateCh(ch.id,"name",e.target.value)} placeholder="My Channel" />
                        <Sel label="Niche" value={ch.niche||""} onChange={e => updateCh(ch.id,"niche",e.target.value)} options={["",...NICHES]} />
                        <Sel label="Language" value={ch.lang||"Hindi"} onChange={e => updateCh(ch.id,"lang",e.target.value)} options={LANGUAGES} />
                        <Inp label="OAuth Client ID" value={ch.client_id||""} onChange={e => updateCh(ch.id,"client_id",e.target.value)} placeholder="xxx.apps.googleusercontent.com" mono />
                        <Inp label="OAuth Client Secret" value={ch.client_secret||""} onChange={e => updateCh(ch.id,"client_secret",e.target.value)} placeholder="GOCSPX-..." type="password" mono />
                        <Inp label="Refresh Token" value={ch.refresh_token||""} onChange={e => updateCh(ch.id,"refresh_token",e.target.value)} placeholder="OAuth refresh token" type="password" mono />
                        <Inp label="Drive Folder ID" value={ch.drive_folder_id||""} onChange={e => updateCh(ch.id,"drive_folder_id",e.target.value)} placeholder="1BxiMVs0XRA5nFM..." mono />
                        <Inp label="Drive Folder Name" value={ch.drive_folder_name||""} onChange={e => updateCh(ch.id,"drive_folder_name",e.target.value)} placeholder="Channel 1 Videos" />
                        <Inp label="YouTube API Key (optional)" value={ch.youtube_api_key||""} onChange={e => updateCh(ch.id,"youtube_api_key",e.target.value)} placeholder="AIza..." type="password" mono />
                        <Inp label="Default Upload Time" value={ch.upload_time||"10:00"} onChange={e => updateCh(ch.id,"upload_time",e.target.value)} type="time" />
                        <Sel label="Privacy" value={ch.privacy||"public"} onChange={e => updateCh(ch.id,"privacy",e.target.value)} options={PRIVACY} />
                        <div>
                          <div style={{ fontSize:11, color:C.muted, fontWeight:700, marginBottom:8,
                            textTransform:"uppercase", letterSpacing:0.5 }}>Auto Watch</div>
                          <Toggle value={ch.auto_watch} onChange={v => updateCh(ch.id,"auto_watch",v)} label="Drive Auto-Watch" />
                          {ch.auto_watch && (
                            <div style={{ marginTop:8 }}>
                              <Inp label="Check Interval (min)" value={ch.watch_interval||5}
                                onChange={e => updateCh(ch.id,"watch_interval",parseInt(e.target.value))} />
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ marginTop:8, padding:10, background:C.surface,
                        borderRadius:8, fontSize:12, color:C.muted }}>
                        💡 <strong style={{ color:C.text }}>Drive Folder ID:</strong> Drive folder → URL mein /folders/ ke baad wala part copy karo
                      </div>
                    </div>
                  )}
                </Card>
              ))}
              {!channels.length && (
                <Card style={{ textAlign:"center", padding:40, color:C.muted }}>
                  <div style={{ fontSize:36, marginBottom:10 }}>📺</div>
                  <div>Koi channel nahi — + Add Channel se banao</div>
                </Card>
              )}
            </div>
          </div>
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
  const [editing,  setEditing]  = useState(false);
  const [editData, setEditData] = useState({ title: v.title, description: v.description||"", tags: v.tags||"", privacy: v.privacy||"public" });
  const [saving,   setSaving]   = useState(false);

  const saveEdit = async () => {
    setSaving(true);
    await onEdit(editData);
    setSaving(false);
    setEditing(false);
  };

  const fmtNum = n => n >= 1000000 ? (n/1000000).toFixed(1)+"M" : n >= 1000 ? (n/1000).toFixed(1)+"K" : String(n);

  return (
    <div style={{ background:C.surface, borderRadius:10, border:`1px solid ${C.border}`, overflow:"hidden" }}>
      {/* Main row */}
      <div style={{ display:"flex", gap:12, padding:10, alignItems:"flex-start" }}>
        <a href={`https://youtu.be/${v.id}`} target="_blank" rel="noreferrer" style={{ flexShrink:0 }}>
          {v.thumbnail
            ? <img src={v.thumbnail} alt="" style={{ width:120, height:68, objectFit:"cover", borderRadius:6 }} />
            : <div style={{ width:120, height:68, background:C.border, borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", fontSize:24 }}>▶</div>
          }
        </a>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:4, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {v.title}
          </div>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
            <span style={{ fontSize:11, color:C.muted }}>👁 {fmtNum(v.views||0)}</span>
            <span style={{ fontSize:11, color:C.muted }}>👍 {fmtNum(v.likes||0)}</span>
            <span style={{ fontSize:11, color:C.muted }}>💬 {fmtNum(v.comments||0)}</span>
            <span style={{ fontSize:11, color: v.privacy==="public" ? C.green : C.yellow }}>
              🔒 {v.privacy}
            </span>
            <span style={{ fontSize:11, color:C.muted }}>
              📅 {new Date(v.published).toLocaleDateString("en-IN")}
            </span>
          </div>
        </div>
        {(userRole==="admin"||userRole==="manager") && (
          <div style={{ display:"flex", gap:6, flexShrink:0 }}>
            <button onClick={() => setEditing(!editing)}
              style={{ padding:"5px 10px", background:`${C.blue}18`, border:`1px solid ${C.blue}40`,
                borderRadius:7, color:C.blue, fontSize:11, fontWeight:700, cursor:"pointer" }}>
              ✏️ Edit
            </button>
            {userRole==="admin" && (
              <button onClick={onDelete}
                style={{ padding:"5px 10px", background:`${C.red}18`, border:`1px solid ${C.red}40`,
                  borderRadius:7, color:C.red, fontSize:11, fontWeight:700, cursor:"pointer" }}>
                🗑
              </button>
            )}
          </div>
        )}
      </div>

      {/* Edit panel */}
      {editing && (
        <div style={{ borderTop:`1px solid ${C.border}`, padding:12, background:`${C.blue}08` }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
            <div style={{ gridColumn:"1/-1" }}>
              <div style={{ fontSize:10, color:C.muted, fontWeight:700, marginBottom:4, textTransform:"uppercase" }}>Title</div>
              <input value={editData.title} onChange={e => setEditData(p => ({...p,title:e.target.value}))}
                style={{ width:"100%", background:C.surface, border:`1px solid ${C.border2}`, borderRadius:7,
                  color:C.text, padding:"7px 10px", fontSize:12, boxSizing:"border-box" }} />
            </div>
            <div style={{ gridColumn:"1/-1" }}>
              <div style={{ fontSize:10, color:C.muted, fontWeight:700, marginBottom:4, textTransform:"uppercase" }}>Description</div>
              <textarea value={editData.description} onChange={e => setEditData(p => ({...p,description:e.target.value}))}
                style={{ width:"100%", background:C.surface, border:`1px solid ${C.border2}`, borderRadius:7,
                  color:C.text, padding:"7px 10px", fontSize:12, minHeight:70, resize:"vertical", boxSizing:"border-box", fontFamily:"inherit" }} />
            </div>
            <div>
              <div style={{ fontSize:10, color:C.muted, fontWeight:700, marginBottom:4, textTransform:"uppercase" }}>Tags (comma separated)</div>
              <input value={editData.tags} onChange={e => setEditData(p => ({...p,tags:e.target.value}))}
                style={{ width:"100%", background:C.surface, border:`1px solid ${C.border2}`, borderRadius:7,
                  color:C.text, padding:"7px 10px", fontSize:12, boxSizing:"border-box" }} />
            </div>
            <div>
              <div style={{ fontSize:10, color:C.muted, fontWeight:700, marginBottom:4, textTransform:"uppercase" }}>Privacy</div>
              <select value={editData.privacy} onChange={e => setEditData(p => ({...p,privacy:e.target.value}))}
                style={{ width:"100%", background:C.surface, border:`1px solid ${C.border2}`, borderRadius:7,
                  color:C.text, padding:"7px 10px", fontSize:12 }}>
                {["public","private","unlisted"].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={saveEdit} disabled={saving}
              style={{ padding:"7px 16px", background:C.green, border:"none", borderRadius:7,
                color:"#fff", fontWeight:700, fontSize:12, cursor: saving ? "not-allowed" : "pointer" }}>
              {saving ? "⏳ Saving..." : "✅ Save to YouTube"}
            </button>
            <button onClick={() => setEditing(false)}
              style={{ padding:"7px 12px", background:"none", border:`1px solid ${C.border2}`,
                borderRadius:7, color:C.muted, fontSize:12, cursor:"pointer" }}>
              Cancel
            </button>
            <a href={`https://studio.youtube.com/video/${v.id}/edit`} target="_blank" rel="noreferrer"
              style={{ padding:"7px 12px", background:`${C.yellow}18`, border:`1px solid ${C.yellow}40`,
                borderRadius:7, color:C.yellow, fontSize:12, fontWeight:700, textDecoration:"none" }}>
              🎬 YT Studio mein kholo
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

// ── Bulk Schedule Tab (separate to keep Dashboard lean) ────────────────────
function BulkScheduleTab({ channels, queue, setQueue, user, toast, approveItem, triggerUpload }) {
  const uid = () => Math.random().toString(36).slice(2,9);
  const [rows, setRows] = useState([
    { id:uid(), channelId:"", driveLink:"", title:"", schedDate:"", schedTime:"10:00" },
  ]);

  const addRow = () => setRows(p => [...p, { id:uid(), channelId:"", driveLink:"", title:"", schedDate:"", schedTime:"10:00" }]);
  const removeRow = (id) => setRows(p => p.filter(r => r.id!==id));
  const update = (id, field, val) => setRows(p => p.map(r => r.id===id ? {...r,[field]:val} : r));

  const submitBulk = async () => {
    const valid = rows.filter(r => r.driveLink && r.title && r.channelId);
    if (!valid.length) { toast("Complete rows chahiye", "error"); return; }
    const { data } = await api.post("/queue/bulk", {
      items: valid.map(r => ({
        channel_id: r.channelId, drive_link: r.driveLink, title: r.title,
        sched_date: r.schedDate || null, sched_time: r.schedTime,
      })),
    });
    setQueue(p => [...data, ...p]);
    toast(`✅ ${data.length} videos queue mein!`);
    setRows([{ id:uid(), channelId:"", driveLink:"", title:"", schedDate:"", schedTime:"10:00" }]);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ fontWeight:800, fontSize:16 }}>📅 Bulk Schedule</div>
        <div style={{ display:"flex", gap:8 }}>
          <Btn small onClick={addRow} color={C.blue}>+ Row</Btn>
          <Btn small onClick={submitBulk} color={C.green}>✅ Sab Queue Karo</Btn>
        </div>
      </div>

      <div style={{ overflowX:"auto", marginBottom:24 }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead>
            <tr style={{ borderBottom:`1px solid ${C.border}` }}>
              {["#","Channel","Drive Link","Title","Date","Time",""].map(h => (
                <th key={h} style={{ padding:"8px 10px", color:C.muted, fontWeight:700,
                  textAlign:"left", fontSize:11, textTransform:"uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row,i) => (
              <tr key={row.id} style={{ borderBottom:`1px solid ${C.border}` }}>
                <td style={{ padding:"8px 10px", color:C.muted }}>{i+1}</td>
                <td style={{ padding:"4px 8px" }}>
                  <select value={row.channelId} onChange={e => update(row.id,"channelId",e.target.value)}
                    style={{ background:C.surface, border:`1px solid ${C.border2}`, borderRadius:6,
                      color:C.text, padding:"6px 8px", fontSize:12, width:140 }}>
                    <option value="">Select…</option>
                    {channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </td>
                <td style={{ padding:"4px 8px" }}>
                  <input value={row.driveLink} onChange={e => update(row.id,"driveLink",e.target.value)}
                    placeholder="drive.google.com/..."
                    style={{ background:C.surface, border:`1px solid ${C.border2}`, borderRadius:6,
                      color:C.cyan, padding:"6px 8px", fontSize:11, width:190, fontFamily:"monospace" }} />
                </td>
                <td style={{ padding:"4px 8px" }}>
                  <input value={row.title} onChange={e => update(row.id,"title",e.target.value)}
                    placeholder="Video title..."
                    style={{ background:C.surface, border:`1px solid ${C.border2}`, borderRadius:6,
                      color:C.text, padding:"6px 8px", fontSize:12, width:180 }} />
                </td>
                <td style={{ padding:"4px 8px" }}>
                  <input type="date" value={row.schedDate} onChange={e => update(row.id,"schedDate",e.target.value)}
                    style={{ background:C.surface, border:`1px solid ${C.border2}`, borderRadius:6,
                      color:C.text, padding:"6px 8px", fontSize:12 }} />
                </td>
                <td style={{ padding:"4px 8px" }}>
                  <input type="time" value={row.schedTime} onChange={e => update(row.id,"schedTime",e.target.value)}
                    style={{ background:C.surface, border:`1px solid ${C.border2}`, borderRadius:6,
                      color:C.text, padding:"6px 8px", fontSize:12 }} />
                </td>
                <td style={{ padding:"4px 8px" }}>
                  <button onClick={() => removeRow(row.id)}
                    style={{ background:"none", border:`1px solid ${C.red}40`,
                      borderRadius:6, color:C.red, cursor:"pointer", padding:"4px 8px", fontSize:12 }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontWeight:800, fontSize:16, marginBottom:12 }}>
        ⏳ Upload Queue <Badge color={C.yellow}>{queue.length} total</Badge>
      </div>
      {queue.length===0 ? (
        <Card style={{ textAlign:"center", padding:30, color:C.muted }}>
          <div style={{ fontSize:32, marginBottom:8 }}>📭</div>
          <div>Queue empty — Upload ya Bulk Schedule se add karo</div>
        </Card>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {queue.map(item => (
            <Card key={item.id}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                    <StatusDot status={item.status} />
                    <span style={{ fontWeight:700, fontSize:13 }}>{item.title||"(No title)"}</span>
                    {!item.approved && <Badge color={C.yellow}>⏳ Approval Pending</Badge>}
                    {item.approved && item.status==="queued" && <Badge color={C.green}>✓ Approved</Badge>}
                    {item.status==="done" && item.yt_video_id && (
                      <a href={`https://youtu.be/${item.yt_video_id}`} target="_blank" rel="noreferrer"
                        style={{ color:C.red, fontSize:11 }}>▶ YouTube</a>
                    )}
                  </div>
                  <div style={{ fontSize:11, color:C.muted }}>
                    📺 {item.channels?.name} • 📅 {item.sched_date||"Aaj"} {item.sched_time} •
                    🔒 {item.privacy}
                  </div>
                  {item.error_msg && (
                    <div style={{ fontSize:11, color:C.red, marginTop:4 }}>❌ {item.error_msg}</div>
                  )}
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  {!item.approved && (user.role==="admin"||user.role==="manager") && (
                    <Btn small color={C.yellow} onClick={() => approveItem(item.id)}>✓ Approve</Btn>
                  )}
                  {item.approved && item.status==="queued" && (user.role==="admin"||user.role==="manager"||user.role==="uploader") && (
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
