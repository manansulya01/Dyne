import type { LucideIcon } from "lucide-react";
import { Button } from "./Button";
import { cn } from "@/lib/utils";

interface StateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

function StateShell({ icon: Icon, title, description, actionLabel, onAction, className, tone }: StateProps & { tone: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)} role="status">
      {Icon && (
        <span className={cn("mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border", tone)}>
          <Icon className="h-7 w-7" aria-hidden="true" strokeWidth={1.75} />
        </span>
      )}
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>}
      {actionLabel && onAction && (
        <Button variant="outline" size="sm" className="mt-5 min-h-[44px]" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export function EmptyState(props: StateProps) {
  return <StateShell {...props} tone="border-border bg-muted text-muted-foreground" />;
}

export function ErrorState({ onRetry, ...props }: StateProps & { onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center" role="alert">
      <h3 className="text-base font-semibold tracking-tight">{props.title}</h3>
      {props.description && <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{props.description}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-5 min-h-[44px]" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
