import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import {
  loginApi,
  registerApi,
  logoutApi,
  getMeApi,
  type AuthUser,
} from "@/services/authApi";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; error?: string }>;
  register: (data: {
    name: string;
    email: string;
    password: string;
  }) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on mount using cookie-authenticated /me endpoint
  useEffect(() => {
    getMeApi().then((res) => {
      if (res.success && res.data) {
        setUser(res.data.user);
      }
      setIsLoading(false);
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    const res = await loginApi(email, password);
    if (res.success && res.data) {
      setUser(res.data.user);
      setIsLoading(false);
      return { success: true };
    }
    setIsLoading(false);
    return { success: false, error: res.error };
  }, []);

  const register = useCallback(
    async (data: { name: string; email: string; password: string }) => {
      setIsLoading(true);
      const res = await registerApi(data.email, data.password, data.name);
      if (res.success && res.data) {
        setUser(res.data.user);
        setIsLoading(false);
        return { success: true };
      }
      setIsLoading(false);
      return { success: false, error: res.error };
    },
    [],
  );

  const logout = useCallback(async () => {
    await logoutApi();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
