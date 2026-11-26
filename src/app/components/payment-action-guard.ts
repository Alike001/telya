export interface PaymentActionGuard<T> {
  current: Promise<T> | null;
}

/**
 * Reuses the active payment action so rapid clicks cannot start a second
 * authorization or reconciliation before React has rendered a disabled button.
 */
export function runPaymentActionOnce<T>(
  guard: PaymentActionGuard<T>,
  action: () => Promise<T>,
): Promise<T> {
  if (guard.current) return guard.current;

  const active = action().finally(() => {
    if (guard.current === active) guard.current = null;
  });
  guard.current = active;
  return active;
}
