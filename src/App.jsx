import React, { useEffect, useMemo, useRef, useState, createContext, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Settings, Plus, Loader2, Printer, UserPlus, ExternalLink, Edit, User } from "lucide-react";
import html2pdf from 'html2pdf.js';

/**
 * Mini-RepairShopr — Full React + Tailwind (Dark Theme)
 *
 * What’s here
 * - API client (base URL + API key) matching RepairShopr REST
 * - Hashless, URL-driven routing mirroring your Unity scheme
 * - Ticket List with status filters, keyboard shortcuts
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
const DEVICES = ["Phone", "Tablet", "Watch", "Console", "Laptop", "Desktop", "All in one", "Other"];
const ITEMS_LEFT = ["Charger", "Case", "Controller", "Other"];

const STATUS_MAP = {
    "New": "Diagnosing",
    "Scheduled": "Finding Price",
    "Call Customer": "Approval Needed",
    "Waiting for Parts": "Waiting for Parts",
    "Waiting on Customer": "Waiting (Other)",
    "In Progress": "In Progress",
    "Customer Reply": "Ready",
    "Ready!": "Ready",
    "Resolved": "Resolved",
};

const convertStatus = (s) => {
    if (!s) return "";
    return STATUS_MAP[s] || s;
};

/*************************
 * Utility helpers
 *************************/
