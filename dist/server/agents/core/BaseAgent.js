export class BaseAgent {
    constructor(_config) {
        this.maxRetries = 3;
        this.timeout = 30000;
        if (_config?.maxRetries)
            this.maxRetries = _config.maxRetries;
        if (_config?.timeout)
            this.timeout = _config.timeout;
    }
    async execute(input) {
        const startTime = Date.now();
        let attempts = 0;
        let lastError = null;
        while (attempts < this.maxRetries) {
            attempts++;
            try {
                const data = await this.process(input);
                return {
                    success: true,
                    data: data,
                    attempts,
                    duration: Date.now() - startTime,
                    timestamp: new Date(),
                };
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                if (attempts < this.maxRetries) {
                    await this.delay(1000 * attempts);
                }
            }
        }
        return {
            success: false,
            error: lastError?.message || "Unknown error",
            attempts,
            duration: Date.now() - startTime,
            timestamp: new Date(),
        };
    }
    async retry(input, _error) {
        return this.execute(input);
    }
    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
