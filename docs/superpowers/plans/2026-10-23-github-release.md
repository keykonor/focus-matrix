# GitHub MIT Release Implementation Plan

> Execute inline with the executing-plans skill. The user explicitly requested direct implementation, repository creation, GitHub-hosted builds and publication.

**Goal:** Publish the complete audited Focus Matrix source under MIT and release a Windows x64 NSIS installer built and checked by GitHub Actions.

**Architecture:** Preserve the existing Git history and snapshot tags. Work on `codex/github-mit-release` in an isolated worktree. GitHub Actions uses a clean Windows runner, runs the existing tests, builds through the Tauri CLI, tests installer data preservation, and publishes only explicitly selected release assets.

**Tech Stack:** Tauri 2, Rust MSVC, React, TypeScript, Node 24, PowerShell, NSIS, GitHub Actions and GitHub CLI.

**Spec:** The user's 2026-10-23 instruction and the preceding publication audit.

## Global Constraints

- Version: 0.2.0. License: MIT. Repository: keykonor/focus-matrix, public.
- Preserve `com.focusmatrix.desktop`, current storage schema, all local versions and user data.
- Do not install the new program on the user's computer or deploy/change the cloud service.
- Never publish ignored outputs, signing keys, credentials, user data or backup directories.
- Historical artifacts retain their real dates, commits and verification limits.
- Use `npm run tauri build -- --no-bundle`, then the Tauri bundle command; never ship plain cargo-build output.

## Review Focus

- A running or tray-hidden app must cause installer preparation to stop before any forced process shutdown.
- Backups must contain exact bytes, previous state, histories and encrypted credentials, without recursively copying old backups.
- Uninstall and reinstall must preserve data, unknown fields and window state.
- Public uploads must include source and existing history, and exclude private files and runtime data.
- Publication must depend on successful hosted build and installer checks, with SHA-256 and source provenance.

## Tasks

- [x] 1. Add isolated PowerShell tests for installer preparation; observe failure before implementing backup and running-process checks.
- [x] 2. Add MIT, public README, release notes, historical inventory, security/third-party notices, and unify version metadata.
- [x] 3. Add NSIS hooks and a Windows release workflow with tests, formal build, installer preservation smoke checks and explicit release assets.
- [x] 4. Run local checks, review the upload set/history, preserve the finished source snapshot, and create/push the public repository and original tags.
- [x] 5. Trigger and monitor GitHub Actions, correct real failures, verify the published release/download checksums, and report links and limitations.

## Decisions and progress

- User authorized publishing and chose MIT; no additional publish confirmation is needed.
- Official GitHub connector cannot create repositories or Releases; official GitHub CLI authenticated through the user's device flow is used for those operations.
- Baseline: all 37 Vitest tests passed in the isolated worktree.
- Pre-change source snapshot: `versions/20261022-170404-819Z-39cd875b`, commit `719f9d3`.
- The installer blocks on running processes instead of killing them. Users save and exit from the tray before retrying.
- Existing cloud endpoints remain unchanged. README explicitly limits the public package's cloud functionality; no personal credentials are distributed.
- Local verification: 37 Vitest, 4 source-snapshot tests, full-update PowerShell checks, installer preparation checks, frontend build and isolated midnight/layout browser acceptance passed. Git-writing tests and generated assets required sandbox escalation; source behavior was not changed to bypass the sandbox.
- Desktop history: 363 blobs scanned; separate web history: 191 blobs scanned. No private paths or common credential/share-link patterns found. This is a scoped scan, not a guarantee against all secret formats.
- Published [0.2.0](https://github.com/keykonor/focus-matrix/releases/tag/v0.2.0) from commit `34af03c1c41e61712e327264af9e0760cbd46839`. Both jobs in [run 39828482672](https://github.com/keykonor/focus-matrix/actions/runs/39828482672) succeeded. See [the verification record](../../releases/verification-v0.2.0.md) for checksums and limits.
