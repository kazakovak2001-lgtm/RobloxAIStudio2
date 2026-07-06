/**
 * BaseProvider.ts — Abstract base for all AI providers.
 */

import type {
  ProviderType,
  ProviderCapability,
  ProviderConfig,
  ProviderRequest,
  ProviderResponse,
  ProviderStatus,
} from "./types";

export abstract class BaseProvider {
  abstract readonly type: ProviderType;
  abstract readonly capability: ProviderCapability;

  protected config: ProviderConfig;
  protected _status: ProviderStatus = "available";

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  abstract complete(request: ProviderRequest): Promise<ProviderResponse>;

  get status(): ProviderStatus {
    return this._status;
  }
  get enabled(): boolean {
    return this.config.enabled;
  }
  get priority(): number {
    return this.config.priority;
  }
  get models(): string[] {
    return this.config.models;
  }
  get defaultModel(): string {
    return this.config.defaultModel;
  }

  supportsJSON(): boolean {
    return this.capability.structuredJSON;
  }
  supportsCode(): boolean {
    return this.capability.codeGeneration;
  }
  supportsStreaming(): boolean {
    return this.capability.streaming;
  }

  setStatus(status: ProviderStatus): void {
    this._status = status;
  }
  disable(): void {
    this.config.enabled = false;
    this._status = "disabled";
  }
  enable(): void {
    this.config.enabled = true;
    this._status = "available";
  }
}
