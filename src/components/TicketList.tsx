import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { STATUSES, DEVICES, EMPTY_ARRAY } from "../constants/appConstants.js";
import { fmtDate } from "../utils/appUtils.jsx";
import { useHotkeys } from "../hooks/useHotkeys";
import { useRegisterKeybinds } from "../hooks/useRegisterKeybinds";
import NavigationButton from "./ui/NavigationButton";
import type { TinyTicket, ApiContextValue } from "../types";
import type { KeyBind } from "./ui/KeyBindsModal";

// Ticket list item component that can use hooks
interface TicketListItemProps {
  ticket: TinyTicket;
  goTo: (to: string) => void;
}
const TicketListItem = React.forwardRef<HTMLButtonElement, TicketListItemProps>((
  { ticket, goTo },
  ref
) => {
  const targetUrl = `${window.location.origin}/&${ticket.ticket_number}`;
  return (
    <div data-row>
      <NavigationButton
        ref={ref}
        onClick={() => goTo(`/&${ticket.ticket_number}`)}
        targetUrl={targetUrl}
        className="md-row-box w-full text-left transition-all duration-150 group"
        tabIndex={0}
      >
        {/* Desktop layout */}
        <div className="hidden sm:grid grid-cols-12 px-4 py-3">
          <div className="col-span-1 truncate">
            #{ticket.ticket_number}
          </div>
          <div className="col-span-5 truncate">{ticket.subject}</div>
          <div className="col-span-2 truncate">
            {ticket.status}
          </div>
          <div className="col-span-1 truncate">
            {ticket.device}
          </div>
          <div className="col-span-1 truncate">
            {fmtDate(ticket.created_at)}
          </div>
          <div className="col-span-2 truncate">
            {ticket.customer_name}
          </div>
        </div>

        {/* Mobile layout */}
        <div className="sm:hidden px-4 py-3 space-y-2">
          <div className="flex justify-between items-start">
            <div className="text-md font-medium truncate flex-1 min-w-0">
              #{ticket.ticket_number}
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
              {ticket.status}
            </div>
            <div className="text-md truncate ml-2 text-outline">
              {ticket.device}
            </div>
          </div>
          <div className="text-md truncate text-on-surface">
            {ticket.customer_name}
          </div>
        </div>
      </NavigationButton>
    </div>
  );
});

TicketListItem.displayName = "TicketListItem";

