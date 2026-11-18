import DOMPurify from 'dompurify'

// Dedicated instance so the hook below does not affect other DOMPurify users.
const purify = DOMPurify(window)

// External links open in the system browser (desktop: setWindowOpenHandler -> shell.openExternal)
// instead of replacing the app window.
purify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    const href = node.getAttribute('href') || ''
    if (/^https?:/i.test(href)) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
  }
})

/**
 * Sanitize HTML produced from project content (e.g. the Pandoc Markdown preview) before it is
 * injected into the page. Project files are untrusted: raw HTML in Markdown passes through Pandoc
 * unchanged, and the renderer has access to window.electronAPI on desktop.
 *
 * WHOLE_DOCUMENT keeps Pandoc's standalone <head><style>, so the preview looks the same as before.
 */
export function sanitizePreviewHtml(html: string): string {
  return purify.sanitize(html, { WHOLE_DOCUMENT: true, FORBID_TAGS: ['form'] })
}
