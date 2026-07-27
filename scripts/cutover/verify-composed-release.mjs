import assert from "node:assert/strict";
import https from "node:https";
import { io } from "socket.io-client";

const origin = process.env.RELEASE_ORIGIN ?? "https://localhost:8443";
const allowedOrigin = new URL(origin).origin;
const disallowedOrigin = "https://not-allowed.example";
const verificationPassword = process.env.POSTGRES_PASSWORD;
assert.ok(
  verificationPassword,
  "POSTGRES_PASSWORD is required",
);

await waitForHealthyRelease();

const frontendHealth = await request("/health");
assert.equal(frontendHealth.status, 200);
assert.match(frontendHealth.body, /"service":"roblox-ai-studio-frontend"/);

const backendHealth = await request("/backend-health");
assert.equal(backendHealth.status, 200);
assert.match(backendHealth.body, /"status":"healthy"/);

const documentResponse = await request("/");
assert.equal(documentResponse.status, 200);
assert.match(documentResponse.body, /<html/i);
assert.match(documentResponse.body, /Roblox AI Studio/i);

const allowedPreflight = await request("/api/platform/auth/login", {
  method: "OPTIONS",
  headers: {
    Origin: allowedOrigin,
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "content-type",
  },
});
assert.equal(allowedPreflight.status, 204);
assert.equal(
  allowedPreflight.headers["access-control-allow-origin"],
  allowedOrigin,
);
assert.equal(
  allowedPreflight.headers["access-control-allow-credentials"],
  "true",
);

const rejectedOrigin = await request("/api/system/status", {
  headers: { Origin: disallowedOrigin },
});
assert.equal(rejectedOrigin.status, 403);
assert.match(rejectedOrigin.body, /Origin not allowed/);

const credentials = {
  email: `cutover-1c-${Date.now()}@example.test`,
  password: verificationPassword,
  displayName: "CUTOVER-1C Verification",
};
const registration = await request("/api/platform/auth/register", {
  method: "POST",
  headers: {
    Origin: allowedOrigin,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(credentials),
});
assert.equal(registration.status, 200, registration.body);

const setCookies = registration.headers["set-cookie"] ?? [];
assert.ok(Array.isArray(setCookies), "Expected multiple Set-Cookie headers");
const accessCookie = setCookies.find((value) =>
  value.startsWith("roblox_ai_token="),
);
const refreshCookie = setCookies.find((value) =>
  value.startsWith("roblox_ai_refresh="),
);
assert.ok(accessCookie, "Missing access cookie");
assert.ok(refreshCookie, "Missing refresh cookie");
assertCookiePolicy(accessCookie, { path: "/" });
assertCookiePolicy(refreshCookie, { path: "/api/platform/auth/refresh" });

const cookieHeader = setCookies
  .map((value) => value.split(";", 1)[0])
  .join("; ");
const accessCookieHeader = accessCookie.split(";", 1)[0];

const currentUser = await request("/api/platform/auth/me", {
  headers: {
    Origin: allowedOrigin,
    Cookie: cookieHeader,
  },
});
assert.equal(currentUser.status, 200, currentUser.body);
const currentUserPayload = JSON.parse(currentUser.body);
assert.equal(currentUserPayload.success, true);
assert.equal(currentUserPayload.data.user.email, credentials.email);

await assertSocketRejectedWithoutCookie();
await assertSocketAcceptedWithCookie(accessCookieHeader);

console.log(
  JSON.stringify(
    {
      status: "passed",
      origin: allowedOrigin,
      frontendHealth: frontendHealth.status,
      backendHealth: backendHealth.status,
      ssrDocument: documentResponse.status,
      corsAllowed: allowedPreflight.status,
      corsRejected: rejectedOrigin.status,
      authenticatedRest: currentUser.status,
      authenticatedSocket: true,
      unauthenticatedSocketRejected: true,
      hostOnlyCookies: true,
    },
    null,
    2,
  ),
);

async function waitForHealthyRelease() {
  let lastError;
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      const [frontend, backend] = await Promise.all([
        request("/health"),
        request("/backend-health"),
      ]);
      if (frontend.status === 200 && backend.status === 200) return;
      lastError = new Error(
        `Release not healthy yet: frontend=${frontend.status}, backend=${backend.status}`,
      );
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw lastError ?? new Error("Release did not become healthy");
}

function request(pathname, { method = "GET", headers = {}, body } = {}) {
  const url = new URL(pathname, origin);
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method,
        headers,
        rejectUnauthorized: false,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    request.on("error", reject);
    if (body !== undefined) request.write(body);
    request.end();
  });
}

function assertCookiePolicy(cookie, { path }) {
  assert.match(cookie, /;\s*HttpOnly(?:;|$)/i);
  assert.match(cookie, /;\s*Secure(?:;|$)/i);
  assert.match(cookie, /;\s*SameSite=Lax(?:;|$)/i);
  assert.match(
    cookie,
    new RegExp(`;\\s*Path=${escapeRegExp(path)}(?:;|$)`, "i"),
  );
  assert.doesNotMatch(cookie, /;\s*Domain=/i, "Cookie must remain host-only");
}

function assertSocketRejectedWithoutCookie() {
  return new Promise((resolve, reject) => {
    const socket = createSocket();
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("Unauthenticated Socket.IO connection did not fail"));
    }, 8_000);

    socket.once("connect", () => {
      clearTimeout(timer);
      socket.close();
      reject(new Error("Unauthenticated Socket.IO connection was accepted"));
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      socket.close();
      try {
        assert.match(error.message, /Authentication required/);
        resolve();
      } catch (assertionError) {
        reject(assertionError);
      }
    });
  });
}

function assertSocketAcceptedWithCookie(cookie) {
  return new Promise((resolve, reject) => {
    const socket = createSocket(cookie);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("Authenticated Socket.IO connection timed out"));
    }, 8_000);

    socket.once("connect", () => {
      clearTimeout(timer);
      socket.close();
      resolve();
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      socket.close();
      reject(error);
    });
  });
}

function createSocket(cookie) {
  return io(origin, {
    path: "/socket.io",
    transports: ["websocket"],
    withCredentials: true,
    reconnection: false,
    timeout: 5_000,
    rejectUnauthorized: false,
    extraHeaders: {
      Origin: allowedOrigin,
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
