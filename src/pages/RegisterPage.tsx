import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowRight, Mail, ShieldCheck } from "lucide-react";
import { AppLayout } from "../layouts/AppLayout";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useAuth } from "../contexts/AuthContext";

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register, isLoading } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    if (!password.trim() || password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setError(null);
    try {
      await register({ name, email, password });
      navigate("/dashboard");
    } catch {
      setError("Registration failed");
    }
  };

  return (
    <AppLayout>
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center justify-center px-4 py-16 sm:px-6 lg:px-8">
        <Card className="w-full max-w-2xl p-8 sm:p-10">
          <div className="mb-8 text-center">
            <p className="text-sm uppercase tracking-[0.3em] text-brand-300">
              Create account
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-white">
              Join Roblox AI Studio
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Start your first AI-ready Roblox studio experience.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block text-sm text-slate-300">
              Full name *
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white outline-none focus:border-brand-400"
                placeholder="Ava Chen"
              />
            </label>
            <label className="block text-sm text-slate-300">
              Email *
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
              Password *
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white outline-none focus:border-brand-400"
                type="password"
                placeholder="Create a strong password"
              />
            </label>
            <label className="block text-sm text-slate-300">
              Confirm password *
              <input
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white outline-none focus:border-brand-400"
                type="password"
                placeholder="Repeat password"
              />
            </label>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <Button
              className="w-full"
              onClick={() =>
                handleSubmit({ preventDefault: () => {} } as React.FormEvent)
              }
            >
              {isLoading ? "Creating..." : "Create account"}{" "}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </form>

          <div className="mt-6 rounded-2xl border border-brand-400/20 bg-brand-500/10 p-4 text-sm text-brand-200">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Secure registration with
              validation.
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-slate-400">
            Already have an account?{" "}
            <Link to="/login" className="text-brand-300">
              Log in
            </Link>
          </p>
        </Card>
      </div>
    </AppLayout>
  );
}
