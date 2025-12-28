import React, { useEffect, useState, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useApi } from "../hooks/useApi";
import { useAlertMethods } from "./ui/AlertSystem";
import { useChangeDetection } from "../hooks/useChangeDetection";
import { useHotkeys } from "../hooks/useHotkeys";
import { useRegisterKeybinds } from "../hooks/useRegisterKeybinds";
import { LoadingSpinnerWithText } from "./ui/LoadingSpinner";
import type { Customer, PostCustomer, UpdateCustomer } from "../types/api";
import type { KeyBind } from "./ui/KeyBindsModal";

interface NewCustomerProps {
  goTo: (to: string) => void;
  customerId?: string | undefined;
  showSearch: boolean;
}

interface CustomerForm {
  full_name: string;
  phone: string;
  email: string;
  [key: string]: string;
}

export default function NewCustomer({
  goTo,
  customerId,
  showSearch,
}: NewCustomerProps): React.ReactElement {
  const api = useApi();
  const { error, dataChanged } = useAlertMethods();

  const [form, setForm] = useState<CustomerForm>({
    full_name: "",
    phone: "",
    email: "",
  });

  const [allPhones, setAllPhones] = useState<string[]>([""]);
  const [primaryPhoneIndex, setPrimaryPhoneIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(!!customerId);
  const [saving, setSaving] = useState<boolean>(false);

  const fullNameInputRef = useRef<HTMLInputElement>(null);

  const {
    hasChanged,
    startPolling,
    stopPolling,
  } = useChangeDetection(customerId ? `/customers/last_updated?customer_id=${customerId}` : "");

  useEffect(() => {
    if (customerId) return;
    const params = new URLSearchParams(window.location.search);
    const phone = params.get("phone") || "";
    const name = params.get("full_name") || params.get("customerName") || "";

    setForm(prev => ({
      ...prev,
      full_name: name,
      phone: phone ? formatPhoneLive(phone) : prev.phone,
    }));

    if (phone) setAllPhones([formatPhoneLive(phone)]);
  }, [customerId]);

  useEffect(() => {
    if (!loading) {
      const tid = setTimeout(() => {
        if (fullNameInputRef.current) fullNameInputRef.current.focus();
      }, 50);
      return () => clearTimeout(tid);
    }
  }, [customerId, loading]);

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
        if (customerId) goTo(`/$${customerId}`);
        else goTo("/");
      },
    },
    showSearch,
  );

  const formatPhoneLive = (value?: string | null): string => {
    const digits = (value || "").replace(/\D/g, "");
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };

  const sanitizePhone = (value?: string | null): string => (value || "").replace(/\D/g, "");

  useEffect(() => {
    if (!customerId) return;
    setLoading(true);
    let isMounted = true;
    (async () => {
      try {
        const data = await api.get<{ customer: Customer }>(`/customers/${customerId}`);
        if (!isMounted) return;
        const customer = data.customer;
        startPolling(customer);

        const firstPhone = customer.phone_numbers?.[0]?.number || "";

        setForm({
          full_name: customer.full_name || "",
          phone: firstPhone,
          email: customer.email || "",
        });

        const phones = customer.phone_numbers || [];
        if (phones.length > 0) {
          const formatted = phones.map(p => formatPhoneLive(p.number));
          setAllPhones(formatted);
          // First one is always primary in our convention now
          setPrimaryPhoneIndex(0);
        } else {
          setAllPhones([""]);
          setPrimaryPhoneIndex(0);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => { isMounted = false; };
  }, [customerId, api, startPolling]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling, customerId]);

  useEffect(() => {
    if (hasChanged && customerId) {
      dataChanged(
        "Customer Data Changed",
        "The customer has been modified by someone else. Please refresh to see changes.",
      );
    }
  }, [hasChanged, customerId, dataChanged]);

  async function save() {
    if (!form.full_name.trim()) {
      error("Validation Error", "Full name is required");
      return;
    }
    const cleanPhones = allPhones.map(p => sanitizePhone(p)).filter(p => p.length === 10);
    if (cleanPhones.length === 0) {
      error("Validation Error", "At least one 10-digit phone number is required");
      return;
    }

    setSaving(true);
    try {
      const primaryPhone = allPhones[primaryPhoneIndex] ? sanitizePhone(allPhones[primaryPhoneIndex]) : cleanPhones[0];

      // Reorder: put primary phone first
      const orderedPhones = [
        primaryPhone,
        ...cleanPhones.filter(p => p !== primaryPhone)
      ].filter(Boolean); // remove duplicates/empty if any logic slipped

      // Remove duplicates just in case
      const uniquePhones = Array.from(new Set(orderedPhones));

      if (customerId) {
        const payload: UpdateCustomer = {
          full_name: form.full_name,
          email: form.email || null,
          phone_numbers: uniquePhones.map(num => ({
            number: num,
            prefers_texting: false,
            no_english: false
          })),
        };
        const res = await api.put<{ customer_id: string }>(`/customers?customer_id=${customerId}`, payload);
        goTo(`/$${res.customer_id}`);
      } else {
        const payload: PostCustomer = {
          full_name: form.full_name,
          email: form.email || null,
          phone_numbers: uniquePhones.map(num => ({
            number: num,
            prefers_texting: false,
            no_english: false
          })),
        };
        const res = await api.post<{ customer_id: string }>("/customers", payload);
        const goToUrl = `/$${res.customer_id}${window.location.search.includes("newticket") ? "?newticket" : ""}`;
        goTo(goToUrl);
      }
    } catch (err) {
      console.error(err);
      error("Error", "Failed to save customer data.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingSpinnerWithText text="Loading customer data..." className="mx-auto max-w-2xl px-6 py-6 text-center" />;

  return (
    <div className="mx-auto max-w-2xl px-3 sm:px-6 py-3 sm:py-6">
      <div className="md-card p-3 sm:p-8 space-y-4 sm:space-y-6">
        <div className="flex items-center justify-between">
          <div className="text-xl sm:text-2xl font-bold text-primary">
            {customerId ? "Edit Customer" : "New Customer"}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={() => goTo(customerId ? `/$${customerId}` : "/")}
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
              tabIndex={5}
            >
              <div className="flex items-center justify-center gap-2">
                <span>{saving ? (customerId ? "Updating..." : "Creating...") : (customerId ? "Update" : "Create Customer")}</span>
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              </div>
            </motion.button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-md font-medium">Full Name</label>
          <input
            ref={fullNameInputRef}
            className="md-input text-md sm:text-base py-3 sm:py-2"
            value={form.full_name}
            onChange={e => setForm({ ...form, full_name: e.target.value })}
            tabIndex={1}
          />
        </div>

        <div className="space-y-2">
          <label className="text-md font-medium">Phone Numbers</label>
          <div className="space-y-3">
            {allPhones.map((phone, index) => (
              <div key={index} className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPrimaryPhoneIndex(index)}
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${index === primaryPhoneIndex ? "border-primary-indicator bg-primary-indicator" : "border-inactive-indicator"}`}
                  tabIndex={-1}
                >
                  {index === primaryPhoneIndex && <div className="w-2 h-2 bg-white rounded-full" />}
                </button>
                <input
                  className="md-input flex-1 text-md sm:text-base py-3 sm:py-2"
                  value={phone}
                  onChange={e => setAllPhones(prev => prev.map((p, i) => i === index ? formatPhoneLive(e.target.value) : p))}
                  inputMode="numeric"
                  placeholder="Phone number"
                  tabIndex={4}
                />
                {index === primaryPhoneIndex && <span className="text-md font-medium text-primary">Primary</span>}
              </div>
            ))}
            <button
              type="button"
              className="md-btn-surface elev-1 text-md py-2 px-3"
              onClick={() => setAllPhones([...allPhones, ""])}
              tabIndex={-1}
            >
              + Add another phone
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-md font-medium">Email</label>
          <input
            className="md-input text-md sm:text-base py-3 sm:py-2"
            value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })}
            autoComplete="email"
            tabIndex={-1}
          />
        </div>
      </div>
    </div>
  );
}
