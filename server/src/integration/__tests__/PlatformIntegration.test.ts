/**
 * Platform Integration Tests (v3.0)
 */

import { describe, it, expect, afterEach } from "vitest";
import { PlatformIntegrationManager } from "../PlatformIntegrationManager";
import { EndToEndValidator } from "../EndToEndValidator";
import { ProductionAuditService } from "../ProductionAuditService";

describe("PlatformIntegrationManager", () => {
  let platform: PlatformIntegrationManager;
  afterEach(() => {
    if (platform) platform.stop();
  });

  it("starts all components", () => {
    platform = new PlatformIntegrationManager();
    const components = platform.start();
    expect(platform.getStatus()).toBe("running");
    expect(components.agentRegistry).toBeDefined();
    expect(components.jobManager).toBeDefined();
    expect(components.generationEngine).toBeDefined();
    expect(components.luaEngine).toBeDefined();
    expect(components.assetEngine).toBeDefined();
    expect(components.uiEngine).toBeDefined();
    expect(components.orchestrator).toBeDefined();
    expect(components.providerRegistry).toBeDefined();
    expect(components.memoryManager).toBeDefined();
    expect(components.studioManager).toBeDefined();
  });

  it("provides health report", () => {
    platform = new PlatformIntegrationManager();
    platform.start();
    const health = platform.getHealth();
    expect(health.status).toMatch(/running|degraded/);
    expect(Object.keys(health.components).length).toBeGreaterThan(5);
    expect(health.uptime).toBeGreaterThanOrEqual(0);
  });

  it("shuts down gracefully", () => {
    platform = new PlatformIntegrationManager();
    platform.start();
    platform.stop();
    expect(platform.getStatus()).toBe("stopped");
  });
});

describe("EndToEndValidator", () => {
  it("validates all subsystems", async () => {
    const platform = new PlatformIntegrationManager();
    const components = platform.start();
    const validator = new EndToEndValidator();
    const report = await validator.validate(components);

    expect(report.stagesValidated.length).toBeGreaterThan(5);
    expect(report.totalDurationMs).toBeGreaterThan(0);
    // At least job, generation engine, lua, asset, ui, provider, memory should pass
    expect(report.stagesValidated).toContain("job-submission");
    expect(report.stagesValidated).toContain("generation-engine");
    expect(report.stagesValidated).toContain("lua-generation");
    expect(report.stagesValidated).toContain("asset-generation");
    expect(report.stagesValidated).toContain("ui-generation");
    expect(report.stagesValidated).toContain("provider-layer");
    expect(report.stagesValidated).toContain("memory-system");

    platform.stop();
  });
});

describe("ProductionAuditService", () => {
  it("audits repository structure", () => {
    const audit = new ProductionAuditService();
    const report = audit.audit();
    expect(report.status).toBe("READY");
    expect(report.passed).toBeGreaterThan(15);
    expect(report.failed).toBe(0);
  });
});
