export interface StatusIndicatorProps {
  status: "online" | "offline" | "warning" | "error";
  label?: string;
  size?: "sm" | "md" | "lg";
}

export function StatusIndicator({
  status,
  label,
  size = "md",
}: StatusIndicatorProps) {
  const sizeConfig = {
    sm: "h-2 w-2",
    md: "h-3 w-3",
    lg: "h-4 w-4",
  };

  const statusConfig = {
    online: {
      bgColor: "bg-success-400",
      animation: "animate-pulse",
      label: "Online",
    },
    offline: {
      bgColor: "bg-slate-400",
      animation: "",
      label: "Offline",
    },
    warning: {
      bgColor: "bg-warning-400",
      animation: "animate-pulse",
      label: "Warning",
    },
    error: {
      bgColor: "bg-error-400",
      animation: "",
      label: "Error",
    },
  };

  const config = statusConfig[status];
  const displayLabel = label || config.label;

  return (
    <div className="flex items-center gap-2">
      <div
        className={`rounded-full ${sizeConfig[size]} ${config.bgColor} ${config.animation}`}
      />
      {displayLabel && (
        <span className="text-sm text-slate-400">{displayLabel}</span>
      )}
    </div>
  );
}
