import React from "react";
import type { Ticket } from "../types/api";
import { formatPhone, fmtDateAndTime } from "../utils/appUtils";
import { useStoreConfig } from "../context/StoreConfigContext";

interface TicketDocumentProps {
    ticket: Ticket;
    type: "Estimate" | "Invoice" | "Receipt";
}

export const TicketDocument = React.forwardRef<HTMLDivElement, TicketDocumentProps>(
    ({ ticket, type }, ref) => {
        const { config } = useStoreConfig();
        const taxRate = config.tax_rate / 100;

        // Calculate totals
        const subtotal = (ticket.line_items || []).reduce(
            (acc: number, item: any) => acc + (parseFloat(item.price) || 0),
            0
        );
        const tax = subtotal * taxRate;
        const total = subtotal + tax;

        const phone = formatPhone(ticket.customer?.phone_numbers?.[0]?.number || "");

        return (
            <div
                ref={ref}
                className={`bg-[#ffffff] text-[#000000] relative ${type === "Receipt" ? "w-[80mm] min-h-[100mm] p-4" : "w-[8.5in] h-[11in] p-12"}`}
                style={{ fontFamily: "Inter, sans-serif" }}
            >
                {type === "Receipt" ? (
                    // RECEIPT LAYOUT (Thermal Printer)
                    <div className="flex flex-col gap-4 text-xs font-medium">
                        {/* Header */}
                        <div className="text-center border-b border-[#d1d5db] pb-4">
                            <h2 className="text-xl font-bold text-[#111827] uppercase mb-1">{config.store_name}</h2>
                            <p className="text-[#4b5563]">{config.address}</p>
                            <p className="text-[#4b5563]">{config.city}, {config.state} {config.zip}</p>
                            <p className="text-[#4b5563]">{config.phone}</p>
                            <div className="mt-2 text-[#111827]">
                                <p className="font-bold text-lg uppercase">{type}</p>
                                <p className="text-[#6b7280]">#{ticket.ticket_number}</p>
                                <p className="text-[#6b7280]">{fmtDateAndTime(new Date().toISOString())}</p>
                            </div>
                        </div>

                        {/* Customer Info */}
                        <div className="border-b border-[#d1d5db] pb-4">
                            <p className="font-bold text-[#111827] text-sm">{ticket.customer?.full_name}</p>
                            <p className="text-[#4b5563]">{phone}</p>
                            <p className="text-[#4b5563]">{ticket.customer?.email}</p>
                            <p className="mt-2"><span className="font-bold">Device:</span> {ticket.device}</p>
                        </div>

                        {/* Line Items */}
                        <div className="border-b border-[#d1d5db] pb-4">
                            <div className="flex justify-between font-bold text-[#111827] mb-2 border-b border-[#1f2937] pb-1">
                                <span>Item</span>
                                <span>Amt</span>
                            </div>
                            {(ticket.line_items || []).map((item: any, index: number) => (
                                <div key={index} className="flex justify-between py-1">
                                    <span className="truncate pr-2">{item.subject}</span>
                                    <span>${(parseFloat(item.price) || 0).toFixed(2)}</span>
                                </div>
                            ))}
                            {(ticket.line_items || []).length === 0 && (
                                <p className="italic text-[#6b7280] text-center py-2">No items</p>
                            )}
                        </div>

                        {/* Totals */}
                        <div className="flex flex-col items-end gap-1 pb-4 border-b border-[#d1d5db]">
                            <div className="flex justify-between w-full text-[#4b5563]">
                                <span>Subtotal</span>
                                <span>${subtotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between w-full text-[#4b5563]">
                                <span>Tax ({config.tax_rate}%)</span>
                                <span>${tax.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between w-full text-[#111827] font-bold text-base mt-2">
                                <span>Total</span>
                                <span>${total.toFixed(2)}</span>
                            </div>
                        </div>

                        {/* Disclaimer */}
                        <div className="text-center text-[10px] text-[#6b7280] leading-tight">
                            <p className="font-bold uppercase mb-1">Thank You!</p>
                            <p>{config.disclaimer}</p>
                        </div>
                    </div>
                ) : (
                    // STANDARD LAYOUT (Letter)
                    <>
                        {/* Header */}
                        <div className="flex justify-between items-start mb-8 border-b pb-6 border-[#d1d5db]">
                            <div>
                                <h1 className="text-4xl font-bold text-[#111827] mb-2 uppercase tracking-wide">
                                    {type}
                                </h1>
                                <p className="text-[#6b7280] font-medium text-sm">#{ticket.ticket_number}</p>
                            </div>
                            <div className="text-right text-[#4b5563] text-sm leading-relaxed">
                                <h2 className="text-xl font-bold text-[#111827] mb-1">{config.store_name}</h2>
                                <p>{config.address}</p>
                                <p>{config.city}, {config.state} {config.zip}</p>
                                <p>{config.phone}</p>
                                <p>{config.email}</p>
                            </div>
                        </div>

                        {/* Customer & Ticket Info */}
                        <div className="grid grid-cols-2 gap-8 mb-10">
                            <div>
                                <h3 className="text-[#6b7280] uppercase text-xs font-bold tracking-wider mb-2">
                                    Bill To
                                </h3>
                                <div className="text-[#111827] font-medium">
                                    <p className="text-lg font-bold">{ticket.customer?.full_name}</p>
                                    <p>{phone}</p>
                                    <p>{ticket.customer?.email}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="mb-4">
                                    <h3 className="text-[#6b7280] uppercase text-xs font-bold tracking-wider mb-1">
                                        Date
                                    </h3>
                                    <p className="text-[#111827] font-medium">{fmtDateAndTime(new Date().toISOString())}</p>
                                </div>
                                <div>
                                    <h3 className="text-[#6b7280] uppercase text-xs font-bold tracking-wider mb-1">
                                        Device
                                    </h3>
                                    <p className="text-[#111827] font-medium">{ticket.device}</p>
                                </div>
                            </div>
                        </div>

                        {/* Line Items Table */}
                        <div className="mb-8">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b-2 border-[#1f2937]">
                                        <th className="py-3 text-[#111827] font-bold uppercase text-xs tracking-wider w-3/4">
                                            Description
                                        </th>
                                        <th className="py-3 text-[#111827] font-bold uppercase text-xs tracking-wider text-right w-1/4">
                                            Amount
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="text-[#374151] text-sm">
                                    {(ticket.line_items || []).map((item: any, index: number) => (
                                        <tr key={index} className="border-b border-[#e5e7eb]">
                                            <td className="py-4 font-medium">{item.subject}</td>
                                            <td className="py-4 text-right">${(parseFloat(item.price) || 0).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                    {(ticket.line_items || []).length === 0 && (
                                        <tr className="border-b border-[#e5e7eb]">
                                            <td className="py-4 font-medium italic text-[#6b7280]">No line items added.</td>
                                            <td className="py-4 text-right text-[#6b7280]">-</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Totals */}
                        <div className="flex justify-end mb-16">
                            <div className="w-1/2 space-y-3">
                                <div className="flex justify-between text-[#4b5563] text-sm">
                                    <span>Subtotal</span>
                                    <span className="font-medium">${subtotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-[#4b5563] text-sm border-b border-[#d1d5db] pb-3">
                                    <span>Tax ({config.tax_rate}%)</span>
                                    <span className="font-medium">${tax.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-[#111827] text-xl font-bold pt-2">
                                    <span>Total</span>
                                    <span>${total.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Footer / Disclaimer */}
                        <div className="absolute bottom-12 left-12 right-12 text-center text-[#6b7280] text-xs leading-relaxed border-t pt-6">
                            <p className="mb-2 font-bold uppercase tracking-wider">Thank you for your business!</p>
                            <p>
                                {config.disclaimer}
                                {type === "Estimate" && " This is an estimate only and prices are subject to change upon further diagnosis."}
                            </p>
                        </div>
                    </>
                )}
            </div>
        );
    }
);

TicketDocument.displayName = "TicketDocument";

