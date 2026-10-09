#!/usr/bin/env bash
#
# CI-PRODUCTION-CONTRACT-CONTROL-HEAD-2.
#
# Resolves the canonical Frontend control branch HEAD from the runtimePair
# authority release-pair-freshness.yml (#247) established, instead of the
# static `frontendRelease.commit` pin that job never updates. Must run inside
# the backend checkout (uses HEAD for the backend ancestry check).
#
# Usage:
#   resolve-frontend-control-head.sh <manifest-path>
#
# On success, prints one `key=value` line per field to stdout and exits 0:
#   backend_runtime=<sha>
#   frontend_repo=<owner/name>
#   frontend_control_branch=<branch>
#   frontend_runtime=<sha>
#   pair_id=<id>
#   resolved_control=<sha>
#
# Fails closed (prints "RELEASE PAIR DRIFT: ..." to stderr, exits 1) on:
#   - a missing/invalid pair SHA in the manifest
#   - a missing Frontend control repository or branch
#   - a backend runtime SHA that is not an ancestor of the current HEAD
#   - a Frontend control branch that cannot be resolved (missing/deleted)
#   - a resolved control head that is not a valid 40-char SHA
set -euo pipefail

manifest="${1:?usage: resolve-frontend-control-head.sh <manifest-path>}"

backend_runtime="$(jq -r '.runtimePair.backend.commit' "$manifest")"
frontend_repo="$(jq -r '.runtimePair.frontend.repository' "$manifest")"
frontend_control_branch="$(jq -r '.runtimePair.frontend.controlBranch' "$manifest")"
frontend_runtime="$(jq -r '.runtimePair.frontend.runtimeCommit' "$manifest")"
pair_id="$(jq -r '.runtimePair.id' "$manifest")"

for sha in "$backend_runtime" "$frontend_runtime"; do
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || {
    echo "RELEASE PAIR DRIFT: invalid pair SHA: $sha" >&2
    exit 1
  }
done
[[ -n "$frontend_repo" && "$frontend_repo" != "null" ]] || {
  echo "RELEASE PAIR DRIFT: missing Frontend control repository" >&2
  exit 1
}
[[ -n "$frontend_control_branch" && "$frontend_control_branch" != "null" ]] || {
  echo "RELEASE PAIR DRIFT: missing Frontend control branch" >&2
  exit 1
}

git merge-base --is-ancestor "$backend_runtime" HEAD || {
  echo "RELEASE PAIR DRIFT: backend runtime $backend_runtime is not an ancestor of $(git rev-parse HEAD)" >&2
  exit 1
}

# FRONTEND_REPO_URL lets tests point this at a local fixture path instead of
# a real https://github.com/<repo>.git URL; production always uses the repo
# named in the manifest.
frontend_repo_url="${FRONTEND_REPO_URL:-https://github.com/${frontend_repo}.git}"

resolved="$(git ls-remote "$frontend_repo_url" "refs/heads/${frontend_control_branch}" | awk '{print $1}')"
[[ "$resolved" =~ ^[0-9a-f]{40}$ ]] || {
  echo "RELEASE PAIR DRIFT: could not resolve Frontend control branch '${frontend_control_branch}' in ${frontend_repo}" >&2
  exit 1
}

printf '%s\n' \
  "backend_runtime=$backend_runtime" \
  "frontend_repo=$frontend_repo" \
  "frontend_control_branch=$frontend_control_branch" \
  "frontend_runtime=$frontend_runtime" \
  "pair_id=$pair_id" \
  "resolved_control=$resolved"
