import { AppRouter } from "@/app/router";
import { SidebarProvider } from "@/shared/hooks";

function App() {
  return (
    <SidebarProvider>
      <AppRouter />
    </SidebarProvider>
  );
}

export default App;
