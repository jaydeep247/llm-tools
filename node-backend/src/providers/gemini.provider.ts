/**
 * Gemini Provider
 */

import { LLMProvider } from '../types/multiModel.types.js';
import { Logger } from '../helpers/logging/Logger.js';
import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";

class GeminiProvider implements LLMProvider {
    public readonly name = 'gemini';
    private genAI?: GoogleGenerativeAI;
    private model?: GenerativeModel;
    private readonly logger = Logger.getInstance();

    constructor() {
        const apiKey = process.env.GEMINI_API_KEY;

        if (apiKey) {
            this.genAI = new GoogleGenerativeAI(apiKey);
            this.model = this.genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 50000,
                }
            });
            this.logger.info('Gemini AI initialized');
        } else {
            this.logger.warn('GEMINI_API_KEY not found in environment variables');
        }
    }

    async generate(prompt: string): Promise<string> {
        try {
            this.logger.info('Gemini generate called with prompt length:', { length: prompt.length });

            if (!this.genAI || !this.model) {
                this.logger.error('Gemini not initialized', new Error(`Initialization failed - genAI: ${!!this.genAI}, model: ${!!this.model}, hasApiKey: ${!!process.env.GEMINI_API_KEY}`));
                throw new Error('Gemini API key not configured. Please set GEMINI_API_KEY environment variable.');
            }

            this.logger.info('Calling Gemini generateContent...');
            const result = await this.model.generateContent(prompt);

            this.logger.info('Got result from generateContent, getting response...');
            const response = await result.response;

            this.logger.info('Got response, getting text...');
            const text = response.text();

            this.logger.info('Successfully got text from Gemini, length:', { length: text?.length });
            return text;

        } catch (error: any) {
            this.logger.error('Gemini provider error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name,
                cause: error.cause
            });

            if (error.message?.includes('API key')) {
                throw new Error('Gemini API key not configured or invalid. Please set GEMINI_API_KEY environment variable.');
            }

            if (error.message?.includes('404') || error.message?.includes('not found')) {
                throw new Error('Gemini model not found. The model name may have changed. Please check Google AI documentation.');
            }

            // For debugging, include the original error
            throw new Error(`Gemini error: ${error.message}`);
        }
    }
}

export default GeminiProvider;
