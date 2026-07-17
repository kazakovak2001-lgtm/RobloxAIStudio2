/**
 * Unit tests for SyncValidator.validate
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SyncValidator } from "../SyncValidator";
import type { SyncChange } from "../SyncTypes";

// ─── Helpers ────────────────────────────────────────────────────────────────

const VALID_TYPES = [
  "json",
  "lua",
  "markdown",
  "text",
  "manifest",
  "ui-layout",
  "asset-plan",
] as const;

function makeChange(overrides: Partial<SyncChange> = {}): SyncChange {
  return {
    changeId: "c-1",
    artifactId: "a-1",
    artifactType: "lua",
    changeType: "create",
    content: "print('hello')",
    timestamp: Date.now(),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("SyncValidator.validate", () => {
  let validator: SyncValidator;
  const knownIds = ["a-1", "a-2", "a-3"];

  beforeEach(() => {
    validator = new SyncValidator();
  });

  // ── Valid artifact types accepted ──────────────────────────────────────────

  describe("valid artifact types are accepted", () => {
    for (const type of VALID_TYPES) {
      it(`accepts artifact type "${type}"`, () => {
        const change = makeChange({ artifactType: type, changeType: "create" });
        const result = validator.validate([change], knownIds);

        expect(result.valid).toBe(true);
        expect(result.validatedCount).toBe(1);
        expect(result.errors).toHaveLength(0);
      });
    }
  });

  // ── Invalid artifact type rejected ────────────────────────────────────────

  describe("invalid artifact types are rejected", () => {
    it("rejects an unknown artifact type and error references the changeId", () => {
      const change = makeChange({
        changeId: "bad-type-change",
        artifactType: "unsupported-type",
        changeType: "create",
      });
      const result = validator.validate([change], knownIds);

      expect(result.valid).toBe(false);
      const errorEntry = result.errors.find(
        (e) => e.changeId === "bad-type-change",
      );
      expect(errorEntry).toBeDefined();
      expect(errorEntry?.error).toMatch(/invalid artifact type/i);
    });

    it("rejects empty string as artifact type", () => {
      const change = makeChange({
        changeId: "empty-type",
        artifactType: "",
        changeType: "create",
      });
      const result = validator.validate([change], knownIds);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.changeId === "empty-type")).toBe(true);
    });
  });

  // ── Null/undefined content rejected for create/update ─────────────────────

  describe("null or undefined content rejected for create and update", () => {
    it("rejects null content for changeType 'create'", () => {
      const change = makeChange({
        changeId: "null-content-create",
        changeType: "create",
        content: null,
      });
      const result = validator.validate([change], knownIds);

      expect(result.valid).toBe(false);
      const err = result.errors.find(
        (e) => e.changeId === "null-content-create",
      );
      expect(err).toBeDefined();
    });

    it("rejects undefined content for changeType 'create'", () => {
      const change = makeChange({
        changeId: "undef-content-create",
        changeType: "create",
        content: undefined,
      });
      const result = validator.validate([change], knownIds);

      expect(result.valid).toBe(false);
      const err = result.errors.find(
        (e) => e.changeId === "undef-content-create",
      );
      expect(err).toBeDefined();
    });

    it("rejects null content for changeType 'update'", () => {
      const change = makeChange({
        changeId: "null-content-update",
        changeType: "update",
        artifactId: "a-1",
        content: null,
      });
      const result = validator.validate([change], knownIds);

      expect(result.valid).toBe(false);
      const err = result.errors.find(
        (e) => e.changeId === "null-content-update",
      );
      expect(err).toBeDefined();
    });

    it("rejects undefined content for changeType 'update'", () => {
      const change = makeChange({
        changeId: "undef-content-update",
        changeType: "update",
        artifactId: "a-1",
        content: undefined,
      });
      const result = validator.validate([change], knownIds);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.changeId === "undef-content-update"),
      ).toBe(true);
    });
  });

  // ── Non-null content accepted ──────────────────────────────────────────────

  describe("non-null content is accepted for create and update", () => {
    it("accepts a string content for 'create'", () => {
      const change = makeChange({
        changeType: "create",
        content: "some content",
      });
      const result = validator.validate([change], knownIds);

      // Only a content-related error should be absent; result may still be
      // valid overall if no other fields are wrong.
      const contentErrors = result.errors.filter(
        (e) => e.changeId === change.changeId && /content/i.test(e.error),
      );
      expect(contentErrors).toHaveLength(0);
    });

    it("accepts an object as content for 'update'", () => {
      const change = makeChange({
        changeType: "update",
        artifactId: "a-1",
        content: { key: "value" },
      });
      const result = validator.validate([change], knownIds);

      const contentErrors = result.errors.filter(
        (e) => e.changeId === change.changeId && /content/i.test(e.error),
      );
      expect(contentErrors).toHaveLength(0);
    });

    it("does not require content for 'delete'", () => {
      const change = makeChange({
        changeId: "delete-no-content",
        changeType: "delete",
        artifactId: "a-1",
        content: null,
      });
      const result = validator.validate([change], knownIds);

      const contentErrors = result.errors.filter(
        (e) => e.changeId === "delete-no-content" && /content/i.test(e.error),
      );
      expect(contentErrors).toHaveLength(0);
    });
  });

  // ── Unknown artifact ID rejected for update/delete ────────────────────────

  describe("unknown artifact ID is rejected for update and delete", () => {
    it("rejects 'update' referencing an artifact not in knownArtifactIds", () => {
      const change = makeChange({
        changeId: "unknown-update",
        changeType: "update",
        artifactId: "non-existent-id",
        content: "data",
      });
      const result = validator.validate([change], knownIds);

      expect(result.valid).toBe(false);
      const err = result.errors.find((e) => e.changeId === "unknown-update");
      expect(err).toBeDefined();
      expect(err?.error).toMatch(/not found/i);
    });

    it("rejects 'delete' referencing an artifact not in knownArtifactIds", () => {
      const change = makeChange({
        changeId: "unknown-delete",
        changeType: "delete",
        artifactId: "ghost-id",
      });
      const result = validator.validate([change], knownIds);

      expect(result.valid).toBe(false);
      const err = result.errors.find((e) => e.changeId === "unknown-delete");
      expect(err).toBeDefined();
      expect(err?.error).toMatch(/not found/i);
    });

    it("accepts 'create' with an artifact ID not in knownArtifactIds (new artifact)", () => {
      const change = makeChange({
        changeId: "valid-create",
        changeType: "create",
        artifactId: "brand-new-id",
        content: "new content",
      });
      const result = validator.validate([change], knownIds);

      // Should not have a "not found" error for create
      const notFoundErrors = result.errors.filter(
        (e) => e.changeId === "valid-create" && /not found/i.test(e.error),
      );
      expect(notFoundErrors).toHaveLength(0);
    });
  });

  // ── Missing changeId rejected ──────────────────────────────────────────────

  describe("missing changeId is rejected", () => {
    it("rejects a change with an empty changeId", () => {
      const change = makeChange({ changeId: "" });
      const result = validator.validate([change], knownIds);

      expect(result.valid).toBe(false);
      // The error entry itself has changeId: "" (the value from the change)
      const err = result.errors.find((e) =>
        e.error.toLowerCase().includes("changeid"),
      );
      expect(err).toBeDefined();
    });
  });

  // ── Invalid timestamp rejected ─────────────────────────────────────────────

  describe("invalid timestamp is rejected", () => {
    it("rejects a change with timestamp of 0 (falsy)", () => {
      const change = makeChange({ changeId: "zero-ts", timestamp: 0 });
      const result = validator.validate([change], knownIds);

      expect(result.valid).toBe(false);
      const err = result.errors.find(
        (e) => e.changeId === "zero-ts" && /timestamp/i.test(e.error),
      );
      expect(err).toBeDefined();
    });

    it("rejects a change with a non-numeric timestamp (NaN cast)", () => {
      const change = makeChange({
        changeId: "nan-ts",
        timestamp: NaN,
      });
      // NaN is typeof "number" but falsy — validator treats it as missing
      const result = validator.validate([change], knownIds);

      expect(result.valid).toBe(false);
      const err = result.errors.find(
        (e) => e.changeId === "nan-ts" && /timestamp/i.test(e.error),
      );
      expect(err).toBeDefined();
    });
  });

  // ── Mixed valid + invalid set returns all errors ───────────────────────────

  describe("mixed valid and invalid changes return all errors", () => {
    it("collects errors from every failing change without short-circuiting", () => {
      const goodChange = makeChange({
        changeId: "good",
        artifactType: "lua",
        changeType: "create",
        content: "-- ok",
        timestamp: Date.now(),
      });

      const badType = makeChange({
        changeId: "bad-type",
        artifactType: "roblox-x",
        changeType: "create",
        content: "data",
        timestamp: Date.now(),
      });

      const badContent = makeChange({
        changeId: "bad-content",
        artifactType: "json",
        changeType: "update",
        artifactId: "a-1",
        content: null,
        timestamp: Date.now(),
      });

      const badArtifact = makeChange({
        changeId: "bad-artifact",
        artifactType: "text",
        changeType: "delete",
        artifactId: "no-such-id",
        timestamp: Date.now(),
      });

      const result = validator.validate(
        [goodChange, badType, badContent, badArtifact],
        knownIds,
      );

      expect(result.valid).toBe(false);
      expect(result.validatedCount).toBe(4);

      const errorChangeIds = result.errors.map((e) => e.changeId);
      expect(errorChangeIds).toContain("bad-type");
      expect(errorChangeIds).toContain("bad-content");
      expect(errorChangeIds).toContain("bad-artifact");
      // Good change should contribute no errors
      expect(errorChangeIds).not.toContain("good");
    });

    it("reports valid: true and correct validatedCount when all changes pass", () => {
      const changes: SyncChange[] = [
        makeChange({ changeId: "c-a", changeType: "create", content: "a" }),
        makeChange({
          changeId: "c-b",
          changeType: "update",
          artifactId: "a-1",
          content: "b",
        }),
        makeChange({
          changeId: "c-c",
          changeType: "delete",
          artifactId: "a-2",
          content: null,
        }),
      ];
      const result = validator.validate(changes, knownIds);

      expect(result.valid).toBe(true);
      expect(result.validatedCount).toBe(3);
      expect(result.errors).toHaveLength(0);
    });

    it("returns empty errors and valid: true for an empty change list", () => {
      const result = validator.validate([], knownIds);

      expect(result.valid).toBe(true);
      expect(result.validatedCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });
});
