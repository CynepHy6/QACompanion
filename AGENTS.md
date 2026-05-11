# QACompanion Repository Context

## What This Repo Is
- `QACompanion` is a Chrome extension (Manifest V3) for exploratory testing.
- The project started as a fork of the original Exploratory Testing Chrome Extension and has been substantially extended.
- The codebase is plain JavaScript and HTML/CSS, without TypeScript.
- High-level expected product behavior lives in `LOGIC.md`.
- When code and `LOGIC.md` diverge, the divergence SHOULD be resolved explicitly:
  - update `LOGIC.md` if the intended behavior changed
  - or fix the code if implementation drifted away from the intended logic

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
- Recorder can be attached either to the current draft or to a saved annotation.
- Recorder shows a list of recorded steps, linked screenshots, and a selectable list of saved annotations that already have their own replays.
- Navigation steps are recorded immediately on URL change and do not create recording screenshots.
- Recorder toolbar exposes only one primary action at a time: record, stop, or replay.
- Existing recording must be cleared before a new recording can be started for the same target.
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
- `src/ExtensionStateService.js`: current import/export and preview/report state serialization
- `src/JSonSessionService.js`: legacy JSON session serializer kept for compatibility/tests
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
- Contains recorder state store:
  - `draftRecording`: replay attached to the unsaved draft
  - `annotationRecordingsById`: replay state keyed by saved annotation id
  - `selectedRecordingTarget`: currently selected replay target in the popup
  - `activeRecordingTarget`: target currently being recorded or replayed
- Each individual recording state contains:
  - ids and timestamps
  - `status`
  - `lastError`
  - `activeStepId`
  - `failedStepId`
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
- Recorder state is split between draft replay and per-annotation replay instead of one global recording.
- Screenshots during recording are best-effort; if `captureVisibleTab` hits rate limits, the step should still be preserved without a screenshot.

## Current UX Patterns
- Pseudo-tabs are used inside the popup instead of separate windows/panels.
- Destructive actions use two-step arm/confirm buttons:
  - draft clearing
  - recorded flow clearing
  - full session reset
- Recorder controls should feel separate from Action controls, even though they live in the same popup.
- Saved annotations are selectable as replay targets from the popup.

## Current Limitations
- Replay is not multi-tab.
- No support yet for drag-and-drop, canvas actions, or more advanced gestures.
- No support yet for keyboard shortcut capture/replay (`keydown` / `keyup`), hover-only interactions, wheel/scroll gestures, touch gestures, double-click, or context-menu actions.
- Replay locators are limited to `id`, `name`, first non-empty `data-*`, or generated CSS path in the top-level document.
- No support yet for iframe targets, Shadow DOM targets, file input replay, or coordinate-sensitive interactions such as canvas/SVG/map hotspots.
- No self-healing locator strategy.
- Recorder uses DOM-level `element.click()` / value assignment style replay, so behavior that depends on exact pointer coordinates or native browser dialogs may not replay reliably.
- Navigation replay is supported, but it remains a sensitive area and should be validated carefully after changes.

## Test Setup
- Main e2e tests live in `test/e2e/`.
- Relevant current specs:
  - `smoke.spec.js`
  - `basic-functionality.spec.js`
  - `recording-replay.spec.js`
  - `crop-screenshot.spec.js`
  - `annotation-editor.spec.js`
  - `reports-export.spec.js`
- Useful commands:
  - `npm run test:e2e`
  - `npm run test:e2e:all`
  - `npx playwright test test/e2e/recording-replay.spec.js`

## Reports and Export
- HTML preview/report already includes replay data for saved annotations.
- HTML preview/report shows only explicitly saved annotations.
- Unsaved draft content and standalone draft recording are not shown in the HTML report.
- The popup report button should be unavailable when there are no saved annotations.
- Replay timelines render recorded steps, linked recording screenshots, and replay failures when present.
- Export/import is driven by `ExtensionStateService`, which can include:
  - session annotations
  - unsaved draft promoted into export payload
  - draft replay
  - per-annotation replay state
## Icons
- PNG-icons
```
    "icons": {
        "128": "/icons/iconbig.png",
        "16": "/icons/iconsmall.png",
        "32": "/icons/icon.png",
        "48": "/icons/iconmed.png"
    },
```
- Extension PNG icons MUST be generated from `icons/icon.svg` with `svgexport`.
- If `svgexport` is not installed globally, use `npx --yes svgexport` instead of switching to `inkscape`, `convert`, or another rasterizer.
- When regenerating icons, overwrite all manifest sizes: `16`, `32`, `48`, and `128`.
- After generation, verify the actual output dimensions.
- Reference command:
  `npx --yes svgexport "icons/icon.svg" "icons/iconsmall.png" 16:16 && npx --yes svgexport "icons/icon.svg" "icons/icon.png" 32:32 && npx --yes svgexport "icons/icon.svg" "icons/iconmed.png" 48:48 && npx --yes svgexport "icons/icon.svg" "icons/iconbig.png" 128:128`


## Important Validation Areas
- Action flow must remain intact while Recorder evolves.
- Recorder clear must not affect Action draft or saved `Bug` / `Note` annotations.
- Replay should still work after popup UI changes.
- Page highlighting during replay and popup step highlighting should stay in sync.

## Future Work Backlog
- This section is a temporary reminder list of planned improvements.
- Remove or update items from this list as soon as they are implemented in code, so `AGENTS.md` does not drift away from reality.
- Pending ideas:
  - publish to Chrome Web Store (register new account in Russia, currently restricted for russian banks)