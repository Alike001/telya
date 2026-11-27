import { describe, expect, it, vi } from "vitest";

import { runPaymentActionOnce, type PaymentActionGuard } from "./payment-action-guard";

describe("payment action single-flight guard", () => {
  it("reuses one in-flight authorization for rapid duplicate Confirm calls", async () => {
    let resolve!: (value: string) => void;
    const pending = new Promise<string>((next) => { resolve = next; });
    const authorize = vi.fn(() => pending);
    const guard: PaymentActionGuard<string> = { current: null };

    const first = runPaymentActionOnce(guard, authorize);
    const duplicate = runPaymentActionOnce(guard, authorize);

    expect(duplicate).toBe(first);
    expect(authorize).toHaveBeenCalledTimes(1);

    resolve("submitted");
    await expect(first).resolves.toBe("submitted");
    expect(guard.current).toBeNull();
  });

  it("allows a later refresh only after the previous action settles", async () => {
    const refresh = vi.fn()
      .mockResolvedValueOnce("pending")
      .mockResolvedValueOnce("completed");
    const guard: PaymentActionGuard<string> = { current: null };

    await expect(runPaymentActionOnce(guard, refresh)).resolves.toBe("pending");
    await expect(runPaymentActionOnce(guard, refresh)).resolves.toBe("completed");
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("clears the guard after failure so status can be checked again", async () => {
    const refresh = vi.fn()
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValueOnce("pending");
    const guard: PaymentActionGuard<string> = { current: null };

    await expect(runPaymentActionOnce(guard, refresh)).rejects.toThrow("provider unavailable");
    expect(guard.current).toBeNull();
    await expect(runPaymentActionOnce(guard, refresh)).resolves.toBe("pending");
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
