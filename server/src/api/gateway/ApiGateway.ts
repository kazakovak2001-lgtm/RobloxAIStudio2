/**
 * ApiGateway.ts
 *
 * Central API gateway — single entry point for all versioned API requests.
 * Implements the middleware pipeline:
 *   Request → Validation → Rate limit check → Execution → Response formatting
 *
 * Responsibilities:
 *   - Route versioned requests to internal services
 *   - Apply schema validation before execution
 *   - Normalize all responses through ResponseFormatter
 *   - Inject trace IDs for observability correlation
 *   - Enforce deprecation policy
 *   - Provide execution boundary isolation
 */

import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { ApiSchemaValidator } from "./ApiSchemaValidator";
import { ResponseFormatter } from "./ResponseFormatter";
import { randomUUID } from "crypto";

export interface GatewayConfig {
  version: string;
  enableValidation: boolean;
  enableDeprecationHeaders: boolean;
  enableResponseValidation: boolean;
}

const DEFAULT_CONFIG: GatewayConfig = {
  version: "1.0.0",
  enableValidation: true,
  enableDeprecationHeaders: true,
  enableResponseValidation: process.env.NODE_ENV !== "production",
};

export class ApiGateway {
  private config: GatewayConfig;
  private validator: ApiSchemaValidator;
  private formatter: ResponseFormatter;
  private deprecatedEndpoints: Map<string, string> = new Map();

  constructor(config?: Partial<GatewayConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.validator = new ApiSchemaValidator();
    this.formatter = new ResponseFormatter(this.config.version);
  }

  /**
   * Get the schema validator instance.
   */
  getValidator(): ApiSchemaValidator {
    return this.validator;
  }

  /**
   * Get the response formatter instance.
   */
  getFormatter(): ResponseFormatter {
    return this.formatter;
  }

  /**
   * Mark an endpoint as deprecated.
   */
  deprecate(endpoint: string, notice: string): void {
    this.deprecatedEndpoints.set(endpoint, notice);
  }

  /**
   * Create Express middleware for trace ID injection.
   */
  traceMiddleware() {
    return (req: Request, _res: Response, next: NextFunction): void => {
      // Attach trace ID to request for downstream use
      const traceId = (req.headers["x-trace-id"] as string) ?? randomUUID();
      (req as RequestWithTrace).traceId = traceId;
      (req as RequestWithTrace).startTime = Date.now();
      next();
    };
  }

  /**
   * Create Express middleware for request validation.
   */
  validationMiddleware(version: string) {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (!this.config.enableValidation) {
        next();
        return;
      }

      // Extract endpoint path (remove version prefix)
      const endpoint = req.path;
      const result = this.validator.validateRequest(
        req.method,
        version,
        endpoint,
        req.body,
      );

      if (!result.valid) {
        const traceId = (req as RequestWithTrace).traceId ?? randomUUID();
        const response = this.formatter.validationError(result.errors, {
          traceId,
        });
        res.status(400).json(response);
        return;
      }

      next();
    };
  }

  /**
   * Create Express middleware for deprecation warnings.
   */
  deprecationMiddleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (!this.config.enableDeprecationHeaders) {
        next();
        return;
      }

      const notice = this.deprecatedEndpoints.get(req.path);
      if (notice) {
        res.setHeader("Deprecation", "true");
        res.setHeader("Sunset", notice);
        res.setHeader("X-Deprecation-Notice", notice);

        // In production, optionally block deprecated endpoints
        if (process.env.BLOCK_DEPRECATED === "true") {
          const traceId = (req as RequestWithTrace).traceId ?? randomUUID();
          const response = this.formatter.error(
            "ENDPOINT_DEPRECATED",
            `This endpoint is deprecated: ${notice}`,
            undefined,
            { traceId },
          );
          res.status(410).json(response);
          return;
        }
      }

      next();
    };
  }

  /**
   * Create Express middleware for response metadata injection.
   */
  responseMetaMiddleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const traceId = (req as RequestWithTrace).traceId ?? randomUUID();
      res.setHeader("X-Trace-Id", traceId);
      res.setHeader("X-Api-Version", this.config.version);
      next();
    };
  }

  /**
   * Build a complete versioned router with all middleware applied.
   */
  createVersionedRouter(version: string): Router {
    const router = Router();

    // Apply gateway middleware pipeline
    router.use(this.traceMiddleware());
    router.use(this.responseMetaMiddleware());
    router.use(this.deprecationMiddleware());
    router.use(this.validationMiddleware(version));

    return router;
  }

  /**
   * Get gateway status and configuration.
   */
  getStatus(): {
    version: string;
    validationEnabled: boolean;
    deprecatedEndpoints: string[];
    registeredSchemas: number;
  } {
    return {
      version: this.config.version,
      validationEnabled: this.config.enableValidation,
      deprecatedEndpoints: [...this.deprecatedEndpoints.keys()],
      registeredSchemas: this.validator.listSchemas().length,
    };
  }
}

// Extended request type with trace metadata
export interface RequestWithTrace extends Request {
  traceId: string;
  startTime: number;
}
