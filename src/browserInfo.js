function getNavigatorString(propertyName) {
    if (typeof navigator === 'undefined' || typeof navigator[propertyName] !== 'string') {
        return '';
    }

    return navigator[propertyName];
}

function getNavigatorLanguages() {
    if (typeof navigator === 'undefined' || !Array.isArray(navigator.languages)) {
        return [];
    }

    return navigator.languages.filter((languageValue) => typeof languageValue === 'string' && languageValue !== '');
}

function detectBrowserName(userAgentValue) {
    if (/Edg\//i.test(userAgentValue)) {
        return 'Microsoft Edge';
    }

    if (/OPR\//i.test(userAgentValue)) {
        return 'Opera';
    }

    if (/Firefox\//i.test(userAgentValue)) {
        return 'Firefox';
    }

    if (/Chrome\//i.test(userAgentValue) || /Chromium\//i.test(userAgentValue)) {
        return 'Chrome';
    }

    if (/Safari\//i.test(userAgentValue)) {
        return 'Safari';
    }

    return 'Unknown Browser';
}

function detectBrowserVersion(userAgentValue) {
    const versionPatterns = [
        /Edg\/([0-9.]+)/i,
        /OPR\/([0-9.]+)/i,
        /Firefox\/([0-9.]+)/i,
        /Chrome\/([0-9.]+)/i,
        /Version\/([0-9.]+).*Safari/i
    ];

    for (const versionPattern of versionPatterns) {
        const versionMatch = userAgentValue.match(versionPattern);
        if (versionMatch) {
            return versionMatch[1];
        }
    }

    return '';
}

function detectOperatingSystem(platformValue, userAgentValue) {
    const normalizedPlatform = platformValue.toLowerCase();
    const normalizedUserAgent = userAgentValue.toLowerCase();

    if (normalizedUserAgent.includes('android')) {
        return 'Android';
    }

    if (/iphone|ipad|ipod/.test(normalizedUserAgent)) {
        return 'iOS';
    }

    if (normalizedUserAgent.includes('cros')) {
        return 'ChromeOS';
    }

    if (normalizedPlatform.includes('win')) {
        return 'Windows';
    }

    if (normalizedPlatform.includes('mac')) {
        return 'macOS';
    }

    if (normalizedPlatform.includes('linux') || normalizedUserAgent.includes('linux')) {
        return 'Linux';
    }

    return platformValue || 'Unknown OS';
}

function detectArchitecture(platformValue, userAgentValue) {
    const normalizedSource = `${platformValue} ${userAgentValue}`.toLowerCase();

    if (/arm64|aarch64/.test(normalizedSource)) {
        return 'arm64';
    }

    if (/x86_64|win64|x64|amd64|wow64/.test(normalizedSource)) {
        return 'x86_64';
    }

    if (/i[3-6]86|x86/.test(normalizedSource)) {
        return 'x86';
    }

    if (/arm/.test(normalizedSource)) {
        return 'arm';
    }

    return '';
}

function getTimezone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch {
        return '';
    }
}

export function getSystemInfo() {
    const userAgentValue = getNavigatorString('userAgent');
    const platformValue = getNavigatorString('platform');
    const browserName = detectBrowserName(userAgentValue);
    const browserVersion = detectBrowserVersion(userAgentValue);
    const operatingSystemName = detectOperatingSystem(platformValue, userAgentValue);
    const architectureName = detectArchitecture(platformValue, userAgentValue);

    return {
        browser: browserName,
        browserVersion,
        browserDisplayName: [browserName, browserVersion].filter(Boolean).join(' '),
        os: operatingSystemName,
        architecture: architectureName,
        osDisplay: [operatingSystemName, architectureName].filter(Boolean).join(' '),
        osVersion: userAgentValue,
        platform: platformValue,
        userAgent: userAgentValue,
        language: getNavigatorString('language'),
        languages: getNavigatorLanguages(),
        timezone: getTimezone(),
        cookies: typeof navigator !== 'undefined' ? Boolean(navigator.cookieEnabled) : false,
        flashVersion: 'N/A'
    };
}