import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowRight, Github, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { useAuth } from "@/providers/AuthContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    if (!password.trim()) {
      setError("Password is required");
      return;
    }
    setError(null);
    const result = await login(email, password);
    if (result.success) {
      navigate("/dashboard");
    } else {
      setError(result.error ?? "Login failed");
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center justify-center px-4 py-16 sm:px-6 lg:px-8">
      <Card className="w-full max-w-2xl p-8 sm:p-10">
        <div className="mb-8 text-center">
          <p className="text-sm uppercase tracking-[0.3em] text-brand-300">
            Welcome back
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-white">
            Sign in to Roblox AI Studio
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Continue building your next-generation Roblox experience.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 transition hover:bg-white/10"
            type="button"
          >
            <ShieldCheck className="h-4 w-4 text-brand-300" /> Google
          </button>
          <button
            className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 transition hover:bg-white/10"
            type="button"
          >
            <Github className="h-4 w-4 text-cyan-300" /> GitHub
          </button>
        </div>

        <div className="my-6 flex items-center gap-3 text-sm text-slate-500">
          <div className="h-px flex-1 bg-white/10" />
          <span>or continue with email</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm text-slate-300">
            Email
            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3">
              <Mail className="h-4 w-4 text-slate-500" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent text-sm text-white outline-none"
                placeholder="you@studio.com"
              />
            </div>
          </label>
          <label className="block text-sm text-slate-300">
            Password
            <div className="mt-2 rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent text-sm text-white outline-none"
                type="password"
                placeholder="••••••••"
              />
            </div>
          </label>

          {error && <p className="text-sm text-error-400">{error}</p>}

          <Button
            className="w-full"
            onClick={() =>
              handleSubmit({ preventDefault: () => {} } as React.FormEvent)
            }
          >
            {isLoading ? "Signing in..." : "Sign in"}{" "}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          No account yet?{" "}
          <Link to="/register" className="text-brand-300">
            Create one
          </Link>
        </p>
      </Card>
    </div>
  );
}
