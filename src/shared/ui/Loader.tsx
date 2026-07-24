interface LoaderProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
}

const sizeClasses = {
  sm: "h-4 w-4 border-2",
  md: "h-8 w-8 border-3",
  lg: "h-12 w-12 border-4",
};

export function Loader({ size = "md", className = "", label }: LoaderProps) {
  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <div
        className={`rounded-full border-brand-400 border-t-transparent animate-spin ${sizeClasses[size]}`}
      />
      {label && <span className="text-sm text-slate-400">{label}</span>}
    </div>
  );
}
