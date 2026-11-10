/** Shared secrets for JWT and one-off ops routes. */

/**
 * Prefer JWT_SECRET. In production fall back to APP_SECRET (already required)
 * so we never sign with the old public hardcoded key. Dev may use a local default.
 */
export function getJwtSecretText(): string {
  const jwt = process.env.JWT_SECRET?.trim();
  if (jwt) return jwt;

  const appSecret = process.env.APP_SECRET?.trim();
  if (appSecret) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[auth] JWT_SECRET is not set; using APP_SECRET for sessions. Set JWT_SECRET in Railway to rotate cleanly.",
      );
    }
    return appSecret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Missing JWT_SECRET (or APP_SECRET) for signing sessions");
  }

  return "aolc-dev-only-secret";
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
