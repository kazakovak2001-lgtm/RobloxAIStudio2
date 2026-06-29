import { ArrowRight, Mail, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { AppLayout } from "../layouts/AppLayout";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";

export default function RegisterPage() {
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

          <form className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm text-slate-300">
                Full name
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm outline-none"
                  placeholder="Ava Chen"
                />
              </label>
              <label className="block text-sm text-slate-300">
                Team role
                <input
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm outline-none"
                  placeholder="Game Designer"
                />
              </label>
            </div>
            <label className="block text-sm text-slate-300">
              Email
              <div className="mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3">
                <Mail className="h-4 w-4 text-slate-500" />
                <input
                  className="w-full bg-transparent text-sm outline-none"
                  placeholder="you@studio.com"
                />
              </div>
            </label>
            <label className="block text-sm text-slate-300">
              Password
              <input
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm outline-none"
                type="password"
                placeholder="Create a strong password"
              />
            </label>
            <label className="block text-sm text-slate-300">
              Confirm password
              <input
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm outline-none"
                type="password"
                placeholder="Repeat password"
              />
            </label>

            <label className="flex items-start gap-3 text-sm text-slate-400">
              <input
                type="checkbox"
                className="mt-1 rounded border-white/10 bg-slate-950"
              />
              <span>
                I agree to the terms and understand that the platform is
                currently preparing AI-powered workflows.
              </span>
            </label>

            <Button className="w-full" to="/dashboard">
              Create account <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </form>

          <div className="mt-6 rounded-2xl border border-brand-400/20 bg-brand-500/10 p-4 text-sm text-brand-200">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Secure onboarding placeholder. Authentication APIs will be wired
              later.
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