export interface TicketListViewProps {
  goTo: (to: string) => void;
  showSearch: boolean;
  api: ApiContextValue;
}
export function TicketListView({
  goTo,
  showSearch,
  api,
}: TicketListViewProps): React.ReactElement {
  // Load filter states from localStorage with defaults
  const [selectedStatus, setSelectedStatus] = useState<string>(() => {
    const saved = localStorage.getItem("ticketSelectedStatus");
    // Default: Diagnosing
    return saved ? saved : "Diagnosing";
  });
  const [selectedDevice, setSelectedDevice] = useState<string>(() => {
    const saved = localStorage.getItem("ticketSelectedDevice");
    // Default: All
    return saved ? saved : "All";
  });

  const [items, setItems] = useState<TinyTicket[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const listRef = useRef<HTMLDivElement | null>(null);
  const ticketRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Save state changes to localStorage
  useEffect(() => {
    localStorage.setItem(
      "ticketSelectedStatus",
      selectedStatus,
    );
  }, [selectedStatus]);

  useEffect(() => {
    localStorage.setItem(
      "ticketSelectedDevice",
      selectedDevice,
    );
  }, [selectedDevice]);

  const selectStatus = (status: string): void => {
    setSelectedStatus(status);
    localStorage.setItem(
      "ticketSelectedStatus",
      status,
    );
  };

  const selectDevice = (device: string): void => {
    setSelectedDevice(device);
    localStorage.setItem(
      "ticketSelectedDevice",
      device,
    );
  };

  // Guard to prevent overlapping / reentrant fetches
  const isFetchingRef = useRef<boolean>(false);

  const fetchTickets = useCallback(
    async (device: string, status: string): Promise<void> => {
      // Prevent re-entrant calls — if a fetch is already in progress, skip.
      if (isFetchingRef.current) {
        return;
      }

      isFetchingRef.current = true;
      setLoading(true);
      setItems([]); // Clear the list immediately when loading starts
      try {
        let url: string;
        if (device === "All") {
          // All devices - fetch without device filter
          url = `/tickets/recent`;
        } else {
          // Single device selected - use backend filtering with single status
          url = `/tickets/recent?device=${encodeURIComponent(device)}&status=${encodeURIComponent(status)}`;
        }
        const tickets = await api.get<TinyTicket[]>(url);

        setItems(tickets || []);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
        // release guard so subsequent calls can proceed
        isFetchingRef.current = false;
      }
    },
    [api],
  );

  // Fetch tickets when device or status changes
  useEffect(() => {
    fetchTickets(selectedDevice, selectedStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDevice, selectedStatus]);

  // Reset selected index when items change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [items]);

  const ticketListKeybinds = useMemo<KeyBind[]>(() => [
    {
      key: "H",
      description: "Home",
      category: "Navigation",
    },
    {
      key: "S",
      description: "Search",
      category: "Navigation",
    },
    {
      key: "J",
      description: "Next ticket",
      category: "Navigation",
    },
    {
      key: "K",
      description: "Previous ticket",
      category: "Navigation",
    },
  ], []);

  useRegisterKeybinds(showSearch ? EMPTY_ARRAY : ticketListKeybinds);

  const hotkeyMap = useMemo(() => ({
    h: () => goTo("/"),
    s: () => {
      // Trigger search modal from parent
      const searchEvent = new CustomEvent("openSearch");
      window.dispatchEvent(searchEvent);
    },
    j: () => {
      if (items.length === 0) return;
      setSelectedIndex((prev) => {
        const newIndex = prev === -1 ? 0 : Math.min(prev + 1, items.length - 1);
        setTimeout(() => {
          ticketRefs.current[newIndex]?.focus();
        }, 0);
        return newIndex;
      });
    },
    k: () => {
      if (items.length === 0) return;
      setSelectedIndex((prev) => {
        const newIndex = prev === -1 ? 0 : Math.max(prev - 1, 0);
        setTimeout(() => {
          ticketRefs.current[newIndex]?.focus();
        }, 0);
        return newIndex;
      });
    },
    enter: () => {
      if (items.length > 0 && selectedIndex >= 0) {
        const ticket = items[selectedIndex];
        goTo(`/&${ticket.ticket_number}`);
      }
    },
  }), [goTo, items, selectedIndex]);

  useHotkeys(hotkeyMap, showSearch);

  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-6 py-3 sm:py-6">
      {/* Device and Status Pickers in same row */}
      <div className="flex flex-wrap gap-4 mb-4">
        {/* Device Picker - Single Select (15% wider, 10% taller) */}
        <div className="md-card p-4 space-y-2 max-w-md">
          <p className="text-sm font-semibold">Device:</p>
          <div className="w-full flex flex-wrap gap-1.5">
            {["All", ...DEVICES].map((device) => {
              const isSelected = selectedDevice === device;

              return (
                <motion.button
                  key={device}
                  onClick={() => selectDevice(device)}
                  className={`${isSelected
                    ? "md-btn-primary px-3"
                    : device === "All"
                      ? "md-btn-surface px-2 !border-gray-400"
                      : "md-btn-surface px-2"
                    } flex-auto inline-flex items-center justify-center gap-1 py-1.5 text-[13px] font-medium rounded-lg touch-manipulation whitespace-nowrap transition-all hover:brightness-95`}
                  tabIndex={-1}
                  layout
                >
                  <span>{device}</span>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Status Picker - Single Select (only show when specific device selected, 15% wider, 10% taller) */}
        {selectedDevice !== "All" && (
          <div className="md-card p-4 space-y-2 max-w-xl">
            <p className="text-sm font-semibold">Status:</p>
            <div className="w-full flex flex-col gap-1.5">
              {[
                [STATUSES[0], STATUSES[2], STATUSES[4], STATUSES[6]], // First row
                [STATUSES[1], STATUSES[3], STATUSES[5], STATUSES[7]]  // Second row
              ].map((statusRow, rowIndex) => (
                <div key={rowIndex} className="flex gap-1.5 w-full">
                  {statusRow.map((status) => {
                    const isSelected = selectedStatus === status;

                    return (
                      <motion.button
                        key={status}
                        onClick={() => selectStatus(status)}
                        className={`${isSelected
                          ? "md-btn-primary px-3"
                          : (status === "Ready" || status === "Resolved")
                            ? "md-btn-surface px-2 !border-gray-400"
                            : "md-btn-surface px-2"
                          } flex-auto inline-flex items-center justify-center gap-1 py-1.5 text-[13px] font-medium rounded-lg touch-manipulation whitespace-nowrap transition-all hover:brightness-95`}
                        tabIndex={-1}
                        layout
                      >
                        <span>{status}</span>
                      </motion.button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

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
          {/* No client-side filtering - backend handles it all */}
          {(items || []).map((ticket, index) => (
            <TicketListItem
              key={ticket.ticket_number}
              ref={(el) => {
                ticketRefs.current[index] = el;
              }}
              ticket={ticket}
              goTo={goTo}
            />
          ))}
        </div>
        {loading && (
          <div className="flex items-center justify-center p-6 text-md gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-loading" />
            <span className="font-medium">Loading…</span>
          </div>
        )}
      </div>

      <div className="flex justify-between items-center mt-6">
        {/* Load more button removed as /recent_tickets_list returns all relevant tickets */}
      </div>
    </div>
  );
}
