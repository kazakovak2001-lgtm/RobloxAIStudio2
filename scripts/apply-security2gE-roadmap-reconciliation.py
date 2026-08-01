from pathlib import Path

path = Path("docs/00-project-control/ROADMAP_STATUS.md")
text = path.read_text()

replacements = [
    (
        "**Current backend release:** `release/cutover-1e-candidate@76f4e7a7be1684ac7984533d6c8d698ba6c99e7e`",
        "**Current backend release:** `release/cutover-1e-candidate@d55fdb4d7eb920d0271d1ee7affe08666cdb270a`",
    ),
    (
        "| `SECURITY-2G` | Dependency, SAST, credential, image, SBOM, and RBAC control gate | High | In progress — `SECURITY-2G-D` | `DURABILITY-2E` |",
        "| `SECURITY-2G` | Dependency, SAST, credential, image, SBOM, and RBAC control gate | High | In progress — `SECURITY-2G-E` | `DURABILITY-2E` |",
    ),
    (
        "**Status:** In progress — image scanning and SBOM slice  \n**Tracker:** issue #154  \n**Backend baseline:** `release/cutover-1e-candidate@76f4e7a7be1684ac7984533d6c8d698ba6c99e7e`",
        "**Status:** In progress — RBAC and authorization parity slice  \n**Tracker:** issue #156  \n**Backend baseline:** `release/cutover-1e-candidate@d55fdb4d7eb920d0271d1ee7affe08666cdb270a`",
    ),
    (
        "`SECURITY-2G-A` established the truthful policy contract. `SECURITY-2G-B` completed production dependency controls. `SECURITY-2G-C` completed backend CodeQL and Gitleaks evidence. `SECURITY-2G-D` now implements exact backend and paired Frontend runtime-image scanning, digest-bound SPDX SBOM evidence, deterministic policy validation and hardened runtime images with npm removed from final stages. Existing protected CI remains prerequisite evidence. Frontend-owned SAST and credential coverage, authorization controls and the consolidated gate remain separate work.",
        "`SECURITY-2G-A` established the truthful policy contract. `SECURITY-2G-B` completed production dependency controls. `SECURITY-2G-C` completed backend CodeQL and Gitleaks evidence. `SECURITY-2G-D` completed exact backend and paired Frontend runtime-image scanning, digest-bound SPDX SBOM evidence, deterministic policy validation and hardened runtime images with npm removed from final stages. `SECURITY-2G-E` is the active draft slice: its generated matrix covers 204 REST and Socket operations with complete classification and evidence references, API-key eligible routes enforce explicit capabilities and resource scopes, and the two client Socket.IO authority events have positive and negative parity evidence. The consolidated gate remains separate `SECURITY-2G-F` work.",
    ),
    (
        "| Application RBAC | Not yet inventoried as one authoritative matrix | Backend application | Unit, integration and contract tests | Every protected REST and Socket.IO operation has positive and negative authorization evidence | Route/event matrix and test evidence |",
        "| Application RBAC | Implemented on draft PR #157; pending reviewed merge | Backend application | Generated authorization matrix plus unit, integration and contract tests | Every protected REST and Socket.IO operation has classification, capability, resource scope and positive/negative evidence | 204-operation route/event matrix, 50 SECURITY-2G-E test files, 137 passing tests |",
    ),
    (
        "Completion of `SECURITY-2G-D` does not complete `SECURITY-2G`; Frontend-owned SAST and credential coverage, authorization parity and the consolidated-gate slice remain separate work.",
        "Completion of `SECURITY-2G-D` does not complete `SECURITY-2G`. `SECURITY-2G-E` remains a draft until reviewed and merged; `SECURITY-2G-F` remains the separate consolidated blocking gate and final documentation reconciliation.",
    ),
    (
        "- `SECURITY-2G-D`: issue #154 and draft PR #155; exact paired runtime-image scanning, digest-bound SPDX SBOM evidence and deterministic image policy validation are active on the PR branch.\n- Active paired release: backend merge `76f4e7a7be1684ac7984533d6c8d698ba6c99e7e` plus Frontend contents `022788ace31982e2b08ea099800de784b4dbe482`.",
        "- `SECURITY-2G-D`: issue #154 and PR #155; merged commit `d55fdb4d7eb920d0271d1ee7affe08666cdb270a`; exact paired runtime-image scanning, digest-bound SPDX SBOM evidence and deterministic image policy validation are complete.\n- `SECURITY-2G-E`: issue #156 and draft PR #157; generated authorization matrix contains 204 classified operations with no missing evidence references; all 26 API-key eligible operations enforce explicit capabilities and resource scopes; Socket.IO `project:join` and `project:leave` have positive and negative parity evidence; consolidated validation passes 50 test files and 137 tests plus TypeScript.\n- Active paired release: backend merge `d55fdb4d7eb920d0271d1ee7affe08666cdb270a` plus Frontend contents `022788ace31982e2b08ea099800de784b4dbe482`.",
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f"roadmap anchor missing: {old[:100]}")
    text = text.replace(old, new, 1)

path.write_text(text)
