import React, { useEffect, useRef } from "react";

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
  phoneNumber = "",
}: {
  password?: string;
  ticketNumber?: string | number;
  subject?: string;
  itemsLeft?: string;
  name?: string;
  creationDate?: string;
  phoneNumber?: string;
}) {
  const subjectRef = useRef(null);

  // Effect to adjust font size if subject text exceeds 3 lines
  useEffect(() => {
    const subjectElement = subjectRef.current;
    if (subjectElement) {
      // Reset font size to default
      subjectElement.style.fontSize = "10.35pt";

      // Check if text exceeds 3 lines and reduce font size if needed
      while (NumberOfLines(subjectElement) > 3) {
        const updatedFontSize = parseFloat(subjectElement.style.fontSize) - 0.1;
        console.log(
          "Lines: ",
          NumberOfLines(subjectElement),
          "UpdatedFontSize: ",
          updatedFontSize,
        );
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
      className="text-black pl-[20px] w-[323px] pt-[6px] pb-[7px] origin-top"
      style={{
        fontFamily: "ff2",
        fontStyle: "normal",
        fontWeight: 500,
        fontSize: "10.35pt",
        margin: "0pt",
        lineHeight: "12pt",
      }}
    >
      {/* Row 1: password + ticket number */}
      <div className="flex justify-between items-center whitespace-nowrap">
        <p className="text-[7.5pt]">{password}</p>
        <p className="text-right font-black pr-[17pt]"># {ticketNumber}</p>
      </div>

      {/* Subject */}
      <p ref={subjectRef} className="absolute w-[294px]">
        {subject}
      </p>

      {/* Row 2: items left + name */}
      <div className="flex justify-between items-baseline whitespace-nowrap">
        <p className="text-[7.5pt] leading-[1px]">{itemsLeft}</p>
        <p className="text-right pt-[51px] leading-[7px] pr-[17pt]">{name}</p>
      </div>

      {/* Row 3: creation date + phone */}
      <div className="flex justify-between items-baseline whitespace-nowrap">
        <p className="text-[7.5pt]">{creationDate}</p>
        <p className="text-right pr-[17pt]">{phoneNumber}</p>
      </div>
    </div>
  );
}
