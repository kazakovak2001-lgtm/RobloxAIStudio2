import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "../../providers/AuthContext";
import { ToastProvider } from "../../providers/ToastProvider";

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
