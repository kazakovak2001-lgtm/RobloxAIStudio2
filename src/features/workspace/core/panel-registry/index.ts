/**
 * workspace/core/panel-registry/index.ts
 *
 * Barrel export for the panel registry module.
 */

export type { PanelRegistration, PanelCategory } from "./types";
export {
  registerPanel,
  getPanel,
  getPanelsForZone,
  getVisiblePanels,
  getOnDemandPanels,
  getAllPanelIds,
  clearRegistry,
} from "./registry";

// Import definitions to trigger panel registration on module load
import "./definitions";
