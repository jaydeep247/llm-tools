import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/30 p-10 text-center',
        className
      )}
    >
      {Icon && (
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-zinc-800">
          <Icon className="w-6 h-6 text-zinc-400" />
        </div>
      )}
      <div className="space-y-1">
        <p className="text-sm font-medium text-zinc-200">{title}</p>
        {description && <p className="text-xs text-zinc-500 max-w-xs">{description}</p>}
      </div>
      {action && (
        <Button variant="outline" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
