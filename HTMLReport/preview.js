import { loadReportState } from './modules/reportData.js';
import { displaySessionInfo, displayStats, createAnnotationsChart, displayAnnotationsTable, updateReportHeaderSubtitle } from './modules/reportUI.js';
import { setupAllListeners, getCurrentFilter, rebindTableListeners } from './modules/reportEvents.js';
import { getMessage } from '../src/i18n.js';

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

        updateReportHeaderSubtitle(reportState);
        displaySessionInfo(reportState.session);
        displayStats(reportState);
        createAnnotationsChart(reportState.session);
        displayAnnotationsTable(reportState, getCurrentFilter());
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
