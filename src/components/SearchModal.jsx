import React, { useEffect, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { 
  formatPhone
} from '../utils/appUtils.jsx';
import { 
  convertStatus
} from '../constants/appConstants.js';
import { useApi } from '../hooks/useApi';
import NavigationButton from './NavigationButton';
import { LoadingSpinnerWithText } from './LoadingSpinner';
import { InlineErrorMessage } from './AlertSystem';
import TicketView from './TicketView';

function SearchModal({ open, onClose, goTo }) {
    const api = useApi();
    const [search, setSearch] = useState("");
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [searchType, setSearchType] = useState("tickets"); // "tickets" or "customers"
    const [latestTicketNumber, setLatestTicketNumber] = useState(null);
    
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

    // Get latest ticket number when modal opens
    useEffect(() => {
        if (open && !latestTicketNumber) {
            const fetchLatestTicketNumber = async () => {
                try {
                    const data = await api.get('/tickets?page=1');
                    const tickets = data.tickets || data || [];
                    if (tickets.length > 0) {
                        const highestNumber = Math.max(...tickets.map(ticket => parseInt(ticket.number || ticket.id) || 0));
                        setLatestTicketNumber(highestNumber);
                    }
                } catch (error) {
                    console.error('Error fetching latest ticket number:', error);
                }
            };
            fetchLatestTicketNumber();
        }
    }, [open, latestTicketNumber, api]);

    // Enhanced phone number parsing
    const parsePhoneNumber = (s = "") => (s || "").replace(/\D/g, "");
    const isLikelyPhone = (digits) => digits.length >= 7 && digits.length <= 11;
    const canParse = (str) => !isNaN(parseInt(str)) && str.trim() !== "";

    // Smart ticket number search for exactly 3 digits
    const searchTicketNumber = async (query) => {
        if (!latestTicketNumber || query.length !== 3) {
            // Fallback to simple search if no latest ticket number or not 3 digits
            const data = await api.get(`/tickets?number=${encodeURIComponent(query)}`);
            setResults(data.tickets || data || []);
            return;
        }

        const latestTicketStr = latestTicketNumber.toString();
        const responses = [];
        
        // Find tickets ending with the 3-digit query
        // For "035" with latest 36039, we want 35035 and 34035
        const queryNum = parseInt(query);
        const latestNum = parseInt(latestTicketStr);
        
        // Calculate the base number by replacing the last 3 digits
        const baseNumber = parseInt(latestTicketStr.slice(0, -3) + query);
        
        // If the calculated number is higher than latest, subtract 1000
        let searchNumber = baseNumber;
        if (searchNumber > latestNum) {
            searchNumber -= 1000;
        }
        
        // Search for the last 2 tickets ending with the query
        for (let i = 0; i < 2; i++) {
            const number = searchNumber - (i * 1000);
            
            if (number < 1) break;
            
            try {
                const data = await api.get(`/tickets?number=${number}`);
                const tickets = data.tickets || data || [];
                if (tickets.length > 0) {
                    responses.push(...tickets);
                }
            } catch (error) {
                console.error(`Error fetching ticket ${number}:`, error);
            }
        }
        
        setResults(responses);
    };
    
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
            // Check if it's a 3-digit ticket number search
            else if (canParse(trimmedQuery) && trimmedQuery.length === 3) {
                setSearchType("tickets");
                await searchTicketNumber(trimmedQuery);
            }
            // Check if it's a regular ticket number search (not 3 digits)
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

    // Clear results immediately when search changes
    useEffect(() => {
        if (search.trim() === "") {
            setResults([]);
            setHasSearched(false);
            setSearchType("tickets");
        } else {
            // Clear results immediately when user starts typing
            setResults([]);
            setHasSearched(false);
        }
    }, [search]);

    // Debounced search with 300ms delay
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
                    <div className="text-xl sm:text-2xl font-bold text-primary">
                        Search {searchType === "customers" ? "Customers" : "Tickets"}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleNewCustomer}
                            title="New Customer"
                            className="md-btn-primary elev-1 text-md sm:text-base px-3 py-2 sm:px-4 sm:py-2"
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
                        className="md-input w-full text-md sm:text-base py-3 sm:py-2 pl-10 sm:pl-12"
                        autoFocus
                    />
                    <Search className="w-4 h-4 sm:w-5 sm:h-5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                {/* Results */}
                <div className="md-card overflow-hidden flex-1 overflow-y-auto">
                    {/* Dynamic table header based on search type */}
                    <div className="hidden sm:grid grid-cols-12 text-sm tracking-wider px-5 py-3 text-on-surface">
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
                            <div className="flex items-center justify-center p-6 text-md gap-3">
                                <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                                <span className="font-medium">Searching...</span>
                            </div>
                        )}
                        {!loading && hasSearched && results.length === 0 && (
                            <div className="flex items-center justify-center p-6 text-md text-outline">
                                No {searchType} found for "{search}"
                            </div>
                        )}
                        {!loading && !hasSearched && (
                            <div className="flex items-center justify-center p-6 text-md text-outline">
                                Start typing to search {searchType}...
                            </div>
                        )}
                        {!loading && results.map((item) => (
                            <NavigationButton
                                key={item.id}
                                onClick={() => { 
                                    onClose(); 
                                    if (searchType === "customers") {
                                        goTo(`/$${item.id}`);
                                    } else {
                                        goTo(`/&${item.id}`);
                                    }
                                }}
                                targetUrl={searchType === "customers" ? 
                                    `${window.location.origin}/$${item.id}` : 
                                    `${window.location.origin}/&${item.id}`
                                }
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
                                            <div className="col-span-4 truncate text-md">
                                                {item.created_at ? new Date(item.created_at).toLocaleDateString() : "—"}
                                            </div>
                                        </div>
                                        
                                        {/* Customer Mobile layout */}
                                        <div className="sm:hidden px-4 py-3 space-y-2">
                                            <div className="text-md">
                                                {item.business_then_name || `${item.first_name} ${item.last_name}`}
                                            </div>
                                            <div className="flex items-center justify-between text-md">
                                                {item.phone && (
                                                    <span>{formatPhone(item.phone)}</span>
                                                )}
                                                <span className="text-md text-on-surface">
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
                                                <div className="font-semibold text-md font-mono">#{item.number ?? item.id}</div>
                                                <div className="text-md px-2 py-1 rounded-full" style={{backgroundColor:'var(--md-sys-color-primary-container)', color:'var(--md-sys-color-on-primary-container)'}}>
                                                    {convertStatus(item.status)}
                                                </div>
                                            </div>
                                            <div className="text-md font-medium truncate">{item.subject}</div>
                                            <div className="text-md truncate text-on-surface">
                                                {item.customer_business_then_name ?? item.customer?.business_and_full_name}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </NavigationButton>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

// TicketByNumber component for looking up tickets by number
function TicketByNumber({ number, goTo }) {
    const api = useApi();
    const [id, setId] = useState(null);
    const [err, setErr] = useState(null);
    
    useEffect(() => { 
        (async () => { 
            try { 
                const data = await api.get(`/tickets?number=${encodeURIComponent(number)}`); 
                const ticket = (data.tickets || [])[0]; 
                if (ticket) setId(ticket.id); 
                else setErr("Ticket not found by number"); 
            } catch (error) { 
                console.error(error); 
                setErr("Ticket not found by number"); 
            } 
        })(); 
    }, [number, api]);
    
    if (err) return <InlineErrorMessage message={err} className="mx-auto max-w-3xl px-3 py-10 text-center" />;
    if (!id) return <LoadingSpinnerWithText text="Loading..." className="mx-auto max-w-3xl px-3 py-10 text-center" />;
    return <TicketView id={id} goTo={goTo} />;
}

export default SearchModal;
export { TicketByNumber };
