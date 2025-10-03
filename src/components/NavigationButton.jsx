import React, { useCallback } from "react";

/**
 * Custom hook to handle middle-click events for navigation buttons
 * @param {Function} onNavigate - Function to call when left-clicked
 * @param {string} targetUrl - URL to open when middle-clicked
 * @returns {Object} - Event handlers for mouse events
 */
function useMiddleClick(onNavigate, targetUrl) {
    const handleAuxClick = useCallback((event) => {
        // Handle middle-click (auxclick event)
        if (event.button === 1) {
            event.preventDefault();
            event.stopPropagation();
            
            // Open in new tab
            window.open(targetUrl, '_blank', 'noopener,noreferrer');
        }
    }, [targetUrl]);

    return {
        onAuxClick: handleAuxClick
    };
}

/**
 * Navigation button component that handles both left-click and middle-click events
 * @param {Function} onClick - Function to call when left-clicked
 * @param {React.ReactNode} children - Button content
 * @param {string} className - CSS classes
 * @param {string} targetUrl - URL to open when middle-clicked
 * @param {Object} props - Additional button props
 */
function NavigationButton({ onClick, children, className, targetUrl, ...props }) {
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
