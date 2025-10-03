import React from 'react';

/**
 * LoadingSpinner component for displaying loading states
 */
export function LoadingSpinner({ size = 'md', className = '' }) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16'
  };

  return (
    <div className={`animate-spin rounded-full border-b-2 ${sizeClasses[size]} ${className}`} 
         style={{ borderColor: 'var(--md-sys-color-primary)' }}>
    </div>
  );
}

/**
 * LoadingSpinner with text
 */
export function LoadingSpinnerWithText({ text = 'Loading...', size = 'md', className = '' }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <LoadingSpinner size={size} className="mr-2" />
      <span className="text-md" style={{ color: 'var(--md-sys-color-on-surface)' }}>
        {text}
      </span>
    </div>
  );
}
