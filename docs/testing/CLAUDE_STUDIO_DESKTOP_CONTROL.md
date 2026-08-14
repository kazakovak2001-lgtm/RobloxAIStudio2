# Claude Code Roblox Studio Desktop Control

## Purpose

This project exposes a narrow local MCP bridge that lets Claude Code inspect and, with per-action operator approval, control the real Roblox Studio window on Windows. It exists for operator-observed acceptance that the automated `npm run studio:acceptance` engine fixtures cannot prove.

The bridge is project-scoped through `.mcp.json`. It never connects to a remote desktop service and implements no Roblox API, publish, upload, save, login, account, purchase, or credential operation.

## Safety boundary

The Windows helper accepts only a visible process named `RobloxStudioBeta` whose executable resolves below the current user's `%LOCALAPPDATA%\Roblox\Versions\` directory. It refuses requests when no eligible window exists or when the executable is ineligible. When multiple Studio processes exist, Claude must select an exact PID returned by the read-only window inventory; later input remains pinned to that PID. Read-only capture refuses a minimized window instead of restoring it without approval.

The exposed tools are:

| Tool                      | Effect                                                                                | Permission             |
| ------------------------- | ------------------------------------------------------------------------------------- | ---------------------- |
| `studio_list_windows`     | Lists eligible Studio main windows and their PIDs.                                    | Pre-approved read-only |
| `studio_window_status`    | Reports the selected eligible Studio window and bounds.                               | Pre-approved read-only |
| `studio_screenshot`       | Captures only the selected Studio window handle, scaled to at most 1024×768.          | Pre-approved read-only |
| `studio_click`            | Consumes a current screenshot token, maps its point inside Studio, and left-clicks.   | Ask every call         |
| `studio_type_text`        | Consumes a current screenshot token and sends up to 2,000 plain characters.           | Ask every call         |
| `studio_press_key`        | Consumes a current screenshot token and sends one allowlisted navigation or test key. | Ask every call         |
| `studio_capture_evidence` | Persists an approved Studio-window PNG under ignored local evidence.                  | Ask every call         |

Claude Code permissions deliberately do not blanket-approve input or evidence persistence. Do not change the `ask` rules to `allow`. Each screenshot returns a single-use `captureId`. Before input, the bridge recaptures the selected window and rejects the action unless the PID, title, executable, minimized state, bounds, dimensions, and a guarded UI-chrome fingerprint still match. The fingerprint samples the toolbar and side chrome with bounded perceptual tolerance while excluding the dynamic 3D viewport, title-bar foreground styling, and live Output area. The helper rechecks the exact bounds again after focusing Studio and, for a double-click, revalidates the same main handle, bounds, and foreground before the second click. The MCP tool still cannot semantically identify every dangerous button, so the operator approval prompt, capture binding, PID pinning, and the `studio-operator` policy are all load-bearing.

Never approve an action that targets login, account, purchase, upload, publish, Save to Roblox, credentials, moderation, or an external link. Use only a disposable Baseplate or an explicitly named local test place. A published place may be loaded only when the acceptance scope explicitly requires it; loading never authorizes saving or publishing.

## One-time enablement

Run Claude Code from the repository root. On first discovery of the project `.mcp.json`, approve the `roblox_studio_desktop` server itself. This approval makes the tools visible; it does not auto-approve clicks or keyboard input.

Verify the connection:

```text
/mcp
```

The server `roblox_studio_desktop` must report connected. If Claude Code was already running when `.mcp.json` changed, restart that session.

## Operator workflow

Open Roblox Studio with a disposable Baseplate or the explicitly authorized local test place. Claude will list eligible windows and pin the session to the selected PID. Then invoke:

```text
/studio-desktop-acceptance Inspect the disposable Baseplate for <exact objective>.
```

Claude delegates to `studio-operator`, captures the initial Studio-only screenshot, and requests approval before each input. Watch every approval target. Reject the action and stop if the current screenshot is stale or the requested control is not clearly inside the expected Studio surface.

Approved evidence is written below:

```text
artifacts/studio-acceptance/operator/<run-label>/<evidence-name>.png
```

This directory is ignored. Screenshots are local observations, not durable release truth until a reviewed acceptance record binds them to the exact backend and Frontend commits, plugin/package hash, Studio version, target, project/session/execution/command identifiers, and corresponding non-visual evidence.

## Evidence limits

Desktop control can prove visible Explorer, plugin-panel, and Play-mode observations. It does not by itself prove authentication, durable persistence, receipt correctness, multiplayer behavior, backend ownership, publishing safety, or subjective quality. Pair it with the automated Studio result, backend evidence, and the acceptance checklist for the slice under review.
