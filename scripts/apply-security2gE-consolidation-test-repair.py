from pathlib import Path

path = Path("server/src/__tests__/security2gE.authorization-domains.test.ts")
text = path.read_text()
text = text.replace(
'''      ["GET", "/api/system/status"],
      ["GET", "/api/system/agents"],
''',
'',
1,
)
anchor = '''      expect(protectedPassed).toBe(false);
      expect(protectedStatus).toBe(401);
'''
addition = '''

      for (const protectedPath of [
        "/api/system/status",
        "/api/system/agents",
      ]) {
        let passed = false;
        let status = 0;
        await authMiddleware(
          { method: "GET", path: protectedPath, headers: {} } as never,
          {
            status: (value: number) => {
              status = value;
              return { json: () => undefined };
            },
          } as never,
          () => {
            passed = true;
          },
        );
        expect(passed, protectedPath).toBe(false);
        expect(status, protectedPath).toBe(401);
      }
'''
if anchor not in text:
    raise SystemExit("authorization domains anchor missing")
text = text.replace(anchor, anchor + addition, 1)
path.write_text(text)

for filename in [
    "server/src/__tests__/security2gE.domain-scope.test.ts",
    "server/src/__tests__/security2gE.system-metadata-scope.test.ts",
]:
    path = Path(filename)
    text = path.read_text()
    old = 'expect(securitySource).toContain("getApiKeyStore().validate(apiKey)");'
    new = '''expect(securitySource).toContain(
      "getApiKeyStore().resolvePrincipal(apiKey)",
    );
    expect(securitySource).toContain(
      "(req as ApiKeyAuthenticatedRequest).apiKeyPrincipal = apiKeyPrincipal",
    );'''
    if old not in text:
        raise SystemExit(f"legacy api-key assertion missing in {filename}")
    text = text.replace(old, new, 1)
    path.write_text(text)
