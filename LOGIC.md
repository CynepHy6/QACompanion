# QACompanion Logic

## Purpose
- `QACompanion` is a Chrome extension for exploratory testing.
- The extension supports two related but distinct workflows:
  - `Action`: capture and save explicit testing steps as annotations
  - `Recorder`: record browser actions and attach them to a step for replay

This file describes how the application is expected to work at a high level.

If the code diverges from this document, the divergence SHOULD be treated explicitly:
- either update `LOGIC.md` because the intended behavior changed,
- or fix the code because the implementation drifted away from the intended behavior.

## Core Terms
- `Draft`: the current unsaved Action state in the popup.
- `Annotation`: a saved explicit step in the session, of type `Bug` or `Note`.
- `Recording`: a replayable sequence of browser actions and linked recording screenshots.
- `Draft recording`: a recording currently attached to the unsaved draft.
- `Annotation recording`: a recording attached to a saved annotation.
- `Session`: the saved set of annotations plus environment metadata.

## Main Principles
- The user explicitly creates reportable testing steps.
- Recorder data by itself is not the primary artifact; it supplements a step.
- Action flow and Recorder flow are related but MUST remain logically separate.
- Destructive actions SHOULD require explicit confirmation in the popup.
- Background state in `background.js` is the source of truth.

## Action Flow
### Draft
- The popup starts from an Action draft.
- A draft can contain:
  - annotation type: `Bug` or `Note`
  - text description
  - screenshots
  - cropped and annotated screenshots
- Draft changes are persisted incrementally.
- A draft is not part of the saved session until the user explicitly saves it.

### Saving
- Saving the draft creates a real annotation in the session.
- Saved annotations are the canonical testing steps of the session.
- Counts, reports, and step-level replay attachment all center around saved annotations.

### Clearing
- Clearing the draft removes only the draft state.
- Clearing the draft MUST NOT delete saved annotations.

## Recorder Flow
### What Recorder Captures
- Recorder currently captures these step types:
  - `click`
  - `input`
  - `change`
  - `submit`
  - `navigation`
- Recording is limited to a single browser tab.
- Recording screenshots are best-effort and MAY be absent for some steps.
- `navigation` steps SHOULD be saved immediately when the URL change is observed and MUST NOT wait for a recording screenshot.
- Popup Recorder controls SHOULD expose exactly one primary action for the selected target:
  - `Record` when draft recording does not exist yet
  - `Stop` while recording or replay is in progress
  - `Replay` when an attached recording already exists

### Targets
- Recorder can target:
  - the current unsaved draft
  - a saved annotation
- At any moment, the popup has a selected recording target.
- Saved annotations can be selected as replay targets from the popup only when they already have an attached recording.
- Saved annotations without an attached recording MUST NOT be selectable from the Recorder UI.
- Starting a new recording for a target that already has a saved recording MUST require clearing the existing recording first.

### Replay
- Replay runs against the current active tab.
- Replay can navigate between pages inside that tab.
- During replay:
  - the current step is highlighted in popup UI
  - the popup scrolls to the active step when open
  - the target element on the page is scrolled into view and highlighted
- If replay fails, the failed step is marked and the error is shown.
- A replay failure MUST NOT trap the user inside Recorder mode; the user can switch back to Action mode.

### Attachment Semantics
- A recording becomes meaningful for reporting only when it is attached to a saved annotation.
- Draft recording is staging state.
- When a draft with a recording is saved, that recording moves to the newly created annotation.
- Different saved annotations can have different independent recordings.
- Clearing one annotation recording MUST NOT clear recordings attached to other annotations.

## Reports and Preview
### HTML Report
- HTML preview/report shows only explicitly saved annotations.
- Unsaved draft content MUST NOT appear in the HTML report.
- Standalone draft recording MUST NOT appear in the HTML report.
- Replay timeline in the report is shown only for saved annotations that have an attached recording.
- If there are no saved annotations, opening the HTML report SHOULD be unavailable from the popup.

### JSON Export / Import
- JSON export/import is broader than HTML report.
- Export/import MAY include:
  - saved session annotations
  - unsaved draft
  - draft recording
  - per-annotation recordings
- This is intentional: JSON is a state transfer format, not just a presentation format.

## Storage Model
- `chrome.storage.local` is the main persistence layer.
- Main stored areas:
  - `session`: saved annotations and environment metadata
  - `draft`: unsaved Action draft
  - `recording`: draft recording, per-annotation recordings, and current recorder target state

## Session Rules
- A session contains saved annotations and environment metadata.
- The first meaningful save/record activity can initialize session metadata.
- Resetting the whole session clears:
  - saved annotations
  - draft
  - recordings

## Current Recorder Limitations
- No multi-tab replay.
- No drag-and-drop, canvas hotspots, or other coordinate-sensitive replay.
- No keyboard shortcut capture/replay.
- No iframe or Shadow DOM replay support.
- No self-healing locator strategy.

These are implementation limits, not intended supported behavior.

## Validation Expectations
- Action flow MUST keep working while Recorder evolves.
- Recorder operations MUST NOT corrupt draft or saved annotations.
- Saving a draft with a draft recording MUST move the recording to the new annotation.
- HTML report availability MUST match the rule: report only for explicitly saved steps.
