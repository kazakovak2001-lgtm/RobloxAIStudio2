#!/usr/bin/env node

import fs from "fs";
import path from "path";
import https from "https";
import url from "url";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readFile(filePath) {
  return fs.promises.readFile(filePath, "utf8");
}

async function writeFile(filePath, content) {
  return fs.promises.writeFile(filePath, content, "utf8");
}

const ROBLOX_CUTOVER_1C = {
  backend: {
    image: "roblox-ai-studio-backend:cutover-1c",
    port: 5051,
    env: "production",
  },
  frontend: {
    image: "roblox-ai-studio-frontend:cutover-1c",
    port: 8443,
  },
};

const contractFile = path.join(
  process.env.GITHUB_WORKSPACE || process.cwd(),
  "artifacts/int-201/runtime.env",
);
const contractEnv = {
  INT201_FRONTEND_ORIGIN: "https://localhost:8443",
  INT201_API_URL: "https://localhost:8443/api",
  INT201_SOCKET_URL: "https://localhost:8443",
};

const certDir = path.join(
  process.env.GITHUB_WORKSPACE || process.cwd(),
  ".cutover-certs",
);
const certFile = path.join(certDir, "release.crt");
const keyFile = path.join(certDir, "release.key");

async function loadCertificates() {
  const crt = await readFile(certFile);
  const key = await readFile(keyFile);
  return { crt, key };
}

function request(pathname, { method = "GET", headers = {}, body } = {}) {
  const targetUrl = new URL(pathname, contractEnv.INT201_SOCKET_URL);
  return new Promise((resolve, reject) => {
    const { crt } = loadCertificates();
    const req = https.request(
      targetUrl,
      {
        method,
        headers,
        rejectUnauthorized: true,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const buffer = Buffer.concat(chunks);
          const text = buffer.toString("utf8");
          if (response.statusCode >= 400) {
            return reject(
              new Error(
                `${method} ${pathname} returned ${response.statusCode}: ${text}`,
              ),
            );
          }
          try {
            resolve(text ? JSON.parse(text) : {});
          } catch (err) {
            reject(
              new Error(
                `Failed to parse response from ${method} ${pathname}: ${err.message}`,
              ),
            );
          }
        });
      },
    );
    req.on("error", reject);
    if (body) {
      req.write(typeof body === "string" ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function verifyBackendHealth() {
  try {
    const health = await request("/health");
    if (!health.status || health.status !== "healthy") {
      throw new Error(`Backend health status: ${health.status}`);
    }
    console.log("✓ Backend health check passed");
  } catch (err) {
    throw new Error(`Backend health check failed: ${err.message}`);
  }
}

async function main() {
  try {
    await loadCertificates();
    console.log("✓ TLS certificates loaded");

    await verifyBackendHealth();
  } catch (err) {
    console.error("✗ Contract verification failed:", err.message);
    process.exit(1);
  }
}

main();
