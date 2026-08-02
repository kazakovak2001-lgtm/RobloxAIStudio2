import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

interface ControlContract {
  id: string;
  owner: string;
  evidence: string;
  workflow: string;
  job: string;
  bindings: string[];
}

interface ConsolidatedContract {
  version: number;
  controlId: string;
  repository: string;
  backendSource: { binding: string; requiredFormat: string };
  frontendSource: { repository: string; inventoryPath: string };
  identityInputs: {
    lockfile: string;
    authorizationMatrix: string;
    securityPolicy: string;
  };
  requiredControls: ControlContract[];
  requiredCheckRuns: string[];
  exceptionPolicy: {
    ownerRequired: boolean;
    approvalReferenceRequired: boolean;
    expiryRequired: boolean;
    wildcardsForbidden: boolean;
    plaintextCredentialsForbidden: boolean;
  };
}

const root = process.cwd();
const contractPath = path.join(root, "config/security/consolidated-gate.json");
const outputPath = process.env.SECURITY_2G_F_OUTPUT
  ? path.resolve(process.env.SECURITY_2G_F_OUTPUT)
  : path.join(root, "artifacts/security-2g-f/evidence.json");
const shaPattern = /^[0-9a-f]{40}$/;
const exact = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value === value.trim() &&
  value !== "*" &&
  !value.includes("**");
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(path.join(root, file), "utf8")) as T;
}

function validateContract(contract: ConsolidatedContract): string[] {
  const errors: string[] = [];
  if (contract.version !== 1) errors.push("version must equal 1");
  if (contract.controlId !== "SECURITY-2G-F") errors.push("controlId mismatch");
  if (contract.repository !== "kazakovak2001-lgtm/RobloxAIStudio2")
    errors.push("repository mismatch");
  if (contract.backendSource.binding !== "GITHUB_SHA")
    errors.push("backend binding must use GITHUB_SHA");
  if (contract.backendSource.requiredFormat !== "git-sha-40")
    errors.push("backend SHA format contract mismatch");
  if (contract.frontendSource.repository !== "kazakovak2001-lgtm/Frontend")
    errors.push("frontend repository mismatch");

  const requiredIds = [
    "SECURITY-2G-B",
    "SECURITY-2G-C-SAST",
    "SECURITY-2G-C-CREDENTIALS",
    "SECURITY-2G-D",
    "SECURITY-2G-E",
    "INT-201",
    "CUTOVER-1C",
  ];
  const ids = contract.requiredControls.map((control) => control.id);
  if (new Set(ids).size !== ids.length) errors.push("duplicate control id");
  if (requiredIds.some((id) => !ids.includes(id)))
    errors.push("required control set is incomplete");

  for (const control of contract.requiredControls) {
    if (![control.id, control.owner, control.evidence, control.workflow, control.job].every(exact))
      errors.push(`invalid exact metadata for ${control.id || "unknown"}`);
    if (!Array.isArray(control.bindings) || control.bindings.length === 0)
      errors.push(`missing bindings for ${control.id}`);
    if (control.bindings?.some((binding) => !exact(binding)))
      errors.push(`invalid binding for ${control.id}`);
    if (!control.bindings?.includes("backend-source"))
      errors.push(`backend-source binding missing for ${control.id}`);
  }

  const requiredChecks = [
    "CI Pipeline",
    "Security SAST and Credential Scan",
    "Security Image and SBOM Scan",
    "SECURITY-2G Consolidated Gate",
  ];
  if (requiredChecks.some((name) => !contract.requiredCheckRuns.includes(name)))
    errors.push("required check run set is incomplete");
  if (Object.values(contract.exceptionPolicy).some((value) => value !== true))
    errors.push("exception policy must fail closed");
  return errors;
}

function validateExceptions(policy: Record<string, unknown>, today: string): string[] {
  const errors: string[] = [];
  const exceptions = [
    ...((policy.scannerExceptions as Record<string, unknown>[] | undefined) ?? []),
    ...((policy.exceptions as Record<string, unknown>[] | undefined) ?? []),
  ];
  for (const exception of exceptions) {
    if (!exact(exception.owner)) errors.push("exception owner missing or wildcard");
    if (!exact(exception.approvalReference)) errors.push("exception approval missing");
    if (!exact(exception.rationale)) errors.push("exception rationale missing");
    if (!exact(exception.compensatingControl)) errors.push("exception control missing");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(exception.expiresAt ?? "")))
      errors.push("exception expiry missing");
    else if (String(exception.expiresAt) < today) errors.push("exception expired");
    if (Object.keys(exception).some((key) => ["secret", "plaintext", "credential"].includes(key)))
      errors.push("plaintext credential material is forbidden");
    for (const value of Object.values(exception)) {
      if (value === "*" || (typeof value === "string" && value.includes("**")))
        errors.push("wildcard exception scope is forbidden");
    }
  }
  return errors;
}

