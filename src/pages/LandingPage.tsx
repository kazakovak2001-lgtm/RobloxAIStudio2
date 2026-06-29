import { Bot, Cpu, Layers3, ShieldCheck, Sparkles } from "lucide-react";
import { AppLayout } from "../layouts/AppLayout";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { featureCards, faqItems, pricingTiers } from "../constants";

export default function LandingPage() {
  return (
    <AppLayout>
      <section className="mx-auto flex max-w-7xl flex-col gap-16 px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-500/10 px-3 py-1 text-sm text-brand-200">
              <Sparkles className="h-4 w-4" />
              V1 frontend for the future Roblox AI platform
            </div>
            <div className="space-y-4">
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-6xl">
                Design the future of Roblox creation with AI-native workflows.
              </h1>
              <p className="max-w-2xl text-lg text-slate-400">
                Roblox AI Studio is a premium frontend foundation for turning
                prompts into structured project plans, agents, and future-ready
                exports.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button to="/register">Start building</Button>
              <Button to="/dashboard" variant="secondary">
                Explore dashboard
              </Button>
            </div>
            <div className="flex flex-wrap gap-6 text-sm text-slate-400">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-brand-300" /> Secure by
                design
              </div>
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-cyan-300" /> AI-ready architecture
              </div>
            </div>
          </div>

          <Card className="relative overflow-hidden p-0">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(52,124,255,0.32),_transparent_30%)]" />
            <div className="relative space-y-8 p-8">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Prompt to project</p>
                  <p className="text-xl font-semibold text-white">
                    Create a mining sim with pets and rebirths
                  </p>
                </div>
                <div className="rounded-full border border-white/10 bg-white/10 p-2">
                  <Bot className="h-5 w-5 text-cyan-300" />
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-5">
                <div className="mb-4 flex items-center justify-between text-sm text-slate-400">
                  <span>Workflow preview</span>
                  <span>Next: AI agents</span>
                </div>
                <div className="space-y-3">
                  {["Planner", "Designer", "Builder", "QA"].map(
                    (label, index) => (
                      <div
                        key={label}
                        className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-3"
                      >
                        <div className="h-2.5 w-2.5 rounded-full bg-gradient-to-r from-brand-400 to-cyan-400" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-white">
                            {label}
                          </p>
                          <p className="text-sm text-slate-400">
                            Stage {index + 1}
                          </p>
                        </div>
                        <div className="text-sm text-slate-500">Ready</div>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {featureCards.map((card: (typeof featureCards)[number]) => (
            <Card key={card.title}>
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-500/10">
                <Layers3 className="h-5 w-5 text-brand-300" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-white">
                {card.title}
              </h3>
              <p className="text-sm text-slate-400">{card.description}</p>
            </Card>
          ))}
        </div>

        <section className="grid gap-8 rounded-[2rem] border border-white/10 bg-slate-900/70 p-8 backdrop-blur-xl lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-brand-300">
              How it works
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-white">
              A guided experience, ready for future AI generation.
            </h2>
            <p className="mt-4 text-slate-400">
              The product is structured around real product flows: capture
              intent, design the project, track progress, and prepare for
              export.
            </p>
          </div>
          <div className="grid gap-4">
            {[
              [
                "1. Define the vision",
                "Capture the game idea, genre, audience, and difficulty through a polished onboarding form.",
              ],
              [
                "2. Structure the build",
                "Create the project workspace, tasks, and future agent handoff.",
              ],
              [
                "3. Prepare for automation",
                "Use the chat, agents, logs, and settings surfaces as an extensible foundation.",
              ],
            ].map(([title, description]) => (
              <div
                key={title}
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <p className="font-semibold text-white">{title}</p>
                <p className="mt-2 text-sm text-slate-400">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-brand-300">
                Pricing
              </p>
              <h2 className="text-3xl font-semibold text-white">
                Flexible plans for future growth
              </h2>
            </div>
            <Button to="/register" variant="ghost">
              View plans
            </Button>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {pricingTiers.map((tier: (typeof pricingTiers)[number]) => (
              <Card
                key={tier.name}
                className={
                  tier.accent
                    ? "border-brand-400/50 bg-gradient-to-br from-brand-500/15 to-cyan-500/10"
                    : ""
                }
              >
                <p className="text-sm text-slate-400">{tier.name}</p>
                <div className="mt-3 flex items-end gap-1">
                  <span className="text-4xl font-semibold text-white">
                    {tier.price}
                  </span>
                  {tier.price !== "Custom" ? (
                    <span className="pb-1 text-slate-400">/mo</span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm text-slate-400">
                  {tier.description}
                </p>
                <Button
                  className="mt-6"
                  variant={tier.accent ? "primary" : "secondary"}
                  to="/register"
                >
                  Choose {tier.name}
                </Button>
              </Card>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-slate-900/70 p-8 backdrop-blur-xl">
          <div className="mx-auto max-w-3xl space-y-6">
            <div className="text-center">
              <p className="text-sm uppercase tracking-[0.3em] text-brand-300">
                FAQ
              </p>
              <h2 className="mt-3 text-3xl font-semibold text-white">
                Questions from ambitious creators
              </h2>
            </div>
            <div className="space-y-3">
              {faqItems.map((item: (typeof faqItems)[number]) => (
                <details
                  key={item.question}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4"
                >
                  <summary className="cursor-pointer font-medium text-white">
                    {item.question}
                  </summary>
                  <p className="mt-3 text-sm text-slate-400">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </section>

      <footer className="border-t border-white/10 bg-slate-950/80 py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© 2026 Roblox AI Studio. Designed for ambitious builders.</p>
          <div className="flex gap-4">
            <a href="/" className="hover:text-white">
              Home
            </a>
            <a href="/dashboard" className="hover:text-white">
              Dashboard
            </a>
            <a href="/settings" className="hover:text-white">
              Settings
            </a>
          </div>
        </div>
      </footer>
    </AppLayout>
  );
}
