export class OpenAIProvider {
    constructor(apiKey, baseUrl = "https://api.openai.com/v1") {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
    }
    async generate(prompt, options = {}) {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: options.model ?? "gpt-4",
                messages: [{ role: "user", content: prompt }],
                temperature: options.temperature ?? 0.7,
                max_tokens: options.maxTokens ?? 2000,
                stop: options.stop,
            }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
        }
        const data = (await response.json());
        return data.choices[0]?.message?.content ?? "";
    }
    async stream(prompt, onChunk) {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: "gpt-4",
                messages: [{ role: "user", content: prompt }],
                stream: true,
            }),
        });
        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status}`);
        }
        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error("Response body is not readable");
        }
        const decoder = new TextDecoder();
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            const chunk = decoder.decode(value);
            const lines = chunk.split("\n").filter((line) => line.startsWith("data: "));
            for (const line of lines) {
                const data = line.slice(6);
                if (data === "[DONE]")
                    return;
                try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices[0]?.delta?.content ?? "";
                    if (content)
                        onChunk(content);
                }
                catch {
                    // ignore parse errors
                }
            }
        }
    }
}
export class AnthropicProvider {
    constructor(apiKey, baseUrl = "https://api.anthropic.com/v1") {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
    }
    async generate(prompt, options = {}) {
        const response = await fetch(`${this.baseUrl}/messages`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": this.apiKey,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: options.model ?? "claude-3-5-sonnet-20240620",
                max_tokens: options.maxTokens ?? 2000,
                temperature: options.temperature ?? 0.7,
                messages: [{ role: "user", content: prompt }],
                stop_sequences: options.stop,
            }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
        }
        const data = (await response.json());
        return data.content[0]?.text ?? "";
    }
    async stream(_prompt, _onChunk) {
        throw new Error("Streaming not yet implemented for Anthropic provider");
    }
}
export class LocalLLMProvider {
    constructor(endpoint) {
        this.endpoint = endpoint;
    }
    async generate(prompt, options = {}) {
        const response = await fetch(this.endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                prompt,
                model: options.model ?? "default",
                temperature: options.temperature ?? 0.7,
                max_tokens: options.maxTokens ?? 2000,
            }),
        });
        if (!response.ok) {
            throw new Error(`Local LLM error: ${response.status}`);
        }
        const data = (await response.json());
        return data.response ?? "";
    }
    async stream(_prompt, _onChunk) {
        throw new Error("Streaming not yet implemented for local provider");
    }
}
