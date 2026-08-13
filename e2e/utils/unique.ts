/**
 * Generate a unique, valid alias (matches the API's ^[A-Za-z0-9_-]{3,32}$ rule)
 * so tests never collide with each other or with data left by a previous run.
 */
export function uniqueAlias(prefix: string): string {
  const rand = Math.floor(Math.random() * 1e6).toString(36);
  return `${prefix}-${Date.now().toString(36)}${rand}`.slice(0, 32);
}
