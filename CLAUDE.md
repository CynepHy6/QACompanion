# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Skills to use

Always reference these skills when working on the codebase:

- `.claude/skills/frontend-design/SKILL.md` for CSS changes and UI components

When working with E2E tests:
- use `.claude/skills/playwright-cli/SKILL.md` for:
  - Generating new tests
  - Exploring UI elements
  - Creating selectors
  - Capturing screenshots
- Only write tests manually when the skill cannot handle the specific case


## Project Overview

QA Companion (Manifest v3) is a Chrome extension for exploratory testing with notes, screenshots, draft-based popup flow, and HTML reporting.

## Build and Test Commands

```bash
npm install              # Install dependencies
npm test                 # Run Jest tests
npx jest                 # Run Jest directly
npx jest --watch         # Run tests in watch mode
npx jest path/to/test    # Run a single test file
```

**PowerShell scripts:**
```powershell
.\genetareZip.ps1        # Create timestamped .zip for Chrome Web Store
.\start_test_server.ps1  # Start HTTP server on localhost:8000
```

## Architecture

### Chrome Extension Structure (Manifest v3)

- **Service Worker** (`background.js`): Handles message passing, storage, and session management
- **Popup** (`popup.html` + `js/popup.js`): User-facing UI for creating annotations
- **Content Script** (`js/content_script.js`): Handles screenshot cropping on pages

### Core Data Model

```
Session
├── BrowserInfo (os, browser version, cookies enabled)
├── StartDateTime
└── annotations[]
    └── Annotation
        ├── id
        ├── type
        ├── name
        ├── url
        ├── timestamp
        ├── imageURLs[]
        └── legacy imageURL
```

### Key Source Files

| File | Purpose |
|------|---------|
| `src/Session.js` | Main session management class |
| `src/Annotation.js` | Annotation base class and subclasses (Bug, Note) |
| `src/browserInfo.js` | System/browser information collector |
| `src/JSonSessionService.js` | JSON serialization/deserialization |
| `src/ExportSessionCSV.js` | CSV export functionality |

### Message Passing Protocol

Communication between popup and background:
- `getDraft`, `updateDraft`, `clearDraft`: Draft management
- `addDraftScreenshot`, `removeDraftImage`, `initiateCropSelection`: Draft screenshots
- `createAnnotationFromDraft`: Save current draft as annotation
- `updateAnnotationName`, `deleteAnnotation`, `deleteAnnotationImage`: Modify saved annotations
- `exportSessionCSV`, `exportSessionJSon`, `importSessionJSon`: Import/export
- `clearSession`, `getSessionData`, `getFullSession`: Session management
- `csToBgCropData`: Process cropped screenshot from content script

### Storage

Uses `chrome.storage.local` for persistence. The extension handles quota errors gracefully by removing oldest screenshots when storage is full.

## Testing

- **Framework**: Jest 29.7.0
- **Test location**: `test/spec/**/*.test.js`
- **Chrome API mocks**: Defined in `jest.setup.js`
- **E2E location**: `test/e2e/**/*.spec.js`

When adding new Chrome API calls, update the mocks in `jest.setup.js`.

## Technology Stack

- jQuery 1.11.3, Bootstrap CSS (frontend)
- Jest + Babel (testing/transpilation)
- CanvasJS, Chart.js, TableFilter, JSZip (reporting)
- No npm runtime dependencies (all libraries bundled in `lib/`)

## HTML Report Features

### Report Downloads

The HTML report (`HTMLReport/preview.html`) supports two download options:

1. **Download Report**: Generates a standalone HTML file with all resources embedded
   - Contains all screenshots as embedded base64 images
   - Fully self-contained and portable
   - Can be opened offline without any dependencies

2. **Download Images**: Creates a ZIP file with all screenshots
   - **Only available in preview.html** (the initial report view)
   - NOT available in downloaded HTML reports (to avoid Windows security warnings)
   - Includes a README.txt file with session information
   - Screenshots are named with type, timestamp, and per-annotation index

### Libraries

All external libraries are bundled locally in `lib/` for Chrome Extension CSP compliance:
- `chart.umd.js`: Chart.js for data visualization
- `jszip.min.js`: JSZip for creating ZIP archives
