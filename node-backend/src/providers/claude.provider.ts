/**
 * Claude Provider
 */

import { LLMProvider } from '../types/multiModel.types.js';
import { Logger } from '../helpers/logging/Logger.js';

class ClaudeProvider implements LLMProvider {
    public readonly name = 'claude';
    private readonly apiKey: string;
    private readonly baseURL: string;
    private readonly logger = Logger.getInstance();

    constructor() {
        this.apiKey = process.env.CLAUDE_API_KEY || '';
        this.baseURL = 'https://api.anthropic.com/v1';

        if (!this.apiKey) {
            this.logger.warn('CLAUDE_API_KEY not found in environment variables');
        }
    }

    async generate(prompt: string): Promise<string> {
        try {
            if (!this.apiKey) {
                throw new Error('Claude API key not configured. Please set CLAUDE_API_KEY environment variable.');
            }

            const response = await fetch(`${this.baseURL}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model: 'claude-3-sonnet-20240229',
                    max_tokens: 2000,
                    messages: [
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                }),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Claude API error: ${response.status} ${error}`);
            }

            const data = await response.json();
            return data.content[0].text;

        } catch (error: any) {
            this.logger.error('Claude provider error:', error);

            if (error.message?.includes('credit balance')) {
                throw new Error('Claude API: Insufficient credits. Please add credits at https://console.anthropic.com/account/billing');
            }

            if (error.message?.includes('API key')) {
                throw new Error('Claude API key not configured or invalid. Please set CLAUDE_API_KEY environment variable.');
            }

            throw error;
        }
    }
}

export default ClaudeProvider;