function cx(...xs) { return xs.filter(Boolean).join(" "); }
function fmtDate(s) {
    try {
        return new Date(s).toLocaleString(undefined, {
            year: "numeric",
            month: "numeric",   // "Sep"
            day: "numeric",
            hour: undefined,
            minute: undefined, // removes minutes
            second: undefined, // removes seconds
        });
    } catch { return s; }
}
function fmtTime(s) {
    try {
        return new Date(s).toLocaleString(undefined, {
            year: undefined,
            month: undefined, 
            day: undefined,
            hour: "numeric",
            minute: "2-digit", // keeps minutes like "08"
            second: undefined, // removes seconds
        });
    } catch { return s; }
}
function fmtDateAndTime(s) {
    try {
        return fmtDate(s) + " | " + fmtTime(s);
    } catch { return s; }
}
function formatPhone(num = "") {
    const digits = num.replace(/\D/g, ""); // remove anything not a digit
    if (digits.length === 10) {
        return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return num; // fallback: return as-is if not 10 digits
}

function useHotkeys(map) {
    useEffect(() => {
        function onKey(e) {
            const tag = (e.target || {}).tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            const k = e.key.toLowerCase();
            if (map[k]) map[k](e);
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [map]);
}

/*************************
 * API Context
 *************************/
const ApiCtx = createContext(null);
const useApi = () => useContext(ApiCtx);
function ApiProvider({ children }) {
    const [baseUrl, setBaseUrl] = useState("https://Cacell.repairshopr.com/api/v1");
    const [apiKey, setApiKey] = useState("");
    const client = useMemo(() => {
        async function send(path, { method = "GET", body } = {}) {
            const res = await fetch(`${baseUrl}${path}`, {
                method,
                headers: { "Content-Type": "application/json", Authorization: apiKey || "" },
                body: body ? JSON.stringify(body) : undefined,
            });
            if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
            return await res.json();
        }
        return {
            baseUrl, setBaseUrl, apiKey, setApiKey,
            get: (p) => send(p, { method: "GET" }),
            post: (p, b) => send(p, { method: "GET", body: b }),
            put: (p, b) => send(p, { method: "GET", body: b }),
            del: (p) => send(p, { method: "GET" }),
        };
    }, [baseUrl, apiKey]);
    return <ApiCtx.Provider value={client}>{children}</ApiCtx.Provider>;
}

/*************************
 * Router (pathname + query like Unity)
 *************************/
function useRoute() {
    const [path, setPath] = useState(window.location.pathname + window.location.search + window.location.hash);
    useEffect(() => {
        const f = () => setPath(window.location.pathname + window.location.search + window.location.hash);
        window.addEventListener('popstate', f);
        window.addEventListener('hashchange', f);
        return () => { window.removeEventListener('popstate', f); window.removeEventListener('hashchange', f); };
    }, []);
    const navigate = (to) => { window.history.pushState({}, "", to); window.dispatchEvent(new Event('popstate')); };
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
                fontFamily: "ff2",
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
                    style={{ textAlign: "right", fontWeight: 700, paddingRight: "33pt" }}
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
function TopBar({ onHome, onSearchClick, onNewCustomer, onSettings }) {
    return (
        <div className="sticky top-0 z-30 w-full material-app-bar backdrop-blur-md">
            <div className="mx-auto max-w-7xl px-6 py-4 flex items-center gap-4">{/* larger again */}
                <button
                    onClick={onHome}
                    className="text-xl font-bold tracking-wide flex-1 text-left cursor-pointer"
                >
                    True Tickets - Computer and Cellphone Inc
                </button>
                <div className="flex items-center gap-3">
                    <button
                        onClick={onSearchClick}
                        title="Search"
                        className="md-btn-surface elev-1 inline-flex items-center justify-center w-11 h-11 rounded-full"
                    >
                        <Search className="w-5.5 h-5.5" />
                    </button>
                    <button
                        onClick={onNewCustomer}
                        title="New Customer"
                        className="md-btn-primary elev-2 inline-flex items-center justify-center w-11 h-11 rounded-full"
                    >
                        <UserPlus className="w-5.5 h-5.5" />
                    </button>
                    <button
                        onClick={onSettings}
                        title="Settings"
                        className="md-btn-surface elev-1 inline-flex items-center justify-center w-11 h-11 rounded-full"
                    >
                        <Settings className="w-5.5 h-5.5" />
                    </button>
                </div>
            </div>
        </div>
    );
}
function SettingsModal({ open, onClose }) {
    const api = useApi();
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-lg md-card p-8 space-y-6">
                <div className="text-2xl font-bold" style={{color:'var(--md-sys-color-primary)'}}>
                    Settings
                </div>
                <div className="space-y-3">
                    <label className="block text-sm font-medium">RepairShopr Base URL</label>
                    <input
                        className="md-input"
                        value={api.baseUrl}
                        onChange={(e) => api.setBaseUrl(e.target.value)}
                        placeholder="https://Cacell.repairshopr.com/api/v1"
                    />
                </div>
                <div className="space-y-3">
                    <label className="block text-sm font-medium">API Key (Authorization header)</label>
                    <input
                        className="md-input"
                        value={api.apiKey}
                        onChange={(e) => api.setApiKey(e.target.value)}
                        placeholder="api_key"
                    />
                </div>
                <div className="flex justify-end gap-3 pt-4">
                    <button
                        onClick={onClose}
                        className="md-btn-surface elev-1"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

function SearchModal({ open, onClose, goTo }) {
    const api = useApi();
    const [search, setSearch] = useState("");
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    // New Customer autofill helpers
    const parsePhoneNumber = (s = "") => (s || "").replace(/\D/g, "");
    const isLikelyPhone = (digits) => digits.length >= 7; // permissive; adjust if needed
    const handleNewCustomer = () => {
        const q = search.trim();
        if (!q) { goTo("/newcustomer"); return; }
        const digits = parsePhoneNumber(q);
        let url = "/newcustomer";
        const params = new URLSearchParams();
        if (isLikelyPhone(digits)) {
            params.set("phone", digits);
        } else if (q.includes(" ")) {
            const idx = q.lastIndexOf(" ");
            const first = q.slice(0, idx).trim();
            const last = q.slice(idx + 1).trim();
            if (first) params.set("first_name", first);
            if (last) params.set("last_name", last);
        } else {
            params.set("first_name", q); // fallback single-field
        }
        const qs = params.toString();
        if (qs) url += `?${qs}`;
        onClose();
        goTo(url);
    };

    async function fetchTickets() {
        if (!search.trim()) {
            setResults([]);
            return;
        }

        setLoading(true);
        try {
            const data = await api.get(`/tickets?query=${encodeURIComponent(search.trim())}`);
            const arr = data.tickets || data || [];
            setResults(arr);
        } catch (e) {
            console.error(e);
            setResults([]);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            fetchTickets();
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [search]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="w-full max-w-6xl h-[80vh] md-card p-8 space-y-6 flex flex-col">
                <div className="flex items-center justify-between">
                    <div className="text-2xl font-bold" style={{color:'var(--md-sys-color-primary)'}}>
                        Search Tickets
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleNewCustomer}
                            title="New Customer"
                            className="md-btn-primary elev-1"
                        >
                            New Customer
                        </button>
                        <button
                            onClick={onClose}
                            className="md-btn-surface elev-1 inline-flex items-center justify-center w-8 h-8 p-0"
                        >
                            ×
                        </button>
                    </div>
                </div>

                {/* Search Input */}
                <div className="relative">
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search tickets..."
                        className="md-input pl-10"
                        autoFocus
                    />
                    <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                {/* Results */}
                <div className="md-card overflow-hidden flex-1 overflow-y-auto">
                    <div className="grid grid-cols-12 text-xs uppercase tracking-wider px-5 py-3" style={{color:'var(--md-sys-color-on-surface)'}}>
                        <div className="col-span-2 font-semibold">Number</div>
                        <div className="col-span-5 font-semibold">Subject</div>
                        <div className="col-span-2 font-semibold">Status</div>
                        <div className="col-span-3 font-semibold">Customer</div>
                    </div>
                    <div className="divide-y" style={{borderColor:'var(--md-sys-color-outline)'}}>
                        {loading && (
                            <div className="flex items-center justify-center p-6 text-sm gap-3">
                                <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                                <span className="font-medium">Searching...</span>
                            </div>
                        )}
                        {!loading && results.length === 0 && search.trim() && (
                            <div className="flex items-center justify-center p-6 text-sm" style={{color:'var(--md-sys-color-outline)'}}>
                                No tickets found for "{search}"
                            </div>
                        )}
                        {!loading && !search.trim() && (
                            <div className="flex items-center justify-center p-6 text-sm" style={{color:'var(--md-sys-color-outline)'}}>
                                Start typing to search tickets...
                            </div>
                        )}
                        {!loading && results
                            .map((t) => (
                                <motion.button
                                    key={t.id}
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    onClick={() => { onClose(); goTo(`/&${t.id}`); }}
                                    className="md-row-box grid grid-cols-12 w-full text-left px-4 py-3 transition-all duration-150 group"
                                >
                                    <div className="col-span-2 font-mono">#{t.number ?? t.id}</div>
                                    <div className="col-span-5 truncate">{t.subject}</div>
                                    <div className="col-span-2 truncate">{convertStatus(t.status)}</div>
                                    <div className="col-span-3 truncate">{t.customer?.business_and_full_name ?? t.customer?.fullname}</div>
                                </motion.button>
                            ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

/*************************
 * Ticket List / Customers
 *************************/
function TicketListView({ goTo }) {
    const api = useApi();
    const [statusHidden, setStatusHidden] = useState(() => new Set(["Resolved"]));
    const [selectedDevices, setSelectedDevices] = useState(() => new Set(Array.from({ length: DEVICES.length }, (_, i) => i))); // default: all selected
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const listRef = useRef(null);

    const toggleStatus = (s) => { const n = new Set(statusHidden); n.has(s) ? n.delete(s) : n.add(s); setStatusHidden(n); };

    async function fetchTickets(reset = false) {
        setLoading(true);
        try {
            let data = await api.get(`/tickets?page=${reset ? 1 : page}`);
            const arr = data.tickets || data || [];
            setItems(reset ? arr : [...items, ...arr]);
            setPage(p => reset ? 1 : p);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    }

    useEffect(() => {
        fetchTickets(true);
    }, []);

    useHotkeys({
        "h": () => goTo("/"),
        "n": () => goTo("/newcustomer"),
    });

    return (
        <div className="mx-auto max-w-7xl px-6 py-6">
            <div className="flex items-center gap-3 mb-4">
                <div className="text-sm" style={{color:'var(--md-sys-color-on-surface)'}}>Status filter:</div>
                <div className="flex flex-wrap gap-2">
                    {STATUSES.map((s, i) => (
                        <button
                            key={s}
                            onClick={() => toggleStatus(s)}
                            className={cx("md-chip",
                                statusHidden.has(s) ? "" : "md-chip--on")}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex items-center gap-3 mb-6">
                <div className="text-sm" style={{color:'var(--md-sys-color-on-surface)'}}>Device filter:</div>
                <div className="flex flex-wrap gap-2">
                    {DEVICES.map((d, i) => {
                        const isSelected = selectedDevices.has(i);
                        return (
                            <button
                                key={`${d || "Other"}-${i}`}
                                onClick={() => {
                                    setSelectedDevices(prev => {
                                        const next = new Set(prev);
                                        if (next.has(i)) next.delete(i); else next.add(i);
                                        return next;
                                    });
                                }}
                                className={cx("md-chip", isSelected ? "md-chip--on" : "")}
                            >
                                {d || "Other"}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="md-card overflow-hidden">
                <div className="grid grid-cols-12 text-xs uppercase tracking-wider px-5 py-3" style={{color:'var(--md-sys-color-on-surface)'}}>
                    <div className="col-span-1 font-semibold">Number</div>
                    <div className="col-span-5 font-semibold">Subject</div>
                    <div className="col-span-2 font-semibold">Status</div>
                    <div className="col-span-1 font-semibold">Device</div>
                    <div className="col-span-1 font-semibold">Created</div>
                    <div className="col-span-2 font-semibold">Customer</div>
                </div>
                <div ref={listRef} className="divide-y" style={{borderColor:'var(--md-sys-color-outline)'}}>
                    <AnimatePresence>
                        {(items || [])
                            .filter(t => !convertStatus(t.status) || !statusHidden.has(convertStatus(t.status))) // filter out devices with a status that isn't selected
                            .filter(t => {
                                // Default behavior: if none selected, show all
                                if (!selectedDevices || selectedDevices.size === 0) return true;
                                const val = t.device_type || "";
                                const otherIdx = DEVICES.length - 1; // "" maps to Other
                                const idx = DEVICES.includes(val) ? DEVICES.indexOf(val) : otherIdx;
                                return selectedDevices.has(idx);
                            })
                            .map((t) => (
                                <motion.button
                                    key={t.id}
                                    data-row
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    onClick={() => goTo(`/&${t.id}`)}
                                    className="md-row-box grid grid-cols-12 w-full text-left px-4 py-3 transition-all duration-150 group"
                                >
                                    <div className="col-span-1 truncate">#{t.number ?? t.id}</div>
                                    <div className="col-span-5 truncate">{t.subject}</div>
                                    <div className="col-span-2 truncate">{convertStatus(t.status)}</div>
                                    <div className="col-span-1 truncate">{t.device_type || "Other"}</div>
                                    <div className="col-span-1 truncate">{fmtDate(t.created_at)}</div>
                                    <div className="col-span-2 truncate">{t.customer?.business_and_full_name ?? t.customer?.fullname}</div>
                                </motion.button>
                            ))}
                    </AnimatePresence>
                </div>
                {loading && (
                    <div className="flex items-center justify-center p-6 text-sm gap-3">
                        <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                        <span className="font-medium">Loading…</span>
                    </div>
                )}
            </div>

            <div className="flex justify-between items-center mt-6">
                <button
                    onClick={() => fetchTickets(false)}
                    className="md-btn-surface elev-1"
                >
                    Load more
                </button>
                <div className="text-xs font-medium" style={{color:'var(--md-sys-color-outline)'}}>
                    Hotkeys: H (home), S (search), N (new customer)
                </div>
            </div>
        </div>
    );
}

/*************************
 * Customer View
 *************************/
function CustomerView({ id, goTo }) {
    const api = useApi();
    const [c, setC] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tickets, setTickets] = useState([]);
    const [tPage, setTPage] = useState(1);
    const [tLoading, setTLoading] = useState(false);
    const [tHasMore, setTHasMore] = useState(true);
    useEffect(() => { (async () => { try { const d = await api.get(`/customers/${id}`); setC(d.customer || d); } catch (e) { console.error(e); } finally { setLoading(false); } })(); }, [id]);
    useEffect(() => { setTickets([]); setTPage(1); setTHasMore(true); }, [id]);
    async function loadMoreTickets() {
        if (!id || tLoading || !tHasMore) return;
        setTLoading(true);
        try {
            const d = await api.get(`/tickets?customer_id=${encodeURIComponent(id)}&page=${tPage}`);
            const arr = d.tickets || d || [];
            setTickets(prev => [...prev, ...arr]);
            setTPage(p => p + 1);
            if (!arr || arr.length === 0) setTHasMore(false);
        } catch (e) { console.error(e); setTHasMore(false); } finally { setTLoading(false); }
    }
    useEffect(() => {
        loadMoreTickets();
        // eslint-disable-next-line
    }, [id]);
    if (loading) return <Loading />;
    if (!c) return <ErrorMsg text="Customer not found" />;
    return (
        <div className="mx-auto max-w-6xl px-6 py-6 grid md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-6">
                <div className="md-card p-8">
                    <div className="text-2xl font-bold mb-2">{c.business_and_full_name || c.fullname}</div>
                    <div className="mb-1" style={{color:'var(--md-sys-color-outline)'}}>{c.email}</div>
                    <div style={{color:'var(--md-sys-color-outline)'}}>{formatPhone(c.phone || c.mobile)}</div>
                </div>
                <div className="flex gap-4">
                    <button
                        onClick={() => goTo(`/$${id}?newticket`)}
                        className="md-btn-primary elev-1 inline-flex items-center gap-2"
                    >
                        <Plus className="w-5 h-5" />
                        New Ticket
                    </button>
                    <button
                        onClick={() => goTo(`/$${id}?edit`)}
                        className="md-btn-surface elev-1 inline-flex items-center gap-2"
                    >
                        <ExternalLink className="w-5 h-5" />
                        Edit
                    </button>
                </div>

                {/* Tickets List */}
                <div className="md-card">
                    <div className="px-6 py-4 font-semibold">Tickets</div>
                    <div className="grid grid-cols-12 text-xs uppercase tracking-wider px-5 py-3">
                        <div className="col-span-2 font-semibold">Number</div>
                        <div className="col-span-4 font-semibold">Subject</div>
                        <div className="col-span-2 font-semibold">Status</div>
                        <div className="col-span-1 font-semibold">Device</div>
                        <div className="col-span-1 font-semibold">Created</div>
                    </div>
                    <div className="divide-y" style={{borderColor:'var(--md-sys-color-outline)'}}>
                        {(tickets || []).map(t => (
                            <button
                                key={t.id}
                                onClick={() => goTo(`/&${t.id}`)}
                                className="md-row-box grid grid-cols-12 w-full text-left px-4 py-3 transition-all duration-150 group"
                            >
                                <div className="col-span-2 font-mono">#{t.number ?? t.id}</div>
                                <div className="col-span-4 truncate">{t.subject}</div>
                                <div className="col-span-2 truncate">{convertStatus(t.status)}</div>
                                <div className="col-span-1 truncate">{t.device_type || "Other"}</div>
                                <div className="col-span-1 truncate">{fmtDate(t.created_at)}</div>
                            </button>
                        ))}
                        {tLoading && (
                            <div className="flex items-center justify-center p-6 text-sm gap-3">
                                <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                                <span className="font-medium">Loading…</span>
                            </div>
                        )}
                        {!tLoading && tickets.length === 0 && (
                            <div className="flex items-center justify-center p-6 text-sm" style={{color:'var(--md-sys-color-outline)'}}>
                                No tickets yet.
                            </div>
                        )}
                    </div>
                    {tHasMore && (
                        <div className="px-6 py-4">
                            <button
                                onClick={loadMoreTickets}
                                className="md-btn-surface elev-1 text-sm"
                            >
                                Load more
                            </button>
                        </div>
                    )}
                </div>
            </div>
            <div className="space-y-6">
                <div className="md-card p-6">
                    <div className="text-lg font-semibold mb-4">Notes</div>
                    <textarea
                        className="md-textarea h-32"
                        placeholder="Customer notes…"
                    />
                </div>
            </div>
        </div>
    );
}

/*************************
 * New Customer
 *************************/
function NewCustomer({ goTo, customerId }) {
    const api = useApi();
    const [form, setForm] = useState({ first_name: "", last_name: "", phone: "", email: "" });
    // Prefill from URL query params if present
    useEffect(() => {
        try {
            const url = new URL(window.location.href);
            const q = url.searchParams;
            setForm(f => ({
                first_name: q.get("first_name") ?? f.first_name,
                last_name: q.get("last_name") ?? f.last_name,
                phone: q.get("phone") ?? f.phone,
                email: q.get("email") ?? f.email,
            }));
        } catch { }
    }, []);
    // Load existing customer data if editing
    useEffect(() => {
        if (!customerId) return;
        (async () => {
            try {
                const d = await api.get(`/customers/${customerId}`);
                const c = d.customer || d;
                setForm({
                    first_name: c.first_name || "",
                    last_name: c.last_name || "",
                    phone: c.phone || c.mobile || "",
                    email: c.email || "",
                });
            } catch (e) { console.error(e); }
        })();
    }, [customerId]);
    const [saving, setSaving] = useState(false);
    async function save() {
        setSaving(true);
        try {
            let d;
            if (customerId) {
                d = await api.put(`/customers/${customerId}`, { customer: form });
            } else {
                d = await api.post(`/customers`, { customer: form });
            }
            const c = d.customer || d;
            goTo(`/$${c.id}`);
        } catch (e) { console.error(e); } finally { setSaving(false); }
    }
    return (
        <div className="mx-auto max-w-2xl px-6 py-6">
            <div className="md-card p-8 space-y-6">
                <div className="text-2xl font-bold" style={{color:'var(--md-sys-color-primary)'}}>
                    {customerId ? "Edit Customer" : "New Customer"}
                </div>
                {['first_name', 'last_name', 'phone', 'email'].map(k => (
                    <div key={k} className="space-y-2">
                        <label className="text-sm font-medium capitalize" style={{color:'var(--md-sys-color-on-surface)'}}>{k.replace('_', ' ')}</label>
                        <input
                            className="md-input"
                            value={form[k]}
                            onChange={e => setForm({ ...form, [k]: e.target.value })}
                        />
                    </div>
                ))}
                <div className="flex justify-end gap-3 pt-4">
                    <button
                        onClick={save}
                        disabled={saving}
                        className="md-btn-primary elev-1 disabled:opacity-80"
                    >
                        {saving ? "Saving…" : (customerId ? "Update" : "Create")}
                    </button>
                </div>
            </div>
        </div>
    );
}

/*************************
 * Ticket View
 *************************/
function TicketView({ id, goTo }) {
    const api = useApi();
    const [t, setT] = useState(null);
    const [loading, setLoading] = useState(true);
    const ticketCardRef = useRef(null);

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

    const generatePDF = async () => {
        if (!ticketCardRef.current) return;

        try {
            html2pdf() 
                .set({ 
                    margin: [0, 0, 0, 0], 
                    filename: "ticket.pdf", 
                    html2canvas: { scale: 3 }, 
                    jsPDF: { 
                        orientation: "l", 
                        unit: "in", 
                        format: [3.5, 1.12], 
                        setTitle: "ticket" 
                    } 
                }) 
                .from(ticketCardRef.current) 
                .output("bloburl") 
                .then(function (pdf) { 
                    const pdfWindow = window.open(pdf); 
                    pdfWindow.onload = function () { pdfWindow.print(); } 
                    const interval = setInterval(function () { 
                        if (pdfWindow.closed) { clearInterval(interval); 
                            URL.revokeObjectURL(pdf);
                        } 
                    }, 1000); 
                });
        } catch (error) {
            console.error('Error generating PDF:', error);
            alert('Error generating PDF. Please try again.');
        }
    };

    return (
        <div className="mx-auto max-w-6xl px-6 py-6">
            {/* Top Action Buttons */}
            <div className="flex justify-end gap-4 mb-6">
                <button
                    onClick={() => goTo(`/$${t.customer?.id || t.customer_id}`)}
                    className="md-btn-surface elev-1 inline-flex items-center gap-2"
                >
                    <User className="w-5 h-5" />
                    View Customer
                </button>
                <button
                    onClick={generatePDF}
                    className="md-btn-surface elev-1 inline-flex items-center gap-2"
                >
                    <Printer className="w-5 h-5" />
                    Print PDF
                </button>
                <button
                    onClick={() => goTo(`/&${t.id}?edit`)}
                    className="md-btn-primary elev-1 inline-flex items-center gap-2"
                >
                    <Edit className="w-5 h-5" />
                    Edit Ticket
                </button>
            </div>

            <div className="grid grid-cols-12 gap-6">
                {/* LEFT SIDE: Ticket + statuses */}
                <div className="col-span-12 lg:col-span-4 space-y-25">
                    {/* Ticket Card - Scaled up */}
                    <div ref={ticketCardRef} className="transform scale-147 origin-top-left bg-white rounded-md shadow-lg pt-1 pl-2 pb-[2px]">
                        <TicketCard
                            password={t.password || ""}
                            ticketNumber={t.number ?? t.id}
                            subject={t.subject}
                            itemsLeft={(t.items_left || []).join(", ")}
                            name={t.customer?.business_and_full_name || t.customer?.fullname || ""}
                            creationDate={fmtDateAndTime(t.created_at)}
                            phoneNumber={phone}
                        />
                    </div>

                    {/* Status buttons */}
                    <div className="space-y-3" style={{ width: "323px" }}>
                        <p className="text-sm font-semibold">Status:</p>
                        <div className="flex flex-col gap-2">
                            {STATUSES.map((s, i) => {
                                const active = convertStatus(t.status) === s;
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
                                        className={`${active ? 'md-btn-primary' : 'md-btn-surface'} text-left`}
                                    >
                                        {s}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* RIGHT SIDE: Comments */}
                <aside className="col-span-12 lg:col-start-7 lg:col-span-6">
                    <div className="md-card p-6">
                        <div className="text-lg font-semibold mb-4">Comments</div>
                        <CommentsBox ticketId={t.id} />
                    </div>
                </aside>
            </div>
        </div>
    );
}

function CommentsBox({ ticketId }) {
    const api = useApi();
    const [text, setText] = useState("");
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(false);
    async function load() { setLoading(true); try { const d = await api.get(`/tickets/${ticketId}/comments`); setList(d.comments || d || []); } catch (e) { console.error(e); } finally { setLoading(false); } }
    async function create() { try { await api.post(`/tickets/${ticketId}/comment`, { body: text }); setText(""); load(); } catch (e) { console.error(e); } }
    useEffect(() => {
        load(); // initial
        // eslint-disable-next-line
    }, [ticketId]);
    return (
        <div className="space-y-4">
            <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                className="md-textarea h-24"
                placeholder="Write a comment…"
            />
            <button
                onClick={create}
                className="w-full md-btn-primary elev-1"
            >
                Create Comment
            </button>
            <div className="divide-y" style={{borderColor:'var(--md-sys-color-outline)'}}>
                {loading && (
                    <div className="flex items-center justify-center py-4 text-sm" style={{color:'var(--md-sys-color-outline)'}}>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Loading…
                    </div>
                )}
                {(list || []).map(c => (
                    <div key={c.id} className="py-3">
                        <div className="md-row-box p-3">
                            <div className="text-xs mb-2" style={{color:'var(--md-sys-color-outline)'}}>{fmtDateAndTime(c.created_at)}</div>
                            <div className="whitespace-pre-wrap leading-relaxed">{c.body || c.comment || ''}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/*************************
 * Ticket Edit / New
 *************************/
function TicketEditor({ ticketId, customerId, goTo }) {
    const api = useApi();
    const [pre, setPre] = useState(null);
    const [loading, setLoading] = useState(true);
    const [subject, setSubject] = useState("");
    const [password, setPassword] = useState("");
    const [deviceIdx, setDeviceIdx] = useState(0);
    const [timeEstimate, setTimeEstimate] = useState("");
    const [itemsLeft, setItemsLeft] = useState([]);
    const [saving, setSaving] = useState(false);


    function toggleItem(name) { setItemsLeft(xs => xs.includes(name) ? xs.filter(x => x !== name) : [...xs, name]); }

    async function save() {
        setSaving(true);
        try {
            const payload = {
                ticket: {
                    subject: subject,
                    customer_id: customerId || pre?.customer_id || pre?.id,
                    password,
                    device_type: DEVICES[deviceIdx],
                    promised_by: timeEstimate,
                    items_left: itemsLeft
                }
            };
            let out;
            if (ticketId) out = await api.put(`/tickets/${ticketId}`, payload); // update the ticket
            else out = await api.post(`/tickets`, payload); // create the ticket
            const idOfNewlyCreatedOrUpdatedTicket = (out.ticket || out).id;
            goTo(`/&${idOfNewlyCreatedOrUpdatedTicket}`);
        } catch (e) { console.error(e); } finally { setSaving(false); }
    }

    if (loading) return <Loading />;

    return (
        <div className="mx-auto max-w-4xl px-6 py-6">
            <div className="md-card p-8 space-y-6">
                <div className="flex items-center justify-between">
                    <div className="text-2xl font-bold" style={{color:'var(--md-sys-color-primary)'}}>
                        {ticketId ? "Edit Ticket" : "New Ticket"}
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => goTo(ticketId ? `/&${ticketId}` : '/')}
                            className="md-btn-surface elev-1"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={save}
                            disabled={saving}
                            className="md-btn-primary elev-1 disabled:opacity-80"
                        >
                            {saving ? "Saving…" : "Save"}
                        </button>
                    </div>
                </div>

                {/* Subject spanning both columns */}
                <div className="space-y-2">
                    <label className="text-sm font-medium">Subject</label>
                    <input
                        className="md-input"
                        value={subject}
                        onChange={e => setSubject(e.target.value)}
                        placeholder="Enter ticket subject..."
                    />
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                    {/* Basic Information */}
                    <div className="space-y-6">

                        {/* Password */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Password</label>
                            <input
                                className="md-input"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="Device password"
                            />
                        </div>

                        {/* Items Left (moved to left side) */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Items Left</label>
                            <div className="flex flex-wrap gap-2">
                                {ITEMS_LEFT.map((item, i) => item && (
                                    <button
                                        key={i}
                                        onClick={() => toggleItem(item)}
                                        className={`md-chip ${itemsLeft.includes(item) ? 'md-chip--on' : ''}`}
                                    >
                                        {item}
                                    </button>
                                ))}
                            </div>
                        </div>

                    </div>

                    {/* Device Information */}
                    <div className="space-y-6">
                        {/* Device Type - single select radio-style pills */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Device Type</label>
                            <div
                                role="radiogroup"
                                aria-label="Device Type"
                                className="p-2 flex flex-wrap gap-2"
                            >
                                {DEVICES.map((d, i) => {
                                    const active = deviceIdx === i;
                                    return (
                                        <button
                                            key={i}
                                            role="radio"
                                            aria-checked={active}
                                            onClick={() => { setDeviceIdx(i); setProblems([]); }}
                                            className={`inline-flex items-center gap-2 md-chip ${active ? 'md-chip--on' : ''}`}
                                        >
                                            <span
                                                aria-hidden
                                                className={`w-2.5 h-2.5 rounded-full ${active ? "bg-white" : "border"}`}
                                            />
                                            <span>{d || "Other"}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Estimated Time - text input */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Estimated Time</label>
                            <input
                                className="md-input"
                                value={timeEstimate}
                                onChange={e => setTimeEstimate(e.target.value)}
                                placeholder="e.g. 30 min, 2 hours, Call by: 11th"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Loading() { return <div className="mx-auto max-w-3xl px-3 py-10 text-center text-gray-400">Loading…</div>; }
function ErrorMsg({ text }) { return <div className="mx-auto max-w-3xl px-3 py-10 text-center text-red-400">{text}</div>; }

/*************************
 * App
 *************************/
export default function App() {
    const { path, navigate } = useRoute();
    const [showSettings, setShowSettings] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const route = useMemo(() => {
        const url = new URL(window.location.origin + path);
        const pathname = url.pathname;
        const query = url.searchParams;
        if (pathname === "/newcustomer") return { view: "newcustomer" };
        if (pathname.startsWith("/$")) { const id = pathname.slice(2); if (query.has("newticket")) return { view: "ticket-editor", customerId: id }; if (query.has("edit")) return { view: "customer-edit", id }; return { view: "customer", id }; }
        if (pathname.startsWith("/&")) { const id = pathname.slice(2); if (query.has("edit")) return { view: "ticket-editor", ticketId: id }; return { view: "ticket", id }; }
        if (pathname.startsWith("/#")) { const number = pathname.slice(2); return { view: "ticket-by-number", number }; }
        return { view: "home" };
    }, [path]);

    return (
        <ApiProvider>
            <div className="min-h-screen material-surface">
                <TopBar
                    onHome={() => navigate("/")}
                    onSearchClick={() => setShowSearch(true)}
                    onNewCustomer={() => navigate("/newcustomer")}
                    onSettings={() => setShowSettings(true)}
                />

                {route.view === "home" && <TicketListView goTo={navigate} />}
                {route.view === "customer" && <CustomerView id={route.id} goTo={navigate} />}
                {route.view === "newcustomer" && <NewCustomer goTo={navigate} />}
                {route.view === "customer-edit" && <NewCustomer goTo={navigate} customerId={route.id} />}
                {route.view === "ticket" && <TicketView id={route.id} goTo={navigate} />}
                {route.view === "ticket-editor" && <TicketEditor ticketId={route.ticketId} customerId={route.customerId} goTo={navigate} />}
                {route.view === "ticket-by-number" && <TicketByNumber number={route.number} goTo={navigate} />}

                <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
                <SearchModal open={showSearch} onClose={() => setShowSearch(false)} goTo={navigate} />
            </div>
        </ApiProvider>
    );
}
function TicketByNumber({ number, goTo }) {
    const api = useApi();
    const [id, setId] = useState(null);
    const [err, setErr] = useState(null);
    useEffect(() => { (async () => { try { const d = await api.get(`/tickets?number=${encodeURIComponent(number)}`); const t = (d.tickets || [])[0]; if (t) setId(t.id); else setErr("Ticket not found by number"); } catch (e) { console.error(e); setErr("Ticket not found by number"); } })(); }, [number]);
    if (err) return <ErrorMsg text={err} />;
    if (!id) return <Loading />;
    return <TicketView id={id} goTo={goTo} />;
}