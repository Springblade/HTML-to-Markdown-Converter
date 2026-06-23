export type UrlValidationResult = { valid: true } | { valid: false; error: string };

export function validateUrl(value: string): UrlValidationResult {
  if (!value.trim()) {
    return { valid: false, error: 'Please enter a URL' };
  }

  if (value.length > 2048) {
    return { valid: false, error: 'URL must be 2048 characters or less' };
  }

  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'URL must start with http:// or https://' };
    }
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  return { valid: true };
}
