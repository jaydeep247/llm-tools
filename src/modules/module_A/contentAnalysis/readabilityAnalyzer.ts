import type { ReadabilityData } from './types.js';

/**
 * Calculate Flesch Reading Ease score
 * Formula: 206.835 - 1.015 * (total words / total sentences) - 84.6 * (total syllables / total words)
 * 
 * Score interpretation:
 * 90-100: Very Easy (5th grade)
 * 80-89: Easy (6th grade)
 * 70-79: Fairly Easy (7th grade)
 * 60-69: Standard (8th-9th grade)
 * 50-59: Fairly Difficult (10th-12th grade)
 * 30-49: Difficult (College)
 * 0-29: Very Difficult (College graduate)
 */
export function calculateFleschReadingEase(
    text: string,
    sentenceCount: number,
    wordCount: number
): number {
    // Handle edge cases
    if (!text || text.trim().length === 0) return 0;
    if (wordCount === 0) return 0;
    
    // If sentenceCount is 0, try to detect sentences from the text
    let actualSentenceCount = sentenceCount;
    if (actualSentenceCount === 0) {
        // Improved sentence detection: split by sentence-ending punctuation
        const sentences = text.split(/[.!?]+/).filter((s: string) => s.trim().length > 0);
        actualSentenceCount = sentences.length;
        
        // If still 0, assume at least 1 sentence (treat entire text as one sentence)
        if (actualSentenceCount === 0) {
            actualSentenceCount = 1;
        }
    }
    
    const syllableCount = countSyllables(text);
    
    // Prevent division by zero
    if (actualSentenceCount === 0 || wordCount === 0) return 0;
    
    const avgSentenceLength = wordCount / actualSentenceCount;
    const avgSyllablesPerWord = syllableCount / wordCount;
    
    const score = 206.835 
        - 1.015 * avgSentenceLength
        - 84.6 * avgSyllablesPerWord;
    
    return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

/**
 * Calculate Flesch-Kincaid Grade Level
 * Formula: 0.39 * (total words / total sentences) + 11.8 * (total syllables / total words) - 15.59
 */
export function calculateFleschKincaidGrade(
    text: string,
    sentenceCount: number,
    wordCount: number
): number {
    if (wordCount === 0 || sentenceCount === 0) return 0;
    
    const syllableCount = countSyllables(text);
    
    const grade = 0.39 * (wordCount / sentenceCount)
        + 11.8 * (syllableCount / wordCount)
        - 15.59;
    
    return Math.max(0, Math.round(grade * 10) / 10);
}

/**
 * Count syllables in text (simplified algorithm)
 * This is an approximation and may not be 100% accurate
 */
function countSyllables(text: string): number {
    if (!text) return 0;
    
    const words = text.toLowerCase()
        .replace(/[^a-z\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 0);
    
    let totalSyllables = 0;
    
    for (const word of words) {
        totalSyllables += countWordSyllables(word);
    }
    
    return totalSyllables;
}

/**
 * Count syllables in a single word
 */
function countWordSyllables(word: string): number {
    if (word.length <= 3) return 1;
    
    // Remove silent 'e' at the end
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    
    // Remove trailing 'e'
    word = word.replace(/^y/, '');
    
    // Count vowel groups
    const matches = word.match(/[aeiouy]{1,2}/g);
    const syllables = matches ? matches.length : 1;
    
    return Math.max(1, syllables);
}

/**
 * Get readability level description
 * Returns human-friendly labels: Easy, Standard, Difficult, Very Difficult
 */
export function getReadabilityLevel(fleschScore: number | undefined): string | undefined {
    // Return undefined only if score is invalid (not if it's 0, as 0 is a valid "Very Difficult" score)
    if (fleschScore === undefined || fleschScore === null || isNaN(fleschScore)) {
        return undefined;
    }
    
    // Score ranges based on Flesch Reading Ease scale
    if (fleschScore >= 90) return 'Very Easy';
    if (fleschScore >= 80) return 'Easy';
    if (fleschScore >= 70) return 'Fairly Easy';
    if (fleschScore >= 60) return 'Standard';
    if (fleschScore >= 50) return 'Fairly Difficult';
    if (fleschScore >= 30) return 'Difficult';
    // 0-29 is Very Difficult
    return 'Very Difficult';
}

/**
 * Analyze readability
 */
export function analyzeReadability(
    text: string,
    sentenceCount: number,
    wordCount: number
): ReadabilityData {
    // Calculate readability scores
    const fleschReadingEase = calculateFleschReadingEase(text, sentenceCount, wordCount);
    const fleschKincaidGrade = calculateFleschKincaidGrade(text, sentenceCount, wordCount);
    
    // Calculate readability level - 0 is a valid score (Very Difficult), so only skip if undefined/null/NaN
    const readabilityLevel = (fleschReadingEase !== undefined && fleschReadingEase !== null && !isNaN(fleschReadingEase)) 
        ? getReadabilityLevel(fleschReadingEase) 
        : undefined;
    
    return {
        fleschReadingEase: (fleschReadingEase !== undefined && fleschReadingEase !== null && !isNaN(fleschReadingEase)) ? fleschReadingEase : undefined,
        fleschKincaidGrade: (fleschKincaidGrade !== undefined && fleschKincaidGrade !== null && !isNaN(fleschKincaidGrade)) ? fleschKincaidGrade : undefined,
        readabilityLevel
    };
}
