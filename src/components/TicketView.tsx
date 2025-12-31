import React, { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { User, Printer, Edit, Loader2, Plus, X } from "lucide-react";
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
  EMPTY_ARRAY,
} from "../constants/appConstants.js";
import {
  formatPhone,
  getTicketPassword,
  parseEstimatedTime,
  formatItemsLeft,
  fmtDateAndTime,
  formatCommentWithLinks,
  compressImage,
} from "../utils/appUtils.jsx";
import { useApi } from "../hooks/useApi";
import { useAlertMethods } from "./ui/AlertSystem";
import { useHotkeys } from "../hooks/useHotkeys";
import { useRegisterKeybinds } from "../hooks/useRegisterKeybinds";
import NavigationButton from "./ui/NavigationButton";
import { TicketCard } from "./TicketCard";
import { LoadingSpinnerWithText } from "./ui/LoadingSpinner";
import { InlineErrorMessage } from "./ui/InlineErrorMessage";
import type { Ticket, Comment, UpdateTicket, PostAttachment, PostComment } from "../types/api";
import type { KeyBind } from "./ui/KeyBindsModal";

interface TicketViewProps {
  id: string;
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
  const [ticket, setTicket] = useState<Ticket | null>(null);

  const [loading, setLoading] = useState(true);
  const ticketCardRef = useRef<HTMLDivElement | null>(null);
  const pdfIntervalRef = useRef<number | null>(null);
  const parentContainerRef = useRef<HTMLDivElement | null>(null);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null); // Track which status is being updated
  const [fullScreenAttachment, setFullScreenAttachment] = useState<{ url: string; fileName?: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [ticketCardScale, setTicketCardScale] = useState<number>(1.48);
  const [windowWidth, setWindowWidth] = useState<number>(window.innerWidth);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef<HTMLDivElement>(null);

  // Change detection
  /*
  const {
    hasChanged,
    isPolling: _isPolling,
    startPolling,
    stopPolling,
    resetPolling: _resetPolling,
  } = useChangeDetection(`/tickets/last_updated?number=${id}`);
  */
  const hasChanged = false;
  const stopPolling = useCallback(() => { }, []);
  const startPolling = useCallback((_initialData: unknown) => { }, []);
  const _resetPolling = useCallback((_newData: unknown) => { }, []);

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    let uploadedCount = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let fileContent: string;

        // Check if image
        if (file.type.startsWith("image/")) {
          const MAX_FILE_SIZE = 10 * 1024 * 1024;
          if (file.size > MAX_FILE_SIZE) {
            try {
              // Compress if > 10MB
              fileContent = await compressImage(file);
            } catch (e) {
              console.error("Compression failed", e);
              _error("File Too Large", `"${file.name}" exceeds 10MB and could not be compressed.`);
              continue;
            }
          } else {
            // Normal read
            fileContent = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(file);
            });
          }
        } else {
          // Not image
          const MAX_FILE_SIZE = 10 * 1024 * 1024;
          if (file.size > MAX_FILE_SIZE) {
            _error("File Too Large", `"${file.name}" exceeds the 10MB limit.`);
            continue;
          }
          fileContent = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          });
        }

        try {
          const payload: PostAttachment = {
            ticket_id: id,
            image_data: fileContent,
          };
          await api.post("/upload-attachment", payload);
          console.log(`File uploaded: ${file.name}`);
          uploadedCount++;
        } catch (err) {
          console.error(`Error uploading ${file.name}:`, err);
        }
      }
    } finally {
      setUploading(false);
      // Refresh ticket data after a 1-second delay if any files were uploaded successfully
      // This gives the server time to process the attachments
      if (uploadedCount > 0) {
        setTimeout(() => {
          setRefreshKey((prev) => prev + 1);
        }, 1000);
      }
    }
  }, [id, api, _error]);

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

  useRegisterKeybinds(showSearch ? (EMPTY_ARRAY as any) : ticketViewKeybinds);



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
      const ticketData = await apiRef.current!.get<Ticket>(
        `/tickets?number=${id}`,
      );
      if (!fetchTicketRef.current.isMounted) return;
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
      const newScale = width >= baseWidth ? 1.48 : Math.max((width / baseWidth) * baseScale);
      setTicketCardScale(newScale);
    }
  }, [windowWidth, ticket]);

  const updateTicketStatus = async (status: string): Promise<void> => {
    if (!ticket || updatingStatus || convertStatus(ticket.status || "") === status)
      return; // Prevent multiple updates or updating to the same status
    setUpdatingStatus(status);
    try {
      // Convert the display status back to the original status before uploading
      const originalStatus = convertStatusToOriginal(status);

      const updateData: UpdateTicket = {
        status: originalStatus,
        subject: null,
        password: null,
        items_left: null,
        device: null,
      };

      await api.put(`/tickets?number=${ticket.ticket_number}`, updateData);

      const updatedTicket = { ...ticket, status: originalStatus };
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

  const generatePDF = async () => {
    if (!ticketCardRef.current) return;

    try {
      html2pdf()
        .set({
          margin: [0, 0, 0, 0],
          filename: "ticket.pdf",
          html2canvas: { scale: 6 },
          jsPDF: {
            orientation: "landscape",
            unit: "in",
            format: [3.5, 1.12],
          },
        })
        .from(ticketCardRef.current)
        .output("bloburl")
        .then(function (pdf) {
          const iframe = document.createElement("iframe");
          iframe.style.position = "fixed";
          iframe.style.width = "0";
          iframe.style.height = "0";
          iframe.style.border = "none";
          iframe.src = pdf;
          document.body.appendChild(iframe);

          iframe.onload = function () {
            iframe.contentWindow?.print();
            // Cleanup after 1 minute to allow time for printing
            setTimeout(() => {
              if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
              }
              URL.revokeObjectURL(pdf);
            }, 60000);
          };
        });
    } catch (err: unknown) {
      console.error("Error generating PDF:", err);
      _error(
        "PDF Generation Failed",
        "Error generating PDF. Please try again.",
      );
    }
  };

  const hotkeyMap = useMemo(
    () => ({
      h: () => goTo("/"),
      s: () => {
        // Trigger search modal from parent
        const searchEvent = new CustomEvent("openSearch");
        window.dispatchEvent(searchEvent);
      },
      c: () => goTo(`/$${ticket?.customer?.customer_id}`),
      e: () => goTo(`/&${ticket?.ticket_number}?edit`),
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
    }),
    [
      goTo,
      ticket?.customer?.customer_id,
      ticket?.ticket_number,
      updateTicketStatus,
      generatePDF,
    ]
  );

  useHotkeys(hotkeyMap, showSearch);

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
    ticket.customer?.phone_numbers?.[0]?.number || ""
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      {/* Top Action Buttons */}
      <div className="flex flex-row justify-end gap-4 mb-6">
        <NavigationButton
          onClick={() => goTo(`/$${ticket.customer?.customer_id}`)}
          targetUrl={`${window.location.origin}/$${ticket.customer?.customer_id}`}
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
          onClick={() => goTo(`/&${ticket.ticket_number}?edit`)}
          targetUrl={`${window.location.origin}/&${ticket.ticket_number}?edit`}
          className="md-btn-primary elev-1 inline-flex items-center justify-center gap-2 py-2 text-base touch-manipulation w-auto"
          tabIndex={-1}
        >
          <Edit className="w-5 h-5" />
          Edit Ticket
        </NavigationButton>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT SIDE: Ticket + Status + Attachments */}
        <div ref={parentContainerRef} className="lg:col-span-6 space-y-6 w-full lg:w-[520px]">
          {/* Ticket Card - Scaled up */}
          <div className="relative mx-auto bg-white rounded-lg shadow-lg overflow-hidden h-[150px] w-full lg:w-[520px] max-w-[520px]">
            <div className="absolute inset-0 origin-top-left" style={{ transform: `scale(${ticketCardScale})` }}>
              <div ref={ticketCardRef}> {/* This div can't have any styling on it because HTML2PDF needs to read it */}
                <TicketCard
                  password={getTicketPassword(ticket)}
                  ticketNumber={ticket.ticket_number}
                  subject={
                    parseEstimatedTime(ticket.subject).baseSubject +
                    (parseEstimatedTime(ticket.subject).time
                      ? " [" + parseEstimatedTime(ticket.subject).time + "]"
                      : "")
                  }
                  itemsLeft={formatItemsLeft(ticket.items_left || [])}
                  name={ticket.customer?.full_name || ""}
                  creationDate={fmtDateAndTime(ticket.created_at)}
                  phoneNumber={phone}
                />
              </div>
            </div>
          </div>

          {/* Status buttons - Stacked Flex Rows */}
          <div className="md-card p-4 space-y-3 mb-6">
            <p className="text-md font-semibold">Status:</p>
            <div className="w-full flex flex-col gap-2">
              {[
                [STATUSES[0], STATUSES[2], STATUSES[4], STATUSES[6]], // D, F, A, Ready
                [STATUSES[1], STATUSES[3], STATUSES[5], STATUSES[7]]  // W, O, I, Resolved
              ].map((statusRow, rowIndex) => (
                <div key={rowIndex} className="flex gap-2 w-full">
                  {statusRow.map((status) => {
                    const active = convertStatus(ticket.status || "") === status;
                    const isUpdating = updatingStatus === status;

                    return (
                      <motion.button
                        key={status}
                        onClick={() => updateTicketStatus(status)}
                        disabled={isUpdating || active}
                        className={`${isUpdating
                          ? "bg-blue-900 text-white px-6 border-none outline-none ring-0"
                          : active
                            ? "md-btn-primary px-6"
                            : (status === "Ready" || status === "Resolved")
                              ? "md-btn-surface px-3 !border-gray-400"
                              : "md-btn-surface px-3"
                          } flex-auto inline-flex items-center justify-center gap-2 py-2 text-[14px] font-medium rounded-lg touch-manipulation whitespace-nowrap transition-all ${isUpdating || active ? "cursor-not-allowed" : "hover:brightness-95"
                          }`}
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

          {/* Line Items and Attachments - Stacked */}
          <div className="space-y-6">
            {/* Line Items Section */}
            <div className="md-card p-4 space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-md font-semibold">Line Items</p>
                <div className="flex items-center gap-2">
                  {(() => {
                    const currentStatus = convertStatus(ticket.status || "");
                    const printLabel = currentStatus === "Ready"
                      ? "Print Invoice"
                      : currentStatus === "Resolved"
                        ? "Print Receipt"
                        : "Print Estimate";

                    return (
                      <button
                        onClick={() => {/* TODO */ }}
                        className="md-btn-surface elev-1 inline-flex items-center justify-center gap-2 px-3 py-1.5 text-sm touch-manipulation"
                        tabIndex={-1}
                      >
                        <Printer className="w-4 h-4" />
                        {printLabel}
                      </button>
                    );
                  })()}
                </div>
              </div>

              <div className="space-y-3">
                {(ticket.line_items || []).map((item: any, index: number) => (
                  <div key={index} className="flex gap-3 items-center">
                    <input
                      type="text"
                      placeholder="Subject"
                      value={item.subject || ""}
                      onChange={(e) => {
                        const newItems = [...(ticket.line_items || [])];
                        newItems[index] = { ...newItems[index], subject: e.target.value };
                        setTicket({ ...ticket, line_items: newItems });
                      }}
                      className="md-input flex-grow text-md sm:text-base py-3 sm:py-2"
                    />
                    <div className="relative w-32">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/70 text-sm">$</span>
                      <input
                        type="number"
                        placeholder="0"
                        value={item.price || ""}
                        onChange={(e) => {
                          const newItems = [...(ticket.line_items || [])];
                          newItems[index] = { ...newItems[index], price: parseFloat(e.target.value) };
                          setTicket({ ...ticket, line_items: newItems });
                        }}
                        className="md-input w-full pl-6 text-md sm:text-base py-3 sm:py-2 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                    <button
                      onClick={() => {
                        const newItems = (ticket.line_items || []).filter((_: any, i: number) => i !== index);
                        setTicket({ ...ticket, line_items: newItems });
                      }}
                      className="p-2 text-on-surface-variant hover:text-error transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  className="md-btn-surface elev-1 text-sm py-1.5 px-3 w-fit"
                  onClick={() => {
                    const newItems = [...(ticket.line_items || []), { subject: "", price: 0 }];
                    setTicket({ ...ticket, line_items: newItems });
                  }}
                  tabIndex={-1}
                >
                  + Add Line Item
                </button>

                {/* Totals Section */}
                {(ticket.line_items || []).length > 0 && (
                  <div className="flex flex-col items-end">
                    {(() => {
                      const subtotal = (ticket.line_items || []).reduce((acc: number, item: any) => acc + (parseFloat(item.price) || 0), 0);
                      const tax = subtotal * 0.0825;
                      const total = subtotal + tax;

                      return (
                        <div className="w-full max-w-[200px] space-y-1">
                          <div className="flex justify-between text-md font-semibold">
                            <span>Total:</span>
                            <span>${total.toFixed(2)}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>

            {/* Attachments Section - Full view with attachments */}
            <div
              ref={attachmentsRef}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`md-card p-4 space-y-3 rounded-lg border-2 transition-colors min-h-[100px] ${dragActive
                ? "border-dashed border-primary bg-primary/10 brightness-110"
                : "border-solid border-outline"
                }`}
            >
              <div className="flex justify-between items-center">
                <p className="text-md font-semibold">Attachments</p>
                <button
                  onClick={handleAddAttachment}
                  disabled={uploading}
                  className="p-1 hover:bg-on-surface/10 rounded-md transition-colors disabled:opacity-50"
                  title="Add attachment"
                  tabIndex={-1}
                >
                  {uploading ? <Loader2 size={20} className="animate-spin" /> : <Plus size={20} />}
                </button>
              </div>

              {/* Attachments grid */}
              <div className="grid grid-cols-1 gap-4">
                {(ticket.attachments || []).map((attachmentUrl, index) => {
                  const fileName = attachmentUrl.split('/').pop() || "Attachment";
                  const url = attachmentUrl;

                  return (
                    <div
                      key={index}
                      className="border border-outline rounded-lg overflow-hidden cursor-pointer hover:shadow-lg transition-shadow max-h-45"
                      onClick={() =>
                        setFullScreenAttachment({
                          url: url,
                          fileName: fileName,
                        })
                      }
                    >
                      {url && (
                        <img
                          src={url}
                          alt={fileName}
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
              ticketNumber={ticket.ticket_number}
              comments={ticket.comments}
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
              className="absolute top-4 right-4 p-2 rounded-full transition-colors z-10"
              style={{ backgroundColor: "var(--color-bg-elevated-hover)" }}
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
  ticketNumber: number;
  comments?: Comment[] | null | undefined;
}
const CommentsBox = React.memo(({
  ticketNumber,
  comments,
}: CommentsBoxProps): React.ReactElement => {
  console.log("CommentsBox ticketNumber:", ticketNumber);
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

      const payload: PostComment = {
        comment_body: text,
        tech_name: techName,
      };
      await api.post(`/tickets/comment?ticket_number=${ticketNumber}`, payload);
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
            const body = (comment.comment_body ?? "").trim();
            return body !== "Ticket marked as Pre-Diagnosed.";
          })
          .map((comment, index) => (
            <div key={index} className="md-row-box p-3 relative">
              {/* Top bar details: tech + time */}
              <div className="absolute inset-x-3 top-2 flex items-center justify-between text-md text-outline">
                <div className="flex items-center gap-3">
                  {comment.tech_name ? <span>{comment.tech_name}</span> : null}
                  <span>{fmtDateAndTime(comment.created_at || "")}</span>
                </div>
              </div>

              {/* Body */}
              <div className="whitespace-pre-wrap leading-relaxed pt-5 text-base">
                {formatCommentWithLinks(comment.comment_body || "")}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
});

export default TicketView;
