'use client';

import React from 'react';
import { cn } from '@/utils/cn';

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  center?: boolean;
}

const Container = React.forwardRef<HTMLDivElement, ContainerProps>(
  (
    {
      className,
      size = 'lg',
      padding = 'md',
      center = true,
      children,
      ...props
    },
    ref
  ) => {
    const sizes = {
      sm: 'max-w-3xl',
      md: 'max-w-4xl',
      lg: 'max-w-6xl',
      xl: 'max-w-7xl',
      full: 'max-w-none'
    };
    
    const paddings = {
      none: '',
      sm: 'px-4',
      md: 'px-6',
      lg: 'px-8',
      xl: 'px-12'
    };

    const centerStyles = center ? 'mx-auto' : '';

    return (
      <div
        className={cn(
          'w-full',
          sizes[size],
          paddings[padding],
          centerStyles,
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Container.displayName = 'Container';

export { Container };
