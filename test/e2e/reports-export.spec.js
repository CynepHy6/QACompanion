const { test, expect } = require('@playwright/test');
const {
  launchBrowserWithExtension,
  openExtensionPopup,
  clearExtensionStorage,
  getSessionData,
  waitForStorageUpdate,
} = require('./helpers/extension-helper');

async function sendRuntimeMessage(popupPage, message) {
  return popupPage.evaluate((payload) => {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(payload, (response) => resolve(response));
    });
  }, message);
}

async function getReportPage(context) {
  const pages = context.pages();

  for (const page of pages) {
    const url = page.url();
    if (url.includes('preview.html') || url.includes('HTMLReport')) {
      return page;
    }
  }

  return null;
}

test.describe('Reports and Export Functionality', () => {
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
    testPage = await context.newPage();
    await testPage.goto('http://localhost:8000/test/e2e/test-pages/index.html');

    popupPage = await openExtensionPopup(context, extensionId);

    // Clear storage and wait extra time to ensure it's fully cleared
    await clearExtensionStorage(popupPage);
    await popupPage.waitForTimeout(500);
    await popupPage.reload();
    await popupPage.waitForTimeout(500);

    await popupPage.fill('#draftDescription', 'Test Bug for Export');
    await popupPage.click('#BugBtn');
    await waitForStorageUpdate(popupPage, 300);

    await popupPage.click('#NoteBtn');
    await popupPage.fill('#draftDescription', 'Test Note for Export');
    await popupPage.click('#NoteBtn');
    await waitForStorageUpdate(popupPage, 300);
  });

  test.afterEach(async () => {
    if (testPage) await testPage.close();
    if (popupPage) await popupPage.close();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('should have export buttons visible', async () => {
    // Verify export buttons exist
    await expect(popupPage.locator('#exportJsonBtn')).toBeVisible();
    await expect(popupPage.locator('#previewBtn')).toBeVisible();
    await expect(popupPage.locator('#resetBtn')).toBeVisible();
  });

  test('should generate HTML report', async () => {
    const htmlButton = popupPage.locator('#previewBtn');
    await htmlButton.click();

    // Wait for report page to open
    await waitForStorageUpdate(popupPage, 2000);

    const reportPage = await getReportPage(context);

    if (reportPage) {
      await reportPage.waitForLoadState('domcontentloaded');

      // Verify report content
      const reportContent = await reportPage.content();
      expect(reportContent).toContain('Test Bug for Export');
      expect(reportContent).toContain('Test Note for Export');
      expect(reportContent).not.toContain('Draft Snapshot');
      await expect(reportPage.locator('.filter-pill')).toHaveCount(3);

      await reportPage.close();
    }
  });

  test('should hide screenshot placeholder for navigation replay steps in HTML report', async () => {
    await clearExtensionStorage(popupPage);
    await popupPage.reload();
    await popupPage.waitForLoadState('domcontentloaded');

    await popupPage.fill('#draftDescription', 'Bug with navigation replay');

    await testPage.bringToFront();
    await sendRuntimeMessage(popupPage, { type: 'startRecordingFlow' });
    await testPage.click('button:has-text("Go to page 1")');
    await testPage.waitForURL('**/page1.html');

    await testPage.bringToFront();
    await sendRuntimeMessage(popupPage, { type: 'syncRecordingNavigation' });
    await sendRuntimeMessage(popupPage, { type: 'stopRecordingFlow' });
    await waitForStorageUpdate(popupPage, 700);

    await popupPage.bringToFront();
    await popupPage.click('#actionTabBtn');
    await popupPage.click('#BugBtn');
    await waitForStorageUpdate(popupPage, 700);

    await popupPage.click('#previewBtn');
    await waitForStorageUpdate(popupPage, 2000);

    const reportPage = await getReportPage(context);
    expect(reportPage).toBeTruthy();

    await reportPage.waitForLoadState('domcontentloaded');
    await expect(reportPage.locator('.recording-step[data-step-type="navigation"]')).toHaveCount(1);
    await expect(reportPage.locator('.recording-step[data-step-type="navigation"] .recording-step__shot')).toHaveCount(0);
    await expect(reportPage.locator('.recording-step[data-step-type="navigation"] .recording-step__shot-placeholder')).toHaveCount(0);
    await expect(reportPage.locator('.recording-step[data-step-type="navigation"] .recording-step__url')).toHaveCount(0);
    await reportPage.close();
  });

  test('should disable HTML report button when there are no saved annotations, even with draft content', async () => {
    await clearExtensionStorage(popupPage);
    await popupPage.reload();
    await popupPage.waitForLoadState('domcontentloaded');

    await popupPage.click('#NoteBtn');
    await popupPage.fill('#draftDescription', 'Draft promoted to action');
    await waitForStorageUpdate(popupPage, 400);

    await expect(popupPage.locator('#previewBtn')).toBeDisabled();
  });

  test('should disable HTML report button when there is only draft replay', async () => {
    await clearExtensionStorage(popupPage);
    await popupPage.reload();
    await popupPage.waitForLoadState('domcontentloaded');

    await testPage.bringToFront();
    await popupPage.evaluate(() => {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'startRecordingFlow' }, (response) => resolve(response));
      });
    });
    await testPage.fill('#testInput', 'Draft replay only');
    await waitForStorageUpdate(popupPage, 700);
    await popupPage.evaluate(() => {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'stopRecordingFlow',
          options: { suppressSyntheticNavigationOnStop: true }
        }, (response) => resolve(response));
      });
    });
    await waitForStorageUpdate(popupPage, 700);

    await expect(popupPage.locator('#previewBtn')).toBeDisabled();
  });

  test('should maintain session data across popup closes', async () => {
    // Get current session
    const originalSession = await getSessionData(popupPage);
    const originalCount = originalSession.annotations.length;
    expect(originalCount).toBeGreaterThanOrEqual(2);

    // Find specific annotation to verify later
    const testBug = originalSession.annotations.find(a => a.name === 'Test Bug for Export');
    expect(testBug).toBeTruthy();

    // Close popup
    await popupPage.close();

    // Reopen popup
    popupPage = await openExtensionPopup(context, extensionId);
    await popupPage.waitForLoadState('domcontentloaded');

    // Verify data persisted
    const newSession = await getSessionData(popupPage);
    expect(newSession.annotations.length).toBe(originalCount);

    // Verify specific annotation persisted
    const persistedBug = newSession.annotations.find(a => a.name === 'Test Bug for Export');
    expect(persistedBug).toBeTruthy();
    expect(persistedBug.type).toBe('Bug');
  });

  test('should show correct statistics in counters', async () => {
    // Reload to update counters
    await popupPage.reload();
    await popupPage.waitForTimeout(500);

    const bugCounter = await popupPage.locator('#bugCounter').textContent();
    const noteCounter = await popupPage.locator('#noteCounter').textContent();

    expect(parseInt(bugCounter.trim() || '0')).toBeGreaterThanOrEqual(1);
    expect(parseInt(noteCounter.trim() || '0')).toBeGreaterThanOrEqual(1);
  });
});
