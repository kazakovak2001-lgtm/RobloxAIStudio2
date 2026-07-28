/**
 * Platform Integration — public API (v3.0)
 *
 * PlatformIntegrationManager remains an internal preview composition root and
 * is intentionally not exported through the production integration barrel.
 */
export {
  EndToEndValidator,
  type E2EValidationReport,
} from "./EndToEndValidator";
export {
  ProductionAuditService,
  type ProductionAuditReport,
  type AuditCheck,
} from "./ProductionAuditService";
