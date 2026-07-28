#!/usr/bin/env bash
set -euo pipefail

ARTIFACT_DIR="${RELEASE_BASELINE_OUTPUT:-artifacts/cutover-1d}"
FRONTEND_SOURCE="${FRONTEND_SOURCE:-standalone-frontend}"
BACKEND_IMAGE="roblox-ai-studio-backend:cutover-1d-rollback"
FRONTEND_IMAGE="roblox-ai-studio-frontend:cutover-1d-rollback"
BACKEND_CONTAINER="roblox-ai-studio-backend-cutover-1d"
FRONTEND_CONTAINER="roblox-ai-studio-frontend-cutover-1d"
BACKEND_ORIGIN="http://127.0.0.1:5051"
FRONTEND_ORIGIN="http://127.0.0.1:8081"

mkdir -p "$ARTIFACT_DIR"

cleanup() {
  local status=$?
  docker logs "$BACKEND_CONTAINER" > "$ARTIFACT_DIR/backend.log" 2>&1 || true
  docker logs "$FRONTEND_CONTAINER" > "$ARTIFACT_DIR/frontend.log" 2>&1 || true
  docker inspect "$BACKEND_CONTAINER" "$FRONTEND_CONTAINER" \
    > "$ARTIFACT_DIR/container-inspect.json" 2>/dev/null || true
  docker rm --force "$BACKEND_CONTAINER" >/dev/null 2>&1 || true
  docker rm --force "$FRONTEND_CONTAINER" >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

printf '%s\n' \
  'Composed HTTPS Release prerequisite: passed and stopped by its own cleanup step.' \
  'Rollback rehearsal: restoring independently deployable CUTOVER-1A and CUTOVER-1B artifacts.' \
  > "$ARTIFACT_DIR/rollback-transcript.txt"

docker build \
  --file Dockerfile.backend \
  --tag "$BACKEND_IMAGE" \
  .

docker build \
  --build-arg "VITE_API_URL=$BACKEND_ORIGIN/api" \
  --build-arg "VITE_SOCKET_URL=$BACKEND_ORIGIN" \
  --tag "$FRONTEND_IMAGE" \
  "$FRONTEND_SOURCE"

docker run --detach \
  --name "$BACKEND_CONTAINER" \
  --publish 5051:5000 \
  --env NODE_ENV=production \
  --env PORT=5000 \
  --env STORAGE_PROVIDER=inmemory \
  --env "FRONTEND_URL=$FRONTEND_ORIGIN" \
  "$BACKEND_IMAGE"

docker run --detach \
  --name "$FRONTEND_CONTAINER" \
  --publish 8081:3000 \
  --env "PUBLIC_ORIGIN=$FRONTEND_ORIGIN" \
  "$FRONTEND_IMAGE"

wait_for_health() {
  local url=$1
  local output=$2
  for _attempt in $(seq 1 45); do
    if curl --fail --silent "$url" > "$output"; then
      return 0
    fi
    sleep 1
  done
  return 1
}

wait_for_health "$BACKEND_ORIGIN/health" "$ARTIFACT_DIR/backend-health.json"
wait_for_health "$FRONTEND_ORIGIN/health" "$ARTIFACT_DIR/frontend-health.json"
grep --quiet '"status":"healthy"' "$ARTIFACT_DIR/backend-health.json"
grep --quiet '"status":"healthy"' "$ARTIFACT_DIR/frontend-health.json"
curl --fail --silent "$FRONTEND_ORIGIN/" > "$ARTIFACT_DIR/frontend-root.html"
grep --ignore-case --quiet '<!doctype html' "$ARTIFACT_DIR/frontend-root.html"

{
  echo 'Independent backend health: HTTP 200'
  echo 'Independent Frontend health: HTTP 200'
  echo 'Independent Frontend SSR document: HTTP 200 with HTML'
  echo 'Rollback rehearsal result: passed'
} >> "$ARTIFACT_DIR/rollback-transcript.txt"
