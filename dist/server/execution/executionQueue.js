export class ExecutionQueue {
    constructor() {
        this.queue = [];
        this.running = false;
    }
    async add(task) {
        this.queue.push(task);
        if (!this.running) {
            this.running = true;
            await this.process();
        }
    }
    async process() {
        while (this.queue.length > 0) {
            const task = this.queue.shift();
            if (task) {
                await task();
            }
        }
        this.running = false;
    }
}
