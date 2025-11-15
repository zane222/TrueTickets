import React, { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { User, Printer, Edit, Loader2, Image, Plus, X } from "lucide-react";
import html2pdf from "html2pdf.js";
import {
  getCurrentUser,
  fetchAuthSession,
  fetchUserAttributes,
} from "aws-amplify/auth";
import {
  STATUSES,
  convertStatus,
  convertStatusToOriginal,
} from "../constants/appConstants.js";
import {
  formatPhone,
  getTicketPassword,
  getTicketDeviceInfo,
  formatItemsLeft,
  fmtDateAndTime,
  formatCommentWithLinks,
} from "../utils/appUtils.jsx";
import { useApi } from "../hooks/useApi";
import { useAlertMethods } from "./ui/AlertSystem";
import { useChangeDetection } from "../hooks/useChangeDetection";
import { useHotkeys } from "../hooks/useHotkeys";
import { useRegisterKeybinds } from "../hooks/useRegisterKeybinds";
import NavigationButton from "./ui/NavigationButton";
import { TicketCard } from "./TicketCard";
import { LoadingSpinnerWithText } from "./ui/LoadingSpinner";
import type { LargeTicket, Comment } from "../types/api";
import type { KeyBind } from "./ui/KeyBindsModal";

interface TicketViewProps {
  id: number;
  goTo: (to: string) => void;
  showSearch: boolean;
}
function TicketView({
  id,
  goTo,
  showSearch,
}: TicketViewProps): React.ReactElement {
  const api = useApi();
  const {
    warning: _warning,
    dataChanged: _dataChanged,
    error: _error,
  } = useAlertMethods();
  const [ticket, setTicket] = useState<LargeTicket | null>(null);

  const [loading, setLoading] = useState(true);
  const ticketCardRef = useRef<HTMLDivElement | null>(null);
  const pdfIntervalRef = useRef<number | null>(null);
  const parentContainerRef = useRef<HTMLDivElement | null>(null);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null); // Track which status is being updated
  const [fullScreenAttachment, setFullScreenAttachment] = useState<{ id: number; url: string; fileName?: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [ticketCardScale, setTicketCardScale] = useState<number>(1.48);
  const [windowWidth, setWindowWidth] = useState<number>(window.innerWidth);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef<HTMLDivElement>(null);

  // Change detection
  const {
    hasChanged,
    isPolling: _isPolling,
    startPolling,
    stopPolling,
    resetPolling: _resetPolling,
  } = useChangeDetection(api, `/tickets/${id}`);

  // Helper function to decode \u escape sequences in URLs
  const decodeUrl = useCallback((url: string): string => {
    return url.replace(/\\u([0-9a-fA-F]{4})/g, (match, code) => {
      return String.fromCharCode(parseInt(code, 16));
    });
  }, []);

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString() || "";

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Convert file to base64
        const fileContent = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });

        try {
          const response = await fetch("/upload-attachment", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify({
              ticket_id: id,
              image_data: fileContent,
              file_name: file.name,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            console.error(`Error uploading ${file.name}:`, errorData);
          } else {
            console.log(`File uploaded: ${file.name}`);
          }
        } catch (err) {
          console.error("Error uploading file:", err);
        }
      }
    } finally {
      setUploading(false);
    }
  }, [id]);

  const handleAddAttachment = () => {
    // Check if device has camera capability
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (isMobile) {
      // On mobile, open camera by default
      cameraInputRef.current?.click();
    } else {
      // On desktop, open file picker
      fileInputRef.current?.click();
    }
  };

  const handleDrag = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
      e.dataTransfer.dropEffect = "copy";
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files);
    }
  }, [handleFileUpload]);

  // Register keybinds for this page
  const ticketViewKeybinds: KeyBind[] = useMemo(() => [
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
      key: "C",
      description: "Customer",
      category: "Navigation",
    },
    {
      key: "E",
      description: "Edit",
      category: "Navigation",
    },
    {
      key: "P",
      description: "Print",
      category: "Ticket",
    },
    {
      key: "Tab + Enter",
      description: "Create comment",
      category: "Ticket",
    },
    {
      key: "D",
      description: "Diagnosing",
      category: "Status",
    },
    {
      key: "F",
      description: "Finding Price",
      category: "Status",
    },
    {
      key: "A",
      description: "Approval Needed",
      category: "Status",
    },
    {
      key: "W",
      description: "Waiting for Parts",
      category: "Status",
    },
    {
      key: "O",
      description: "Waiting (Other)",
      category: "Status",
    },
    {
      key: "I",
      description: "In Progress",
      category: "Status",
    },
    {
      key: "R",
      description: "Ready",
      category: "Status",
    },
    {
      key: "X",
      description: "Resolved",
      category: "Status",
    },
  ], []);

  useRegisterKeybinds(ticketViewKeybinds);

  useHotkeys(
    {
      h: () => goTo("/"),
      s: () => {
        // Trigger search modal from parent
        const searchEvent = new CustomEvent("openSearch");
        window.dispatchEvent(searchEvent);
      },
      c: () => goTo(`/$${ticket?.customer?.id || ticket?.customer_id}`),
      e: () => goTo(`/&${id}?edit`),
      p: () => generatePDF(),
      // Status change shortcuts
      d: () => updateTicketStatus(STATUSES[0]), // Diagnosing
      f: () => updateTicketStatus(STATUSES[1]), // Finding Price
      a: () => updateTicketStatus(STATUSES[2]), // Approval Needed
      w: () => updateTicketStatus(STATUSES[3]), // Waiting for Parts
      o: () => updateTicketStatus(STATUSES[4]), // Waiting (Other)
      i: () => updateTicketStatus(STATUSES[5]), // In Progress
      r: () => updateTicketStatus(STATUSES[6]), // Ready
      x: () => updateTicketStatus(STATUSES[7]), // Resolved
    },
    showSearch,
  );

  const fetchTicketRef = useRef<{ isMounted: boolean }>({ isMounted: true });

  // Keep stable refs for external dependencies so the callback can remain small
  const apiRef = React.useRef(api);
  const startPollingRef = React.useRef(startPolling);

  React.useEffect(() => {
    apiRef.current = api;
  }, [api]);

  React.useEffect(() => {
    startPollingRef.current = startPolling;
  }, [startPolling]);

  const fetchTicket = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRef.current!.get<{ ticket: LargeTicket }>(
        `/tickets/${id}`,
      );
      if (!fetchTicketRef.current.isMounted) return;
      const ticketData = data.ticket;
      setTicket(ticketData);

      // Start change detection polling via ref (stable)
      if (startPollingRef.current) startPollingRef.current(ticketData);
    } catch (err) {
      console.error(err);
    } finally {
      if (fetchTicketRef.current.isMounted) {
        setLoading(false);
      }
    }
  }, [id]);

  // Show warning when changes are detected
  useEffect(() => {
    if (hasChanged) {
      _dataChanged(
        "Ticket Data Changed",
        "The ticket has been modified by someone else. Please refresh the page to see the latest changes.",
      );
    }
  }, [hasChanged, _dataChanged]);

  // Update window width on resize
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Calculate ticket card scale based on container width
  useEffect(() => {
    if (parentContainerRef.current) {
      const width = parentContainerRef.current.offsetWidth;
      const baseWidth = 520;
      const baseScale = 1.48;
      // Only scale on mobile, keep desktop at 1.48
      const newScale = width >= baseWidth ? 1.48 : Math.max((width / baseWidth) * baseScale, 0.9);
      setTicketCardScale(newScale);
    }
  }, [windowWidth]);

  const updateTicketStatus = async (status: string): Promise<void> => {
    if (!ticket || updatingStatus || convertStatus(ticket.status) === status)
      return; // Prevent multiple updates or updating to the same status
    setUpdatingStatus(status);
    try {
      // Convert the display status back to the original status before uploading
      const originalStatus = convertStatusToOriginal(status);
      // Send the full ticket object with updated status
      const updatedTicket = { ...ticket, status: originalStatus };
      await api.put(`/tickets/${ticket.id}`, updatedTicket);
      setTicket(updatedTicket);

      // Restart polling with the updated ticket data
      _resetPolling(updatedTicket);
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      _error("Status Update Failed", `Failed to update status: ${msg}`);
    } finally {
      setUpdatingStatus(null);
    }
  };

  useEffect(() => {
    // Stop any existing polling when ID changes
    stopPolling();
    const _fetchTicketRef = fetchTicketRef.current;
    _fetchTicketRef.isMounted = true;
    // call stable fetchTicket without including it in deps to minimize re-runs;
    // fetchTicket itself depends only on `id` and uses refs for larger dependencies.
    void fetchTicket();
    return () => {
      _fetchTicketRef.isMounted = false;
    };
    // Intentionally depend only on id/refreshKey/stopPolling so we don't retrigger
    // when unrelated values (like api) change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, refreshKey, stopPolling]);

  // Cleanup polling when component unmounts
  useEffect(() => {
    return () => {
      stopPolling();
      // Cleanup PDF interval if still running
      if (pdfIntervalRef.current) {
        window.clearInterval(pdfIntervalRef.current);
        pdfIntervalRef.current = null;
      }
    };
  }, [stopPolling]);

  // Listen for ticket refresh events
  useEffect(() => {
    const handleRefresh = () => {
      setRefreshKey((prev) => prev + 1);
    };
    window.addEventListener("refreshTicket", handleRefresh);
    return () => window.removeEventListener("refreshTicket", handleRefresh);
  }, []);

  if (loading)
    return (
      <LoadingSpinnerWithText
        text="Loading ticket..."
        className="mx-auto max-w-3xl px-3 py-10 text-center"
      />
    );
  if (!ticket)
    return (
      <InlineErrorMessage
        message="Ticket not found"
        className="mx-auto max-w-3xl px-3 py-10 text-center"
      />
    );

  const phone = formatPhone(
    ticket.customer?.phone || ticket.customer?.mobile || "",
  );

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
            setTitle: "ticket",
          },
        })
        .from(ticketCardRef.current)
        .output("bloburl")
        .then(function (pdf) {
          const pdfWindow = window.open(pdf);
          pdfWindow.onload = function () {
            pdfWindow.print();
          };
          const interval = window.setInterval(function () {
            if (pdfWindow.closed) {
              window.clearInterval(interval);
              pdfIntervalRef.current = null;
              URL.revokeObjectURL(pdf);
            }
          }, 1000);
          pdfIntervalRef.current = interval;
        });
    } catch (err: unknown) {
      console.error("Error generating PDF:", err);
      _error(
        "PDF Generation Failed",
        "Error generating PDF. Please try again.",
      );
    }
  };



  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      {/* Top Action Buttons */}
      <div className="flex flex-row justify-end gap-4 mb-6">
        <NavigationButton
          onClick={() => goTo(`/$${ticket.customer?.id || ticket.customer_id}`)}
          targetUrl={`${window.location.origin}/$${ticket.customer?.id || ticket.customer_id}`}
          className="md-btn-surface elev-1 inline-flex items-center justify-center gap-2 py-2 text-base touch-manipulation w-auto"
          tabIndex={-1}
        >
          <User className="w-5 h-5" />
          View Customer
        </NavigationButton>
        <button
          onClick={generatePDF}
          className="md-btn-surface elev-1 inline-flex items-center justify-center gap-2 py-2 text-base touch-manipulation w-auto"
          tabIndex={-1}
        >
          <Printer className="w-5 h-5" />
          Print PDF
        </button>
        <NavigationButton
          onClick={() => goTo(`/&${ticket.id}?edit`)}
          targetUrl={`${window.location.origin}/&${ticket.id}?edit`}
          className="md-btn-primary elev-1 inline-flex items-center justify-center gap-2 py-2 text-base touch-manipulation w-auto"
          tabIndex={-1}
        >
          <Edit className="w-5 h-5" />
          Edit Ticket
        </NavigationButton>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT SIDE: Ticket + Status + Attachments */}
        <div ref={parentContainerRef} className="lg:col-span-6 space-y-20 w-full lg:w-[520px]">
          {/* Ticket Card - Scaled up */}
          <div className="relative mx-auto bg-white rounded-md shadow-lg overflow-hidden h-[150px] w-full lg:w-[520px] max-w-[520px]">
            <div ref={ticketCardRef} className="absolute inset-0 origin-top-left" style={{ transform: `scale(${ticketCardScale})` }}>
              <TicketCard
              password={getTicketPassword(ticket)}
              ticketNumber={ticket.number ?? ticket.id}
              subject={
                ticket.subject +
                (getTicketDeviceInfo(ticket).estimatedTime
                  ? " [" + getTicketDeviceInfo(ticket).estimatedTime + "]"
                  : "")
              }
              itemsLeft={formatItemsLeft(
                getTicketDeviceInfo(ticket).itemsLeft,
              )}
              name={
                ticket.customer?.business_and_full_name ||
                ticket.customer?.fullname ||
                ""
              }
              creationDate={fmtDateAndTime(ticket.created_at)}
              phoneNumber={phone}
              />
            </div>
          </div>

          {/* Status and Attachments side by side */}
          <div className="grid grid-cols-2 gap-6 items-start">
            {/* Status buttons */}
            <div className="md-card p-4 space-y-3">
              <p className="text-md font-semibold">Status:</p>
              <div className="flex flex-col gap-2">
                {STATUSES.map((status, _index) => {
                  const active = convertStatus(ticket.status) === status;
                  const isUpdating = updatingStatus === status;
                  return (
                    <motion.button
                      key={status}
                      onClick={() => updateTicketStatus(status)}
                      disabled={isUpdating || active}
                      className={`${active ? "md-btn-primary" : "md-btn-surface"} text-left relative overflow-hidden py-2 text-base touch-manipulation w-full ${
                        isUpdating || active ? "cursor-not-allowed" : ""
                        }`}
                      style={active ? { borderRadius: "12px" } : {}}
                      whileTap={{ scale: 0.95 }}
                      whileHover={
                        !active && !isUpdating
                        ? {
                          backgroundColor: active
                          ? "var(--md-sys-color-primary)"
                          : "#414144",
                          filter: active ? "brightness(1.05)" : "none",
                        }
                        : {}
                      }
                      animate={
                        isUpdating
                        ? {
                          backgroundColor: active
                          ? "var(--md-sys-color-primary)"
                          : "var(--md-sys-color-primary-container)",
                          color: active
                          ? "var(--md-sys-color-on-primary)"
                          : "var(--md-sys-color-on-primary-container)",
                        }
                        : {
                          backgroundColor: active
                          ? "var(--md-sys-color-primary)"
                          : "#2c2c2f",
                          color: active
                          ? "var(--md-sys-color-on-primary)"
                          : "var(--md-sys-color-on-surface)",
                        }
                      }
                      transition={{ duration: 0.15 }}
                      tabIndex={-1}
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
                  );
                })}
              </div>
            </div>

            {/* Attachments Section - Full view with attachments */}
            <div
              ref={attachmentsRef}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`md-card p-4 space-y-3 rounded-lg border-2 transition-colors min-h-[100px] ${
                dragActive
                ? "border-dashed border-primary bg-primary/10 brightness-110"
                : "border-solid border-gray-300"
              }`}
            >
              <div className="flex justify-between items-center">
                <p className="text-md font-semibold">Attachments</p>
                <button
                  onClick={handleAddAttachment}
                  disabled={uploading}
                  className="p-1 hover:bg-gray-600 rounded-md transition-colors disabled:opacity-50"
                  title="Add attachment"
                >
                  {uploading ? <Loader2 size={20} className="animate-spin" /> : <Plus size={20} />}
                </button>
              </div>

              {/* Attachments grid */}
              <div className="grid grid-cols-1 gap-4">
                {ticket.attachments.map((attachment) => {
                  const decodedUrl = decodeUrl(attachment.file?.url || "");
                  return (
                    <div
                      key={attachment.id}
                      className="border border-outline rounded-lg overflow-hidden cursor-pointer hover:shadow-lg transition-shadow max-h-45"
                      onClick={() =>
                        setFullScreenAttachment({
                          id: attachment.id,
                          url: decodedUrl,
                          fileName: attachment.file_name,
                        })
                      }
                    >
                      {attachment.file?.url && (
                        <img
                        src={decodedUrl}
                        alt={attachment.file_name}
                        className="w-full h-auto max-h-64 object-cover"
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Hidden file inputs */}
              <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx"
              onChange={(e) => handleFileUpload(e.target.files)}
              className="hidden"
              />
              <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handleFileUpload(e.target.files)}
              className="hidden"
              />
            </div>
          </div>
        </div>

        {/* RIGHT SIDE: Comments */}
        <aside className="lg:col-start-7 lg:col-span-6 space-y-6">
          <div className="md-card p-6">
            <div className="text-lg font-semibold mb-4">Comments</div>
            <CommentsBox
            ticketId={ticket.id}
            comments={ticket.comments}
            _goTo={goTo}
            />
          </div>
        </aside>
      </div>

      {/* Drag and drop upload tooltip */}
      {dragActive && (
        <div
          className="fixed bg-black text-white px-3 py-2 rounded-md text-sm font-medium pointer-events-none z-40 whitespace-nowrap"
          style={{
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
          }}
        >
          Upload
        </div>
      )}

      {/* Full-screen attachment modal */}
      {fullScreenAttachment && (
        <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center">
          <div className="relative w-full h-full flex items-center justify-center">
            <button
              onClick={() => setFullScreenAttachment(null)}
              className="absolute top-4 right-4 p-2 bg-gray-800 rounded-full hover:bg-gray-700 transition-colors z-10"
              title="Close"
            >
              <X size={24} className="text-white" />
            </button>
            <img
            src={fullScreenAttachment.url}
            alt={fullScreenAttachment.fileName}
            className="max-w-[90vw] max-h-[90vh] object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface CommentsBoxProps {
  ticketId: number;
  comments?: Comment[];
  _goTo: (to: string) => void;
}
function CommentsBox({
  ticketId,
  comments = [],
  _goTo,
}: CommentsBoxProps): React.ReactElement {
  const api = useApi();
  const [text, setText] = useState<string>("");
  const [list, setList] = useState<Comment[]>(comments || []);
  const [createLoading, setCreateLoading] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<{ username?: string } | null>(
    null,
  );
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setList(comments || []);
  }, [comments]);

  // Get current user information
  useEffect(() => {
    const getCurrentUserInfo = async () => {
      try {
        const user = await getCurrentUser();
        setCurrentUser(user);
      } catch (error) {
        console.error("Error getting current user:", error);
      }
    };
    getCurrentUserInfo();
  }, []);

  // Auto-resize textarea
  const autoResize = (): void => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        textareaRef.current.scrollHeight + "px";
    }
  };

  // Handle text change and auto-resize
  const handleTextChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>,
  ): void => {
    setText(event.target.value);
    autoResize();
  };

  // Auto-resize on mount and when text changes
  useEffect(() => {
    autoResize();
  }, [text]);

  async function create(): Promise<void> {
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

        // Try multiple sources for the name (safely coerce to strings)
        const tryString = (v: unknown): string | undefined =>
          typeof v === "string" && v.trim() ? v : undefined;

        // Normalize unknown shapes into plain objects we can index safely.
        const uaUnknown = userAttributes as unknown;
        const uaObj =
          uaUnknown && typeof uaUnknown === "object"
            ? (uaUnknown as Record<string, unknown>)
            : {};
        const idUnknown = idTokenPayload as unknown;
        const idObj =
          idUnknown && typeof idUnknown === "object"
            ? (idUnknown as Record<string, unknown>)
            : {};

        const attrName =
          tryString(uaObj["custom:given_name"]) ??
          tryString(uaObj["given_name"]) ??
          tryString(uaObj["name"]);

        const idName =
          tryString(idObj["custom:given_name"]) ??
          tryString(idObj["given_name"]) ??
          tryString(idObj["name"]);

        // Safely extract username from currentUser if it's an object with a string username
        let currentUserName: string | undefined;
        if (currentUser && typeof currentUser === "object") {
          const cu = currentUser as Record<string, unknown>;
          if (typeof cu.username === "string" && cu.username.trim()) {
            currentUserName = cu.username;
          }
        }

        techName = attrName ?? idName ?? currentUserName ?? "True Tickets";
      } catch (err: unknown) {
        console.error("Error getting user attributes:", err);

        // Fallback: try to read username from currentUser safely
        let currentUserName: string | undefined;
        if (currentUser && typeof currentUser === "object") {
          const cu = currentUser as Record<string, unknown>;
          if (typeof cu.username === "string" && cu.username.trim()) {
            currentUserName = cu.username;
          }
        }

        techName = currentUserName ?? "True Tickets";
      }

      await api.post(`/tickets/${ticketId}/comment`, {
        subject: "Update",
        body: text,
        tech: techName,
        hidden: true,
        do_not_email: true,
      });
      setText("");
      // Trigger a refresh event to reload the ticket data
      window.dispatchEvent(new CustomEvent("refreshTicket"));
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setCreateLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleTextChange}
        className="md-textarea"
        placeholder="Write a comment…"
        style={{ minHeight: "96px", resize: "none", overflow: "hidden" }}
      />
      <button
        onClick={create}
        disabled={createLoading}
        className="w-full md-btn-primary elev-1"
      >
        {createLoading ? "Creating..." : "Create Comment"}
      </button>
      <div className="space-y-3">
        {(list || [])
          .filter((comment) => {
            const body = (comment.body ?? "").trim();
            return body !== "Ticket marked as Pre-Diagnosed.";
          })
          .map((comment) => (
            <div key={comment.id} className="md-row-box p-3 relative">
              {/* Top bar details: tech + time (left), SMS (right) */}
              <div className="absolute inset-x-3 top-2 flex items-center justify-between text-md text-outline">
                <div className="flex items-center gap-3">
                  {comment.tech ? <span>{comment.tech}</span> : null}
                  <span>{fmtDateAndTime(comment.created_at)}</span>
                </div>
                {typeof comment.hidden === "boolean" &&
                comment.hidden === false ? (
                  <span>Probably SMS</span>
                ) : (
                  <span />
                )}
              </div>

              {/* Body */}
              <div className="whitespace-pre-wrap leading-relaxed pt-5 text-base">
                {formatCommentWithLinks(comment.body || "")}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function InlineErrorMessage({
  message,
  className,
}: {
  message: string;
  className?: string;
}): React.ReactElement {
  return (
    <div className={className}>
      <div className="text-red-500 font-medium">{message}</div>
    </div>
  );
}

export default TicketView;
