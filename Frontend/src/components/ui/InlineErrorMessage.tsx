import React from "react";

interface InlineErrorMessageProps {
    message: string;
    className?: string;
}

export function InlineErrorMessage({
    message,
    className,
}: InlineErrorMessageProps): React.ReactElement {
    return (
        <div className={className}>
            <div className="text-error font-medium">{message}</div>
        </div>
    );
}
