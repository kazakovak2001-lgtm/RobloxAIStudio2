import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface ImageEvidence {
  controlId: string;
  repository: string;
  backendSha: string;
  frontendRepository: string;
  frontendSha: string;
  backendImageDigest: string;
  frontendImageDigest: string;
  vulnerabilityScanner: string;
  vulnerabilityScannerVersion: string;
  scannerScope: string;
  blockingSeverities: string[];
  ignoreUnfixed: boolean;
  sbomGenerator: string;
  sbomGeneratorVersion: string;
  sbomFormat: string;
  backendExitCode: number;
  frontendExitCode: number;
}

interface ImageException {
  controlId: string;
  scanner: string;
  repository: string;
  imageDigest: string;
  vulnerabilityId: string;
  packageName: string;
  owner: string;
  rationale: string;
  compensatingControl: string;
  approvalReference: string;
  createdAt: string;
  expiresAt: string;
}

function exact(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    value !== "*" &&
    !value.includes("**")
  );
}

export function validateEvidence(evidence: ImageEvidence): string[] {
  const errors: string[] = [];
  if (evidence.controlId !== "SECURITY-2G-D") errors.push("controlId");
  if (evidence.repository !== "kazakovak2001-lgtm/RobloxAIStudio2")
    errors.push("repository");
  if (evidence.frontendRepository !== "kazakovak2001-lgtm/Frontend")
    errors.push("frontendRepository");
  if (!SHA_PATTERN.test(evidence.backendSha)) errors.push("backendSha");
  if (!SHA_PATTERN.test(evidence.frontendSha)) errors.push("frontendSha");
  if (!DIGEST_PATTERN.test(evidence.backendImageDigest))
    errors.push("backendImageDigest");
  if (!DIGEST_PATTERN.test(evidence.frontendImageDigest))
    errors.push("frontendImageDigest");
  if (evidence.vulnerabilityScanner !== "trivy")
    errors.push("vulnerabilityScanner");
  if (evidence.vulnerabilityScannerVersion !== "0.70.0")
    errors.push("vulnerabilityScannerVersion");
  if (evidence.scannerScope !== "vulnerability") errors.push("scannerScope");
  if (
    JSON.stringify(evidence.blockingSeverities) !==
    JSON.stringify(["CRITICAL", "HIGH"])
  ) {
    errors.push("blockingSeverities");
  }
  if (evidence.ignoreUnfixed !== true) errors.push("ignoreUnfixed");
  if (evidence.sbomGenerator !== "syft") errors.push("sbomGenerator");
  if (evidence.sbomGeneratorVersion !== "1.44.0")
    errors.push("sbomGeneratorVersion");
  if (evidence.sbomFormat !== "spdx-json") errors.push("sbomFormat");
  if (evidence.backendExitCode !== 0) errors.push("backendExitCode");
  if (evidence.frontendExitCode !== 0) errors.push("frontendExitCode");
  return errors;
}

/**
 * Validate one image exception against an explicit calendar date.
 *
 * `today` is required rather than defaulted. A frozen default here would mean
 * expiry was checked against a date that stopped advancing, so an exception
 * could outlive its own `expiresAt` and still validate. Callers pass either the
 * real UTC date (production) or a fixed date (fixtures).
 *
 * Boundary semantics, unchanged: `expiresAt < today` is expired, so an
 * exception remains valid through the whole of its expiry date.
 */
export function validateException(
  exception: ImageException,
  today: string,
): string[] {
  const errors: string[] = [];
  if (exception.controlId !== "SECURITY-2G-D") errors.push("controlId");
  if (exception.scanner !== "trivy") errors.push("scanner");
  if (!exact(exception.repository)) errors.push("repository");
  if (!DIGEST_PATTERN.test(exception.imageDigest)) errors.push("imageDigest");
  if (!exact(exception.vulnerabilityId)) errors.push("vulnerabilityId");
  if (!exact(exception.packageName)) errors.push("packageName");
  if (!exact(exception.owner)) errors.push("owner");
  if (!exact(exception.rationale)) errors.push("rationale");
  if (!exact(exception.compensatingControl)) errors.push("compensatingControl");
  if (!exact(exception.approvalReference)) errors.push("approvalReference");
  if (
    !DATE_PATTERN.test(exception.createdAt) ||
    !DATE_PATTERN.test(exception.expiresAt)
  ) {
    errors.push("dates");
  } else {
    if (
      exception.createdAt > exception.expiresAt ||
      exception.expiresAt < today
    )
      errors.push("expired");
    const lifetime =
      (Date.parse(`${exception.expiresAt}T00:00:00Z`) -
        Date.parse(`${exception.createdAt}T00:00:00Z`)) /
      86_400_000;
    if (lifetime > 30) errors.push("lifetime");
  }
  return errors;
}

function vulnerabilityCount(report: unknown): number {
  if (!report || typeof report !== "object") return -1;
  const results = (report as { Results?: unknown[] }).Results;
  if (!Array.isArray(results)) return 0;
  return results.reduce((total, result) => {
    if (!result || typeof result !== "object") return total;
    const vulnerabilities = (result as { Vulnerabilities?: unknown[] })
      .Vulnerabilities;
    return (
      total + (Array.isArray(vulnerabilities) ? vulnerabilities.length : 0)
    );
  }, 0);
}

function validateSpdx(document: unknown): void {
  assert.ok(document && typeof document === "object", "SBOM must be an object");
  const record = document as {
    spdxVersion?: string;
    SPDXID?: string;
    packages?: unknown[];
  };
  assert.match(record.spdxVersion ?? "", /^SPDX-2\./, "SBOM must use SPDX 2.x");
  assert.equal(
    record.SPDXID,
    "SPDXRef-DOCUMENT",
    "SBOM must identify the SPDX document",
  );
  assert.ok(
    Array.isArray(record.packages) && record.packages.length > 0,
    "SBOM must contain packages",
  );
}

