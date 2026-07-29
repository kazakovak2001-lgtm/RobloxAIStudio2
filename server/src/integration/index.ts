/**
 * Platform Integration — public API (v3.0)
 *
 * PlatformIntegrationManager and EndToEndValidator form an internal preview
 * composition stack and are intentionally excluded from the production barrel.
 */
export {
  ProductionAuditService,
  type ProductionAuditReport,
  type AuditCheck,
} from "./ProductionAuditService";
