import React from "react";

interface MiddleClickHandlers {
  onAuxClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

/**
 * Custom hook to handle middle-click events for navigation buttons
 * @param onNavigate - Function to call when left-clicked
 * @param targetUrl - URL to open when middle-clicked
 * @returns Event handlers for mouse events
 */
function useMiddleClick(
  onNavigate: () => void,
  targetUrl: string,
): MiddleClickHandlers {
  const handleAuxClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    // Handle middle-click (auxclick event)
    if (event.button === 1) {
      event.preventDefault();
      event.stopPropagation();

      // Open in new tab
      window.open(targetUrl, "_blank", "noopener,noreferrer");
    }
  };

  return {
    onAuxClick: handleAuxClick,
  };
}

/**
 * Navigation button component that handles both left-click and middle-click events
 * @param onClick - Function to call when left-clicked
 * @param children - Button content
 * @param className - CSS classes
 * @param targetUrl - URL to open when middle-clicked
 * @param props - Additional button props
 */
function NavigationButton({
  onClick,
  children,
  className,
  targetUrl,
  ...props
}: {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  targetUrl: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const middleClickProps = useMiddleClick(onClick, targetUrl);
  return (
    <button
      onClick={onClick}
      {...middleClickProps}
      className={className}
      {...props}
    >
      {children}
    </button>
  );
}

export default NavigationButton;
