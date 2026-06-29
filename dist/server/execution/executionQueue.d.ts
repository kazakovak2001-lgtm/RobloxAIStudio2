export declare class ExecutionQueue {
    private queue;
    private running;
    add(task: () => Promise<void>): Promise<void>;
    private process;
}
