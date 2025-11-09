import React, { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useApi } from "../hooks/useApi";
import { useAlertMethods } from "./ui/AlertSystem";
import { useChangeDetection } from "../hooks/useChangeDetection";
import { useHotkeys } from "../hooks/useHotkeys";
import { useRegisterKeybinds } from "../hooks/useRegisterKeybinds";
import { LoadingSpinnerWithText } from "./ui/LoadingSpinner";
import type { Customer, Phone } from "../types/api";
import type { KeyBind } from "./ui/KeyBindsModal";

/**
 * Props and form types for NewCustomer component
 */
interface NewCustomerProps {
  goTo: (to: string) => void;
  customerId?: number;
  showSearch: boolean;
}

/**
 * Form shape with index signature so callers can access by string keys
 */
interface CustomerForm {
  first_name: string;
  last_name: string;
  business_name: string;
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
    first_name: "",
    last_name: "",
    business_name: "",
    phone: "",
    email: "",
  });

  const [allPhones, setAllPhones] = useState<string[]>([""]);
  const [primaryPhoneIndex, setPrimaryPhoneIndex] = useState<number>(0);
  const [applying, setApplying] = useState<boolean>(false);
  const [storedCustomer, setStoredCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState<boolean>(!!customerId);

  // Ref for first_name input to manage focus
  const firstNameInputRef = useRef<HTMLInputElement>(null);

  // NOTE: useChangeDetection requires an endpoint string; when customerId is not provided
  // we pass an empty string. startPolling will only be called when editing an existing customer.
  const {
    hasChanged,
    isPolling: _isPolling,
    startPolling,
    stopPolling,
    resetPolling: _resetPolling,
  } = useChangeDetection(api, customerId ? `/customers/${customerId}` : "");

  useEffect(() => {
    try {
      if (customerId) return;

      // Prefill some fields from query params if present
      const params = new URLSearchParams(window.location.search);
      const phone = params.get("phone") || "";
      const first_name = params.get("first_name") || "";
      const last_name = params.get("last_name") || "";

      setForm((prev) => ({
        ...prev,
        first_name,
        last_name,
        phone: phone ? formatPhoneLive(phone) : prev.phone,
      }));

      if (phone) {
        setAllPhones([formatPhoneLive(phone)]);
      }
    } catch (err: unknown) {
      console.error("Failed to parse URL params:", err);
    }
  }, [customerId]);

  // Focus on first_name input when component mounts or when navigating to a new/different customer
  useEffect(() => {
    // Only focus after loading completes and form is rendered
    if (!loading) {
      // Small delay to ensure the input is rendered and DOM is stable
      const timeoutId = setTimeout(() => {
        if (firstNameInputRef.current) {
          firstNameInputRef.current.focus();
        }
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [customerId, loading]);

  // Register keybinds for this page
  const newCustomerKeybinds: KeyBind[] = [
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
      description: "Cancel",
      category: "Navigation",
    },
  ];

  useRegisterKeybinds(newCustomerKeybinds);

  // Hotkeys
  useHotkeys(
    {
      h: () => goTo("/"),
      s: () => {
        const searchEvent = new CustomEvent("openSearch");
        window.dispatchEvent(searchEvent);
      },
      c: () => {
        if (customerId) {
          goTo(`/$${customerId}`);
        } else {
          goTo("/");
        }
      },
    },
    showSearch,
  );

  // Format a phone number as the user types (simple live formatting)
  const formatPhoneLive = (value?: string | null): string => {
    const digits = (value || "").replace(/\D/g, "");
    const areaCode = digits.slice(0, 3);
    const exchange = digits.slice(3, 6);
    const number = digits.slice(6, 10);
    if (digits.length <= 3) return areaCode;
    if (digits.length <= 6) return `${areaCode}-${exchange}`;
    return `${areaCode}-${exchange}-${number}`;
  };

  const sanitizePhone = (value?: string | null): string =>
    (value || "").replace(/\D/g, "");

  const setPrimaryPhone = (index: number): void => {
    if (index < 0 || index >= allPhones.length) return;
    setPrimaryPhoneIndex(index);
  };

  // Load existing customer data if editing
  useEffect(() => {
    if (!customerId) return;

    setLoading(true);

    let isMounted = true;
    (async () => {
      try {
        // use the provided customerId (not `id`) and request a typed response
        const data = await api.get<{ customer: Customer }>(
          `/customers/${customerId}`,
        );
        if (!isMounted) return;
        const customer = data.customer;
        setStoredCustomer(customer);

        // Start change detection polling with the loaded customer
        startPolling(customer);

        setForm({
          first_name: customer.firstname || "",
          last_name: customer.lastname || "",
          business_name: customer.business_name || "",
          phone: "", // will set after loading phones
          email: customer.email || "",
        });

        // Load phones
        try {
          const phoneData = await api.get<{ phones: Phone[] }>(
            `/customers/${customerId}/phones`,
          );
          if (!isMounted) return;
          const phoneArray = phoneData.phones || [];
          const numbers = phoneArray
            .map((p) => p?.number || "")
            .filter(Boolean);

          if (numbers.length > 0) {
            const formattedNumbers = numbers.map((n) => formatPhoneLive(n));
            setAllPhones(formattedNumbers);
            setPrimaryPhoneIndex(0);
            setForm((prev) => ({ ...prev, phone: formattedNumbers[0] }));
          } else {
            const basePhone =
              customer.mobile && String(customer.mobile).trim()
                ? customer.mobile
                : customer.phone || "";
            const formattedPhone = formatPhoneLive(basePhone || "");
            setAllPhones([formattedPhone]);
            setPrimaryPhoneIndex(0);
            setForm((prev) => ({ ...prev, phone: formattedPhone }));
          }
        } catch {
          if (!isMounted) return;
          const basePhone =
            customer.mobile && String(customer.mobile).trim()
              ? customer.mobile
              : customer.phone || "";
          const formattedPhone = formatPhoneLive(basePhone || "");
          setAllPhones([formattedPhone]);
          setPrimaryPhoneIndex(0);
          setForm((prev) => ({ ...prev, phone: formattedPhone }));
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [customerId, api, startPolling]);

  // Stop polling when unmounted or when customerId changes
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling, customerId]);

  // Notify user when server-side changes are detected
  useEffect(() => {
    if (hasChanged && customerId) {
      dataChanged(
        "Customer Data Changed",
        "The customer has been modified by someone else. Any unsaved changes may be lost if you continue editing.",
      );
    }
  }, [hasChanged, customerId, dataChanged]);

  const [saving, setSaving] = useState<boolean>(false);

  // API helpers for phones
  async function getPhonesOnServer(id: number): Promise<Phone[]> {
    const phoneData = await api.get<{ phones: Phone[] }>(
      `/customers/${id}/phones`,
    );
    return phoneData.phones || [];
  }

  async function deletePhones(id: number, phones: Phone[]): Promise<void> {
    if (!phones || phones.length === 0) return;
    await Promise.all(
      phones.map((phone) => {
        const phoneId = phone.id ?? phone.phone_id;
        if (!phoneId) return Promise.resolve();
        return api.del(`/customers/${id}/phones/${phoneId}`).catch(() => {});
      }),
    );
  }

  async function postPhones(id: number, numbers: string[]): Promise<void> {
    if (!numbers || numbers.length === 0) return;

    const phonePromises = numbers.map((number) =>
      api
        .post(`/customers/${id}/phones`, { number: number, primary: true })
        .catch((err: unknown) => {
          console.error(`Failed to create phone ${number}:`, err);
          return null;
        }),
    );

    const results = await Promise.all(phonePromises);
    const failures = results.filter((r) => r === null);
    if (failures.length > 0) {
      console.warn(
        `${failures.length} phone creation(s) failed out of ${numbers.length} attempts`,
      );
    }
  }

  // Ensure selected phone becomes first on server (server returns random order sometimes)
  async function makeCorrectPhoneBeFirst(
    id: number,
    selected: string,
  ): Promise<void> {
    try {
      const phones = await getPhonesOnServer(id);
      const first = phones?.[0];
      if (!first) return;
      if ((first.number || "") === selected) return;
      const targetIndex = phones.findIndex(
        (p) => (p.number || "") === selected,
      );
      if (targetIndex === -1) return;

      const oldFirstId = first.id ?? first.phone_id;
      const targetId = phones[targetIndex].id ?? phones[targetIndex].phone_id;

      if (oldFirstId) {
        await api.del(`/customers/${id}/phones/${oldFirstId}`).catch(() => {});
      }
      if (targetId) {
        await api.del(`/customers/${id}/phones/${targetId}`).catch(() => {});
      }

      await api
        .post(`/customers/${id}/phones`, { number: selected, primary: true })
        .catch(() => {});
      await api
        .post(`/customers/${id}/phones`, {
          number: first.number ?? "",
          primary: true,
        })
        .catch(() => {});

      // Recurse until correct order is achieved (server is flaky)
      return makeCorrectPhoneBeFirst(id, selected);
    } catch {
      // swallow and return
    }
  }

  // Save existing customer (edit) or create new customer
  async function save(): Promise<void> {
    setSaving(true);
    try {
      const primaryPhone = allPhones[primaryPhoneIndex] || "";
      const sanitized = {
        firstname: form.first_name,
        lastname: form.last_name,
        business_name: form.business_name,
        mobile: sanitizePhone(primaryPhone),
        phone: "",
        email: form.email,
      };
      let data: { customer: Customer } | undefined;

      if (customerId) {
        // Edit flow
        if ((sanitized.firstname || "").replace(/\u200B/g, "").trim() === "") {
          error("Validation Error", "First name is required");
          setSaving(false);
          return;
        }
        const phoneDigits = sanitized.mobile.replace(/\D/g, "");
        if (phoneDigits.length !== 10) {
          error("Validation Error", "Phone number must be exactly 10 digits");
          setSaving(false);
          return;
        }
        if (applying) {
          setSaving(false);
          return;
        }

        setApplying(true);
        try {
          await api.put(`/customers/${customerId}`, {
            ...(storedCustomer || {}),
            ...sanitized,
          });

          const currentPhones: string[] = [];
          allPhones.forEach((p) => {
            const digits = sanitizePhone(p);
            if (digits.length === 10) currentPhones.push(digits);
          });

          const distinct = Array.from(new Set(currentPhones));
          const old = await getPhonesOnServer(customerId);
          await deletePhones(customerId, old || []);
          await postPhones(customerId, distinct);

          const primaryDigits = sanitizePhone(primaryPhone);
          await makeCorrectPhoneBeFirst(customerId, primaryDigits);

          goTo(`/$${customerId}`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          error(
            "Customer Edit Failed",
            "Failed to update customer: " + (msg || "Unknown error"),
          );
        } finally {
          setApplying(false);
          setSaving(false);
        }
        return;
      } else {
        // Create new customer
        data = (await api.post(`/customers`, { customer: sanitized })) as {
          customer: Customer;
        };
      }

      const createdCustomer = data!.customer;
      goTo(`/$${createdCustomer.id}`);
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  // Create customer then navigate to create ticket flow
  async function saveAndCreateTicket(): Promise<void> {
    setSaving(true);
    try {
      const primaryPhone = allPhones[primaryPhoneIndex] || "";
      const sanitized = {
        firstname: form.first_name,
        lastname: form.last_name,
        business_name: form.business_name,
        mobile: sanitizePhone(primaryPhone),
        phone: "",
        email: form.email,
      };

      // Validation
      if ((sanitized.firstname || "").replace(/\u200B/g, "").trim() === "") {
        error("Validation Error", "First name is required");
        setSaving(false);
        return;
      }
      const phoneDigits = sanitized.mobile.replace(/\D/g, "");
      if (phoneDigits.length !== 10) {
        error("Validation Error", "Phone number must be exactly 10 digits");
        setSaving(false);
        return;
      }

      if (customerId) {
        goTo(`/$${customerId}?newticket`);
        return;
      }

      const data = (await api.post(`/customers`, { customer: sanitized })) as {
        customer: Customer;
      };
      const createdCustomer = data.customer;
      goTo(`/$${createdCustomer.id}?newticket`);
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      error(
        "Customer Creation Failed",
        "Failed to create customer: " + (msg || "Unknown error"),
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <LoadingSpinnerWithText
        text="Loading customer data..."
        className="mx-auto max-w-2xl px-3 sm:px-6 py-3 sm:py-6 text-center"
      />
    );
  }

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
              onClick={customerId ? save : saveAndCreateTicket}
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
              tabIndex={5}
            >
              <div className="flex items-center justify-center gap-2">
                <span>
                  {saving
                    ? customerId
                      ? "Updating..."
                      : "Creating..."
                    : customerId
                      ? "Update"
                      : "Create Customer and Ticket"}
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

        {["first_name", "last_name", "business_name"].map((fieldKey) => (
          <div key={fieldKey} className="space-y-2">
            <label className="text-md font-medium capitalize">
              {fieldKey.replace("_", " ")}
            </label>
            <input
              ref={fieldKey === "first_name" ? firstNameInputRef : null}
              className="md-input text-md sm:text-base py-3 sm:py-2"
              value={form[fieldKey]}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setForm({ ...form, [fieldKey]: event.target.value })
              }
              tabIndex={fieldKey === "first_name" ? 1 : fieldKey === "last_name" ? 2 : 3}
            />
          </div>
        ))}

        <div className="space-y-2">
          <label className="text-md font-medium">
            Phone Numbers (make box empty to erase)
          </label>
          <div className="space-y-3">
            {allPhones.map((phone, index) => {
              const isPrimary = index === primaryPhoneIndex;
              return (
                <div key={index} className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setPrimaryPhone(index)}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${isPrimary ? "border-blue-500 bg-blue-500" : "border-gray-300 hover:border-gray-400"}`}
                    title={
                      isPrimary ? "Primary phone" : "Click to make primary"
                    }
                    tabIndex={-1}
                  >
                    {isPrimary && (
                      <div className="w-2 h-2 bg-white rounded-full" />
                    )}
                  </button>

                  <input
                    className="md-input flex-1 text-md sm:text-base py-3 sm:py-2"
                    value={phone}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                      const value = event.target.value;
                      setAllPhones((prev) =>
                        prev.map((p, i) =>
                          i === index ? formatPhoneLive(value) : p,
                        ),
                      );
                    }}
                    inputMode={"numeric"}
                    autoComplete={"tel"}
                    placeholder="Phone number"
                    tabIndex={4}
                  />

                  {isPrimary && (
                    <span className="text-md font-medium text-blue-600">
                      Primary
                    </span>
                  )}
                </div>
              );
            })}

            <div>
              <button
                type="button"
                className="md-btn-surface elev-1 text-md sm:text-md py-2 px-3 touch-manipulation"
                onClick={() => setAllPhones([...allPhones, ""])}
                tabIndex={-1}
              >
                + Add another phone
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-md font-medium">Email</label>
          <input
            className="md-input text-md sm:text-base py-3 sm:py-2"
            value={form.email}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setForm({ ...form, email: event.target.value })
            }
            autoComplete={"email"}
            tabIndex={-1}
          />
        </div>
      </div>
    </div>
  );
}
