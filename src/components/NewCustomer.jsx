import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { formatPhone } from '../utils/appUtils.jsx';
import { useApi } from '../hooks/useApi';
import { useAlertMethods } from './AlertSystem';
import { useChangeDetection } from '../hooks/useChangeDetection';
import { useHotkeys } from '../hooks/useHotkeys';

function NewCustomer({ goTo, customerId }) {
    const api = useApi();
    const { error, dataChanged } = useAlertMethods();
    const [form, setForm] = useState({ first_name: "", last_name: "", business_name: "", phone: "", email: "" });
    const [allPhones, setAllPhones] = useState([""]); // All phone numbers in a single array
    const [primaryPhoneIndex, setPrimaryPhoneIndex] = useState(0); // Track which phone is primary
    const [applying, setApplying] = useState(false);
    const [storedCustomer, setStoredCustomer] = useState(null);
    
    // Change detection (only when editing existing customer)
    const { hasChanged, isPolling, startPolling, stopPolling, resetPolling } = useChangeDetection(api, customerId ? `/customers/${customerId}` : null);
    
    // Keybinds from Unity NewCustomerManager
    useHotkeys({
        "h": () => goTo("/"),
        "s": () => {
            // Trigger search modal from parent
            const searchEvent = new CustomEvent('openSearch');
            window.dispatchEvent(searchEvent);
        },
        "c": () => {
            if (customerId) goTo(`/$${customerId}`);
        }
    });
    
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
        (async () => {
            try {
                const data = await api.get(`/customers/${customerId}`);
                const customer = data.customer || data;
                setStoredCustomer(customer); // Store the customer data
                
                // Start change detection polling
                startPolling(customer);
                
                setForm({
                    first_name: customer.firstname || customer.first_name || "",
                    last_name: customer.lastname || customer.last_name || "",
                    business_name: customer.business_name || customer.business || "",
                    phone: "", // We'll set this after loading phones
                    email: customer.email || "",
                });
                
                // Load all phones
                try {
                    const phoneData = await api.get(`/customers/${customerId}/phones`);
                    const phoneArray = (phoneData && (phoneData.phones || phoneData)) || [];
                    const numbers = Array.isArray(phoneArray) ? phoneArray.map(phone => phone?.number || phone).filter(Boolean) : [];
                    
                    if (numbers.length > 0) {
                        // Format all phone numbers
                        const formattedNumbers = numbers.map(number => formatPhoneLive(number));
                        setAllPhones(formattedNumbers);
                        setPrimaryPhoneIndex(0); // First phone is primary by default
                        // Set the first phone as the primary in the form for saving
                        setForm(previous => ({ ...previous, phone: formattedNumbers[0] }));
                    } else {
                        // Fallback to mobile/phone if no phones endpoint
                        const basePhone = (customer.mobile && String(customer.mobile).trim()) ? customer.mobile : (customer.phone || "");
                        const formattedPhone = formatPhoneLive(basePhone || "");
                        setAllPhones([formattedPhone]);
                        setPrimaryPhoneIndex(0);
                        setForm(previous => ({ ...previous, phone: formattedPhone }));
                    }
                } catch { 
                    // Fallback to mobile/phone if phones endpoint fails
                    const basePhone = (customer.mobile && String(customer.mobile).trim()) ? customer.mobile : (customer.phone || "");
                    const formattedPhone = formatPhoneLive(basePhone || "");
                    setAllPhones([formattedPhone]);
                    setPrimaryPhoneIndex(0);
                    setForm(previous => ({ ...previous, phone: formattedPhone }));
                }
            } catch (e) { console.error(e); }
        })();
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
            dataChanged("Customer Data Changed", "The customer has been modified by someone else. Any unsaved changes may be lost if you continue editing.");
        }
    }, [hasChanged, customerId]);
    
    const [saving, setSaving] = useState(false);

    // Helpers for phone syncing and reordering
    async function getPhonesOnServer(id) {
        const phoneData = await api.get(`/customers/${id}/phones`);
        const phoneArray = (phoneData && (phoneData.phones || phoneData)) || [];
        return Array.isArray(phoneArray) ? phoneArray : [];
    }
    async function deletePhones(id, phones) {
        if (!phones || phones.length === 0) return;
        await Promise.all(
            phones.map(phone => {
                const phoneId = phone?.id ?? phone?.phone_id;
                if (!phoneId) return Promise.resolve();
                return api.del(`/customers/${id}/phones/${phoneId}`).catch(() => {});
            })
        );
    }
    async function postPhones(id, numbers) {
        if (!numbers || numbers.length === 0) return;
        for (const number of numbers) {
            try {
                await api.post(`/customers/${id}/phones`, { number: number, primary: true });
            } catch (error) { /* best-effort; continue */ }
        }
    }

    // for some reason the server picks the order completely randomly. This keeps putting the phones until the selected one to be first is first
    async function makeCorrectPhoneBeFirst(id, selected) {
        try {
            const phones = await getPhonesOnServer(id);
            const first = phones?.[0];
            if (!first) return; // nothing to order
            if ((first.number || "") === selected) return; // already first
            const targetIndex = phones.findIndex(phone => (phone.number || "") === selected);
            if (targetIndex === -1) return; // target not present
            // Delete current first and target, then post target then old first, then recurse
            const oldFirstId = first.id;
            const targetId = phones[targetIndex].id;
            await api.del(`/customers/${id}/phones/${oldFirstId}`).catch(() => {});
            await api.del(`/customers/${id}/phones/${targetId}`).catch(() => {});
            await api.post(`/customers/${id}/phones`, { number: selected, primary: true }).catch(() => {});
            await api.post(`/customers/${id}/phones`, { number: first.number, primary: true }).catch(() => {});
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
                email: form.email
            };
            let data;
            if (customerId) {
                // Edit flow with phone reordering
                if ((sanitized.firstname || "").replace(/\u200B/g, "").trim() === "") {
                    error("Validation Error", "You may have not entered the first name");
                    setSaving(false);
                    return;
                }
                if ((sanitized.mobile || "").length !== 10) {
                    error("Validation Error", "You may have typed the phone number wrong");
                    setSaving(false);
                    return;
                }
                if (applying) { setSaving(false); return; }
                setApplying(true);
                try {
                    // Send the full customer object with updated fields
                    await api.put(`/customers/${customerId}`, { ...storedCustomer, ...sanitized });

                    const currentPhones = [];
                    allPhones.forEach(phone => {
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
                } catch (error) {
                    error("Customer Edit Failed", "Customer not edited because: " + (error?.message || error));
                } finally {
                    setApplying(false);
                    setSaving(false);
                }
                return;
            } else {
                data = await api.post(`/customers`, { customer: sanitized });
            }
            const customer = data.customer || data;
            goTo(`/$${customer.id}`);
        } catch (error) { console.error(error); } finally { setSaving(false); }
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
                email: form.email
            };
            
            if (customerId) {
                // For editing existing customer, just navigate to new ticket
                goTo(`/$${customerId}?newticket`);
                return;
            }
            
            // Create new customer and navigate to new ticket page
            const data = await api.post(`/customers`, { customer: sanitized });
            const customer = data.customer || data;
            goTo(`/$${customer.id}?newticket`);
        } catch (error) { 
            console.error(error);
            error("Customer Creation Failed", "Customer not created because: " + (error?.message || error));
        } finally { 
            setSaving(false); 
        }
    }
    
    return (
        <div className="mx-auto max-w-2xl px-3 sm:px-6 py-3 sm:py-6">
            <div className="md-card p-3 sm:p-8 space-y-4 sm:space-y-6">
                <div className="text-xl sm:text-2xl font-bold text-primary">
                    {customerId ? "Edit Customer" : "New Customer"}
                </div>
                {["first_name", "last_name", "business_name"].map(fieldKey => (
                    <div key={fieldKey} className="space-y-2">
                        <label className="text-md font-medium capitalize">{fieldKey.replace('_', ' ')}</label>
                        <input
                            className="md-input text-md sm:text-base py-3 sm:py-2"
                            value={form[fieldKey]}
                            onChange={event => setForm({ ...form, [fieldKey]: event.target.value })}
                        />
                    </div>
                ))}
                <div className="space-y-2">
                    <label className="text-md font-medium">Phone Numbers (make box empty to erase)</label>
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
                                                ? 'border-blue-500 bg-blue-500' 
                                                : 'border-gray-300 hover:border-gray-400'
                                        }`}
                                        title={isPrimary ? "Primary phone" : "Click to make primary"}
                                    >
                                        {isPrimary && (
                                            <div className="w-2 h-2 bg-white rounded-full"></div>
                                        )}
                                    </button>
                                    <input
                                        className="md-input flex-1 text-md sm:text-base py-3 sm:py-2"
                                        value={phone}
                                        onChange={event => {
                                            const value = event.target.value;
                                            // Update the phone in the allPhones array
                                            setAllPhones(prev => 
                                                prev.map((p, i) => i === index ? formatPhoneLive(value) : p)
                                            );
                                        }}
                                        inputMode={'numeric'}
                                        autoComplete={'tel'}
                                        placeholder="Phone number"
                                    />
                                    {isPrimary && (
                                        <span className="text-md font-medium text-blue-600">Primary</span>
                                    )}
                                </div>
                            );
                        })}
                        <div>
                            <button
                                type="button"
                                className="md-btn-surface elev-1 text-md sm:text-md py-2 px-3 touch-manipulation"
                                onClick={() => setAllPhones([...allPhones, ""]) }
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
                        onChange={event => setForm({ ...form, email: event.target.value })}
                        autoComplete={'email'}
                    />
                </div>
                <div className="flex flex-col sm:flex-row justify-between items-end gap-2 sm:gap-3 pt-4">
                    <button
                        onClick={() => goTo(customerId ? `/$${customerId}` : '/')}
                        className="md-btn-surface elev-1 py-3 sm:py-2 text-md sm:text-base touch-manipulation"
                        disabled={saving || applying}
                    >
                        Cancel
                    </button>
                    <div className="flex flex-col gap-2 sm:gap-3">
                        {!customerId && (
                            <motion.button
                                onClick={save}
                                disabled={saving || applying}
                                className="md-btn-surface elev-1 disabled:opacity-80 relative overflow-hidden py-3 sm:py-2 touch-manipulation"
                                whileTap={{ scale: (saving || applying) ? 1 : 0.95 }}
                                transition={{ duration: 0.15 }}
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <span>{saving ? (customerId ? "Updating..." : "Creating...") : (customerId ? "Update" : "Create")}</span>
                                    {(saving || applying) && (
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
                                {(saving || applying) && (
                                    <motion.div
                                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                                        initial={{ x: '-100%' }}
                                        animate={{ x: '100%' }}
                                        transition={{
                                            duration: 1.5,
                                            repeat: Infinity,
                                            ease: "linear"
                                        }}
                                    />
                                )}
                            </motion.button>
                        )}
                        <motion.button
                            onClick={saveAndCreateTicket}
                            disabled={saving || applying}
                            className="md-btn-primary elev-1 disabled:opacity-80 relative overflow-hidden py-3 sm:py-2 touch-manipulation"
                            whileTap={{ scale: (saving || applying) ? 1 : 0.95 }}
                            transition={{ duration: 0.15 }}
                        >
                            <div className="flex items-center justify-center gap-2">
                                <span>{saving ? "Creating..." : "Create Customer and Ticket"}</span>
                                {(saving || applying) && (
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
                            {(saving || applying) && (
                                <motion.div
                                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                                    initial={{ x: '-100%' }}
                                    animate={{ x: '100%' }}
                                    transition={{
                                        duration: 1.5,
                                        repeat: Infinity,
                                        ease: "linear"
                                    }}
                                />
                            )}
                        </motion.button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default NewCustomer;
