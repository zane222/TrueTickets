import React, { useEffect, useMemo, useRef, useState, createContext, useContext } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Settings, Plus, Loader2, Printer, UserPlus, ExternalLink, Edit, User } from "lucide-react";
import html2pdf from 'html2pdf.js';
import { Amplify } from 'aws-amplify';
import { AuthWrapper } from './components/Auth';
import LambdaClient from './api/lambdaClient';
import awsconfig from './aws-exports';

// Debug Amplify import
console.log('Amplify import:', Amplify);
console.log('Amplify.Auth before config:', Amplify.Auth);

// Try alternative import for Amplify v6
import { getCurrentUser, signIn, signOut, confirmSignIn, resetPassword, fetchAuthSession } from 'aws-amplify/auth';
console.log('Auth functions imported:', { getCurrentUser, signIn, signOut, confirmSignIn, fetchAuthSession, resetPassword });

// Configure Amplify
try {
  console.log('=== AMPLIFY CONFIGURATION DEBUG ===');
  console.log('awsconfig:', awsconfig);
  console.log('awsconfig.Auth:', awsconfig.Auth);
  console.log('userPoolId:', awsconfig.Auth.Cognito.userPoolId);
  console.log('userPoolClientId:', awsconfig.Auth.Cognito.userPoolClientId);
  console.log('region:', awsconfig.Auth.Cognito.region);
  
  if (awsconfig.Auth.Cognito.userPoolId && awsconfig.Auth.Cognito.userPoolClientId) {
    try {
      Amplify.configure(awsconfig);
      console.log('Amplify configured successfully');
      console.log('Amplify configured successfully - Auth functions should be available');
      console.log('Auth functions imported:', { getCurrentUser, signIn, signOut, confirmSignIn, fetchAuthSession, resetPassword });
      
      // Test if Auth methods are available
      console.log('signIn function type:', typeof signIn);
      console.log('confirmSignIn function type:', typeof confirmSignIn);
      
      if (typeof signIn !== 'function') {
        console.error('❌ signIn function is not available after configuration');
        console.error('This might be an Amplify version issue or configuration problem');
      }
    } catch (configError) {
      console.error('Amplify configuration failed with error:', configError);
      throw configError;
    }
  } else {
    console.error('Amplify configuration skipped - missing required environment variables');
    console.error('Missing userPoolId:', !awsconfig.Auth.Cognito.userPoolId);
    console.error('Missing userPoolClientId:', !awsconfig.Auth.Cognito.userPoolClientId);
    
    // Provide helpful error message
    console.error('🔧 SOLUTION: Create a .env file with your AWS credentials');
    console.error('Run: node setup-env.js');
    console.error('Then edit .env with your actual AWS values');
  }
} catch (error) {
  console.error('Amplify configuration failed:', error);
  console.error('Error details:', error.message, error.stack);
}

/**
 * True Tickets — Full React + Tailwind (Dark Theme) with AWS Cognito Authentication
 *
 * ARCHITECTURE:
 * - AWS Cognito User Pool for authentication with group-based permissions
 * - AWS Lambda function as API Gateway backend with dual functionality:
 *   • RepairShopr API proxy (via /api/* endpoints)
 *   • User management system (invite, list, edit, remove users)
 * - React frontend with Material Design components and dark theme
 * - Hashless, URL-driven routing
 * - Real-time authentication state management
 *
 * FEATURES:
 * - Ticket management (list, view, create, edit, status updates)
 * - Customer management (view, create, edit, phone number handling)
 * - User management system with role-based access:
 *   • ApplicationAdmin & Owner: Full user management (view, edit, remove)
 *   • Manager: Can invite users as employees only
 *   • Employee: Standard access, no user management
 * - PDF ticket generation
 * - Search and filtering capabilities
 * - Keyboard shortcuts and hotkeys
 * - Responsive design with Tailwind CSS
 *
 * SECURITY:
 * - JWT token authentication via AWS Cognito
 * - Group-based permission checking (server-side validation)
 * - Secure API key storage in Lambda environment variables
 * - CORS protection and proper error handling
 *
 * API ENDPOINTS:
 * - /api/* → RepairShopr API proxy (authenticated)
 * - /invite-user → User invitation (Manager+)
 * - /users → List all users (Admin/Owner only)
 * - /update-user-group → Change user groups (Admin/Owner only)
 * - /remove-user → Delete users (Admin/Owner only)
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

const convertStatus = (status) => {
    if (!status) return "";
    return STATUS_MAP[status] || status;
};

/*************************
 * Utility helpers
 *************************/
