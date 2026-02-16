/**
 * Actionable Insights Service
 * Analyzes content and provides specific improvement recommendations for LLM performance
 */

import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';

// Types
export interface ImprovementAction {
  id: string;
  type: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  impact: number;
//   effort: 'Easy' | 'Moderate' | 'Complex';
  category: string;
}

export interface ActionableInsightsData {
  totalActions: number;
  priorityBreakdown: {
    high: number;
    medium: number;
    low: number;
  };
  currentScore: number;
  predictedScore: number;
  improvement: number;
  actions: ImprovementAction[];
}

export interface AnalyzePageActionsRequest {
  url?: string;
  content?: string;
  sessionId?: number;
}

export interface ActionableInsightsStats {
  totalAnalyses: number;
  averageScore: number;
  commonActions: string[];
  averageImprovement: number;
}

class ActionableInsightsService {
  /**
   * Analyze page content and generate actionable improvement recommendations
   */
  async analyzePageActions(
    url?: string,
    content?: string,
    sessionId?: number
  ): Promise<ActionableInsightsData> {
    try {
      console.log('Analyzing page for actionable insights:', { 
        hasUrl: !!url, 
        contentLength: content?.length || 0,
        sessionId 
      });

      // If URL is provided but no content, fetch content
      let analysisContent = content;
      if (url && !content) {
        try {
          console.log('🌐 FETCHING CONTENT FROM URL:', url);
          
          // Normalize URL - add protocol if missing
          let normalizedUrl = url;
          if (!url.startsWith('http://') && !url.startsWith('https://')) {
            normalizedUrl = `https://${url}`;
          }
          
          console.log('🔧 NORMALIZED URL:', normalizedUrl);
          
          // Import fetch URL service
          const { llmAnswerSimulatorService } = await import('./LLMAnswerSimulatorService.js');
          const urlContentResult = await llmAnswerSimulatorService.fetchUrlContent(normalizedUrl);
          
          console.log('📡 URL FETCH RESULT:', {
            success: urlContentResult.success,
            contentLength: urlContentResult.content?.length || 0,
            hasContent: !!urlContentResult.content
          });
          
          if (urlContentResult.success && urlContentResult.content) {
            analysisContent = urlContentResult.content;
            console.log('✅ Successfully fetched content:', {
              length: analysisContent.length,
              preview: analysisContent.substring(0, 200).replace(/\s+/g, ' ')
            });
          } else {
            console.warn('⚠️ Failed to fetch URL content:', urlContentResult.error || 'Unknown error');
            throw new Error(`Could not fetch content from URL: ${normalizedUrl}`);
          }
        } catch (error) {
          console.error('❌ Error fetching URL content:', error);
          throw new Error(`Failed to analyze URL: ${url}. ${error instanceof Error ? error.message : 'Content fetch failed'}`);
        }
      }

      if (!analysisContent) {
        throw new Error('No content provided for analysis');
      }

      console.log('🚀 STARTING REAL CONTENT ANALYSIS:', {
        source: url ? 'URL' : 'Direct Content',
        contentLength: analysisContent.length,
        contentType: analysisContent.includes('<html') || analysisContent.includes('<HTML') ? 'HTML' : 'Text',
        hasHeadings: analysisContent.includes('<h1') || analysisContent.includes('<h2'),
        hasLists: analysisContent.includes('<ul') || analysisContent.includes('<ol')
      });

      // Generate improvement actions based on content analysis
      const actions = await this.generateImprovementActions(analysisContent);
      
      // Calculate scores and metrics
      const currentScore = this.calculateCurrentScore(analysisContent, actions);
      const predictedScore = this.calculatePredictedScore(currentScore, actions);
      const improvement = predictedScore - currentScore;

      // Count actions by priority
      const priorityBreakdown = {
        high: actions.filter(a => a.priority === 'High').length,
        medium: actions.filter(a => a.priority === 'Medium').length,
        low: actions.filter(a => a.priority === 'Low').length,
      };

      const result: ActionableInsightsData = {
        totalActions: actions.length,
        priorityBreakdown,
        currentScore,
        predictedScore,
        improvement,
        actions,
      };

      // Store analysis results if sessionId is provided
      if (sessionId) {
        await this.storeAnalysisResults(sessionId, url, result);
      }

      console.log('Actionable insights analysis completed:', {
        totalActions: result.totalActions,
        improvement: result.improvement,
        priorityBreakdown: result.priorityBreakdown
      });

      return result;
    } catch (error) {
      console.error('Error in analyzePageActions:', error);
      throw new Error('Failed to analyze page for actionable insights');
    }
  }

