import { loadReportState } from './modules/reportData.js';
import { displaySessionInfo, displayStats, createAnnotationsChart, displayAnnotationsTable, displayRecordingCard, displayRecordingTimeline } from './modules/reportUI.js';
import { setupAllListeners, getCurrentFilter, rebindTableListeners } from './modules/reportEvents.js';
import { getMessage } from '../src/i18n.js';

function setupReportTabs() {
    const tabButtons = Array.from(document.querySelectorAll('[data-report-tab]'));
    const tabPanels = Array.from(document.querySelectorAll('[data-report-panel]'));
    if (tabButtons.length === 0 || tabPanels.length === 0) {
        return;
    }

    const activateTab = (targetTabName) => {
        tabButtons.forEach((buttonElement) => {
            const isActive = buttonElement.dataset.reportTab === targetTabName;
            buttonElement.classList.toggle('is-active', isActive);
            buttonElement.setAttribute('aria-selected', isActive ? 'true' : 'false');
            buttonElement.tabIndex = isActive ? 0 : -1;
        });

        tabPanels.forEach((panelElement) => {
            const isActive = panelElement.dataset.reportPanel === targetTabName;
            panelElement.classList.toggle('is-active', isActive);
            panelElement.hidden = !isActive;
        });
    };

    tabButtons.forEach((buttonElement) => {
        buttonElement.addEventListener('click', () => {
            activateTab(buttonElement.dataset.reportTab);
        });
    });

    const initialActiveButton = tabButtons.find((buttonElement) => buttonElement.classList.contains('is-active')) || tabButtons[0];
    activateTab(initialActiveButton.dataset.reportTab);
}

async function initReport() {
    try {
        const reportState = await loadReportState();

        if (!reportState) {
            document.getElementById('report').innerHTML = `
                <div class="empty-report">
                    <h2>${getMessage('reportNoExportedStateTitle', undefined, 'No exported state available')}</h2>
                    <p>${getMessage('reportNoExportedStateBody', undefined, 'Add annotations, keep a draft, or record a flow to generate a report.')}</p>
                </div>`;
            return;
        }

        setupReportTabs();
        displaySessionInfo(reportState.session);
        displayStats(reportState);
        createAnnotationsChart(reportState.session);
        displayRecordingCard(reportState.recording);
        displayRecordingTimeline(reportState.recording);
        displayAnnotationsTable(reportState.session, getCurrentFilter());
        setupAllListeners(reportState);
        rebindTableListeners();
    } catch (error) {
        console.error('Error loading report:', error);
        document.getElementById('report').innerHTML = `
            <div class="empty-report">
                <h2>${getMessage('reportErrorLoadingTitle', undefined, 'Error loading data')}</h2>
                <p>${error.message}</p>
            </div>`;
    }
}

document.addEventListener('DOMContentLoaded', initReport);
