import React from 'react';

/**
 * TicketCard component template for creating printable ticket to stick to the device
 * Must be kept the same to have the same look and feel as the previously used website's ticket card
 */
export function TicketCard({
    password = "",
    ticketNumber = "",
    subject = "",
    itemsLeft = "",
    name = "",
    creationDate = "",
    phoneNumber = ""
}) {
    return (
        <div
            id="result"
            style={{
                color: "black",
                paddingLeft: "20px",
                width: "323px",
                paddingTop: "6px",
                paddingBottom: "6px",
                transformOrigin: "top",
                fontFamily: "ff2",
                fontStyle: "normal",
                fontWeight: 500,
                fontSize: "10.35pt",
                margin: "0pt",
                lineHeight: "12pt",
            }}
        >
            {/* Row 1: password + ticket number */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    whiteSpace: "nowrap",
                    alignItems: "center",
                }}
            >
                <p style={{ fontSize: "7.5pt" }} >
                    {password}
                </p>
                <p style={{ textAlign: "right", fontWeight: 950, paddingRight: "17pt" }}>
                    # {ticketNumber}
                </p>
            </div>

            {/* Subject */}
            <p style={{ position: "absolute", width: "294px" }}>
                {subject}
            </p>

            {/* Row 2: items left + name */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    whiteSpace: "nowrap",
                    alignItems: "baseline",
                }}
            >
                <p style={{ fontSize: "7.5pt", lineHeight: "1px" }}>
                    {itemsLeft}
                </p>
                <p style={{ textAlign: "right", paddingTop: "51px", lineHeight: "7px", paddingRight: "17pt" }}>
                    {name}
                </p>
            </div>

            {/* Row 3: creation date + phone */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    whiteSpace: "nowrap",
                    alignItems: "baseline",
                }}
            >
                <p style={{ fontSize: "7.5pt" }}>
                    {creationDate}
                </p>
                <p style={{ textAlign: "right", paddingRight: "17pt" }}>
                    {phoneNumber}
                </p>
            </div>
        </div>
    );
}