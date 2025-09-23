import React, { useEffect, useMemo, useRef, useState, createContext, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Settings, Plus, Loader2, Printer, UserPlus, ExternalLink } from "lucide-react";

/**
 * Mini-RepairShopr — Full React + Tailwind (Dark Theme)
 *
 * What’s here
 * - API client (base URL + API key) matching RepairShopr REST
 * - Hashless, URL-driven routing mirroring your Unity scheme
 * - Ticket List + Customers tab with search, status filters, keyboard shortcuts
 * - Ticket View using TicketCard (converted from your index.html template)
 * - Sidebar with status chips and comments box (dark theme like your screenshot)
 * - New/Edit Ticket flow matching your C# presets (NewTicketManager, UsefullMethods)
 * - Customer View + New Customer form
 * - Settings modal for base URL + API key
 *
 * NOTE: This is front-end only. You need CORS allowed from where you host this.
 */

/*************************
 * Constants (from your Unity UsefullMethods/NewTicketManager)
 *************************/
const STATUSES = [
  "Diagnosing",
  "Finding Price",
  "Approval Needed",
  "Waiting for Parts",
  "Waiting (Other)",
  "In Progress",
  "Ready",
  "Resolved",
];
const STATUS_COLORS = [
  "#2DB490",
  "#1E793E",
  "#1E4679",
  "#B6B72E",
  "#35B2D4",
  "#7B1F20",
  "#2CB04F",
  "#D4AF35",
];
const DEVICES = ["Phone", "Tablet", "Laptop", "Desktop", "All in one", "Watch", "Console", ""]; // last = other
const BRANDS = [
  ["iPhone", "Samsung", "Moto", "LG", "Pixel", "Revvl", "OnePlus", ""],
  ["iPad", "Samsung", ""],
  ["MacBook", "HP", "Dell", "Lenovo", "Asus", "Acer", "Toshiba", ""],
  ["Apple", "HP", "Dell", "Lenovo", "Asus", "Acer", "Toshiba", ""],
  ["iMac", "HP", "Dell", "Lenovo", "Asus", "Acer", "Toshiba", ""],
  ["Apple", ""],
  ["PlayStation", "XBox", "Switch", ""],
  [""]
];
const PROBLEMS = [
  ["LCD", "Battery", "Charge port", "Back glass", "Camera lens", "Camera issues", "Speaker issues", "Microphone", "No power", "No display", "Won't boot", "Liquid damage", "Reset"],
  ["LCD", "Battery", "Charge port", "Camera lens", "Camera issues", "Speaker issues", "No power", "No display", "Won't boot", "Liquid damage", "Reset"],
  ["LCD", "No power", "No display", "Won't boot", "Install Kaspersky", "Install SSD", "Slow", "Hinges", "Keyboard", "Install Office", "Clean virus", "Liquid damage", "Reset"],
  ["No power", "No display", "Won't boot", "Install Kaspersky", "Install SSD", "Slow", "Install Office", "Clean virus", "Reset"],
  ["No power", "No display", "Won't boot", "Install Kaspersky", "Install SSD", "Slow", "Install Office", "Clean virus", "Reset"],
  ["LCD", "Battery", "Connection issues", "No power", "No display", "Won't boot", "Liquid damage", "Reset"],
  ["LCD", "Battery", "Charge port", "No power", "No display", "Won't boot", "Reset"],
  []
];
const HOW_LONG = ["30 min", "45 min", "2 hours", "4 hours", "1 day", "3 days", ""];
const HOW_LONG_MIN = [30, 45, 120, 240, 1440, 4320, 0];
const ITEMS_LEFT = ["Charger", "Case", ""];
const NEED_DATA = ["No data", "Save data", "Save data & programs", ""];
const COLORS = ["Purple","Orange","Black","Gray","White","Yellow","Pink","Blue","Brown","Green","Red","Silver","Gold","Rose Gold"];

/*************************
 * Utility helpers
 *************************/
