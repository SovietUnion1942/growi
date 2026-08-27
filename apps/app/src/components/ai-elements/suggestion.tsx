'use client';

import type { ComponentProps } from 'react';

import { Button } from '~/components/ui/button';
import { cn } from '~/utils/shadcn-ui';

export type SuggestionsProps = ComponentProps<'div'>;

export const Suggestions = ({
  className,
  children,
  ...props
}: SuggestionsProps): JSX.Element => (
  <div className={cn('tw:flex tw:flex-wrap tw:gap-2', className)} {...props}>
    {children}
  </div>
);

export type SuggestionProps = Omit<ComponentProps<typeof Button>, 'onClick'> & {
  suggestion: string;
  onClick?: (suggestion: string) => void;
};

export const Suggestion = ({
  suggestion,
  onClick,
  className,
  variant = 'outline',
  size = 'sm',
  children,
  ...props
}: SuggestionProps): JSX.Element => (
  <Button
    className={cn('tw:rounded-full tw:whitespace-nowrap', className)}
    size={size}
    type="button"
    variant={variant}
    onClick={() => onClick?.(suggestion)}
    {...props}
  >
    {children ?? suggestion}
  </Button>
);
