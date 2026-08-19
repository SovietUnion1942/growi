'use client';

import type React from 'react';
import { type ComponentProps, memo } from 'react';
import { Streamdown } from 'streamdown';

import { cn } from '~/utils/shadcn-ui';

type ResponseProps = ComponentProps<typeof Streamdown>;

export const Response: React.NamedExoticComponent<ResponseProps> = memo(
  ({ className, mode = 'static', ...props }: ResponseProps): JSX.Element => (
    <Streamdown
      className={cn(
        'tw:size-full tw:[&>*:first-child]:mt-0 tw:[&>*:last-child]:mb-0',
        className,
      )}
      mode={mode}
      {...props}
    />
  ),
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.mode === nextProps.mode,
);

Response.displayName = 'Response';
