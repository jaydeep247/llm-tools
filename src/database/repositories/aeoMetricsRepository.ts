import { query } from '../dbConnection.js';

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
                llm_friendliness_score, readability_score, fact_density
            ) VALUES (
                $1, $2,
                $3, $4, $5,
                $6, $7, $8,
                $9, $10,
                $11, $12, $13
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
            data.fact_density
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
                main_topics: JSON.parse(row.main_topics || '[]')
            };
        } catch (error) {
            console.error('❌ Error fetching Module C metrics:', error);
            return null;
        }
    }
};