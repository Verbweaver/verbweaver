import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'destructiveOutline' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  // asChild?: boolean; // Simplified: remove asChild for now
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', children, ...props }, ref) => {
    // Basic styling - can be expanded or replaced with Tailwind/CSS classes
    const baseStyle = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50';
    
    let variantStyle = '';
    switch (variant) {
      case 'destructive':
        variantStyle = 'bg-red-600 text-white hover:bg-red-700';
        break;
      case 'destructiveOutline':
        variantStyle = 'border border-red-600 text-red-600 hover:bg-red-50';
        break;
      case 'outline':
        variantStyle = 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50';
        break;
      case 'secondary':
        variantStyle = 'bg-gray-200 text-gray-800 hover:bg-gray-300';
        break;
      case 'ghost':
        variantStyle = 'hover:bg-gray-100 text-gray-700';
        break;
      case 'link':
        variantStyle = 'text-blue-600 underline-offset-4 hover:underline';
        break;
      default: // default variant
        variantStyle = 'bg-blue-600 text-white hover:bg-blue-700';
        break;
    }

    let sizeStyle = '';
    switch (size) {
      case 'sm':
        sizeStyle = 'h-9 px-3';
        break;
      case 'lg':
        sizeStyle = 'h-11 px-8';
        break;
      case 'icon':
        sizeStyle = 'h-10 w-10';
        break;
      default: // default size
        sizeStyle = 'h-10 px-4 py-2';
        break;
    }

    return (
      <button
        className={`${baseStyle} ${variantStyle} ${sizeStyle} ${className || ''}`.trim()}
        ref={ref}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

export { Button }; 