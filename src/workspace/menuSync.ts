/**
 * Serializes menu refreshes so the native menu always ends up with the latest
 * UI state. Without this, several async `refresh_menu` IPC calls can arrive out
 * of order and leave stale enabled items or check marks.
 */
export class MenuSyncQueue<T> {
  private inFlight = false;
  private pending = false;
  private failed = false;

  constructor(
    private readonly read: () => T,
    private readonly send: (value: T) => Promise<void>,
    private readonly onError: (error: unknown) => void,
  ) {}

  public request(): void {
    if (this.inFlight) {
      this.pending = true;
      return;
    }
    void this.flush();
  }

  private async flush(): Promise<void> {
    this.inFlight = true;
    try {
      do {
        this.pending = false;
        await this.send(this.read());
      } while (this.pending);
      this.failed = false;
    } catch (error) {
      this.failed = true;
      this.onError(error);
    } finally {
      this.inFlight = false;
      if (!this.failed && this.pending) {
        this.request();
      }
      this.failed = false;
    }
  }
}
