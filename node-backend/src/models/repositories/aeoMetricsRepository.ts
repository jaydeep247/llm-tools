import { prisma } from '../../config/prismaClient.js';

export interface ModuleCData {
    url: string;
    session_id?: number;
    metrics: {
        difficulty_score: number;
        complexity_level: string;
        ai_generation_feasibility: number;
    };
    entity_coverage: {
        score: number;
        found_entities: string[];
        missing_entities: string[];
    };
    consistency_score?: number;
    main_topics?: string[];
    llm_friendliness_score: number;
    readability_score: number;
    fact_density: number;
    // New Metrics
    content_type_accuracy?: number;
    prompt_intent_match?: number;
    visibility_impact?: number;
    suggested_content_type?: string;
    prompt_intent_details?: {
        matched_intents: string[];
        confidence: number;
        search_queries: string[];
        // Optional enriched clustering info from GPT
        intent_clusters?: {
            informational?: { prompt_count?: number; example_prompts?: string[] };
            commercial?: { prompt_count?: number; example_prompts?: string[] };
            comparative?: { prompt_count?: number; example_prompts?: string[] };
            transactional?: { prompt_count?: number; example_prompts?: string[] };
            agent_style?: { prompt_count?: number; example_prompts?: string[] };
            // Allow future keys without breaking typing
            [key: string]: any;
        };
        cluster_metrics?: {
            total_prompts?: number;
            categorized_prompts?: number;
            coverage_percentage?: number;
            clustering_accuracy?: number;
            // Allow extension
            [key: string]: any;
        };
        // Allow any extra keys future analyses might add
        [key: string]: any;
    };
    visibility_factors?: {
        factors: string[];
        score_breakdown: Record<string, number>;
        recommendations: string[];
    };
    // Entity Metrics
    entities_detected_count?: number;
    entity_coverage_score?: number;
    entity_relevance_score?: number;
    entity_relevance_details?: {
        relevance_explanation: string;
        relevant_entities: string[];
        irrelevant_entities: string[];
    };
}

export const aeoMetricsRepository = {
    // Save Module C Analysis Results
    save: async (data: ModuleCData) => {
        try {
            const result = await prisma.aeoModuleCMetric.create({
                data: {
                    url: data.url,
                    sessionId: data.session_id || null,
                    difficultyScore: data.metrics.difficulty_score,
                    complexityLevel: data.metrics.complexity_level,
                    aiFeasibilityScore: data.metrics.ai_generation_feasibility,
                    entityCoverageScore: data.entity_coverage.score,
                    foundEntities: JSON.stringify(data.entity_coverage.found_entities),
                    missingEntities: JSON.stringify(data.entity_coverage.missing_entities),
                    consistencyScore: data.consistency_score || 0,
                    mainTopics: JSON.stringify(data.main_topics || []),
                    llmFriendlinessScore: data.llm_friendliness_score,
                    readabilityScore: data.readability_score,
                    factDensity: data.fact_density,
                    contentTypeAccuracy: data.content_type_accuracy || 0,
                    promptIntentMatch: data.prompt_intent_match || 0,
                    visibilityImpact: data.visibility_impact || 0,
                    suggestedContentType: data.suggested_content_type || null,
                    promptIntentDetails: JSON.stringify(data.prompt_intent_details || {}),
                    visibilityFactors: JSON.stringify(data.visibility_factors || {}),
                    entitiesDetectedCount: data.entities_detected_count || 0,
                    entityRelevanceScore: data.entity_relevance_score || 0,
                    entityRelevanceDetails: data.entity_relevance_details ? JSON.stringify(data.entity_relevance_details) : null,
                },
            });
            return result;
        } catch (error) {
            console.error('❌ Error saving Module C metrics:', error);
            throw error;
        }
    },

    // Get Latest Metrics for a URL
    getLatest: async (url: string) => {
        try {
            const result = await prisma.aeoModuleCMetric.findFirst({
                where: { url },
                orderBy: { createdAt: 'desc' },
            });

            if (!result) return null;

            // Parse JSON fields back to objects
            return {
                ...result,
                found_entities: JSON.parse(result.foundEntities || '[]'),
                missing_entities: JSON.parse(result.missingEntities || '[]'),
                main_topics: JSON.parse(result.mainTopics || '[]'),
                prompt_intent_details: JSON.parse(result.promptIntentDetails || '{}'),
                visibility_factors: JSON.parse(result.visibilityFactors || '{}'),
                entity_relevance_details: JSON.parse(result.entityRelevanceDetails || '{}'),
            };
        } catch (error) {
            console.error('❌ Error fetching Module C metrics:', error);
            return null;
        }
    }
};
