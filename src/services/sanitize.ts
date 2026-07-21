/**
 * Escapes HTML characters to prevent XSS attacks in stored user inputs.
 */
export function sanitizeXSS(str: string): string {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Recursively sanitizes string values in an object or array.
 */
export function sanitizeObject<T>(obj: T): T {
  if (typeof obj === 'string') {
    return sanitizeXSS(obj) as unknown as T;
  }
  if (obj !== null && typeof obj === 'object') {
    if (Array.isArray(obj)) {
      return obj.map((item) => sanitizeObject(item)) as unknown as T;
    }
    const sanitized: any = {};
    for (const key of Object.keys(obj as any)) {
      sanitized[key] = sanitizeObject((obj as any)[key]);
    }
    return sanitized as T;
  }
  return obj;
}
