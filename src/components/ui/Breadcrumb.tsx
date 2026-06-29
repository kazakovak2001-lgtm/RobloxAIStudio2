import { ChevronRight } from "lucide-react";

interface BreadcrumbProps {
  items: { label: string; href?: string }[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-2 text-sm text-slate-400">
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          {index > 0 && <ChevronRight className="h-3.5 w-3.5" />}
          {item.href ? (
            <a href={item.href} className="transition hover:text-white">
              {item.label}
            </a>
          ) : (
            <span className="text-slate-300">{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  );
}
