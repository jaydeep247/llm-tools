/**
 * Spell and Grammar Checker Module
 * 
 * Analyzes text content for spelling and grammatical errors
 * to help assess content quality for SEO purposes.
 */

// Common misspelling patterns and typos
const commonMisspellings = new Map<string, string>([
    // Common typos
    ['teh', 'the'],
    ['adn', 'and'],
    ['waht', 'what'],
    ['thier', 'their'],
    ['recieve', 'receive'],
    ['occured', 'occurred'],
    ['seperate', 'separate'],
    ['definately', 'definitely'],
    ['occassion', 'occasion'],
    ['accomodate', 'accommodate'],
    ['acheive', 'achieve'],
    ['beleive', 'believe'],
    ['wierd', 'weird'],
    ['untill', 'until'],
    ['sucessful', 'successful'],
    ['neccessary', 'necessary'],
    ['occassionally', 'occasionally'],
    ['recomend', 'recommend'],
    ['begining', 'beginning'],
    ['refered', 'referred'],
    ['prefered', 'preferred'],
    ['occuring', 'occurring'],
    ['enviroment', 'environment'],
    ['arguement', 'argument'],
    ['maintainance', 'maintenance'],
    ['existance', 'existence'],
    ['appearence', 'appearance'],
    ['persistant', 'persistent'],
    ['independant', 'independent'],
    ['goverment', 'government'],
    ['calender', 'calendar'],
    ['tommorrow', 'tomorrow'],
    ['pharaoh', 'pharaoh'],
]);

// Common grammar patterns to check
interface GrammarPattern {
    pattern: RegExp;
    description: string;
}

const grammarPatterns: GrammarPattern[] = [
    // Subject-verb agreement (basic cases)
    {
        pattern: /\b(he|she|it)\s+(are|were)\b/gi,
        description: 'Subject-verb disagreement (he/she/it with are/were)'
    },
    {
        pattern: /\b(they|we|you)\s+(is|was)\b/gi,
        description: 'Subject-verb disagreement (they/we/you with is/was)'
    },
    // Double negatives
    {
        pattern: /\b(don't|doesn't|didn't|won't|can't|couldn't|shouldn't|wouldn't)\s+(no|nothing|nobody|never|none)\b/gi,
        description: 'Double negative'
    },
    // Common incorrect verb forms
    {
        pattern: /\b(should|could|would)\s+of\b/gi,
        description: 'Should use "have" not "of" (should have, could have, would have)'
    },
    // Its vs it's confusion
    {
        pattern: /\bits'\s/gi,
        description: 'Invalid form "its\'" (use "its" or "it\'s")'
    },
    // Your vs you're basic check (contextual analysis would be better)
    {
        pattern: /\byour\s+(going|doing|being|coming|running)\b/gi,
        description: 'Should use "you\'re" not "your"'
    },
    // Their/there/they're basic checks
    {
        pattern: /\bthere\s+(going|doing|being|coming|running)\b/gi,
        description: 'Should use "they\'re" not "there"'
    },
    // Then vs than
    {
        pattern: /\bbetter\s+then\b/gi,
        description: 'Should use "than" not "then" (better than)'
    },
    {
        pattern: /\bworse\s+then\b/gi,
        description: 'Should use "than" not "then" (worse than)'
    },
    // Affect vs effect (basic case)
    {
        pattern: /\bthe\s+affect\s+of\b/gi,
        description: 'Should use "effect" not "affect" (the effect of)'
    },
    // Lose vs loose
    {
        pattern: /\bdon't\s+loose\b/gi,
        description: 'Should use "lose" not "loose"'
    },
    // A vs an before vowels/consonants
    {
        pattern: /\ba\s+[aeiou]/gi,
        description: 'Should use "an" before vowel sound'
    },
    {
        pattern: /\ban\s+[bcdfghjklmnpqrstvwxyz]/gi,
        description: 'Should use "a" before consonant sound (exceptions: hour, honest, etc.)'
    },
];

export interface SpellGrammarResults {
    spellingErrors: number;
    grammarErrors: number;
    spellingIssues?: string[];  // For debugging/detailed reporting
    grammarIssues?: string[];   // For debugging/detailed reporting
}

/**
 * Check text for spelling errors
 */
function checkSpelling(text: string): { count: number; issues: string[] } {
    const words = text.toLowerCase()
        .split(/\s+/)
        .map(w => w.replace(/[^a-z'-]/g, ''))
        .filter(w => w.length > 0);
    
    const issues: string[] = [];
    let errorCount = 0;
    
    for (const word of words) {
        if (commonMisspellings.has(word)) {
            errorCount++;
            issues.push(`"${word}" → "${commonMisspellings.get(word)}"`);
        }
    }
    
    return { count: errorCount, issues };
}

/**
 * Check text for grammar errors
 */
function checkGrammar(text: string): { count: number; issues: string[] } {
    const issues: string[] = [];
    let errorCount = 0;
    
    for (const pattern of grammarPatterns) {
        const matches = text.match(pattern.pattern);
        if (matches) {
            errorCount += matches.length;
            matches.forEach(match => {
                issues.push(`${pattern.description}: "${match}"`);
            });
        }
    }
    
    return { count: errorCount, issues };
}

/**
 * Analyze text for spelling and grammar errors
 * 
 * @param text - The text content to analyze
 * @param includeDetails - Whether to include detailed issue lists (for debugging)
 * @returns SpellGrammarResults with error counts and optional details
 */
export function analyzeSpellingAndGrammar(
    text: string,
    includeDetails: boolean = false
): SpellGrammarResults {
    if (!text || text.trim().length === 0) {
        return {
            spellingErrors: 0,
            grammarErrors: 0,
            spellingIssues: [],
            grammarIssues: []
        };
    }
    
    // Check spelling
    const spellingResult = checkSpelling(text);
    
    // Check grammar
    const grammarResult = checkGrammar(text);
    
    const results: SpellGrammarResults = {
        spellingErrors: spellingResult.count,
        grammarErrors: grammarResult.count
    };
    
    // Include details if requested (useful for debugging or detailed reports)
    if (includeDetails) {
        results.spellingIssues = spellingResult.issues;
        results.grammarIssues = grammarResult.issues;
    }
    
    return results;
}

/**
 * Get a quality assessment based on error counts
 * 
 * @param spellingErrors - Number of spelling errors
 * @param grammarErrors - Number of grammar errors
 * @returns Quality level: 'excellent', 'good', 'fair', or 'poor'
 */
export function getContentQualityLevel(
    spellingErrors: number,
    grammarErrors: number
): 'excellent' | 'good' | 'fair' | 'poor' {
    const totalErrors = spellingErrors + grammarErrors;
    
    if (totalErrors === 0) {
        return 'excellent';
    } else if (totalErrors <= 2) {
        return 'good';
    } else if (totalErrors <= 5) {
        return 'fair';
    } else {
        return 'poor';
    }
}
