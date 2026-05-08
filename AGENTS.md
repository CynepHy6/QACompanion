# QACompanion Repository Context

## What This Repo Is
- `QACompanion` is a Chrome extension (Manifest V3) for exploratory testing.
- The project started as a fork of the original Exploratory Testing Chrome Extension and has been substantially extended.
- The codebase is plain JavaScript and HTML/CSS, without TypeScript.

## Main User Flows

### Action
- The popup has an `Action` pseudo-tab for classic exploratory testing notes.
- A user creates `Bug` and `Note` entries from a draft.
- A draft can contain:
  - text description
  - multiple screenshots
  - cropped screenshots with annotation editor
- The draft is saved incrementally and converted into a session annotation only on explicit save.
- Destructive draft clearing uses an arm/confirm pattern instead of a modal.

### Recorder
- The popup has a `Recorder` pseudo-tab for action recording and replay.
- Recorder currently supports:
  - `click`
  - `input`
  - `change`
  - `submit`
  - `navigation`
- Replay is currently limited to one tab with navigation support.
- Recorder shows a list of recorded steps and any linked screenshots.
- During replay:
  - the active step is highlighted in the popup
  - the popup scrolls to the active step when open
  - the target element on the page is scrolled into view and highlighted
- Recorded flow deletion also uses the same arm/confirm pattern as draft clearing.

## Key Files
- `manifest.json`: extension manifest and permissions
- `background.js`: central orchestrator for storage, messaging, screenshots, recorder lifecycle, replay, import/export
- `js/content_script.js`: page-side logic
  - crop selection flow
  - annotation editor integration
  - recorder event capture
  - replay execution and target highlighting
- `js/popup.js`: popup state, pseudo-tabs, Action UI, Recorder UI, arm/confirm buttons
- `popup.html`: popup structure
- `css/popUp.css`: popup styling for Action and Recorder modes
- `src/Session.js`: session model for exploratory testing annotations
- `src/Annotation.js`: `Bug` / `Note` annotation models
- `src/JSonSessionService.js`: JSON import/export for session data
- `src/Recording.js`: recording state normalization and empty/default recording shape
- `HTMLReport/`: report viewer and related report modules

## Storage Model
- `chrome.storage.local` is the main persistence layer.
- Current important keys:
  - `session`: saved exploratory testing annotations
  - `draft`: current unsaved Action draft
  - `recording`: recorded replay flow state

### `session`
- Contains exploratory testing session data:
  - start timestamp
  - browser info
  - annotations array

### `draft`
- Contains current unsaved draft:
  - `type`
  - `description`
  - `imageURLs`

### `recording`
- Contains recorder state:
  - ids and timestamps
  - `status`
  - `lastError`
  - `activeStepId`
  - `steps`
  - `screenshots`
- Steps store references such as `screenshotRef` instead of embedding screenshot data directly into each step.

## Architectural Notes
- `background.js` is the main source of truth for extension state.
- `content_script.js` already hosts two distinct flows:
  - crop/annotation flow
  - recorder/replay flow
- These flows should remain logically isolated even though they live in the same file.
- Recorder replay communicates active-step progress back through persisted `recording` state, which the popup polls.
- Screenshots during recording are best-effort; if `captureVisibleTab` hits rate limits, the step should still be preserved without a screenshot.

## Current UX Patterns
- Pseudo-tabs are used inside the popup instead of separate windows/panels.
- Destructive actions use two-step arm/confirm buttons:
  - draft clearing
  - recorded flow clearing
- Recorder controls should feel separate from Action controls, even though they live in the same popup.

## Current Limitations
- Replay is not multi-tab.
- No support yet for drag-and-drop, canvas actions, or more advanced gestures.
- No self-healing locator strategy.
- Recorder data is not yet exported into the HTML report.
- Navigation replay is supported, but it remains a sensitive area and should be validated carefully after changes.

## Test Setup
- Main e2e tests live in `test/e2e/`.
- Relevant current specs:
  - `smoke.spec.js`
  - `basic-functionality.spec.js`
  - `recording-replay.spec.js`
  - other specs cover crop, annotation editor, reports, and exports
- Useful commands:
  - `npm run test:e2e`
  - `npm run test:e2e:all`
  - `npx playwright test test/e2e/recording-replay.spec.js`

## Important Validation Areas
- Action flow must remain intact while Recorder evolves.
- Recorder clear must not affect Action draft or saved `Bug` / `Note` annotations.
- Replay should still work after popup UI changes.
- Page highlighting during replay and popup step highlighting should stay in sync.

## Future Work Backlog
- This section is a temporary reminder list of planned improvements.
- Remove or update items from this list as soon as they are implemented in code, so `AGENTS.md` does not drift away from reality.
- Pending ideas:
  - Add hover preview for screenshot thumbnails everywhere, not only in the HTML report.
  - Fix import/export behavior.
  - Improve action recording quality and coverage.
  - Show recorded action flows in the HTML report.
  - Add configurable replay speed.
