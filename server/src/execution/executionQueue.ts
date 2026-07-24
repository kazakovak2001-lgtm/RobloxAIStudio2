export class ExecutionQueue {
  private queue: Array<() => Promise<void>> = [];
  private running = false;

  async add(task: () => Promise<void>): Promise<void> {
    this.queue.push(task);
    if (!this.running) {
      this.running = true;
      await this.process();
    }
  }

  private async process(): Promise<void> {
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        await task();
      }
    }
    this.running = false;
  }
}
