import { describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import { DurableStorageError } from "../platform/storage";
import { handleAutonomousMutationError } from "./autonomous";

function createResponseSpy(): {
  response: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const status = vi.fn();
  const json = vi.fn();
  const response = { status, json } as unknown as Response;
  status.mockReturnValue(response);
  json.mockReturnValue(response);
  return { response, status, json };
}

describe("autonomous lifecycle durable errors", () => {
  it("maps durable rejection to a generic 503 without leaking internals", () => {
    const { response, status, json } = createResponseSpy();

    handleAutonomousMutationError(
      new DurableStorageError("database password leaked here", "set"),
      response,
    );

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: "Durable storage is temporarily unavailable",
    });
    expect(JSON.stringify(json.mock.calls)).not.toContain(
      "database password leaked here",
    );
  });

  it("maps unexpected failures to a generic 500", () => {
    const { response, status, json } = createResponseSpy();

    handleAutonomousMutationError(new Error("private stack detail"), response);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: "Autonomous lifecycle mutation failed",
    });
  });
});
