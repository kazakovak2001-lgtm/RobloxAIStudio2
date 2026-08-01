from pathlib import Path

store = Path("server/src/platform/security/ApiKeyStore.ts")
text = store.read_text()
text = text.replace(
'''export interface ApiKeyMetadata {
  id?: string;
  label?: string;
  ownerId?: string;
}
''',
'''export interface ApiKeyMetadata {
  id?: string;
  label?: string;
  ownerId?: string;
  capabilities?: string[];
  resourceScopes?: string[];
}

export interface ApiKeyPrincipal {
  type: "api-key";
  keyId: string;
  ownerId?: string;
  capabilities: string[];
  resourceScopes: string[];
}
''',
1,
)
text = text.replace(
'''  ownerId?: string;
  revokedAt?: string;
}

export interface RedactedApiKey {
''',
'''  ownerId?: string;
  capabilities?: string[];
  resourceScopes?: string[];
  revokedAt?: string;
}

export interface RedactedApiKey {
''',
1,
)
text = text.replace(
'''  ownerId?: string;
  revokedAt?: string;
}

function digestKey''',
'''  ownerId?: string;
  capabilities: string[];
  resourceScopes: string[];
  revokedAt?: string;
}

function normalizeScopeValues(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function digestKey''',
1,
)
text = text.replace(
'''        ...(metadata.ownerId ? { ownerId: metadata.ownerId } : {}),
      };
''',
'''        ...(metadata.ownerId ? { ownerId: metadata.ownerId } : {}),
        capabilities: normalizeScopeValues(metadata.capabilities),
        resourceScopes: normalizeScopeValues(metadata.resourceScopes),
      };
''',
1,
)
old_validate = '''  validate(rawKey: unknown): boolean {
    if (typeof rawKey !== "string") return false;
    const key = rawKey.trim();
    if (key.length < MIN_KEY_LENGTH) return false;

    const candidateDigest = digestKey(key);
    return this.storage
      .list<StoredApiKey>(COLLECTION)
      .some(
        (record) =>
          !record.revokedAt && isEqualDigest(record.digest, candidateDigest),
      );
  }
'''
new_validate = '''  resolvePrincipal(rawKey: unknown): ApiKeyPrincipal | null {
    if (typeof rawKey !== "string") return null;
    const key = rawKey.trim();
    if (key.length < MIN_KEY_LENGTH) return null;

    const candidateDigest = digestKey(key);
    const record = this.storage
      .list<StoredApiKey>(COLLECTION)
      .find(
        (candidate) =>
          !candidate.revokedAt &&
          isEqualDigest(candidate.digest, candidateDigest),
      );
    if (!record) return null;

    return {
      type: "api-key",
      keyId: record.id,
      ...(record.ownerId ? { ownerId: record.ownerId } : {}),
      capabilities: normalizeScopeValues(record.capabilities),
      resourceScopes: normalizeScopeValues(record.resourceScopes),
    };
  }

  validate(rawKey: unknown): boolean {
    return this.resolvePrincipal(rawKey) !== null;
  }
'''
if old_validate not in text:
    raise SystemExit("api key validate anchor missing")
text = text.replace(old_validate, new_validate, 1)
text = text.replace(
'''      ...(record.ownerId ? { ownerId: record.ownerId } : {}),
      ...(record.revokedAt ? { revokedAt: record.revokedAt } : {}),
''',
'''      ...(record.ownerId ? { ownerId: record.ownerId } : {}),
      capabilities: normalizeScopeValues(record.capabilities),
      resourceScopes: normalizeScopeValues(record.resourceScopes),
      ...(record.revokedAt ? { revokedAt: record.revokedAt } : {}),
''',
1,
)
store.write_text(text)

security = Path("server/src/common/middleware/security.ts")
text = security.read_text()
text = text.replace(
'''import { ApiKeyStore } from "../../platform/security/ApiKeyStore";
''',
'''import {
  ApiKeyStore,
  type ApiKeyPrincipal,
} from "../../platform/security/ApiKeyStore";
''',
1,
)
anchor = '''let apiKeyStore: ApiKeyStore | null = null;
'''
addition = '''
export type ApiKeyAuthenticatedRequest = Request & {
  apiKeyPrincipal?: ApiKeyPrincipal;
};

export function getRequestApiKeyPrincipal(
  req: Request,
): ApiKeyPrincipal | null {
  return (req as ApiKeyAuthenticatedRequest).apiKeyPrincipal ?? null;
}
'''
if "getRequestApiKeyPrincipal" not in text:
    text = text.replace(anchor, anchor + addition, 1)
old = '''  if (apiKey && getApiKeyStore().validate(apiKey)) {
    // Registered API key authentication (Studio plugin, CI/CD)
    next();
    return;
  }
'''
new = '''  const apiKeyPrincipal = apiKey
    ? getApiKeyStore().resolvePrincipal(apiKey)
    : null;
  if (apiKeyPrincipal) {
    // API keys authenticate as their own principal. They never gain an implicit
    // user identity or wildcard capability; unscoped legacy keys resolve with
    // empty capability and resource-scope arrays.
    (req as ApiKeyAuthenticatedRequest).apiKeyPrincipal = apiKeyPrincipal;
    next();
    return;
  }
'''
if old not in text:
    raise SystemExit("api key middleware anchor missing")
text = text.replace(old, new, 1)
security.write_text(text)
