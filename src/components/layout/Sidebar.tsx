import { Link, useLocation } from "react-router-dom";
import {
  Bot,
  Home,
  LayoutDashboard,
  LogOut,
  PlusCircle,
  Settings,
  Users,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Projects", href: "/projects", icon: Bot },
  { name: "New Project", href: "/new-project", icon: PlusCircle },
  { name: "Team", href: "/team", icon: Users },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 w-64 border-r border-white/10 bg-slate-950/80 backdrop-blur-xl">
      <div className="flex h-full flex-col">
        <div className="flex h-16 items-center gap-2 border-b border-white/10 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-cyan-500">
            <Bot className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-white">Roblox AI Studio</span>
        </div>

        <nav className="flex-1 space-y-1 p-4">
          {navigation.map((item) => {
            const isActive = location.pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={
                  isActive
                    ? "flex items-center gap-3 rounded-2xl bg-white/10 px-3 py-2 text-sm font-medium text-white"
                    : "flex items-center gap-3 rounded-2xl px-3 py-2 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white"
                }
              >
                <Icon className="h-4 w-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <Link
            to="/"
            className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            <Home className="h-4 w-4" />
            Landing
          </Link>
          <button
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white"
            type="button"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
