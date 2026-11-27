export const RESERVED_USERNAMES = new Set([
  "admin",
  "api",
  "help",
  "root",
  "security",
  "support",
  "system",
  "telya",
  "null",
  "undefined",
]);

export interface UsernameValidationResult {
  readonly valid: boolean;
  readonly normalized: string;
  readonly display: string;
  readonly error?: string;
}

/**
 * Validates and normalizes usernames across Telya client and server surfaces.
 * Usernames must be 3-30 letters, numbers, or underscores, and case-insensitive.
 */
export function validateUsername(raw: string): UsernameValidationResult {
  const trimmed = raw.trim();
  const withoutPrefix = trimmed.replace(/^@/, "");
  const normalized = withoutPrefix.toLowerCase();

  if (!withoutPrefix) {
    return {
      valid: false,
      normalized: "",
      display: "",
      error: "Username is required.",
    };
  }

  if (!/^[a-z0-9_]{3,30}$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      display: `@${withoutPrefix}`,
      error:
        "Username must be 3-30 characters and contain only letters, numbers, or underscores.",
    };
  }

  if (RESERVED_USERNAMES.has(normalized)) {
    return {
      valid: false,
      normalized,
      display: `@${normalized}`,
      error: `@${normalized} is a reserved system name.`,
    };
  }

  return {
    valid: true,
    normalized,
    display: `@${withoutPrefix}`,
  };
}
