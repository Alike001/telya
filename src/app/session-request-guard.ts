export interface SessionRequestGuard {
  readonly isActive: () => boolean;
  readonly cancel: () => void;
}

/** Prevent an async response from writing state after its auth session changed. */
export function createSessionRequestGuard(): SessionRequestGuard {
  let active = true;
  return {
    isActive: () => active,
    cancel: () => { active = false; },
  };
}
