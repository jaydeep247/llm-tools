import { query } from '../../config/dbConnection.js';

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
        const sql = `
            INSERT INTO aeo_module_c_metrics (
                url, session_id,
                difficulty_score, complexity_level, ai_feasibility_score,
                entity_coverage_score, found_entities, missing_entities,
                consistency_score, main_topics,
                llm_friendliness_score, readability_score, fact_density,
                content_type_accuracy, prompt_intent_match, visibility_impact,
                suggested_content_type, prompt_intent_details, visibility_factors,
                entities_detected_count, entity_relevance_score, entity_relevance_details
            ) VALUES (
                $1, $2,
                $3, $4, $5,
                $6, $7, $8,
                $9, $10,
                $11, $12, $13,
                $14, $15, $16,
                $17, $18, $19,
                $20, $21, $22
            ) RETURNING id;
        `;

        const params = [
            data.url,
            data.session_id || null,
            data.metrics.difficulty_score,
            data.metrics.complexity_level,
            data.metrics.ai_generation_feasibility,
            data.entity_coverage.score,
            JSON.stringify(data.entity_coverage.found_entities),
            JSON.stringify(data.entity_coverage.missing_entities),
            data.consistency_score || 0,
            JSON.stringify(data.main_topics || []),
            data.llm_friendliness_score,
            data.readability_score,
            data.fact_density,
            data.content_type_accuracy || 0,
            data.prompt_intent_match || 0,
            data.visibility_impact || 0,
            data.suggested_content_type || null,
            JSON.stringify(data.prompt_intent_details || {}),
            JSON.stringify(data.visibility_factors || {}),
            data.entities_detected_count || 0,
            data.entity_relevance_score || 0,
            data.entity_relevance_details ? JSON.stringify(data.entity_relevance_details) : null
        ];

        try {
            const result = await query(sql, params);
            return result.rows[0];
        } catch (error) {
            console.error('❌ Error saving Module C metrics:', error);
            throw error;
        }
    },

    // Get Latest Metrics for a URL
    getLatest: async (url: string) => {
        const sql = `
            SELECT * FROM aeo_module_c_metrics 
            WHERE url = $1 
            ORDER BY created_at DESC 
            LIMIT 1
        `;

        try {
            const result = await query(sql, [url]);
            const row = result.rows[0];

            if (!row) return null;

            // Parse JSON fields back to objects
            return {
                ...row,
                found_entities: JSON.parse(row.found_entities || '[]'),
                missing_entities: JSON.parse(row.missing_entities || '[]'),
                main_topics: JSON.parse(row.main_topics || '[]'),
                prompt_intent_details: JSON.parse(row.prompt_intent_details || '{}'),
                visibility_factors: JSON.parse(row.visibility_factors || '{}'),
                entity_relevance_details: JSON.parse(row.entity_relevance_details || '{}')
            };
        } catch (error) {
            console.error('❌ Error fetching Module C metrics:', error);
            return null;
        }
    }
};