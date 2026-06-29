import { Menu, Sparkles } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { navItems } from "../../constants";
import { Button } from "../ui/Button";

export function Navbar() {
  const location = useLocation();

  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-3 text-white">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-accent">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">Roblox AI Studio</p>
            <p className="text-xs text-slate-400">Future-ready game pipeline</p>
          </div>
        </Link>
        <nav className="hidden items-center gap-2 md:flex">
          {navItems.map((item: (typeof navItems)[number]) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.label}
                to={item.href}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-slate-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3">
          <Button to="/login" variant="ghost" size="sm">
            Sign in
          </Button>
          <Button to="/register" size="sm">
            Start free
          </Button>
          <button
            className="rounded-full border border-white/10 p-2 text-slate-300 md:hidden"
            type="button"
            aria-label="menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
