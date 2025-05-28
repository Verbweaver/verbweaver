/**
 * Converts a base64url-encoded string to an ArrayBuffer.
 * @param base64urlString The base64url-encoded string.
 * @returns The corresponding ArrayBuffer.
 */
export function base64urlToBuffer(base64urlString: string): ArrayBuffer {
  const padding = '='.repeat((4 - base64urlString.length % 4) % 4);
  const base64 = (base64urlString + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

/**
 * Converts an ArrayBuffer to a base64url-encoded string.
 * @param buffer The ArrayBuffer to convert.
 * @returns The base64url-encoded string.
 */
export function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  // Prefer String.fromCharCode.apply for performance with large arrays if needed,
  // but this loop is generally fine and more readable for typical credential sizes.
  for (const charCode of bytes) {
    str += String.fromCharCode(charCode);
  }
  const base64String = window.btoa(str);
  return base64String.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
} 