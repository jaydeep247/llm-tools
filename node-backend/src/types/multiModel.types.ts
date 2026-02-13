/**
 * Multi-Model LLM Comparison Types
 */

export interface CompareRequest {
    sourceUrl: string;
    question?: string;
}

export interface ModelResponse {
    provider: string;
    response: string;
    timestamp: Date;
    responseTime: number;
    error?: string;
}

export interface Claim {
    id: string;
    content: string;
    confidence: number;
    category: string;
    source: string;
}

export interface AgreementAnalysis {
    outcomeLevel: {
        agreement: 'same' | 'compatible' | 'contradictory';
        score: number;
    };
    reasoningLevel: {
        similarity: number;
        approach: 'same' | 'different' | 'shallow_vs_detailed';
    };
    specificityLevel: {
        depthScore: number;
        completenessScore: number;
        exampleCount: number;
    };
    toneAnalysis: {
        confidence: 'hedged' | 'moderate' | 'assertive';
        riskPosture: 'cautious' | 'neutral' | 'aggressive';
    };
}

export interface ClaimMatrix {
    claim: string;
    providers: {
        openai: boolean;
        gemini: boolean;
        groq: boolean;
    };
    category: string;
    importance: number;
}

export interface CoverageGap {
    type: 'missing_risk' | 'missing_stakeholder' | 'missing_step' | 'missing_constraint' | 'missing_quantification' | 'missing_edge_case' | 'missing_temporal_aspect' | 'other';
    description: string;
    missingFrom: string[];
    presentIn: string[];
    severity: 'low' | 'medium' | 'high';
}

export interface ModelScore {
    agreement: number;
    depth: number;
    actionability: number;
    assumptionsStated: number;
    overall: number;
}

export interface CompareResponse {
    normalizedPrompt: string;
    responses: {
        openai: string;
        gemini: string;
        groq: string;
    };
    agreement: AgreementAnalysis;
    claimMatrix: ClaimMatrix[];
    coverageGaps: CoverageGap[];
    scores: {
        openai: ModelScore;
        gemini: ModelScore;
        groq: ModelScore;
    };
    metadata: {
        sourceUrl: string;
        processedAt: Date;
        processingTime: number;
    };
}

export interface LLMProvider {
    name: string;
    generate(prompt: string): Promise<string>;
}

export interface ContentData {
    title?: string;
    content: string;
    metadata?: Record<string, any>;
}
