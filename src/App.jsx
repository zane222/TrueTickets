import React, { useEffect, useMemo, useRef, useState, createContext, useContext, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Settings, Plus, Loader2, Printer, UserPlus, ExternalLink, Edit, User, LogOut, ChevronLeft, ChevronRight } from "lucide-react";
import html2pdf from 'html2pdf.js';
import { Amplify } from 'aws-amplify';
import { AuthWrapper, useUserGroups } from './components/Auth';
import LambdaClient from './api/lambdaClient';
import awsconfig from './aws-exports';
import { getCurrentUser, signIn, signOut, confirmSignIn, resetPassword, fetchAuthSession } from 'aws-amplify/auth';

// Configure Amplify
try {
  if (awsconfig.Auth.Cognito.userPoolId && awsconfig.Auth.Cognito.userPoolClientId) {
    try {
      Amplify.configure(awsconfig);
    } catch (configError) {
      console.error('Amplify configuration failed with error:', configError);
      throw configError;
    }
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
const ITEMS_LEFT = ["Charger", "Case", "Controller", "Bag", "Other"];

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

const convertStatusToOriginal = (displayStatus) => {
    if (!displayStatus) return "";
    // Find the original status that maps to this display status
    for (const [original, display] of Object.entries(STATUS_MAP)) {
        if (display === displayStatus) {
            return original;
        }
    }
    return displayStatus; // Return as-is if no mapping found
};

/*************************
 * Utility helpers
 *************************/
function cx(...xs) { return xs.filter(Boolean).join(" "); }

// Custom hook for change detection polling
function useChangeDetection(api, endpoint, intervalMs = 30000) {
    const [hasChanged, setHasChanged] = useState(false);
    const [originalData, setOriginalData] = useState(null);
    const [isPolling, setIsPolling] = useState(false);
    const intervalRef = useRef(null);
    const originalDataRef = useRef(null);

    const startPolling = useCallback((initialData) => {
        setOriginalData(initialData);
        originalDataRef.current = initialData; // Store in ref for stable reference
        setIsPolling(true);
        setHasChanged(false);
        
        intervalRef.current = setInterval(async () => {
            try {
                const currentData = await api.get(endpoint);
                const data = currentData.ticket || currentData.customer || currentData;
                
                // Compare with original data using the ref
                const originalStr = JSON.stringify(originalDataRef.current);
                const currentStr = JSON.stringify(data);
                
                console.log('Change detection:', {
                    endpoint,
                    originalLength: originalStr?.length,
                    currentLength: currentStr?.length,
                    isEqual: originalStr === currentStr
                });
                
                if (originalDataRef.current && originalStr !== currentStr) {
                    console.log('Change detected!', { endpoint });
                    setHasChanged(true);
                    setIsPolling(false);
                    if (intervalRef.current) {
                        clearInterval(intervalRef.current);
                        intervalRef.current = null;
                    }
                }
            } catch (error) {
                console.error('Error checking for changes:', error);
            }
        }, intervalMs);
    }, [api, endpoint, intervalMs]);

    const stopPolling = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setIsPolling(false);
    }, []);

    const resetPolling = useCallback((newData) => {
        stopPolling();
        setOriginalData(newData);
        originalDataRef.current = newData; // Update the ref as well
        setHasChanged(false);
    }, [stopPolling]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, []);

    return {
        hasChanged,
        isPolling,
        startPolling,
        stopPolling,
        resetPolling
    };
}

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
        const model = ticket?.properties?.["Model"] || "";
        if (model.startsWith("vT")) {
            const data = JSON.parse(model.substring(2));
            return {
                device: data.device || "Other",
                itemsLeft: data.itemsLeft || [],
                estimatedTime: data.estimatedTime || ""
            };
        } else {
            return { device: "Other", itemsLeft: [], estimatedTime: "" };
        }
    } catch { 
        return { device: "Other", itemsLeft: [], estimatedTime: "" };
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
            
            // Only fallback to simple key if NO modifier keys are pressed
            if (!event.altKey && !event.ctrlKey && !event.shiftKey && !event.metaKey && map[key]) {
                map[key](event);
            }
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
function TopBar({ onHome, onSearchClick, onNewCustomer, onSettings, showUserMenu, setShowUserMenu, userGroups, canInviteUsers, canManageUsers, onInviteUser, onManageUsers, onLogout }) {
    return (
        <div className="sticky top-0 z-30 w-full material-app-bar backdrop-blur-md">
            <div className="mx-auto max-w-7xl px-3 sm:px-6 py-3 sm:py-4 flex items-center gap-2 sm:gap-4">
                <button
                    onClick={onHome}
                    className="text-base sm:text-xl font-bold tracking-wide flex-1 text-left cursor-pointer truncate min-w-0"
                >
                    <span className="hidden sm:inline">True Tickets - Computer and Cellphone Inc</span>
                    <span className="sm:hidden">True Tickets</span>
                </button>
                <div className="flex items-center gap-1.5 sm:gap-3">
                    <button
                        onClick={onSearchClick}
                        title="Search"
                        className="md-btn-surface elev-1 inline-flex items-center justify-center w-12 h-12 sm:w-11 sm:h-11 rounded-full touch-manipulation"
                    >
                        <Search className="w-6 h-6 sm:w-5.5 sm:h-5.5" />
                    </button>
                    <button
                        onClick={onNewCustomer}
                        title="New Customer"
                        className="md-btn-primary elev-2 inline-flex items-center justify-center w-12 h-12 sm:w-11 sm:h-11 rounded-full touch-manipulation"
                    >
                        <UserPlus className="w-6 h-6 sm:w-5.5 sm:h-5.5" />
                    </button>
                    
                    {/* User menu dropdown */}
                    <div className="relative">
                        <motion.button
                            onClick={() => setShowUserMenu(!showUserMenu)}
                            className="md-btn-surface elev-1 inline-flex items-center justify-center w-12 h-12 sm:w-11 sm:h-11 rounded-full touch-manipulation"
                            whileTap={{ scale: 0.95 }}
                        >
                            <Settings className="w-6 h-6 sm:w-5.5 sm:h-5.5" />
                        </motion.button>

                        {showUserMenu && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="absolute right-0 mt-2 w-48 md-card py-1 z-50"
                            >
                                {canInviteUsers && (
                                    <motion.button
                                        onClick={onInviteUser}
                                        className="flex items-center w-full px-4 py-2 text-sm rounded-md transition-colors duration-10"
                                        style={{color:'var(--md-sys-color-on-surface)'}}
                                        whileHover={{ 
                                            backgroundColor: 'rgba(255, 255, 255, 0.08)'
                                        }}
                                        whileTap={{ scale: 0.98 }}
                                    >
                                        <UserPlus className="w-4 h-4 mr-3" />
                                        Invite User
                                    </motion.button>
                                )}
                                {canManageUsers && (
                                    <motion.button
                                        onClick={onManageUsers}
                                        className="flex items-center w-full px-4 py-2 text-sm rounded-md transition-colors duration-100"
                                        style={{color:'var(--md-sys-color-on-surface)'}}
                                        whileHover={{ 
                                            backgroundColor: 'rgba(255, 255, 255, 0.08)'
                                        }}
                                        whileTap={{ scale: 0.98 }}
                                    >
                                        <User className="w-4 h-4 mr-3" />
                                        Manage Users
                                    </motion.button>
                                )}
                                <motion.button
                                    onClick={onLogout}
                                    className="flex items-center w-full px-4 py-2 text-sm rounded-md transition-colors duration-200"
                                    style={{color:'var(--md-sys-color-on-surface)'}}
                                    whileHover={{ 
                                        backgroundColor: 'rgba(255, 255, 255, 0.08)'
                                    }}
                                    whileTap={{ scale: 0.98 }}
                                >
                                    <LogOut className="w-4 h-4 mr-3" />
                                    Sign Out
                                </motion.button>
                            </motion.div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
function SettingsModal({ open, onClose }) {
    const api = useApi();
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
            <div className="w-full max-w-lg md-card p-4 sm:p-8 space-y-4 sm:space-y-6">
                <div className="text-xl sm:text-2xl font-bold" style={{color:'var(--md-sys-color-primary)'}}>
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
                <div className="flex justify-end gap-2 sm:gap-3 pt-4">
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
    const [searchType, setSearchType] = useState("tickets"); // "tickets" or "customers"
    
    // Reset search state when modal closes
    useEffect(() => {
        if (!open) {
            setSearch("");
            setResults([]);
            setLoading(false);
            setHasSearched(false);
            setSearchType("tickets");
        }
    }, [open]);

    // Enhanced phone number parsing
    const parsePhoneNumber = (s = "") => (s || "").replace(/\D/g, "");
    const isLikelyPhone = (digits) => digits.length >= 7 && digits.length <= 11;
    const canParse = (str) => !isNaN(parseInt(str)) && str.trim() !== "";
    
    // New Customer autofill helpers
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

    // Smart search logic based on Unity code
    const performSearch = async (query) => {
        if (!query.trim()) {
            setResults([]);
            setHasSearched(false);
            setSearchType("tickets");
            return;
        }

        setLoading(true);
        setHasSearched(true);

        try {
            const trimmedQuery = query.trim();
            const phoneDigits = parsePhoneNumber(trimmedQuery);
            
            // Check if it's a phone number search
            if (isLikelyPhone(phoneDigits)) {
                setSearchType("customers");
                const data = await api.get(`/customers/autocomplete?query=${encodeURIComponent(phoneDigits)}`);
                setResults(data.customers || data || []);
            }
            // Check if it's a ticket number search (numeric and reasonable length)
            else if (canParse(trimmedQuery) && trimmedQuery.length <= 6) {
                setSearchType("tickets");
                const data = await api.get(`/tickets?number=${encodeURIComponent(trimmedQuery)}`);
                setResults(data.tickets || data || []);
            }
            // Check if it's a partial phone number (has dashes, dots, etc.)
            else if (phoneDigits.length >= 3 && phoneDigits.length < 7 && /[\d\-\.\(\)\s]/.test(trimmedQuery)) {
                setSearchType("customers");
                const data = await api.get(`/customers/autocomplete?query=${encodeURIComponent(phoneDigits)}`);
                setResults(data.customers || data || []);
            }
            // For text queries, search both customers and tickets, show the best results
            else {
                try {
                    const [customersData, ticketsData] = await Promise.all([
                        api.get(`/customers/autocomplete?query=${encodeURIComponent(trimmedQuery)}`),
                        api.get(`/tickets?query=${encodeURIComponent(trimmedQuery)}`)
                    ]);
                    
                    const customers = customersData.customers || customersData || [];
                    const tickets = ticketsData.tickets || ticketsData || [];
                    
                    // If we have customers with good matches, show customers
                    if (customers.length > 0) {
                        setSearchType("customers");
                        setResults(customers);
                    } else {
                        setSearchType("tickets");
                        setResults(tickets);
                    }
                } catch (error) {
                    // Fallback to ticket search if both fail
                    setSearchType("tickets");
                    const data = await api.get(`/tickets?query=${encodeURIComponent(trimmedQuery)}`);
                    setResults(data.tickets || data || []);
                }
            }
        } catch (error) {
            console.error("Search error:", error);
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            performSearch(search);
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [search]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
            <div className="w-full max-w-6xl h-[85vh] sm:h-[80vh] md-card p-4 sm:p-8 space-y-4 sm:space-y-6 flex flex-col">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-2">
                    <div className="text-xl sm:text-2xl font-bold" style={{color:'var(--md-sys-color-primary)'}}>
                        Search {searchType === "customers" ? "Customers" : "Tickets"}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleNewCustomer}
                            title="New Customer"
                            className="md-btn-primary elev-1 text-sm sm:text-base px-3 py-2 sm:px-4 sm:py-2"
                        >
                            New Customer
                        </button>
                        <button
                            onClick={onClose}
                            className="md-btn-surface elev-1 inline-flex items-center justify-center w-9 h-9 sm:w-8 sm:h-8 p-0 touch-manipulation"
                        >
                            ×
                        </button>
                    </div>
                </div>

                {/* Search Input */}
                <div className="relative pl-10 sm:pl-12">
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search..."
                        className="md-input w-full text-sm sm:text-base py-3 sm:py-2 pl-10 sm:pl-12"
                        autoFocus
                    />
                    <Search className="w-4 h-4 sm:w-5 sm:h-5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                {/* Results */}
                <div className="md-card overflow-hidden flex-1 overflow-y-auto">
                    {/* Dynamic table header based on search type */}
                    <div className="hidden sm:grid grid-cols-12 text-xs uppercase tracking-wider px-5 py-3" style={{color:'var(--md-sys-color-on-surface)'}}>
                        {searchType === "customers" ? (
                            <>
                                <div className="col-span-5 font-semibold">Name</div>
                                <div className="col-span-3 font-semibold">Phone</div>
                                <div className="col-span-4 font-semibold">Created</div>
                            </>
                        ) : (
                            <>
                                <div className="col-span-1 font-semibold">Number</div>
                                <div className="col-span-7 font-semibold">Subject</div>
                                <div className="col-span-2 font-semibold">Status</div>
                                <div className="col-span-2 font-semibold">Customer</div>
                            </>
                        )}
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
                                No {searchType} found for "{search}"
                            </div>
                        )}
                        {!loading && !hasSearched && (
                            <div className="flex items-center justify-center p-6 text-sm" style={{color:'var(--md-sys-color-outline)'}}>
                                Start typing to search {searchType}...
                            </div>
                        )}
                        {!loading && results.map((item) => (
                            <motion.button
                                key={item.id}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                onClick={() => { 
                                    onClose(); 
                                    if (searchType === "customers") {
                                        goTo(`/$${item.id}`);
                                    } else {
                                        goTo(`/&${item.id}`);
                                    }
                                }}
                                className="md-row-box w-full text-left transition-all duration-150 group"
                            >
                                {searchType === "customers" ? (
                                    <>
                                        {/* Customer Desktop layout */}
                                        <div className="hidden sm:grid grid-cols-12 px-4 py-3">
                                            <div className="col-span-5 truncate">
                                                {item.business_then_name || `${item.first_name} ${item.last_name}`}
                                            </div>
                                            <div className="col-span-3 truncate">
                                                {item.phone ? formatPhone(item.phone) : "—"}
                                            </div>
                                            <div className="col-span-4 truncate text-sm">
                                                {item.created_at ? new Date(item.created_at).toLocaleDateString() : "—"}
                                            </div>
                                        </div>
                                        
                                        {/* Customer Mobile layout */}
                                        <div className="sm:hidden px-4 py-3 space-y-2">
                                            <div className="text-sm">
                                                {item.business_then_name || `${item.first_name} ${item.last_name}`}
                                            </div>
                                            <div className="flex items-center justify-between text-sm">
                                                {item.phone && (
                                                    <span>{formatPhone(item.phone)}</span>
                                                )}
                                                <span className="text-xs" style={{color:'var(--md-sys-color-on-surface)'}}>
                                                    {item.created_at ? new Date(item.created_at).toLocaleDateString() : "—"}
                                                </span>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        {/* Ticket Desktop layout */}
                                        <div className="hidden sm:grid grid-cols-12 px-4 py-3">
                                            <div className="col-span-1 font-mono">#{item.number ?? item.id}</div>
                                            <div className="col-span-7 truncate">{item.subject}</div>
                                            <div className="col-span-2 truncate">{convertStatus(item.status)}</div>
                                            <div className="col-span-2 truncate">{item.customer_business_then_name ?? item.customer?.business_and_full_name}</div>
                                        </div>
                                        
                                        {/* Ticket Mobile layout */}
                                        <div className="sm:hidden px-4 py-3 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div className="font-semibold text-sm font-mono">#{item.number ?? item.id}</div>
                                                <div className="text-xs px-2 py-1 rounded-full" style={{backgroundColor:'var(--md-sys-color-primary-container)', color:'var(--md-sys-color-on-primary-container)'}}>
                                                    {convertStatus(item.status)}
                                                </div>
                                            </div>
                                            <div className="text-sm font-medium truncate">{item.subject}</div>
                                            <div className="text-sm truncate" style={{color:'var(--md-sys-color-on-surface)'}}>
                                                {item.customer_business_then_name ?? item.customer?.business_and_full_name}
                                            </div>
                                        </div>
                                    </>
                                )}
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
    
    // Load filter states from localStorage with defaults
    const [statusHidden, setStatusHidden] = useState(() => {
        const saved = localStorage.getItem('ticketStatusHidden');
        return saved ? new Set(JSON.parse(saved)) : new Set(["Resolved"]);
    });
    const [selectedDevices, setSelectedDevices] = useState(() => {
        const saved = localStorage.getItem('ticketSelectedDevices');
        return saved ? new Set(JSON.parse(saved)) : new Set(Array.from({ length: DEVICES.length }, (_, i) => i));
    });
    const [statusFilterCollapsed, setStatusFilterCollapsed] = useState(() => {
        const saved = localStorage.getItem('ticketStatusFilterCollapsed');
        return saved ? JSON.parse(saved) : true; // default: collapsed
    });
    const [deviceFilterCollapsed, setDeviceFilterCollapsed] = useState(() => {
        const saved = localStorage.getItem('ticketDeviceFilterCollapsed');
        return saved ? JSON.parse(saved) : true; // default: collapsed
    });
    
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const listRef = useRef(null);
    const [showSearch, setShowSearch] = useState(false);

    // Save state changes to localStorage
    useEffect(() => {
        localStorage.setItem('ticketStatusHidden', JSON.stringify([...statusHidden]));
    }, [statusHidden]);

    useEffect(() => {
        localStorage.setItem('ticketSelectedDevices', JSON.stringify([...selectedDevices]));
    }, [selectedDevices]);

    useEffect(() => {
        localStorage.setItem('ticketStatusFilterCollapsed', JSON.stringify(statusFilterCollapsed));
    }, [statusFilterCollapsed]);

    useEffect(() => {
        localStorage.setItem('ticketDeviceFilterCollapsed', JSON.stringify(deviceFilterCollapsed));
    }, [deviceFilterCollapsed]);

    const toggleStatus = (status) => { 
        const newStatusHidden = new Set(statusHidden); 
        newStatusHidden.has(status) ? newStatusHidden.delete(status) : newStatusHidden.add(status); 
        setStatusHidden(newStatusHidden);
        localStorage.setItem('ticketStatusHidden', JSON.stringify([...newStatusHidden]));
    };

    async function fetchTickets(reset = false) {
        setLoading(true);
        try {
            const currentPage = reset ? 1 : page + 1;
            let data = await api.get(`/tickets?page=${currentPage}`);
            const tickets = data.tickets || data || [];
            if (reset) {
                setItems(tickets);
                setPage(1);
            } else {
                // Filter out any duplicates by ticket ID
                const existingIds = new Set(items.map(item => item.id));
                const newTickets = tickets.filter(ticket => !existingIds.has(ticket.id));
                setItems(prev => [...prev, ...newTickets]);
                setPage(currentPage);
            }
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
        <div className="mx-auto max-w-7xl px-3 sm:px-6 py-3 sm:py-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-4">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setStatusFilterCollapsed(!statusFilterCollapsed)}
                        className="flex items-center gap-2 text-sm font-medium hover:opacity-80 transition-opacity"
                        style={{color:'var(--md-sys-color-on-surface)'}}
                    >
                        <span>Status filter:</span>
                        {statusFilterCollapsed ? (
                            <ChevronRight className="w-4 h-4" />
                        ) : (
                            <ChevronLeft className="w-4 h-4" />
                        )}
                    </button>
                    <AnimatePresence>
                        {!statusFilterCollapsed && (
                            <motion.div
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.2, ease: "easeInOut" }}
                                className="flex flex-wrap gap-1.5 sm:gap-2"
                            >
                                {STATUSES.map((status, index) => (
                                    <button
                                        key={status}
                                        onClick={() => toggleStatus(status)}
                                        className={cx("md-chip text-xs sm:text-sm px-2 py-1 sm:px-3 sm:py-1.5",
                                            statusHidden.has(status) ? "" : "md-chip--on")}
                                    >
                                        {status}
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-6">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setDeviceFilterCollapsed(!deviceFilterCollapsed)}
                        className="flex items-center gap-2 text-sm font-medium hover:opacity-80 transition-opacity"
                        style={{color:'var(--md-sys-color-on-surface)'}}
                    >
                        <span>Device filter:</span>
                        {deviceFilterCollapsed ? (
                            <ChevronRight className="w-4 h-4" />
                        ) : (
                            <ChevronLeft className="w-4 h-4" />
                        )}
                    </button>
                    <AnimatePresence>
                        {!deviceFilterCollapsed && (
                            <motion.div
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.2, ease: "easeInOut" }}
                                className="flex flex-wrap gap-1.5 sm:gap-2"
                            >
                                {DEVICES.map((device, index) => {
                                    const isSelected = selectedDevices.has(index);
                                    return (
                                        <button
                                            key={`${device || "Other"}-${index}`}
                                            onClick={() => {
                                                setSelectedDevices(previous => {
                                                    const next = new Set(previous);
                                                    if (next.has(index)) next.delete(index); else next.add(index);
                                                    localStorage.setItem('ticketSelectedDevices', JSON.stringify([...next]));
                                                    return next;
                                                });
                                            }}
                                            className={cx("md-chip text-xs sm:text-sm px-2 py-1 sm:px-3 sm:py-1.5", isSelected ? "md-chip--on" : "")}
                                        >
                                            {device || "Other"}
                                        </button>
                                    );
                                })}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <div className="md-card overflow-hidden">
                {/* Desktop table header */}
                <div className="hidden sm:grid grid-cols-12 text-xs uppercase tracking-wider px-5 py-3" style={{color:'var(--md-sys-color-on-surface)'}}>
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
                                    className="md-row-box w-full text-left transition-all duration-150 group"
                                >
                                    {/* Desktop layout */}
                                    <div className="hidden sm:grid grid-cols-12 px-4 py-3">
                                        <div className="col-span-1 truncate">#{ticket.number ?? ticket.id}</div>
                                        <div className="col-span-5 truncate">{ticket.subject}</div>
                                        <div className="col-span-2 truncate">{convertStatus(ticket.status)}</div>
                                        <div className="col-span-1 truncate">{getTicketDeviceInfo(ticket).device}</div>
                                        <div className="col-span-1 truncate">{fmtDate(ticket.created_at)}</div>
                                        <div className="col-span-2 truncate">{ticket.customer_business_then_name ?? ticket.customer?.business_and_full_name}</div>
                                    </div>
                                    
                                    {/* Mobile layout */}
                                    <div className="sm:hidden px-4 py-3 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="font-semibold text-sm">#{ticket.number ?? ticket.id}</div>
                                            <div className="text-xs px-2 py-1 rounded-full" style={{backgroundColor:'var(--md-sys-color-primary-container)', color:'var(--md-sys-color-on-primary-container)'}}>
                                                {convertStatus(ticket.status)}
                                            </div>
                                        </div>
                                        <div className="text-sm font-medium truncate">{ticket.subject}</div>
                                        <div className="flex items-center justify-between text-xs" style={{color:'var(--md-sys-color-outline)'}}>
                                            <span>{getTicketDeviceInfo(ticket).device}</span>
                                            <span>{fmtDate(ticket.created_at)}</span>
                                        </div>
                                        <div className="text-sm truncate" style={{color:'var(--md-sys-color-on-surface)'}}>
                                            {ticket.customer_business_then_name ?? ticket.customer?.business_and_full_name}
                                        </div>
                                    </div>
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
    
    // Change detection
    const { hasChanged, isPolling, startPolling, stopPolling, resetPolling } = useChangeDetection(api, `/customers/${id}`);
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
                const customerData = data.customer || data;
                setCustomer(customerData);
                
                // Start change detection polling
                startPolling(customerData); 
                
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

    // Show alert when changes are detected
    useEffect(() => {
        if (hasChanged) {
            alert("The customer has just been edited, reload to see the changes.");
            // Refresh the customer data
            (async () => {
                try {
                    const data = await api.get(`/customers/${id}`);
                    const customerData = data.customer || data;
                    setCustomer(customerData);
                    resetPolling(customerData);
                } catch (error) {
                    console.error(error);
                }
            })();
        }
    }, [hasChanged]);
    useEffect(() => { setTickets([]); setTPage(1); setTHasMore(true); }, [id]);
    async function loadMoreTickets() {
        if (!id || tLoading || !tHasMore) return;
        setTLoading(true);
        try {
            const data = await api.get(`/tickets?customer_id=${encodeURIComponent(id)}&page=${tPage}`);
            const tickets = data.tickets || data || [];
            // Filter out duplicates by ticket ID
            setTickets(previous => {
                const existingIds = new Set(previous.map(ticket => ticket.id));
                const newTickets = tickets.filter(ticket => !existingIds.has(ticket.id));
                return [...previous, ...newTickets];
            });
            setTPage(currentPage => currentPage + 1);
            if (!tickets || tickets.length === 0) setTHasMore(false);
        } catch (error) { console.error(error); setTHasMore(false); } finally { setTLoading(false); }
    }

    async function loadAllTickets() {
        if (!id || tLoading) return;
        setTLoading(true);
        setTickets([]);
        setTPage(1);
        setTHasMore(true);
        
        try {
            let allTickets = [];
            let currentPage = 1;
            let hasMore = true;
            
            while (hasMore) {
                const data = await api.get(`/tickets?customer_id=${encodeURIComponent(id)}&page=${currentPage}`);
                const tickets = data.tickets || data || [];
                
                if (tickets.length === 0) {
                    hasMore = false;
                } else {
                    allTickets = [...allTickets, ...tickets];
                    currentPage++;
                }
            }
            
            setTickets(allTickets);
            setTHasMore(false);
        } catch (error) { 
            console.error(error); 
            setTHasMore(false); 
        } finally { 
            setTLoading(false); 
        }
    }
    useEffect(() => {
        loadAllTickets();
        // eslint-disable-next-line
    }, [id]);
    if (loading) return <Loading />;
    if (!customer) return <ErrorMsg text="Customer not found" />;
    return (
        <div className="mx-auto max-w-6xl px-3 sm:px-6 py-3 sm:py-6 grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-8">
            <div className="md:col-span-2 space-y-3 sm:space-y-6">
                <div className="md-card p-3 sm:p-8">
                    <div className="text-lg sm:text-2xl font-bold mb-2">{customer.business_and_full_name || customer.fullname}</div>
                    <div className="mb-1 text-sm sm:text-base" style={{color:'var(--md-sys-color-outline)'}}>{customer.email}</div>
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
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                    <button
                        onClick={() => goTo(`/$${id}?newticket`)}
                        className="md-btn-primary elev-1 inline-flex items-center justify-center gap-2 py-3 sm:py-2 text-sm sm:text-base touch-manipulation"
                    >
                        <Plus className="w-5 h-5" />
                        New Ticket
                    </button>
                    <button
                        onClick={() => goTo(`/$${id}?edit`)}
                        className="md-btn-surface elev-1 inline-flex items-center justify-center gap-2 py-3 sm:py-2 text-sm sm:text-base touch-manipulation"
                    >
                        <ExternalLink className="w-5 h-5" />
                        Edit
                    </button>
                </div>

                {/* Tickets List */}
                <div className="md-card">
                    <div className="px-4 sm:px-6 py-4 font-semibold">Tickets</div>
                    <div className="hidden sm:grid grid-cols-12 text-xs uppercase tracking-wider px-5 py-3">
                        <div className="col-span-2 font-semibold">Number</div>
                        <div className="col-span-4 font-semibold">Subject</div>
                        <div className="col-span-2 font-semibold">Status</div>
                        <div className="col-span-2 font-semibold">Device</div>
                        <div className="col-span-2 font-semibold">Created</div>
                    </div>
                    <div className="divide-y" style={{borderColor:'var(--md-sys-color-outline)'}}>
                        {(tickets || []).map((ticket, index) => (
                            <button
                                key={`${ticket.id}-${index}`}
                                onClick={() => goTo(`/&${ticket.id}`)}
                                className="md-row-box w-full text-left px-4 py-3 transition-all duration-150 group"
                            >
                                {/* Desktop grid layout */}
                                <div className="hidden sm:grid grid-cols-12">
                                    <div className="col-span-2 truncate">#{ticket.number ?? ticket.id}</div>
                                    <div className="col-span-4 truncate">{ticket.subject}</div>
                                    <div className="col-span-2 truncate">{convertStatus(ticket.status)}</div>
                                    <div className="col-span-2 truncate">{getTicketDeviceInfo(ticket).device}</div>
                                    <div className="col-span-2 truncate">{fmtDate(ticket.created_at)}</div>
                                </div>
                                {/* Mobile card layout */}
                                <div className="sm:hidden space-y-2">
                                    <div className="flex justify-between items-start">
                                        <div className="font-semibold">#{ticket.number ?? ticket.id}</div>
                                        <div className="text-sm" style={{color:'var(--md-sys-color-outline)'}}>{fmtDate(ticket.created_at)}</div>
                                    </div>
                                    <div className="font-medium">{ticket.subject}</div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span>{convertStatus(ticket.status)}</span>
                                        <span style={{color:'var(--md-sys-color-outline)'}}>{getTicketDeviceInfo(ticket).device}</span>
                                    </div>
                                </div>
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
                    {/* Load more button removed - all tickets load automatically */}
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
                {/* <div className="md-card p-6">
                    <div className="text-lg font-semibold mb-4">Notes</div>
                    <textarea
                        className="md-textarea h-32"
                        placeholder="Customer notes…"
                    />
                </div> */}
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
    
    // Change detection (only when editing existing customer)
    const { hasChanged, isPolling, startPolling, stopPolling, resetPolling } = useChangeDetection(api, customerId ? `/customers/${customerId}` : null);
    
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
                
                // Start change detection polling
                startPolling(customer);
                
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

    // Show alert when changes are detected
    useEffect(() => {
        if (hasChanged && customerId) {
            alert("The customer has just been edited by someone else, reload to see the changes. Any changes saved may overwrite the changes just now made by someone else");
            // Refresh the customer data
            (async () => {
                try {
                    const data = await api.get(`/customers/${customerId}`);
                    const customer = data.customer || data;
                    setStoredCustomer(customer);
                    resetPolling(customer);
                } catch (error) {
                    console.error(error);
                }
            })();
        }
    }, [hasChanged, customerId]);
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
        <div className="mx-auto max-w-2xl px-3 sm:px-6 py-3 sm:py-6">
            <div className="md-card p-3 sm:p-8 space-y-4 sm:space-y-6">
                <div className="text-xl sm:text-2xl font-bold" style={{color:'var(--md-sys-color-primary)'}}>
                    {customerId ? "Edit Customer" : "New Customer"}
                </div>
                {["first_name", "last_name", "business_name"].map(fieldKey => (
                    <div key={fieldKey} className="space-y-2">
                        <label className="text-sm font-medium capitalize">{fieldKey.replace('_', ' ')}</label>
                        <input
                            className="md-input text-sm sm:text-base py-3 sm:py-2"
                            value={form[fieldKey]}
                            onChange={event => setForm({ ...form, [fieldKey]: event.target.value })}
                        />
                    </div>
                ))}
                <div className="space-y-2">
                    <label className="text-sm font-medium">Phone Numbers (make box empty to erase)</label>
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
                                        className="md-input flex-1 text-sm sm:text-base py-3 sm:py-2"
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
                                className="md-btn-surface elev-1 text-sm sm:text-xs py-2 px-3 touch-manipulation"
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
                        className="md-input text-sm sm:text-base py-3 sm:py-2"
                        value={form.email}
                        onChange={event => setForm({ ...form, email: event.target.value })}
                        autoComplete={'email'}
                    />
                </div>
                <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 pt-4">
                    <button
                        onClick={() => goTo(customerId ? `/$${customerId}` : '/')}
                        className="md-btn-surface elev-1 py-3 sm:py-2 text-sm sm:text-base touch-manipulation"
                        disabled={saving || applying}
                    >
                        Cancel
                    </button>
                    <motion.button
                        onClick={save}
                        disabled={saving || applying}
                        className="md-btn-primary elev-1 disabled:opacity-80 relative overflow-hidden py-3 sm:py-2 text-sm sm:text-base touch-manipulation"
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
    
    // Change detection
    const { hasChanged, isPolling, startPolling, stopPolling, resetPolling } = useChangeDetection(api, `/tickets/${id}`);
    
    useHotkeys({
        "h": () => goTo("/"),
        "s": () => {
            // Trigger search modal from parent
            const searchEvent = new CustomEvent('openSearch');
            window.dispatchEvent(searchEvent);
        },
        "c": () => goTo(`/$${ticket?.customer?.id || ticket?.customer_id}`),
        "e": () => goTo(`/&${id}?edit`),
        "p": () => generatePDF(),
        // Status change shortcuts
        "d": () => updateTicketStatus(STATUSES[0]), // Diagnosing
        "f": () => updateTicketStatus(STATUSES[1]), // Finding Price
        "a": () => updateTicketStatus(STATUSES[2]), // Approval Needed
        "w": () => updateTicketStatus(STATUSES[3]), // Waiting for Parts
        "o": () => updateTicketStatus(STATUSES[4]), // Waiting (Other)
        "i": () => updateTicketStatus(STATUSES[5]), // In Progress
        "r": () => updateTicketStatus(STATUSES[6]), // Ready
        "x": () => updateTicketStatus(STATUSES[7])  // Resolved
    });

    const fetchTicket = async () => {
        setLoading(true);
        try {
            const data = await api.get(`/tickets/${id}`);
            const ticketData = data.ticket || data;
            setTicket(ticketData);
            
            // Start change detection polling
            startPolling(ticketData);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    // Show alert when changes are detected
    useEffect(() => {
        if (hasChanged) {
            alert("The ticket has just been edited, reload to see the changes. Any changes to the status or comments made may overwrite the changes just now made by someone else");
            // Refresh the ticket data
            fetchTicket();
        }
    }, [hasChanged]);

    const updateTicketStatus = async (status) => {
        if (!ticket || updatingStatus) return; // Prevent multiple updates
        
        setUpdatingStatus(status);
        try {
            // Convert the display status back to the original status before uploading
            const originalStatus = convertStatusToOriginal(status);
            // Send the full ticket object with updated status
            const updatedTicket = { ...ticket, status: originalStatus };
            await api.put(`/tickets/${ticket.id}`, updatedTicket);
            setTicket(updatedTicket);
        } catch (error) {
            console.error(error);
            alert(`Failed to update status: ${error.message}`);
        } finally {
            setUpdatingStatus(null);
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
        <div className="mx-auto max-w-6xl px-3 sm:px-6 py-3 sm:py-6">
            {/* Top Action Buttons */}
            <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-4 mb-4 sm:mb-6">
                <button
                    onClick={() => goTo(`/$${ticket.customer?.id || ticket.customer_id}`)}
                    className="md-btn-surface elev-1 inline-flex items-center gap-2 py-3 sm:py-2 text-sm sm:text-base touch-manipulation"
                >
                    <User className="w-5 h-5" />
                    View Customer
                </button>
                <button
                    onClick={generatePDF}
                    className="md-btn-surface elev-1 inline-flex items-center gap-2 py-3 sm:py-2 text-sm sm:text-base touch-manipulation"
                >
                    <Printer className="w-5 h-5" />
                    Print PDF
                </button>
                <button
                    onClick={() => goTo(`/&${ticket.id}?edit`)}
                    className="md-btn-primary elev-1 inline-flex items-center gap-2 py-3 sm:py-2 text-sm sm:text-base touch-manipulation"
                >
                    <Edit className="w-5 h-5" />
                    Edit Ticket
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
                {/* LEFT SIDE: Ticket + statuses */}
                <div className="lg:col-span-4 space-y-8 lg:space-y-20">
                    {/* Ticket Card - Scaled up */}
                    <div className="transform scale-100 sm:scale-148 origin-top-left bg-white rounded-md shadow-lg">
                        <div ref={ticketCardRef}>
                            <TicketCard
                                password={getTicketPassword(ticket)}
                                ticketNumber={ticket.number ?? ticket.id}
                                subject={ticket.subject + (getTicketDeviceInfo(ticket).estimatedTime ? (" [" + getTicketDeviceInfo(ticket).estimatedTime + "]") : "")}
                                itemsLeft={formatItemsLeft(getTicketDeviceInfo(ticket).itemsLeft)}
                                name={ticket.customer?.business_and_full_name || ticket.customer?.fullname || ""}
                                creationDate={fmtDateAndTime(ticket.created_at)}
                                phoneNumber={phone}
                            />
                        </div>
                    </div>

                    {/* Status buttons */}
                    <div className="md-card p-3 sm:p-4 space-y-3 w-full sm:w-60">
                        <p className="text-sm sm:text-md font-semibold">Status:</p>
                        <div className="flex flex-col gap-2">
                            {STATUSES.map((status, index) => {
                                const active = convertStatus(ticket.status) === status;
                                const isUpdating = updatingStatus === status;
                                return (
                                    <motion.button
                                        key={status}
                                        onClick={() => updateTicketStatus(status)}
                                        disabled={isUpdating}
                                        className={`${active ? 'md-btn-primary' : 'md-btn-surface'} text-left relative overflow-hidden py-3 sm:py-2 text-sm sm:text-base touch-manipulation ${
                                            isUpdating ? 'cursor-not-allowed' : ''
                                        }`}
                                        style={active ? { borderRadius: '12px' } : {}}
                                        whileTap={{ scale: 0.95 }}
                                        animate={isUpdating ? { 
                                            backgroundColor: active ? "var(--md-sys-color-primary)" : "var(--md-sys-color-primary-container)",
                                            color: "#000000"
                                        } : {
                                            backgroundColor: active ? "var(--md-sys-color-primary)" : "#2c2c2f",
                                            color: active ? "#000000" : "var(--md-sys-color-on-surface)"
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
                <aside className="lg:col-start-7 lg:col-span-6">
                    <div className="md-card p-4 sm:p-6">
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
    const [createLoading, setCreateLoading] = useState(false);
    useEffect(() => {
        setList(comments);
    }, [comments]);

    async function create() { 
        if (createLoading) return; // Prevent multiple submissions
        setCreateLoading(true);
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
        finally { setCreateLoading(false); }
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
                disabled={createLoading}
                className="w-full md-btn-primary elev-1"
            >
                {createLoading ? 'Creating...' : 'Create Comment'}
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
    
    // Change detection
    const { hasChanged, isPolling, startPolling, stopPolling, resetPolling } = useChangeDetection(api, `/tickets/${ticketId}`);
    
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
                
                // Start change detection polling
                startPolling(ticket);
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
                
                // Parse device info from model (vT)
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
                if (deviceInfo.estimatedTime) {
                    setTimeEstimate(deviceInfo.estimatedTime);
                }
                
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        })();
    }, [ticketId, api]);

    // Show alert when changes are detected
    useEffect(() => {
        if (hasChanged) {
            alert("The ticket has just been edited by someone else, reload to see the changes. If you save your changes that may overwrite the changes the other person just now made to the ticket");
            // Refresh the ticket data
            (async () => {
                try {
                    const data = await api.get(`/tickets/${ticketId}`);
                    const ticket = data.ticket || data;
                    setPreviousTicket(ticket);
                    resetPolling(ticket);
                } catch (error) {
                    console.error(error);
                }
            })();
        }
    }, [hasChanged]);

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
            
            let model = { };
            let result;
            if (ticketId) {
                // Implement ChangeTicketTypeIdToComputer logic to preserve fields
                const currentTicketTypeId = previousTicket?.ticket_type_id || previousTicket?.ticket_fields?.[0]?.ticket_type_id;
                
                // Build legacy options based on current ticket type
                if (currentTicketTypeId === 9836) {
                    if (properties.Model && properties.Model !== "") model["Model: "] = properties.Model;
                    if (properties.imeiOrSn && properties.imeiOrSn !== "") model["IMEI or S/N: "] = properties.imeiOrSn;
                    model["Ever been Wet: "] = (properties.EverBeenWet || "Unknown");
                    if (properties.previousDamageOrIssues && properties.previousDamageOrIssues !== "") model["Previous Damage or Issues: "] = properties.previousDamageOrIssues;
                    if (properties.techNotes && properties.techNotes !== "" && !properties.techNotes.includes("{")) model["Tech notes: "] = properties.techNotes;
                    if (properties.currentIssue && properties.currentIssue !== "") model["Current issue: "] = properties.currentIssue;
                    if (properties.Size && properties.Size !== "") model["Size: "] = properties.Size;
                }
                if (currentTicketTypeId === 9801) {
                    if (properties.Model && properties.Model !== "") model["Model: "] = properties.Model;
                    if (properties.imeiOrSnForPhone && properties.imeiOrSnForPhone !== "") model["IMEI or S/N: "] = properties.imeiOrSnForPhone;
                    model["Ever been Wet: "] = (properties.EverBeenWet || "Unknown");
                    if (properties.previousDamageOrIssues && properties.previousDamageOrIssues !== "") model["Previous Damage or Issues: "] = properties.previousDamageOrIssues;
                    if (properties.techNotes && properties.techNotes !== "" && !properties.techNotes.includes("{")) model["Tech notes: "] = properties.techNotes;
                    if (properties.currentIssue && properties.currentIssue !== "") model["Current issue: "] = properties.currentIssue;
                    properties.Password = properties.passwordForPhone || "";
                }
                if (currentTicketTypeId === 23246) {
                    if (properties.Model && properties.Model !== "") model["Model: "] = properties.Model;
                    if (properties.techNotes && properties.techNotes !== "" && !properties.techNotes.includes("{")) model["Tech notes: "] = properties.techNotes;
                }
                
                // Set password and preserve legacy options in Model
                properties.Password = (password || "").trim() !== "" ? password : "n";
                
                model = {
                    ...model,
                    device: DEVICES[deviceIdx] || "Other",
                    itemsLeft: itemsLeft,
                    estimatedTime: timeEstimate
                };
                properties.Model = "vT" + JSON.stringify(model);
                
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
                model = {
                    device: DEVICES[deviceIdx] || "Other",
                    itemsLeft: itemsLeft,
                    estimatedTime: timeEstimate
                };
                properties.Model = "vT" + JSON.stringify(model, null, 2);
                
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
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-4 sm:py-6">
            <div className="md-card p-4 sm:p-8 space-y-4 sm:space-y-6">
                <div className="flex items-center justify-between">
                    <div className="text-2xl font-bold" style={{color:'var(--md-sys-color-primary)'}}>
                        {ticketId ? "Edit Ticket" : "New Ticket"}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                    {/* Basic Information */}
                    <div className="space-y-4 md:space-y-6">

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
                    <div className="space-y-4 md:space-y-6">
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
    const { userGroups = [] } = useUserGroups();
    const { path, navigate } = useRoute();
    const [showSettings, setShowSettings] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showInviteUser, setShowInviteUser] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteLoading, setInviteLoading] = useState(false);
    const [showUserManagement, setShowUserManagement] = useState(false);
    const [users, setUsers] = useState([]);
    const [usersLoading, setUsersLoading] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [showUserEdit, setShowUserEdit] = useState(false);
    
    // Listen for search events from child components
    useEffect(() => {
        const handleOpenSearch = () => setShowSearch(true);
        window.addEventListener('openSearch', handleOpenSearch);
        return () => window.removeEventListener('openSearch', handleOpenSearch);
    }, []);

    // User management functions
    const handleInviteUser = async (e) => {
        e.preventDefault();
        setInviteLoading(true);
        
        try {
            console.log('Inviting user with LambdaClient:', inviteEmail);
            
            const api = new LambdaClient(import.meta.env.VITE_API_GATEWAY_URL);
            const result = await api.post('/invite-user', { email: inviteEmail });
            
            console.log('Invite user result:', result);
            alert(`Invitation sent successfully to ${inviteEmail}. The user will receive an email with login instructions.`);
            setInviteEmail('');
            setShowInviteUser(false);
            
        } catch (error) {
            console.error('Invite user error:', error);
            let errorMessage = 'Failed to send invitation. Please try again.';
            
            if (error.message.includes('already exists')) {
                errorMessage = 'A user with this email already exists.';
            } else if (error.message.includes('Insufficient permissions')) {
                errorMessage = 'You do not have permission to invite users.';
            } else if (error.message.includes('Invalid email')) {
                errorMessage = 'Invalid email address. Please check the format.';
            } else if (error.message.includes('Too many requests')) {
                errorMessage = 'Too many requests. Please try again later.';
            }
            
            alert(errorMessage);
        } finally {
            setInviteLoading(false);
        }
    };

    const loadUsers = async () => {
        setUsersLoading(true);
        try {
            console.log('Loading users with LambdaClient');
            
            const api = new LambdaClient(import.meta.env.VITE_API_GATEWAY_URL);
            const result = await api.get('/users');
            
            console.log('Users loaded:', result);
            setUsers(result.users || []);
        } catch (error) {
            console.error('Error loading users:', error);
            alert('Failed to load users. Please try again.');
        } finally {
            setUsersLoading(false);
        }
    };

    const updateUserGroup = async (username, newGroup) => {
        try {
            console.log('Updating user group with LambdaClient:', username, newGroup);
            
            const api = new LambdaClient(import.meta.env.VITE_API_GATEWAY_URL);
            const result = await api.post('/update-user-group', { username, group: newGroup });
            
            console.log('User group updated:', result);
            alert('User group updated successfully');
            loadUsers(); // Refresh the user list
            setShowUserEdit(false);
            setSelectedUser(null);
        } catch (error) {
            console.error('Error updating user group:', error);
            alert('Failed to update user group. Please try again.');
        }
    };

    const removeUser = async (username) => {
        if (!confirm(`Are you sure you want to remove user ${username}? This action cannot be undone.`)) {
            return;
        }

        try {
            console.log('Removing user with LambdaClient:', username);
            
            const api = new LambdaClient(import.meta.env.VITE_API_GATEWAY_URL);
            const result = await api.post('/remove-user', { username });
            
            console.log('User removed:', result);
            alert('User removed successfully');
            loadUsers(); // Refresh the user list
        } catch (error) {
            console.error('Error removing user:', error);
            alert('Failed to remove user. Please try again.');
        }
    };
    // User permission checks
    const canInviteUsers = userGroups.includes('TrueTickets-Cacell-ApplicationAdmin') || 
                          userGroups.includes('TrueTickets-Cacell-Owner') || 
                          userGroups.includes('TrueTickets-Cacell-Manager');

    const canManageUsers = userGroups.includes('TrueTickets-Cacell-ApplicationAdmin') || 
                          userGroups.includes('TrueTickets-Cacell-Owner');

    console.log('Can invite users:', canInviteUsers);
    console.log('Can manage users:', canManageUsers);

    // User management handlers
    const handleInviteUserClick = () => setShowInviteUser(true);
    const handleManageUsersClick = () => {
        setShowUserManagement(true);
        loadUsers();
    };
    const handleLogout = async () => {
        try {
            await signOut();
            // Force a page reload to ensure clean logout state
            window.location.reload();
        } catch (error) {
            console.error('Logout error:', error);
        }
    };
    
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
                    showUserMenu={showUserMenu}
                    setShowUserMenu={setShowUserMenu}
                    userGroups={userGroups}
                    canInviteUsers={canInviteUsers}
                    canManageUsers={canManageUsers}
                    onInviteUser={handleInviteUserClick}
                    onManageUsers={handleManageUsersClick}
                    onLogout={handleLogout}
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
                    
                    {/* User Management Modals */}
                    {showInviteUser && (
                        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="md-card p-6 w-full max-w-md"
                            >
                                <h3 className="text-lg font-medium mb-4" style={{color:'var(--md-sys-color-primary)'}}>Invite User</h3>
                                <form onSubmit={handleInviteUser}>
                                    <div className="mb-4">
                                        <label htmlFor="inviteEmail" className="block text-sm font-medium mb-2" style={{color:'var(--md-sys-color-on-surface)'}}>
                                            Email Address
                                        </label>
                                        <input
                                            id="inviteEmail"
                                            type="email"
                                            required
                                            value={inviteEmail}
                                            onChange={(e) => setInviteEmail(e.target.value)}
                                            className="md-input"
                                            placeholder="Enter email address"
                                        />
                                    </div>
                                    <div className="flex justify-end space-x-3">
                                        <button
                                            type="button"
                                            onClick={() => setShowInviteUser(false)}
                                            className="md-btn-surface elev-1"
                                        >
                                            Cancel
                                        </button>
                                        <motion.button
                                            type="submit"
                                            disabled={inviteLoading}
                                            className="md-btn-primary elev-1"
                                            whileTap={{ scale: 0.95 }}
                                        >
                                            {inviteLoading ? 'Sending...' : 'Send Invitation'}
                                        </motion.button>
                                    </div>
                                </form>
                            </motion.div>
                        </div>
                    )}

                    {showUserManagement && (
                        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="md-card p-6 w-full max-w-4xl max-h-[80vh] overflow-hidden"
                            >
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-lg font-medium" style={{color:'var(--md-sys-color-primary)'}}>User Management</h3>
                                    <button
                                        onClick={() => setShowUserManagement(false)}
                                        className="text-gray-500 hover:text-gray-700"
                                    >
                                        ✕
                                    </button>
                                </div>
                                
                                {usersLoading ? (
                                    <div className="flex justify-center py-8">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{borderColor:'var(--md-sys-color-primary)'}}></div>
                                    </div>
                                ) : (
                                    <div className="space-y-4 max-h-96 overflow-y-auto">
                                        {users.map((user) => (
                                            <div key={user.username} className="md-row-box p-4 flex items-center justify-between">
                                                <div className="flex-1">
                                                    <div className="font-medium">{user.email || user.username}</div>
                                                    <div className="text-sm text-gray-500">
                                                        Groups: {user.groups ? user.groups.join(', ') : 'None'}
                                                    </div>
                                                    <div className="text-xs text-gray-400">
                                                        Status: {user.enabled ? 'Active' : 'Disabled'}
                                                    </div>
                                                </div>
                                                <div className="flex space-x-2">
                                                    <button
                                                        onClick={() => {
                                                            setSelectedUser(user);
                                                            setShowUserEdit(true);
                                                        }}
                                                        className="md-btn-surface text-xs px-3 py-1"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => removeUser(user.username)}
                                                        className="md-btn-surface text-xs px-3 py-1"
                                                        style={{backgroundColor:'var(--md-sys-color-error)', color:'var(--md-sys-color-on-error)'}}
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                        {users.length === 0 && (
                                            <div className="text-center py-8 text-gray-500">
                                                No users found
                                            </div>
                                        )}
                                    </div>
                                )}
                            </motion.div>
                        </div>
                    )}

                    {showUserEdit && selectedUser && (
                        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="md-card p-6 w-full max-w-md"
                            >
                                <h3 className="text-lg font-medium mb-4" style={{color:'var(--md-sys-color-primary)'}}>
                                    Edit User: {selectedUser.email || selectedUser.username}
                                </h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium mb-2" style={{color:'var(--md-sys-color-on-surface)'}}>
                                            User Group
                                        </label>
                                        <select
                                            className="md-input"
                                            value={selectedUser.groups?.[0] || 'TrueTickets-Cacell-Employee'}
                                            onChange={(e) => {
                                                setSelectedUser({
                                                    ...selectedUser,
                                                    groups: [e.target.value]
                                                });
                                            }}
                                        >
                                            <option value="TrueTickets-Cacell-Employee">Employee</option>
                                            <option value="TrueTickets-Cacell-Manager">Manager</option>
                                            <option value="TrueTickets-Cacell-Owner">Owner</option>
                                            <option value="TrueTickets-Cacell-ApplicationAdmin">Application Admin</option>
                                        </select>
                                    </div>
                                    <div className="flex justify-end space-x-3">
                                        <button
                                            onClick={() => {
                                                setShowUserEdit(false);
                                                setSelectedUser(null);
                                            }}
                                            className="md-btn-surface elev-1"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={() => updateUserGroup(selectedUser.username, selectedUser.groups[0])}
                                            className="md-btn-primary elev-1"
                                        >
                                            Update Group
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </div>
            </ApiProvider>
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