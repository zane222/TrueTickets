import React, { useEffect, useState, useMemo } from "react";
import { Plus, Edit, Loader2 } from "lucide-react";
import { 
  convertStatus
} from '../constants/appConstants.js';
import { 
  formatPhone, 
  fmtDate,
  getTicketPassword,
  getTicketDeviceInfo
} from '../utils/appUtils.jsx';
import { useApi } from '../hooks/useApi';
import { useAlertMethods } from './AlertSystem';
import { useChangeDetection } from '../hooks/useChangeDetection';
import NavigationButton from './NavigationButton';
import { LoadingSpinnerWithText } from './LoadingSpinner';

function CustomerView({ id, goTo }) {
    const api = useApi();
    const { warning, dataChanged } = useAlertMethods();
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

    // Show warning when changes are detected
    useEffect(() => {
        if (hasChanged) {
            dataChanged("Customer Data Changed", "The customer has been modified by someone else. Please refresh the page to see the latest changes.");
        }
    }, [hasChanged]);
    
    useEffect(() => { 
        // Stop any existing polling when customer ID changes
        stopPolling();
        setTickets([]); 
        setTPage(1); 
        setTHasMore(true); 
    }, [id, stopPolling]);

    // Cleanup polling when component unmounts
    useEffect(() => {
        return () => {
            stopPolling();
        };
    }, [stopPolling]);
    
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
    
    if (loading) return <LoadingSpinnerWithText text="Loading customer..." className="mx-auto max-w-3xl px-3 py-10 text-center" />;
    if (!customer) return <InlineErrorMessage message="Customer not found" className="mx-auto max-w-3xl px-3 py-10 text-center" />;
    
    return (
        <div className="mx-auto max-w-6xl px-3 sm:px-6 py-3 sm:py-6">
            {/* Top Action Buttons */}
            <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-4 mb-4 sm:mb-6">
                <NavigationButton
                    onClick={() => goTo(`/$${id}?edit`)}
                    targetUrl={`${window.location.origin}/$${id}?edit`}
                    className="md-btn-surface elev-1 inline-flex items-center gap-2 py-3 sm:py-2 text-md sm:text-base touch-manipulation"
                >
                    <Edit className="w-5 h-5" />
                    Edit Customer
                </NavigationButton>
                <NavigationButton
                    onClick={() => goTo(`/$${id}?newticket`)}
                    targetUrl={`${window.location.origin}/$${id}?newticket`}
                    className="md-btn-primary elev-1 inline-flex items-center gap-2 py-3 sm:py-2 text-md sm:text-base touch-manipulation"
                >
                    <Plus className="w-5 h-5" />
                    New Ticket
                </NavigationButton>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-8">
                <div className="md:col-span-2 space-y-3 sm:space-y-6">
                    <div className="md-card p-3 sm:p-8">
                        <div className="text-lg sm:text-2xl font-bold mb-2">{customer.business_and_full_name || customer.fullname}</div>
                        <div className="mb-1 text-md sm:text-base text-outline">{customer.email}</div>
                        <div className="space-y-1">
                            {allPhones.length > 0 ? (
                                allPhones.map((phone, index) => (
                                    <div key={index} className="text-outline">
                                        {formatPhone(phone)}
                                        {index === 0 && allPhones.length > 1 && (
                                            <span className="ml-2 text-md font-medium">(Primary)</span>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <div className="text-outline">No phone numbers</div>
                            )}
                        </div>
                    </div>

                    {/* Tickets List */}
                    <div className="md-card">
                        <div className="px-4 sm:px-6 py-4 font-semibold">Tickets</div>
                        <div className="hidden sm:grid grid-cols-12 text-sm tracking-wider px-5 py-3 text-on-surface">
                            <div className="col-span-2 font-semibold">Number</div>
                            <div className="col-span-4 font-semibold">Subject</div>
                            <div className="col-span-2 font-semibold">Status</div>
                            <div className="col-span-2 font-semibold">Device</div>
                            <div className="col-span-2 font-semibold">Created</div>
                        </div>
                        <div className="divide-y" style={{borderColor:'var(--md-sys-color-outline)'}}>
                            {(tickets || []).map((ticket, index) => (
                                <NavigationButton
                                    key={`${ticket.id}-${index}`}
                                    onClick={() => goTo(`/&${ticket.id}`)}
                                    targetUrl={`${window.location.origin}/&${ticket.id}`}
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
                                            <div className="text-md text-outline">{fmtDate(ticket.created_at)}</div>
                                        </div>
                                        <div className="font-medium">{ticket.subject}</div>
                                        <div className="flex justify-between items-center text-md">
                                            <span>{convertStatus(ticket.status)}</span>
                                            <span className="text-outline">{getTicketDeviceInfo(ticket).device}</span>
                                        </div>
                                    </div>
                                </NavigationButton>
                            ))}
                            {tLoading && (
                                <div className="flex items-center justify-center p-6 text-md gap-3">
                                    <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                                    <span className="font-medium">Loading…</span>
                                </div>
                            )}
                            {!tLoading && tickets.length === 0 && (
                                <div className="flex items-center justify-center p-6 text-md text-outline">
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
                            <div className="text-md text-outline">
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
        </div>
    );
}

function InlineErrorMessage({ message, className }) {
    return (
        <div className={className}>
            <div className="text-red-500 font-medium">{message}</div>
        </div>
    );
}

export default CustomerView;