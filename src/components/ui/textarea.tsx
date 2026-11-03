import * as React from 'react';
import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <span className="textarea-shell block overflow-hidden rounded-lg bg-input">
      <textarea
        data-slot="textarea"
        className={cn(
          'native-select block min-h-24 resize-y overscroll-contain py-3 placeholder:text-muted-foreground aria-invalid:bg-destructive/10',
          className,
        )}
        {...props}
      />
    </span>
  );
}

export { Textarea };
