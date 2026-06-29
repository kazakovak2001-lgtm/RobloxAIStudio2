const variants = {
  default: "border-white/10 bg-white/5 text-slate-300",
  primary: "border-brand-400/30 bg-brand-500/10 text-brand-200",
  success: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  warning: "border-amber-400/30 bg-amber-500/10 text-amber-200",
  danger: "border-red-400/30 bg-red-500/10 text-red-200",
  info: "border-cyan-400/30 bg-cyan-500/10 text-cyan-200",
};

type Variant = keyof typeof variants;

interface BadgeProps {
  variant?: Variant;
  className?: string;
  children: React.ReactNode;
}

export function Badge({ variant = "default", className = "", children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
