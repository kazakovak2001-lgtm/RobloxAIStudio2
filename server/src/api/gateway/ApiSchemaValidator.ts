/**
 * ApiSchemaValidator.ts
 *
 * Strict runtime schema validation for API requests and responses.
 * Uses declarative validation rules — no `any` fallback allowed.
 *
 * Features:
 *   - Request body validation (required fields, types)
 *   - Response contract enforcement (dev mode)
 *   - Custom validation rules per endpoint
 */

export interface ValidationRule {
  field: string;
  required?: boolean;
  type?: "string" | "number" | "boolean" | "object" | "array";
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: string[];
  custom?: (value: unknown) => string | null;
}

export interface ValidationResult {
  valid: boolean;
  errors: Array<{ field: string; message: string }>;
}

export interface EndpointSchema {
  endpoint: string;
  method: string;
  version: string;
  request: ValidationRule[];
  response?: ValidationRule[];
}

export class ApiSchemaValidator {
  private schemas: Map<string, EndpointSchema> = new Map();

  constructor() {
    this.registerDefaults();
  }

  /**
   * Register a schema for an endpoint.
   */
  register(schema: EndpointSchema): void {
    const key = `${schema.method}:${schema.version}:${schema.endpoint}`;
    this.schemas.set(key, schema);
  }

  /**
   * Validate a request body against registered schema.
   */
  validateRequest(
    method: string,
    version: string,
    endpoint: string,
    body: unknown,
  ): ValidationResult {
    const key = `${method}:${version}:${endpoint}`;
    const schema = this.schemas.get(key);

    if (!schema) {
      // No schema registered — pass through (warn in dev)
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[API-VALIDATOR] No schema registered for ${key}`);
      }
      return { valid: true, errors: [] };
    }

    return this.validate(body, schema.request);
  }

  /**
   * Validate a response against registered schema (dev mode only).
   */
  validateResponse(
    method: string,
    version: string,
    endpoint: string,
    body: unknown,
  ): ValidationResult {
    if (process.env.NODE_ENV === "production") {
      return { valid: true, errors: [] };
    }

    const key = `${method}:${version}:${endpoint}`;
    const schema = this.schemas.get(key);

    if (!schema || !schema.response) {
      return { valid: true, errors: [] };
    }

    return this.validate(body, schema.response);
  }

  /**
   * Core validation engine.
   */
  validate(data: unknown, rules: ValidationRule[]): ValidationResult {
    const errors: Array<{ field: string; message: string }> = [];

    if (data === null || data === undefined || typeof data !== "object") {
      if (rules.some((r) => r.required)) {
        errors.push({ field: "_body", message: "Request body is required" });
      }
      return { valid: errors.length === 0, errors };
    }

    const obj = data as Record<string, unknown>;

    for (const rule of rules) {
      const value = obj[rule.field];

      // Required check
      if (
        rule.required &&
        (value === undefined || value === null || value === "")
      ) {
        errors.push({
          field: rule.field,
          message: `${rule.field} is required`,
        });
        continue;
      }

      // Skip if not present and not required
      if (value === undefined || value === null) continue;

      // Type check
      if (rule.type) {
        const actualType = Array.isArray(value) ? "array" : typeof value;
        if (actualType !== rule.type) {
          errors.push({
            field: rule.field,
            message: `${rule.field} must be of type ${rule.type}, got ${actualType}`,
          });
          continue;
        }
      }

      // String-specific checks
      if (typeof value === "string") {
        if (rule.minLength !== undefined && value.length < rule.minLength) {
          errors.push({
            field: rule.field,
            message: `${rule.field} must be at least ${rule.minLength} characters`,
          });
        }
        if (rule.maxLength !== undefined && value.length > rule.maxLength) {
          errors.push({
            field: rule.field,
            message: `${rule.field} must be at most ${rule.maxLength} characters`,
          });
        }
        if (rule.pattern && !rule.pattern.test(value)) {
          errors.push({
            field: rule.field,
            message: `${rule.field} does not match required pattern`,
          });
        }
        if (rule.enum && !rule.enum.includes(value)) {
          errors.push({
            field: rule.field,
            message: `${rule.field} must be one of: ${rule.enum.join(", ")}`,
          });
        }
      }

      // Number-specific checks
      if (typeof value === "number") {
        if (rule.min !== undefined && value < rule.min) {
          errors.push({
            field: rule.field,
            message: `${rule.field} must be >= ${rule.min}`,
          });
        }
        if (rule.max !== undefined && value > rule.max) {
          errors.push({
            field: rule.field,
            message: `${rule.field} must be <= ${rule.max}`,
          });
        }
      }

      // Custom validation
      if (rule.custom) {
        const customError = rule.custom(value);
        if (customError) {
          errors.push({ field: rule.field, message: customError });
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get all registered schemas.
   */
  listSchemas(): EndpointSchema[] {
    return [...this.schemas.values()];
  }

  // ─── Default Schema Registration ─────────────────────────────────────────

  private registerDefaults(): void {
    // POST /v1/compile
    this.register({
      endpoint: "/compile",
      method: "POST",
      version: "v1",
      request: [
        {
          field: "intent",
          required: true,
          type: "string",
          minLength: 3,
          maxLength: 500,
        },
        { field: "constraints", type: "array" },
        { field: "projectId", type: "string" },
      ],
    });

    // POST /v1/plan/create
    this.register({
      endpoint: "/plan/create",
      method: "POST",
      version: "v1",
      request: [
        { field: "intent", required: true, type: "string", minLength: 3 },
        { field: "constraints", type: "array" },
        { field: "projectId", type: "string" },
      ],
    });

    // POST /v1/plan/execute
    this.register({
      endpoint: "/plan/execute",
      method: "POST",
      version: "v1",
      request: [{ field: "planId", required: true, type: "string" }],
    });

    // POST /v1/generate
    this.register({
      endpoint: "/generate",
      method: "POST",
      version: "v1",
      request: [
        {
          field: "name",
          required: true,
          type: "string",
          minLength: 1,
          maxLength: 100,
        },
        { field: "gameType", required: true, type: "string" },
        { field: "genre", required: true, type: "string" },
        { field: "description", type: "string", maxLength: 2000 },
      ],
    });

    // POST /v1/memory/store
    this.register({
      endpoint: "/memory/store",
      method: "POST",
      version: "v1",
      request: [
        { field: "agent", required: true, type: "string" },
        { field: "content", required: true, type: "object" },
      ],
    });

    // POST /v1/memory/retrieve
    this.register({
      endpoint: "/memory/retrieve",
      method: "POST",
      version: "v1",
      request: [
        { field: "agent", required: true, type: "string" },
        { field: "query", required: true, type: "string" },
      ],
    });

    // POST /v1/evaluate
    this.register({
      endpoint: "/evaluate",
      method: "POST",
      version: "v1",
      request: [
        { field: "agent", required: true, type: "string" },
        { field: "output", required: true, type: "object" },
      ],
    });
  }
}
