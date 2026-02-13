/**
 * Multi-Model Comparison Controller
 */

import { Request, Response } from 'express';
import { CompareRequest, CompareResponse } from '../types/multiModel.types.js';
import { CompareService } from '../services/compare.service.js';
import { Logger } from '../helpers/logging/Logger.js';

class CompareController {
    private readonly compareService: CompareService;
    private readonly logger = Logger.getInstance();

    constructor() {
        this.compareService = new CompareService();
    }

    /**
     * Compare responses from multiple LLM providers
     * POST /api/compare
     */
    compare = async (req: Request, res: Response): Promise<void> => {
        try {
            let { sourceUrl, question }: CompareRequest = req.body;

            // Validate input
            if (!sourceUrl) {
                res.status(400).json({
                    success: false,
                    error: 'sourceUrl is required'
                });
                return;
            }

            // Normalize URL - add https:// if no protocol is specified
            if (!sourceUrl.match(/^https?:\/\//i)) {
                sourceUrl = `https://${sourceUrl}`;
            }

            // Validate URL format
            try {
                new URL(sourceUrl);
            } catch {
                res.status(400).json({
                    success: false,
                    error: 'Invalid URL format'
                });
                return;
            }

            this.logger.info(`Starting comparison for URL: ${sourceUrl}`);

            // Perform comparison
            const result: CompareResponse = await this.compareService.compareModels({
                sourceUrl,
                question
            });

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            this.logger.error('Error in compare endpoint:', error as Error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error'
            });
        }
    };

