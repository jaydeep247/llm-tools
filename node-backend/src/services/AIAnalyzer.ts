interface Question {
  question: string;
  isAnswered: boolean;
  answerQuality: 'none' | 'partial' | 'complete';
  answerText?: string;
  confidence: number;
}

interface AnalysisResult {
  questions: Question[];
  totalQuestions: number;
  answeredQuestions: number;
  partiallyAnsweredQuestions: number;
  unansweredQuestions: number;
  completenessScore: number;
  depthScore: number;
  breadthScore: number;
  relevanceScore: number;
  topicsCovered: string[];
  missingTopics: string[];
  contentLength: number;
  readabilityScore: number;
}

export class AIAnalyzer {
  async analyzeContent(content: any): Promise<AnalysisResult> {
    try {
      const questions = this.extractQuestionsFromContent(content);
      const answeredQuestions = questions.filter(q => q.isAnswered).length;
      const partiallyAnswered = questions.filter(q => q.answerQuality === 'partial').length;
      const unanswered = questions.filter(q => q.answerQuality === 'none').length;
      
      const completenessScore = this.calculateCompletenessScore(questions);
      const depthScore = this.calculateDepthScore(content);
      const breadthScore = this.calculateBreadthScore(content);
      const relevanceScore = this.calculateRelevanceScore(content, questions);
      const readabilityScore = this.calculateReadabilityScore(content);
      
      return {
        questions,
        totalQuestions: questions.length,
        answeredQuestions,
        partiallyAnsweredQuestions: partiallyAnswered,
        unansweredQuestions: unanswered,
        completenessScore,
        depthScore,
        breadthScore,
        relevanceScore,
        topicsCovered: this.extractTopics(content),
        missingTopics: this.identifyMissingTopics(content),
        contentLength: content.fullText.length,
        readabilityScore
      };
    } catch (error) {
      console.error('Error analyzing content:', error);
      throw new Error('Failed to analyze content');
    }
  }

  private extractQuestionsFromContent(content: any): Question[] {
    const questions: Question[] = [];
    const title = content.title.toLowerCase();
    const text = content.fullText.toLowerCase();
    
    // Common question patterns based on content
    const questionPatterns = [
      { pattern: 'what is', question: `What is ${this.extractMainTopic(content.title)}?` },
      { pattern: 'how to', question: `How to ${this.extractMainTopic(content.title)}?` },
      { pattern: 'how does', question: `How does ${this.extractMainTopic(content.title)} work?` },
      { pattern: 'why', question: `Why use ${this.extractMainTopic(content.title)}?` },
      { pattern: 'when', question: `When to use ${this.extractMainTopic(content.title)}?` },
      { pattern: 'where', question: `Where to find ${this.extractMainTopic(content.title)}?` },
      { pattern: 'benefits', question: `What are the benefits of ${this.extractMainTopic(content.title)}?` },
      { pattern: 'cost', question: `How much does ${this.extractMainTopic(content.title)} cost?` }
    ];

    questionPatterns.forEach(({ pattern, question }) => {
      const isAnswered = this.checkIfQuestionAnswered(content, pattern);
      const answerQuality = this.assessAnswerQuality(content, pattern);
      
      questions.push({
        question,
        isAnswered,
        answerQuality,
        answerText: isAnswered ? this.extractAnswerText(content, pattern) : undefined,
        confidence: this.calculateConfidence(content, pattern)
      });
    });

    // Add questions from headings
    content.headings.forEach((heading: string) => {
      if (heading.includes('?')) {
        questions.push({
          question: heading,
          isAnswered: true,
          answerQuality: 'complete',
          confidence: 0.9
        });
      }
    });

    return questions;
  }

  private extractMainTopic(title: string): string {
    // Simple extraction - remove common words
    const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
    const words = title.toLowerCase().split(' ')
      .filter(word => !commonWords.includes(word) && word.length > 2);
    return words.slice(0, 2).join(' ') || title;
  }

  private checkIfQuestionAnswered(content: any, pattern: string): boolean {
    const text = content.fullText.toLowerCase();
    const paragraphs = content.paragraphs;
    
    // Check if there are substantial paragraphs that might answer the question
    const relevantParagraphs = paragraphs.filter((p: string) => 
      p.toLowerCase().includes(pattern) || p.length > 100
    );
    
    return relevantParagraphs.length > 0 && text.includes(pattern);
  }

  private assessAnswerQuality(content: any, pattern: string): 'none' | 'partial' | 'complete' {
    const text = content.fullText.toLowerCase();
    
    if (!text.includes(pattern)) return 'none';
    
    const relevantParagraphs = content.paragraphs.filter((p: string) => 
      p.toLowerCase().includes(pattern)
    );
    
    if (relevantParagraphs.length === 0) return 'none';
    if (relevantParagraphs.length === 1 && relevantParagraphs[0].length < 200) return 'partial';
    
    return 'complete';
  }

