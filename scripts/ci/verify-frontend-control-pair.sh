#!/usr/bin/env bash
#
# CI-PRODUCTION-CONTRACT-CONTROL-HEAD-2.
#
# Verifies a checked-out Frontend control head against the runtimePair
# authority: the resolved head must descend from the pinned Frontend runtime
# SHA (immutable runtime identity, preserved from #247), and the Frontend's
# own paired-release.json must reciprocally declare the same backend and
# frontend runtime SHAs (preserved from #247's reciprocal check).
#
# Usage:
#   verify-frontend-control-pair.sh <frontend-checkout-dir> <expected-frontend-runtime-sha> <expected-backend-runtime-sha>
#
# Fails closed (prints "RELEASE PAIR DRIFT: ..." to stderr, exits 1) on:
#   - the control head not descending from the expected Frontend runtime SHA
#   - a missing paired-release.json manifest
#   - an invalid SHA in that manifest
#   - either declared runtime SHA disagreeing with what this backend expects
set -euo pipefail

frontend_dir="${1:?usage: verify-frontend-control-pair.sh <frontend-checkout-dir> <expected-frontend-runtime> <expected-backend-runtime>}"
expected_frontend_runtime="${2:?missing expected-frontend-runtime-sha}"
expected_backend_runtime="${3:?missing expected-backend-runtime-sha}"

git -C "$frontend_dir" merge-base --is-ancestor "$expected_frontend_runtime" HEAD || {
  echo "RELEASE PAIR DRIFT: Frontend runtime $expected_frontend_runtime is not an ancestor of resolved control head $(git -C "$frontend_dir" rev-parse HEAD)" >&2
  exit 1
}

manifest="$frontend_dir/config/integration/paired-release.json"
[[ -f "$manifest" ]] || {
  echo "RELEASE PAIR DRIFT: missing Frontend paired-release manifest at $manifest" >&2
  exit 1
}

declared_frontend_runtime="$(jq -r '.frontend.runtimeSha' "$manifest")"
declared_backend_runtime="$(jq -r '.backend.runtimeSha' "$manifest")"
for sha in "$declared_frontend_runtime" "$declared_backend_runtime"; do
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || {
    echo "RELEASE PAIR DRIFT: invalid SHA in Frontend paired-release manifest: $sha" >&2
    exit 1
  }
done
test "$declared_frontend_runtime" = "$expected_frontend_runtime" || {
  echo "RELEASE PAIR DRIFT: Frontend manifest declares a different frontend runtime SHA" >&2
  exit 1
}
test "$declared_backend_runtime" = "$expected_backend_runtime" || {
  echo "RELEASE PAIR DRIFT: Frontend manifest declares a different backend runtime SHA" >&2
  exit 1
}

echo "OK"
