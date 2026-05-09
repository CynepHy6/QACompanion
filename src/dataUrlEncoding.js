const BINARY_CHUNK_SIZE = 0x8000;

function encodeBinaryStringToBase64(binaryString) {
    if (typeof btoa === 'function') {
        return btoa(binaryString);
    }

    if (typeof Buffer !== 'undefined') {
        return Buffer.from(binaryString, 'binary').toString('base64');
    }

    throw new Error('Base64 encoding is not available in this environment.');
}

export function encodeUtf8TextToBase64(textContent) {
    const utf8Bytes = new TextEncoder().encode(textContent);
    let binaryString = '';

    for (let startIndex = 0; startIndex < utf8Bytes.length; startIndex += BINARY_CHUNK_SIZE) {
        const byteChunk = utf8Bytes.subarray(startIndex, startIndex + BINARY_CHUNK_SIZE);
        binaryString += String.fromCharCode(...byteChunk);
    }

    return encodeBinaryStringToBase64(binaryString);
}

export function createBase64DataUrl(mimeType, textContent) {
    return `data:${mimeType};charset=utf-8;base64,${encodeUtf8TextToBase64(textContent)}`;
}
