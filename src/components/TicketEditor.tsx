import React, { useEffect, useState, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { DEVICES, ITEMS_LEFT } from "../constants/appConstants.js";
import { useApi } from "../hooks/useApi";
import { useAlertMethods } from "./ui/AlertSystem";
import { useChangeDetection } from "../hooks/useChangeDetection";
import { useHotkeys } from "../hooks/useHotkeys";
import { useRegisterKeybinds } from "../hooks/useRegisterKeybinds";
import {
  getTicketDeviceInfo,
  getDeviceTypeFromSubject,
} from "../utils/appUtils.tsx";
import { LoadingSpinnerWithText } from "./ui/LoadingSpinner";
import type { Ticket, PostTicket } from "../types/api";
import type { KeyBind } from "./ui/KeyBindsModal";

interface TicketEditorProps {
  ticketId?: string | undefined;
  customerId?: string | undefined;
  goTo: (to: string) => void;
  showSearch: boolean;
}

function TicketEditor({
  ticketId,
  customerId,
  goTo,
  showSearch,
}: TicketEditorProps): React.ReactElement {
  const api = useApi();
  const { dataChanged } = useAlertMethods();
  const [previousTicket, setPreviousTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("");
  const [password, setPassword] = useState("");
  const [deviceIdx, setDeviceIdx] = useState<number | null>(null);
  const [isDeviceManual, setIsDeviceManual] = useState(true);
  const [timeEstimate, setTimeEstimate] = useState("");
  const [itemsLeft, setItemsLeft] = useState<string[]>([]);
  const [saving, setSaving] = useState<boolean>(false);
  const [customerName, setCustomerName] = useState<string>("");

  const subjectInputRef = useRef<HTMLInputElement>(null);

  const { hasChanged, startPolling, stopPolling } = useChangeDetection(
    `/ticket?number=${ticketId}`,
  );

  useEffect(() => {
    if (!ticketId) {
      setLoading(false);
      setIsDeviceManual(false);
      return;
    }

    setLoading(true);
    let isMounted = true;
    (async () => {
      try {
        const data = await api.get<{ ticket: Ticket }>(
          `/ticket?number=${ticketId}`,
        );
        if (!isMounted) return;
        const ticket = data.ticket;
        setPreviousTicket(ticket);
        startPolling(ticket);

        setSubject(ticket.subject || "");
        setCustomerName(ticket.customer_full_name);
        setPassword(ticket.password || "");
        setTimeEstimate(ticket.estimated_time || "");

        const deviceInfo = getTicketDeviceInfo(ticket);
        if (deviceInfo.device) {
          const idx = DEVICES.indexOf(deviceInfo.device);
          if (idx !== -1) setDeviceIdx(idx);
        }
        if (Array.isArray(deviceInfo.itemsLeft)) {
          setItemsLeft(deviceInfo.itemsLeft);
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [ticketId, api, startPolling]);

  useEffect(() => {
    return () => stopPolling();
  }, [ticketId, stopPolling]);

  useEffect(() => {
    if (previousTicket?.customer_full_name) {
      setCustomerName(previousTicket.customer_full_name);
    } else if (!ticketId) {
      const params = new URLSearchParams(window.location.search);
      const name = params.get("customerName");
      if (name) setCustomerName(decodeURIComponent(name));
    }
  }, [previousTicket, ticketId]);

  useEffect(() => {
    if (hasChanged) {
      dataChanged(
        "Ticket Data Changed",
        "The ticket has been modified by someone else. Please refresh to see changes.",
      );
    }
  }, [hasChanged, dataChanged]);

  useEffect(() => {
    if (subject && !isDeviceManual && !ticketId) {
      const suggested = getDeviceTypeFromSubject(subject);
      if (suggested) {
        const idx = DEVICES.indexOf(suggested);
        if (idx !== -1) {
          setDeviceIdx(idx);
          setIsDeviceManual(false);
        }
      }
    }
  }, [subject, ticketId, isDeviceManual]);

  useEffect(() => {
    if (!loading) {
      const tid = setTimeout(() => {
        if (subjectInputRef.current) subjectInputRef.current.focus();
      }, 50);
      return () => clearTimeout(tid);
    }
  }, [ticketId, customerId, loading]);

  const keybinds = useMemo<KeyBind[]>(() => [
    { key: "H", description: "Home", category: "Navigation" },
    { key: "S", description: "Search", category: "Navigation" },
    { key: "C", description: "Cancel", category: "Navigation" },
  ], []);

  useRegisterKeybinds(keybinds);

  useHotkeys(
    {
      h: () => goTo("/"),
      s: () => window.dispatchEvent(new CustomEvent("openSearch")),
      c: () => {
        if (ticketId) goTo(`/&${ticketId}`);
        else if (customerId) goTo(`/$${customerId}`);
        else goTo("/");
      },
    },
    showSearch,
  );

  async function save() {
    setSaving(true);
    try {
      const model = {
        device: (deviceIdx !== null && DEVICES[deviceIdx]) || "Other",
        itemsLeft,
        estimatedTime: timeEstimate,
      };

      if (ticketId) {
        const updateData = {
          subject,
          customer_full_name: customerName,
          password,
          estimated_time: timeEstimate,
          details: "vT" + JSON.stringify(model),
        };
        const res = await api.put<{ ticket_number: number }>(`/ticket?number=${ticketId}`, updateData);
        goTo(`/&${res.ticket_number}`);
      } else {
        const params = new URLSearchParams(window.location.search);
        const phone = params.get("primaryPhone") || "";
        const payload: PostTicket = {
          customer_id: customerId || "",
          customer_full_name: customerName,
          primary_phone: phone,
          subject,
          details: "vT" + JSON.stringify(model),
          status: "New",
          password,
          estimated_time: timeEstimate,
        };
        const res = await api.post<{ ticket_number: number }>("/ticket", payload);
        goTo(`/&${res.ticket_number}`);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  }

  function toggleItem(name: string) {
    setItemsLeft(items =>
      items.includes(name) ? items.filter(i => i !== name) : [...items, name]
    );
  }

  if (loading) return <LoadingSpinnerWithText text="Loading..." className="mx-auto max-w-3xl px-3 py-10 text-center" />;

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-4 sm:py-6">
      <div className="md-card p-4 sm:p-8 space-y-4 sm:space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold text-primary">
              {ticketId ? `Edit Ticket - #${previousTicket?.ticket_number}` : "New Ticket"}
            </div>
            {customerName && <div className="text-md text-outline mt-1">{customerName}</div>}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={() => {
                if (ticketId) goTo(`/&${ticketId}`);
                else if (customerId) goTo(`/$${customerId}`);
                else goTo("/");
              }}
              className="md-btn-surface elev-1 w-full sm:w-auto"
              tabIndex={-1}
            >
              Cancel
            </button>
            <motion.button
              onClick={save}
              disabled={saving}
              className="md-btn-primary elev-1 disabled:opacity-80 relative overflow-hidden w-full sm:w-auto"
              whileTap={{ scale: saving ? 1 : 0.95 }}
              animate={saving ? { backgroundColor: "var(--md-sys-color-primary-container)", color: "var(--md-sys-color-on-primary-container)" } : { backgroundColor: "var(--md-sys-color-primary)", color: "var(--md-sys-color-on-primary)" }}
              tabIndex={4}
            >
              <div className="flex items-center justify-center gap-2">
                <span>{saving ? (ticketId ? "Updating..." : "Creating...") : (ticketId ? "Update" : "Create")}</span>
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              </div>
            </motion.button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-md font-medium">Subject</label>
          <input
            ref={subjectInputRef}
            className="md-input"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Enter ticket subject..."
            tabIndex={1}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <div className="space-y-4 md:space-y-6">
            <div className="space-y-2">
              <label className="text-md font-medium">Password</label>
              <input
                className="md-input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Device password"
                tabIndex={2}
              />
            </div>

            <div className="space-y-2">
              <label className="text-md font-medium">Items Left</label>
              <div className="flex flex-wrap gap-2">
                {ITEMS_LEFT.map((item, i) => item && (
                  <button
                    key={i}
                    onClick={() => toggleItem(item)}
                    className={`md-chip ${itemsLeft.includes(item) ? "md-chip--on" : ""}`}
                    tabIndex={-1}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4 md:space-y-6">
            <div className="space-y-2">
              <label className="text-md font-medium">Estimated Time</label>
              <input
                className="md-input"
                value={timeEstimate}
                onChange={e => setTimeEstimate(e.target.value)}
                placeholder="e.g. 30 min, 2 hours"
                tabIndex={3}
              />
            </div>

            <div className="space-y-2">
              <label className="text-md font-medium">Device Type</label>
              <div className="p-2 flex flex-wrap gap-2">
                {DEVICES.map((device, i) => {
                  const active = deviceIdx === i;
                  return (
                    <button
                      key={i}
                      onClick={() => { setDeviceIdx(i); setIsDeviceManual(true); }}
                      className={`inline-flex items-center gap-2 md-chip ${active ? "md-chip--on" : ""}`}
                      tabIndex={-1}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full ${active ? "bg-indicator-dot" : "border border-outline"}`} />
                      <span>{device || "Other"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TicketEditor;
