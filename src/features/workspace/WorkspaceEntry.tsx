/**
 * workspace/WorkspaceEntry.tsx
 *
 * Entry point for the workspace route (/projects/:id).
 * Conditionally renders Legacy WorkspacePage or Mission Control shell
 * based on the feature flag.
 *
 * Default: Legacy workspace (preserves current behavior)
 */

import { lazy, Suspense, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader } from "@/shared/ui/Loader";
import { WorkspaceProvider } from "./core";
import {
  getWorkspaceExperience,
  type WorkspaceExperience,
} from "./core/feature-flags";

// Lazy-load both experiences
const LegacyWorkspace = lazy(() => import("./Workspace"));
const MissionControlWorkspace = lazy(() => import("./MissionControlPage"));

export default function WorkspaceEntry() {
  const { id } = useParams();
  const [experience] = useState<WorkspaceExperience>(() =>
    getWorkspaceExperience(),
  );

  if (experience === "mission-control") {
    return (
      <WorkspaceProvider>
        <Suspense fallback={<LoadingFallback />}>
          <MissionControlWorkspace projectId={id} />
        </Suspense>
      </WorkspaceProvider>
    );
  }

  // Default: legacy workspace (no WorkspaceProvider — preserves exact current behavior)
  return (
    <Suspense fallback={<LoadingFallback />}>
      <LegacyWorkspace />
    </Suspense>
  );
}

function LoadingFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader label="Loading workspace..." />
    </div>
  );
}
