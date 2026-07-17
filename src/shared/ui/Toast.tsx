import { useState, useEffect, createContext, useContext } from "react";
import { Info, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

export const ToastContext = createContext<{
  toast: (props: {
    variant?: "info" | "success" | "warning" | "error";
    title?: string;
    description?: string;
  }) => void;
} | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
}

type ToastVariant = "info" | "success" | "warning" | "error";

const iconMap = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
};

const colorMap = {
  info: "border-cyan-400/30 bg-cyan-500/10 text-cyan-200",
  success: "border-success-400/30 bg-success-500/10 text-success-200",
  warning: "border-warning-400/30 bg-warning-500/10 text-warning-200",
  error: "border-error-400/30 bg-error-500/10 text-error-200",
};

interface ToastProps {
  id: string;
  variant?: ToastVariant;
  title?: string;
  description?: string;
  duration?: number;
  onDismiss: (id: string) => void;
}

export function Toast({
  id,
  variant = "info",
  title,
  description,
  duration = 4000,
  onDismiss,
}: ToastProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onDismiss(id), 150);
    }, duration);
    return () => clearTimeout(timer);
  }, [id, duration, onDismiss]);

  const Icon = iconMap[variant];

  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg transition ${colorMap[variant]} ${isVisible ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">
        {title && <p className="text-sm font-medium">{title}</p>}
        {description && (
          <p className="mt-1 text-xs opacity-90">{description}</p>
        )}
      </div>
    </div>
  );
}