async function validateRepository(contract: ConsolidatedContract) {
  const errors = validateContract(contract);
  const release = await readJson<{ frontendRelease?: { repository?: string; commit?: string } }>(
    contract.frontendSource.inventoryPath,
  );
  const packageJson = await readJson<{ securityPolicy?: Record<string, unknown> }>(
    contract.identityInputs.securityPolicy,
  );
  const lockfile = await readFile(path.join(root, contract.identityInputs.lockfile));
  const matrix = await readFile(path.join(root, contract.identityInputs.authorizationMatrix));
  const matrixJson = JSON.parse(matrix.toString("utf8")) as { controlId?: string; operations?: unknown[] };

  const frontendSha = release.frontendRelease?.commit ?? "";
  if (release.frontendRelease?.repository !== contract.frontendSource.repository)
    errors.push("paired Frontend repository does not match release inventory");
  if (!shaPattern.test(frontendSha)) errors.push("paired Frontend commit is not an exact SHA");
  if (matrixJson.controlId !== "SECURITY-2G-E") errors.push("authorization matrix control mismatch");
  if (!Array.isArray(matrixJson.operations) || matrixJson.operations.length === 0)
    errors.push("authorization matrix is empty");

  for (const control of contract.requiredControls) {
    const workflow = await readFile(path.join(root, control.workflow), "utf8");
    if (!workflow.includes(`name: ${control.job}`) && !workflow.includes(`name: \"${control.job}\"`))
      errors.push(`workflow job not found: ${control.job}`);
  }

  const today = process.env.SECURITY_2G_F_TODAY ?? new Date().toISOString().slice(0, 10);
  errors.push(...validateExceptions(packageJson.securityPolicy ?? {}, today));

  const backendSha = process.env.GITHUB_SHA ?? process.env.SECURITY_2G_F_BACKEND_SHA ?? "0".repeat(40);
  if (!shaPattern.test(backendSha)) errors.push("backend source is not an exact SHA");

  return {
    errors,
    evidence: {
      controlId: contract.controlId,
      repository: contract.repository,
      backendSha,
      frontendRepository: contract.frontendSource.repository,
      frontendSha,
      lockfileSha256: sha256(lockfile),
      authorizationMatrixSha256: sha256(matrix),
      authorizationOperationCount: matrixJson.operations?.length ?? 0,
      requiredControls: contract.requiredControls.map(({ id, owner, evidence, job, bindings }) => ({
        id,
        owner,
        evidence,
        job,
        bindings,
      })),
      requiredCheckRuns: contract.requiredCheckRuns,
      exceptionCount:
        (((packageJson.securityPolicy?.scannerExceptions as unknown[]) ?? []).length ?? 0) +
        (((packageJson.securityPolicy?.exceptions as unknown[]) ?? []).length ?? 0),
      validatedAt: new Date().toISOString(),
    },
  };
}

async function runFixtures(contract: ConsolidatedContract) {
  assert.equal(validateContract(contract).length, 0, "positive contract fixture failed");
  const invalidContracts: ConsolidatedContract[] = [
    { ...contract, requiredControls: contract.requiredControls.slice(1) },
    { ...contract, requiredCheckRuns: contract.requiredCheckRuns.filter((x) => x !== "CI Pipeline") },
    {
      ...contract,
      requiredControls: contract.requiredControls.map((control, index) =>
        index === 0 ? { ...control, owner: "*" } : control,
      ),
    },
    { ...contract, exceptionPolicy: { ...contract.exceptionPolicy, expiryRequired: false } },
  ];
  for (const fixture of invalidContracts) {
    assert.notEqual(validateContract(fixture).length, 0, "negative contract fixture passed");
  }
  const invalidException = {
    owner: "*",
    approvalReference: "",
    rationale: "temporary",
    compensatingControl: "none",
    expiresAt: "2026-01-01",
    plaintext: "forbidden",
  };
  assert.notEqual(validateExceptions({ scannerExceptions: [invalidException] }, "2026-08-02").length, 0);
}

const contract = JSON.parse(await readFile(contractPath, "utf8")) as ConsolidatedContract;
await runFixtures(contract);
const result = await validateRepository(contract);
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result.evidence, null, 2)}\n`, "utf8");
if (result.errors.length > 0) {
  console.error(result.errors.join("\n"));
  process.exit(1);
}
console.log(`SECURITY-2G-F consolidated evidence validated: ${outputPath}`);
