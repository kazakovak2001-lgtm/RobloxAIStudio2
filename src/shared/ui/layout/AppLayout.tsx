import { Outlet } from "react-router-dom";
import { AppShell } from "./AppShell";

/**
 * Shared layout route component. Used as a parent route element in the router.
 * All child routes render inside the AppShell via <Outlet />.
 */
export function AppLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

/**
 * Layout for pages that don't need the sidebar (landing, auth).
 */
export function PublicLayout() {
  return (
    <AppShell hideSidebar hideStatusBar>
      <Outlet />
    </AppShell>
  );
}