  private extractAnswerText(content: any, pattern: string): string {
    const relevantParagraphs = content.paragraphs.filter((p: string) => 
      p.toLowerCase().includes(pattern)
    );
    
    return relevantParagraphs.slice(0, 2).join(' ').substring(0, 500);
  }

  private calculateConfidence(content: any, pattern: string): number {
    const text = content.fullText.toLowerCase();
    const occurrences = (text.match(new RegExp(pattern, 'g')) || []).length;
    const contentLength = text.length;
    
    if (occurrences === 0) return 0;
    if (occurrences > 3 && contentLength > 1000) return 0.9;
    if (occurrences > 1 && contentLength > 500) return 0.7;
    
    return 0.5;
  }

  private calculateCompletenessScore(questions: Question[]): number {
    if (questions.length === 0) return 0;
    
    const totalScore = questions.reduce((sum, question) => {
      switch (question.answerQuality) {
        case 'complete': return sum + 100;
        case 'partial': return sum + 60;
        case 'none': return sum + 0;
        default: return sum;
      }
    }, 0);
    
    return Math.round(totalScore / questions.length);
  }

  private calculateDepthScore(content: any): number {
    const avgParagraphLength = content.paragraphs.length > 0 
      ? content.paragraphs.reduce((sum: number, p: string) => sum + p.length, 0) / content.paragraphs.length
      : 0;
    
    const headingCount = content.headings.length;
    const totalLength = content.fullText.length;
    
    let score = 0;
    
    if (avgParagraphLength > 200) score += 30;
    else if (avgParagraphLength > 100) score += 20;
    else score += 10;
    
    if (headingCount > 5) score += 25;
    else if (headingCount > 2) score += 15;
    else score += 5;
    
    if (totalLength > 2000) score += 45;
    else if (totalLength > 1000) score += 30;
    else if (totalLength > 500) score += 20;
    else score += 10;
    
    return Math.min(score, 100);
  }

  private calculateBreadthScore(content: any): number {
    const uniqueTopics = new Set();
    
    content.headings.forEach((heading: string) => {
      const words = heading.toLowerCase().split(' ')
        .filter(word => word.length > 3);
      words.forEach(word => uniqueTopics.add(word));
    });
    
    const topicCount = uniqueTopics.size;
    
    if (topicCount > 15) return 100;
    if (topicCount > 10) return 80;
    if (topicCount > 5) return 60;
    if (topicCount > 2) return 40;
    
    return 20;
  }

  private calculateRelevanceScore(content: any, questions: Question[]): number {
    const titleWords = new Set(content.title.toLowerCase().split(' ')
      .filter((word: string) => word.length > 2));
    
    let relevantQuestions = 0;
    
    questions.forEach(question => {
      const questionWords = question.question.toLowerCase().split(' ');
      const hasRelevantWords = questionWords.some(word => titleWords.has(word));
      
      if (hasRelevantWords) relevantQuestions++;
    });
    
    if (questions.length === 0) return 50;
    
    return Math.round((relevantQuestions / questions.length) * 100);
  }

  private calculateReadabilityScore(content: any): number {
    const text = content.fullText;
    const sentences = text.split(/[.!?]+/).length;
    const words = text.split(/\s+/).length;
    const avgWordsPerSentence = words / sentences;
    
    let score = 100;
    
    if (avgWordsPerSentence > 25) score -= 30;
    else if (avgWordsPerSentence > 20) score -= 20;
    else if (avgWordsPerSentence > 15) score -= 10;
    
    const avgWordLength = text.replace(/\s/g, '').length / words;
    if (avgWordLength > 6) score -= 20;
    else if (avgWordLength > 5) score -= 10;
    
    return Math.max(score, 10);
  }

  private extractTopics(content: any): string[] {
    const topics = new Set<string>();
    
    content.headings.forEach((heading: string) => {
      const words = heading.split(' ')
        .filter(word => word.length > 3)
        .map(word => word.toLowerCase());
      
      words.forEach(word => topics.add(word));
    });
    
    return Array.from(topics).slice(0, 10);
  }

  private identifyMissingTopics(content: any): string[] {
    const mainTopic = this.extractMainTopic(content.title);
    const commonRelatedTopics = [
      `${mainTopic} examples`,
      `${mainTopic} best practices`,
      `${mainTopic} alternatives`,
      `${mainTopic} pricing`,
      `${mainTopic} tutorial`
    ];
    
    const existingText = content.fullText.toLowerCase();
    
    return commonRelatedTopics.filter(topic => 
      !existingText.includes(topic.toLowerCase())
    );
  }
}

export const aiAnalyzer = new AIAnalyzer();