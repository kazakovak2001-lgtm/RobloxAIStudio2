import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Loader } from "@/shared/ui/Loader";
import { AppLayout, PublicLayout } from "@/shared/ui/layout";

const LandingPage = lazy(() => import("@/pages/LandingPage"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const RegisterPage = lazy(() => import("@/pages/RegisterPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const NewProjectPage = lazy(() => import("@/pages/NewProjectPage"));
const ProjectsPage = lazy(() => import("@/pages/ProjectsPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const AiStudioPage = lazy(() => import("@/pages/AiStudioPage"));
const PluginManagerPage = lazy(() => import("@/pages/PluginManagerPage"));
const AnalyticsPage = lazy(() => import("@/pages/AnalyticsPage"));
const KnowledgePage = lazy(() => import("@/pages/KnowledgePage"));
const WorkspacePage = lazy(() => import("@/features/workspace/WorkspaceEntry"));

function LoadingFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader label="Loading..." />
    </div>
  );
}

function Suspended({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingFallback />}>{children}</Suspense>;
}

export function AppRouter() {
  return (
    <Routes>
      {/* Public pages — no sidebar */}
      <Route element={<PublicLayout />}>
        <Route
          path="/"
          element={
            <Suspended>
              <LandingPage />
            </Suspended>
          }
        />
        <Route
          path="/login"
          element={
            <Suspended>
              <LoginPage />
            </Suspended>
          }
        />
        <Route
          path="/register"
          element={
            <Suspended>
              <RegisterPage />
            </Suspended>
          }
        />
      </Route>

      {/* App pages — shared sidebar layout */}
      <Route element={<AppLayout />}>
        <Route
          path="/dashboard"
          element={
            <Suspended>
              <DashboardPage />
            </Suspended>
          }
        />
        <Route
          path="/new-project"
          element={
            <Suspended>
              <NewProjectPage />
            </Suspended>
          }
        />
        <Route
          path="/projects"
          element={
            <Suspended>
              <ProjectsPage />
            </Suspended>
          }
        />
        <Route
          path="/projects/:id"
          element={
            <Suspended>
              <WorkspacePage />
            </Suspended>
          }
        />
        <Route
          path="/settings"
          element={
            <Suspended>
              <SettingsPage />
            </Suspended>
          }
        />
        <Route
          path="/ai-studio"
          element={
            <Suspended>
              <AiStudioPage />
            </Suspended>
          }
        />
        <Route
          path="/plugin-manager"
          element={
            <Suspended>
              <PluginManagerPage />
            </Suspended>
          }
        />
        <Route
          path="/analytics"
          element={
            <Suspended>
              <AnalyticsPage />
            </Suspended>
          }
        />
        <Route
          path="/knowledge"
          element={
            <Suspended>
              <KnowledgePage />
            </Suspended>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
