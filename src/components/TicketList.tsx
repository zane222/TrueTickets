import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { STATUSES, DEVICES, convertStatus } from "../constants/appConstants.js";
import { cx, fmtDate, getTicketDeviceInfo } from "../utils/appUtils.jsx";
import { useHotkeys } from "../hooks/useHotkeys";
import NavigationButton from "./ui/NavigationButton";
import type { SmallTicket, ApiContextValue } from "../types/api";

// Ticket list item component that can use hooks
function TicketListItem({
  ticket,
  goTo,
}: {
  ticket: SmallTicket;
  goTo: (to: string) => void;
}) {
  const targetUrl = `${window.location.origin}/&${ticket.id}`;
  return (
    <motion.div
      data-row
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
    >
      <NavigationButton
        onClick={() => goTo(`/&${ticket.id}`)}
        targetUrl={targetUrl}
        className="md-row-box w-full text-left transition-all duration-150 group"
      >
        {/* Desktop layout */}
        <div className="hidden sm:grid grid-cols-12 px-4 py-3">
          <div className="col-span-1 truncate">
            #{ticket.number ?? ticket.id}
          </div>
          <div className="col-span-5 truncate">{ticket.subject}</div>
          <div className="col-span-2 truncate">
            {convertStatus(ticket.status)}
          </div>
          <div className="col-span-1 truncate">
            {getTicketDeviceInfo(ticket).device}
          </div>
          <div className="col-span-1 truncate">
            {fmtDate(ticket.created_at)}
          </div>
          <div className="col-span-2 truncate">
            {ticket.customer_business_then_name ??
              ticket.customer?.business_and_full_name}
          </div>
        </div>

        {/* Mobile layout */}
        <div className="sm:hidden px-4 py-3 space-y-2">
          <div className="flex justify-between items-start">
            <div className="text-md font-medium truncate flex-1 min-w-0">
              #{ticket.number ?? ticket.id}
            </div>
            <div className="text-md truncate ml-2 text-outline">
              {fmtDate(ticket.created_at)}
            </div>
          </div>
          <div className="text-md truncate text-on-surface">
            {ticket.subject}
          </div>
          <div className="flex justify-between items-center">
            <div className="text-md truncate text-outline">
              {convertStatus(ticket.status)}
            </div>
            <div className="text-md truncate ml-2 text-outline">
              {getTicketDeviceInfo(ticket).device}
            </div>
          </div>
          <div className="text-md truncate text-on-surface">
            {ticket.customer_business_then_name ??
              ticket.customer?.business_and_full_name}
          </div>
        </div>
      </NavigationButton>
    </motion.div>
  );
}

