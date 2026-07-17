/**
 * GCPSecretProvider — Google Cloud Secret Manager integration.
 *
 * Loads secrets from GCP Secret Manager in production.
 * Falls back to process.env when GCP is unavailable (development mode).
 *
 * Activation: SECRET_PROVIDER=gcp (in environment)
 * Default: process.env fallback (no GCP dependency in dev)
 *
 * Project: roblox-ai-studio-cloud
 * Service Account: ai-project-controller@roblox-ai-studio-cloud.iam.gserviceaccount.com
 *
 * NEVER commits credentials to source code.
 * Uses Application Default Credentials (ADC) or GOOGLE_APPLICATION_CREDENTIALS env var.
 */

export interface SecretValue {
  name: string;
  value: string;
  source: "gcp" | "env" | "default";
  cached: boolean;
}

export interface SecretProviderConfig {
  projectId: string;
  cacheEnabled: boolean;
  cacheTtlMs: number;
}

const DEFAULT_CONFIG: SecretProviderConfig = {
  projectId: "roblox-ai-studio-cloud",
  cacheEnabled: true,
  cacheTtlMs: 300_000, // 5 minutes
};

interface CacheEntry {
  value: string;
  expiresAt: number;
}

export class GCPSecretProvider {
  private config: SecretProviderConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private gcpAvailable: boolean | null = null;

  constructor(config?: Partial<SecretProviderConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get a secret value. Checks cache, then GCP, then env fallback.
   */
  async getSecret(name: string, defaultValue?: string): Promise<SecretValue> {
    // Check cache first
    if (this.config.cacheEnabled) {
      const cached = this.cache.get(name);
      if (cached && cached.expiresAt > Date.now()) {
        return { name, value: cached.value, source: "gcp", cached: true };
      }
    }

    // Try GCP Secret Manager
    if (this.isGCPEnabled()) {
      try {
        const value = await this.fetchFromGCP(name);
        if (value !== null) {
          this.cacheValue(name, value);
          return { name, value, source: "gcp", cached: false };
        }
      } catch (err) {
        console.warn(
          `[GCPSecretProvider] Failed to fetch "${name}" from GCP:`,
          err,
        );
      }
    }

    // Fallback to environment variable
    const envKey = this.toEnvKey(name);
    const envValue = process.env[envKey];
    if (envValue) {
      return { name, value: envValue, source: "env", cached: false };
    }

    // Default value
    if (defaultValue !== undefined) {
      return { name, value: defaultValue, source: "default", cached: false };
    }

    throw new Error(
      `Secret "${name}" not found in GCP, env (${envKey}), or defaults`,
    );
  }

  /**
   * Check if GCP Secret Manager is enabled and available.
   */
  isGCPEnabled(): boolean {
    if (this.gcpAvailable !== null) return this.gcpAvailable;

    const provider = process.env.SECRET_PROVIDER;
    if (provider !== "gcp") {
      this.gcpAvailable = false;
      return false;
    }

    // Check if GCP credentials are available (ADC or explicit path)
    const hasCredentials =
      !!process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      !!process.env.GOOGLE_CLOUD_PROJECT;

    this.gcpAvailable = hasCredentials;
    return hasCredentials;
  }

  /**
   * Fetch a secret from Google Cloud Secret Manager.
   * Uses the REST API directly to avoid requiring the full @google-cloud/secret-manager SDK.
   */
  private async fetchFromGCP(secretName: string): Promise<string | null> {
    const projectId = this.config.projectId;
    const url = `https://secretmanager.googleapis.com/v1/projects/${projectId}/secrets/${secretName}/versions/latest:access`;

    // Get access token from ADC
    const token = await this.getAccessToken();
    if (!token) return null;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`GCP Secret Manager returned ${response.status}`);
    }

    const data = (await response.json()) as { payload?: { data?: string } };
    if (!data.payload?.data) return null;

    // Decode base64 payload
    return Buffer.from(data.payload.data, "base64").toString("utf-8");
  }

  /**
   * Get an access token from Application Default Credentials.
   * In production, uses the metadata server or service account.
   */
  private async getAccessToken(): Promise<string | null> {
    // Try GCP metadata server (available on Compute Engine, Cloud Run, GKE)
    try {
      const response = await fetch(
        "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
        { headers: { "Metadata-Flavor": "Google" } },
      );
      if (response.ok) {
        const data = (await response.json()) as { access_token?: string };
        return data.access_token ?? null;
      }
    } catch {
      // Not running on GCP — metadata server unavailable
    }

    // No token available without SDK
    console.warn(
      "[GCPSecretProvider] Cannot obtain access token without GCP metadata server or SDK",
    );
    this.gcpAvailable = false;
    return null;
  }

  private cacheValue(name: string, value: string): void {
    this.cache.set(name, {
      value,
      expiresAt: Date.now() + this.config.cacheTtlMs,
    });
  }

  /**
   * Convert a secret name to an environment variable key.
   * Example: "openai-api-key" → "OPENAI_API_KEY"
   */
  private toEnvKey(name: string): string {
    return name.replace(/-/g, "_").toUpperCase();
  }

  /**
   * Clear the secret cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get provider status for health checks.
   */
  getStatus(): {
    provider: string;
    gcpEnabled: boolean;
    cachedSecrets: number;
  } {
    return {
      provider: this.isGCPEnabled() ? "gcp" : "env",
      gcpEnabled: this.gcpAvailable ?? false,
      cachedSecrets: this.cache.size,
    };
  }
}
