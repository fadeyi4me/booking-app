import { useState, useEffect, useCallback } from "react";

// ============================================================
//  SUPABASE CONFIG — replace these two values after setup
//  See the "⚙ Setup" tab in the app for step-by-step help
// ============================================================
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

// Lightweight Supabase REST helper (no npm package needed)
const supabase = {
  async select(table, filters = "") {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filters}&order=created_at.desc`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async insert(table, data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async delete(table, id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (!res.ok) throw new Error(await res.text());
  },
};

const IS_CONFIGURED = SUPABASE_URL !== "YOUR_SUPABASE_URL";

// ============================================================
const SERVICES = [
  { id: 1, name: "Haircut & Style", duration: 60, price: 65, icon: "✂️" },
  { id: 2, name: "Color Treatment", duration: 120, price: 120, icon: "🎨" },
  { id: 3, name: "Deep Conditioning", duration: 45, price: 45, icon: "💧" },
  { id: 4, name: "Blowout", duration: 30, price: 35, icon: "💨" },
];

const STAFF = [
  { id: 1, name: "Jordan Lee", role: "Senior Stylist", avatar: "JL" },
  { id: 2, name: "Maya Chen", role: "Color Specialist", avatar: "MC" },
  { id: 3, name: "Alex Rivera", role: "Style Director", avatar: "AR" },
];

const TIME_SLOTS = [
  "9:00 AM","9:30 AM","10:00 AM","10:30 AM","11:00 AM","11:30 AM",
  "12:00 PM","12:30 PM","1:00 PM","1:30 PM","2:00 PM","2:30 PM",
  "3:00 PM","3:30 PM","4:00 PM","4:30 PM","5:00 PM",
];

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function getDaysInMonth(year, month) {
  const days = [];
  const firstDay = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= totalDays; d++) days.push(d);
  return days;
}

const SQL_SETUP = `-- Run this in Supabase SQL Editor (Database → SQL Editor → New Query)

create table bookings (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  name text not null,
  email text not null,
  phone text not null,
  notes text,
  service text not null,
  staff text not null,
  staff_id integer not null,
  date text not null,
  time text not null
);

-- Allow public read/write (fine for demo).
-- In production: tighten with Row Level Security.
alter table bookings enable row level security;
create policy "Public read" on bookings for select using (true);
create policy "Public insert" on bookings for insert with check (true);
create policy "Public delete" on bookings for delete using (true);`;

export default function BookingApp() {
  const today = new Date();
  const [activeTab, setActiveTab] = useState("book");
  const [step, setStep] = useState(1);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", notes: "" });
  const [submitted, setSubmitted] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [bookedSlots, setBookedSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dbError, setDbError] = useState(null);
  const [copied, setCopied] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const dateStr = selectedDate ? `${MONTHS[calMonth]} ${selectedDate}, ${calYear}` : null;

  const fetchBookings = useCallback(async () => {
    if (!IS_CONFIGURED) return;
    setLoading(true); setDbError(null);
    try {
      const data = await supabase.select("bookings");
      setBookings(data);
      setBookedSlots(data.map(b => ({ staff_id: b.staff_id, date: b.date, time: b.time })));
    } catch (e) { setDbError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  useEffect(() => {
    if (!IS_CONFIGURED || !selectedDate || !selectedStaff) return;
    (async () => {
      try {
        const data = await supabase.select("bookings",
          `staff_id=eq.${selectedStaff.id}&date=eq.${encodeURIComponent(dateStr)}&select=time`);
        setBookedSlots(prev => {
          const filtered = prev.filter(s => !(s.staff_id === selectedStaff.id && s.date === dateStr));
          return [...filtered, ...data.map(d => ({ staff_id: selectedStaff.id, date: dateStr, time: d.time }))];
        });
      } catch (_) {}
    })();
  }, [selectedDate, selectedStaff, dateStr]);

  const takenSlots = (selectedStaff && dateStr)
    ? bookedSlots.filter(s => s.staff_id === selectedStaff.id && s.date === dateStr).map(s => s.time)
    : [];

  async function handleBook() {
    setSaving(true); setDbError(null);
    const record = {
      name: form.name, email: form.email, phone: form.phone, notes: form.notes,
      service: selectedService.name, staff: selectedStaff.name,
      staff_id: selectedStaff.id, date: dateStr, time: selectedTime,
    };
    try {
      if (IS_CONFIGURED) {
        const [saved] = await supabase.insert("bookings", record);
        setBookings(prev => [saved, ...prev]);
        setBookedSlots(prev => [...prev, { staff_id: selectedStaff.id, date: dateStr, time: selectedTime }]);
      } else {
        setBookings(prev => [{ id: Date.now(), ...record, created_at: new Date().toISOString() }, ...prev]);
      }
      setSubmitted(true);
    } catch (e) { setDbError("Booking failed: " + e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id) {
    setDeleting(id);
    try {
      if (IS_CONFIGURED) await supabase.delete("bookings", id);
      setBookings(prev => prev.filter(b => b.id !== id));
    } catch (e) { setDbError("Delete failed: " + e.message); }
    finally { setDeleting(null); }
  }

  function reset() {
    setStep(1); setSelectedService(null); setSelectedStaff(null);
    setSelectedDate(null); setSelectedTime(null);
    setForm({ name:"", email:"", phone:"", notes:"" });
    setSubmitted(false); setDbError(null);
  }

  const revenue = bookings.reduce((a, b) => {
    const s = SERVICES.find(s => s.name === b.service);
    return a + (s ? s.price : 0);
  }, 0);

  const days = getDaysInMonth(calYear, calMonth);

  return (
    <div style={{ fontFamily: "Georgia, serif", minHeight: "100vh", background: "#0d0d0d", color: "#f0ece4" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&family=Jost:wght@300;400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        .af{font-family:'Cormorant Garamond',Georgia,serif}
        .bf{font-family:'Jost',sans-serif}
        .gold{color:#c9a96e}
        .card{background:#161616;border:1px solid #2a2a2a;border-radius:2px;transition:all .25s}
        .card:hover{border-color:#c9a96e}
        .card.sel{border-color:#c9a96e;background:#1c1a14}
        .card.noh:hover{border-color:#2a2a2a}
        .bg{background:#c9a96e;color:#0d0d0d;border:none;padding:14px 32px;font-family:'Jost',sans-serif;font-weight:500;font-size:13px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;transition:all .2s}
        .bg:hover{background:#e0be82}
        .bg:disabled{background:#333;color:#666;cursor:not-allowed}
        .bo{background:transparent;color:#c9a96e;border:1px solid #c9a96e;padding:13px 32px;font-family:'Jost',sans-serif;font-size:13px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;transition:all .2s}
        .bo:hover{background:#c9a96e22}
        .bsm{padding:7px 16px!important;font-size:11px!important}
        .inp{background:#111;border:1px solid #2a2a2a;color:#f0ece4;padding:12px 16px;font-family:'Jost',sans-serif;font-size:14px;width:100%;outline:none;border-radius:1px;transition:border-color .2s}
        .inp:focus{border-color:#c9a96e}
        .ts{background:#161616;border:1px solid #2a2a2a;color:#aaa;padding:8px 12px;font-family:'Jost',sans-serif;font-size:12px;cursor:pointer;letter-spacing:.5px;transition:all .2s;text-align:center}
        .ts:hover:not(.bk){border-color:#c9a96e;color:#f0ece4}
        .ts.act{background:#c9a96e;color:#0d0d0d;border-color:#c9a96e;font-weight:500}
        .ts.bk{opacity:.3;cursor:not-allowed;text-decoration:line-through}
        .cd{aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-family:'Jost',sans-serif;font-size:13px;cursor:pointer;border-radius:50%;transition:all .15s;color:#aaa}
        .cd:hover:not(.past):not(.emp){background:#2a2a2a;color:#f0ece4}
        .cd.sel2{background:#c9a96e!important;color:#0d0d0d!important;font-weight:600}
        .cd.past{opacity:.25;cursor:default}
        .cd.tod{color:#c9a96e;font-weight:600}
        .cd.emp{cursor:default}
        .nt{font-family:'Jost',sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;padding:8px 20px;cursor:pointer;border-bottom:2px solid transparent;transition:all .2s;color:#555;background:none;border-top:none;border-left:none;border-right:none}
        .nt:hover{color:#aaa}
        .nt.act2{color:#c9a96e;border-bottom-color:#c9a96e}
        .br{border-bottom:1px solid #1a1a1a;padding:14px 0}
        .tg{display:inline-block;padding:3px 10px;font-family:'Jost',sans-serif;font-size:10px;letter-spacing:1px;text-transform:uppercase}
        .dbb{background:#1a1000;border:1px solid #c9a96e44;padding:12px 20px;display:flex;align-items:center;gap:12px}
        .cb{background:#111;border:1px solid #2a2a2a;border-radius:2px;padding:20px;font-family:'Courier New',monospace;font-size:12px;color:#aaa;line-height:1.7;white-space:pre;overflow-x:auto}
        .sn{width:28px;height:28px;border-radius:50%;background:#c9a96e;color:#0d0d0d;display:flex;align-items:center;justify-content:center;font-family:'Jost',sans-serif;font-size:12px;font-weight:500;flex-shrink:0}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        .fu{animation:fadeUp .35s ease forwards}
        @keyframes spin{to{transform:rotate(360deg)}}
        .sp{width:18px;height:18px;border:2px solid #333;border-top-color:#c9a96e;border-radius:50%;animation:spin .7s linear infinite;display:inline-block}
        .sh::-webkit-scrollbar{display:none}
        .cf{position:absolute;width:6px;height:6px;border-radius:50%;animation:fall 3s ease-in forwards}
        @keyframes fall{0%{transform:translateY(-20px) rotate(0deg);opacity:1}100%{transform:translateY(400px) rotate(720deg);opacity:0}}
        .db{background:none;border:none;color:#444;cursor:pointer;font-size:16px;padding:4px 8px;transition:color .2s}
        .db:hover{color:#c0392b}
        .dv{border:none;border-top:1px solid #1e1e1e;margin:0}
      `}</style>

      {/* Header */}
      <header style={{borderBottom:"1px solid #1e1e1e",padding:"20px 40px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <h1 className="af" style={{fontSize:28,fontWeight:300,letterSpacing:4}}>LUMIÈRE</h1>
          <p className="bf" style={{fontSize:10,letterSpacing:3,color:"#6b6b6b",textTransform:"uppercase",marginTop:2}}>Hair & Beauty Studio</p>
        </div>
        <div style={{display:"flex",gap:0,borderBottom:"1px solid #1e1e1e"}}>
          {[["book","Book"],["admin","Admin"],["setup","⚙ Setup"]].map(([id,label])=>(
            <button key={id} className={`nt ${activeTab===id?"act2":""}`} onClick={()=>setActiveTab(id)}>{label}</button>
          ))}
        </div>
      </header>

      {/* Banners */}
      {!IS_CONFIGURED && activeTab!=="setup" && (
        <div className="dbb">
          <span style={{fontSize:18}}>⚠️</span>
          <p className="bf" style={{fontSize:12,color:"#c9a96e"}}>
            <strong>Demo mode</strong> — bookings won't persist between sessions.{" "}
            <span style={{textDecoration:"underline",cursor:"pointer"}} onClick={()=>setActiveTab("setup")}>Go to Setup</span> to connect your Supabase database.
          </p>
        </div>
      )}
      {IS_CONFIGURED && dbError && (
        <div className="dbb" style={{background:"#1a0000",borderColor:"#c0392b44"}}>
          <span>❌</span>
          <p className="bf" style={{fontSize:12,color:"#e74c3c"}}>{dbError}</p>
        </div>
      )}

      {/* ── SETUP TAB ── */}
      {activeTab==="setup" && (
        <div style={{maxWidth:760,margin:"0 auto",padding:"48px 24px"}} className="fu">
          <h2 className="af" style={{fontSize:38,fontWeight:300,marginBottom:6}}>Database Setup</h2>
          <p className="bf" style={{color:"#555",fontSize:13,marginBottom:40}}>Connect Supabase in 4 steps — takes about 5 minutes, completely free</p>
          {[
            {n:1,title:"Create a free Supabase project",body:<>Go to <a href="https://supabase.com" target="_blank" rel="noreferrer" style={{color:"#c9a96e"}}>supabase.com</a> → New Project. Give it a name like <em>lumiere-booking</em> and set a database password. Wait ~60 seconds for it to provision.</>},
            {n:2,title:"Create the bookings table",body:<>In your project go to <strong style={{color:"#f0ece4"}}>Database → SQL Editor → New Query</strong>. Paste and run the SQL below:</>,code:SQL_SETUP},
            {n:3,title:"Get your API credentials",body:<>Go to <strong style={{color:"#f0ece4"}}>Project Settings → API</strong>. Copy your <strong style={{color:"#f0ece4"}}>Project URL</strong> and the <strong style={{color:"#f0ece4"}}>anon public</strong> key.</>},
            {n:4,title:"Paste credentials into the app",body:<>Open <code style={{color:"#c9a96e",background:"#111",padding:"2px 6px"}}>booking-app.jsx</code> and replace the two constants at the very top of the file:</>,code:`const SUPABASE_URL = "https://xxxxxxxxxxxx.supabase.co";\nconst SUPABASE_ANON_KEY = "eyJhbGci...your-anon-key...";`},
          ].map(s=>(
            <div key={s.n} style={{display:"flex",gap:20,marginBottom:36}}>
              <div style={{paddingTop:2}}><div className="sn">{s.n}</div></div>
              <div style={{flex:1}}>
                <h3 className="af" style={{fontSize:22,fontWeight:300,marginBottom:8}}>{s.title}</h3>
                <p className="bf" style={{fontSize:13,color:"#777",lineHeight:1.7}}>{s.body}</p>
                {s.code&&(
                  <div style={{position:"relative",marginTop:14}}>
                    <div className="cb">{s.code}</div>
                    <button className="bg bsm" style={{position:"absolute",top:12,right:12,padding:"6px 14px",fontSize:10,letterSpacing:1}}
                      onClick={()=>{navigator.clipboard.writeText(s.code);setCopied(s.n);setTimeout(()=>setCopied(null),2000)}}>
                      {copied===s.n?"Copied ✓":"Copy"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div className="card noh" style={{padding:24,background:"#0d1a0d",borderColor:"#1e4d1e"}}>
            <p className="bf" style={{fontSize:12,color:"#4caf50",lineHeight:1.8}}>
              ✅ <strong>That's it.</strong> After pasting your credentials and redeploying, every booking saves to Supabase in real time. The Admin tab shows live data, booked time slots are automatically blocked on the calendar, and you can delete bookings from the dashboard.
            </p>
          </div>
        </div>
      )}

      {/* ── ADMIN TAB ── */}
      {activeTab==="admin" && (
        <div style={{maxWidth:960,margin:"0 auto",padding:"48px 24px"}} className="fu">
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:32}}>
            <div>
              <h2 className="af" style={{fontSize:36,fontWeight:300}}>Appointments</h2>
              <p className="bf" style={{color:"#555",fontSize:13,marginTop:4}}>{IS_CONFIGURED?"Live from Supabase":"Demo mode — connect DB to persist data"}</p>
            </div>
            <div style={{display:"flex",gap:12,alignItems:"center"}}>
              {loading&&<div className="sp"/>}
              <button className="bo bsm" onClick={fetchBookings}>↻ Refresh</button>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16,marginBottom:36}}>
            {[
              {label:"Total Bookings",value:bookings.length},
              {label:"Unique Clients",value:new Set(bookings.map(b=>b.email)).size},
              {label:"Projected Revenue",value:`$${revenue}`},
            ].map(s=>(
              <div key={s.label} className="card noh" style={{padding:"20px 24px"}}>
                <p className="bf" style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"#555"}}>{s.label}</p>
                <p className="af gold" style={{fontSize:40,fontWeight:300,lineHeight:1.1,marginTop:6}}>{s.value}</p>
              </div>
            ))}
          </div>
          <div className="card noh" style={{padding:"0 24px"}}>
            <div style={{padding:"14px 0",borderBottom:"1px solid #222",display:"grid",gridTemplateColumns:"2fr 1.5fr 1.2fr 1fr 1fr 40px",gap:12}}>
              {["Client","Service","Stylist","Date","Time",""].map((h,i)=>(
                <p key={i} className="bf" style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"#444"}}>{h}</p>
              ))}
            </div>
            {bookings.length===0&&(
              <p className="bf" style={{padding:"32px 0",color:"#333",fontSize:13}}>
                {loading?"Loading...":"No bookings yet — make one to see it appear here instantly."}
              </p>
            )}
            {bookings.map(b=>(
              <div key={b.id} className="br" style={{display:"grid",gridTemplateColumns:"2fr 1.5fr 1.2fr 1fr 1fr 40px",gap:12,alignItems:"center"}}>
                <div>
                  <p className="bf" style={{fontSize:14,color:"#f0ece4"}}>{b.name}</p>
                  <p className="bf" style={{fontSize:11,color:"#444",marginTop:2}}>{b.email}</p>
                </div>
                <span className="tg" style={{background:"#c9a96e18",color:"#c9a96e",border:"1px solid #c9a96e33"}}>{b.service}</span>
                <p className="bf" style={{fontSize:13,color:"#888"}}>{b.staff}</p>
                <p className="bf" style={{fontSize:13,color:"#888"}}>{b.date}</p>
                <p className="bf" style={{fontSize:13,color:"#c9a96e"}}>{b.time}</p>
                <button className="db" title="Cancel booking" onClick={()=>handleDelete(b.id)} disabled={deleting===b.id}>
                  {deleting===b.id?<span className="sp" style={{width:14,height:14}}/>:"✕"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── BOOKING FLOW ── */}
      {activeTab==="book" && !submitted && (
        <div style={{maxWidth:780,margin:"0 auto",padding:"48px 24px"}}>
          {/* Step dots */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:0,marginBottom:48}}>
            {[1,2,3,4].map((s,i)=>(
              <div key={s} style={{display:"flex",alignItems:"center"}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:step===s?"#c9a96e":step>s?"#6b5a3e":"#2a2a2a",transition:"background .3s"}}/>
                {i<3&&<div style={{width:40,height:1,background:step>s?"#6b5a3e":"#2a2a2a"}}/>}
              </div>
            ))}
          </div>

          {step===1&&(
            <div className="fu">
              <h2 className="af" style={{fontSize:38,fontWeight:300,marginBottom:6}}>Select a Service</h2>
              <p className="bf" style={{color:"#555",fontSize:13,marginBottom:32}}>Choose what you'd like done today</p>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                {SERVICES.map(s=>(
                  <div key={s.id} className={`card ${selectedService?.id===s.id?"sel":""}`} style={{padding:"28px 24px",cursor:"pointer"}} onClick={()=>setSelectedService(s)}>
                    <div style={{fontSize:28,marginBottom:12}}>{s.icon}</div>
                    <h3 className="af" style={{fontSize:22,fontWeight:300}}>{s.name}</h3>
                    <div style={{display:"flex",justifyContent:"space-between",marginTop:16,alignItems:"center"}}>
                      <p className="bf" style={{fontSize:12,color:"#555"}}>{s.duration} min</p>
                      <p className="af gold" style={{fontSize:22}}>${s.price}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",justifyContent:"flex-end",marginTop:32}}>
                <button className="bg" disabled={!selectedService} onClick={()=>setStep(2)}>Continue</button>
              </div>
            </div>
          )}

          {step===2&&(
            <div className="fu">
              <h2 className="af" style={{fontSize:38,fontWeight:300,marginBottom:6}}>Choose Your Stylist</h2>
              <p className="bf" style={{color:"#555",fontSize:13,marginBottom:32}}>Select who you'd like to work with</p>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}}>
                {STAFF.map(s=>(
                  <div key={s.id} className={`card ${selectedStaff?.id===s.id?"sel":""}`} style={{padding:"32px 24px",cursor:"pointer",textAlign:"center"}} onClick={()=>setSelectedStaff(s)}>
                    <div style={{width:64,height:64,borderRadius:"50%",background:selectedStaff?.id===s.id?"#c9a96e":"#2a2a2a",color:selectedStaff?.id===s.id?"#0d0d0d":"#888",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontFamily:"Jost,sans-serif",fontSize:16,fontWeight:500,transition:"all .2s"}}>{s.avatar}</div>
                    <h3 className="af" style={{fontSize:20,fontWeight:300}}>{s.name}</h3>
                    <p className="bf" style={{fontSize:12,color:"#555",marginTop:6}}>{s.role}</p>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:32}}>
                <button className="bo" onClick={()=>setStep(1)}>Back</button>
                <button className="bg" disabled={!selectedStaff} onClick={()=>setStep(3)}>Continue</button>
              </div>
            </div>
          )}

          {step===3&&(
            <div className="fu">
              <h2 className="af" style={{fontSize:38,fontWeight:300,marginBottom:6}}>Pick a Date & Time</h2>
              <p className="bf" style={{color:"#555",fontSize:13,marginBottom:32}}>
                {IS_CONFIGURED?"Booked slots load live from the database":"Demo mode — slots not synced to DB"}
              </p>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:32}}>
                <div className="card noh" style={{padding:24}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
                    <button onClick={()=>{if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1)}else setCalMonth(m=>m-1)}} style={{background:"none",border:"none",color:"#aaa",cursor:"pointer",fontSize:18,padding:"4px 8px"}}>‹</button>
                    <p className="af" style={{fontSize:18,fontWeight:300}}>{MONTHS[calMonth]} {calYear}</p>
                    <button onClick={()=>{if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1)}else setCalMonth(m=>m+1)}} style={{background:"none",border:"none",color:"#aaa",cursor:"pointer",fontSize:18,padding:"4px 8px"}}>›</button>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:8}}>
                    {DAYS.map(d=><p key={d} className="bf" style={{textAlign:"center",fontSize:10,color:"#444",letterSpacing:1,padding:"4px 0"}}>{d}</p>)}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
                    {days.map((day,i)=>{
                      const isPast=day&&new Date(calYear,calMonth,day)<new Date(today.getFullYear(),today.getMonth(),today.getDate());
                      const isToday=day===today.getDate()&&calMonth===today.getMonth()&&calYear===today.getFullYear();
                      return(
                        <div key={i} className={`cd ${!day?"emp":""} ${isPast?"past":""} ${isToday?"tod":""} ${selectedDate===day?"sel2":""}`}
                          onClick={()=>{if(!isPast&&day){setSelectedDate(day);setSelectedTime(null)}}}>
                          {day}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="bf" style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:"#555",marginBottom:16}}>
                    {selectedDate?`${MONTHS[calMonth].slice(0,3)} ${selectedDate} — Available Times`:"Select a date first"}
                  </p>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,maxHeight:320,overflowY:"auto"}} className="sh">
                    {selectedDate?TIME_SLOTS.map(t=>(
                      <div key={t} className={`ts ${takenSlots.includes(t)?"bk":""} ${selectedTime===t?"act":""}`}
                        onClick={()=>!takenSlots.includes(t)&&setSelectedTime(t)}>
                        {t}
                      </div>
                    )):(
                      <p className="bf" style={{fontSize:13,color:"#333",gridColumn:"span 2"}}>← Pick a date on the calendar</p>
                    )}
                  </div>
                </div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:32}}>
                <button className="bo" onClick={()=>setStep(2)}>Back</button>
                <button className="bg" disabled={!selectedDate||!selectedTime} onClick={()=>setStep(4)}>Continue</button>
              </div>
            </div>
          )}

          {step===4&&(
            <div className="fu">
              <h2 className="af" style={{fontSize:38,fontWeight:300,marginBottom:6}}>Your Details</h2>
              <p className="bf" style={{color:"#555",fontSize:13,marginBottom:32}}>Almost done — just a few things</p>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:40}}>
                <div style={{display:"flex",flexDirection:"column",gap:16}}>
                  {[
                    {key:"name",label:"Full Name",placeholder:"Your full name",type:"text"},
                    {key:"email",label:"Email Address",placeholder:"you@example.com",type:"email"},
                    {key:"phone",label:"Phone Number",placeholder:"(555) 000-0000",type:"tel"},
                  ].map(f=>(
                    <div key={f.key}>
                      <label className="bf" style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"#555",display:"block",marginBottom:8}}>{f.label}</label>
                      <input className="inp" type={f.type} placeholder={f.placeholder} value={form[f.key]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))}/>
                    </div>
                  ))}
                  <div>
                    <label className="bf" style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"#555",display:"block",marginBottom:8}}>Notes (optional)</label>
                    <textarea className="inp" placeholder="Any special requests..." rows={3} style={{resize:"none"}} value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))}/>
                  </div>
                  {dbError&&<p className="bf" style={{fontSize:12,color:"#e74c3c"}}>{dbError}</p>}
                </div>
                <div className="card noh" style={{padding:28,height:"fit-content"}}>
                  <p className="bf" style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"#555",marginBottom:20}}>Booking Summary</p>
                  {[
                    {label:"Service",value:selectedService?.name},
                    {label:"Duration",value:`${selectedService?.duration} min`},
                    {label:"Stylist",value:selectedStaff?.name},
                    {label:"Date",value:dateStr},
                    {label:"Time",value:selectedTime},
                  ].map(item=>(
                    <div key={item.label} style={{display:"flex",justifyContent:"space-between",marginBottom:14}}>
                      <p className="bf" style={{fontSize:12,color:"#555"}}>{item.label}</p>
                      <p className="bf" style={{fontSize:13,color:"#f0ece4"}}>{item.value}</p>
                    </div>
                  ))}
                  <hr className="dv" style={{margin:"16px 0"}}/>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <p className="bf" style={{fontSize:11,color:"#555",letterSpacing:1}}>TOTAL DUE</p>
                    <p className="af gold" style={{fontSize:28}}>${selectedService?.price}</p>
                  </div>
                  <div style={{marginTop:16,padding:"10px 14px",background:IS_CONFIGURED?"#0d1a0d":"#1a1000",borderRadius:1}}>
                    <p className="bf" style={{fontSize:11,color:IS_CONFIGURED?"#4caf50":"#c9a96e"}}>
                      {IS_CONFIGURED?"✅ Will save to Supabase database":"⚠️ Demo mode — won't persist"}
                    </p>
                  </div>
                </div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:32}}>
                <button className="bo" onClick={()=>setStep(3)}>Back</button>
                <button className="bg" disabled={!form.name||!form.email||!form.phone||saving} onClick={handleBook}>
                  {saving?<span style={{display:"flex",alignItems:"center",gap:10}}><span className="sp"/>Saving...</span>:"Confirm Booking"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CONFIRMATION ── */}
      {activeTab==="book"&&submitted&&(
        <div style={{maxWidth:560,margin:"0 auto",padding:"80px 24px",textAlign:"center",position:"relative"}} className="fu">
          {[...Array(12)].map((_,i)=>(
            <div key={i} className="cf" style={{left:`${10+Math.random()*80}%`,top:`${Math.random()*20}%`,background:["#c9a96e","#f0ece4","#6b5a3e"][i%3],animationDelay:`${Math.random()*.5}s`,animationDuration:`${2+Math.random()*2}s`}}/>
          ))}
          <div style={{fontSize:52,marginBottom:20}}>✦</div>
          <h2 className="af gold" style={{fontSize:42,fontWeight:300,letterSpacing:2}}>You're Booked</h2>
          <p className="bf" style={{color:"#555",fontSize:13,marginTop:8}}>
            Confirmation for {form.email}
            {IS_CONFIGURED&&<span style={{color:"#4caf50"}}> · Saved to database ✓</span>}
          </p>
          <div className="card noh" style={{padding:32,marginTop:36,textAlign:"left"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24}}>
              {[
                {label:"Service",value:selectedService?.name},
                {label:"Stylist",value:selectedStaff?.name},
                {label:"Date",value:dateStr},
                {label:"Time",value:selectedTime},
              ].map(item=>(
                <div key={item.label}>
                  <p className="bf" style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:"#555"}}>{item.label}</p>
                  <p className="af" style={{fontSize:20,marginTop:4,fontWeight:300}}>{item.value}</p>
                </div>
              ))}
            </div>
            <hr className="dv" style={{margin:"20px 0"}}/>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <p className="bf" style={{fontSize:11,letterSpacing:1,color:"#555"}}>TOTAL DUE AT APPOINTMENT</p>
              <p className="af gold" style={{fontSize:28}}>${selectedService?.price}</p>
            </div>
          </div>
          <div style={{display:"flex",gap:16,justifyContent:"center",marginTop:28}}>
            <button className="bg" onClick={reset}>Book Again</button>
            <button className="bo" onClick={()=>{reset();setActiveTab("admin");fetchBookings();}}>View Admin</button>
          </div>
        </div>
      )}
    </div>
  );
}
