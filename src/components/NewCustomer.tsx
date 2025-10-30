import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useApi } from "../hooks/useApi";
import { useAlertMethods } from "./ui/AlertSystem";
import { useChangeDetection } from "../hooks/useChangeDetection";
import { useHotkeys } from "../hooks/useHotkeys";
import { LoadingSpinnerWithText } from "./ui/LoadingSpinner";
import type { Customer, Phone } from "../types/api";

function NewCustomer({
  goTo,
  customerId,
  showSearch,
}: {
  goTo: (to: string) => void;
  customerId?: number;
  showSearch: boolean;
}) {
  const api = useApi();
  const { error, dataChanged } = useAlertMethods();
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    business_name: "",
    phone: "",
    email: "",
  });
  const [allPhones, setAllPhones] = useState([""]); // All phone numbers in a single array
  const [primaryPhoneIndex, setPrimaryPhoneIndex] = useState(0); // Track which phone is primary
  const [applying, setApplying] = useState(false);
  const [storedCustomer, setStoredCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(!!customerId); // Show loading when editing existing customer

  // Change detection (only when editing existing customer)
  const { hasChanged, isPolling, startPolling, stopPolling, resetPolling } =
    useChangeDetection(api, customerId ? `/customers/${customerId}` : null);

  useEffect(() => {
    try {
      if (customerId) return;

      // Only prefill if not editing an existing customer
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
    } catch (e) {
      console.error("Failed to parse URL params:", e);
    }
  }, [customerId]);

  // Keybinds
  useHotkeys(
    {
      h: () => goTo("/"),
      s: () => {
        // Trigger search modal from parent
        const searchEvent = new CustomEvent("openSearch");
        window.dispatchEvent(searchEvent);
      },
      c: () => {
        // Cancel functionality - go back to customer if editing, otherwise go to home
        if (customerId) {
          goTo(`/$${customerId}`);
        } else {
          goTo("/");
        }
      },
    },
    showSearch,
  );

  const formatPhoneLive = (value) => {
    const digits = (value || "").replace(/\D/g, "");
    const areaCode = digits.slice(0, 3);
    const exchange = digits.slice(3, 6);
    const number = digits.slice(6, 10);
    if (digits.length <= 3) return areaCode;
    if (digits.length <= 6) return `${areaCode}-${exchange}`;
    return `${areaCode}-${exchange}-${number}`;
  };
  const sanitizePhone = (value) => (value || "").replace(/\D/g, "");

  // Helper to set primary phone without reordering the list
  const setPrimaryPhone = (index) => {
    if (index < 0 || index >= allPhones.length) return;

    // Update which index is marked as primary (for visual indication only)
    setPrimaryPhoneIndex(index);
  };

  // Load existing customer data if editing
  useEffect(() => {
    if (!customerId) return;

    // Immediately show loading state when customerId changes
    setLoading(true);

    let isMounted = true;
    (async () => {
      try {
        const data = (await api.get(`/customers/${customerId}`)) as {
          customer: Customer;
        };
        if (!isMounted) return;
        const customer = data.customer;
        setStoredCustomer(customer); // Store the customer data

        // Start change detection polling
        startPolling(customer);

        setForm({
          first_name: customer.firstname || "",
          last_name: customer.lastname || "",
          business_name: customer.business_name || "",
          phone: "", // We'll set this after loading phones
          email: customer.email || "",
        });

        // Load all phones
        try {
          const phoneData = (await api.get(
            `/customers/${customerId}/phones`,
          )) as { phones: Phone[] };
          if (!isMounted) return;
          const phoneArray = phoneData.phones || [];
          const numbers = phoneArray
            .map((phone) => phone?.number || "")
            .filter(Boolean);

          if (numbers.length > 0) {
            // Format all phone numbers
            const formattedNumbers = numbers.map((number) =>
              formatPhoneLive(number),
            );
            setAllPhones(formattedNumbers);
            setPrimaryPhoneIndex(0); // First phone is primary by default
            // Set the first phone as the primary in the form for saving
            setForm((previous) => ({
              ...previous,
              phone: formattedNumbers[0],
            }));
          } else {
            // Fallback to mobile/phone if no phones endpoint
            const basePhone =
              customer.mobile && String(customer.mobile).trim()
                ? customer.mobile
                : customer.phone || "";
            const formattedPhone = formatPhoneLive(basePhone || "");
            setAllPhones([formattedPhone]);
            setPrimaryPhoneIndex(0);
            setForm((previous) => ({ ...previous, phone: formattedPhone }));
          }
        } catch {
          if (!isMounted) return;
          // Fallback to mobile/phone if phones endpoint fails
          const basePhone =
            customer.mobile && String(customer.mobile).trim()
              ? customer.mobile
              : customer.phone || "";
          const formattedPhone = formatPhoneLive(basePhone || "");
          setAllPhones([formattedPhone]);
          setPrimaryPhoneIndex(0);
          setForm((previous) => ({ ...previous, phone: formattedPhone }));
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [customerId]);

  // Cleanup polling when component unmounts or customerId changes
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [customerId, stopPolling]);

  // Show warning when changes are detected
  useEffect(() => {
    if (hasChanged && customerId) {
      dataChanged(
        "Customer Data Changed",
        "The customer has been modified by someone else. Any unsaved changes may be lost if you continue editing.",
      );
    }
  }, [hasChanged, customerId]);

  const [saving, setSaving] = useState(false);

  // Helpers for phone syncing and reordering
  async function getPhonesOnServer(id: number) {
    const phoneData = (await api.get(`/customers/${id}/phones`)) as {
      phones: Phone[];
    };
    const phoneArray = phoneData.phones || [];
    return phoneArray;
  }
  async function deletePhones(id: number, phones: Phone[]) {
    if (!phones || phones.length === 0) return;
    await Promise.all(
      phones.map((phone) => {
        const phoneId = phone?.id ?? phone?.phone_id;
        if (!phoneId) return Promise.resolve();
        return api.del(`/customers/${id}/phones/${phoneId}`).catch(() => {});
      }),
    );
  }
  async function postPhones(id: number, numbers: string[]) {
    if (!numbers || numbers.length === 0) return;

    // Create all phone creation promises in parallel
    const phonePromises = numbers.map((number) =>
      api
        .post(`/customers/${id}/phones`, { number: number, primary: true })
        .catch((error) => {
          console.error(`Failed to create phone ${number}:`, error);
          return null; // Return null for failed requests
        }),
    );

    // Execute all phone creation requests in parallel
    const results = await Promise.all(phonePromises);

    // Log any failures for debugging
    const failures = results.filter((result) => result === null);
    if (failures.length > 0) {
      console.warn(
        `${failures.length} phone creation(s) failed out of ${numbers.length} attempts`,
      );
    }
  }

  // for some reason the server picks the order completely randomly. This keeps putting the phones until the selected one to be first is first
  async function makeCorrectPhoneBeFirst(id: number, selected: string) {
    try {
      const phones = await getPhonesOnServer(id);
      const first = phones?.[0];
      if (!first) return; // nothing to order
      if ((first.number || "") === selected) return; // already first
      const targetIndex = phones.findIndex(
        (phone) => (phone.number || "") === selected,
      );
      if (targetIndex === -1) return; // target not present
      // Delete current first and target, then post target then old first, then recurse
      const oldFirstId = first.id;
      const targetId = phones[targetIndex].id;
      await api.del(`/customers/${id}/phones/${oldFirstId}`).catch(() => {});
      await api.del(`/customers/${id}/phones/${targetId}`).catch(() => {});
      await api
        .post(`/customers/${id}/phones`, { number: selected, primary: true })
        .catch(() => {});
      await api
        .post(`/customers/${id}/phones`, {
          number: first.number,
          primary: true,
        })
        .catch(() => {});
      // Re-check until selected is first
      return makeCorrectPhoneBeFirst(id, selected);
    } catch {
      // swallow and return
    }
  }

  async function save() {
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
      let data;
      if (customerId) {
        // Edit flow with phone reordering
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
          // Send the full customer object with updated fields
          await api.put(`/customers/${customerId}`, {
            ...storedCustomer,
            ...sanitized,
          });

          const currentPhones = [];
          allPhones.forEach((phone) => {
            const digits = sanitizePhone(phone);
            if (digits.length === 10) currentPhones.push(digits);
          });
          // Distinct
          const distinct = Array.from(new Set(currentPhones));
          // Delete old phones and post new ones
          const old = await getPhonesOnServer(customerId);
          await deletePhones(customerId, old || []);
          await postPhones(customerId, distinct);
          // Reorder to make primary phone first
          const primaryDigits = sanitizePhone(primaryPhone);
          await makeCorrectPhoneBeFirst(customerId, primaryDigits);
          // Navigate to view
          goTo(`/$${customerId}`);
        } catch (err) {
          error(
            "Customer Edit Failed",
            "Failed to update customer: " + (err?.message || "Unknown error"),
          );
        } finally {
          setApplying(false);
          setSaving(false);
        }
        return;
      } else {
        data = (await api.post(`/customers`, {
          customer: sanitized,
        })) as { customer: Customer };
      }
      const customer = data.customer;
      goTo(`/$${customer.id}`);
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  }

  async function saveAndCreateTicket() {
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

      // Validation for new customers
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
        // For editing existing customer, just navigate to new ticket
        goTo(`/$${customerId}?newticket`);
        return;
      }

      // Create new customer and navigate to new ticket page
      const data = (await api.post(`/customers`, {
        customer: sanitized,
      })) as { customer: Customer };
      const customer = data.customer;
      goTo(`/$${customer.id}?newticket`);
    } catch (error) {
      console.error(error);
      error(
        "Customer Creation Failed",
        "Failed to create customer: " + (error?.message || "Unknown error"),
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <LoadingSpinnerWithText
        text="Loading customer data..."
        className="mx-auto max-w-2xl px-3 sm:px-6 py-3 sm:py-6 text-center"
      />
    );

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
              tabIndex={0}
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
        {["first_name", "last_name", "business_name"].map((fieldKey) => (
          <div key={fieldKey} className="space-y-2">
            <label className="text-md font-medium capitalize">
              {fieldKey.replace("_", " ")}
            </label>
            <input
              className="md-input text-md sm:text-base py-3 sm:py-2"
              value={form[fieldKey]}
              onChange={(event) =>
                setForm({ ...form, [fieldKey]: event.target.value })
              }
              tabIndex={1}
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
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                      isPrimary
                        ? "border-blue-500 bg-blue-500"
                        : "border-gray-300 hover:border-gray-400"
                    }`}
                    title={
                      isPrimary ? "Primary phone" : "Click to make primary"
                    }
                    tabIndex={-1}
                  >
                    {isPrimary && (
                      <div className="w-2 h-2 bg-white rounded-full"></div>
                    )}
                  </button>
                  <input
                    className="md-input flex-1 text-md sm:text-base py-3 sm:py-2"
                    value={phone}
                    onChange={(event) => {
                      const value = event.target.value;
                      // Update the phone in the allPhones array
                      setAllPhones((prev) =>
                        prev.map((p, i) =>
                          i === index ? formatPhoneLive(value) : p,
                        ),
                      );
                    }}
                    inputMode={"numeric"}
                    autoComplete={"tel"}
                    placeholder="Phone number"
                    tabIndex={1}
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
            onChange={(event) =>
              setForm({ ...form, email: event.target.value })
            }
            autoComplete={"email"}
            tabIndex={1}
          />
        </div>
      </div>
    </div>
  );
}

export default NewCustomer;
