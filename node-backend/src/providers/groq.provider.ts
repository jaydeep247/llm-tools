/**
 * Groq Provider
 * Fast inference with Llama and Mixtral models
 */

import { LLMProvider } from '../types/multiModel.types.js';
import { Logger } from '../helpers/logging/Logger.js';

class GroqProvider implements LLMProvider {
    public readonly name = 'groq';
    private readonly apiKey: string;
    private readonly baseURL: string;
    private readonly logger = Logger.getInstance();

    constructor() {
        this.apiKey = process.env.GROQ_API_KEY || '';
        this.baseURL = 'https://api.groq.com/openai/v1';

        if (!this.apiKey) {
            this.logger.warn('GROQ_API_KEY not found in environment variables');
        }
    }

    async generate(prompt: string): Promise<string> {
        try {
            if (!this.apiKey) {
                throw new Error('Groq API key not configured. Please set GROQ_API_KEY environment variable.');
            }

            const response = await fetch(`${this.baseURL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: [
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    max_tokens: 2000,
                    temperature: 0.7,
                }),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Groq API error: ${response.status} ${error}`);
            }

            const data = await response.json();
            return data.choices[0].message.content;

        } catch (error: any) {
            this.logger.error('Groq provider error:', error);

            if (error.message?.includes('API key')) {
                throw new Error('Groq API key not configured or invalid. Please set GROQ_API_KEY environment variable.');
            }

            throw error;
        }
    }
}

export default GroqProvider;
