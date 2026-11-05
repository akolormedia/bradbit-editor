import { describe, expect, it, vi } from "vitest";
import { MenuSyncQueue } from "./menuSync";

describe("menu sync queue (T-1.2.1)", () => {
  it("serializes refreshes and sends only the latest state after a burst", async () => {
    let state = 1;
    const sent: number[] = [];
    let releaseFirst!: () => void;
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let concurrent = 0;
    let maxConcurrent = 0;

    const queue = new MenuSyncQueue(
      () => state,
      async (value) => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        sent.push(value);
        if (value === 1) await first;
        concurrent -= 1;
      },
      () => {},
    );

    queue.request();
    await Promise.resolve();
    state = 2;
    queue.request();
    state = 3;
    queue.request();

    expect(sent).toEqual([1]);
    releaseFirst();
    await vi.waitFor(() => expect(sent).toEqual([1, 3]));
    expect(maxConcurrent).toBe(1);
  });

  it("keeps working after a failed refresh and never loops on errors", async () => {
    let state = 1;
    const sent: number[] = [];
    const errors: unknown[] = [];
    const send = vi.fn(async (value: number) => {
      sent.push(value);
      if (sent.length === 1) throw new Error("offline");
    });

    const queue = new MenuSyncQueue(
      () => state,
      send,
      (error) => errors.push(error),
    );

    queue.request();
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(sent).toEqual([1]);

    state = 2;
    queue.request();
    await vi.waitFor(() => expect(sent).toEqual([1, 2]));
  });
});
