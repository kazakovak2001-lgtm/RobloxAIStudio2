/**
 * ResponseFormatter.ts
 *
 * Normalized response builder for all API endpoints.
 * Ensures consistent structure across all versions:
 *   { success, data?, error?, meta: { version, traceId, timestamp, durationMs } }
 *
 * Features:
 *   - Trace ID injection (for observability correlation)
 *   - Execution metadata embedding
 *   - Deprecation header injection
 *   - Standard error formatting
 */

import type { ApiResponse, ApiError, ApiMeta } from "../contracts";
import { randomUUID } from "crypto";

export class ResponseFormatter {
  private version: string;

  constructor(version = "1.0.0") {
    this.version = version;
  }

  /**
   * Format a successful response.
   */
  success<T>(
    data: T,
    options?: {
      traceId?: string;
      startTime?: number;
      deprecated?: boolean;
      deprecationNotice?: string;
    },
  ): ApiResponse<T> {
    return {
      success: true,
      data,
      meta: this.buildMeta(options),
    };
  }

  /**
   * Format an error response.
   */
  error(
    code: string,
    message: string,
    details?: unknown,
    options?: { traceId?: string; startTime?: number },
  ): ApiResponse<never> {
    const error: ApiError = { code, message };
    if (details !== undefined) error.details = details;

    return {
      success: false,
      error,
      meta: this.buildMeta(options),
    };
  }

  /**
   * Format a validation error response.
   */
  validationError(
    errors: Array<{ field: string; message: string }>,
    options?: { traceId?: string },
  ): ApiResponse<never> {
    return this.error(
      "VALIDATION_ERROR",
      `Request validation failed: ${errors.length} error(s)`,
      { validationErrors: errors },
      options,
    );
  }

  /**
   * Format a not-found response.
   */
  notFound(
    resource: string,
    id: string,
    options?: { traceId?: string },
  ): ApiResponse<never> {
    return this.error(
      "NOT_FOUND",
      `${resource} '${id}' not found`,
      undefined,
      options,
    );
  }

  /**
   * Format a deprecated endpoint response (still returns data but with notice).
   */
  deprecated<T>(
    data: T,
    notice: string,
    options?: { traceId?: string; startTime?: number },
  ): ApiResponse<T> {
    return {
      success: true,
      data,
      meta: this.buildMeta({
        ...options,
        deprecated: true,
        deprecationNotice: notice,
      }),
    };
  }

  /**
   * Build response metadata.
   */
  private buildMeta(options?: {
    traceId?: string;
    startTime?: number;
    deprecated?: boolean;
    deprecationNotice?: string;
  }): ApiMeta {
    const meta: ApiMeta = {
      version: this.version,
      traceId: options?.traceId ?? randomUUID(),
      timestamp: new Date().toISOString(),
    };

    if (options?.startTime) {
      meta.durationMs = Date.now() - options.startTime;
    }

    if (options?.deprecated) {
      meta.deprecated = true;
      if (options.deprecationNotice) {
        meta.deprecationNotice = options.deprecationNotice;
      }
    }

    return meta;
  }
}
