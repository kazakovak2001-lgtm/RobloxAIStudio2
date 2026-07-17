const variants = {
  default: "border-white/10 bg-white/5 text-slate-300",
  primary: "border-brand-400/30 bg-brand-500/10 text-brand-200",
  success: "border-success-400/30 bg-success-500/10 text-success-200",
  warning: "border-warning-400/30 bg-warning-500/10 text-warning-200",
  danger: "border-error-400/30 bg-error-500/10 text-error-200",
  info: "border-cyan-400/30 bg-cyan-500/10 text-cyan-200",
};

type Variant = keyof typeof variants;

interface BadgeProps {
  variant?: Variant;
  className?: string;
  children: React.ReactNode;
}

export function Badge({
  variant = "default",
  className = "",
  children,
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
