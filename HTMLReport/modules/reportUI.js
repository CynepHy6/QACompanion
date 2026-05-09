const ANNOTATION_ICONS = {
    Bug: '../images/bug.svg',
    Note: '../images/note.svg'
};

const ANNOTATION_COLORS = {
    Bug: '#ef4444',
    Note: '#22c55e'
};

/**
 * Renders session information in the header area.
 */
export function displaySessionInfo(session) {
    const sessionInfo = document.getElementById('sessionInfo');
    const browserInfo = session.getBrowserInfo();
    const startDateTime = session.getStartDateTime();

    sessionInfo.innerHTML = `
        <div class="info-item">
            <span class="info-label">Start Date</span>
            <span class="info-value">${startDateTime.toLocaleString()}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Browser</span>
            <span class="info-value">${browserInfo.browser} ${browserInfo.browserVersion}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Operating System</span>
            <span class="info-value">${browserInfo.os}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Cookies</span>
            <span class="info-value">${browserInfo.cookies ? 'Enabled' : 'Disabled'}</span>
        </div>
    `;
}

/**
 * Renders the summary stat cards.
 */
export function displayStats(session) {
    const stats = [
        { type: 'Bug', label: 'Bugs', count: session.getBugs().length, icon: ANNOTATION_ICONS.Bug },
        { type: 'Note', label: 'Notes', count: session.getNotes().length, icon: ANNOTATION_ICONS.Note }
    ];

    const statsContainer = document.getElementById('statsCards');
    statsContainer.innerHTML = stats.map(stat => `
        <div class="stat-card stat-card--${stat.type.toLowerCase()}">
            <div class="stat-card__icon">
                <img src="${stat.icon}" alt="${stat.type}" class="annotation-icon">
            </div>
            <div class="stat-card__content">
                <span class="stat-card__count">${stat.count}</span>
                <span class="stat-card__label">${stat.label}</span>
            </div>
        </div>
    `).join('');
}

/**
 * Creates the pie chart for annotation distribution.
 */
export function createAnnotationsChart(session) {
    const data = [
        session.getBugs().length,
        session.getNotes().length
    ];

    // Don't render chart if no annotations
    if (data.every(d => d === 0)) {
        document.getElementById('chartContainer').style.display = 'none';
        return;
    }

    const ctx = document.getElementById('annotationsChart').getContext('2d');
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Bugs', 'Notes'],
            datasets: [{
                data,
                backgroundColor: [
                    ANNOTATION_COLORS.Bug,
                    ANNOTATION_COLORS.Note
                ],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            cutout: '60%',
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

/**
 * Renders the annotations table filtered by the current filter.
 */
export function displayAnnotationsTable(session, currentFilter) {
    const tableBody = document.getElementById('annotationsTableBody');
    const annotations = session.getAnnotations();
    const filtered = annotations.filter(
        a => currentFilter === 'all' || a.constructor.name === currentFilter
    );

    if (filtered.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">
                    No annotations found for this filter.
                </td>
            </tr>`;
        return;
    }

    tableBody.innerHTML = filtered.map((annotation) => {
        const type = annotation.constructor.name;
        const imageEntries = annotation.getImageEntries();
        return `
        <tr class="annotation-row annotation-row--${type.toLowerCase()}">
            <td class="annotation-type-cell">
                <span class="type-icon-chip type-icon-chip--${type.toLowerCase()}" title="${type}" aria-label="${type}">
                    <img src="${ANNOTATION_ICONS[type] || ''}" alt="${type}" class="annotation-icon">
                </span>
            </td>
            <td class="annotation-description">
                <textarea
                    class="description-editor"
                    data-annotation-id="${annotation.id}"
                    data-saved-value="${escapeHtml(annotation.name)}"
                    rows="4">${escapeHtml(annotation.name)}</textarea>
            </td>
            <td class="annotation-url">
                ${annotation.url ? `<a href="${escapeHtml(annotation.url)}" target="_blank" rel="noopener">${truncateUrl(annotation.url)}</a>` : '<span class="text-muted">N/A</span>'}
            </td>
            <td class="annotation-time">${annotation.timestamp ? formatDate(annotation.timestamp) : 'N/A'}</td>
            <td class="screenshot-cell">
                ${imageEntries.length > 0
                ? `<div class="screenshot-gallery">
                    ${imageEntries.map((imageEntry, imageIndex) => `
                        <div class="screenshot-thumb">
                            <div class="screenshot-thumb__image-shell">
                                <img src="${imageEntry.imageURL}"
                                     class="preview-image"
                                     data-annotation-id="${annotation.id}"
                                     data-image-index="${imageIndex}"
                                     data-preview="${imageEntry.imageURL}"
                                     alt="Screenshot ${imageIndex + 1}">
                                <button
                                    class="delete-image-btn"
                                    data-annotation-id="${annotation.id}"
                                    data-image-index="${imageIndex}"
                                    title="Remove screenshot"
                                    aria-label="Remove screenshot">
                                    <span class="visually-hidden">Remove screenshot</span>
                                </button>
                            </div>
                            <span class="screenshot-time">${formatTime(imageEntry.createdAt)}</span>
                        </div>
                    `).join('')}
                </div>`
                : '<span class="text-muted">--</span>'}
            </td>
            <td class="annotation-actions-cell">
                <div class="row-actions">
                    <button class="delete-btn" data-annotation-id="${annotation.id}" title="Delete annotation" aria-label="Delete annotation">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M5.5 5.5v6m5-6v6M2 3.5h12m-1.5 0l-.533 8.528A1.5 1.5 0 0110.477 13.5H5.523a1.5 1.5 0 01-1.49-1.472L3.5 3.5m3-1.5h3a1 1 0 011 1v.5h-5V3a1 1 0 011-1z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function truncateUrl(url) {
    try {
        const parsed = new URL(url);
        const display = parsed.hostname + parsed.pathname;
        return display.length > 50 ? display.substring(0, 47) + '...' : display;
    } catch {
        return url.length > 50 ? url.substring(0, 47) + '...' : url;
    }
}

function formatDate(timestampValue) {
    return new Date(timestampValue).toLocaleDateString('ru-RU');
}

function formatTime(timestampValue) {
    return new Date(timestampValue).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}
