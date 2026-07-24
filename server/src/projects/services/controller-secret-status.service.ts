import { GCPSecretProvider } from "../../cloud/secrets/GCPSecretProvider";

/**
 * Keeps cloud infrastructure behind a service boundary so API routes only
 * consume the status contract and never reach into provider implementation.
 */
export class ControllerSecretStatusService {
  private readonly provider = new GCPSecretProvider();

  getStatus() {
    return this.provider.getStatus();
  }
}
