import { getMessage, getPluralMessage } from '../src/i18n.js';

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (response && response.status === 'error') {
        reject(new Error(response.error || getMessage('errorUnknown', undefined, 'Unknown error')));
        return;
      }

      resolve(response);
    });
  });
}

function getImportChunkStorageKey(importId, chunkIndex) {
  return `importChunk:${importId}:${chunkIndex}`;
}

function writeImportChunkToStorage(storageKey, storageValue) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [storageKey]: storageValue }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve();
    });
  });
}

function updateStatus(message, state = 'idle') {
  const statusElement = document.getElementById('importStatus');
  statusElement.textContent = message;
  statusElement.dataset.state = state;
}

function setSelectedFileName(fileName) {
  document.getElementById('selectedFileName').textContent = fileName || getMessage('importNoFileSelected', undefined, 'No file selected.');
}

function setAutoCloseNotice(message, state = 'idle', isHidden = false) {
  const noticeElement = document.getElementById('autoCloseNotice');
  noticeElement.textContent = message;
  noticeElement.dataset.state = state;
  noticeElement.hidden = isHidden;
}

function startAutoCloseCountdown(secondsLeft) {
  const safeSeconds = Math.max(0, secondsLeft);
  setAutoCloseNotice(
    getMessage(
      'importAutoCloseNotice',
      [getPluralMessage('countSecond', safeSeconds, `${safeSeconds} seconds`)],
      `You can close this page now. It will close automatically in ${safeSeconds} seconds.`
    ),
    'success',
    false
  );

  if (safeSeconds === 0) {
    window.close();
    return;
  }

  window.setTimeout(() => {
    startAutoCloseCountdown(safeSeconds - 1);
  }, 1000);
}

async function importSessionFile(selectedFile) {
  const importId = Date.now().toString();
  const chunkSize = 512 * 1024;
  const selectButton = document.getElementById('selectImportFileBtn');

  try {
    selectButton.disabled = true;
    setSelectedFileName(getMessage(
      'importSelectedFileWithSize',
      [selectedFile.name, String(Math.round(selectedFile.size / 1024))],
      `${selectedFile.name} (${Math.round(selectedFile.size / 1024)} KB)`
    ));
    updateStatus(getMessage('importReadingFile', undefined, 'Reading file...'), 'idle');
    setAutoCloseNotice('', 'idle', true);

    const fileText = await selectedFile.text();
    const totalChunks = Math.ceil(fileText.length / chunkSize);

    updateStatus(
      getMessage('importPreparingChunks', [String(totalChunks)], `Preparing ${totalChunks} chunk(s)...`),
      'idle'
    );

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const chunkValue = fileText.slice(chunkIndex * chunkSize, (chunkIndex + 1) * chunkSize);
      const storageKey = getImportChunkStorageKey(importId, chunkIndex);
      await writeImportChunkToStorage(storageKey, chunkValue);
    }

    updateStatus(getMessage('importImportingStorage', undefined, 'Importing into extension storage...'), 'idle');

    const response = await sendRuntimeMessage({
      type: 'importSessionJSonStoredChunks',
      importId,
      totalChunks
    });

    if (response?.status !== 'ok') {
      throw new Error(response?.error || getMessage('importFailed', undefined, 'Failed to import session JSON.'));
    }

    updateStatus(getMessage('importCompleted', undefined, 'Import completed. Reopen the extension popup to review the restored session.'), 'success');
    startAutoCloseCountdown(5);
  } catch (error) {
    updateStatus(error.message || getMessage('importFailed', undefined, 'Failed to import session JSON.'), 'error');
    setAutoCloseNotice('', 'idle', true);
  } finally {
    selectButton.disabled = false;
  }
}

function setupImportPage() {
  const selectButton = document.getElementById('selectImportFileBtn');
  const importInput = document.getElementById('importJsonInput');

  selectButton.addEventListener('click', () => {
    importInput.click();
  });

  importInput.addEventListener('change', (event) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles || selectedFiles.length === 0) {
      return;
    }

    importSessionFile(selectedFiles[0]);
  });
}

document.addEventListener('DOMContentLoaded', setupImportPage);
