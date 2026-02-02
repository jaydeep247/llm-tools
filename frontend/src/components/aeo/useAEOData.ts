import { useState, useEffect, useMemo } from 'react';
import { apiService } from '../../services/api/api';
import { AEOScore, AIPlatform, Competitor, StrategyMetric } from './types';

export const useAEOData = (result: any) => {
  // Add state for historical entity data fetching
  const [historicalEntityData, setHistoricalEntityData] = useState<any>(null);
  const [fetchingHistoricalData, setFetchingHistoricalData] = useState(false);

  // Fetch entity data for historical results that don't have entity_extraction
  useEffect(() => {
    const fetchHistoricalEntityData = async () => {
      // Only fetch if we have a result with URL but no entity_extraction
      if (!result || !result.url || result.entity_extraction || fetchingHistoricalData) return;
      
      try {
        setFetchingHistoricalData(true);
        
        
        const response = await fetch('/api/entity-extractor/analyze-url', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
          },
          body: JSON.stringify({
            url: result.url,
            expectedEntities: ['brand name', 'contact information', 'key features', 'product name', 'company name']
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            setHistoricalEntityData(data.data);
          }
        } 
      } catch (error) {
        console.error(error);
      } finally {
        setFetchingHistoricalData(false);
      }
    };

    fetchHistoricalEntityData();
  }, [result?.url, result?.entity_extraction]);


  const getAIPlatforms = (): AIPlatform[] => {
    if (!result || !result.detailed_analysis?.ai_presence) {
      return [
        { name: 'ChatGPT', icon: '🤖', score: 0, status: 'OFFLINE' },
        { name: 'Gemini', icon: '🧠', score: 0, status: 'OFFLINE' },
        { name: 'Claude', icon: '🎭', score: 0, status: 'OFFLINE' }
      ];
    }

    const aiData = result.detailed_analysis.ai_presence;
    const platforms: AIPlatform[] = [];

    const platformIcons: { [key: string]: string } = {
      'GPTBot': '🤖',
      'ChatGPT': '🤖',
      'chatgpt': '🤖',
      'OpenAI': '🤖',
      'Google-Extended': '🧠',
      'Gemini': '🧠',
      'gemini': '🧠',
      'ClaudeBot': '🎭',
      'Claude': '🎭',
      'claude': '🎭'
    };

    if (aiData.platforms && typeof aiData.platforms === 'object') {
      Object.entries(aiData.platforms).forEach(([name, data]: [string, any]) => {
        const displayName = name === 'GPTBot' ? 'ChatGPT' :
          name === 'Google-Extended' ? 'Gemini' :
            name === 'ClaudeBot' ? 'Claude' : name;

        platforms.push({
          name: displayName,
          icon: platformIcons[name] || platformIcons[displayName] || name.charAt(0).toUpperCase(),
          score: Math.round(data.score || 0),
          status: data.status || 'LIVE',
          details: {
            ...data.details,
            scoreType: data.details?.score_type || 'bot_accessibility'
          }
        });
      });
    }

    if (aiData.ai_understanding && typeof aiData.ai_understanding === 'object') {
      const multiAI = aiData.ai_understanding;

      if (multiAI.openai || multiAI.gemini || multiAI.claude) {
        const aiProviders = [
          { name: 'ChatGPT', key: 'openai', icon: '🤖' },
          { name: 'Gemini', key: 'gemini', icon: '🧠' },
          { name: 'Claude', key: 'claude', icon: '🎭' }
        ];

        aiProviders.forEach(provider => {
          const data = multiAI[provider.key];
          const platformKey = provider.name.toLowerCase();

          if (data && !data.error) {
            const existingIndex = platforms.findIndex(p =>
              p.name.toLowerCase() === platformKey
            );

            if (existingIndex === -1) {
              platforms.push({
                name: provider.name,
                icon: provider.icon,
                score: Math.round(data.score || 0),
                status: 'LIVE',
                details: {
                  understanding_level: data.understanding_level,
                  clarity_score: data.clarity_score,
                  key_topics: data.key_topics,
                  main_issues: data.main_issues,
                  recommendations: data.recommendations,
                  scoreType: 'ai_understanding',
                  ai_understanding_available: true,
                  ai_understanding_score: Math.round(data.score || 0)
                }
              });
            }
          }
        });
      }
    }

    if (platforms.length === 0) {
      return [
        { name: 'ChatGPT', icon: '🤖', score: 0, status: 'OFFLINE' },
        { name: 'Gemini', icon: '🧠', score: 0, status: 'OFFLINE' },
        { name: 'Claude', icon: '🎭', score: 0, status: 'OFFLINE' }
      ];
    }

    return platforms;
  };

  const getCompetitors = (): Competitor[] => {
    if (!result || !result.detailed_analysis?.competitor_analysis) {
      return [{ name: 'No Data', count: 0 }];
    }

    const compData = result.detailed_analysis.competitor_analysis;

    if (compData.error) {
      return [{ name: 'Not Configured', count: 0 }];
    }

    if (compData.top_competitors && Array.isArray(compData.top_competitors)) {
      return compData.top_competitors.map((comp: any) => {
        const domain = comp.domain || 'Unknown';
        const count = comp.referring_domains || 0;
        return { name: domain, count };
      });
    }

    return [{ name: 'No Competitors Found', count: 0 }];
  };

  const getStrategyMetrics = (): StrategyMetric[] => {
    if (!result || !result.module_scores) {
      return [
        { name: 'Answerability', score: 0, status: 'LIVE', color: 'green' },
        { name: 'Knowledge Base', score: 0, status: 'LIVE', color: 'red' },
        { name: 'Structured Data', score: 0, status: 'LIVE', color: 'orange' },
        { name: 'AI Crawler Accessibility', score: 0, status: 'LIVE', color: 'green' }
      ];
    }

    const getColorForScore = (score: number): 'green' | 'orange' | 'red' => {
      if (score >= 70) return 'green';
      if (score >= 40) return 'orange';
      return 'red';
    };

    const metrics: StrategyMetric[] = [];

    if (result.module_scores.answerability !== undefined) {
      const score = Math.round(result.module_scores.answerability);
      metrics.push({
        name: 'Answerability',
        score: score,
        status: 'LIVE',
        color: getColorForScore(score)
      });
    }

    if (result.module_scores.knowledge_base !== undefined) {
      const score = Math.round(result.module_scores.knowledge_base);
      metrics.push({
        name: 'Knowledge Base',
        score: score,
        status: 'LIVE',
        color: getColorForScore(score)
      });
    }

    if (result.module_scores.structured_data !== undefined) {
      const score = Math.round(result.module_scores.structured_data);
      metrics.push({
        name: 'Structured Data',
        score: score,
        status: 'LIVE',
        color: getColorForScore(score)
      });
    }

    if (result.module_scores.crawler_accessibility !== undefined) {
      const score = Math.round(result.module_scores.crawler_accessibility);
      metrics.push({
        name: 'AI Crawler Accessibility',
        score: score,
        status: 'LIVE',
        color: getColorForScore(score)
      });
    }

    return metrics;
  };

  const getScores = (): AEOScore => {
    return result ? {
      overall: Math.round(result.overall_score || 0),
      ai_presence: Math.round(result.module_scores?.ai_presence || result.detailed_analysis?.ai_presence?.score || 0),
      competitor_landscape: Math.round(result.module_scores?.competitor_analysis || result.detailed_analysis?.competitor_analysis?.score || 0),
      strategy_review: Math.round(
        (
          (result.module_scores?.answerability || 0) +
          (result.module_scores?.knowledge_base || 0) +
          (result.module_scores?.structured_data || 0) +
          (result.module_scores?.crawler_accessibility || 0)
        ) / 4
      ),
      structured_data: Math.round(result.module_scores?.structured_data || result.detailed_analysis?.structured_data?.score || 0)
    } : {
      overall: 0,
      ai_presence: 0,
      competitor_landscape: 0,
      strategy_review: 0,
      structured_data: 0
    };
  };

  const getModuleRecommendations = (moduleName: string): string[] => {
    if (!result?.detailed_analysis) return [];
    const module = result.detailed_analysis[moduleName];
    return module?.recommendations || [];
  };

  const getContentMetrics = () => {
    if (!result?.detailed_analysis?.content_metrics) {
      return {
        content_type_accuracy: 0,
        prompt_intent_match: 0,
        visibility_impact: 0,
        suggested_content_type: 'Unknown',
        prompt_intent_details: {
          matched_intents: [],
          confidence: 0,
          search_queries: [],
          intent_clusters: {
            informational: { prompt_count: 0, example_prompts: [] },
            commercial: { prompt_count: 0, example_prompts: [] },
            comparative: { prompt_count: 0, example_prompts: [] },
            transactional: { prompt_count: 0, example_prompts: [] },
            agent_style: { prompt_count: 0, example_prompts: [] }
          },
          cluster_metrics: {
            total_prompts: 0,
            categorized_prompts: 0,
            coverage_percentage: 0,
            clustering_accuracy: 0
          }
        },
        visibility_factors: {
          factors: [],
          score_breakdown: {},
          recommendations: []
        }
      };
    }

    const metrics = result.detailed_analysis.content_metrics;
    
    // Parse JSON strings if they exist
    let promptIntentDetails = metrics.prompt_intent_details;
    if (typeof promptIntentDetails === 'string') {
      try {
        promptIntentDetails = JSON.parse(promptIntentDetails);
      } catch (e) {
        promptIntentDetails = { 
          matched_intents: [], 
          confidence: 0, 
          search_queries: [],
          intent_clusters: {
            informational: { prompt_count: 0, example_prompts: [] },
            commercial: { prompt_count: 0, example_prompts: [] },
            comparative: { prompt_count: 0, example_prompts: [] },
            transactional: { prompt_count: 0, example_prompts: [] },
            agent_style: { prompt_count: 0, example_prompts: [] }
          },
          cluster_metrics: {
            total_prompts: 0,
            categorized_prompts: 0,
            coverage_percentage: 0,
            clustering_accuracy: 0
          }
        };
      }
    }

    let visibilityFactors = metrics.visibility_factors;
    if (typeof visibilityFactors === 'string') {
      try {
        visibilityFactors = JSON.parse(visibilityFactors);
      } catch (e) {
        visibilityFactors = { factors: [], score_breakdown: {}, recommendations: [] };
      }
    }

    return {
      content_type_accuracy: Math.round(metrics.content_type_accuracy || 0),
      prompt_intent_match: Math.round(metrics.prompt_intent_match || 0),
      visibility_impact: Math.round(metrics.visibility_impact || 0),
      suggested_content_type: metrics.suggested_content_type || 'Unknown',
      prompt_intent_details: promptIntentDetails || {
        matched_intents: [],
        confidence: 0,
        search_queries: [],
        intent_clusters: {
          informational: { prompt_count: 0, example_prompts: [] },
          commercial: { prompt_count: 0, example_prompts: [] },
          comparative: { prompt_count: 0, example_prompts: [] },
          transactional: { prompt_count: 0, example_prompts: [] },
          agent_style: { prompt_count: 0, example_prompts: [] }
        },
        cluster_metrics: {
          total_prompts: 0,
          categorized_prompts: 0,
          coverage_percentage: 0,
          clustering_accuracy: 0
        }
      },
      visibility_factors: visibilityFactors || {
        factors: [],
        score_breakdown: {},
        recommendations: []
      }
    };
  };

  const getEntityMetrics = () => {
    // Get from metrics block first (new format)
    const metrics = result?.metrics;
    const entityRelevance = result?.detailed_analysis?.entity_relevance;
    
    if (metrics) {
      let entityRelevanceDetails = entityRelevance || {};
      if (typeof entityRelevanceDetails === 'string') {
        try {
          entityRelevanceDetails = JSON.parse(entityRelevanceDetails);
        } catch (e) {
          entityRelevanceDetails = {};
        }
      }
      
      return {
        entities_detected_count: metrics.entities_detected_count || 0,
        entity_coverage_score: metrics.entity_coverage_score || 0,
        entity_relevance_score: metrics.entity_relevance_score || 0,
        entity_relevance_details: entityRelevanceDetails
      };
    }
    
    // Fallback: calculate from entity_coverage if available
    const kbData = result?.detailed_analysis?.knowledge_base;
    const ecData = kbData?.entity_coverage;
    
    if (ecData) {
      const foundCount = ecData.found_entities?.length || 0;
      const totalExpected = (ecData.found_entities?.length || 0) + (ecData.missing_entities?.length || 0);
      const coverageScore = totalExpected > 0 ? Math.round((foundCount / totalExpected) * 100) : 0;
      
      return {
        entities_detected_count: foundCount,
        entity_coverage_score: coverageScore,
        entity_relevance_score: entityRelevance?.entity_relevance_score || 0,
        entity_relevance_details: entityRelevance || {}
      };
    }
    
    return {
      entities_detected_count: 0,
      entity_coverage_score: 0,
      entity_relevance_score: 0,
      entity_relevance_details: {}
    };
  };

  const getAnswerCompletenessData = () => {
    // Check if backend provides answer_completeness data
    if (result?.detailed_analysis?.answer_completeness) {
      const completeness = result.detailed_analysis.answer_completeness;
      return {
        overall_score: Math.round(completeness.overall_score || 0),
        completeness_percentage: Math.round(completeness.completeness_percentage || 0),
        key_aspects_covered: completeness.key_aspects_covered || [],
        missing_aspects: completeness.missing_aspects || [],
        depth_score: Math.round(completeness.depth_score || 0),
        breadth_score: Math.round(completeness.breadth_score || 0),
        relevance_score: Math.round(completeness.relevance_score || 0),
        recommendations: completeness.recommendations || []
      };
    }

    // Calculate derived metrics from existing data
    if (result?.detailed_analysis) {
      const analysis = result.detailed_analysis;
      
      // Calculate completeness from entity extraction data (new approach)
      let foundEntities = [];
      let missingEntities = [];
      let completenessPercentage = 0;
      
      // Try to use entity extraction data first
      if (result.entity_extraction) {
        const entityData = result.entity_extraction;
        foundEntities = entityData.extractedEntities || [];
        missingEntities = entityData.missingExpectedEntities || [];
        
        const totalExpected = foundEntities.length + missingEntities.length;
        if (totalExpected > 0) {
          completenessPercentage = Math.round((foundEntities.length / totalExpected) * 100);
        } else if (foundEntities.length > 0) {
          // If we have entities but no expected entities defined, base it on detection count
          completenessPercentage = Math.min(Math.round(foundEntities.length * 10), 100); // 10% per entity, max 100%
        }
      } else {
        // Fallback to knowledge base entity coverage if available
        const kbData = analysis.knowledge_base;
        
        // Try entity_coverage structure first
        const ecData = kbData?.entity_coverage;
        
        if (ecData && (ecData.found_entities?.length > 0 || ecData.missing_entities?.length > 0)) {
          // Use entity_coverage if it has data
          foundEntities = ecData.found_entities || [];
          missingEntities = ecData.missing_entities || [];
        } else if (kbData?.entities && kbData?.entities_count > 0) {
          // Use direct entities from knowledge base
          const entitiesObj = kbData.entities;
          foundEntities = [];
          
          // Extract entity names from different possible structures
          if (typeof entitiesObj === 'object') {
            // Try different possible structures
            if (Array.isArray(entitiesObj)) {
              foundEntities = entitiesObj.map(e => typeof e === 'string' ? e : e.name || e.text || 'Entity');
            } else {
              // If it's an object, try to extract values or keys
              const entityKeys = Object.keys(entitiesObj);
              const entityValues = Object.values(entitiesObj);
              
              // Use keys as entity names if they look like meaningful names
              if (entityKeys.length > 0 && entityKeys.some(key => isNaN(parseInt(key)) && key.length > 2)) {
                foundEntities = entityKeys.filter(key => key && key.length > 1);
              } else if (entityValues.length > 0) {
                // Try to extract from values
                foundEntities = entityValues.map((value: any) => {
                  if (typeof value === 'string' && value.length > 1) return value;
                  if (typeof value === 'object' && value?.name) return value.name;
                  if (typeof value === 'object' && value?.text) return value.text;
                  return null;
                }).filter(Boolean);
              }
              
              // If still no meaningful entities, create generic ones based on available data
              if (foundEntities.length === 0) {
                foundEntities = entityKeys.slice(0, Math.min(kbData.entities_count, 10))
                  .map(key => `Entity: ${key}`)
                  .filter(name => name !== 'Entity: ');
              }
            }
          }
          
          // Final fallback: create generic entities based on count
          if (foundEntities.length === 0 && kbData.entities_count > 0) {
            for (let i = 0; i < Math.min(kbData.entities_count, 10); i++) {
              foundEntities.push(`Detected Entity ${i + 1}`);
            }
          }
          
          missingEntities = []; // No missing entities data in this structure
        }
        
        const totalEntities = foundEntities.length + missingEntities.length;
        completenessPercentage = totalEntities > 0 
          ? Math.round((foundEntities.length / totalEntities) * 100) 
          : (foundEntities.length > 0 ? Math.min(foundEntities.length * 15, 100) : 0);
      }
      
      // Calculate depth score from answerability module
      const answerabilityScore = result.module_scores?.answerability || 0;
      
      // Calculate breadth score from structured data coverage
      const structuredDataScore = result.module_scores?.structured_data || 0;
      
      // Calculate relevance from content metrics if available
      const contentMetrics = analysis.content_metrics;
      const relevanceScore = contentMetrics?.prompt_intent_match || answerabilityScore;
      
      // Calculate overall score with improved logic
      let overallScore;
      if (completenessPercentage >= 80) {
        // If completeness is high, give it more weight and provide reasonable fallbacks
        const effectiveAnswerability = answerabilityScore || Math.min(completenessPercentage - 20, 60);
        const effectiveStructuredData = structuredDataScore || Math.min(completenessPercentage - 30, 50);
        const effectiveRelevance = relevanceScore || effectiveAnswerability;
        
        overallScore = Math.round(
          (completenessPercentage * 0.4 + effectiveAnswerability * 0.3 + effectiveStructuredData * 0.2 + effectiveRelevance * 0.1)
        );
      } else {
        // For lower completeness, use standard averaging but with minimum thresholds
        const effectiveAnswerability = Math.max(answerabilityScore, completenessPercentage * 0.6);
        const effectiveStructuredData = Math.max(structuredDataScore, completenessPercentage * 0.5);
        const effectiveRelevance = Math.max(relevanceScore, effectiveAnswerability);
        
        overallScore = Math.round(
          (completenessPercentage + effectiveAnswerability + effectiveStructuredData + effectiveRelevance) / 4
        );
      }
      
      // Generate recommendations based on missing aspects
      const recommendations = [];
      if (completenessPercentage < 80) {
        recommendations.push('Add missing key entities to improve content completeness');
      }
      if (answerabilityScore < 70) {
        recommendations.push('Improve content structure to better answer user queries');
      }
      if (structuredDataScore < 70) {
        recommendations.push('Add structured data markup to enhance search visibility');
      }
      
      return {
        overall_score: overallScore,
        completeness_percentage: completenessPercentage,
        key_aspects_covered: foundEntities.map((e: any) => 
          typeof e === 'string' ? e : e.text || e.name || 'Entity'
         ),
        missing_aspects: missingEntities.map((e: any) => 
          typeof e === 'string' ? e : e.text || e.name || 'Entity'
        ),
        depth_score: Math.round(answerabilityScore),
        breadth_score: Math.round(structuredDataScore),
        relevance_score: Math.round(relevanceScore),
        recommendations
      };
    }

      // Fallback to zeros
      return {
        overall_score: 0,
        completeness_percentage: 0,
        key_aspects_covered: [],
        missing_aspects: [],
        depth_score: 0,
        breadth_score: 0,
        relevance_score: 0,
        recommendations: []
      };
    };
  const getEntityData = useMemo(() => {
    // Check if we have entity extraction data from the AEO result (integrated)
    if (result && result.entity_extraction) {
      const entityExtraction = result.entity_extraction;
      
      return {
        totalEntitiesDetected: entityExtraction.totalEntitiesDetected || 0,
        entityTypes: entityExtraction.entityTypes || {
          Person: 0,
          Product: 0,
          Location: 0,
          Concept: 0
        },
        missingExpectedEntities: entityExtraction.missingExpectedEntities || [],
        extractedEntities: entityExtraction.extractedEntities || [],
        overallScore: entityExtraction.overallScore || 0
      };
    }

    // Check if we have historical entity data fetched separately
    if (historicalEntityData) {
      return historicalEntityData;
    }

    // Show loading state while fetching historical data
    if (fetchingHistoricalData) {
      return null; // This will show loading state
    }
  }, [result?.entity_extraction, result?.url, historicalEntityData, fetchingHistoricalData]); // Include historical data in dependencies

  return {
    scores: getScores(),
    aiPlatforms: getAIPlatforms(),
    competitors: getCompetitors(),
    strategyMetrics: getStrategyMetrics(),
    getModuleRecommendations,
    contentMetrics: getContentMetrics(),
    entityMetrics: getEntityMetrics(),
    answerCompletenessData: getAnswerCompletenessData(),
    entityData: getEntityData
  };
};