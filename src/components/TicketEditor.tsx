import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { DEVICES, ITEMS_LEFT } from "../constants/appConstants.js";
import { useApi } from "../hooks/useApi";
import { useAlertMethods } from "./ui/AlertSystem";
import { useChangeDetection } from "../hooks/useChangeDetection";
import { useHotkeys } from "../hooks/useHotkeys";
import {
  getTicketDeviceInfo,
  getDeviceTypeFromSubject,
} from "../utils/appUtils.tsx";
import { LoadingSpinnerWithText } from "./ui/LoadingSpinner";
import type { LargeTicket, TicketProperties } from "../types/api";

interface TicketEditorProps {
  ticketId?: number;
  customerId?: number;
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
  const [previousTicket, setPreviousTicket] = useState<LargeTicket | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("");
  const [password, setPassword] = useState("");
  const [deviceIdx, setDeviceIdx] = useState<number | null>(null);
  const [isDeviceManual, setIsDeviceManual] = useState(true);
  const [timeEstimate, setTimeEstimate] = useState("");
  const [itemsLeft, setItemsLeft] = useState<string[]>([]);
  const [saving, setSaving] = useState<boolean>(false);
  const [existingProperties, setExistingProperties] =
    useState<TicketProperties>({});

  // Change detection
  const { hasChanged, startPolling, stopPolling } = useChangeDetection(
    api,
    `/tickets/${ticketId}`,
  );

