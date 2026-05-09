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

test.describe('Basic Extension Functionality', () => {
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
    await clearExtensionStorage(popupPage);
    await popupPage.reload();
    await popupPage.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async () => {
    if (testPage) await testPage.close();
    if (popupPage) await popupPage.close();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('should load popup with only bug and note types', async () => {
    await expect(popupPage.locator('.type-button')).toHaveCount(2);
    await expect(popupPage.locator('#BugBtn')).toBeVisible();
    await expect(popupPage.locator('#NoteBtn')).toBeVisible();
    await expect(popupPage.locator('#draftDescription')).toBeVisible();
    await expect(popupPage.locator('#bugButtonLabel')).toHaveText('Add bug');
    await expect(popupPage.locator('#NoteBtn')).toContainText('Note');
  });

  test('should show initial counters as zero', async () => {
    const bugCounter = await popupPage.locator('#bugCounter').textContent();
    const noteCounter = await popupPage.locator('#noteCounter').textContent();

    expect((bugCounter || '').trim() || '0').toBe('0');
    expect((noteCounter || '').trim() || '0').toBe('0');
  });

  test('should add a bug and update counter', async () => {
    await popupPage.fill('#draftDescription', 'Test Bug Description');
    await popupPage.click('#BugBtn');
    await waitForStorageUpdate(popupPage, 500);
    await popupPage.reload();

    const bugCounter = await popupPage.locator('#bugCounter').textContent();
    expect(bugCounter.trim()).toBe('1');

    const sessionData = await getSessionData(popupPage);
    expect(sessionData.annotations).toHaveLength(1);
    expect(sessionData.annotations[0].name).toBe('Test Bug Description');
    expect(sessionData.annotations[0].type).toBe('Bug');
  });

  test('should add a note and update counter', async () => {
    await popupPage.click('#NoteBtn');
    await popupPage.fill('#draftDescription', 'Test Note');
    await expect(popupPage.locator('#noteButtonLabel')).toHaveText('Add note');
    await popupPage.click('#NoteBtn');
    await waitForStorageUpdate(popupPage, 500);
    await popupPage.reload();

    const noteCounter = await popupPage.locator('#noteCounter').textContent();
    expect(noteCounter.trim()).toBe('1');

    const sessionData = await getSessionData(popupPage);
    const noteAnnotation = sessionData.annotations.find((annotation) => annotation.type === 'Note');
    expect(noteAnnotation).toBeTruthy();
    expect(noteAnnotation.name).toBe('Test Note');
  });

  test('should keep draft until explicit save', async () => {
    await popupPage.click('#NoteBtn');
    await popupPage.fill('#draftDescription', 'Unsaved note draft');
    await waitForStorageUpdate(popupPage, 400);
    await popupPage.close();

    popupPage = await openExtensionPopup(context, extensionId);
    await popupPage.waitForLoadState('domcontentloaded');

    await expect(popupPage.locator('#draftDescription')).toHaveValue('Unsaved note draft');
    await expect(popupPage.locator('#noteButtonLabel')).toHaveText('Add note');

    const sessionData = await getSessionData(popupPage);
    expect(sessionData).toBeNull();
  });

  test('should import draft data as a saved action and update counters', async () => {
    const importedStateJson = JSON.stringify({
      version: 4,
      session: {
        startDateTime: new Date(2026, 4, 9, 19, 50).getTime(),
        browserInfo: {
          browser: 'Chrome',
          browserVersion: '1.0',
          os: 'Linux'
        },
        annotations: [
          {
            id: 'imported-action-1',
            type: 'Bug',
            name: 'Imported draft should become action',
            url: '',
            timestamp: new Date(2026, 4, 9, 19, 50, 10).getTime(),
            imageEntries: []
          }
        ]
      },
      recording: {
        status: 'idle',
        steps: [],
        screenshots: []
      }
    });

    const chunkSize = 64 * 1024;
    const totalChunks = Math.ceil(importedStateJson.length / chunkSize);
    const importId = Date.now().toString();

    for (let i = 0; i < totalChunks; i++) {
      const chunk = importedStateJson.slice(i * chunkSize, (i + 1) * chunkSize);
      await popupPage.evaluate(({ storageKey, storageValue }) => {
        return chrome.storage.local.set({ [storageKey]: storageValue });
      }, {
        storageKey: `importChunk:${importId}:${i}`,
        storageValue: chunk
      });
    }

    const response = await sendRuntimeMessage(popupPage, {
      type: 'importSessionJSonStoredChunks',
      importId: importId,
      totalChunks: totalChunks
    });

    expect(response.status).toBe('ok');
    await popupPage.reload();
    await popupPage.waitForLoadState('domcontentloaded');

    await expect(popupPage.locator('#draftDescription')).toHaveValue('');
    const bugCounter = await popupPage.locator('#bugCounter').textContent();
    expect((bugCounter || '').trim()).toBe('1');

    const sessionData = await getSessionData(popupPage);
    expect(sessionData.annotations).toHaveLength(1);
    expect(sessionData.annotations[0].type).toBe('Bug');
    expect(sessionData.annotations[0].name).toBe('Imported draft should become action');
  });

  test('should clear draft after saving annotation', async () => {
    await popupPage.fill('#draftDescription', 'Test Bug');
    await popupPage.click('#BugBtn');
    await waitForStorageUpdate(popupPage, 300);

    await expect(popupPage.locator('#draftDescription')).toHaveValue('');
  });

  test('should require confirmation before clearing draft', async () => {
    await popupPage.fill('#draftDescription', 'Draft to clear');
    await popupPage.click('#addScreenshotBtn');
    await waitForStorageUpdate(popupPage, 500);

    const clearDraftButton = popupPage.locator('#clearDraftBtn');
    await clearDraftButton.click();

    await expect(clearDraftButton).toHaveClass(/is-armed/);
    await expect(popupPage.locator('#draftDescription')).toHaveValue('Draft to clear');

    await popupPage.click('#draftDescription');
    await expect(clearDraftButton).not.toHaveClass(/is-armed/);
    await expect(popupPage.locator('#draftDescription')).toHaveValue('Draft to clear');

    await clearDraftButton.click();
    await expect(clearDraftButton).toHaveClass(/is-armed/);

    await clearDraftButton.click();
    await waitForStorageUpdate(popupPage, 300);

    await expect(clearDraftButton).not.toHaveClass(/is-armed/);
    await expect(popupPage.locator('#draftDescription')).toHaveValue('');
  });

  test('should temporarily disable full page screenshot button after capture', async () => {
    const screenshotButton = popupPage.locator('#addScreenshotBtn');

    await screenshotButton.click();

    await expect(screenshotButton).toBeDisabled();
    await expect(screenshotButton).toBeEnabled({ timeout: 2000 });
  });

  test('should capture current page URL in annotation', async () => {
    await testPage.goto('http://localhost:8000/test/e2e/test-pages/page1.html');
    await testPage.waitForLoadState('load');
    await testPage.click('body');
    await testPage.waitForTimeout(500);

    await popupPage.fill('#draftDescription', 'Bug with URL');
    await popupPage.click('#BugBtn');
    await waitForStorageUpdate(popupPage, 500);

    const sessionData = await getSessionData(popupPage);
    const bugAnnotation = sessionData.annotations.find((annotation) => annotation.name === 'Bug with URL');
    expect(bugAnnotation).toBeTruthy();
    expect(bugAnnotation.url).toBeTruthy();
  });
});
