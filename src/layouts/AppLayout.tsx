import type { ReactNode } from "react";
import { Sidebar } from "../components/layout/Sidebar";
import { Navbar } from "../components/layout/Navbar";

interface AppLayoutProps {
  children: ReactNode;
  withSidebar?: boolean;
}

export function AppLayout({ children, withSidebar = false }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {withSidebar ? (
        <div className="flex">
          <Sidebar />
          <div className="ml-64 flex-1">
            <Navbar />
            <main className="p-6">{children}</main>
          </div>
        </div>
      ) : (
        <>
          <Navbar />
          <main>{children}</main>
        </>
      )}
    </div>
  );
}

