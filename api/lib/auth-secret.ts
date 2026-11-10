/** Shared secrets for JWT and one-off ops routes. */

/**
 * Same resolution as before the lockdown: JWT_SECRET if set, else the
 * legacy production secret. Do not use APP_SECRET here — that would
 * invalidate every existing admin session on aogestion.com.
 */
export function getJwtSecretText(): string {
  const fromEnv = process.env.JWT_SECRET?.trim();
  if (fromEnv) return fromEnv;
  return "aolc-secret-key-2024";
}

export function getJwtSecretKey(): Uint8Array {
  return new TextEncoder().encode(getJwtSecretText());
}

/** Secret for /api/init-* and migrate routes. Empty = those routes stay closed. */
export function getInitTablesSecret(): string {
  return process.env.INIT_TABLES_SECRET?.trim() || "";
}

export function assertInitTablesSecret(provided: string | undefined | null): boolean {
  const expected = getInitTablesSecret();
  if (!expected) return false;
  return provided === expected;
}
