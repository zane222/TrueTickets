import React, { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { User, Printer, Edit, Loader2 } from "lucide-react";
import html2pdf from 'html2pdf.js';
import { getCurrentUser, fetchAuthSession, fetchUserAttributes } from 'aws-amplify/auth';
import { 
  STATUSES, 
  convertStatus, 
  convertStatusToOriginal
} from '../constants/appConstants.js';
import { 
  formatPhone, 
  getTicketPassword, 
  getTicketDeviceInfo, 
  formatItemsLeft, 
  fmtDateAndTime,
  formatCommentWithLinks
} from '../utils/appUtils.jsx';
import { useApi } from '../hooks/useApi';
import { useAlertMethods } from './AlertSystem';
import { useChangeDetection } from '../hooks/useChangeDetection';
import { useHotkeys } from '../hooks/useHotkeys';
import NavigationButton from './NavigationButton';
import { TicketCard } from './TicketCard';
import { LoadingSpinnerWithText } from './LoadingSpinner';

function TicketView({ id, goTo }) {
    const api = useApi();
    const { warning, dataChanged, error } = useAlertMethods();
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
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // Show warning when changes are detected
    useEffect(() => {
        if (hasChanged) {
            dataChanged("Ticket Data Changed", "The ticket has been modified by someone else. Please refresh the page to see the latest changes.");
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
            
            // Restart polling with the updated ticket data
            resetPolling(updatedTicket);
        } catch (error) {
            console.error(error);
            error("Status Update Failed", `Failed to update status: ${error.message}`);
        } finally {
            setUpdatingStatus(null);
        }
    };

    useEffect(() => {
        // Stop any existing polling when ID changes
        stopPolling();
        fetchTicket();
    }, [id, api, refreshKey, stopPolling]);

    // Cleanup polling when component unmounts
    useEffect(() => {
        return () => {
            stopPolling();
        };
    }, [stopPolling]);

    // Listen for ticket refresh events
    useEffect(() => {
        const handleRefresh = () => {
            setRefreshKey(prev => prev + 1);
        };
        window.addEventListener('refreshTicket', handleRefresh);
        return () => window.removeEventListener('refreshTicket', handleRefresh);
    }, []);

    if (loading) return <LoadingSpinnerWithText text="Loading ticket..." className="mx-auto max-w-3xl px-3 py-10 text-center" />;
    if (!ticket) return <InlineErrorMessage message="Ticket not found" className="mx-auto max-w-3xl px-3 py-10 text-center" />;

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
                        if (pdfWindow.closed) { 
                            clearInterval(interval); 
                            URL.revokeObjectURL(pdf);
                        } 
                    }, 1000); 
                });
        } catch (error) {
            console.error('Error generating PDF:', error);
            error("PDF Generation Failed", "Error generating PDF. Please try again.");
        }
    };

    return (
        <div className="mx-auto max-w-6xl px-3 sm:px-6 py-3 sm:py-6">
            {/* Top Action Buttons */}
            <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-4 mb-4 sm:mb-6">
                <NavigationButton
                    onClick={() => goTo(`/$${ticket.customer?.id || ticket.customer_id}`)}
                    targetUrl={`${window.location.origin}/$${ticket.customer?.id || ticket.customer_id}`}
                    className="md-btn-surface elev-1 inline-flex items-center justify-center gap-2 py-3 sm:py-2 text-md sm:text-base touch-manipulation w-full sm:w-auto"
                >
                    <User className="w-5 h-5" />
                    View Customer
                </NavigationButton>
                <button
                    onClick={generatePDF}
                    className="md-btn-surface elev-1 inline-flex items-center justify-center gap-2 py-3 sm:py-2 text-md sm:text-base touch-manipulation w-full sm:w-auto"
                >
                    <Printer className="w-5 h-5" />
                    Print PDF
                </button>
                <NavigationButton
                    onClick={() => goTo(`/&${ticket.id}?edit`)}
                    targetUrl={`${window.location.origin}/&${ticket.id}?edit`}
                    className="md-btn-primary elev-1 inline-flex items-center justify-center gap-2 py-3 sm:py-2 text-md sm:text-base touch-manipulation w-full sm:w-auto"
                >
                    <Edit className="w-5 h-5" />
                    Edit Ticket
                </NavigationButton>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
                {/* LEFT SIDE: Ticket + statuses */}
                <div className="lg:col-span-4 space-y-8 lg:space-y-20">
                    {/* Ticket Card - Scaled up */}
                    <div className="transform scale-100 sm:scale-148 origin-top-left bg-white rounded-md shadow-lg overflow-hidden">
                        <div ref={ticketCardRef} className="w-full h-auto">
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
                        <p className="text-md sm:text-md font-semibold">Status:</p>
                        <div className="flex flex-col gap-2">
                            {STATUSES.map((status, index) => {
                                const active = convertStatus(ticket.status) === status;
                                const isUpdating = updatingStatus === status;
                                return (
                                    <motion.button
                                        key={status}
                                        onClick={() => updateTicketStatus(status)}
                                        disabled={isUpdating || active}
                                        className={`${active ? 'md-btn-primary' : 'md-btn-surface'} text-left relative overflow-hidden py-3 sm:py-2 text-md sm:text-base touch-manipulation w-full ${
                                            (isUpdating || active) ? 'cursor-not-allowed' : ''
                                        }`}
                                        style={active ? { borderRadius: '12px' } : {}}
                                        whileTap={{ scale: 0.95 }}
                                        whileHover={!active && !isUpdating ? {
                                            backgroundColor: active ? "var(--md-sys-color-primary)" : "color-mix(in oklab, #2c2c2f 90%, white)",
                                            filter: active ? "brightness(1.05)" : "none"
                                        } : {}}
                                        animate={isUpdating ? { 
                                            backgroundColor: active ? "var(--md-sys-color-primary)" : "var(--md-sys-color-primary-container)",
                                            color: active ? "var(--md-sys-color-on-primary)" : "var(--md-sys-color-on-primary-container)"
                                        } : {
                                            backgroundColor: active ? "var(--md-sys-color-primary)" : "#2c2c2f",
                                            color: active ? "var(--md-sys-color-on-primary)" : "var(--md-sys-color-on-surface)"
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
    const [currentUser, setCurrentUser] = useState(null);
    const [textareaRef, setTextareaRef] = useState(null);
    
    useEffect(() => {
        setList(comments);
    }, [comments]);

    // Get current user information
    useEffect(() => {
        const getCurrentUserInfo = async () => {
            try {
                const user = await getCurrentUser();
                setCurrentUser(user);
            } catch (error) {
                console.error('Error getting current user:', error);
            }
        };
        getCurrentUserInfo();
    }, []);

    // Auto-resize textarea
    const autoResize = () => {
        if (textareaRef) {
            textareaRef.style.height = 'auto';
            textareaRef.style.height = textareaRef.scrollHeight + 'px';
        }
    };

    // Handle text change and auto-resize
    const handleTextChange = (event) => {
        setText(event.target.value);
        autoResize();
    };

    // Auto-resize on mount and when text changes
    useEffect(() => {
        autoResize();
    }, [text]);

    async function create() { 
        if (createLoading) return; // Prevent multiple submissions
        setCreateLoading(true);
        try { 
            // Get the current user's name from Cognito attributes
            let techName = "True Tickets";
            try {
                // Try to get user attributes directly
                const userAttributes = await fetchUserAttributes();
                
                // Also try ID token
                const session = await fetchAuthSession();
                const idTokenPayload = session.tokens?.idToken?.payload;
                
                // Try multiple sources for the name
                techName = userAttributes?.['custom:given_name'] || 
                          userAttributes?.given_name || 
                          userAttributes?.name || 
                          idTokenPayload?.['custom:given_name'] ||
                          idTokenPayload?.['given_name'] || 
                          idTokenPayload?.['name'] || 
                          currentUser?.username || 
                          "True Tickets";
            } catch (error) {
                console.error('Error getting user attributes:', error);
                techName = currentUser?.username || "True Tickets";
            }
            
            await api.post(`/tickets/${ticketId}/comment`, { 
                subject: "Update",
                body: text,
                tech: techName,
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
                ref={setTextareaRef}
                value={text}
                onChange={handleTextChange}
                className="md-textarea"
                placeholder="Write a comment…"
                style={{ minHeight: '96px', resize: 'none', overflow: 'hidden' }}
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
                        <div className="absolute inset-x-3 top-2 flex items-center justify-between text-md text-outline">
                            <div className="flex items-center gap-3">
                                {comment.tech ? (<span>{comment.tech}</span>) : null}
                                <span>{fmtDateAndTime(comment.created_at)}</span>
                            </div>
                            {typeof comment.hidden === 'boolean' && comment.hidden === false ? (
                                <span>Probably SMS</span>
                            ) : <span />}
                        </div>

                        {/* Body */}
                        <div className="whitespace-pre-wrap leading-relaxed pt-5 text-base">
                            {formatCommentWithLinks(comment.body || comment.comment || '')}
                        </div>
                    </div>
                ))}
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

export default TicketView;