  /**
   * Generate improvement actions based on real content analysis
   */
  private async generateImprovementActions(content: string): Promise<ImprovementAction[]> {
    const actions: ImprovementAction[] = [];

    console.log('🔍 ANALYZING REAL CONTENT:', {
      contentLength: content.length,
      contentType: content.includes('<html') ? 'HTML' : 'Text',
      preview: content.substring(0, 300).replace(/\s+/g, ' ')
    });

    // Parse HTML content using cheerio for real analysis
    const $: CheerioAPI = cheerio.load(content);
    const textContent = $.text().toLowerCase();

    // 1. REAL CHECK FOR DIRECT ANSWERS
    const hasDirectAnswers = this.analyzeDirectAnswers($, textContent);
    console.log('✅ Real Direct Answers Analysis:', hasDirectAnswers);
    if (!hasDirectAnswers.found) {
      actions.push({
        id: 'direct-answers',
        type: 'Add Direct Answer Sections',
        description: `Missing direct answers for ${hasDirectAnswers.missingPatterns.join(', ')}. Create clear answer blocks at the top of sections.`,
        priority: 'High',
        impact: hasDirectAnswers.criticalMissing ? 10 : 6,
        category: 'Content Structure'
      });
    }

    // 2. REAL CHECK FOR FAQ SECTION
    const faqAnalysis = this.analyzeFAQSection($, textContent);
    console.log('❓ Real FAQ Section Analysis:', faqAnalysis);
    if (!faqAnalysis.found) {
      actions.push({
        id: 'add-faq',
        type: 'Add FAQ Section',
        description: `No FAQ section detected. Add Q&A format for ${faqAnalysis.suggestedQuestions.join(', ')} to improve LLM understanding.`,
        priority: 'High',
        impact: faqAnalysis.questionPatterns > 3 ? 8 : 5,
        category: 'Content Structure'
      });
    }

    // 3. REAL HEADING STRUCTURE ANALYSIS
    const headingAnalysis = this.analyzeHeadingStructure($);
    console.log('📝 Real Heading Structure Analysis:', headingAnalysis);
    if (!headingAnalysis.isGood) {
      actions.push({
        id: 'improve-headings',
        type: 'Fix Heading Hierarchy',
        description: `${headingAnalysis.issues.join('. ')}. Current: H1(${headingAnalysis.counts.h1}), H2(${headingAnalysis.counts.h2}), H3(${headingAnalysis.counts.h3}).`,
        priority: headingAnalysis.severity === 'critical' ? 'High' : 'Medium',
        impact: headingAnalysis.severity === 'critical' ? 8 : 4,
        category: 'Content Structure'
      });
    }

    // 4. CHECK FOR ENTITY MENTIONS
    const hasEntities = this.hasEntityMentions(content);
    console.log('🏢 Entity Mentions Check:', hasEntities);
    if (!hasEntities) {
      actions.push({
        id: 'add-entities',
        type: 'Add Entity Mentions',
        description: 'Include clear mentions of brands, products, locations, and key entities',
        priority: 'High',
        impact: 5,
      //  effort: 'Easy',
        category: 'Content Optimization'
      });
    }

    // 5. CHECK PARAGRAPH LENGTH
    const hasLongParagraphs = this.hasLongParagraphs(content);
    console.log('📄 Long Paragraphs Check:', hasLongParagraphs);
    if (hasLongParagraphs) {
      actions.push({
        id: 'break-paragraphs',
        type: 'Break Up Long Paragraphs',
        description: 'Divide lengthy paragraphs into scannable chunks for better LLM comprehension',
        priority: 'Medium',
        impact: 3,
      //  effort: 'Easy',
        category: 'Readability'
      });
    }

    // 6. REAL STRUCTURED DATA ANALYSIS
    const structureAnalysis = this.analyzeStructuredData($);
    console.log('📊 Real Structured Data Analysis:', structureAnalysis);
    if (!structureAnalysis.sufficient) {
      actions.push({
        id: 'add-structured-data',
        type: 'Add Structured Lists/Tables',
        description: `${structureAnalysis.missing.join(', ')}. Current: ${structureAnalysis.counts.lists} lists, ${structureAnalysis.counts.tables} tables. Add ${structureAnalysis.recommendations.join(', ')}.`,
        priority: structureAnalysis.counts.total === 0 ? 'High' : 'Medium',
        impact: structureAnalysis.counts.total === 0 ? 7 : 4,
        category: 'Content Structure'
      });
    }

    // 7. CHECK FOR DEFINITIONS
    const hasDefinitions = this.hasDefinitions(textContent);
    console.log('📖 Definitions Check:', hasDefinitions);
    if (!hasDefinitions) {
      actions.push({
        id: 'add-definitions',
        type: 'Add Clear Definitions',
        description: 'Include clear definitions of key terms and concepts',
        priority: 'High',
        impact: 7,
      //  effort: 'Easy',
        category: 'Content Clarity'
      });
    }

    // 8. REAL EXAMPLES ANALYSIS
    const examplesAnalysis = this.analyzeExamples(textContent);
    console.log('🔍 Real Examples Analysis:', examplesAnalysis);
    if (!examplesAnalysis.sufficient) {
      actions.push({
        id: 'add-examples',
        type: 'Include Concrete Examples',
        description: `${examplesAnalysis.issues.join('. ')}. Found: ${examplesAnalysis.types.join(', ') || 'none'}. Add: ${examplesAnalysis.suggestions.join(', ')}.`,
        priority: examplesAnalysis.abstractContent ? 'High' : 'Medium',
        impact: examplesAnalysis.abstractContent ? 7 : 4,
        category: 'Content Clarity'
      });
    }

    // 9. REAL CONTACT ANALYSIS
    const contactAnalysis = this.analyzeContactInfo($);
    console.log('📞 Real Contact Analysis:', contactAnalysis);
    if (!contactAnalysis.sufficient) {
      actions.push({
        id: 'add-contact',
        type: 'Add Contact Information',
        description: `${contactAnalysis.missing.join(', ')}. Found: ${contactAnalysis.found.join(', ') || 'none'}. Essential for business/location queries.`,
        priority: contactAnalysis.businessContent ? 'Medium' : 'Low',
        impact: contactAnalysis.businessContent ? 4 : 2,
        category: 'Business Information'
      });
    }

    // 10. REAL CONTENT DEPTH ANALYSIS
    const depthAnalysis = this.analyzeContentDepth($);
    console.log('📏 Real Content Depth Analysis:', depthAnalysis);
    if (depthAnalysis.needsExpansion) {
      actions.push({
        id: 'expand-content',
        type: 'Expand Content Depth',
        description: `Content too shallow: ${depthAnalysis.wordCount} words, ${depthAnalysis.paragraphCount} paragraphs. ${depthAnalysis.suggestions.join('. ')}.`,
        priority: depthAnalysis.wordCount < 100 ? 'High' : 'Medium',
        impact: depthAnalysis.wordCount < 100 ? 8 : 5,
        category: 'Content Depth'
      });
    }

    console.log('🎯 ANALYSIS COMPLETE:', {
      totalActions: actions.length,
      actionIds: actions.map(a => a.id),
      priorities: {
        high: actions.filter(a => a.priority === 'High').length,
        medium: actions.filter(a => a.priority === 'Medium').length,
        low: actions.filter(a => a.priority === 'Low').length
      }
    });

    return actions;
  }