    /**
     * Get provider status
     * GET /api/compare/status
     */
    getStatus = async (req: Request, res: Response): Promise<void> => {
        try {
            const status = this.compareService.getProviderStatus();

            res.json({
                success: true,
                data: {
                    providers: status,
                    timestamp: new Date()
                }
            });

        } catch (error) {
            this.logger.error('Error getting provider status:', error as Error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error'
            });
        }
    };

    /**
     * Test a specific provider
     * POST /api/compare/test/:provider
     */
    testProvider = async (req: Request, res: Response): Promise<void> => {
        try {
            const { provider } = req.params;
            const { testPrompt } = req.body;

            if (!provider) {
                res.status(400).json({
                    success: false,
                    error: 'Provider name is required'
                });
                return;
            }

            const result = await this.compareService.testProvider(provider, testPrompt);

            res.json({
                success: true,
                data: {
                    provider,
                    test: result,
                    timestamp: new Date()
                }
            });

        } catch (error) {
            this.logger.error('Error testing provider:', error as Error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error'
            });
        }
    };

    /**
     * Get analysis summary for debugging
     * GET /api/compare/debug
     */
    getDebugInfo = async (req: Request, res: Response): Promise<void> => {
        try {
            const status = this.compareService.getProviderStatus();

            res.json({
                success: true,
                data: {
                    service: 'Multi-Model LLM Comparison Service',
                    version: '1.0.0',
                    providers: status,
                    endpoints: {
                        compare: 'POST /api/compare',
                        status: 'GET /api/compare/status',
                        test: 'POST /api/compare/test/:provider'
                    },
                    environment: {
                        nodeEnv: process.env.NODE_ENV || 'development',
                        apiKeys: {
                            openai: process.env.OPENAI_API_KEY ? 'configured' : 'missing - set OPENAI_API_KEY',
                            claude: process.env.CLAUDE_API_KEY ? 'configured' : 'missing - set CLAUDE_API_KEY',
                            gemini: process.env.GEMINI_API_KEY ? 'configured' : 'missing - set GEMINI_API_KEY'
                        }
                    },
                    timestamp: new Date()
                }
            });

        } catch (error) {
            this.logger.error('Error getting debug info:', error as Error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error'
            });
        }
    };

    /**
     * Debug Gemini integration - test both our provider and direct GoogleAI usage
     * GET /api/compare/debug-gemini
     */
    debugGemini = async (req: Request, res: Response): Promise<void> => {
        try {
            const apiKey = process.env.GEMINI_API_KEY;
            const testPrompt = "Hello, please respond with exactly 'Gemini is working' if you receive this message.";
            const results: any = {
                apiKey: {
                    present: !!apiKey,
                    length: apiKey?.length || 0
                },
                tests: {}
            };

            if (!apiKey) {
                res.status(400).json({
                    success: false,
                    error: 'GEMINI_API_KEY not configured',
                    debug: results
                });
                return;
            }

            // Test 1: Direct GoogleGenerativeAI SDK like LLMAnswerSimulatorService
            try {
                const { GoogleGenerativeAI } = await import('@google/generative-ai');
                const genAI = new GoogleGenerativeAI(apiKey);

                // Try with gemini-1.5-flash (what LLMAnswerSimulatorService uses)
                try {
                    const model1 = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                    const result1 = await model1.generateContent(testPrompt);
                    const response1 = await result1.response;
                    const text1 = response1.text();
                    results.tests.gemini15flash = {
                        success: true,
                        response: text1.substring(0, 100)
                    };
                } catch (error) {
                    results.tests.gemini15flash = {
                        success: false,
                        error: (error as Error).message
                    };
                }

                // Try with gemini-1.0-pro (what we're currently using)
                try {
                    const model2 = genAI.getGenerativeModel({ model: "gemini-1.0-pro" });
                    const result2 = await model2.generateContent(testPrompt);
                    const response2 = await result2.response;
                    const text2 = response2.text();
                    results.tests.gemini10pro = {
                        success: true,
                        response: text2.substring(0, 100)
                    };
                } catch (error) {
                    results.tests.gemini10pro = {
                        success: false,
                        error: (error as Error).message
                    };
                }

                // Try with gemini-pro (alternative name)
                try {
                    const model3 = genAI.getGenerativeModel({ model: "gemini-pro" });
                    const result3 = await model3.generateContent(testPrompt);
                    const response3 = await result3.response;
                    const text3 = response3.text();
                    results.tests.geminiPro = {
                        success: true,
                        response: text3.substring(0, 100)
                    };
                } catch (error) {
                    results.tests.geminiPro = {
                        success: false,
                        error: (error as Error).message
                    };
                }

            } catch (importError) {
                results.tests.sdkImport = {
                    success: false,
                    error: (importError as Error).message
                };
            }

            // Test 2: Our GeminiProvider via CompareService
            try {
                const geminiProvider = this.compareService.getProvider('gemini');
                if (geminiProvider) {
                    const providerResponse = await geminiProvider.generate(testPrompt);
                    results.tests.ourProvider = {
                        success: true,
                        response: providerResponse.substring(0, 100)
                    };
                } else {
                    results.tests.ourProvider = {
                        success: false,
                        error: 'Gemini provider not found in compareService'
                    };
                }
            } catch (error) {
                results.tests.ourProvider = {
                    success: false,
                    error: (error as Error).message
                };
            }

            // Test 3: List available models via API
            try {
                const modelsResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
                const modelsData = await modelsResponse.json();

                if (modelsResponse.ok) {
                    const generativeModels = modelsData.models?.filter((model: any) =>
                        model.supportedGenerationMethods?.includes('generateContent')
                    ) || [];

                    results.availableModels = generativeModels.map((model: any) => ({
                        name: model.name.replace('models/', ''), // Remove the models/ prefix
                        displayName: model.displayName
                    }));
                } else {
                    results.availableModels = {
                        error: `API Error: ${modelsResponse.status} ${JSON.stringify(modelsData)}`
                    };
                }
            } catch (error) {
                results.availableModels = {
                    error: (error as Error).message
                };
            }

            res.json({
                success: true,
                debug: results
            });

        } catch (error) {
            this.logger.error('Error debugging Gemini:', error as Error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error'
            });
        }
    };

    /**
     * Test Gemini API and list available models
     * GET /api/compare/test-gemini
     */
    testGemini = async (req: Request, res: Response): Promise<void> => {
        try {
            const apiKey = process.env.GEMINI_API_KEY;

            if (!apiKey) {
                res.status(400).json({
                    success: false,
                    error: 'GEMINI_API_KEY not configured'
                });
                return;
            }

            // Try to list available models
            const modelsResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            const modelsData = await modelsResponse.json();

            if (!modelsResponse.ok) {
                res.status(400).json({
                    success: false,
                    error: `Gemini API error: ${modelsResponse.status} ${JSON.stringify(modelsData)}`
                });
                return;
            }

            // Filter for generative models
            const generativeModels = modelsData.models?.filter((model: any) =>
                model.supportedGenerationMethods?.includes('generateContent')
            ) || [];

            res.json({
                success: true,
                data: {
                    totalModels: modelsData.models?.length || 0,
                    generativeModels: generativeModels.map((model: any) => ({
                        name: model.name,
                        displayName: model.displayName,
                        description: model.description
                    }))
                }
            });

        } catch (error) {
            this.logger.error('Error testing Gemini API:', error as Error);
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Internal server error'
            });
        }
    };
}

export default CompareController;
