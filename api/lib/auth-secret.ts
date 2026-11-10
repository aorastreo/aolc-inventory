/** Shared secrets for JWT and one-off ops routes. Never hardcode production values. */

export function getJwtSecretText(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret) return secret;

  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production");
  }

  // Local/dev only — production refuses to start without JWT_SECRET.
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
