import { useState, useEffect } from 'react';
import { apiService } from '../../services/api/api';
import { AEOScore, AIPlatform, Competitor, StrategyMetric } from './types';

export const useAEOData = (result: any) => {
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

  return {
    scores: getScores(),
    aiPlatforms: getAIPlatforms(),
    competitors: getCompetitors(),
    strategyMetrics: getStrategyMetrics(),
    getModuleRecommendations
  };
};