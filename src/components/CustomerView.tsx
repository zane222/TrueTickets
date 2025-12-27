import React, { useEffect, useState, useMemo, useCallback } from "react";
import { Plus, Edit, Loader2 } from "lucide-react";
import { convertStatus } from "../constants/appConstants.js";
import {
  formatPhone,
  fmtDate,
  getTicketPassword,
  getTicketDeviceInfo,
} from "../utils/appUtils.jsx";
import { useApi } from "../hooks/useApi";
import { useAlertMethods } from "./ui/AlertSystem";
import { useChangeDetection } from "../hooks/useChangeDetection";
import { useHotkeys } from "../hooks/useHotkeys";
import { useRegisterKeybinds } from "../hooks/useRegisterKeybinds";
import NavigationButton from "./ui/NavigationButton";
import { LoadingSpinnerWithText } from "./ui/LoadingSpinner";
import type { Customer, TicketWithoutCustomer } from "../types/api";
import { InlineErrorMessage } from "./ui/InlineErrorMessage";

interface CustomerViewProps {
  id: string;
  goTo: (to: string) => void;
  showSearch: boolean;
}

function CustomerView({
  id,
  goTo,
  showSearch,
}: CustomerViewProps): React.ReactElement {
  const api = useApi();
  const { warning: _warning, dataChanged: _dataChanged } = useAlertMethods();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [tickets, setTickets] = useState<TicketWithoutCustomer[]>([]);
  const [tLoading, setTLoading] = useState<boolean>(false);

  // Change detection
  const {
    hasChanged,
    isPolling: _isPolling,
    startPolling,
    stopPolling,
    resetPolling: _resetPolling,
  } = useChangeDetection(`/customers/last_updated?customer_id=${id}`);

  // Keyboard shortcuts
  const customerViewKeybinds = useMemo(() => [
    {
      key: "H",
      description: "Home",
      category: "Navigation",
    },
    {
      key: "E",
      description: "Edit",
      category: "Navigation",
    },
    {
      key: "S",
      description: "Search",
      category: "Navigation",
    },
    {
      key: "N",
      description: "New customer",
      category: "Navigation",
    },
  ], []);

  useRegisterKeybinds(customerViewKeybinds);

  // Helper to get primary phone safely
  const getPrimaryPhone = (c: Customer | null): string => {
    if (!c || !c.phone_numbers || c.phone_numbers.length === 0) return "";
    return c.phone_numbers[0].number;
  };

  useHotkeys(
    {
      h: () => goTo("/"),
      e: () => goTo(`/$${id}?edit`),
      s: () => {
        // Trigger search modal from parent
        const searchEvent = new CustomEvent("openSearch");
        window.dispatchEvent(searchEvent);
      },
      n: () => {
        const customerName = customer?.full_name || "";
        const encodedName = encodeURIComponent(customerName);
        const primaryPhone = getPrimaryPhone(customer);
        const encodedPhone = encodeURIComponent(primaryPhone);
        goTo(`/$${id}?newticket&customerName=${encodedName}&primaryPhone=${encodedPhone}`);
      },
    },
    showSearch,
  );

  const passwords = useMemo<string[]>(() => {
    try {
      const set = new Set<string>();
      (tickets || []).forEach((ticket) => {
        const password = (getTicketPassword(ticket) || "").trim();
        if (password) set.add(password);
      });
      return Array.from(set);
    } catch {
      return [];
    }
  }, [tickets]);

  // Stabilized fetch: keep effect deps minimal by using refs + a stable callback.
  const apiRef = React.useRef(api);
  const startPollingRef = React.useRef(startPolling);

  // keep refs up to date
  React.useEffect(() => {
    apiRef.current = api;
  }, [api]);

  React.useEffect(() => {
    startPollingRef.current = startPolling;
  }, [startPolling]);

  // Stable fetch callback that accepts the id and a mounted ref so the effect can
  // call it without including large dependencies.
  const fetchCustomer = React.useCallback(
    async (idParam: string, mountedRef: { current: boolean }) => {
      try {
        const customerData = await apiRef.current!.get<Customer>(
          `/customers/${encodeURIComponent(idParam.toString())}`,
        );
        if (!mountedRef.current) return;
        setCustomer(customerData);

        // Start change detection polling via ref
        if (startPollingRef.current) startPollingRef.current(customerData);

      } catch (error) {
        console.error(error);
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!id) return;
    const mountedRef = { current: true };
    // call the stable callback, passing the id and mounted ref
    void fetchCustomer(id, mountedRef);
    return () => {
      mountedRef.current = false;
    };
  }, [id, fetchCustomer]);

  // Show warning when changes are detected

  useEffect(() => {
    if (hasChanged) {
      _dataChanged(
        "Customer Data Changed",
        "The customer has been modified by someone else. Please refresh the page to see the latest changes.",
      );
    }
  }, [hasChanged, _dataChanged]);

  useEffect(() => {
    // Stop any existing polling when customer ID changes
    stopPolling();
    // Immediately show loading state when ID changes
    setLoading(true);
    setTickets([]);
  }, [id, stopPolling]);

  // Cleanup polling when component unmounts
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);


  const loadAllTickets = useCallback(
    async (isMounted: { current: boolean }) => {
      setTLoading(true);

      try {
        // Backend doesn't support pagination yet, so we just fetch once.
        const tickets = await api.get<TicketWithoutCustomer[]>(
          `/tickets?customer_id=${encodeURIComponent(id)}`,
        );

        if (!isMounted.current) return;
        setTickets(tickets || []);
      } catch (error) {
        console.error(error);
      } finally {
        if (isMounted.current) {
          setTLoading(false);
        }
      }
    },
    [api, id],
  );

  useEffect(() => {
    const isMounted = { current: true };
    loadAllTickets(isMounted);
    return () => {
      isMounted.current = false;
    };
  }, [loadAllTickets]);

  if (loading)
    return (
      <LoadingSpinnerWithText
        text="Loading customer..."
        className="mx-auto max-w-3xl px-3 py-10 text-center"
      />
    );
  if (!customer)
    return (
      <InlineErrorMessage
        message="Customer not found"
        className="mx-auto max-w-3xl px-3 py-10 text-center"
      />
    );

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 sm:py-6">
      {/* Top Action Buttons */}
      <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-4 mb-4 sm:mb-6">
        <NavigationButton
          onClick={() => goTo(`/$${id}?edit`)}
          targetUrl={`${window.location.origin}/$${id}?edit`}
          className="md-btn-surface elev-1 inline-flex items-center gap-2 py-3 sm:py-2 text-md sm:text-base touch-manipulation"
          tabIndex={-1}
        >
          <Edit className="w-5 h-5" />
          Edit Customer
        </NavigationButton>
        <NavigationButton
          onClick={() => {
            const customerName = customer?.full_name || "";
            const encodedName = encodeURIComponent(customerName);
            const primaryPhone = getPrimaryPhone(customer);
            const encodedPhone = encodeURIComponent(primaryPhone);
            goTo(`/$${id}?newticket&customerName=${encodedName}&primaryPhone=${encodedPhone}`);
          }}
          targetUrl={`${window.location.origin}/$${id}?newticket&customerName=${encodeURIComponent(customer?.full_name || "")}&primaryPhone=${encodeURIComponent(getPrimaryPhone(customer))}`}
          className="md-btn-primary elev-1 inline-flex items-center gap-2 py-3 sm:py-2 text-md sm:text-base touch-manipulation"
          tabIndex={-1}
        >
          <Plus className="w-5 h-5" />
          New Ticket
        </NavigationButton>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        <div className="md:col-span-2 flex flex-col gap-4 sm:gap-6">
          <div className="md-card p-4 sm:p-8">
            <div className="text-lg sm:text-2xl font-bold mb-2">
              {customer.full_name}
            </div>
            <div className="mb-1 text-md sm:text-base text-outline flex items-center justify-between">
              <span>{customer.email}</span>
              <span className="text-md font-normal">Joined: {fmtDate(customer.created_at)}</span>
            </div>
            <div className="space-y-1">
              {customer.phone_numbers && customer.phone_numbers.length > 0 ? (
                customer.phone_numbers.map((phone, index) => (
                  <div key={index} className="text-outline">
                    {formatPhone(phone.number)}
                    {/* Assume first is primary for display purposes essentially */}
                    {index === 0 && customer.phone_numbers.length > 1 && (
                      <span className="ml-2 text-md font-medium">
                        (Primary)
                      </span>
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
            <div
              className="flex flex-col gap-0 divide-y"
              style={{ borderColor: "var(--md-sys-color-outline)" }}
            >
              {(tickets || []).map((ticket, index) => (
                <NavigationButton
                  key={`${ticket.ticket_number}-${index}`}
                  onClick={() => goTo(`/&${ticket.ticket_number}`)}
                  targetUrl={`${window.location.origin}/&${ticket.ticket_number}`}
                  className="md-row-box w-full text-left transition-all duration-150 group"
                  tabIndex={0}
                >
                  {/* Desktop grid layout */}
                  <div className="hidden sm:grid grid-cols-12 px-4 py-3">
                    <div className="col-span-2 truncate">
                      #{ticket.ticket_number}
                    </div>
                    <div className="col-span-4 truncate">{ticket.subject}</div>
                    <div className="col-span-2 truncate">
                      {convertStatus(ticket.status || "")}
                    </div>
                    <div className="col-span-2 truncate">
                      {getTicketDeviceInfo(ticket).device}
                    </div>
                    <div className="col-span-2 truncate">
                      {fmtDate(ticket.created_at)}
                    </div>
                  </div>
                  {/* Mobile card layout */}
                  <div className="sm:hidden space-y-2 px-4 py-3">
                    <div className="flex justify-between items-start">
                      <div className="font-semibold">
                        #{ticket.ticket_number}
                      </div>
                      <div className="text-md text-outline">
                        {fmtDate(ticket.created_at)}
                      </div>
                    </div>
                    <div className="font-medium">{ticket.subject}</div>
                    <div className="flex justify-between items-center text-md">
                      <span>{convertStatus(ticket.status || "")}</span>
                      <span className="text-outline">
                        {getTicketDeviceInfo(ticket).device}
                      </span>
                    </div>
                  </div>
                </NavigationButton>
              ))}
              {tLoading && (
                <div className="flex items-center justify-center p-6 text-md gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-loading" />
                  <span className="font-medium">Loading…</span>
                </div>
              )}
              {!tLoading && tickets.length === 0 && (
                <div className="flex items-center justify-center p-6 text-md text-outline">
                  No tickets yet.
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="space-y-6">
          {passwords && passwords.length > 0 && (
            <div className="md-card p-6">
              <div className="text-lg font-semibold mb-2">
                Previously used passwords
              </div>
              <div className="text-md text-outline">
                {passwords.map((password, index) => (
                  <div key={index}>{password}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CustomerView;
