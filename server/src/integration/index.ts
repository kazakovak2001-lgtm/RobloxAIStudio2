/**
 * Platform Integration — public API (v3.0)
 */
export {
  PlatformIntegrationManager,
  type PlatformComponents,
  type PlatformHealthReport,
  type PlatformStatus,
} from "./PlatformIntegrationManager";
export {
  EndToEndValidator,
  type E2EValidationReport,
} from "./EndToEndValidator";
export {
  ProductionAuditService,
  type ProductionAuditReport,
  type AuditCheck,
} from "./ProductionAuditService";
