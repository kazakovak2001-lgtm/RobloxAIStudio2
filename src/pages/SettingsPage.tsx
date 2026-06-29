import { Bell, CreditCard, KeyRound, MoonStar, UserCircle } from "lucide-react";
import { AppLayout } from "../layouts/AppLayout";
import { Card } from "../components/ui/Card";

const sections = [
  {
    title: "Theme",
    description: "Dark-first UI tuned for creator focus.",
    icon: MoonStar,
  },
  {
    title: "Notifications",
    description: "Delivery channels and agent update preferences.",
    icon: Bell,
  },
  {
    title: "API Keys",
    description: "Placeholder surface for future integrations.",
    icon: KeyRound,
  },
  {
    title: "Profile",
    description: "Workspace identity and access controls.",
    icon: UserCircle,
  },
  {
    title: "Billing",
    description: "Subscription management placeholder.",
    icon: CreditCard,
  },
];

export default function SettingsPage() {
  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.3em] text-brand-300">
            Settings
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">
            Configure your workspace
          </h1>
          <p className="mt-2 text-slate-400">
            The settings surface is intentional and ready for auth, billing, and
            API expansion.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <Card key={section.title}>
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-white/10 p-2 text-brand-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-white">
                      {section.title}
                    </h2>
                    <p className="text-sm text-slate-400">
                      {section.description}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
