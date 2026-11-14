# Changelog

## 0.4.0

- Add structured schedules, repeat rules, reminders and linked quadrant tasks.
- Preview, deduplicate and undo chat imports. Keep both calendar layouts.
- Consolidate records and sync controls, and group theme and density settings.
- Offer a standard installer and a disconnected installation kit with Qwen3.5 4B.

## 0.3.0

- Add one-level subtasks, task documents and images, date-memo attachments
  (files, images and links) and per-day diaries.
- Click a URL inside a task or memo to open it directly; remove the separate
  "open link" button.
- Add 24-hour / morning-afternoon-evening memo scheduling.
- Add native Windows file drop and copy-paste import, plus local image and
  link previews in history and the completed repository.
- Archive completed tasks automatically at local midnight.
- Stop saving task text on every typing pause. Enter saves the current content
  and creates the next task; Shift+Enter inserts a newline and IME confirmation
  does not submit.
- Keep saves for completion, deletion, movement, normal exit, daily memos and
  settings. Background cloud sync waits while task edits are unsubmitted and
  reads the last saved snapshot.
- Cover Enter submission, draft retention, failed-save retry and existing
  transaction protections with isolated browser regressions.

## 0.2.0

First public GitHub release. Its actual publication date is recorded by GitHub
Releases; it is not backdated to an earlier local build.

- Publish the desktop, Android, web, backend and gateway source under MIT,
  retaining upstream notices and existing source history.
- Add GitHub-hosted Windows x64 builds, tests, NSIS installer checks, SHA-256
  checksums and source provenance.
- Add installer preparation that blocks while the app is running, verifies a
  backup before installation/uninstallation, and preserves application data.
- Document local data, tray exit, upgrade, cloud limitations and historical
  source/binary distinctions.
- Keep the existing task model, daily memos, completed repository, midnight
  archive behavior, storage format and desktop application identifier.

## Earlier local versions

The desktop metadata remained 0.1.0 across multiple real local revisions. They
are identified by original commits, snapshot tags and binary hashes, not by
invented patch numbers. See [the historical inventory](docs/version-history.md).
Android has a separate 1.0.0–1.0.4 version sequence.