  // Load existing ticket data when editing
  useEffect(() => {
    if (!ticketId) {
      setLoading(false);
      setIsDeviceManual(false);
      return;
    }

    // Immediately show loading state when ticketId changes
    setLoading(true);

    let isMounted = true;
    (async () => {
      try {
        const data = await api.get<{ ticket: LargeTicket }>(
          `/tickets/${ticketId}`,
        );
        if (!isMounted) return;
        const ticket = data.ticket;
        setPreviousTicket(ticket);

        // Start change detection polling
        startPolling(ticket);
        setSubject(ticket.subject || "");

        // Load existing properties to preserve them
        const properties = (ticket.properties || {}) as TicketProperties;
        setExistingProperties(properties);

        // Set password from existing data (guard unknown types)
        const pw =
          typeof properties.Password === "string"
            ? properties.Password
            : typeof properties.password === "string"
              ? properties.password
              : "";
        setPassword(pw);

        // Set charger status from existing data (do not rely on previousTicket state inside this effect)
        {
          const acChargerVal = properties["AC Charger"];
          const hasCharger =
            (typeof acChargerVal === "string" && acChargerVal === "1") ||
            (typeof acChargerVal === "number" && acChargerVal === 1);
          if (hasCharger) {
            setItemsLeft((prev) => {
              // Avoid adding duplicate 'Charger' entries
              if (prev.includes("Charger")) return prev;
              return [...prev, "Charger"];
            });
          }
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
        if (isMounted) {
          setLoading(false);
        }
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [ticketId, api, startPolling]);

  // Cleanup polling when component unmounts or ticketId changes
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [ticketId, stopPolling]);

  // Show warning when changes are detected
  useEffect(() => {
    if (hasChanged) {
      dataChanged(
        "Ticket Data Changed",
        "The ticket has been modified by someone else. Any unsaved changes may be lost if you continue editing.",
      );
    }
  }, [hasChanged, dataChanged]);

  // Auto-select device type when subject changes (only for new tickets, and only if not manually selected)
  useEffect(() => {
    if (subject && !isDeviceManual) {
      // Get device type directly from subject text
      const suggestedDevice = getDeviceTypeFromSubject(subject);
      if (suggestedDevice) {
        const suggestedDeviceIdx = DEVICES.indexOf(suggestedDevice);
        if (suggestedDeviceIdx !== -1) {
          setDeviceIdx(suggestedDeviceIdx);
          setIsDeviceManual(false);
        }
      }
    }
  }, [subject, ticketId]);

  useHotkeys(
    {
      h: () => goTo("/"),
      s: () => {
        // Trigger search modal from parent
        const searchEvent = new CustomEvent("openSearch");
        window.dispatchEvent(searchEvent);
      },
      c: () => {
        // Cancel functionality - go back to customer if available, otherwise go to home
        if (ticketId) {
          goTo(`/&${ticketId}`);
        } else if (customerId) {
          goTo(`/$${customerId}`);
        } else {
          goTo("/");
        }
      },
      t: () => {
        if (ticketId) goTo(`/&${ticketId}`);
      },
    },
    showSearch,
  );

  function toggleItem(name: string): void {
    setItemsLeft((items) =>
      items.includes(name)
        ? items.filter((item) => item !== name)
        : [...items, name],
    );
  }

  async function save(): Promise<void> {
    setSaving(true);
    try {
      const properties = { ...existingProperties };

      properties.Password = password || "";
      properties["AC Charger"] = itemsLeft.includes("Charger") ? "1" : "0";

      // Tech Notes will only be set to empty for new tickets
      if (!ticketId) {
        properties["Tech Notes"] = "";
      }

      let model: Record<string, string | string[]> = {};
      let result: { ticket: LargeTicket };
      if (ticketId) {
        // Implement ChangeTicketTypeIdToComputer logic to preserve fields
        const currentTicketTypeId =
          previousTicket?.ticket_type_id ||
          previousTicket?.ticket_fields?.[0]?.ticket_type_id;

        // Build legacy options based on current ticket type
        if (currentTicketTypeId === 9836) {
          if (properties?.Model && properties.Model !== "")
            model["Model: "] = properties.Model;
          if (properties?.imeiOrSn && properties.imeiOrSn !== "")
            model["IMEI or S/N: "] = properties.imeiOrSn;
          {
            const everWet =
              typeof properties?.EverBeenWet === "string" ||
              Array.isArray(properties?.EverBeenWet)
                ? properties.EverBeenWet
                : "Unknown";
            model["Ever been Wet: "] = everWet;
          }
          if (
            properties?.previousDamageOrIssues &&
            properties.previousDamageOrIssues !== ""
          )
            model["Previous Damage or Issues: "] =
              properties?.previousDamageOrIssues;
          if (
            properties?.techNotes &&
            properties.techNotes !== "" &&
            !properties.techNotes.includes("{")
          )
            model["Tech notes: "] = properties?.techNotes;
          if (properties?.currentIssue && properties.currentIssue !== "")
            model["Current issue: "] = properties?.currentIssue;
          if (properties?.Size && properties.Size !== "")
            model["Size: "] = properties?.Size;
        }
        if (currentTicketTypeId === 9801) {
          if (properties?.Model && properties.Model !== "")
            model["Model: "] = properties.Model;
          if (
            properties?.imeiOrSnForPhone &&
            properties.imeiOrSnForPhone !== ""
          )
            model["IMEI or S/N: "] = properties?.imeiOrSnForPhone;
          {
            const everWet =
              typeof properties?.EverBeenWet === "string" ||
              Array.isArray(properties?.EverBeenWet)
                ? properties.EverBeenWet
                : "Unknown";
            model["Ever been Wet: "] = everWet;
          }
          if (
            properties?.previousDamageOrIssues &&
            properties.previousDamageOrIssues !== ""
          )
            model["Previous Damage or Issues: "] =
              properties?.previousDamageOrIssues;
          if (
            properties?.techNotes &&
            properties.techNotes !== "" &&
            !properties.techNotes.includes("{")
          )
            model["Tech notes: "] = properties?.techNotes;
          if (properties?.currentIssue && properties.currentIssue !== "")
            model["Current issue: "] = properties?.currentIssue;
          properties.Password = properties?.passwordForPhone || "";
        }
        if (currentTicketTypeId === 23246) {
          if (properties?.Model && properties.Model !== "")
            model["Model: "] = properties.Model;
          if (
            properties?.techNotes &&
            properties.techNotes !== "" &&
            !properties.techNotes.includes("{")
          )
            model["Tech notes: "] = properties?.techNotes;
        }

        // Set password and preserve legacy options in Model
        properties.Password = (password || "").trim() !== "" ? password : "n";

        model = {
          ...model,
          device: DEVICES[deviceIdx] || "Other",
          itemsLeft: itemsLeft,
          estimatedTime: timeEstimate,
        };
        properties.Model = "vT" + JSON.stringify(model);

        const updatedTicket = {
          ...previousTicket,
          subject: subject,
          ticket_type_id: 9818,
          properties: properties,
        };

        result = await api.put<{ ticket: LargeTicket }>(
          `/tickets/${ticketId}`,
          updatedTicket,
        );
      } else {
        // For new tickets, create the full payload
        const payload = {
          customer_id:
            customerId || previousTicket?.customer_id || previousTicket?.id,
          user_id: 0,
          ticket_type_id: 9818,
          subject: subject,
          problem_type: "Other",
          status: "New",
          due_date: new Date().toISOString(),
          properties: {
            Password: password || "n",
            "AC Charger": itemsLeft.includes("Charger") ? "1" : "0",
            Model:
              "vT" +
              JSON.stringify(
                {
                  device: DEVICES[deviceIdx] || "Other",
                  itemsLeft: itemsLeft,
                  estimatedTime: timeEstimate,
                },
                null,
                2,
              ),
          },
        };
        result = await api.post<{ ticket: LargeTicket }>(`/tickets`, payload);
      }
      const idOfNewlyCreatedOrUpdatedTicket = result.ticket.id;
      goTo(`/&${idOfNewlyCreatedOrUpdatedTicket}`);
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <LoadingSpinnerWithText
        text="Loading..."
        className="mx-auto max-w-3xl px-3 py-10 text-center"
      />
    );

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-4 sm:py-6">
      <div className="md-card p-4 sm:p-8 space-y-4 sm:space-y-6">
        <div className="flex items-center justify-between">
          <div className="text-2xl font-bold text-primary">
            {ticketId
              ? `Edit Ticket - #${previousTicket?.number ?? ticketId}`
              : "New Ticket"}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={() => {
                if (ticketId) {
                  goTo(`/&${ticketId}`);
                } else if (customerId) {
                  goTo(`/$${customerId}`);
                } else {
                  goTo("/");
                }
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
              animate={
                saving
                  ? {
                      backgroundColor: "var(--md-sys-color-primary-container)",
                      color: "var(--md-sys-color-on-primary-container)",
                    }
                  : {
                      backgroundColor: "var(--md-sys-color-primary)",
                      color: "var(--md-sys-color-on-primary)",
                    }
              }
              transition={{ duration: 0.15 }}
              tabIndex={0}
            >
              <div className="flex items-center justify-center gap-2">
                <span>
                  {saving
                    ? ticketId
                      ? "Updating..."
                      : "Creating..."
                    : ticketId
                      ? "Update"
                      : "Create"}
                </span>
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
                  initial={{ x: "-100%" }}
                  animate={{ x: "100%" }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                />
              )}
            </motion.button>
          </div>
        </div>

        {/* Subject spanning both columns */}
        <div className="space-y-2">
          <label className="text-md font-medium">Subject</label>
          <input
            className="md-input"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Enter ticket subject..."
            tabIndex={1}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {/* Column on the left */}
          <div className="space-y-4 md:space-y-6">
            {/* Password */}
            <div className="space-y-2">
              <label className="text-md font-medium">Password</label>
              <input
                className="md-input"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Device password"
                tabIndex={1}
              />
            </div>

            {/* Items Left */}
            <div className="space-y-2">
              <label className="text-md font-medium">Items Left</label>
              <div className="flex flex-wrap gap-2">
                {ITEMS_LEFT.map(
                  (item, index) =>
                    item && (
                      <button
                        key={index}
                        onClick={() => toggleItem(item)}
                        className={`md-chip ${itemsLeft.includes(item) ? "md-chip--on" : ""}`}
                        tabIndex={-1}
                      >
                        {item}
                      </button>
                    ),
                )}
              </div>
            </div>
          </div>

          {/* Column on the right */}
          <div className="space-y-4 md:space-y-6">
            {/* Estimated Time - text input */}
            <div className="space-y-2">
              <label className="text-md font-medium">Estimated Time</label>
              <input
                className="md-input"
                value={timeEstimate}
                onChange={(event) => setTimeEstimate(event.target.value)}
                placeholder="e.g. 30 min, 2 hours, Call by: 11th"
                tabIndex={1}
              />
            </div>

            {/* Device Type - single select radio-style pills */}
            <div className="space-y-2">
              <label className="text-md font-medium">Device Type</label>
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
                      onClick={() => {
                        setDeviceIdx(index);
                        setIsDeviceManual(true);
                      }}
                      className={`inline-flex items-center gap-2 md-chip ${active ? "md-chip--on" : ""}`}
                      tabIndex={-1}
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
          </div>
        </div>
      </div>
    </div>
  );
}

export default TicketEditor;