function runArtifactValidation(root: string): void {
  const evidence = JSON.parse(
    readFileSync(resolve(root, "evidence.json"), "utf8"),
  ) as ImageEvidence;
  assert.deepEqual(
    validateEvidence(evidence),
    [],
    "image evidence policy mismatch",
  );

  for (const component of ["backend", "frontend"] as const) {
    const digest = readFileSync(
      resolve(root, component, "image-digest.txt"),
      "utf8",
    ).trim();
    assert.match(
      digest,
      DIGEST_PATTERN,
      `${component} image digest must be immutable`,
    );
    assert.equal(
      digest,
      component === "backend"
        ? evidence.backendImageDigest
        : evidence.frontendImageDigest,
      `${component} evidence digest must match the scanned image`,
    );

    const report = JSON.parse(
      readFileSync(resolve(root, component, "vulnerabilities.json"), "utf8"),
    ) as unknown;
    assert.equal(
      vulnerabilityCount(report),
      0,
      `${component} image contains blocking findings`,
    );

    const sbom = JSON.parse(
      readFileSync(resolve(root, component, "sbom.spdx.json"), "utf8"),
    ) as unknown;
    validateSpdx(sbom);
  }
}

function runFixtures(): void {
  const validEvidence: ImageEvidence = {
    controlId: "SECURITY-2G-D",
    repository: "kazakovak2001-lgtm/RobloxAIStudio2",
    backendSha: "a".repeat(40),
    frontendRepository: "kazakovak2001-lgtm/Frontend",
    frontendSha: "b".repeat(40),
    backendImageDigest: `sha256:${"c".repeat(64)}`,
    frontendImageDigest: `sha256:${"d".repeat(64)}`,
    vulnerabilityScanner: "trivy",
    vulnerabilityScannerVersion: "0.70.0",
    scannerScope: "vulnerability",
    blockingSeverities: ["CRITICAL", "HIGH"],
    ignoreUnfixed: true,
    sbomGenerator: "syft",
    sbomGeneratorVersion: "1.44.0",
    sbomFormat: "spdx-json",
    backendExitCode: 0,
    frontendExitCode: 0,
  };
  assert.deepEqual(validateEvidence(validEvidence), []);

  const invalidEvidence: ImageEvidence[] = [
    { ...validEvidence, backendImageDigest: "latest" },
    { ...validEvidence, frontendSha: "HEAD" },
    { ...validEvidence, vulnerabilityScannerVersion: "latest" },
    { ...validEvidence, blockingSeverities: ["CRITICAL"] },
    { ...validEvidence, backendExitCode: 1 },
  ];
  for (const fixture of invalidEvidence)
    assert.notDeepEqual(validateEvidence(fixture), []);

  const validException: ImageException = {
    controlId: "SECURITY-2G-D",
    scanner: "trivy",
    repository: "kazakovak2001-lgtm/RobloxAIStudio2",
    imageDigest: `sha256:${"e".repeat(64)}`,
    vulnerabilityId: "CVE-2099-0001",
    packageName: "example-package",
    owner: "security-owner",
    rationale: "Temporary exact-image exception.",
    compensatingControl: "The affected code path is disabled.",
    approvalReference: "issue #154",
    createdAt: "2026-08-01",
    expiresAt: "2026-08-15",
  };
  // Fixed clock: these fixtures assert validation logic, not today's date.
  const FIXTURE_TODAY = "2026-08-01";
  assert.deepEqual(validateException(validException, FIXTURE_TODAY), []);

  const invalidExceptions: ImageException[] = [
    { ...validException, imageDigest: "*" },
    { ...validException, vulnerabilityId: "*" },
    { ...validException, owner: "" },
    { ...validException, expiresAt: "2026-07-31" },
    { ...validException, expiresAt: "2026-12-31" },
  ];
  for (const fixture of invalidExceptions)
    assert.notDeepEqual(validateException(fixture, FIXTURE_TODAY), []);

  // SEC-SCANNER-EXCEPTION-CLOCK-001 regressions.
  //
  // Expiry is relative to the date supplied, so the same exception must pass
  // before its expiry and fail after it. A frozen clock made the second case
  // impossible to observe.
  assert.deepEqual(
    validateException(
      { ...validException, createdAt: "2026-08-01", expiresAt: "2026-08-15" },
      "2026-08-14",
    ),
    [],
    "an exception must be valid the day before it expires",
  );
  assert.ok(
    validateException(
      { ...validException, createdAt: "2026-08-01", expiresAt: "2026-08-15" },
      "2026-08-16",
    ).includes("expired"),
    "an exception must be expired the day after its expiresAt",
  );
  // Boundary: valid through the whole of the expiry date (expiresAt < today).
  assert.deepEqual(
    validateException(
      { ...validException, createdAt: "2026-08-01", expiresAt: "2026-08-15" },
      "2026-08-15",
    ),
    [],
    "an exception must remain valid on its expiry date",
  );
  // The production path: the real UTC date, not a fixture constant.
  const productionToday = new Date().toISOString().slice(0, 10);
  assert.deepEqual(
    validateException(
      {
        ...validException,
        createdAt: productionToday,
        expiresAt: productionToday,
      },
      productionToday,
    ),
    [],
    "an exception created and expiring today must pass against the real clock",
  );
}

runFixtures();
const artifactRoot = process.argv[2];
if (artifactRoot) runArtifactValidation(artifactRoot);
console.log("Image vulnerability and SBOM policy fixtures passed");
