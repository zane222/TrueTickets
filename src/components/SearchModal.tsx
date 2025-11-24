import React, { useEffect, useState, useRef } from "react";
import { Search, Loader2 } from "lucide-react";
import { formatPhone } from "../utils/appUtils.jsx";
import { convertStatus } from "../constants/appConstants.js";
import { useApi } from "../hooks/useApi";
import NavigationButton from "./ui/NavigationButton";
import { useHotkeys } from "../hooks/useHotkeys";
import type { SmallTicket, Customer } from "../types/api";

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
  const [results, setResults] = useState<(SmallTicket | Customer)[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<"Enter a search query" | "No results found" | "">("Enter a search query");
  const [searchType, setSearchType] = useState<"tickets" | "customers">("tickets");
  const [latestTicketNumber, setLatestTicketNumber] = useState<number | null>(null);
  const pendingSubmit = useRef<boolean>(false);

  const searchInputRef = React.useRef<HTMLInputElement | null>(null);

  // Refs to track current search and abort controller for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentSearchQueryRef = useRef<string>("");

  // New Customer autofill helpers
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
        if (searchType === "customers") {
          goTo(`/$${first.id}`);
        } else {
          goTo(`/&${first.id}`);
        }
      }
    }
  };

  // Reset search state when modal closes
  useEffect(() => {
    if (!open) {
      // Cancel any pending requests
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

  // Clear results immediately when user starts typing
  useEffect(() => {
    if (search.trim() === "") {
      // Cancel any pending requests when search is cleared
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      currentSearchQueryRef.current = "";
      setResults([]);
      setStatus("Enter a search query");
      setLoading(false);
      return;
    }

    // Cancel previous search request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // Store the current search query for verification later
    currentSearchQueryRef.current = search.trim();

    // Clear results immediately when user starts typing
    setResults([]);
    setStatus("");
    setLoading(true);

    const timeoutId = setTimeout(() => {
      performSearch(search, abortControllerRef.current!.signal);
    }, 300);

    return () => {
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, searchType]);

  useEffect(() => {
    let timeoutId: number | undefined;
    if (!loading && pendingSubmit.current && results.length > 0) {
      const first = results[0];
      if (first) {
        timeoutId = window.setTimeout(() => {
          // click after delay so the user can see the results for a moment
          onClose();
          if (searchType === "customers") {
            goTo(`/$${first.id}`);
          } else {
            goTo(`/&${first.id}`);
          }
        }, 150);
      }
      // Keep UI state in sync
      pendingSubmit.current = false;
    }
    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [loading, results, searchType, onClose, goTo]);

  // Get latest ticket number when modal opens
  useEffect(() => {
    let isMounted = true;
    if (open && !latestTicketNumber) {
      const fetchLatestTicketNumber = async () => {
        try {
          const data = await api.get<{ tickets: SmallTicket[] }>(
            "/tickets?page=1",
          );
          if (!isMounted) return;
          const tickets = data.tickets || [];
          if (tickets.length > 0) {
            const highestNumber = Math.max(
              ...tickets.map((ticket) => ticket.number || ticket.id || 0),
            );
            setLatestTicketNumber(highestNumber);
          }
        } catch (error) {
          console.error("Failed to fetch latest ticket number:", error);
        }
      };
      fetchLatestTicketNumber();
    }
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, api]);

  // Enhanced phone number parsing
  const parsePhoneNumber = (str: string) => (str || "").replace(/\D/g, "");
  const isLikelyPhone = (digits: string) =>
    digits.length >= 7 && digits.length <= 11;
  const canParse = (str: string) => /^\d/.test(str.trim()) && !isNaN(parseInt(str));

  // Smart ticket number search for exactly 3 digits
  const searchTicketNumber = React.useCallback(
    async (query: string, signal: AbortSignal) => {
      const latest = latestTicketNumber;
      if (!latest || query.length !== 3) {
        // Fallback to simple search if no latest ticket number or not 3 digits
        const data = await api.get<{ tickets: SmallTicket[] }>(
          `/tickets?number=${encodeURIComponent(query)}`,
        );
        // Only update state if this request wasn't aborted and query still matches
        if (!signal.aborted && currentSearchQueryRef.current === query) {
          setResults(data.tickets || []);
          if (data.tickets?.length === 0) {
            setStatus("No results found");
          } else {
            setStatus("");
          }
          setLoading(false);
          if (pendingSubmit.current && data.tickets && data.tickets.length > 0) {
            pendingSubmit.current = false;
            onClose();
            goTo(`/&${data.tickets[0].id}`);
          }
        }
        return;
      }

      const latestTicketStr = latest.toString();

      // Find tickets ending with the 3-digit query
      const latestNum = parseInt(latestTicketStr, 10);

      // Calculate the base number by replacing the last 3 digits
      const baseNumber = parseInt(latestTicketStr.slice(0, -3) + query, 10);

      // If the calculated number is higher than latest, subtract 1000
      let searchNumber = baseNumber;
      if (searchNumber > latestNum) {
        searchNumber -= 1000;
      }

      // Prepare all API calls in parallel
      const apiCalls: Promise<SmallTicket | null>[] = [];
      for (let i = -1; i < 2; i++) {
        const number = searchNumber - i * 1000;
        if (number < 1) continue;

        apiCalls.push(
          api
            .get<{ tickets: SmallTicket[] }>(`/tickets?number=${number}`)
            .then((d) => {
              const tickets = d.tickets || [];
              return tickets.length > 0 ? tickets[0] : null;
            })
            .catch((): null => null),
        );
      }

      const res = await Promise.all(apiCalls);
      const validTickets = res.filter((t): t is SmallTicket => t !== null);

      // Only update state if this request wasn't aborted and query still matches
      if (!signal.aborted && currentSearchQueryRef.current === query) {
        setResults(validTickets);
        if (validTickets.length === 0) {
          setStatus("No results found");
        } else {
          setStatus("");
        }
        setLoading(false);
        if (pendingSubmit.current && validTickets.length > 0) {
          pendingSubmit.current = false;
          onClose();
          goTo(`/&${validTickets[0].id}`);
        }
      }
    },
    [latestTicketNumber, api, onClose, goTo],
  );

  // Smart search logic
  const performSearch = React.useCallback(
    async (query: string, signal: AbortSignal) => {
      try {
        const trimmedQuery = query.trim();
        const phoneDigits = parsePhoneNumber(trimmedQuery);

        // Phone number search
        if (isLikelyPhone(phoneDigits)) {
          setSearchType("customers");
          const data = await api.get<{ customers: Customer[] }>(
            `/customers/autocomplete?query=${encodeURIComponent(phoneDigits)}`,
          );
          // Only update state if this request wasn't aborted and query still matches
          if (!signal.aborted && currentSearchQueryRef.current === trimmedQuery) {
            setResults(data.customers || []);
            if (data.customers?.length === 0) {
              setStatus("No results found");
            } else {
              setStatus("");
            }
            setLoading(false);
            if (pendingSubmit.current && data.customers && data.customers.length > 0) {
              pendingSubmit.current = false;
              onClose();
              goTo(`/$${data.customers[0].id}`);
            }
          }
        }
        // 3-digit ticket number
        else if (canParse(trimmedQuery) && trimmedQuery.length === 3) {
          setSearchType("tickets");
          await searchTicketNumber(trimmedQuery, signal);
          return;
        }
        // Regular ticket number search
        else if (canParse(trimmedQuery) && trimmedQuery.length <= 6) {
          setSearchType("tickets");
          const data = await api.get<{ tickets: SmallTicket[] }>(
            `/tickets?number=${encodeURIComponent(trimmedQuery)}`,
          );
          // Only update state if this request wasn't aborted and query still matches
          if (!signal.aborted && currentSearchQueryRef.current === trimmedQuery) {
            setResults(data.tickets || []);
            if (data.tickets?.length === 0) {
              setStatus("No results found");
            } else {
              setStatus("");
            }
            setLoading(false);
            if (pendingSubmit.current && data.tickets && data.tickets.length > 0) {
              pendingSubmit.current = false;
              onClose();
              goTo(`/&${data.tickets[0].id}`);
            }
          }
        }
        // Partial phone number
        else if (
          phoneDigits.length >= 3 &&
          phoneDigits.length < 7 &&
          /[\d\-\.\(\)\s]/.test(trimmedQuery) &&
          !/[a-zA-Z]/.test(trimmedQuery)
        ) {
          setSearchType("customers");
          const data = await api.get<{ customers: Customer[] }>(
            `/customers/autocomplete?query=${encodeURIComponent(phoneDigits)}`,
          );
          // Only update state if this request wasn't aborted and query still matches
          if (!signal.aborted && currentSearchQueryRef.current === trimmedQuery) {
            setResults(data.customers || []);
            if (data.customers?.length === 0) {
              setStatus("No results found");
            } else {
              setStatus("");
            }
            setLoading(false);
            if (pendingSubmit.current && data.customers && data.customers.length > 0) {
              pendingSubmit.current = false;
              onClose();
              goTo(`/$${data.customers[0].id}`);
            }
          }
        }
        // Text queries: search both and pick best
        else {
          try {
            const [customersData, ticketsData] = await Promise.all([
              api.get<{ customers: Customer[] }>(
                `/customers/autocomplete?query=${encodeURIComponent(trimmedQuery)}`,
              ),
              api.get<{ tickets: SmallTicket[] }>(
                `/tickets?query=${encodeURIComponent(trimmedQuery)}`,
              ),
            ]);

            // Only update state if this request wasn't aborted and query still matches
            if (!signal.aborted && currentSearchQueryRef.current === trimmedQuery) {
              const customers = customersData.customers || [];
              const tickets = ticketsData.tickets || [];

              if (customers.length > 0) {
                setSearchType("customers");
                setResults(customers);
                setStatus("");
                if (pendingSubmit.current) {
                  pendingSubmit.current = false;
                  onClose();
                  goTo(`/$${customers[0].id}`);
                }
              } else {
                setSearchType("tickets");
                setResults(tickets);
                if (tickets.length === 0) {
                  setStatus("No results found");
                } else {
                  setStatus("");
                }
                if (pendingSubmit.current && tickets.length > 0) {
                  pendingSubmit.current = false;
                  onClose();
                  goTo(`/&${tickets[0].id}`);
                }
              }
              setLoading(false);
            }
          } catch {
            setSearchType("tickets");
            const data = await api.get<{ tickets: SmallTicket[] }>(
              `/tickets?query=${encodeURIComponent(trimmedQuery)}`,
            );
            // Only update state if this request wasn't aborted and query still matches
            if (!signal.aborted && currentSearchQueryRef.current === trimmedQuery) {
              setResults(data.tickets || []);
              if (data.tickets?.length === 0) {
                setStatus("No results found");
              } else {
                setStatus("");
              }
              setLoading(false);
              if (pendingSubmit.current && data.tickets && data.tickets.length > 0) {
                pendingSubmit.current = false;
                onClose();
                goTo(`/&${data.tickets[0].id}`);
              }
            }
          }
        }
      } catch (err) {
        // Ignore aborted requests
        if (err instanceof Error && err.name !== "AbortError") {
          console.error("Search error:", err);
        }
        // Only clear results if not aborted
        if (!signal.aborted) {
          setResults([]);
          setStatus("No results found");
          setLoading(false);
        }
      }
    },
    [searchTicketNumber, api, onClose, goTo],
  );

  // Type guard functions
  const isCustomer = (_item: SmallTicket | Customer): _item is Customer => {
    return searchType === "customers";
  };

  const isTicket = (_item: SmallTicket | Customer): _item is SmallTicket => {
    return searchType === "tickets";
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="w-full max-w-6xl h-[80vh] md-card p-8 space-y-6 flex flex-col">
        <div className="flex flex-row items-center justify-between gap-2">
          <div className="text-2xl font-bold text-primary">
            Search {searchType === "customers" ? "Customers" : "Tickets"}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleNewCustomer}
              title="New Customer"
              className="md-btn-primary elev-1 text-base px-4 py-2"
              tabIndex={-1}
            >
              New Customer
            </button>
            <button
              onClick={onClose}
              className="md-btn-surface elev-1 inline-flex items-center justify-center w-8 h-8 p-0 touch-manipulation"
              tabIndex={-1}
            >
              ×
            </button>
          </div>
        </div>

        {/* Search Input */}
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
          <div
            className="divide-y"
            style={{ borderColor: "var(--md-sys-color-outline)" }}
          >
            {loading && (
              <div className="flex items-center justify-center p-6 text-md gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                <span className="font-medium">Searching...</span>
              </div>
            )}
            {!loading && status && (
              <div className="flex items-center justify-center p-6 text-md text-outline">
                {status}
              </div>
            )}
            {!loading &&
              results.length > 0 &&
              results.map((item) => (
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
                  targetUrl={
                    searchType === "customers"
                      ? `${window.location.origin}/$${item.id}`
                      : `${window.location.origin}/&${item.id}`
                  }
                  className="md-row-box w-full text-left transition-all duration-150 group"
                  tabIndex={1}
                >
                  {isCustomer(item) ? (
                    <>
                      {/* Customer Desktop layout */}
                      <div className="hidden sm:grid grid-cols-12 px-4 py-3">
                        <div className="col-span-5 truncate">
                          {item.business_then_name ||
                            `${item.firstname || ""} ${item.lastname || ""}`}
                        </div>
                        <div className="col-span-3 truncate">
                          {item.phone ? formatPhone(item.phone) : "—"}
                        </div>
                        <div className="col-span-4 truncate text-md">
                          {item.created_at
                            ? new Date(item.created_at).toLocaleDateString()
                            : "—"}
                        </div>
                      </div>

                      {/* Customer Mobile layout */}
                      <div className="sm:hidden px-4 py-3 space-y-2">
                        <div className="text-md">
                          {item.business_then_name ||
                            `${item.firstname || ""} ${item.lastname || ""}`}
                        </div>
                        <div className="flex items-center justify-between text-md">
                          {item.phone && <span>{formatPhone(item.phone)}</span>}
                          <span className="text-md text-on-surface">
                            {item.created_at
                              ? new Date(item.created_at).toLocaleDateString()
                              : "—"}
                          </span>
                        </div>
                      </div>
                    </>
                  ) : isTicket(item) ? (
                    <>
                      {/* Ticket Desktop layout */}
                      <div className="hidden sm:grid grid-cols-12 px-4 py-3">
                        <div className="col-span-1 truncate">
                          #{item.number ?? item.id}
                        </div>
                        <div className="col-span-7 truncate">
                          {item.subject}
                        </div>
                        <div className="col-span-2 truncate">
                          {convertStatus(item.status || "")}
                        </div>
                        <div className="col-span-2 truncate">
                          {item.customer_business_then_name ??
                            item.customer?.business_and_full_name}
                        </div>
                      </div>

                      {/* Ticket Mobile layout */}
                      <div className="sm:hidden px-4 py-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="font-semibold text-md font-mono">
                            #{item.number ?? item.id}
                          </div>
                          <div
                            className="text-md px-2 py-1 rounded-full"
                            style={{
                              backgroundColor:
                                "var(--md-sys-color-surface-variant)",
                              color: "var(--md-sys-color-on-surface-variant)",
                            }}
                          >
                            {convertStatus(item.status || "")}
                          </div>
                        </div>
                        <div className="text-md truncate">{item.subject}</div>
                        <div className="text-md truncate text-on-surface">
                          {item.customer_business_then_name ??
                            item.customer?.business_and_full_name}
                        </div>
                      </div>
                    </>
                  ) : null}
                </NavigationButton>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SearchModal;
