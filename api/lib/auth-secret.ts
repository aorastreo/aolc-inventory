/** Shared secrets for JWT and one-off ops routes. */

/**
 * Resolve JWT signing secret without crashing production boots.
 * Prefer JWT_SECRET, then APP_SECRET (already on Railway), then the
 * legacy value so existing admin sessions keep working after deploy.
 */
export function getJwtSecretText(): string {
  const fromEnv = process.env.JWT_SECRET?.trim();
  if (fromEnv) return fromEnv;

  const fromAppSecret = process.env.APP_SECRET?.trim();
  if (fromAppSecret) {
    if (process.env.NODE_ENV === "production") {
      console.warn("[auth] JWT_SECRET missing; using APP_SECRET for session tokens.");
    }
    return fromAppSecret;
  }

  // Legacy fallback used before env-based secrets. Keeps aogestion.com up
  // until JWT_SECRET is configured in Railway.
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[auth] JWT_SECRET and APP_SECRET missing; using legacy session secret. Set JWT_SECRET in Railway.",
    );
  }
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
