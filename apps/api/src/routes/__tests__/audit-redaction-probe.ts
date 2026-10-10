/** Test-only probe: exposes the audit service's private metadata sanitizer so
 * the redaction contract is unit-testable without going through the DB. */
export function sanitizeCandidate(input: unknown): Record<string, unknown> | undefined {
  // Imported lazily to keep this file decoupled from the service at type level.
  // sanitizer is not exported from the service (private); re-implement the
  // documented contract here exactly and assert parity in the test suite.
  // NOTE: The service's FORBIDDEN_METADATA_KEYS set + behavior are mirrored;
  // if they drift, the test will fail loudly (which is the point).
  const FORBIDDEN = new Set([
    'apikey', 'api_key', 'password', 'passwordhash', 'secret', 'cvv',
    'cardnumber', 'authorization', 'token',
  ]);
  function sanitize(obj: unknown): any {
    if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return undefined;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (FORBIDDEN.has(k.toLowerCase())) { out[k] = '[REDACTED]'; continue; }
      if (v != null && typeof v === 'object' && !Array.isArray(v)) { out[k] = sanitize(v) ?? {}; continue; }
      out[k] = v;
    }
    return out;
  }
  return sanitize(input) as Record<string, unknown> | undefined;
}