export function TicketListView({
  goTo,
  showSearch,
  api,
}: {
  goTo: (to: string) => void;
  showSearch: boolean;
  api: ApiContextValue;
}) {
  // Load filter states from localStorage with defaults
  const [statusHidden, setStatusHidden] = useState(() => {
    const saved = localStorage.getItem("ticketStatusHidden");
    return saved ? new Set(JSON.parse(saved)) : new Set(["Resolved"]);
  });
  const [selectedDevices, setSelectedDevices] = useState(() => {
    const saved = localStorage.getItem("ticketSelectedDevices");
    return saved
      ? new Set(JSON.parse(saved))
      : new Set(Array.from({ length: DEVICES.length }, (_, i) => i));
  });
  const [statusFilterCollapsed, setStatusFilterCollapsed] = useState(() => {
    const saved = localStorage.getItem("ticketStatusFilterCollapsed");
    return saved ? JSON.parse(saved) : true; // default: collapsed
  });
  const [deviceFilterCollapsed, setDeviceFilterCollapsed] = useState(() => {
    const saved = localStorage.getItem("ticketDeviceFilterCollapsed");
    return saved ? JSON.parse(saved) : true; // default: collapsed
  });

  const [items, setItems] = useState<SmallTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const listRef = useRef(null);

  // Save state changes to localStorage
  useEffect(() => {
    localStorage.setItem(
      "ticketStatusHidden",
      JSON.stringify([...statusHidden]),
    );
  }, [statusHidden]);

  useEffect(() => {
    localStorage.setItem(
      "ticketSelectedDevices",
      JSON.stringify([...selectedDevices]),
    );
  }, [selectedDevices]);

  useEffect(() => {
    localStorage.setItem(
      "ticketStatusFilterCollapsed",
      JSON.stringify(statusFilterCollapsed),
    );
  }, [statusFilterCollapsed]);

  useEffect(() => {
    localStorage.setItem(
      "ticketDeviceFilterCollapsed",
      JSON.stringify(deviceFilterCollapsed),
    );
  }, [deviceFilterCollapsed]);

  const toggleStatus = (status) => {
    const newStatusHidden = new Set(statusHidden);
    newStatusHidden.has(status)
      ? newStatusHidden.delete(status)
      : newStatusHidden.add(status);
    setStatusHidden(newStatusHidden);
    localStorage.setItem(
      "ticketStatusHidden",
      JSON.stringify([...newStatusHidden]),
    );
  };

  async function fetchTickets(reset = false) {
    setLoading(true);
    try {
      const currentPage = reset ? 1 : page + 1;
      const data = (await api.get(`/tickets?page=${currentPage}`)) as {
        tickets: SmallTicket[];
      };
      const tickets = data.tickets || [];
      if (reset) {
        setItems(tickets);
        setPage(1);
      } else {
        // Filter out any duplicates by ticket ID
        const existingIds = new Set(items.map((item) => item.id));
        const newTickets = tickets.filter(
          (ticket) => !existingIds.has(ticket.id),
        );
        setItems((prev) => [...prev, ...newTickets]);
        setPage(currentPage);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTickets(true);
  }, []);

  useHotkeys(
    {
      h: () => goTo("/"),
      s: () => {
        // Trigger search modal from parent
        const searchEvent = new CustomEvent("openSearch");
        window.dispatchEvent(searchEvent);
      },
      n: () => goTo("/newcustomer"),
    },
    showSearch,
  );

  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-6 py-3 sm:py-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStatusFilterCollapsed(!statusFilterCollapsed)}
            className="flex items-center gap-2 text-md font-medium hover:opacity-80 transition-opacity text-on-surface"
            tabIndex={-1}
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
                    className={cx(
                      "md-chip text-md sm:text-md px-2 py-1 sm:px-3 sm:py-1.5",
                      statusHidden.has(status) ? "" : "md-chip--on",
                    )}
                  >
                    {status}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      {/* // Commented out device filter selector because the filter needs to be fixed
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-6">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDeviceFilterCollapsed(!deviceFilterCollapsed)}
            className="flex items-center gap-2 text-md font-medium hover:opacity-80 transition-opacity text-on-surface"
            tabIndex={-1}
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
                        setSelectedDevices((previous) => {
                          const next = new Set(previous);
                          if (next.has(index)) next.delete(index);
                          else next.add(index);
                          localStorage.setItem(
                            "ticketSelectedDevices",
                            JSON.stringify([...next]),
                          );
                          return next;
                        });
                      }}
                      className={cx(
                        "md-chip text-md sm:text-md px-2 py-1 sm:px-3 sm:py-1.5",
                        isSelected ? "md-chip--on" : "",
                      )}
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
      */}

      <div className="md-card overflow-hidden">
        {/* Desktop table header */}
        <div className="hidden sm:grid grid-cols-12 text-sm tracking-wider px-5 py-3 text-on-surface">
          <div className="col-span-1 font-semibold">Number</div>
          <div className="col-span-5 font-semibold">Subject</div>
          <div className="col-span-2 font-semibold">Status</div>
          <div className="col-span-1 font-semibold">Device</div>
          <div className="col-span-1 font-semibold">Created</div>
          <div className="col-span-2 font-semibold">Customer</div>
        </div>
        <div ref={listRef}>
          <AnimatePresence>
            {(items || [])
              .filter(
                (ticket) =>
                  !convertStatus(ticket.status) ||
                  !statusHidden.has(convertStatus(ticket.status)),
              ) // filter out devices with a status that isn't selected
              /*.filter((ticket) => { // TODO Needs to get the device type correctly from the model. If it's not there it needs to see
                                      // if doing getDeviceTypeFromSubject(ticket.subject) will get a device type
                                      // if not then it's other
                // Default behavior: if none selected, show all
                if (!selectedDevices || selectedDevices.size === 0) return true;
                const deviceType = ticket.device_type || "";
                let deviceIndex = DEVICES.length - 1; // other
                if (DEVICES.includes(deviceType)) deviceIndex = DEVICES.indexOf(deviceType);
                  else if(DEVICES.includes(deviceType))
                return selectedDevices.has(deviceIndex);
                })*/
              .map((ticket) => (
                <TicketListItem key={ticket.id} ticket={ticket} goTo={goTo} />
              ))}
          </AnimatePresence>
        </div>
        {loading && (
          <div className="flex items-center justify-center p-6 text-md gap-3">
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
      </div>
    </div>
  );
}
