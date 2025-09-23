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
const DEVICES = ["Phone", "Tablet", "Laptop", "Desktop", "All in one", "Watch", "Console", "Other"];
const HOW_LONG = ["30 min", "45 min", "2 hours", "4 hours", "1-2 days"];
const ITEMS_LEFT = ["Charger", "Case", "Controller", "Other"];
const COLORS = ["Purple", "Orange", "Black", "Gray", "White", "Yellow", "Pink", "Blue", "Brown", "Green", "Red", "Silver", "Gold", "Rose Gold"];

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
        <div className="sticky top-0 z-30 w-full bg-gradient-to-r from-slate-900/95 via-slate-800/95 to-slate-900/95 backdrop-blur-xl border-b border-slate-700/50 shadow-lg">
            <div className="mx-auto max-w-7xl px-6 py-4 flex items-center gap-4">
                <button
                    onClick={onHome}
                    className="text-xl font-bold tracking-wide text-white/95 flex-1 bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent hover:from-blue-300 hover:to-purple-300 transition-all duration-200 text-left cursor-pointer"
                >
                    True Tickets - Computer and Cellphone Inc
                </button>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onSearchClick}
                        title="Search"
                        className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-600/50 hover:border-slate-500/50 transition-all duration-200 hover:scale-105 shadow-md"
                    >
                        <Search className="w-5 h-5 text-slate-300" />
                    </button>
                    <button
                        onClick={onNewCustomer}
                        title="New Customer"
                        className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 border border-emerald-500/20 transition-all duration-200 hover:scale-105 shadow-md"
                    >
                        <UserPlus className="w-5 h-5 text-white" />
                    </button>
                    <button
                        onClick={onSettings}
                        title="Settings"
                        className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-600/50 hover:border-slate-500/50 transition-all duration-200 hover:scale-105 shadow-md"
                    >
                        <Settings className="w-5 h-5 text-slate-300" />
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
                        onChange={(e) => api.setApiKey(e.target.value)}
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
        <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="w-full max-w-6xl h-[80vh] rounded-3xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-600/50 shadow-2xl p-8 space-y-6 text-white flex flex-col">
                <div className="flex items-center justify-between">
                    <div className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                        Search Tickets
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleNewCustomer}
                            title="New Customer"
                            className="inline-flex items-center justify-center h-8 px-3 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 border border-emerald-500/30 text-white text-sm font-medium transition-all duration-200"
                        >
                            New Customer
                        </button>
                        <button
                            onClick={onClose}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 border border-slate-600/50 transition-all duration-200"
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
                        className="w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-700/50 border border-slate-600/50 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200 shadow-lg backdrop-blur-sm"
                        autoFocus
                    />
                    <Search className="w-5 h-5 absolute left-4 top-4 text-slate-400" />
                </div>

                {/* Results */}
                <div className="rounded-2xl border border-slate-600/50 bg-gradient-to-br from-slate-800/50 to-slate-900/50 shadow-xl backdrop-blur-sm overflow-hidden flex-1 overflow-y-auto">
                    <div className="grid grid-cols-12 text-xs uppercase tracking-wider text-slate-400 px-6 py-4 bg-slate-800/30 border-b border-slate-600/30">
                        <div className="col-span-2 font-semibold">Number</div>
                        <div className="col-span-5 font-semibold">Subject</div>
                        <div className="col-span-2 font-semibold">Status</div>
                        <div className="col-span-3 font-semibold">Customer</div>
                    </div>
                    <div className="divide-y divide-slate-700/30">
                        {loading && (
                            <div className="flex items-center justify-center p-8 text-sm gap-3 text-slate-300">
                                <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                                <span className="font-medium">Searching...</span>
                            </div>
                        )}
                        {!loading && results.length === 0 && search.trim() && (
                            <div className="flex items-center justify-center p-8 text-sm text-slate-400">
                                No tickets found for "{search}"
                            </div>
                        )}
                        {!loading && !search.trim() && (
                            <div className="flex items-center justify-center p-8 text-sm text-slate-400">
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
                                    className="grid grid-cols-12 w-full text-left hover:bg-slate-700/30 px-6 py-4 transition-all duration-200 hover:shadow-lg group"
                                >
                                    <div className="col-span-2 font-mono text-slate-200 font-medium">#{t.number ?? t.id}</div>
                                    <div className="col-span-5 truncate text-white font-medium group-hover:text-blue-300 transition-colors">{t.subject}</div>
                                    <div className="col-span-2">
                                        <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-slate-700/50 text-slate-200 border border-slate-600/50 shadow-sm">
                                            {convertStatus(t.status)}
                                        </span>
                                    </div>
                                    <div className="col-span-3 truncate text-slate-300">{t.customer?.business_and_full_name ?? t.customer?.fullname}</div>
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
            <div className="flex items-center gap-3 mb-6">
                <div className="text-sm text-slate-400 font-medium">Status filter:</div>
                <div className="flex flex-wrap gap-2">
                    {STATUSES.map((s, i) => (
                        <button
                            key={s}
                            onClick={() => toggleStatus(s)}
                            className={cx("px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 hover:scale-105 shadow-md border",
                                statusHidden.has(s)
                                    ? "bg-slate-700/30 text-slate-500 border-slate-600/30"
                                    : "bg-slate-800/80 text-slate-200 border-slate-600/50 shadow-lg hover:shadow-xl"
                            )}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex items-center gap-3 mb-6">
                <div className="text-sm text-slate-400 font-medium">Device filter:</div>
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
                                className={cx(
                                    "px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 hover:scale-105 shadow-md border",
                                    isSelected
                                        ? "bg-slate-800/80 text-slate-200 border-slate-600/50 shadow-lg hover:shadow-xl"
                                        : "bg-slate-700/30 text-slate-500 border-slate-600/30"
                                )}
                            >
                                {d || "Other"}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="rounded-3xl border border-slate-600/50 bg-gradient-to-br from-slate-800/50 to-slate-900/50 shadow-2xl backdrop-blur-sm overflow-hidden">
                <div className="grid grid-cols-12 text-xs uppercase tracking-wider text-slate-400 px-6 py-4 bg-slate-800/30 border-b border-slate-600/30">
                    <div className="col-span-2 font-semibold">Number</div>
                    <div className="col-span-4 font-semibold">Subject</div>
                    <div className="col-span-2 font-semibold">Status</div>
                    <div className="col-span-1 font-semibold">Device</div>
                    <div className="col-span-1 font-semibold">Created</div>
                    <div className="col-span-2 font-semibold">Customer</div>
                </div>
                <div ref={listRef} className="divide-y divide-slate-700/30">
                    <AnimatePresence>
                        {(items || [])
                            .filter(t => !convertStatus(t.status) || !statusHidden.has(convertStatus(t.status)))
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
                                    className="grid grid-cols-12 w-full text-left hover:bg-slate-700/30 px-6 py-4 transition-all duration-200 hover:shadow-lg group"
                                >
                                    <div className="col-span-2 font-mono text-slate-200 font-medium">#{t.number ?? t.id}</div>
                                    <div className="col-span-4 truncate text-white font-medium group-hover:text-blue-300 transition-colors">{t.subject}</div>
                                    <div className="col-span-2">
                                        <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-700/50 text-slate-200 border border-slate-600/50 shadow-sm">
                                            {convertStatus(t.status)}
                                        </span>
                                    </div>
                                    <div className="col-span-1 truncate text-slate-300">{t.device_type || "Other"}</div>
                                    <div className="col-span-1 text-slate-400">{fmtDate(t.created_at)}</div>
                                    <div className="col-span-2 truncate text-slate-300">{t.customer?.business_and_full_name ?? t.customer?.fullname}</div>
                                </motion.button>
                            ))}
                    </AnimatePresence>
                </div>
                {loading && (
                    <div className="flex items-center justify-center p-8 text-sm gap-3 text-slate-300">
                        <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                        <span className="font-medium">Loading…</span>
                    </div>
                )}
            </div>

            <div className="flex justify-between items-center mt-6">
                <button
                    onClick={() => fetchTickets(false)}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 text-white font-medium shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 border border-slate-600/50"
                >
                    Load more
                </button>
                <div className="text-xs text-slate-500 font-medium">
                    Hotkeys: H (home), S (search), N (new customer)
                </div>
            </div>
        </div>
    );
}

/*************************
 * Customer View / New Customer
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
                <div className="rounded-3xl border border-slate-600/50 bg-gradient-to-br from-slate-800/50 to-slate-900/50 shadow-2xl backdrop-blur-sm p-8">
                    <div className="text-2xl font-bold text-white mb-2">{c.business_and_full_name || c.fullname}</div>
                    <div className="text-slate-300 mb-1">{c.email}</div>
                    <div className="text-slate-300">{formatPhone(c.phone || c.mobile)}</div>
                </div>
                <div className="flex gap-4">
                    <button
                        onClick={() => goTo(`/$${id}?newticket`)}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
                    >
                        <Plus className="w-5 h-5" />
                        New Ticket
                    </button>
                    <button
                        onClick={() => goTo(`/$${id}?edit`)}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 text-white font-medium shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
                    >
                        <ExternalLink className="w-5 h-5" />
                        Edit
                    </button>
                </div>

                {/* Tickets List */}
                <div className="rounded-3xl border border-slate-600/50 bg-gradient-to-br from-slate-800/50 to-slate-900/50 shadow-2xl backdrop-blur-sm">
                    <div className="px-6 py-4 border-b border-slate-600/30 text-white font-semibold">Tickets</div>
                    <div className="grid grid-cols-12 text-xs uppercase tracking-wider text-slate-400 px-6 py-4 bg-slate-800/30 border-b border-slate-600/30">
                        <div className="col-span-2 font-semibold">Number</div>
                        <div className="col-span-4 font-semibold">Subject</div>
                        <div className="col-span-2 font-semibold">Status</div>
                        <div className="col-span-1 font-semibold">Device</div>
                        <div className="col-span-1 font-semibold">Created</div>
                    </div>
                    <div className="divide-y divide-slate-700/30">
                        {(tickets || []).map(t => (
                            <button
                                key={t.id}
                                onClick={() => goTo(`/&${t.id}`)}
                                className="grid grid-cols-12 w-full text-left hover:bg-slate-700/30 px-6 py-4 transition-all duration-200 hover:shadow-lg group"
                            >
                                <div className="col-span-2 font-mono text-slate-200 font-medium">#{t.number ?? t.id}</div>
                                <div className="col-span-4 truncate text-white font-medium group-hover:text-blue-300 transition-colors">{t.subject}</div>
                                <div className="col-span-2">
                                    <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-700/50 text-slate-200 border border-slate-600/50 shadow-sm">
                                        {convertStatus(t.status)}
                                    </span>
                                </div>
                                <div className="col-span-1 truncate text-slate-300">{t.device_type || "Other"}</div>
                                <div className="col-span-1 text-slate-400">{fmtDate(t.created_at)}</div>
                                <div className="col-span-2 truncate text-slate-300">{t.customer?.business_and_full_name ?? t.customer?.fullname}</div>
                            </button>
                        ))}
                        {tLoading && (
                            <div className="flex items-center justify-center p-8 text-sm gap-3 text-slate-300">
                                <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                                <span className="font-medium">Loading…</span>
                            </div>
                        )}
                        {!tLoading && tickets.length === 0 && (
                            <div className="flex items-center justify-center p-8 text-sm text-slate-400">
                                No tickets yet.
                            </div>
                        )}
                    </div>
                    {tHasMore && (
                        <div className="px-6 py-4">
                            <button
                                onClick={loadMoreTickets}
                                className="px-4 py-2 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-white text-sm border border-slate-600/50"
                            >
                                Load more
                            </button>
                        </div>
                    )}
                </div>
            </div>
            <div className="space-y-6">
                <div className="rounded-3xl border border-slate-600/50 bg-gradient-to-br from-slate-800/50 to-slate-900/50 shadow-2xl backdrop-blur-sm p-6">
                    <div className="text-lg font-semibold text-white mb-4">Notes</div>
                    <textarea
                        className="w-full h-32 px-4 py-3 rounded-xl bg-slate-700/50 border border-slate-600/50 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200"
                        placeholder="Customer notes…"
                    />
                </div>
            </div>
        </div>
    );
}
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
            <div className="rounded-3xl border border-slate-600/50 bg-gradient-to-br from-slate-800/50 to-slate-900/50 shadow-2xl backdrop-blur-sm p-8 space-y-6">
                <div className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                    {customerId ? "Edit Customer" : "New Customer"}
                </div>
                {['first_name', 'last_name', 'phone', 'email'].map(k => (
                    <div key={k} className="space-y-2">
                        <label className="text-sm font-medium text-slate-300 capitalize">{k.replace('_', ' ')}</label>
                        <input
                            className="w-full px-4 py-3 rounded-xl bg-slate-700/50 border border-slate-600/50 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200"
                            value={form[k]}
                            onChange={e => setForm({ ...form, [k]: e.target.value })}
                        />
                    </div>
                ))}
                <div className="flex justify-end gap-3 pt-4">
                    <button
                        onClick={save}
                        disabled={saving}
                        className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-slate-600 disabled:to-slate-700 text-white font-medium shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 disabled:hover:scale-100"
                    >
                        {saving ? "Saving…" : (customerId ? "Update" : "Create")}
                    </button>
                </div>
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
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 text-white font-medium shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
                >
                    <User className="w-5 h-5" />
                    View Customer
                </button>
                <button
                    onClick={generatePDF}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 text-white font-medium shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
                >
                    <Printer className="w-5 h-5" />
                    Print PDF
                </button>
                <button
                    onClick={() => goTo(`/&${t.id}?edit`)}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 text-white font-medium shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
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
                        <p className="text-sm font-semibold text-slate-200">Status:</p>
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
                                        className={`px-4 py-3 rounded-xl text-sm font-semibold text-left transition-all duration-200 hover:scale-105 shadow-lg border ${active
                                                ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white border-transparent shadow-xl"
                                                : "bg-slate-800/50 text-slate-300 border-slate-600/50 hover:text-white hover:bg-slate-700/50 hover:shadow-xl hover:border-slate-500/50"
                                            }`}
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
                    <div className="rounded-3xl border border-slate-600/50 bg-gradient-to-br from-slate-800/50 to-slate-900/50 shadow-2xl backdrop-blur-sm p-6">
                        <div className="text-lg font-semibold mb-4 text-white">Comments</div>
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
                className="w-full h-24 px-4 py-3 rounded-xl bg-slate-700/50 border border-slate-600/50 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200"
                placeholder="Write a comment…"
            />
            <button
                onClick={create}
                className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
            >
                Create Comment
            </button>
            <div className="divide-y divide-slate-700/30">
                {loading && (
                    <div className="flex items-center justify-center py-4 text-sm text-slate-400">
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Loading…
                    </div>
                )}
                {(list || []).map(c => (
                    <div key={c.id} className="py-4 text-sm">
                        <div className="text-slate-200 whitespace-pre-wrap leading-relaxed">{c.body || c.comment || ''}</div>
                        <div className="text-xs text-slate-500 mt-2 font-medium">{fmtDateAndTime(c.created_at)}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function TicketEditor({ ticketId, customerId, goTo }) {
    const api = useApi();
    const [pre, setPre] = useState(null);
    const [loading, setLoading] = useState(true);
    const [subject, setSubject] = useState("");
    const [password, setPassword] = useState("");
    const [deviceIdx, setDeviceIdx] = useState(0);
    const [colorIdx, setColorIdx] = useState(-1);
    const [howLongIdx, setHowLongIdx] = useState(0);
    const [itemsLeft, setItemsLeft] = useState([]);
    // removed needDataIdx
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                if (ticketId) {
                    const d = await api.get(`/tickets/${ticketId}`);
                    const t = d.ticket || d;
                    setPre(t);
                    setSubject(t.subject || "");
                    setPassword(t.password || "");
                    setDeviceIdx(DEVICES.indexOf(t.device_type) || 0);
                    setColorIdx(COLORS.indexOf(t.color) || -1);
                    {
                        const diffMin = t.promised_by ? Math.round((new Date(t.promised_by) - new Date(t.created_at)) / 60000) : 0;
                        const idx = HOW_LONG_MIN.indexOf(diffMin);
                        setHowLongIdx(idx >= 0 && HOW_LONG[idx] ? idx : 0);
                    }
                    setItemsLeft(t.items_left || []);
                    // removed needDataIdx
                }
                else if (customerId) {
                    const d = await api.get(`/customers/${customerId}`);
                    setPre(d.customer || d);
                }
            } catch (e) { console.error(e); } finally { setLoading(false); }
        })();
    }, [ticketId, customerId, deviceIdx]);

    function toggleProblem(i) { setProblems(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i]); }
    function toggleItem(name) { setItemsLeft(xs => xs.includes(name) ? xs.filter(x => x !== name) : [...xs, name]); }

    async function save() {
        setSaving(true);
        try {
            const arrival = new Date();
            const promised = HOW_LONG_MIN[howLongIdx] ? new Date(arrival.getTime() + HOW_LONG_MIN[howLongIdx] * 60000) : arrival;

            const payload = {
                ticket: {
                    subject: subject || buildSubject(),
                    customer_id: customerId || pre?.customer_id || pre?.id,
                    password,
                    device_type: DEVICES[deviceIdx],
                    color: colorIdx >= 0 ? COLORS[colorIdx] : "",
                    // need_data removed
                    promised_by: promised.toISOString(),
                    items_left: itemsLeft
                }
            };
            let out;
            if (ticketId) out = await api.put(`/tickets/${ticketId}`, payload);
            else out = await api.post(`/tickets`, payload);
            const t = out.ticket || out;
            goTo(`/&${t.id}`);
        } catch (e) { console.error(e); } finally { setSaving(false); }
    }

    function buildSubject() {
        const bits = [colorIdx >= 0 ? COLORS[colorIdx] : null].filter(Boolean);
        return bits.join(" ");
    }

    if (loading) return <Loading />;

    return (
        <div className="mx-auto max-w-4xl px-6 py-6">
            <div className="rounded-3xl border border-slate-600/50 bg-gradient-to-br from-slate-800/50 to-slate-900/50 shadow-2xl backdrop-blur-sm p-8 space-y-6">
                <div className="flex items-center justify-between">
                    <div className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                        {ticketId ? "Edit Ticket" : "New Ticket"}
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => goTo(ticketId ? `/&${ticketId}` : '/')}
                            className="px-6 py-3 rounded-xl bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 text-white font-medium shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={save}
                            disabled={saving}
                            className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-slate-600 disabled:to-slate-700 text-white font-medium shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 disabled:hover:scale-100"
                        >
                            {saving ? "Saving…" : "Save"}
                        </button>
                    </div>
                </div>

                {/* Subject spanning both columns */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Subject</label>
                    <input
                        className="w-full px-4 py-3 rounded-xl bg-slate-700/50 border border-slate-600/50 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200"
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
                            <label className="text-sm font-medium text-slate-300">Password</label>
                            <input
                                className="w-full px-4 py-3 rounded-xl bg-slate-700/50 border border-slate-600/50 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="Device password (optional)"
                            />
                        </div>

                        {/* Items Left (moved to left side) */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Items Left</label>
                            <div className="flex flex-wrap gap-2">
                                {ITEMS_LEFT.map((item, i) => item && (
                                    <button
                                        key={i}
                                        onClick={() => toggleItem(item)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border ${itemsLeft.includes(item)
                                                ? "bg-slate-700 text-white border-slate-500"
                                                : "bg-slate-800/50 text-slate-300 border-slate-600/50 hover:bg-slate-700/50"
                                            }`}
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
                            <label className="text-sm font-medium text-slate-300">Device Type</label>
                            <div
                                role="radiogroup"
                                aria-label="Device Type"
                                className="rounded-xl border border-slate-600/50 bg-slate-800/40 p-2 flex flex-wrap gap-2"
                            >
                                {DEVICES.map((d, i) => {
                                    const active = deviceIdx === i;
                                    return (
                                        <button
                                            key={i}
                                            role="radio"
                                            aria-checked={active}
                                            onClick={() => { setDeviceIdx(i); setProblems([]); }}
                                            className={`inline-flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold transition-all duration-200 border focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${active
                                                    ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white border-transparent shadow-md"
                                                    : "bg-transparent text-slate-300 border-slate-600/60 hover:bg-slate-700/40"
                                                }`}
                                        >
                                            <span
                                                aria-hidden
                                                className={`w-2.5 h-2.5 rounded-full ${active ? "bg-white" : "border border-slate-400"}`}
                                            />
                                            <span>{d || "Other"}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="text-[11px] text-slate-400">Choose one</div>
                        </div>


                        {/* Color */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Color</label>
                            <div className="flex flex-wrap gap-3">
                                {COLORS.map((color, i) => {
                                    let colorStyle = {};

                                    // Special textures for metallic colors
                                    if (color.toLowerCase() === "silver") {
                                        colorStyle = {
                                            background: "linear-gradient(135deg, #c0c0c0 0%, #a8a8a8 25%, #d3d3d3 50%, #b8b8b8 75%, #c0c0c0 100%)",
                                            boxShadow: "inset 0 1px 2px rgba(255,255,255,0.3), inset 0 -1px 2px rgba(0,0,0,0.2)"
                                        };
                                    } else if (color.toLowerCase() === "gold") {
                                        colorStyle = {
                                            background: "linear-gradient(135deg, #ffd700 0%, #ffed4e 25%, #ffd700 50%, #b8860b 75%, #ffd700 100%)",
                                            boxShadow: "inset 0 1px 2px rgba(255,255,255,0.4), inset 0 -1px 2px rgba(0,0,0,0.3)"
                                        };
                                    } else if (color.toLowerCase() === "rose gold") {
                                        colorStyle = {
                                            background: "linear-gradient(135deg, #e8b4b8 0%, #f4a6ab 25%, #e8b4b8 50%, #d4a5a9 75%, #e8b4b8 100%)",
                                            boxShadow: "inset 0 1px 2px rgba(255,255,255,0.3), inset 0 -1px 2px rgba(0,0,0,0.2)"
                                        };
                                    } else {
                                        // Regular colors
                                        const colorMap = {
                                            "purple": "#8b5cf6",
                                            "orange": "#f97316",
                                            "black": "#000000",
                                            "gray": "#6b7280",
                                            "white": "#ffffff",
                                            "yellow": "#eab308",
                                            "pink": "#ec4899",
                                            "blue": "#3b82f6",
                                            "brown": "#a3a3a3",
                                            "green": "#22c55e",
                                            "red": "#ef4444"
                                        };
                                        colorStyle = {
                                            backgroundColor: colorMap[color.toLowerCase()] || "#6b7280"
                                        };
                                    }

                                    return (
                                        <button
                                            key={i}
                                            onClick={() => setColorIdx(i)}
                                            className={`w-8 h-8 rounded-full border-2 transition-all duration-200 ${colorIdx === i
                                                    ? "border-white ring-2 ring-blue-400"
                                                    : "border-slate-600 hover:border-slate-400"
                                                }`}
                                            style={colorStyle}
                                            title={color}
                                        />
                                    );
                                })}
                            </div>
                        </div>

                        {/* Time Estimate - single select radio-style pills (no "No estimate") */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">Estimated Time</label>
                            <div
                                role="radiogroup"
                                aria-label="Estimated Time"
                                className="rounded-xl border border-slate-600/50 bg-slate-800/40 p-2 flex flex-wrap gap-2"
                            >
                                {HOW_LONG.map((h, i) => ({ h, i })).filter(x => x.h).map(({ h, i }) => {
                                    const active = howLongIdx === i;
                                    return (
                                        <button
                                            key={i}
                                            role="radio"
                                            aria-checked={active}
                                            onClick={() => setHowLongIdx(i)}
                                            className={`inline-flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold transition-all duration-200 border focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${active
                                                    ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white border-transparent shadow-md"
                                                    : "bg-transparent text-slate-300 border-slate-600/60 hover:bg-slate-700/40"
                                                }`}
                                        >
                                            <span
                                                aria-hidden
                                                className={`w-2.5 h-2.5 rounded-full ${active ? "bg-white" : "border border-slate-400"}`}
                                            />
                                            <span>{h}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="text-[11px] text-slate-400">Choose one</div>
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
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
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