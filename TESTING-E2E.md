# E2E Testing

This repository contains Playwright specs for the extension in `test/e2e`.

## Setup

```bash
npm install
npx playwright install chromium
```

## Available npm commands

```bash
npm run test:e2e
npm run test:e2e:all
npm run test:e2e:headed
npm run test:e2e:ui
npm run test:e2e:debug
npm run test:e2e:crop
npm run test:e2e:report
```

## Current spec files

```text
test/e2e/
├── annotation-editor.spec.js
├── basic-functionality.spec.js
├── crop-screenshot.spec.js
├── reports-export.spec.js
├── smoke.spec.js
├── helpers/
└── test-pages/
```

## Notes

- `playwright.config.js` runs with `workers: 1`
- The local web server is expected on `http://localhost:8000`
- On non-Windows systems the configured server command is `python3 -m http.server 8000`
- The default Playwright config uses headless Chromium with extension support

## Before editing E2E coverage

Check these files first:

1. `playwright.config.js`
2. `test/e2e/helpers/extension-helper.js`
3. `test/e2e/README.md`
