import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SyncValidator } from "../SyncValidator";
import type { SyncChange } from "../SyncTypes";

const validTypes = [
  "json",
  "lua",
  "markdown",
  "text",
  "manifest",
  "ui-layout",
  "asset-plan",
] as const;
const validTypeSet = new Set<string>(validTypes);
const nonNullJson = fc.jsonValue().filter((value) => value !== null);
const nonBlankString = fc
  .string({ minLength: 1 })
  .filter((value) => value.trim().length > 0);

const baseChange = (overrides: Partial<SyncChange>): SyncChange => ({
  changeId: "change",
  artifactId: "artifact",
  artifactType: "lua",
  changeType: "create",
  content: "content",
  timestamp: 1,
  ...overrides,
});

describe("SyncValidator properties", () => {
  const validator = new SyncValidator();

  // Feature: project-sync-artifact-transfer, Property 9: Invalid artifact types are rejected
  it("P9 rejects every generated non-member artifact type", () => {
    fc.assert(
      fc.property(
        fc.string().filter((value) => !validTypeSet.has(value)),
        fc.string({ minLength: 1 }),
        (artifactType, changeId) => {
          const result = validator.validate(
            [baseChange({ artifactType, changeId })],
            [],
          );
          expect(result.valid).toBe(false);
          expect(
            result.errors.some((error) => error.changeId === changeId),
          ).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: project-sync-artifact-transfer, Property 10: Missing content rejected for create/update
  it("P10 rejects null and undefined create/update content", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<SyncChange["changeType"]>("create", "update"),
        fc.constantFrom(null, undefined),
        fc.string({ minLength: 1 }),
        (changeType, content, changeId) => {
          const result = validator.validate(
            [baseChange({ changeId, changeType, content })],
            ["artifact"],
          );
          expect(result.valid).toBe(false);
          expect(
            result.errors.some(
              (error) =>
                error.changeId === changeId && /content/i.test(error.error),
            ),
          ).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: project-sync-artifact-transfer, Property 11: All validation errors are reported
  it("P11 reports every independently invalid generated change", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string({ minLength: 1 }), {
          minLength: 1,
          maxLength: 20,
        }),
        (changeIds) => {
          const changes = changeIds.map((changeId) =>
            baseChange({ changeId, artifactType: "invalid-artifact-type" }),
          );
          const result = validator.validate(changes, []);
          expect(result.valid).toBe(false);
          for (const changeId of changeIds) {
            expect(
              result.errors.some((error) => error.changeId === changeId),
            ).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: project-sync-artifact-transfer, Property 12: Valid sets fully confirmed
  it("P12 confirms every generated valid change set", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            changeId: nonBlankString,
            artifactId: nonBlankString,
            artifactType: fc.constantFrom(...validTypes),
            content: nonNullJson,
            timestamp: fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
          }),
          { maxLength: 20 },
        ),
        (inputs) => {
          const changes = inputs.map((input) =>
            baseChange({ ...input, changeType: "create" }),
          );
          const result = validator.validate(changes, []);
          expect(result).toEqual({
            valid: true,
            validatedCount: changes.length,
            errors: [],
          });
        },
      ),
      { numRuns: 100 },
    );
  });
});