function cx(...xs){ return xs.filter(Boolean).join(" "); }
function fmtDate(s) {
    try {
        return new Date(s).toLocaleString(undefined, {
            year: "numeric",
            month: "short",   // "Sep"
            day: "numeric",
            hour: "numeric",
            minute: "2-digit", // keeps minutes like "08"
            second: undefined, // removes seconds
        });
    } catch { return s; }
}
function formatPhone(num = "") {
    const digits = num.replace(/\D/g, ""); // remove anything not a digit
    if (digits.length === 10) {
        return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return num; // fallback: return as-is if not 10 digits
}

function useHotkeys(map){
  useEffect(()=>{
    function onKey(e){
      const tag = (e.target||{}).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (map[k]) map[k](e);
    }
    window.addEventListener('keydown', onKey);
    return ()=>window.removeEventListener('keydown', onKey);
  }, [map]);
}

/*************************
 * API Context
 *************************/
const ApiCtx = createContext(null);
const useApi = () => useContext(ApiCtx);
function ApiProvider({ children }){
  const [baseUrl, setBaseUrl] = useState("https://Cacell.repairshopr.com/api/v1");
  const [apiKey, setApiKey] = useState("");
  const client = useMemo(()=>{
    async function send(path, {method="GET", body}={}){
      const res = await fetch(`${baseUrl}${path}` , {
        method,
        headers: { "Content-Type":"application/json", Authorization: apiKey||"" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if(!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    }
    return {
      baseUrl, setBaseUrl, apiKey, setApiKey,
      get:(p)=>send(p,{method:"GET"}),
      post:(p,b)=>send(p,{method:"GET", body:b}),
      put: (p, b) => send(p, { method:"GET", body:b}),
      del: (p) => send(p, { method:"GET"}),
    };
  }, [baseUrl, apiKey]);
  return <ApiCtx.Provider value={client}>{children}</ApiCtx.Provider>;
}

/*************************
 * Router (pathname + query like Unity)
 *************************/
function useRoute(){
  const [path, setPath] = useState(window.location.pathname + window.location.search + window.location.hash);
  useEffect(()=>{
    const f = ()=>setPath(window.location.pathname + window.location.search + window.location.hash);
    window.addEventListener('popstate', f);
    window.addEventListener('hashchange', f);
    return ()=>{ window.removeEventListener('popstate', f); window.removeEventListener('hashchange', f); };
  },[]);
  const navigate = (to)=>{ window.history.pushState({},"",to); window.dispatchEvent(new Event('popstate')); };
  return { path, navigate };
}

/*************************
 * TicketCard — Converted from your index.html template
 *************************/
function TicketCard({
    password = "",
    ticketNumber = "",
    subject = "",
    itemsLeft = "",
    name = "",
    creationDate = "",
    phoneNumber = ""
}) {
    return (
        <div
            id="result"
            style={{
                paddingLeft: "13px",
                width: "323px",
                display: "block",
                marginTop: "15px",
                transformOrigin: "center top",
                position: "relative", // needed for absolute children
                backgroundColor: "white",
                color: "black",
                fontStyle: "normal",
                fontWeight: 500,
                fontSize: "10.35pt",
                margin: "0pt",
                lineHeight: "12pt",
            }}
        >
            {/* Row 1: password + ticket number */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    whiteSpace: "nowrap",
                    alignItems: "center",
                }}
            >
                <p style={{ fontSize: "7.5pt" }} id="password">
                    {password}
                </p>
                <p
                    style={{ textAlign: "right", fontWeight: 750, paddingRight: "33pt" }}
                    id="ticketNumber"
                >
                    # {ticketNumber}
                </p>
            </div>

            {/* Subject */}
            <p
                style={{ position: "absolute", width: "294px", fontSize: "10.35pt" }}
                id="subject"
            >
                {subject}
            </p>

            {/* Row 2: items left + name */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    whiteSpace: "nowrap",
                    alignItems: "baseline",
                }}
            >
                <p style={{ fontSize: "7.5pt", lineHeight: "1px" }} id="itemsLeft">
                    {itemsLeft}
                </p>
                <p
                    style={{
                        textAlign: "right",
                        paddingTop: "51px",
                        lineHeight: "7px",
                        paddingRight: "33pt",
                    }}
                    id="name"
                >
                    {name}
                </p>
            </div>

            {/* Row 3: creation date + phone */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    whiteSpace: "nowrap",
                    alignItems: "baseline",
                }}
            >
                <p style={{ fontSize: "7.5pt" }} id="creationDate">
                    {creationDate}
                </p>
                <p style={{ textAlign: "right", paddingRight: "33pt" }} id="phoneNumber">
                    {phoneNumber}
                </p>
            </div>
        </div>
    );
}

/*************************
 * TopBar + Settings
 *************************/
function TopBar({ onHome, onSearchFocus, onNewCustomer, onSettings }){
  return (
    <div className="sticky top-0 z-30 w-full bg-gradient-to-r from-slate-900/95 via-slate-800/95 to-slate-900/95 backdrop-blur-xl border-b border-slate-700/50 shadow-lg">
      <div className="mx-auto max-w-7xl px-6 py-4 flex items-center gap-4">
        <button 
          onClick={onHome}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-medium shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 border border-blue-500/20"
        >
          <span className="text-sm">🏠</span>
          Home
        </button>
        <h1 className="text-xl font-bold tracking-wide text-white/95 flex-1 bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
          True Tickets - Computer and Cellphone Inc
        </h1>
        <div className="flex items-center gap-2">
          <button 
            onClick={onSearchFocus} 
            title="Search"
            className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-600/50 hover:border-slate-500/50 transition-all duration-200 hover:scale-105 shadow-md"
          >
            <Search className="w-5 h-5 text-slate-300"/>
          </button>
          <button 
            onClick={onNewCustomer} 
            title="New Customer"
            className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 border border-emerald-500/20 transition-all duration-200 hover:scale-105 shadow-md"
          >
            <UserPlus className="w-5 h-5 text-white"/>
          </button>
          <button 
            onClick={onSettings} 
            title="Settings"
            className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-600/50 hover:border-slate-500/50 transition-all duration-200 hover:scale-105 shadow-md"
          >
            <Settings className="w-5 h-5 text-slate-300"/>
          </button>
        </div>
      </div>
    </div>
  );
}
function SettingsModal({open,onClose}){
  const api = useApi();
  if(!open) return null;
  return (
    <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-3xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-600/50 shadow-2xl p-8 space-y-6 text-white">
        <div className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          Settings
        </div>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-300">RepairShopr Base URL</label>
          <input 
            className="w-full px-4 py-3 rounded-xl bg-slate-700/50 border border-slate-600/50 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200" 
            value={api.baseUrl} 
            onChange={(e) => api.setBaseUrl(e.target.value)} 
            placeholder="https://Cacell.repairshopr.com/api/v1"
          />
        </div>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-300">API Key (Authorization header)</label>
          <input 
            className="w-full px-4 py-3 rounded-xl bg-slate-700/50 border border-slate-600/50 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200" 
            value={api.apiKey} 
            onChange={(e)=>api.setApiKey(e.target.value)} 
            placeholder="api_key"
          />
        </div>
        <div className="flex justify-end gap-3 pt-4">
          <button 
            onClick={onClose}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 text-white font-medium shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/*************************
 * Ticket List / Customers
 *************************/
function TicketListView({ goTo, focusSearchRef }){
  const api = useApi();
  const [tab, setTab] = useState("tickets");
  const [search, setSearch] = useState("");
  const [statusHidden, setStatusHidden] = useState(()=> new Set(["Resolved"]));
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const listRef = useRef(null);

  const toggleStatus=(s)=>{ const n=new Set(statusHidden); n.has(s)?n.delete(s):n.add(s); setStatusHidden(n); };

  async function fetchTickets(reset=false){
    setLoading(true);
    try{
      const q = search.trim();
      let data;
      if(q) data = await api.get(`/tickets?query=${encodeURIComponent(q)}&page=${reset?1:page}`);
      else data = await api.get(`/tickets?page=${reset?1:page}`);
      const arr = data.tickets || data || [];
      setItems(reset?arr:[...items, ...arr]);
      setPage(p=> reset?1:p);
    }catch(e){ console.error(e); } finally{ setLoading(false);} 
  }
  async function fetchCustomers(reset=false){
    setLoading(true);
    try{
      const q = search.trim();
      let data;
      if(q) data = await api.get(`/customers/autocomplete?query=${encodeURIComponent(q)}`);
      else data = await api.get(`/customers?page=${reset?1:page}`);
      const arr = data.customers || data || [];
      setItems(reset?arr:[...items, ...arr]);
      setPage(p=> reset?1:p);
    }catch(e){ console.error(e); } finally{ setLoading(false);} 
  }

  useEffect(()=>{ if(tab==="tickets") fetchTickets(true); else fetchCustomers(true); // initial
  // eslint-disable-next-line
  }, [tab]);
  useEffect(()=>{ const t=setTimeout(()=>{ if(tab==="tickets") fetchTickets(true); else fetchCustomers(true); }, 300); return ()=>clearTimeout(t);
  // eslint-disable-next-line
  }, [search]);

  useHotkeys({
    "h": ()=>goTo("/"),
    "s": ()=>focusSearchRef.current?.focus(),
    "n": ()=>goTo("/newcustomer"),
    "arrowleft": ()=>setTab("customers"),
    "arrowright": ()=>setTab("tickets"),
    "enter": ()=>{ listRef.current?.querySelector('[data-row]')?.click(); },
  });

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <div className="flex items-center gap-4 mb-6">
        <div className="inline-flex rounded-2xl border border-slate-600/50 bg-slate-800/50 p-1 shadow-lg backdrop-blur-sm">
          <button 
            className={cx("px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200", 
              tab==="tickets" 
                ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg" 
                : "text-slate-300 hover:text-white hover:bg-slate-700/50"
            )} 
            onClick={()=>setTab("tickets")}
          >
            Tickets
          </button>
          <button 
            className={cx("px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200", 
              tab==="customers" 
                ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg" 
                : "text-slate-300 hover:text-white hover:bg-slate-700/50"
            )} 
            onClick={()=>setTab("customers")}
          >
            Customers
          </button>
        </div>
        {tab==="tickets" && (
          <div className="flex items-center gap-3 ml-auto">
            <div className="text-sm text-slate-400 font-medium">Status filter:</div>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s,i)=> (
                <button 
                  key={s} 
                  onClick={()=>toggleStatus(s)}
                  className={cx("px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-200 hover:scale-105",
                    statusHidden.has(s)
                      ? "bg-slate-700/50 text-slate-400 border-slate-600/50" 
                      : "bg-slate-800/80 text-white border-opacity-60 shadow-md hover:shadow-lg"
                  )}
                  style={{ borderColor: STATUS_COLORS[i] }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="relative mb-6">
        <input 
          ref={focusSearchRef} 
          value={search} 
          onChange={e=>setSearch(e.target.value)}
          placeholder={tab==="tickets"?"Search tickets":"Search customers"}
          className="w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-800/50 border border-slate-600/50 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200 shadow-lg backdrop-blur-sm"
        />
        <Search className="w-5 h-5 absolute left-4 top-4 text-slate-400"/>
      </div>

      <div className="rounded-3xl border border-slate-600/50 bg-gradient-to-br from-slate-800/50 to-slate-900/50 shadow-2xl backdrop-blur-sm overflow-hidden">
        <div className="grid grid-cols-12 text-xs uppercase tracking-wider text-slate-400 px-6 py-4 bg-slate-800/30 border-b border-slate-600/30">
          {tab==="tickets" ? (
            <>
              <div className="col-span-2 font-semibold">Number</div>
              <div className="col-span-5 font-semibold">Subject</div>
              <div className="col-span-2 font-semibold">Status</div>
              <div className="col-span-3 font-semibold">Customer</div>
            </>
          ) : (
            <>
              <div className="col-span-5 font-semibold">Name</div>
              <div className="col-span-4 font-semibold">Phone</div>
              <div className="col-span-3 font-semibold">Created</div>
            </>
          )}
        </div>
        <div ref={listRef} className="divide-y divide-slate-700/30">
          <AnimatePresence>
            {tab==="tickets" && (items||[])
              .filter(t => !t.status || !statusHidden.has(t.status))
              .map((t)=> (
                <motion.button 
                  key={t.id} 
                  data-row 
                  initial={{opacity:0,y:4}} 
                  animate={{opacity:1,y:0}} 
                  exit={{opacity:0}}
                  onClick={()=>goTo(`/&${t.id}`)}
                  className="grid grid-cols-12 w-full text-left hover:bg-slate-700/30 px-6 py-4 transition-all duration-200 hover:shadow-lg group"
                >
                  <div className="col-span-2 font-mono text-slate-200 font-medium">#{t.number ?? t.id}</div>
                  <div className="col-span-5 truncate text-white font-medium group-hover:text-blue-300 transition-colors">{t.subject}</div>
                  <div className="col-span-2">
                    <span className="px-3 py-1.5 rounded-full text-xs font-medium border shadow-sm" 
                          style={{borderColor: STATUS_COLORS[STATUSES.indexOf(t.status)||0]}}>
                      {t.status}
                    </span>
                  </div>
                  <div className="col-span-3 truncate text-slate-300">{t.customer?.business_and_full_name ?? t.customer?.fullname}</div>
                </motion.button>
            ))}
            {tab==="customers" && (items||[]).map(c => (
              <motion.button 
                key={c.id} 
                data-row 
                initial={{opacity:0,y:4}} 
                animate={{opacity:1,y:0}} 
                exit={{opacity:0}}
                onClick={()=>goTo(`/$${c.id}`)}
                className="grid grid-cols-12 w-full text-left hover:bg-slate-700/30 px-6 py-4 transition-all duration-200 hover:shadow-lg group"
              >
                <div className="col-span-5 truncate text-white font-medium group-hover:text-blue-300 transition-colors">{c.business_and_full_name || c.fullname}</div>
                <div className="col-span-4 text-slate-300">{c.phone || c.mobile || c.work_phone}</div>
                <div className="col-span-3 text-slate-400">{fmtDate(c.created_at)}</div>
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
        {loading && (
          <div className="flex items-center justify-center p-8 text-sm gap-3 text-slate-300">
            <Loader2 className="w-5 h-5 animate-spin text-blue-400"/>
            <span className="font-medium">Loading…</span>
          </div>
        )}
      </div>

      <div className="flex justify-between items-center mt-6">
        <button 
          onClick={()=>tab==="tickets"?fetchTickets(false):fetchCustomers(false)}
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 text-white font-medium shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 border border-slate-600/50"
        >
          Load more
        </button>
        <div className="text-xs text-slate-500 font-medium">
          Hotkeys: H (home), S (search), N (new customer), ←/→ (switch tab), Enter (open first)
        </div>
      </div>
    </div>
  );
}

/*************************
 * Customer View / New Customer
 *************************/
function CustomerView({ id, goTo }){
  const api = useApi();
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(()=>{(async()=>{ try{ const d = await api.get(`/customers/${id}`); setC(d.customer||d);}catch(e){console.error(e);}finally{setLoading(false);} })();},[id]);
  if(loading) return <Loading/>;
  if(!c) return <ErrorMsg text="Customer not found"/>;
  return (
    <div className="mx-auto max-w-5xl px-3 py-4 grid md:grid-cols-3 gap-6">
      <div className="md:col-span-2 space-y-4">
        <div className="panel">
          <div className="text-xl font-semibold">{c.business_and_full_name || c.fullname}</div>
          <div className="text-gray-400">{c.email}</div>
          <div className="text-gray-400">{c.phone || c.mobile}</div>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={()=>goTo(`/$${id}?newticket`)}><Plus className="w-4 h-4"/> New Ticket</button>
          <a className="btn" href={`/$${id}?edit`} onClick={(e)=>{e.preventDefault(); goTo(`/$${id}?edit`);}}><ExternalLink className="w-4 h-4"/> Edit</a>
        </div>
      </div>
      <div className="space-y-4">
        <div className="panel">
          <div className="text-sm font-semibold text-gray-300">Notes</div>
          <textarea className="input h-32" placeholder="Customer notes…"/>
        </div>
      </div>
    </div>
  );
}
function NewCustomer({ goTo }){
  const api = useApi();
  const [form, setForm] = useState({ first_name:"", last_name:"", phone:"", email:"" });
  const [saving, setSaving] = useState(false);
  async function save(){ setSaving(true); try{ const d = await api.post(`/customers`, { customer: form }); const c = d.customer||d; goTo(`/$${c.id}`);}catch(e){console.error(e);}finally{setSaving(false);} }
  return (
    <div className="mx-auto max-w-lg px-3 py-4">
      <div className="panel space-y-3">
        <div className="text-lg font-semibold">New Customer</div>
        {['first_name','last_name','phone','email'].map(k=> (
          <div key={k} className="space-y-1">
            <label className="text-sm text-gray-300 capitalize">{k.replace('_',' ')}</label>
            <input className="input w-full" value={form[k]} onChange={e=>setForm({...form, [k]: e.target.value})}/>
          </div>
        ))}
        <div className="flex justify-end gap-2"><button className="btn" onClick={save} disabled={saving}>{saving?"Saving…":"Create"}</button></div>
      </div>
    </div>
  );
}

/*************************
 * Ticket View / Edit / New
 *************************/
function TicketView({ id, goTo }) {
  const api = useApi();
  const [t, setT] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const d = await api.get(`/tickets/${id}`);
        setT(d.ticket || d);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, api]);

  if (loading) return <Loading />;
  if (!t) return <ErrorMsg text="Ticket not found" />;

  const phone = formatPhone(t.customer?.phone || t.customer?.mobile || "");

  return (
    <div className="mx-auto max-w-6xl px-6 py-6 grid grid-cols-12 gap-6">
      {/* LEFT SIDE: Ticket + statuses */}
      <div className="col-span-12 lg:col-span-7 space-y-4">
        <TicketCard
          password={t.password || ""}
          ticketNumber={t.number ?? t.id}
          subject={t.subject}
          itemsLeft={(t.items_left || []).join(", ")}
          name={t.customer?.business_and_full_name || t.customer?.fullname || ""}
          creationDate={fmtDate(t.created_at)}
          phoneNumber={phone}
        />

        {/* Status buttons */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-200">Status:</p>
          <div className="flex flex-col gap-2">
            {STATUSES.map((s, i) => {
              const active = t.status === s;
              return (
                <button
                  key={s}
                  onClick={async () => {
                    try {
                      await api.put(`/tickets/${t.id}`, {
                        ticket: { status: s },
                      });
                      setT({ ...t, status: s });
                    } catch (err) {
                      console.error(err);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium text-left ${
                    active
                      ? "bg-yellow-500 text-black"
                      : "bg-neutral-800 text-white hover:bg-neutral-700"
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        {/* Print option */}
        <div className="flex items-center gap-2 text-sm text-gray-400 mt-3">
          <Printer className="w-4 h-4" />
          <button onClick={() => window.print()} className="underline">
            Print
          </button>
          <span>
            This prints the on-screen ticket label using your browser's print
            dialog.
          </span>
        </div>
      </div>

      {/* RIGHT SIDE: Comments */}
      <aside className="col-span-12 lg:col-span-5">
        <div className="panel">
          <div className="text-sm font-semibold mb-2 text-white">Comments</div>
          <CommentsBox ticketId={t.id} />
        </div>
      </aside>
    </div>
  );
}

function CommentsBox({ ticketId }){
  const api = useApi();
  const [text, setText] = useState("");
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  async function load(){ setLoading(true); try{ const d = await api.get(`/tickets/${ticketId}/comments`); setList(d.comments||d||[]);}catch(e){console.error(e);}finally{setLoading(false);} }
  async function create(){ try{ await api.post(`/tickets/${ticketId}/comment`, { body: text }); setText(""); load(); }catch(e){ console.error(e);} }
  useEffect(()=>{ load(); // initial
  // eslint-disable-next-line
  }, [ticketId]);
  return (
    <div className="panel space-y-3">
      <div className="text-sm font-semibold text-gray-300">Comments</div>
      <textarea value={text} onChange={e=>setText(e.target.value)} className="input h-24" placeholder="Write a comment…"/>
      <button onClick={create} className="btn w-full">Create Comment</button>
      <div className="divide-y divide-neutral-800">
        {loading && <div className="text-sm text-gray-400">Loading…</div>}
        {(list||[]).map(c=> (
          <div key={c.id} className="py-2 text-sm">
            <div className="text-gray-300 whitespace-pre-wrap">{c.body || c.comment || ''}</div>
            <div className="text-[11px] text-gray-500 mt-1">{fmtDate(c.created_at)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TicketEditor({ ticketId, customerId, goTo }){
  const api = useApi();
  const [pre, setPre] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deviceIdx, setDeviceIdx] = useState(0);
  const [brandIdx, setBrandIdx] = useState(0);
  const [model, setModel] = useState("");
  const [colorIdx, setColorIdx] = useState(-1);
  const [problems, setProblems] = useState([]);
  const [howLongIdx, setHowLongIdx] = useState(0);
  const [password, setPassword] = useState("");
  const [itemsLeft, setItemsLeft] = useState([]);
  const [needDataIdx, setNeedDataIdx] = useState(0);
  const [other, setOther] = useState("");
  const [subject, setSubject] = useState("");
  const [useLegacySubject, setUseLegacySubject] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(()=>{(async()=>{
    try{
      if(ticketId){ const d = await api.get(`/tickets/${ticketId}`); const t = d.ticket||d; setPre(t); setSubject(t.subject||""); setPassword(t.password||""); }
      else if(customerId){ const d = await api.get(`/customers/${customerId}`); setPre(d.customer||d); }
    }catch(e){ console.error(e);} finally{ setLoading(false);} })();}, [ticketId, customerId]);

  function toggleProblem(i){ setProblems(p=> p.includes(i)? p.filter(x=>x!==i) : [...p,i]); }
  function toggleItem(name){ setItemsLeft(xs=> xs.includes(name)? xs.filter(x=>x!==name) : [...xs, name]); }

  async function save(){
    setSaving(true);
    try{
      let payload;
      if(useLegacySubject){
        payload = { ticket: { subject, customer_id: customerId || pre?.customer_id || pre?.id, password, has_device: itemsLeft.includes("Charger") } };
      } else {
        const arrival = new Date();
        const promised = HOW_LONG_MIN[howLongIdx] ? new Date(arrival.getTime()+HOW_LONG_MIN[howLongIdx]*60000) : arrival;
        payload = { ticket: {
          subject: buildSubject(),
          customer_id: customerId || pre?.customer_id || pre?.id,
          device_type: DEVICES[deviceIdx],
          brand: BRANDS[deviceIdx][brandIdx],
          model,
          color: colorIdx>=0 ? COLORS[colorIdx] : "",
          problems: problems.map(i=>PROBLEMS[deviceIdx][i]),
          notes: other,
          need_data: NEED_DATA[needDataIdx],
          password,
          promised_by: promised.toISOString(),
        }};
      }
      let out; if(ticketId) out = await api.put(`/tickets/${ticketId}`, payload); else out = await api.post(`/tickets`, payload);
      const t = out.ticket||out; goTo(`/&${t.id}`);
    }catch(e){ console.error(e);} finally{ setSaving(false);} 
  }
  function buildSubject(){
    const bits=[BRANDS[deviceIdx][brandIdx], model, colorIdx>=0?COLORS[colorIdx]:null, DEVICES[deviceIdx]].filter(Boolean);
    const probs=problems.map(i=>PROBLEMS[deviceIdx][i]);
    const extra=other?.trim();
    return [bits.join(" "), probs.join(" + "), extra].filter(Boolean).join(" — ");
  }
  if(loading) return <Loading/>;
  return (
    <div className="mx-auto max-w-5xl px-3 py-4">
      <div className="panel space-y-6">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">{ticketId?"Edit Ticket":"New Ticket"}</div>
          <div className="flex items-center gap-3 text-sm">
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={useLegacySubject} onChange={e=>setUseLegacySubject(e.target.checked)}/> Legacy subject panel</label>
            <button className="btn" onClick={save} disabled={saving}>{saving?"Saving…":"Apply"}</button>
          </div>
        </div>

        {!useLegacySubject ? (
          <div className="grid md:grid-cols-2 gap-6">
            <PickerRow label="Device" options={DEVICES} value={deviceIdx} onChange={setDeviceIdx}/>
            <PickerRow label="Brand" options={BRANDS[deviceIdx]} value={brandIdx} onChange={setBrandIdx}/>
            <Field label="Model" value={model} onChange={setModel}/>
            <ColorRow value={colorIdx} onChange={setColorIdx}/>
            <MultiRow label="Problems" options={PROBLEMS[deviceIdx]} selected={problems} onToggle={toggleProblem}/>
            <PickerRow label="How long" options={HOW_LONG} value={howLongIdx} onChange={setHowLongIdx}/>
            <Field label="Password" value={password} onChange={setPassword}/>
            <Checkboxes label="Items left" options={ITEMS_LEFT} values={itemsLeft} onToggle={toggleItem}/>
            <PickerRow label="Data" options={NEED_DATA} value={needDataIdx} onChange={setNeedDataIdx}/>
            <TextArea label="Other" value={other} onChange={setOther}/>
            <div className="md:col-span-2 text-sm text-gray-400">Subject preview: <span className="font-medium text-white">{buildSubject()}</span></div>
          </div>
        ) : (
          <Field label="Subject" value={subject} onChange={setSubject}/>
        )}
      </div>
    </div>
  );
}

/*************************
 * Small UI helpers
 *************************/
function PickerRow({ label, options, value, onChange }){
  return (
    <div>
      <div className="text-sm text-gray-300 mb-2">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((x,i)=> (
          <button key={i} onClick={()=>onChange(i)} className={cx("chip", value===i && "chip-active")}>{x||"Other"}</button>
        ))}
      </div>
    </div>
  );
}
function MultiRow({ label, options, selected, onToggle }){
  return (
    <div>
      <div className="text-sm text-gray-300 mb-2">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((x,i)=> x && (
          <button key={i} onClick={()=>onToggle(i)} className={cx("chip", selected.includes(i) && "chip-active")}>{x}</button>
        ))}
      </div>
    </div>
  );
}
function ColorRow({ value, onChange }){
  return (
    <div>
      <div className="text-sm text-gray-300 mb-2">Color</div>
      <div className="flex flex-wrap gap-2">
        {COLORS.map((c,i)=> (
          <button key={c} onClick={()=>onChange(i)} className={cx("px-3 py-1 rounded-full border border-neutral-700 text-sm bg-neutral-900 hover:bg-neutral-800", value===i && "ring-2 ring-yellow-400")}>{c}</button>
        ))}
      </div>
    </div>
  );
}
function Field({ label, value, onChange }){
  return (
    <div className="space-y-1">
      <label className="text-sm text-gray-300">{label}</label>
      <input className="input w-full" value={value} onChange={e=>onChange(e.target.value)}/>
    </div>
  );
}
function TextArea({ label, value, onChange }){
  return (
    <div className="space-y-1">
      <label className="text-sm text-gray-300">{label}</label>
      <textarea className="input w-full h-28" value={value} onChange={e=>onChange(e.target.value)}/>
    </div>
  );
}
function Checkboxes({ label, options, values, onToggle }){
  return (
    <div>
      <div className="text-sm text-gray-300 mb-2">{label}</div>
      <div className="flex flex-wrap gap-3">
        {options.map(o => o && (
          <label key={o} className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={values.includes(o)} onChange={()=>onToggle(o)} /> {o}
          </label>
        ))}
      </div>
    </div>
  );
}
function Loading(){ return <div className="mx-auto max-w-3xl px-3 py-10 text-center text-gray-400">Loading…</div>; }
function ErrorMsg({ text }){ return <div className="mx-auto max-w-3xl px-3 py-10 text-center text-red-400">{text}</div>; }

/*************************
 * App
 *************************/
export default function App(){
  const { path, navigate } = useRoute();
  const [showSettings, setShowSettings] = useState(false);
  const searchRef = useRef(null);
  const route = useMemo(()=>{
    const url = new URL(window.location.origin + path);
    const pathname = url.pathname;
    const query = url.searchParams;
    if (pathname === "/newcustomer") return { view: "newcustomer" };
    if (pathname.startsWith("/$")) { const id = pathname.slice(2); if(query.has("newticket")) return { view:"ticket-editor", customerId:id }; if(query.has("edit")) return { view:"customer-edit", id }; return { view:"customer", id }; }
    if (pathname.startsWith("/&")) { const id = pathname.slice(2); if(query.has("edit")) return { view:"ticket-editor", ticketId:id }; return { view:"ticket", id }; }
    if (pathname.startsWith("/#")) { const number = pathname.slice(2); return { view:"ticket-by-number", number }; }
    return { view: "home" };
  }, [path]);

  return (
    <ApiProvider>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <TopBar
          onHome={()=>navigate("/")}
          onSearchFocus={()=>searchRef.current?.focus()}
          onNewCustomer={()=>navigate("/newcustomer")}
          onSettings={()=>setShowSettings(true)}
        />

        {route.view==="home" && <TicketListView goTo={navigate} focusSearchRef={searchRef}/>} 
        {route.view==="customer" && <CustomerView id={route.id} goTo={navigate}/>} 
        {route.view==="newcustomer" && <NewCustomer goTo={navigate}/>} 
        {route.view==="ticket" && <TicketView id={route.id} goTo={navigate}/>} 
        {route.view==="ticket-editor" && <TicketEditor ticketId={route.ticketId} customerId={route.customerId} goTo={navigate}/>} 
        {route.view==="ticket-by-number" && <TicketByNumber number={route.number} goTo={navigate}/>} 

        <SettingsModal open={showSettings} onClose={()=>setShowSettings(false)}/>
      </div>
    </ApiProvider>
  );
}
function TicketByNumber({ number, goTo }){
  const api = useApi();
  const [id, setId] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(()=>{(async()=>{ try{ const d = await api.get(`/tickets?number=${encodeURIComponent(number)}`); const t=(d.tickets||[])[0]; if(t) setId(t.id); else setErr("Ticket not found by number"); }catch(e){ console.error(e); setErr("Ticket not found by number"); } })();}, [number]);
  if(err) return <ErrorMsg text={err}/>;
  if(!id) return <Loading/>;
  return <TicketView id={id} goTo={goTo}/>;
}

/*************************
 * Modern Design System
 *************************/
// No more custom CSS injection - using Tailwind utilities directly