  /**
   * REAL CONTENT ANALYSIS METHODS
   */
  private analyzeDirectAnswers($: CheerioAPI, textContent: string): { found: boolean; missingPatterns: string[]; criticalMissing: boolean } {
    // Analyze actual content for direct answer patterns
    const questionWords = ['what', 'how', 'why', 'when', 'where', 'which', 'who'];
    const answerPatterns = [
      /\b(is|means|refers to|defined as)\b/gi,
      /:.*?[A-Z][a-z]{10,}/g,
      /answer:?\s*[A-Z]/gi,
      /explanation:?\s*[A-Z]/gi
    ];
    
    let questionCount = 0;
    let answerCount = 0;
    const foundQuestions: string[] = [];
    const missingPatterns: string[] = [];
    
    // Count actual questions
    questionWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\s+[a-z\\s]{3,50}[\\?\\.]`, 'gi');
      const matches = textContent.match(regex) || [];
      questionCount += matches.length;
      if (matches.length > 0) {
        foundQuestions.push(word);
      } else {
        missingPatterns.push(`${word}-questions`);
      }
    });
    
    // Count actual answers
    answerPatterns.forEach(pattern => {
      const matches = textContent.match(pattern) || [];
      answerCount += matches.length;
    });
    
    // Check for structured Q&A
    const qaSections = $('*').filter((_: number, el: any) => {
      const text = $(el).text().toLowerCase();
      return /^(q:|question:|a:|answer:)/i.test(text.trim());
    }).length;
    
    const hasGoodStructure = qaSections >= 2 || (questionCount >= 2 && answerCount >= 2);
    const criticalMissing = questionCount === 0 && answerCount === 0;
    
    console.log('📋 Real Direct Answer Analysis:', { 
      questionCount, 
      answerCount, 
      qaSections, 
      hasGoodStructure,
      foundQuestions,
      missingPatterns
    });
    
    return {
      found: hasGoodStructure,
      missingPatterns,
      criticalMissing
    };
  }

  private analyzeFAQSection($: CheerioAPI, textContent: string): { found: boolean; questionPatterns: number; suggestedQuestions: string[] } {
    // Look for explicit FAQ sections
    const faqHeadings = $('h1, h2, h3, h4').filter((_: number, el: any) => {
      const text = $(el).text().toLowerCase();
      return /faq|frequently asked|common questions|questions and answers/i.test(text);
    });
    
    // Count question-like patterns that could be FAQ
    const questionPatterns = [
      /how (do|does|can|to)/gi,
      /what (is|are|does)/gi,
      /why (do|does|is|are)/gi,
      /when (do|does|should)/gi,
      /where (can|do|is)/gi,
      /which (one|type)/gi
    ];
    
    let totalQuestionPatterns = 0;
    const suggestedQuestions: string[] = [];
    
    questionPatterns.forEach((pattern, index) => {
      const matches = textContent.match(pattern) || [];
      totalQuestionPatterns += matches.length;
      
      if (matches.length === 0) {
        const suggestions = ['How to get started', 'What is the main benefit', 'Why choose this', 'When to use', 'Where to find more info', 'Which option is best'];
        suggestedQuestions.push(suggestions[index]);
      }
    });
    
    // Check for structured Q&A content
    const qElements = $('*').filter((_: number, el: any) => {
      const text = $(el).text();
      return /^Q\d*[.:]|^Question\d*[.:]?/i.test(text.trim());
    }).length;
    
    const aElements = $('*').filter((_: number, el: any) => {
      const text = $(el).text();
      return /^A\d*[.:]|^Answer\d*[.:]?/i.test(text.trim());
    }).length;
    
    const hasExplicitFAQ = faqHeadings.length > 0;
    const hasQuestionStructure = qElements >= 2 && aElements >= 2;
    const hasImplicitFAQ = totalQuestionPatterns >= 5;
    
    console.log('❓ Real FAQ Analysis:', { 
      hasExplicitFAQ, 
      hasQuestionStructure, 
      hasImplicitFAQ,
      totalQuestionPatterns,
      qElements,
      aElements,
      suggestedQuestions
    });
    
    return {
      found: hasExplicitFAQ || hasQuestionStructure || hasImplicitFAQ,
      questionPatterns: totalQuestionPatterns,
      suggestedQuestions: suggestedQuestions.slice(0, 3) // Top 3 suggestions
    };
  }

  private analyzeHeadingStructure($: CheerioAPI): { isGood: boolean; issues: string[]; severity: string; counts: any } {
    const h1Elements = $('h1');
    const h2Elements = $('h2');
    const h3Elements = $('h3');
    const h4Elements = $('h4');
    const h5Elements = $('h5');
    const h6Elements = $('h6');
    
    const counts = {
      h1: h1Elements.length,
      h2: h2Elements.length,
      h3: h3Elements.length,
      h4: h4Elements.length,
      h5: h5Elements.length,
      h6: h6Elements.length
    };
    
    const issues: string[] = [];
    let severity = 'minor';
    
    // Critical issues
    if (counts.h1 === 0) {
      issues.push('Missing main H1 heading');
      severity = 'critical';
    } else if (counts.h1 > 1) {
      issues.push(`Too many H1 headings (${counts.h1})`);
      severity = 'major';
    }
    
    if (counts.h2 === 0 && (counts.h3 > 0 || counts.h4 > 0)) {
      issues.push('Skipped H2 level - jumping from H1 to H3+');
      severity = severity === 'critical' ? 'critical' : 'major';
    }
    
    if (counts.h2 < 2 && (counts.h1 + counts.h2 + counts.h3) > 0) {
      issues.push('Need more H2 sections for better content organization');
      if (severity === 'minor') severity = 'major';
    }
    
    // Check for heading hierarchy skipping
    if (counts.h4 > 0 && counts.h3 === 0) {
      issues.push('Skipped H3 level');
    }
    
    // Check for excessive deep nesting
    if (counts.h5 + counts.h6 > counts.h1 + counts.h2 + counts.h3) {
      issues.push('Too many deep heading levels - simplify structure');
    }
    
    const totalHeadings = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const isGood = issues.length === 0 && counts.h1 === 1 && counts.h2 >= 2 && totalHeadings >= 3;
    
    console.log('📝 Real Heading Structure Analysis:', { 
      counts,
      issues,
      severity,
      isGood,
      totalHeadings
    });
    
    return { isGood, issues, severity, counts };
  }

  private hasEntityMentions(content: string): boolean {
    const patterns = [
      /\b[A-Z][a-z]+\s+(?:Inc|LLC|Corp|Company|Ltd|Limited|Co)\b/g,
      /\b[A-Z][a-z]+\s+(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd)\b/g,
      /\$[\d,]+(?:\.\d{2})?/g,
      /@[a-zA-Z0-9_]+/g,
      /\b[A-Z]{2,}\b/g,
      /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      /\b(?:CEO|CTO|CFO|VP|President|Manager|Director)\b/gi
    ];
    
    let entityCount = 0;
    patterns.forEach(pattern => {
      const matches = content.match(pattern) || [];
      entityCount += matches.length;
    });
    
    const hasEntities = entityCount >= 3;
    console.log('🏢 Entity Analysis:', { entityCount, hasEntities });
    return hasEntities;
  }

  private analyzeStructuredData($: CheerioAPI): { sufficient: boolean; missing: string[]; counts: any; recommendations: string[] } {
    const lists = $('ul, ol');
    const tables = $('table');
    const definitionLists = $('dl');
    const listItems = $('li');
    const tableRows = $('tr');
    const blockquotes = $('blockquote');
    
    const counts = {
      lists: lists.length,
      tables: tables.length,
      definitionLists: definitionLists.length,
      listItems: listItems.length,
      tableRows: tableRows.length,
      blockquotes: blockquotes.length,
      total: lists.length + tables.length + definitionLists.length
    };
    
    const missing: string[] = [];
    const recommendations: string[] = [];
    
    // Analyze what's missing
    if (counts.lists === 0) {
      missing.push('bullet/numbered lists');
      recommendations.push('add bullet lists for key points');
    }
    
    if (counts.tables === 0 && listItems.length > 6) {
      missing.push('comparison tables');
      recommendations.push('convert lists to comparison tables');
    }
    
    if (counts.definitionLists === 0) {
      missing.push('definition lists');
      recommendations.push('add definition lists for terms');
    }
    
    if (counts.blockquotes === 0) {
      missing.push('highlighted quotes/callouts');
    }
    
    // Check list quality
    let hasShortLists = false;
    lists.each((_: number, list: any) => {
      const items = $(list).find('li');
      if (items.length < 2) {
        hasShortLists = true;
      }
    });
    
    if (hasShortLists) {
      recommendations.push('expand lists with more items');
    }
    
    // Check for text that could be structured
    const bodyText = $('body').text();
    const hasNumberedSteps = /\b(step|phase|stage)\s*(\d+|one|two|three)/gi.test(bodyText);
    const hasComparisons = /\b(vs|versus|compared to|better than)\b/gi.test(bodyText);
    const hasFeatures = /\b(feature|benefit|advantage|includes?)\b/gi.test(bodyText);
    
    if (hasNumberedSteps && counts.lists === 0) {
      recommendations.push('convert steps to numbered lists');
    }
    
    if (hasComparisons && counts.tables === 0) {
      recommendations.push('create comparison tables');
    }
    
    if (hasFeatures && counts.lists === 0) {
      recommendations.push('list features/benefits in bullet points');
    }
    
    const sufficient = counts.total >= 2 && (counts.lists >= 1 || counts.tables >= 1);
    
    console.log('📊 Real Structured Data Analysis:', { 
      counts,
      missing,
      recommendations,
      sufficient,
      hasNumberedSteps,
      hasComparisons,
      hasFeatures
    });
    
    return { sufficient, missing, counts, recommendations };
  }

  private hasDefinitions(content: string): boolean {
    const patterns = [
      /is\s+(?:defined\s+as|a\s+type\s+of|an?\s+)/gi,
      /refers\s+to/gi,
      /\bmeans\b/gi,
      /definition/gi,
      /:\s*[A-Z][a-z][^.!?]{10,}[.!?]/g // Colon definitions
    ];
    
    let defCount = 0;
    patterns.forEach(pattern => {
      const matches = content.match(pattern) || [];
      defCount += matches.length;
    });
    
    const hasDefinitions = defCount >= 2;
    console.log('📖 Definition Analysis:', { defCount, hasDefinitions });
    return hasDefinitions;
  }

  private hasExamples(content: string): boolean {
    const patterns = [
      /for\s+example/gi,
      /such\s+as/gi,
      /including/gi,
      /\be\.g\./gi,
      /for\s+instance/gi,
      /examples?\s+include/gi
    ];
    
    let exampleCount = 0;
    patterns.forEach(pattern => {
      const matches = content.match(pattern) || [];
      exampleCount += matches.length;
    });
    
    const hasExamples = exampleCount >= 2;
    console.log('🔍 Example Analysis:', { exampleCount, hasExamples });
    return hasExamples;
  }

  private hasContactInfo(content: string): boolean {
    const patterns = [
      /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      /contact/gi,
      /\b(?:phone|email|address|location):/gi
    ];
    
    let contactCount = 0;
    patterns.forEach(pattern => {
      const matches = content.match(pattern) || [];
      contactCount += matches.length;
    });
    
    const hasContact = contactCount >= 2;
    console.log('📞 Contact Analysis:', { contactCount, hasContact });
    return hasContact;
  }

  private hasLongParagraphs(content: string): boolean {
    // Extract text content from HTML
    const textContent = content.replace(/<[^>]*>/g, ' ');
    const paragraphs = textContent.split(/\n\s*\n|\r\n\s*\r\n|\.  /);
    
    const longParas = paragraphs.filter(p => {
      const clean = p.trim();
      return clean.length > 400; // More than 400 chars is long
    });
    
    const hasLongParagraphs = longParas.length > 2;
    console.log('📄 Paragraph Analysis:', { 
      totalParagraphs: paragraphs.length, 
      longParagraphs: longParas.length, 
      hasLongParagraphs 
    });
    
    return hasLongParagraphs;
  }

  private analyzeContentDepth($: CheerioAPI): { needsExpansion: boolean; wordCount: number; paragraphCount: number; suggestions: string[] } {
    const textContent = $.text();
    const words = textContent.trim().split(/\s+/).filter((w: string) => w.length > 2);
    const paragraphs = $('p');
    const headings = $('h1, h2, h3, h4, h5, h6');
    
    const wordCount = words.length;
    const paragraphCount = paragraphs.length;
    const averageWordsPerParagraph = paragraphCount > 0 ? wordCount / paragraphCount : 0;
    
    const suggestions: string[] = [];
    let needsExpansion = false;
    
    // Analyze depth based on multiple factors
    if (wordCount < 150) {
      needsExpansion = true;
      suggestions.push('Content too short - need at least 300-500 words');
    } else if (wordCount < 300) {
      needsExpansion = true;
      suggestions.push('Content shallow - expand with more details');
    }
    
    if (paragraphCount < 3) {
      needsExpansion = true;
      suggestions.push('Add more paragraphs for better organization');
    }
    
    if (averageWordsPerParagraph < 20) {
      suggestions.push('Paragraphs too short - expand with more details');
    }
    
    if (averageWordsPerParagraph > 100) {
      suggestions.push('Paragraphs too long - break into smaller sections');
    }
    
    // Check for content quality indicators
    const hasExamples = /\b(example|for instance|such as)\b/gi.test(textContent);
    const hasNumbers = /\b\d+[%$]?\b/g.test(textContent);
    const hasDetails = /\b(specifically|particularly|namely|including)\b/gi.test(textContent);
    
    if (!hasExamples) {
      suggestions.push('add concrete examples');
    }
    
    if (!hasNumbers) {
      suggestions.push('include statistics or data points');
    }
    
    if (!hasDetails) {
      suggestions.push('provide more specific details');
    }
    
    // Check section depth
    const sectionsWithContent = headings.filter((_: number, heading: any) => {
      const nextHeading = $(heading).nextUntil('h1, h2, h3, h4, h5, h6');
      const sectionText = nextHeading.text();
      return sectionText.trim().split(/\s+/).length >= 50; // At least 50 words per section
    }).length;
    
    if (sectionsWithContent < headings.length * 0.7) {
      suggestions.push('expand content in each section');
    }
    
    console.log('📏 Real Content Depth Analysis:', {
      wordCount,
      paragraphCount,
      averageWordsPerParagraph,
      needsExpansion,
      suggestions,
      hasExamples,
      hasNumbers,
      hasDetails,
      sectionsWithContent
    });
    
    return { needsExpansion, wordCount, paragraphCount, suggestions };
  }

  /**
   * Additional real analysis methods (removed unused methods)
   */

  private analyzeExamples(textContent: string): { sufficient: boolean; issues: string[]; types: string[]; suggestions: string[]; abstractContent: boolean } {
    // Look for example indicators
    const examplePatterns = [
      /for\s+example/gi,
      /such\s+as/gi,
      /including/gi,
      /\be\.g\./gi,
      /for\s+instance/gi,
      /examples?\s+include/gi,
      /like\s+\w+/gi,
      /consider\s+\w+/gi
    ];

    let exampleCount = 0;
    const foundTypes: string[] = [];

    examplePatterns.forEach((pattern, index) => {
      const matches = textContent.match(pattern) || [];
      exampleCount += matches.length;
      
      if (matches.length > 0) {
        const typeNames = ['explicit examples', 'comparisons', 'inclusions', 'abbreviations', 'instances', 'lists', 'analogies', 'considerations'];
        foundTypes.push(typeNames[index]);
      }
    });

    // Check for abstract vs concrete content
    const abstractWords = /(concept|theory|principle|methodology|framework|approach|strategy)/gi;
    const concreteWords = /(example|case|instance|demonstration|illustration|sample)/gi;

    const abstractCount = (textContent.match(abstractWords) || []).length;
    const concreteCount = (textContent.match(concreteWords) || []).length;
    const abstractContent = abstractCount > concreteCount * 2;

    const issues: string[] = [];
    const suggestions: string[] = [];

    if (exampleCount === 0) {
      issues.push('No examples found');
      suggestions.push('concrete use cases', 'real-world scenarios');
    }

    if (abstractContent) {
      issues.push('Too much abstract content');
      suggestions.push('specific examples', 'practical demonstrations');
    }

    if (exampleCount > 0 && exampleCount < 3) {
      suggestions.push('more diverse examples');
    }

    const sufficient = exampleCount >= 2 && !abstractContent;

    return { sufficient, issues, types: foundTypes, suggestions, abstractContent };
  }

  private analyzeContactInfo($: CheerioAPI): { sufficient: boolean; missing: string[]; found: string[]; businessContent: boolean } {
    const content = $.text();
    
    const contactElements = {
      phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
      email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      address: /\d+\s+[A-Za-z\s]+(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd)/gi,
      social: /@[a-zA-Z0-9_]+|facebook\.com|twitter\.com|linkedin\.com/gi,
      contactSection: /contact|reach\s+us|get\s+in\s+touch/gi
    };

    const found: string[] = [];
    const missing: string[] = [];
    let contactCount = 0;

    Object.entries(contactElements).forEach(([type, pattern]) => {
      const matches = content.match(pattern) || [];
      contactCount += matches.length;
      
      if (matches.length > 0) {
        found.push(`${type} (${matches.length})`);
      } else {
        missing.push(type);
      }
    });

    // Check if this is business content that needs contact info
    const businessIndicators = /\b(company|business|service|product|buy|purchase|order|contact|office|location)\b/gi;
    const businessContent = (content.match(businessIndicators) || []).length >= 3;

    const sufficient = contactCount >= 2 || (!businessContent && contactCount >= 1);

    return { sufficient, missing, found, businessContent };
  }

  /**
   * Calculate current LLM-friendliness score based on real content analysis
   */
  private calculateCurrentScore(content: string, actions: ImprovementAction[]): number {
    console.log('Calculating current score from real content analysis...');
    
    // Parse content for analysis
    const $: CheerioAPI = cheerio.load(content);
    const textContent = $('body').text().toLowerCase();
    
    // Start with a base score
    let score = 100;
    
    // Analyze actual content quality
    const directAnswers = this.analyzeDirectAnswers($, textContent);
    const faqAnalysis = this.analyzeFAQSection($, textContent);
    const headingAnalysis = this.analyzeHeadingStructure($);
    const structureAnalysis = this.analyzeStructuredData($);
    const depthAnalysis = this.analyzeContentDepth($);
    
    // Also check other content features
    const contentMetrics = {
      hasDirectAnswers: directAnswers.found,
      hasFAQ: faqAnalysis.found,
      hasGoodHeadings: headingAnalysis.isGood,
      hasStructuredData: structureAnalysis.sufficient,
      hasGoodDepth: !depthAnalysis.needsExpansion,
      hasEntities: this.hasEntityMentions(content),
      hasDefinitions: this.hasDefinitions(textContent),
      hasExamples: this.hasExamples(textContent),
      hasContact: this.hasContactInfo(content),
      hasMeta: this.hasMetaDescription(content),
      hasGoodParagraphs: !this.hasLongParagraphs(content),
      hasInternalLinks: this.hasInternalLinkingContext(content)
    };

    // Calculate deductions based on real analysis
    const deductions = {
      'direct-answers': contentMetrics.hasDirectAnswers ? 0 : (directAnswers.criticalMissing ? 20 : 12),
      'add-faq': contentMetrics.hasFAQ ? 0 : 15,
      'improve-headings': contentMetrics.hasGoodHeadings ? 0 : (headingAnalysis.severity === 'critical' ? 18 : 8),
      'add-structured-data': contentMetrics.hasStructuredData ? 0 : (structureAnalysis.counts.total === 0 ? 15 : 6),
      'expand-content': contentMetrics.hasGoodDepth ? 0 : (depthAnalysis.wordCount < 100 ? 16 : 8),
      'add-entities': contentMetrics.hasEntities ? 0 : 10,
      'add-definitions': contentMetrics.hasDefinitions ? 0 : 12,
      'add-examples': contentMetrics.hasExamples ? 0 : 8,
      'break-paragraphs': contentMetrics.hasGoodParagraphs ? 0 : 5,
      'add-contact': contentMetrics.hasContact ? 0 : 3,
      'improve-meta': contentMetrics.hasMeta ? 0 : 4,
      'improve-internal-links': contentMetrics.hasInternalLinks ? 0 : 5
    };

    // Calculate total deduction based on actual missing elements
    const totalDeduction = actions.reduce((sum, action) => {
      const deduction = deductions[action.id as keyof typeof deductions] || 0;
      return sum + deduction;
    }, 0);

    score = Math.max(10, score - totalDeduction); // Minimum score of 10

    console.log('Real score calculation:', {
      startingScore: 100,
      realAnalysis: {
        directAnswers: directAnswers.found,
        faq: faqAnalysis.found,
        headingQuality: headingAnalysis.isGood,
        structuredData: structureAnalysis.sufficient,
        contentDepth: !depthAnalysis.needsExpansion,
        wordCount: depthAnalysis.wordCount
      },
      totalDeduction,
      finalScore: score,
      actionsFound: actions.map(a => a.id)
    });

    return Math.round(score);
  }
    private hasMetaDescription(content: string): boolean {
        const patterns = [
            /<meta\s+name=["']description["'][^>]*content=["'][^"']{10,}["'][^>]*>/gi,
            /<meta\s+content=["'][^"']{10,}["'][^>]*name=["']description["'][^>]*>/gi
        ];
        
        let metaCount = 0;
        patterns.forEach(pattern => {
            const matches = content.match(pattern) || [];
            metaCount += matches.length;
        });
        
        const hasMeta = metaCount >= 1;
        console.log('🏷️ Meta Description Analysis:', { metaCount, hasMeta });
        return hasMeta;
    }
    
    private hasInternalLinkingContext(content: string): boolean {
        const patterns = [
            /<a\s+href=["'][^"']*\/[^"']*["'][^>]*>/gi, // Relative links
            /read\s+more/gi,
            /learn\s+more/gi,
            /see\s+also/gi,
            /related\s+(?:articles?|posts?|content)/gi
        ];
        
        let linkCount = 0;
        patterns.forEach(pattern => {
            const matches = content.match(pattern) || [];
            linkCount += matches.length;
        });
        
        const hasLinks = linkCount >= 2;
        console.log('🔗 Internal Linking Analysis:', { linkCount, hasLinks });
        return hasLinks;
    }

  /**
   * Calculate predicted score after improvements
   */
  private calculatePredictedScore(currentScore: number, actions: ImprovementAction[]): number {
    // Calculate improvement more realistically
    const totalImprovement = actions.reduce((sum, action) => {
      // Scale impact based on priority and current score
      let scaledImpact = action.impact;
      
      // High priority actions have full impact
      if (action.priority === 'High') {
        scaledImpact = action.impact;
      } 
      // Medium priority actions have 80% impact
      else if (action.priority === 'Medium') {
        scaledImpact = action.impact * 0.8;
      } 
      // Low priority actions have 60% impact
      else {
        scaledImpact = action.impact * 0.6;
      }
      
      return sum + scaledImpact;
    }, 0);

    // Apply diminishing returns for very low scores
    const improvementMultiplier = currentScore < 30 ? 1.2 : currentScore < 50 ? 1.1 : 1.0;
    const adjustedImprovement = totalImprovement * improvementMultiplier;
    
    const predictedScore = Math.min(95, currentScore + adjustedImprovement); // Cap at 95

    console.log('Predicted score calculation:', {
      currentScore,
      totalImprovement,
      adjustedImprovement,
      predictedScore: Math.round(predictedScore)
    });

    return Math.round(predictedScore);
  }

  /**
   * Store analysis results in database
   */
  private async storeAnalysisResults(
    sessionId: number,
    url: string | undefined,
    results: ActionableInsightsData
  ): Promise<void> {
    try {
      // Store in a simple JSON format for now
      // You can extend this to use proper database tables
      console.log('Storing actionable insights results:', {
        sessionId,
        url,
        totalActions: results.totalActions,
        improvement: results.improvement
      });

      // This would typically save to your database
      // await prisma.actionableInsights.create({ ... });
    } catch (error) {
      console.error('Error storing analysis results:', error);
      // Don't throw error as this is non-critical
    }
  }

  /**
   * Get session results
   */
  async getSessionResults(sessionId: number): Promise<ActionableInsightsData | null> {
    try {
      // Retrieve stored results from database
      // This is a placeholder implementation
      console.log('Getting session results for:', sessionId);
      return null; // Return stored results or null if not found
    } catch (error) {
      console.error('Error getting session results:', error);
      return null;
    }
  }

  /**
   * Get service statistics
   */
  async getStats(): Promise<ActionableInsightsStats> {
    try {
      // Return mock statistics for now
      // In production, this would query your database
      return {
        totalAnalyses: 150,
        averageScore: 68,
        commonActions: [
          'Add FAQ Section',
          'Improve Heading Hierarchy',
          'Add Direct Answer Sections',
          'Include Examples'
        ],
        averageImprovement: 12
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      throw new Error('Failed to get actionable insights statistics');
    }
  }
}

export const actionableInsightsService = new ActionableInsightsService();
export default actionableInsightsService;