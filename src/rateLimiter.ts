// Simple rate limiter with concurrency + minimal interval between task starts.
// Ensures we don't exceed provider throttling.

export class RateLimiter {
  private maxConcurrent: number;
  private minInterval: number; // ms between starting tasks
  private active = 0;
  private lastStart = 0;
  private queue: Array<() => void> = [];

  constructor(maxConcurrent: number, minIntervalMs: number) {
    this.maxConcurrent = Math.max(1, maxConcurrent);
    this.minInterval = Math.max(0, minIntervalMs);
  }

  acquire(): Promise<void> {
    return new Promise((resolve) => {
      const attempt = () => {
        const now = Date.now();
        // Can we start a new task?
        if (
          this.active < this.maxConcurrent &&
          now - this.lastStart >= this.minInterval
        ) {
          this.active++;
          this.lastStart = now;
          resolve();
          return;
        }
        // Queue attempt
        this.queue.push(attempt);
      };
      this.queue.push(attempt);
      this.processQueue();
    });
  }

  release() {
    if (this.active > 0) this.active--;
    this.processQueue();
  }

  private processQueue() {
    if (!this.queue.length) return;
    if (this.active >= this.maxConcurrent) return; // wait for release
    const now = Date.now();
    const wait = this.minInterval - (now - this.lastStart);
    if (wait > 0) {
      // Re-run when interval elapses
      setTimeout(() => this.processQueue(), wait);
      return;
    }
    const nextAttempt = this.queue.shift();
    if (nextAttempt) nextAttempt();
    // If capacity remains, try more immediately
    if (this.queue.length && this.active < this.maxConcurrent) {
      this.processQueue();
    }
  }
}
