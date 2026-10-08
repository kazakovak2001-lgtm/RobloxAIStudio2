#!/usr/bin/env bash
#
# CI-PRODUCTION-CONTRACT-CONTROL-HEAD-2 regression tests.
#
# Exercises scripts/ci/resolve-frontend-control-head.sh and
# scripts/ci/verify-frontend-control-pair.sh against local git fixtures (no
# network) to prove:
#   1. the current control branch head is accepted, and a stale cached/static
#      SHA cannot silently win once the branch has moved
#   2. a control head whose branch does not descend from the configured
#      runtime SHA is rejected
#   3. a missing/renamed control branch is rejected
#   4. a reciprocal manifest mismatch is rejected
#
# Usage: bash scripts/ci/__tests__/resolve-frontend-control-pair.test.sh
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
resolve_script="$repo_root/scripts/ci/resolve-frontend-control-head.sh"
verify_script="$repo_root/scripts/ci/verify-frontend-control-pair.sh"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

pass_count=0
fail_count=0

pass() { pass_count=$((pass_count + 1)); echo "PASS: $1"; }
fail() { fail_count=$((fail_count + 1)); echo "FAIL: $1"; }

git_quiet() { git "$@" >/dev/null 2>&1; }

# ── Fixture: a "backend" repo standing in for this repo's own history ──────
backend_dir="$work/backend"
mkdir -p "$backend_dir"
git -C "$backend_dir" init --quiet --initial-branch=main
git -C "$backend_dir" config user.email test@example.com
git -C "$backend_dir" config user.name test
git -C "$backend_dir" commit --quiet --allow-empty -m "backend runtime commit"
backend_runtime_sha="$(git -C "$backend_dir" rev-parse HEAD)"
git -C "$backend_dir" commit --quiet --allow-empty -m "backend HEAD under test"
backend_head_sha="$(git -C "$backend_dir" rev-parse HEAD)"

# A backend commit NOT reachable from the fixture's HEAD, for the "runtime
# ancestry rejected" case.
git -C "$backend_dir" checkout --quiet -b orphan-branch "$backend_runtime_sha"
git -C "$backend_dir" commit --quiet --allow-empty -m "diverged, not an ancestor of main"
unreachable_backend_sha="$(git -C "$backend_dir" rev-parse HEAD)"
git -C "$backend_dir" checkout --quiet main

# ── Fixture: a "frontend" repo with a movable control branch ───────────────
frontend_dir="$work/frontend"
mkdir -p "$frontend_dir/config/integration"
git -C "$frontend_dir" init --quiet --initial-branch=main
git -C "$frontend_dir" config user.email test@example.com
git -C "$frontend_dir" config user.name test
git -C "$frontend_dir" commit --quiet --allow-empty -m "frontend runtime commit"
frontend_runtime_sha="$(git -C "$frontend_dir" rev-parse HEAD)"

write_manifest() {
  cat > "$frontend_dir/config/integration/paired-release.json" <<JSON
{
  "frontend": { "runtimeSha": "$frontend_runtime_sha" },
  "backend": { "runtimeSha": "$backend_runtime_sha" }
}
JSON
  git -C "$frontend_dir" add config/integration/paired-release.json
  git -C "$frontend_dir" commit --quiet -m "$1"
}
write_manifest "control branch commit 1"
control_branch="control"
git -C "$frontend_dir" checkout --quiet -b "$control_branch"

write_backend_manifest() {
  cat > "$backend_dir/manifest.json" <<JSON
{
  "runtimePair": {
    "id": "TEST-PAIR",
    "backend": { "commit": "$1" },
    "frontend": {
      "repository": "kazakovak2001-lgtm/Frontend",
      "controlBranch": "$2",
      "runtimeCommit": "$3"
    }
  }
}
JSON
}

run_resolve() {
  ( cd "$backend_dir" && FRONTEND_REPO_URL="$frontend_dir" "$resolve_script" manifest.json )
}

# ── Scenario 1: current branch head accepted; stale cached SHA cannot win ──
write_backend_manifest "$backend_runtime_sha" "$control_branch" "$frontend_runtime_sha"
out1="$(run_resolve)"
resolved1="$(echo "$out1" | sed -n 's/^resolved_control=//p')"
head1="$(git -C "$frontend_dir" rev-parse "$control_branch")"
if [[ "$resolved1" == "$head1" ]]; then
  pass "resolves the current control branch head"
else
  fail "resolves the current control branch head (got $resolved1, expected $head1)"
fi

# Advance the control branch — a real #51/#52-shaped merge landing after the
# first resolution. A cached/static commit from resolution #1 must not be
# what a fresh resolution returns.
git -C "$frontend_dir" commit --quiet --allow-empty -m "control branch advances (e.g. #51/#52 merge)"
head2="$(git -C "$frontend_dir" rev-parse "$control_branch")"
out2="$(run_resolve)"
resolved2="$(echo "$out2" | sed -n 's/^resolved_control=//p')"
if [[ "$resolved2" == "$head2" && "$resolved2" != "$resolved1" ]]; then
  pass "stale control SHA cannot silently win — resolution follows the branch forward"
