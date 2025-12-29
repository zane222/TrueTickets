import React, { useEffect, useState, useRef } from "react";
import { Search, Loader2 } from "lucide-react";
import { formatPhone, fmtDate } from "../utils/appUtils.jsx";
import { convertStatus } from "../constants/appConstants.js";
import { useApi } from "../hooks/useApi";
import NavigationButton from "./ui/NavigationButton";
import { useHotkeys } from "../hooks/useHotkeys";
import type { Ticket, Customer } from "../types/api";

function SearchModal({
  open,
  onClose,
  goTo,
}: {
  open: boolean;
  onClose: () => void;
  goTo: (to: string) => void;
}) {
  const api = useApi();
  const [search, setSearch] = useState<string>("");
  const [results, setResults] = useState<(Ticket | Customer)[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("Enter a search query");
  const [searchType, setSearchType] = useState<"tickets" | "customers">("tickets");

  // Removed latestTicketNumber and its fetching logic as backend now handles suffix search.

  const pendingSubmit = useRef<boolean>(false);
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentSearchQueryRef = useRef<string>("");

  const handleNewCustomer = React.useCallback(() => {
    const query = search.trim();
    if (!query) {
      onClose();
      goTo("/newcustomer");
      return;
    }
    const digits = parsePhoneNumber(query);
    let url = "/newcustomer";
    const params = new URLSearchParams();
    if (isLikelyPhone(digits)) {
      params.set("phone", digits);
    } else {
      params.set("full_name", query);
    }
    const queryString = params.toString();
    if (queryString) url += `?${queryString}`;
    onClose();
    goTo(url);
  }, [onClose, goTo, search]);

  useHotkeys({
    n: () => handleNewCustomer(),
    c: () => onClose(),
  });

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (loading) {
      pendingSubmit.current = true;
      return;
    }
    if (results.length > 0) {
      const first = results[0];
      if (first) {
        onClose();
        if (isCustomer(first)) {
          goTo(`/$${first.customer_id}`);
        } else {
          goTo(`/&${first.ticket_number}`);
        }
      }
    }
  };

  useEffect(() => {
    if (!open) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setSearch("");
      setResults([]);
      setLoading(false);
      setStatus("Enter a search query");
      setSearchType("tickets");
      pendingSubmit.current = false;
    }
  }, [open]);

  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed.length < 3) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      currentSearchQueryRef.current = "";
      setResults([]);
      setStatus(trimmed.length === 0 ? "Enter a search query" : "Enter at least 3 characters");
      setLoading(false);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    currentSearchQueryRef.current = search.trim();

    setResults([]);
    setStatus("");
    setLoading(true);

    const timeoutId = setTimeout(() => {
      performSearch(search, abortControllerRef.current!.signal);
    }, 300);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [search, searchType]);

  useEffect(() => {
    if (!loading && pendingSubmit.current && results.length > 0) {
      const first = results[0];
      if (first) {
        onClose();
        if (isCustomer(first)) {
          goTo(`/$${first.customer_id}`);
        } else {
          goTo(`/&${first.ticket_number}`);
        }
      }
      pendingSubmit.current = false;
    }
  }, [loading, results, searchType, onClose, goTo]);

  const parsePhoneNumber = (str: string) => (str || "").replace(/\D/g, "");
  const isLikelyPhone = (digits: string) => digits.length >= 7 && digits.length <= 11;
  const canParse = (str: string) => /^\d/.test(str.trim()) && !isNaN(parseInt(str));

  const searchTicketNumber = React.useCallback(
    async (query: string, signal: AbortSignal) => {
      // Use backend suffix search if query is 3 digits
      if (query.length === 3) {
        const url = `/tickets?ticket_number_last_3_digits=${encodeURIComponent(query)}`;
        try {
          const tickets = await api.get<Ticket[]>(url, { silent: true });
          if (!signal.aborted && currentSearchQueryRef.current === query) {
            setResults(tickets || []);
            setStatus(tickets?.length === 0 ? "No results found" : "");
            setLoading(false);
            if (pendingSubmit.current && tickets && tickets.length > 0) {
              pendingSubmit.current = false;
              onClose();
              goTo(`/&${tickets[0].ticket_number}`);
            }
          }
        } catch (e) {
          // Suffix search might return 404 or empty? Assuming empty array for no results typically, but if 404:
          if (!signal.aborted) {
            setResults([]);
            setStatus("No results found");
            setLoading(false);
          }
        }
      } else {
        const url = `/tickets?number=${encodeURIComponent(query)}`;
        try {
          const ticket = await api.get<Ticket>(url, { silent: true });
          if (!signal.aborted && currentSearchQueryRef.current === query) {
            const res = ticket ? [ticket] : [];
            setResults(res);
            setStatus(res.length === 0 ? "No results found" : "");
            setLoading(false);
            if (pendingSubmit.current && ticket) {
              pendingSubmit.current = false;
              onClose();
              goTo(`/&${ticket.ticket_number}`);
            }
          }
        } catch (e) {
          // Specific number search likely returns 404 if not found
          if (!signal.aborted) {
            setResults([]);
            setStatus("No results found");
            setLoading(false);
          }
        }
      }
    }, [api, onClose, goTo]
  );

  const performSearch = React.useCallback(
    async (query: string, signal: AbortSignal) => {
      try {
        const trimmedQuery = query.trim();
        const phoneDigits = parsePhoneNumber(trimmedQuery);

        if (isLikelyPhone(phoneDigits)) {
          setSearchType("customers");
          const customers = await api.get<Customer[]>(
            `/customers/autocomplete?query=${encodeURIComponent(phoneDigits)}`,
            { silent: true }
          );
          if (!signal.aborted && currentSearchQueryRef.current === trimmedQuery) {
            setResults(customers || []);
            setStatus(customers?.length === 0 ? "No results found" : "");
            setLoading(false);
            if (pendingSubmit.current && customers && customers.length > 0) {
              pendingSubmit.current = false;
              onClose();
              goTo(`/$${customers[0].customer_id}`);
            }
          }
        } else if (canParse(trimmedQuery) && trimmedQuery.length === 3) {
          setSearchType("tickets");
          await searchTicketNumber(trimmedQuery, signal);
          return;
        } else if (canParse(trimmedQuery) && trimmedQuery.length <= 6) {
          setSearchType("tickets");
          await searchTicketNumber(trimmedQuery, signal);
        } else {
          // General query
          // Check what /query_all returns: { tickets: [], customers: [] }
          const queryResult = await api.get<{ tickets: Ticket[], customers: Customer[] }>(`/query_all?query=${encodeURIComponent(trimmedQuery)}`, { silent: true });

          if (!signal.aborted && currentSearchQueryRef.current === trimmedQuery) {
            const customers = queryResult.customers || [];
            const tickets = queryResult.tickets || [];

            if (customers.length > 0) {
              setSearchType("customers");
              setResults(customers);
              setStatus("");
              if (pendingSubmit.current) {
                pendingSubmit.current = false;
                onClose();
                goTo(`/$${customers[0].customer_id}`);
              }
            } else {
              setSearchType("tickets");
              setResults(tickets);
              setStatus(tickets.length === 0 ? "No results found" : "");
              if (pendingSubmit.current && tickets.length > 0) {
                pendingSubmit.current = false;
                onClose();
                goTo(`/&${tickets[0].ticket_number}`);
              }
            }
            setLoading(false);
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          console.error("Search error:", err);
        }
        if (!signal.aborted) {
          setResults([]);
          setStatus("No results found");
          setLoading(false);
        }
      }
    }, [searchTicketNumber, api, onClose, goTo]
  );

  const isCustomer = (item: Ticket | Customer): item is Customer => {
    // Check for property specific to Customer and NOT in Ticket.
    // Ticket has 'customer' object. Customer does NOT have 'customer' object.
    // Customer has 'full_name' at top level. Ticket has 'subject'.
    return 'full_name' in item && !('subject' in item);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="w-full max-w-6xl h-[80vh] md-card p-8 space-y-6 flex flex-col">
        <div className="flex flex-row items-center justify-between gap-2">
          <div className="text-2xl font-bold text-primary">
            Search {searchType === "customers" ? "Customers" : "Tickets"}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleNewCustomer}
              className="md-btn-primary elev-1 text-base px-4 py-2"
              tabIndex={-1}
            >
              New Customer
            </button>
            <button
              onClick={onClose}
              className="md-btn-surface elev-1 inline-flex items-center justify-center w-8 h-8 p-0"
              tabIndex={-1}
            >
              ×
            </button>
          </div>
        </div>

        <form onSubmit={handleSearchSubmit} className="relative pl-10 sm:pl-12">
          <input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="md-input w-full text-md sm:text-base py-3 sm:py-2 pl-10 sm:pl-12"
            autoFocus
            tabIndex={1}
          />
          <Search className="w-4 h-4 sm:w-5 sm:h-5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </form>

        <div className="md-card overflow-hidden flex-1 overflow-y-auto">
          <div className="hidden sm:grid grid-cols-12 text-sm tracking-wider px-5 py-3 text-on-surface font-semibold">
            {searchType === "customers" ? (
              <>
                <div className="col-span-5">Name</div>
                <div className="col-span-3">Phone</div>
                <div className="col-span-4">Created</div>
              </>
            ) : (
              <>
                <div className="col-span-1">Number</div>
                <div className="col-span-7">Subject</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2">Customer</div>
              </>
            )}
          </div>
          <div className="divide-y" style={{ borderColor: "var(--md-sys-color-outline)" }}>
            {loading && (
              <div className="flex items-center justify-center p-6 text-md gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-loading" />
                <span className="font-medium">Searching...</span>
              </div>
            )}
            {!loading && status && (
              <div className="flex items-center justify-center p-6 text-md text-outline">
                {status}
              </div>
            )}
            {!loading && results.map((item) => (
              <NavigationButton
                key={isCustomer(item) ? item.customer_id : item.ticket_number}
                onClick={() => {
                  onClose();
                  if (isCustomer(item)) goTo(`/$${item.customer_id}`);
                  else goTo(`/&${item.ticket_number}`);
                }}
                targetUrl={isCustomer(item) ? `${window.location.origin}/$${item.customer_id}` : `${window.location.origin}/&${item.ticket_number}`}
                className="md-row-box w-full text-left transition-all duration-150 group"
                tabIndex={1}
              >
                {isCustomer(item) ? (
                  <>
                    <div className="hidden sm:grid grid-cols-12 px-4 py-3">
                      <div className="col-span-5 truncate">{item.full_name}</div>
                      <div className="col-span-3 truncate">{item.phone_numbers && item.phone_numbers.length > 0 ? formatPhone(item.phone_numbers[0].number) : "—"}</div>
                      <div className="col-span-4 truncate text-md">{fmtDate(item.created_at)}</div>
                    </div>
                    <div className="sm:hidden px-4 py-3 space-y-2">
                      <div className="text-md">{item.full_name}</div>
                      <div className="flex items-center justify-between text-md">
                        {item.phone_numbers && item.phone_numbers.length > 0 && <span>{formatPhone(item.phone_numbers[0].number)}</span>}
                        <span className="text-md text-on-surface">{fmtDate(item.created_at)}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="hidden sm:grid grid-cols-12 px-4 py-3">
                      <div className="col-span-1 truncate">#{item.ticket_number}</div>
                      <div className="col-span-7 truncate">{item.subject}</div>
                      <div className="col-span-2 truncate">{convertStatus(item.status || "")}</div>
                      <div className="col-span-2 truncate">{item.customer?.full_name}</div>
                    </div>
                    <div className="sm:hidden px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-md font-mono">#{item.ticket_number}</div>
                        <div className="text-md px-2 py-1 rounded-full" style={{ backgroundColor: "var(--md-sys-color-surface-variant)", color: "var(--md-sys-color-on-surface-variant)" }}>
                          {convertStatus(item.status || "")}
                        </div>
                      </div>
                      <div className="text-md truncate">{item.subject}</div>
                      <div className="text-md truncate text-on-surface">{item.customer?.full_name}</div>
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

export default SearchModal;
