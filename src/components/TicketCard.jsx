import React, { useEffect, useRef } from 'react';

/**
 * TicketCard component template for creating printable ticket to stick to the device
 * Must be kept the same to have the same look and feel as the previously used website's ticket card
 */
// Function to count the number of lines in an element
function NumberOfLines(element) {
    if (!element) return 0;
    const lineHeight = parseFloat(window.getComputedStyle(element).lineHeight);
    const height = element.offsetHeight;
    return Math.round(height / lineHeight);
}

export function TicketCard({
    password = "",
    ticketNumber = "",
    subject = "",
    itemsLeft = "",
    name = "",
    creationDate = "",
    phoneNumber = ""
}) {
    const subjectRef = useRef(null);

    // Effect to adjust font size if subject text exceeds 3 lines
    useEffect(() => {
        const subjectElement = subjectRef.current;
        if (subjectElement) {
            // Reset font size to default
            subjectElement.style.fontSize = '10.35pt';
            
            // Check if text exceeds 3 lines and reduce font size if needed
            while (NumberOfLines(subjectElement) > 3) {
                const updatedFontSize = parseFloat(subjectElement.style.fontSize) - 0.1;
                console.log("Lines: ", NumberOfLines(subjectElement), "UpdatedFontSize: ", updatedFontSize);
                subjectElement.style.fontSize = updatedFontSize + "pt";
                
                // Prevent infinite loop by setting a minimum font size
                if (updatedFontSize < 6) {
                    break;
                }
            }
        }
    }, [subject]); // Re-run when subject changes
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
            <p ref={subjectRef} style={{ position: "absolute", width: "294px" }}>
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