else
  fail "stale control SHA cannot silently win (got $resolved2, expected $head2, previous was $resolved1)"
fi

# ── Scenario 2: control head not descended from runtime SHA is rejected ───
# A frontend runtime SHA that only exists on an unrelated line of history —
# the control branch (which does contain the real frontend_runtime_sha) does
# not descend from it.
git -C "$frontend_dir" checkout --quiet main
git -C "$frontend_dir" commit --quiet --allow-empty -m "unrelated frontend runtime candidate"
unrelated_frontend_runtime_sha="$(git -C "$frontend_dir" rev-parse HEAD)"
git -C "$frontend_dir" checkout --quiet "$control_branch"

frontend_checkout="$work/frontend-checkout"
git clone --quiet "$frontend_dir" "$frontend_checkout"
git -C "$frontend_checkout" checkout --quiet "$control_branch"

if "$verify_script" "$frontend_checkout" "$unrelated_frontend_runtime_sha" "$backend_runtime_sha" 2>/tmp/verify-ancestry.err; then
  fail "wrong runtime ancestry rejected (script exited 0, expected failure)"
else
  if grep -q "RELEASE PAIR DRIFT" /tmp/verify-ancestry.err; then
    pass "wrong runtime ancestry rejected"
  else
    fail "wrong runtime ancestry rejected (wrong error: $(cat /tmp/verify-ancestry.err))"
  fi
fi

# Sanity: the *correct* runtime SHA against the same checkout passes ancestry
# (isolates the ancestry check from the reciprocal-manifest check below).
if git -C "$frontend_checkout" merge-base --is-ancestor "$frontend_runtime_sha" HEAD; then
  pass "correct runtime SHA is accepted as an ancestor (control case)"
else
  fail "correct runtime SHA is accepted as an ancestor (control case)"
fi

# ── Scenario 3: missing/renamed control branch is rejected ─────────────────
write_backend_manifest "$backend_runtime_sha" "does-not-exist-branch" "$frontend_runtime_sha"
if run_resolve >/tmp/resolve-missing.out 2>/tmp/resolve-missing.err; then
  fail "missing branch rejected (script exited 0, expected failure)"
else
  if grep -q "RELEASE PAIR DRIFT" /tmp/resolve-missing.err; then
    pass "missing control branch rejected"
  else
    fail "missing control branch rejected (wrong error: $(cat /tmp/resolve-missing.err))"
  fi
fi

# ── Scenario 3b: backend runtime SHA not an ancestor of backend HEAD ───────
write_backend_manifest "$unreachable_backend_sha" "$control_branch" "$frontend_runtime_sha"
if run_resolve >/tmp/resolve-backend.out 2>/tmp/resolve-backend.err; then
  fail "backend runtime not ancestor of backend HEAD rejected (script exited 0, expected failure)"
else
  if grep -q "RELEASE PAIR DRIFT" /tmp/resolve-backend.err; then
    pass "backend runtime not ancestor of backend HEAD rejected"
  else
    fail "backend runtime not ancestor of backend HEAD rejected (wrong error: $(cat /tmp/resolve-backend.err))"
  fi
fi

# ── Scenario 4: reciprocal manifest mismatch is rejected ───────────────────
other_sha="$(git -C "$backend_dir" commit-tree "$(git -C "$backend_dir" rev-parse HEAD^{tree})" -m "unrelated sha" </dev/null)"
if "$verify_script" "$frontend_checkout" "$frontend_runtime_sha" "$other_sha" 2>/tmp/verify-reciprocal.err; then
  fail "reciprocal manifest mismatch rejected (script exited 0, expected failure)"
else
  if grep -q "RELEASE PAIR DRIFT" /tmp/verify-reciprocal.err; then
    pass "reciprocal manifest mismatch rejected"
  else
    fail "reciprocal manifest mismatch rejected (wrong error: $(cat /tmp/verify-reciprocal.err))"
  fi
fi

# ── Sanity: the fully-consistent pair passes both scripts end to end ───────
write_backend_manifest "$backend_runtime_sha" "$control_branch" "$frontend_runtime_sha"
out_ok="$(run_resolve)"
resolved_ok="$(echo "$out_ok" | sed -n 's/^resolved_control=//p')"
( cd "$frontend_checkout" && git fetch --quiet origin "$control_branch" && git checkout --quiet "$resolved_ok" )
if "$verify_script" "$frontend_checkout" "$frontend_runtime_sha" "$backend_runtime_sha" >/tmp/verify-ok.out; then
  pass "fully consistent pair verifies end to end"
else
  fail "fully consistent pair verifies end to end ($(cat /tmp/verify-ok.out))"
fi

echo
echo "== $pass_count passed, $fail_count failed =="
[[ "$fail_count" -eq 0 ]]
