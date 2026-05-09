const { test, expect } = require('@playwright/test');
const {
  launchBrowserWithExtension,
  openExtensionPopup,
  clearExtensionStorage,
  waitForStorageUpdate,
  injectContentScript,
} = require('./helpers/extension-helper');

const ADD_BUG_LABEL = /Add bug|\+ Bug|Добавить баг|\+ Баг/;
const ADD_NOTE_LABEL = /Add note|\+ Note|Добавить заметку|\+ Заметка/;

test.describe('Crop Screenshot Functionality', () => {
  let context;
  let extensionId;
  let popupPage;
  let testPage;

  test.beforeAll(async () => {
    const result = await launchBrowserWithExtension();
    context = result.context;
    extensionId = result.extensionId;
  });

  test.beforeEach(async () => {
    // Open a test page where we can crop
    testPage = await context.newPage();
    await testPage.goto('http://localhost:8000/test/e2e/test-pages/index.html');
    await testPage.waitForLoadState('domcontentloaded');

    // Open popup
    popupPage = await openExtensionPopup(context, extensionId);

    // Clear storage
    await clearExtensionStorage(popupPage);
    await popupPage.reload();
  });

  test.afterEach(async () => {
    if (testPage) await testPage.close();
    if (popupPage) await popupPage.close();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('should have a shared crop button for both supported annotation types', async () => {
    await expect(popupPage.locator('#addCropScreenshotBtn')).toBeVisible();

    await popupPage.click('#BugBtn');
    await expect(popupPage.locator('#bugButtonLabel')).toHaveText(ADD_BUG_LABEL);

    await popupPage.click('#NoteBtn');
    await expect(popupPage.locator('#noteButtonLabel')).toHaveText(ADD_NOTE_LABEL);
  });

  test('should close popup after starting crop selection', async () => {
    await popupPage.fill('#draftDescription', 'Bug for crop selection');
    const closePromise = popupPage.waitForEvent('close');
    await popupPage.click('#addCropScreenshotBtn');
    await closePromise;
  });

  test('should inject content script and verify crop UI elements', async () => {
    await testPage.bringToFront();
    const injected = await injectContentScript(testPage);
    expect(injected).toBe(true);

    const hasGlobal = await testPage.evaluate(() => {
      return typeof window.exploratoryTestingCropperInitialized !== 'undefined';
    });
    expect(hasGlobal).toBe(true);

    await popupPage.bringToFront();
    await popupPage.fill('#draftDescription', 'Bug requiring manual crop test');

    const cropButton = popupPage.locator('#addCropScreenshotBtn');
    await expect(cropButton).toBeVisible();
    await expect(cropButton).toBeEnabled();
  });

  test('should send correct message with crop data to background', async () => {
    await popupPage.click('#NoteBtn');
    await popupPage.fill('#draftDescription', 'Note with crop');

    const messagePromise = popupPage.evaluate(() => {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 5000);

        const originalSendMessage = chrome.runtime.sendMessage;
        chrome.runtime.sendMessage = function(message, callback) {
          if (message.type === 'initiateCropSelection') {
            clearTimeout(timeout);
            resolve(message);
          }
          // Call original to maintain functionality
          return originalSendMessage.call(this, message, callback);
        };
      });
    });

    await popupPage.click('#addCropScreenshotBtn');

    const message = await messagePromise;

    expect(message).toBeTruthy();
    expect(message.type).toBe('initiateCropSelection');
    expect(message.draft.type).toBe('Note');
    expect(message.draft.description).toBe('Note with crop');
  });

  test('should verify HTML report has screenshot column and structure', async () => {
    await popupPage.fill('#draftDescription', 'Bug for screenshot test');
    await popupPage.click('#BugBtn');
    await waitForStorageUpdate(popupPage, 300);

    await popupPage.click('#NoteBtn');
    await popupPage.fill('#draftDescription', 'Note for screenshot test');
    await popupPage.click('#NoteBtn');
    await waitForStorageUpdate(popupPage, 300);

    const htmlButton = popupPage.locator('#previewBtn');
    await htmlButton.click();
    await waitForStorageUpdate(popupPage, 2000);

    const pages = context.pages();
    let reportPage = null;

    for (const page of pages) {
      const url = page.url();
      if (url.includes('preview.html') || url.includes('HTMLReport')) {
        reportPage = page;
        break;
      }
    }

    expect(reportPage).toBeTruthy();
    await reportPage.waitForLoadState('domcontentloaded');

    const reportContent = await reportPage.content();
    expect(reportContent).toContain('Bug for screenshot test');
    expect(reportContent).toContain('Note for screenshot test');

    const hasScreenshotColumn = await reportPage.evaluate(() => {
      const screenshotCells = document.querySelectorAll('.screenshot-cell');
      return screenshotCells.length > 0;
    });

    expect(hasScreenshotColumn).toBe(true);

    const screenshotCellsInfo = await reportPage.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('.screenshot-cell'));
      return {
        total: cells.length,
        withImages: cells.filter(c => c.querySelector('img[src^="data:image"]')).length,
        withPlaceholder: cells.filter(c => c.querySelector('.text-muted')).length
      };
    });

    expect(screenshotCellsInfo.total).toBe(2);
    expect(screenshotCellsInfo.withPlaceholder).toBeGreaterThanOrEqual(0);

    await reportPage.close();
  });
});
