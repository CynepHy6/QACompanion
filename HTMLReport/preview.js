import { loadReportState } from './modules/reportData.js';
import { displaySessionInfo, displayStats, createAnnotationsChart, displayAnnotationsTable, displayRecordingCard, displayRecordingTimeline } from './modules/reportUI.js';
import { setupAllListeners, getCurrentFilter, rebindTableListeners } from './modules/reportEvents.js';

async function initReport() {
    try {
        const reportState = await loadReportState();

        if (!reportState) {
            document.getElementById('report').innerHTML = `
                <div class="empty-report">
                    <h2>No exported state available</h2>
                    <p>Add annotations, keep a draft, or record a flow to generate a report.</p>
                </div>`;
            return;
        }

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
                <h2>Error loading data</h2>
                <p>${error.message}</p>
            </div>`;
    }
}

document.addEventListener('DOMContentLoaded', initReport);
