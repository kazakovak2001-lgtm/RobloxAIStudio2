import type { ReactNode } from "react";

export type CardProps = {
  children: ReactNode;
  className?: string;
  hover?: boolean;
};

export function Card({ children, className = "", hover = true }: CardProps) {
  return (
    <div
      className={`rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-glow backdrop-blur-xl ${
        hover
          ? "transition-all duration-300 hover:-translate-y-1 hover:border-brand-400/40"
          : ""
      } ${className}`.trim()}
    >
      {children}
    </div>
  );
}
