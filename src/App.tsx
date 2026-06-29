import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Loader } from "./components/ui/Loader";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";

const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const NewProjectPage = lazy(() => import("./pages/NewProjectPage"));
const ProjectsPage = lazy(() => import("./pages/ProjectsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const AiEngineDemoPage = lazy(() => import("./pages/AiEngineDemoPage"));
const WorkspacePage = lazy(() => import("./features/workspace/Workspace"));
function LoadingFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader label="Loading..." />
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/dashboard"
        element={
          <Suspense fallback={<LoadingFallback />}>
            <DashboardPage />
          </Suspense>
        }
      />
      <Route
        path="/new-project"
        element={
          <Suspense fallback={<LoadingFallback />}>
            <NewProjectPage />
          </Suspense>
        }
      />
      <Route
        path="/projects"
        element={
          <Suspense fallback={<LoadingFallback />}>
            <ProjectsPage />
          </Suspense>
        }
      />
      <Route
        path="/projects/:id"
        element={
          <Suspense fallback={<LoadingFallback />}>
            <WorkspacePage />
          </Suspense>
        }
      />
      <Route
        path="/settings"
        element={
          <Suspense fallback={<LoadingFallback />}>
            <SettingsPage />
          </Suspense>
        }
      />
      <Route
        path="/ai-engine"
        element={
          <Suspense fallback={<LoadingFallback />}>
            <AiEngineDemoPage />
          </Suspense>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
