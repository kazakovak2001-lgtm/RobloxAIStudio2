import type { ReactNode, MouseEvent } from "react";
import { Link } from "react-router-dom";

type ButtonProps = {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  to?: string;
  className?: string;
  disabled?: boolean;
  onClick?: (e?: MouseEvent) => void;
};

const baseClasses =
  "inline-flex items-center justify-center rounded-full font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-400/70";

const variantClasses = {
  primary:
    "bg-gradient-to-r from-brand-500 to-accent text-white shadow-glow hover:translate-y-[-1px]",
  secondary:
    "border border-white/10 bg-white/10 text-slate-100 hover:bg-white/15",
  ghost: "text-slate-300 hover:bg-white/10 hover:text-white",
};

const sizeClasses = {
  sm: "px-3 py-2 text-sm",
  md: "px-4 py-2.5 text-sm",
  lg: "px-5 py-3 text-base",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  to,
  className = "",
  disabled = false,
  onClick,
}: ButtonProps) {
  const classes =
    `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`.trim();

  if (to) {
    return (
      <Link to={to} className={classes} onClick={onClick}>
        {children}
      </Link>
    );
  }

  return (
    <button
      className={classes}
      onClick={onClick}
      type="button"
      disabled={disabled}
    >
      {children}
    </button>
  );
}