function cx(...xs) { return xs.filter(Boolean).join(" "); }
function fmtDate(dateString) {
    try {
        return new Date(dateString).toLocaleString(undefined, {
            year: "numeric",
            month: "numeric",   // "Sep"
            day: "numeric",
            hour: undefined,
            minute: undefined, // removes minutes
            second: undefined, // removes seconds
        });
    } catch { return dateString; }
}
function fmtTime(timeString) {
    try {
        return new Date(timeString).toLocaleString(undefined, {
            year: undefined,
            month: undefined, 
            day: undefined,
            hour: "numeric",
            minute: "2-digit", // keeps minutes like "08"
            second: undefined, // removes seconds
        });
    } catch { return timeString; }
}
function fmtDateAndTime(dateTimeString) {
    try {
        return fmtDate(dateTimeString) + " | " + fmtTime(dateTimeString);
    } catch { return dateTimeString; }
}
function formatPhone(phoneNumber = "") {
    const digits = phoneNumber.replace(/\D/g, ""); // remove anything not a digit
    if (digits.length === 10) {
        return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return phoneNumber;
}

function getTicketPassword(ticket) {
    try {
        // Check ticket_fields[0].ticket_type_id first, fallback to main ticket_type_id
        const typeId = ticket?.ticket_fields?.[0]?.ticket_type_id || ticket?.ticket_type_id;
        const props = ticket?.properties || {};
        const invalid = new Set(["n", "na", "n/a", "none"]);
        const norm = (str) => (typeof str === 'string' ? str.toLowerCase().trim() : "");
        if (typeId === 9818 || typeId === 9836) {
            const normalizedPassword = norm(props.Password);
            if (normalizedPassword && !invalid.has(normalizedPassword)) return props.Password;
        } else if (typeId === 9801) {
            const normalizedPassword = norm(props.passwordForPhone);
            if (normalizedPassword && !invalid.has(normalizedPassword)) return props.passwordForPhone;
        }
        return "";
    } catch { return ""; }
}

function getTicketDeviceInfo(ticket) {
    try {
        const techNotes = ticket?.properties?.["Tech Notes"] || "";
        if (techNotes.startsWith("v1")) {
            const data = JSON.parse(techNotes.substring(2));
            return {
                device: data.device || "Other",
                itemsLeft: data.itemsLeft || [],
                howLong: data.howLong || ""
            };
        } else if (techNotes.startsWith("v2")) {
            const data = JSON.parse(techNotes.substring(2));
            return {
                device: data.device || "Other",
                itemsLeft: data.itemsLeft || [],
                howLong: data.estimatedTime || ""
            };
        }
        return { device: "Other", itemsLeft: [], howLong: "" };
    } catch { 
        return { device: "Other", itemsLeft: [], howLong: "" };
    }
}

function formatItemsLeft(itemsLeft) {
    if (!Array.isArray(itemsLeft) || itemsLeft.length === 0) return "";
    return "They left: " + itemsLeft.join(", ").toLowerCase();
}

function useHotkeys(map) {
    useEffect(() => {
        function onKey(event) {
            const targetTag = (event.target || {}).tagName;
            if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') return;
            
            // Handle complex key combinations
            let keyCombo = '';
            if (event.altKey) keyCombo += 'alt+';
            if (event.ctrlKey) keyCombo += 'ctrl+';
            if (event.shiftKey) keyCombo += 'shift+';
            
            const key = event.key.toLowerCase();
            if (key === 'arrowleft') keyCombo += 'arrowleft';
            else if (key === 'arrowright') keyCombo += 'arrowright';
            else if (key === 'arrowup') keyCombo += 'arrowup';
            else if (key === 'arrowdown') keyCombo += 'arrowdown';
            else keyCombo += key;
            
            if (map[keyCombo]) {
                map[keyCombo](event);
                return;
            }
            
            // Fallback to simple key
            if (map[key]) map[key](event);
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
    const [lambdaUrl, setLambdaUrl] = useState(import.meta.env.VITE_API_GATEWAY_URL || "https://your-api-gateway-url.amazonaws.com/prod");
    const client = useMemo(() => {
        const lambdaClient = new LambdaClient(lambdaUrl);
        return {
            lambdaUrl, setLambdaUrl,
            get: (path) => lambdaClient.get(path),
            post: (path, body) => lambdaClient.post(path, body),
            put: (path, body) => lambdaClient.put(path, body),
            del: (path) => lambdaClient.del(path),
        };
    }, [lambdaUrl]);
    return <ApiCtx.Provider value={client}>{children}</ApiCtx.Provider>;
}

/*************************
 * Router (pathname + query like Unity)
 *************************/
function useRoute() {
    const [path, setPath] = useState(window.location.pathname + window.location.search + window.location.hash);
    useEffect(() => {
        const updatePath = () => setPath(window.location.pathname + window.location.search + window.location.hash);
        window.addEventListener('popstate', updatePath);
        window.addEventListener('hashchange', updatePath);
        return () => { window.removeEventListener('popstate', updatePath); window.removeEventListener('hashchange', updatePath); };
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
                color: "black",
                paddingLeft: "20px",
                width: "323px",
                paddingTop: "6px",
                paddingBottom: "6px",
                transformOrigin: "top",
                fontFamily: "ff2",
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
                <p style={{ fontSize: "7.5pt" }} >
                    {password}
                </p>
                <p style={{ textAlign: "right", fontWeight: 950, paddingRight: "17pt" }}>
                    # {ticketNumber}
                </p>
            </div>

            {/* Subject */}
            <p style={{ position: "absolute", width: "294px" }}>
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
                <p style={{ fontSize: "7.5pt", lineHeight: "1px" }}>
                    {itemsLeft}
                </p>
                <p style={{ textAlign: "right", paddingTop: "51px", lineHeight: "7px", paddingRight: "17pt" }}>
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
                <p style={{ fontSize: "7.5pt" }}>
                    {creationDate}
                </p>
                <p style={{ textAlign: "right", paddingRight: "17pt" }}>
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
                    API Configuration
                </div>
                <div className="space-y-3">
                    <label className="block text-sm font-medium">Lambda API Gateway URL</label>
                    <input
                        className="md-input"
                        value={api.lambdaUrl}
                        onChange={(e) => api.setLambdaUrl(e.target.value)}
                        placeholder="https://xxxxxxxxxx.execute-api.us-east-2.amazonaws.com/prod"
                    />
                    <p className="text-xs text-gray-500">
                        This is the URL of your AWS API Gateway that proxies to the Lambda function.
                    </p>
                </div>
                <div className="space-y-3">
                    <div className="p-4 bg-blue-50 rounded-md">
                        <h4 className="font-medium text-blue-900 mb-2">Authentication</h4>
                        <p className="text-sm text-blue-800">
                            You are authenticated through AWS Cognito. Your API key is securely stored in the Lambda function.
                        </p>
                    </div>
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
    const [hasSearched, setHasSearched] = useState(false);
    
    // Reset search state when modal closes
    useEffect(() => {
        if (!open) {
            setSearch("");
            setResults([]);
            setLoading(false);
            setHasSearched(false);
        }
    }, [open]);
    // New Customer autofill helpers
    const parsePhoneNumber = (s = "") => (s || "").replace(/\D/g, "");
    const isLikelyPhone = (digits) => digits.length >= 7; // permissive; adjust if needed
    const handleNewCustomer = () => {
        const query = search.trim();
        if (!query) { goTo("/newcustomer"); return; }
        const digits = parsePhoneNumber(query);
        let url = "/newcustomer";
        const params = new URLSearchParams();
        if (isLikelyPhone(digits)) {
            params.set("phone", digits);
        } else if (query.includes(" ")) {
            const spaceIndex = query.lastIndexOf(" ");
            const firstName = query.slice(0, spaceIndex).trim();
            const lastName = query.slice(spaceIndex + 1).trim();
            if (firstName) params.set("first_name", firstName);
            if (lastName) params.set("last_name", lastName);
        } else {
            params.set("first_name", query); // fallback single-field
        }
        const queryString = params.toString();
        if (queryString) url += `?${queryString}`;
        onClose();
        goTo(url);
    };

    async function fetchTickets() {
        if (!search.trim()) {
            setResults([]);
            setHasSearched(false);
            return;
        }

        setLoading(true);
        setHasSearched(true);
        try {
            const data = await api.get(`/tickets?query=${encodeURIComponent(search.trim())}`);
            const tickets = data.tickets || data || [];
            setResults(tickets);
        } catch (error) {
            console.error(error);
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
                <div className="relative pl-12">
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search..."
                        className="md-input pl-12"
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
                        {!loading && hasSearched && results.length === 0 && (
                            <div className="flex items-center justify-center p-6 text-sm" style={{color:'var(--md-sys-color-outline)'}}>
                                No tickets found for "{search}"
                            </div>
                        )}
                        {!loading && !hasSearched && (
                            <div className="flex items-center justify-center p-6 text-sm" style={{color:'var(--md-sys-color-outline)'}}>
                                Start typing to search tickets...
                            </div>
                        )}
                        {!loading && results
                            .map((ticket) => (
                                <motion.button
                                    key={ticket.id}
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    onClick={() => { onClose(); goTo(`/&${ticket.id}`); }}
                                    className="md-row-box grid grid-cols-12 w-full text-left px-4 py-3 transition-all duration-150 group"
                                >
                                    <div className="col-span-2 font-mono">#{ticket.number ?? ticket.id}</div>
                                    <div className="col-span-5 truncate">{ticket.subject}</div>
                                    <div className="col-span-2 truncate">{convertStatus(ticket.status)}</div>
                                    <div className="col-span-3 truncate">{ticket.customer?.business_and_full_name ?? ticket.customer?.fullname}</div>
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
    const [showSearch, setShowSearch] = useState(false);

    const toggleStatus = (status) => { const newStatusHidden = new Set(statusHidden); newStatusHidden.has(status) ? newStatusHidden.delete(status) : newStatusHidden.add(status); setStatusHidden(newStatusHidden); };

    async function fetchTickets(reset = false) {
        setLoading(true);
        try {
            let data = await api.get(`/tickets?page=${reset ? 1 : page}`);
            const tickets = data.tickets || data || [];
            setItems(reset ? tickets : [...items, ...tickets]);
            setPage(currentPage => reset ? 1 : currentPage);
        } catch (error) { console.error(error); } finally { setLoading(false); }
    }

    useEffect(() => {
        fetchTickets(true);
    }, []);

    useHotkeys({
        "h": () => goTo("/"),
        "s": () => setShowSearch(true),
        "n": () => goTo("/newcustomer"),
    });

    return (
        <div className="mx-auto max-w-7xl px-6 py-6">
            <div className="flex items-center gap-3 mb-4">
                <div className="text-sm" style={{color:'var(--md-sys-color-on-surface)'}}>Status filter:</div>
                <div className="flex flex-wrap gap-2">
                    {STATUSES.map((status, index) => (
                        <button
                            key={status}
                            onClick={() => toggleStatus(status)}
                            className={cx("md-chip",
                                statusHidden.has(status) ? "" : "md-chip--on")}
                        >
                            {status}
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex items-center gap-3 mb-6">
                <div className="text-sm" style={{color:'var(--md-sys-color-on-surface)'}}>Device filter:</div>
                <div className="flex flex-wrap gap-2">
                    {DEVICES.map((device, index) => {
                        const isSelected = selectedDevices.has(index);
                        return (
                            <button
                                key={`${device || "Other"}-${index}`}
                                onClick={() => {
                                    setSelectedDevices(previous => {
                                        const next = new Set(previous);
                                        if (next.has(index)) next.delete(index); else next.add(index);
                                        return next;
                                    });
                                }}
                                className={cx("md-chip", isSelected ? "md-chip--on" : "")}
                            >
                                {device || "Other"}
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
                            .filter(ticket => !convertStatus(ticket.status) || !statusHidden.has(convertStatus(ticket.status))) // filter out devices with a status that isn't selected
                            .filter(ticket => {
                                // Default behavior: if none selected, show all
                                if (!selectedDevices || selectedDevices.size === 0) return true;
                                const deviceType = ticket.device_type || "";
                                const otherIndex = DEVICES.length - 1; // "" maps to Other
                                const deviceIndex = DEVICES.includes(deviceType) ? DEVICES.indexOf(deviceType) : otherIndex;
                                return selectedDevices.has(deviceIndex);
                            })
                            .map((ticket) => (
                                <motion.button
                                    key={ticket.id}
                                    data-row
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    onClick={() => goTo(`/&${ticket.id}`)}
                                    className="md-row-box grid grid-cols-12 w-full text-left px-4 py-3 transition-all duration-150 group"
                                >
                                    <div className="col-span-1 truncate">#{ticket.number ?? ticket.id}</div>
                                    <div className="col-span-5 truncate">{ticket.subject}</div>
                                    <div className="col-span-2 truncate">{convertStatus(ticket.status)}</div>
                                    <div className="col-span-1 truncate">{getTicketDeviceInfo(ticket).device}</div>
                                    <div className="col-span-1 truncate">{fmtDate(ticket.created_at)}</div>
                                    <div className="col-span-2 truncate">{ticket.customer?.business_and_full_name ?? ticket.customer?.fullname}</div>
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
    const [customer, setCustomer] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tickets, setTickets] = useState([]);
    const [tPage, setTPage] = useState(1);
    const [tLoading, setTLoading] = useState(false);
    const [tHasMore, setTHasMore] = useState(true);
    const [allPhones, setAllPhones] = useState([]);
    const passwords = useMemo(() => {
        try {
            const set = new Set();
            (tickets || []).forEach(ticket => {
                const password = (getTicketPassword(ticket) || "").trim();
                if (password) set.add(password);
            });
            return Array.from(set);
        } catch { return []; }
    }, [tickets]);
    useEffect(() => { 
        (async () => { 
            try { 
                const data = await api.get(`/customers/${id}`); 
                setCustomer(data.customer || data); 
                
                // Load all phone numbers
                try {
                    const phoneData = await api.get(`/customers/${id}/phones`);
                    const phoneArray = (phoneData && (phoneData.phones || phoneData)) || [];
                    const numbers = Array.isArray(phoneArray) ? phoneArray.map(phone => phone?.number || phone).filter(Boolean) : [];
                    setAllPhones(numbers);
                } catch (phoneError) {
                    // Fallback to mobile/phone if phones endpoint fails
                    const customer = data.customer || data;
                    const basePhone = (customer.mobile && String(customer.mobile).trim()) ? customer.mobile : (customer.phone || "");
                    if (basePhone) {
                        setAllPhones([basePhone]);
                    } else {
                        setAllPhones([]);
                    }
                }
            } catch (error) { 
                console.error(error); 
            } finally { 
                setLoading(false); 
            } 
        })(); 
    }, [id]);
    useEffect(() => { setTickets([]); setTPage(1); setTHasMore(true); }, [id]);
    async function loadMoreTickets() {
        if (!id || tLoading || !tHasMore) return;
        setTLoading(true);
        try {
            const data = await api.get(`/tickets?customer_id=${encodeURIComponent(id)}&page=${tPage}`);
            const tickets = data.tickets || data || [];
            setTickets(previous => [...previous, ...tickets]);
            setTPage(currentPage => currentPage + 1);
            if (!tickets || tickets.length === 0) setTHasMore(false);
        } catch (error) { console.error(error); setTHasMore(false); } finally { setTLoading(false); }
    }
    useEffect(() => {
        loadMoreTickets();
        // eslint-disable-next-line
    }, [id]);
    if (loading) return <Loading />;
    if (!customer) return <ErrorMsg text="Customer not found" />;
    return (
        <div className="mx-auto max-w-6xl px-6 py-6 grid md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-6">
                <div className="md-card p-8">
                    <div className="text-2xl font-bold mb-2">{customer.business_and_full_name || customer.fullname}</div>
                    <div className="mb-1" style={{color:'var(--md-sys-color-outline)'}}>{customer.email}</div>
                    <div className="space-y-1">
                        {allPhones.length > 0 ? (
                            allPhones.map((phone, index) => (
                                <div key={index} style={{color:'var(--md-sys-color-outline)'}}>
                                    {formatPhone(phone)}
                                    {index === 0 && allPhones.length > 1 && (
                                        <span className="ml-2 text-xs font-medium">(Primary)</span>
                                    )}
                                </div>
                            ))
                        ) : (
                            <div style={{color:'var(--md-sys-color-outline)'}}>No phone numbers</div>
                        )}
                    </div>
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
                        <div className="col-span-2 font-semibold">Device</div>
                        <div className="col-span-2 font-semibold">Created</div>
                    </div>
                    <div className="divide-y" style={{borderColor:'var(--md-sys-color-outline)'}}>
                        {(tickets || []).map(ticket => (
                            <button
                                key={ticket.id}
                                onClick={() => goTo(`/&${ticket.id}`)}
                                className="md-row-box grid grid-cols-12 w-full text-left px-4 py-3 transition-all duration-150 group"
                            >
                                <div className="col-span-2 truncate">#{ticket.number ?? ticket.id}</div>
                                <div className="col-span-4 truncate">{ticket.subject}</div>
                                <div className="col-span-2 truncate">{convertStatus(ticket.status)}</div>
                                <div className="col-span-2 truncate">{getTicketDeviceInfo(ticket).device}</div>
                                <div className="col-span-2 truncate">{fmtDate(ticket.created_at)}</div>
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
                {passwords && passwords.length > 0 && (
                    <div className="md-card p-6">
                        <div className="text-lg font-semibold mb-2">Previously used passwords</div>
                        <div className="text-sm" style={{color:'var(--md-sys-color-outline)'}}>
                            {passwords.map((password, index) => (
                                <div key={index}>{password}</div>
                            ))}
                        </div>
                    </div>
                )}
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
    const [form, setForm] = useState({ first_name: "", last_name: "", business_name: "", phone: "", email: "" });
    const [allPhones, setAllPhones] = useState([""]); // All phone numbers in a single array
    const [primaryPhoneIndex, setPrimaryPhoneIndex] = useState(0); // Track which phone is primary
    const [applying, setApplying] = useState(false);
    const [storedCustomer, setStoredCustomer] = useState(null);
    
    // Keybinds from Unity NewCustomerManager
    useHotkeys({
        "h": () => goTo("/"),
        "s": () => {
            // Trigger search modal from parent
            const searchEvent = new CustomEvent('openSearch');
            window.dispatchEvent(searchEvent);
        },
        "c": () => {
            if (customerId) goTo(`/$${customerId}`);
        }
    });
    const formatPhoneLive = (value) => {
        const digits = (value || "").replace(/\D/g, "");
        const areaCode = digits.slice(0, 3);
        const exchange = digits.slice(3, 6);
        const number = digits.slice(6, 10);
        if (digits.length <= 3) return areaCode;
        if (digits.length <= 6) return `${areaCode}-${exchange}`;
        return `${areaCode}-${exchange}-${number}`;
    };
    const sanitizePhone = (value) => (value || "").replace(/\D/g, "");
    
    // Helper to set primary phone without reordering the list
    const setPrimaryPhone = (index) => {
        if (index < 0 || index >= allPhones.length) return;
        
        // Update which index is marked as primary (for visual indication only)
        setPrimaryPhoneIndex(index);
    };

    // Load existing customer data if editing
    useEffect(() => {
        if (!customerId) return;
        (async () => {
            try {
                const data = await api.get(`/customers/${customerId}`);
                const customer = data.customer || data;
                setStoredCustomer(customer); // Store the customer data
                
                setForm({
                    first_name: customer.firstname || customer.first_name || "",
                    last_name: customer.lastname || customer.last_name || "",
                    business_name: customer.business_name || customer.business || "",
                    phone: "", // We'll set this after loading phones
                    email: customer.email || "",
                });
                
                // Load all phones
                try {
                    const phoneData = await api.get(`/customers/${customerId}/phones`);
                    const phoneArray = (phoneData && (phoneData.phones || phoneData)) || [];
                    const numbers = Array.isArray(phoneArray) ? phoneArray.map(phone => phone?.number || phone).filter(Boolean) : [];
                    
                    if (numbers.length > 0) {
                        // Format all phone numbers
                        const formattedNumbers = numbers.map(number => formatPhoneLive(number));
                        setAllPhones(formattedNumbers);
                        setPrimaryPhoneIndex(0); // First phone is primary by default
                        // Set the first phone as the primary in the form for saving
                        setForm(previous => ({ ...previous, phone: formattedNumbers[0] }));
                    } else {
                        // Fallback to mobile/phone if no phones endpoint
                        const basePhone = (customer.mobile && String(customer.mobile).trim()) ? customer.mobile : (customer.phone || "");
                        const formattedPhone = formatPhoneLive(basePhone || "");
                        setAllPhones([formattedPhone]);
                        setPrimaryPhoneIndex(0);
                        setForm(previous => ({ ...previous, phone: formattedPhone }));
                    }
                } catch { 
                    // Fallback to mobile/phone if phones endpoint fails
                    const basePhone = (customer.mobile && String(customer.mobile).trim()) ? customer.mobile : (customer.phone || "");
                    const formattedPhone = formatPhoneLive(basePhone || "");
                    setAllPhones([formattedPhone]);
                    setPrimaryPhoneIndex(0);
                    setForm(previous => ({ ...previous, phone: formattedPhone }));
                }
            } catch (e) { console.error(e); }
        })();
    }, [customerId]);
    const [saving, setSaving] = useState(false);

    // Helpers for phone syncing and reordering
    async function getPhonesOnServer(id) {
        const phoneData = await api.get(`/customers/${id}/phones`);
        const phoneArray = (phoneData && (phoneData.phones || phoneData)) || [];
        return Array.isArray(phoneArray) ? phoneArray : [];
    }
    async function deletePhones(id, phones) {
        if (!phones || phones.length === 0) return;
        await Promise.all(
            phones.map(phone => {
                const phoneId = phone?.id ?? phone?.phone_id;
                if (!phoneId) return Promise.resolve();
                return api.del(`/customers/${id}/phones/${phoneId}`).catch(() => {});
            })
        );
    }
    async function postPhones(id, numbers) {
        if (!numbers || numbers.length === 0) return;
        for (const number of numbers) {
            try {
                await api.post(`/customers/${id}/phones`, { number: number, primary: true });
            } catch (error) { /* best-effort; continue */ }
        }
    }

    // for some reason the server picks the order completely randomly. This keeps putting the phones until the selected one to be first is first
    async function makeCorrectPhoneBeFirst(id, selected) {
        try {
            const phones = await getPhonesOnServer(id);
            const first = phones?.[0];
            if (!first) return; // nothing to order
            if ((first.number || "") === selected) return; // already first
            const targetIndex = phones.findIndex(phone => (phone.number || "") === selected);
            if (targetIndex === -1) return; // target not present
            // Delete current first and target, then post target then old first, then recurse
            const oldFirstId = first.id;
            const targetId = phones[targetIndex].id;
            await api.del(`/customers/${id}/phones/${oldFirstId}`).catch(() => {});
            await api.del(`/customers/${id}/phones/${targetId}`).catch(() => {});
            await api.post(`/customers/${id}/phones`, { number: selected, primary: true }).catch(() => {});
            await api.post(`/customers/${id}/phones`, { number: first.number, primary: true }).catch(() => {});
            // Re-check until selected is first
            return makeCorrectPhoneBeFirst(id, selected);
        } catch {
            // swallow and return
        }
    }

    async function save() {
        setSaving(true);
        try {
            const primaryPhone = allPhones[primaryPhoneIndex] || "";
            const sanitized = { 
                firstname: form.first_name, 
                lastname: form.last_name, 
                business_name: form.business_name, 
                mobile: sanitizePhone(primaryPhone),
                phone: "",
                email: form.email
            };
            let data;
            if (customerId) {
                // Edit flow with phone reordering
                if ((sanitized.firstname || "").replace(/\u200B/g, "").trim() === "") {
                    window.alert("You may have not entered the first name");
                    setSaving(false);
                    return;
                }
                if ((sanitized.mobile || "").length !== 10) {
                    window.alert("You may have typed the phone number wrong");
                    setSaving(false);
                    return;
                }
                if (applying) { setSaving(false); return; }
                setApplying(true);
                try {
                    // Send the full customer object with updated fields
                    await api.put(`/customers/${customerId}`, { ...storedCustomer, ...sanitized });

                    const currentPhones = [];
                    allPhones.forEach(phone => {
                        const digits = sanitizePhone(phone);
                        if (digits.length === 10) currentPhones.push(digits);
                    });
                    // Distinct
                    const distinct = Array.from(new Set(currentPhones));
                    // Delete old phones and post new ones
                    const old = await getPhonesOnServer(customerId);
                    await deletePhones(customerId, old || []);
                    await postPhones(customerId, distinct);
                    // Reorder to make primary phone first
                    const primaryDigits = sanitizePhone(primaryPhone);
                    await makeCorrectPhoneBeFirst(customerId, primaryDigits);
                    // Navigate to view
                    goTo(`/$${customerId}`);
                } catch (error) {
                    window.alert("Customer not edited because: " + (error?.message || error));
                } finally {
                    setApplying(false);
                    setSaving(false);
                }
                return;
            } else {
                data = await api.post(`/customers`, { customer: sanitized });
            }
            const customer = data.customer || data;
            goTo(`/$${customer.id}`);
        } catch (error) { console.error(error); } finally { setSaving(false); }
    }
    return (
        <div className="mx-auto max-w-2xl px-6 py-6">
            <div className="md-card p-8 space-y-6">
                <div className="text-2xl font-bold" style={{color:'var(--md-sys-color-primary)'}}>
                    {customerId ? "Edit Customer" : "New Customer"}
                </div>
                {["first_name", "last_name", "business_name"].map(fieldKey => (
                    <div key={fieldKey} className="space-y-2">
                        <label className="text-sm font-medium capitalize">{fieldKey.replace('_', ' ')}</label>
                        <input
                            className="md-input"
                            value={form[fieldKey]}
                            onChange={event => setForm({ ...form, [fieldKey]: event.target.value })}
                        />
                    </div>
                ))}
                <div className="space-y-2">
                    <label className="text-sm font-medium">Phone Numbers</label>
                    <div className="space-y-3">
                        {allPhones.map((phone, index) => {
                            const isPrimary = index === primaryPhoneIndex;
                            
                            return (
                                <div key={index} className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setPrimaryPhone(index)}
                                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                                            isPrimary 
                                                ? 'border-blue-500 bg-blue-500' 
                                                : 'border-gray-300 hover:border-gray-400'
                                        }`}
                                        title={isPrimary ? "Primary phone" : "Click to make primary"}
                                    >
                                        {isPrimary && (
                                            <div className="w-2 h-2 bg-white rounded-full"></div>
                                        )}
                                    </button>
                                    <input
                                        className="md-input flex-1"
                                        value={phone}
                                        onChange={event => {
                                            const value = event.target.value;
                                            // Update the phone in the allPhones array
                                            setAllPhones(prev => 
                                                prev.map((p, i) => i === index ? formatPhoneLive(value) : p)
                                            );
                                        }}
                                        inputMode={'numeric'}
                                        autoComplete={'tel'}
                                        placeholder="Phone number"
                                    />
                                    {isPrimary && (
                                        <span className="text-xs font-medium text-blue-600">Primary</span>
                                    )}
                                </div>
                            );
                        })}
                        <div>
                            <button
                                type="button"
                                className="md-btn-surface elev-1 text-xs"
                                onClick={() => setAllPhones([...allPhones, ""]) }
                            >
                                + Add another phone
                            </button>
                        </div>
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium">Email</label>
                    <input
                        className="md-input"
                        value={form.email}
                        onChange={event => setForm({ ...form, email: event.target.value })}
                        autoComplete={'email'}
                    />
                </div>
                <div className="flex justify-end gap-3 pt-4">
                    <button
                        onClick={() => goTo(customerId ? `/$${customerId}` : '/')}
                        className="md-btn-surface elev-1"
                        disabled={saving || applying}
                    >
                        Cancel
                    </button>
                    <motion.button
                        onClick={save}
                        disabled={saving || applying}
                        className="md-btn-primary elev-1 disabled:opacity-80 relative overflow-hidden"
                        whileTap={{ scale: (saving || applying) ? 1 : 0.95 }}
                        animate={(saving || applying) ? { 
                            backgroundColor: "var(--md-sys-color-primary-container)",
                            color: "black"
                        } : {
                            backgroundColor: "var(--md-sys-color-primary)",
                            color: "var(--md-sys-color-on-primary)"
                        }}
                        transition={{ duration: 0.15 }}
                    >
                        <div className="flex items-center justify-center gap-2">
                            <span>{saving ? (customerId ? "Updating..." : "Creating...") : (customerId ? "Update" : "Create")}</span>
                            {(saving || applying) && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0 }}
                                >
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                </motion.div>
                            )}
                        </div>
                        {/* Loading overlay animation */}
                        {(saving || applying) && (
                            <motion.div
                                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                                initial={{ x: '-100%' }}
                                animate={{ x: '100%' }}
                                transition={{
                                    duration: 1.5,
                                    repeat: Infinity,
                                    ease: "linear"
                                }}
                            />
                        )}
                    </motion.button>
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
    const [ticket, setTicket] = useState(null);
    const [loading, setLoading] = useState(true);
    const ticketCardRef = useRef(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [updatingStatus, setUpdatingStatus] = useState(null); // Track which status is being updated
    
    useHotkeys({
        "h": () => goTo("/"),
        "s": () => {
            // Trigger search modal from parent
            const searchEvent = new CustomEvent('openSearch');
            window.dispatchEvent(searchEvent);
        },
        "c": () => goTo(`/$${t?.customer?.id || t?.customer_id}`),
        "e": () => goTo(`/&${id}?edit`),
        "p": () => generatePDF()
    });

    const fetchTicket = async () => {
        setLoading(true);
        try {
            const data = await api.get(`/tickets/${id}`);
            setTicket(data.ticket || data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTicket();
    }, [id, api, refreshKey]);

    // Listen for ticket refresh events
    useEffect(() => {
        const handleRefresh = () => {
            setRefreshKey(prev => prev + 1);
        };
        window.addEventListener('refreshTicket', handleRefresh);
        return () => window.removeEventListener('refreshTicket', handleRefresh);
    }, []);

    if (loading) return <Loading />;
    if (!ticket) return <ErrorMsg text="Ticket not found" />;

    const phone = formatPhone(ticket.customer?.phone || ticket.customer?.mobile || "");

    const generatePDF = async () => {
        if (!ticketCardRef.current) return;

        try {
            html2pdf() 
                .set({ 
                    margin: [0, 0, 0, 0], 
                    filename: "ticket.pdf", 
                    html2canvas: { scale: 8 }, 
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
                    onClick={() => goTo(`/$${ticket.customer?.id || ticket.customer_id}`)}
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
                    onClick={() => goTo(`/&${ticket.id}?edit`)}
                    className="md-btn-primary elev-1 inline-flex items-center gap-2"
                >
                    <Edit className="w-5 h-5" />
                    Edit Ticket
                </button>
            </div>

            <div className="grid grid-cols-12 gap-6">
                {/* LEFT SIDE: Ticket + statuses */}
                <div className="col-span-12 lg:col-span-4 space-y-20">
                    {/* Ticket Card - Scaled up */}
                    <div className="transform scale-148 origin-top-left bg-white rounded-md shadow-lg">
                        <div ref={ticketCardRef}>
                            <TicketCard
                                password={getTicketPassword(ticket)}
                                ticketNumber={ticket.number ?? ticket.id}
                                subject={ticket.subject}
                                itemsLeft={formatItemsLeft(getTicketDeviceInfo(ticket).itemsLeft)}
                                name={ticket.customer?.business_and_full_name || ticket.customer?.fullname || ""}
                                creationDate={fmtDateAndTime(ticket.created_at)}
                                phoneNumber={phone}
                            />
                        </div>
                    </div>

                    {/* Status buttons */}
                    <div className="md-card p-4 space-y-3" style={{ width: "240px" }}>
                        <p className="text-md font-semibold">Status:</p>
                        <div className="flex flex-col gap-2">
                            {STATUSES.map((status, index) => {
                                const active = convertStatus(ticket.status) === status;
                                const isUpdating = updatingStatus === status;
                                return (
                                    <motion.button
                                        key={status}
                                        onClick={async () => {
                                            if (isUpdating) return; // Prevent multiple clicks
                                            
                                            setUpdatingStatus(status);
                                            try {
                                                // Send the full ticket object with updated status
                                                const updatedTicket = { ...ticket, status: status };
                                                await api.put(`/tickets/${ticket.id}`, updatedTicket);
                                                setTicket(updatedTicket);
                                            } catch (error) {
                                                console.error(error);
                                                alert(`Failed to update status: ${error.message}`);
                                            } finally {
                                                setUpdatingStatus(null);
                                            }
                                        }}
                                        disabled={isUpdating}
                                        className={`${active ? 'md-btn-primary' : 'md-btn-surface'} text-left relative overflow-hidden ${
                                            isUpdating ? 'cursor-not-allowed' : ''
                                        }`}
                                        style={active ? { borderRadius: '12px' } : {}}
                                        whileTap={{ scale: 0.95 }}
                                        animate={isUpdating ? { 
                                            backgroundColor: active ? "var(--md-sys-color-primary)" : "var(--md-sys-color-primary-container)",
                                            color: "black"
                                        } : {
                                            backgroundColor: active ? "var(--md-sys-color-primary)" : "#2c2c2f",
                                            color: active ? "black" : "var(--md-sys-color-on-surface)"
                                        }}
                                        transition={{ duration: 0.15 }}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span>{status}</span>
                                            {isUpdating && (
                                                <motion.div
                                                    initial={{ opacity: 0, scale: 0 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    exit={{ opacity: 0, scale: 0 }}
                                                    className="ml-2"
                                                >
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                </motion.div>
                                            )}
                                        </div>
                                        {/* Loading overlay animation */}
                                        {isUpdating && (
                                            <motion.div
                                                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                                                initial={{ x: '-100%' }}
                                                animate={{ x: '100%' }}
                                                transition={{
                                                    duration: 1.5,
                                                    repeat: Infinity,
                                                    ease: "linear"
                                                }}
                                            />
                                        )}
                                    </motion.button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* RIGHT SIDE: Comments */}
                <aside className="col-span-12 lg:col-start-7 lg:col-span-6">
                    <div className="md-card p-6">
                        <div className="text-lg font-semibold mb-4">Comments</div>
                        <CommentsBox ticketId={ticket.id} comments={ticket.comments} goTo={goTo} />
                    </div>
                </aside>
            </div>
        </div>
    );
}

function CommentsBox({ ticketId, comments, goTo }) {
    const api = useApi();
    const [text, setText] = useState("");
    const [list, setList] = useState([]);
    useEffect(() => {
        setList(comments);
    }, [comments]);

    async function create() { 
        try { 
            await api.post(`/tickets/${ticketId}/comment`, { 
                subject: "Update",
                body: text,
                tech: "True Tickets",
                hidden: true,
                do_not_email: true
            }); 
            setText(""); 
            // Trigger a refresh event to reload the ticket data
            window.dispatchEvent(new CustomEvent('refreshTicket'));
        } catch (error) { console.error(error); } 
    }

    return (
        <div className="space-y-4">
            <textarea
                value={text}
                onChange={event => setText(event.target.value)}
                className="md-textarea h-24"
                placeholder="Write a comment…"
            />
            <button
                onClick={create}
                className="w-full md-btn-primary elev-1"
            >
                Create Comment
            </button>
            <div className="space-y-3">
                {(list || []).filter(comment => {
                    const body = (comment.body ?? comment.comment ?? '').trim();
                    return body !== 'Ticket marked as Pre-Diagnosed.';
                }).map(comment => (
                    <div key={comment.id} className="md-row-box p-3 relative">
                        {/* Top bar details: tech + time (left), SMS (right) */}
                        <div className="absolute inset-x-3 top-2 flex items-center justify-between text-sm" style={{color:'var(--md-sys-color-outline)'}}>
                            <div className="flex items-center gap-3">
                                {comment.tech ? (<span>{comment.tech}</span>) : null}
                                <span>{fmtDateAndTime(comment.created_at)}</span>
                            </div>
                            {typeof comment.hidden === 'boolean' && comment.hidden === false ? (
                                <span>Probably SMS</span>
                            ) : <span />}
                        </div>

                        {/* Body */}
                        <div className="whitespace-pre-wrap leading-relaxed pt-5 text-base">{comment.body || comment.comment || ''}</div>
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
    const [previousTicket, setPreviousTicket] = useState(null);
    const [loading, setLoading] = useState(true);
    const [subject, setSubject] = useState("");
    const [password, setPassword] = useState("");
    const [deviceIdx, setDeviceIdx] = useState(0);
    const [timeEstimate, setTimeEstimate] = useState("");
    const [itemsLeft, setItemsLeft] = useState([]);
    const [saving, setSaving] = useState(false);
    const [existingProperties, setExistingProperties] = useState({});
    
    // Load existing ticket data when editing
    useEffect(() => {
        if (!ticketId) {
            setLoading(false);
            return;
        }
        
        (async () => {
            try {
                const data = await api.get(`/tickets/${ticketId}`);
                const ticket = data.ticket || data;
                setPreviousTicket(ticket);
                setSubject(ticket.subject || "");
                
                // Load existing properties to preserve them
                const properties = ticket.properties || {};
                setExistingProperties(properties);
                
                // Set password from existing data
                setPassword(properties.Password || properties.password || "");
                
                // Set charger status from existing data
                const hasCharger = properties["AC Charger"] === "1" || properties["AC Charger"] === 1;
                if (hasCharger) {
                    setItemsLeft(previous => [...previous, "Charger"]);
                }
                
                // Parse device info from Tech Notes (v1 or v2)
                const deviceInfo = getTicketDeviceInfo(ticket);
                
                // Set device from JSON
                if (deviceInfo.device) {
                    const deviceIndex = DEVICES.indexOf(deviceInfo.device);
                    if (deviceIndex !== -1) {
                        setDeviceIdx(deviceIndex);
                    }
                }
                
                // Set items left from JSON
                if (Array.isArray(deviceInfo.itemsLeft)) {
                    setItemsLeft(deviceInfo.itemsLeft);
                }
                
                // Set estimated time from JSON
                if (deviceInfo.howLong) {
                    setTimeEstimate(deviceInfo.howLong);
                }
                
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        })();
    }, [ticketId, api]);

    useHotkeys({
        "h": () => goTo("/"),
        "s": () => {
            // Trigger search modal from parent
            const searchEvent = new CustomEvent('openSearch');
            window.dispatchEvent(searchEvent);
        },
        "c": () => {
            if (customerId) goTo(`/$${customerId}`);
        },
        "t": () => {
            if (ticketId) goTo(`/&${ticketId}`);
        }
    });


    function toggleItem(name) { setItemsLeft(items => items.includes(name) ? items.filter(item => item !== name) : [...items, name]); }

    async function save() {
        setSaving(true);
        try {
            const properties = { ...existingProperties };
            
            properties.Password = password || "";
            properties["AC Charger"] = itemsLeft.includes("Charger") ? "1" : "0";
            
            // Tech Notes will only be set to empty for new tickets
            if (!ticketId) {
                properties["Tech Notes"] = "";
            }
            
            let result;
            if (ticketId) {
                // Implement ChangeTicketTypeIdToComputer logic to preserve fields
                const currentTicketTypeId = previousTicket?.ticket_type_id || previousTicket?.ticket_fields?.[0]?.ticket_type_id;
                let legacyOptions = "";
                
                // Build legacy options based on current ticket type
                if (currentTicketTypeId === 9836) {
                    if (properties.Model && properties.Model !== "") legacyOptions += "Model: " + properties.Model;
                    if (properties.imeiOrSn && properties.imeiOrSn !== "") legacyOptions += "\nIMEI or S/N: " + properties.imeiOrSn;
                    legacyOptions += "\nEver been Wet: " + (properties.EverBeenWet || "Unknown");
                    if (properties.previousDamageOrIssues && properties.previousDamageOrIssues !== "") legacyOptions += "\nPrevious Damage or Issues: " + properties.previousDamageOrIssues;
                    if (properties.techNotes && properties.techNotes !== "" && !properties.techNotes.includes("{")) legacyOptions += "\nTech notes: " + properties.techNotes;
                    if (properties.currentIssue && properties.currentIssue !== "") legacyOptions += "\nCurrent issue: " + properties.currentIssue;
                    if (properties.Size && properties.Size !== "") legacyOptions += "\nSize: " + properties.Size;
                }
                if (currentTicketTypeId === 9801) {
                    if (properties.Model && properties.Model !== "") legacyOptions += "Model: " + properties.Model;
                    if (properties.imeiOrSnForPhone && properties.imeiOrSnForPhone !== "") legacyOptions += "\nIMEI or S/N: " + properties.imeiOrSnForPhone;
                    legacyOptions += "\nEver been Wet: " + (properties.EverBeenWet || "Unknown");
                    if (properties.previousDamageOrIssues && properties.previousDamageOrIssues !== "") legacyOptions += "\nPrevious Damage or Issues: " + properties.previousDamageOrIssues;
                    if (properties.techNotes && properties.techNotes !== "" && !properties.techNotes.includes("{")) legacyOptions += "\nTech notes: " + properties.techNotes;
                    if (properties.currentIssue && properties.currentIssue !== "") legacyOptions += "\nCurrent issue: " + properties.currentIssue;
                    properties.Password = properties.passwordForPhone || "";
                }
                if (currentTicketTypeId === 23246) {
                    if (properties.Model && properties.Model !== "") legacyOptions += "\nModel: " + properties.Model;
                    if (properties.techNotes && properties.techNotes !== "" && !properties.techNotes.includes("{")) legacyOptions += "\nTech notes: " + properties.techNotes;
                }
                
                // Set password and preserve legacy options in Model
                properties.Password = (password || "").trim() !== "" ? password : "n";
                properties.Model = legacyOptions;
                
                const updatedTicket = { 
                    ...previousTicket,
                    subject: subject,
                    ticket_type_id: 9818,
                    properties: properties
                };
                
                result = await api.put(`/tickets/${ticketId}`, updatedTicket);
            } else {
                // For new tickets, create the full payload
                // Create techNotes JSON with device, items left, and estimated time
                const techNotesData = {
                    device: DEVICES[deviceIdx] || "Other",
                    itemsLeft: itemsLeft,
                    estimatedTime: timeEstimate
                };
                properties["Tech Notes"] = "v2" + JSON.stringify(techNotesData, null, 2);
                
                const payload = {
                    customer_id: customerId || previousTicket?.customer_id || previousTicket?.id,
                    user_id: 0,
                    ticket_type_id: 9818,
                    subject: subject,
                    problem_type: "Other",
                    status: "New",
                    due_date: new Date().toISOString(),
                    properties: properties
                };
                result = await api.post(`/tickets`, payload); // create the ticket
            }
            const idOfNewlyCreatedOrUpdatedTicket = (result.ticket || result).id;
            goTo(`/&${idOfNewlyCreatedOrUpdatedTicket}`);
        } catch (error) { console.error(error); } finally { setSaving(false); }
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
                        <motion.button
                            onClick={save}
                            disabled={saving}
                            className="md-btn-primary elev-1 disabled:opacity-80 relative overflow-hidden"
                            whileTap={{ scale: saving ? 1 : 0.95 }}
                            animate={saving ? { 
                                backgroundColor: "var(--md-sys-color-primary-container)",
                                color: "black"
                            } : {
                                backgroundColor: "var(--md-sys-color-primary)",
                                color: "var(--md-sys-color-on-primary)"
                            }}
                            transition={{ duration: 0.15 }}
                        >
                            <div className="flex items-center justify-center gap-2">
                                <span>{saving ? "Updating..." : "Update"}</span>
                                {saving && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0 }}
                                    >
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    </motion.div>
                                )}
                            </div>
                            {/* Loading overlay animation */}
                            {saving && (
                                <motion.div
                                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                                    initial={{ x: '-100%' }}
                                    animate={{ x: '100%' }}
                                    transition={{
                                        duration: 1.5,
                                        repeat: Infinity,
                                        ease: "linear"
                                    }}
                                />
                            )}
                        </motion.button>
                    </div>
                </div>

                {/* Subject spanning both columns */}
                <div className="space-y-2">
                    <label className="text-sm font-medium">Subject</label>
                    <input
                        className="md-input"
                        value={subject}
                        onChange={event => setSubject(event.target.value)}
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
                                onChange={event => setPassword(event.target.value)}
                                placeholder="Device password"
                            />
                        </div>

                        {/* Items Left */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Items Left</label>
                            <div className="flex flex-wrap gap-2">
                                {ITEMS_LEFT.map((item, index) => item && (
                                    <button
                                        key={index}
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
                                {DEVICES.map((device, index) => {
                                    const active = deviceIdx === index;
                                    return (
                                        <button
                                            key={index}
                                            role="radio"
                                            aria-checked={active}
                                            onClick={() => { setDeviceIdx(index); }}
                                            className={`inline-flex items-center gap-2 md-chip ${active ? 'md-chip--on' : ''}`}
                                        >
                                            <span
                                                aria-hidden
                                                className={`w-2.5 h-2.5 rounded-full ${active ? "bg-white" : "border"}`}
                                            />
                                            <span>{device || "Other"}</span>
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
                                onChange={event => setTimeEstimate(event.target.value)}
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
    
    // Listen for search events from child components
    useEffect(() => {
        const handleOpenSearch = () => setShowSearch(true);
        window.addEventListener('openSearch', handleOpenSearch);
        return () => window.removeEventListener('openSearch', handleOpenSearch);
    }, []);
    
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
        <AuthWrapper>
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
        </AuthWrapper>
    );
}
function TicketByNumber({ number, goTo }) {
    const api = useApi();
    const [id, setId] = useState(null);
    const [err, setErr] = useState(null);
    useEffect(() => { (async () => { try { const data = await api.get(`/tickets?number=${encodeURIComponent(number)}`); const ticket = (data.tickets || [])[0]; if (ticket) setId(ticket.id); else setErr("Ticket not found by number"); } catch (error) { console.error(error); setErr("Ticket not found by number"); } })(); }, [number]);
    if (err) return <ErrorMsg text={err} />;
    if (!id) return <Loading />;
    return <TicketView id={id} goTo={goTo} />;
}