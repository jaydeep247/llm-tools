/**
 * OpenAI Provider
 */

import { LLMProvider } from '../types/multiModel.types.js';
import { Logger } from '../helpers/logging/Logger.js';

class OpenAIProvider implements LLMProvider {
    public readonly name = 'openai';
    private readonly apiKey: string;
    private readonly baseURL: string;
    private readonly logger = Logger.getInstance();

    constructor() {
        this.apiKey = process.env.OPENAI_API_KEY || '';
        this.baseURL = 'https://api.openai.com/v1';

        if (!this.apiKey) {
            this.logger.warn('OPENAI_API_KEY not found in environment variables');
        }
    }

    async generate(prompt: string): Promise<string> {
        try {
            if (!this.apiKey) {
                throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.');
            }

            const response = await fetch(`${this.baseURL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    model: 'gpt-4',
                    messages: [
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 2000,
                }),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`OpenAI API error: ${response.status} ${error}`);
            }

            const data = await response.json();
            return data.choices[0].message.content;

        } catch (error) {
            this.logger.error('OpenAI provider error:', error as Error);
            throw error;
        }
    }
}

export default OpenAIProvider;
