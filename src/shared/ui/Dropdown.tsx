import { useState, useRef, useEffect } from "react";

export interface DropdownItem {
  label: string;
  onClick?: () => void;
  href?: string;
}

export type DropdownProps = {
  trigger: React.ReactNode;
  items: DropdownItem[];
  align?: "left" | "right";
  className?: string;
};

export function Dropdown({ trigger, items, align = "left", className = "" }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`} ref={ref}>
      <div onClick={() => setOpen(!open)}>{trigger}</div>
      {open && (
        <div
          className={`absolute top-full z-50 mt-2 min-w-[200px] rounded-2xl border border-white/10 bg-slate-900 p-1 shadow-2xl ${align === "right" ? "right-0" : "left-0"}`}
        >
          {items.map((item, index) => (
            <button
              key={index}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
              type="button"
              onClick={() => {
                item.onClick?.();
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}