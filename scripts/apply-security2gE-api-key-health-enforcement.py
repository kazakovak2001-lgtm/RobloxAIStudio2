from pathlib import Path

security = Path("server/src/common/middleware/security.ts")
text = security.read_text()
anchor = '''export function getRequestApiKeyPrincipal(
  req: Request,
): ApiKeyPrincipal | null {
  return (req as ApiKeyAuthenticatedRequest).apiKeyPrincipal ?? null;
}
'''
addition = '''
export function requireApiKeyCapability(
  req: Request,
  res: Response,
  capability: string,
  resourceScope: string,
): boolean {
  const principal = getRequestApiKeyPrincipal(req);
  if (!principal) return true;

  if (
    !principal.capabilities.includes(capability) ||
    !principal.resourceScopes.includes(resourceScope)
  ) {
    res.status(403).json({
      success: false,
      error: "API key capability or resource scope denied",
    });
    return false;
  }
  return true;
}
'''
if "export function requireApiKeyCapability" not in text:
    if anchor not in text:
        raise SystemExit("api key principal helper anchor missing")
    text = text.replace(anchor, anchor + addition, 1)
security.write_text(text)

index = Path("server/src/index.ts")
text = index.read_text()
text = text.replace(
'''  getApiKeyStore,
  requestLogger,
''',
'''  getApiKeyStore,
  requireApiKeyCapability,
  requestLogger,
''',
1,
)
text = text.replace(
'''app.get("/health/database", async (_req, res) => {
  if (!(storageProvider instanceof PostgresStorageProvider)) {
''',
'''app.get("/health/database", async (req, res) => {
  if (
    !requireApiKeyCapability(
      req,
      res,
      "system.health.database.read",
      "system-operational-metadata",
    )
  ) {
    return;
  }
  if (!(storageProvider instanceof PostgresStorageProvider)) {
''',
1,
)
text = text.replace(
'''app.get("/health/storage", (_req, res) => {
  const operational = storageProvider.getOperationalStatus();
''',
'''app.get("/health/storage", (req, res) => {
  if (
    !requireApiKeyCapability(
      req,
      res,
      "system.health.storage.read",
      "system-operational-metadata",
    )
  ) {
    return;
  }
  const operational = storageProvider.getOperationalStatus();
''',
1,
)
index.write_text(text)
