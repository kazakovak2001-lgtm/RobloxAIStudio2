export interface TabItem {
  id: string;
  label: string;
}

export type TabsProps = {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
};

export function Tabs({ items, activeId, onChange, className = "" }: TabsProps) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onChange(item.id)}
          type="button"
          className={
            activeId === item.id
              ? "rounded-full border border-brand-400/50 bg-brand-500/15 px-4 py-2 text-sm font-medium text-brand-200 transition"
              : "rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-400 transition hover:bg-white/10 hover:text-white"
          }
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}