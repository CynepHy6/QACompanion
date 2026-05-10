# Playwright E2E Tests

This directory contains Playwright end-to-end tests for the `QA Companion` Chrome extension.

The suite covers the popup UI, action creation flow, crop flow, annotation editor, recorder/replay behavior, and report/export pages.

## Coverage

Current spec files:

- `smoke.spec.js`: quick environment and extension boot checks
- `basic-functionality.spec.js`: popup basics, counters, draft behavior, and saved annotations
- `recording-replay.spec.js`: record/replay flow, navigation, and replay error handling
- `annotation-editor.spec.js`: annotation editor structure, tools, keyboard shortcuts, save/cancel flow
- `crop-screenshot.spec.js`: crop entry flow, content-script injection, and crop-related messaging
- `reports-export.spec.js`: report actions, JSON export control visibility, HTML report generation, and persistence checks

## Prerequisites

Install dependencies first:

```bash
npm install
```

Playwright uses a local HTTP server for test pages on port `8000`.

By default:

- tests run sequentially with a single worker
- retries are enabled only in `CI`
- screenshots and video are kept on failure
- traces are collected on the first retry
- headless mode is enabled by default via Chromium's modern headless mode

## Available Commands

Run the default smoke/basic/recording subset:

```bash
npm run test:e2e
```

Run the full E2E suite:

```bash
npm run test:e2e:all
```

Run the CI-oriented E2E suite:

```bash
npm run test:e2e:ci
```

Run the default subset in headed mode:

```bash
npm run test:e2e:headed
```

Run crop tests in headed mode:

```bash
npm run test:e2e:crop
```

Open Playwright UI mode:

```bash
npm run test:e2e:ui
```

Run the smoke spec in debug mode:

```bash
npm run test:e2e:debug
```

Open the last HTML report:

```bash
npm run test:e2e:report
```

Run unit and E2E tests together:

```bash
npm run test:all
```

Run a specific spec directly:

```bash
npx playwright test test/e2e/reports-export.spec.js
npx playwright test test/e2e/recording-replay.spec.js --headed
```

## Configuration Notes

The main configuration lives in `playwright.config.js`.

Important details:

- `testDir` is `./test/e2e`
- `workers` is set to `1`
- `fullyParallel` is disabled
- `baseURL` points to `http://localhost:8000/test/e2e/test-pages`
- on Windows the local server starts with `start_test_server.ps1`
- on non-Windows systems the local server starts with `python3 -m http.server 8000`

## Helper Utilities

Shared helpers live in `test/e2e/helpers/extension-helper.js`.

Available helpers:

```javascript
const {
  launchBrowserWithExtension,
  openExtensionPopup,
  clearExtensionStorage,
  getSessionData,
  getRecordingData,
  waitForStorageUpdate,
  takeScreenshotWithExtension,
  injectContentScript,
} = require('./helpers/extension-helper');
```

What they do:

- `launchBrowserWithExtension()`: launches a persistent browser context with the unpacked extension loaded
- `openExtensionPopup()`: opens `popup.html` directly through the resolved extension ID
- `clearExtensionStorage()`: clears extension state and verifies storage cleanup
- `getSessionData()`: reads the current saved session from `chrome.storage.local`
- `getRecordingData()`: reads the current recorder state from `chrome.storage.local`
- `waitForStorageUpdate()`: simple wait helper used after async extension actions
- `takeScreenshotWithExtension()`: triggers the regular screenshot flow from the popup
- `injectContentScript()`: injects `js/content_script.js` manually for crop-related tests

## Environment Variables

The helper supports a few useful overrides:

- `HEADED=true`: run the launched browser in headed mode
- `PLAYWRIGHT_CHANNEL=<channel>`: force a browser channel
- `EXTENSION_ID=<id>`: skip extension ID auto-detection and use a known ID

On Linux, the helper prefers `msedge` if it is installed at `/opt/microsoft/msedge/msedge`; otherwise it falls back to `chromium`.

## Recommended Workflow

For a quick sanity check:

```bash
npm run test:e2e
```

Before merging UI or recorder changes:

```bash
npm run test:e2e:all
```

When iterating on a specific area:

```bash
npx playwright test test/e2e/crop-screenshot.spec.js --headed
npx playwright test test/e2e/annotation-editor.spec.js --headed
```

## Troubleshooting

### Extension ID could not be resolved

Check the following:

- `manifest.json` is valid
- the extension loads cleanly without startup errors
- `background.js` or the service worker does not crash on startup
- the unpacked extension path still points to the repository root

If auto-detection is flaky locally, set `EXTENSION_ID` explicitly and rerun the command.

### Local server does not start

Check the following:

- port `8000` is free
- `python3` is available on non-Windows systems
- `start_test_server.ps1` works on Windows

### Tests are slow or flaky

Common reasons:

- extension startup needs extra time
- storage writes need a short wait before assertions
- crop and recorder flows are more timing-sensitive than plain popup assertions

Prefer targeted spec runs while debugging instead of running the full suite every time.

## Reports

After a run, open the Playwright report with:

```bash
npm run test:e2e:report
```

The report includes failed-step screenshots, retained failure videos, retry traces, and timing data.

## References

- [Playwright documentation](https://playwright.dev/)
- [Chrome extension testing with Playwright](https://playwright.dev/docs/chrome-extensions)
- [Playwright best practices](https://playwright.dev/docs/best-practices)
