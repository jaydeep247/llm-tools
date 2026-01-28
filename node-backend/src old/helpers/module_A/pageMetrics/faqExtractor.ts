import type { CheerioAPI, Element } from 'cheerio';
import type { FaqData, FaqInfo } from './types.js';

/**
 * Extract FAQ information from a page using multiple detection signals
 * Implements a robust, production-grade approach with confidence scoring
 */
export function extractFaqs($: CheerioAPI): FaqData {
    let faqScore = 0;
    const detectionMethods: string[] = [];
    let faqCount = 0;
    let faqSchemaPresent = false;
    const faqPairs: FaqInfo[] = [];

    // Signal 1: Structured Data Detection (Most Reliable) - Score: 5
    const schemaFaqs = detectFaqSchema($);
    if (schemaFaqs.length > 0) {
        faqScore += 5;
        detectionMethods.push('schema');
        faqSchemaPresent = true;
        faqCount = schemaFaqs.length;
        faqPairs.push(...schemaFaqs);
    }

    // Signal 2: HTML Q&A Pattern Detection - Score: 3
    const htmlFaqs = detectHtmlQaPatterns($);
    if (htmlFaqs.length >= 2) {
        faqScore += 3;
        if (!detectionMethods.includes('html')) {
            detectionMethods.push('html');
        }
        // Only add if we don't already have schema FAQs (avoid duplicates)
        if (schemaFaqs.length === 0) {
            faqCount = htmlFaqs.length;
            faqPairs.push(...htmlFaqs);
        }
    }

    // Signal 3: Class / ID Heuristics - Score: 1
    const heuristicFaqs = detectFaqHeuristics($);
    if (heuristicFaqs.length > 0) {
        faqScore += 1;
        if (!detectionMethods.includes('heuristic')) {
            detectionMethods.push('heuristic');
        }
        // Only add if we don't already have FAQs from other methods
        if (faqPairs.length === 0) {
            faqCount = heuristicFaqs.length;
            faqPairs.push(...heuristicFaqs);
        }
    }

    // Signal 4: Accordion / Toggle Detection - Score: 1
    const accordionFaqs = detectAccordionFaqs($);
    if (accordionFaqs.length > 0) {
        faqScore += 1;
        if (!detectionMethods.includes('accordion')) {
            detectionMethods.push('accordion');
        }
        // Only add if we don't already have FAQs from other methods
        if (faqPairs.length === 0) {
            faqCount = accordionFaqs.length;
            faqPairs.push(...accordionFaqs);
        }
    }

    // Final decision: FAQ present if score >= 4
    const hasFaqs = faqScore >= 4 || faqPairs.length >= 2;

    return {
        hasFaqs,
        faqCount: hasFaqs ? faqCount : 0,
        faqScore,
        detectionMethod: detectionMethods.length > 0 ? detectionMethods.join(', ') : 'none',
        faqSchemaPresent,
        faqPairs: hasFaqs ? faqPairs : []
    };
}

/**
 * Signal 1: Detect FAQ Schema (JSON-LD with @type: "FAQPage")
 * Highest confidence signal
 */
function detectFaqSchema($: CheerioAPI): FaqInfo[] {
    const faqs: FaqInfo[] = [];

    // Find all JSON-LD scripts
    $('script[type="application/ld+json"]').each((_: number, element: Element) => {
        try {
            const scriptContent = $(element).html();
            if (!scriptContent) return;

            const jsonData = JSON.parse(scriptContent);
            
            // Handle both single objects and arrays
            const schemas = Array.isArray(jsonData) ? jsonData : [jsonData];

            for (const schema of schemas) {
                // Check for FAQPage type
                if (schema['@type'] === 'FAQPage' && schema.mainEntity && Array.isArray(schema.mainEntity)) {
                    schema.mainEntity.forEach((item: any, index: number) => {
                        if (item['@type'] === 'Question' && item.name && item.acceptedAnswer) {
                            faqs.push({
                                index,
                                question: item.name,
                                answer: item.acceptedAnswer.text || 
                                       (item.acceptedAnswer['@type'] === 'Answer' ? item.acceptedAnswer.text : ''),
                                source: 'schema',
                                hasSchema: true
                            });
                        }
                    });
                }
            }
        } catch (e) {
            // Invalid JSON, skip
        }
    });

    return faqs;
}

/**
 * Signal 2: HTML Q&A Pattern Detection
 * Look for headings or strong text ending with ? followed by answers
 */
function detectHtmlQaPatterns($: CheerioAPI): FaqInfo[] {
    const faqs: FaqInfo[] = [];
    let index = 0;

    // Find all headings (h1-h6) and strong elements that might be questions
    $('h1, h2, h3, h4, h5, h6, strong, b').each((_: number, element: Element) => {
        const $element = $(element);
        const text = $element.text().trim();

        // Check if text ends with question mark
        if (text.endsWith('?') && text.length > 5) {
            // Look for answer in next sibling elements
            let $next = $element.next();
            let answerText = '';

            // Check next few siblings for answer content
            for (let i = 0; i < 3 && $next.length > 0; i++) {
                const nextText = $next.text().trim();
                if (nextText.length > 10) {
                    answerText = nextText;
                    break;
                }
                $next = $next.next();
            }

            // If no answer found in siblings, check parent's next sibling
            if (!answerText) {
                const $parent = $element.parent();
                const $parentNext = $parent.next();
                if ($parentNext.length > 0) {
                    answerText = $parentNext.text().trim();
                }
            }

            // If we found an answer, add to FAQs
            if (answerText.length > 10) {
                faqs.push({
                    index: index++,
                    question: text,
                    answer: answerText.substring(0, 500), // Limit answer length
                    source: 'html',
                    hasSchema: false
                });
            }
        }
    });

    return faqs;
}

/**
 * Signal 3: Class / ID Heuristics
 * Look for common FAQ-related class names and IDs
 */
function detectFaqHeuristics($: CheerioAPI): FaqInfo[] {
    const faqs: FaqInfo[] = [];
    const faqKeywords = ['faq', 'faqs', 'accordion', 'qa', 'questions', 'question-answer', 'q-and-a'];
    let index = 0;

    // Find elements with FAQ-related classes or IDs
    const selectors = faqKeywords.map(keyword => 
        `[class*="${keyword}"], [id*="${keyword}"], .${keyword}, #${keyword}`
    ).join(', ');

    // Get all matching elements and filter to only tags
    const elements = $(selectors).toArray().filter((el: any) => el.type === 'tag') as Element[];
    
    elements.forEach((element: Element) => {
        const $element = $(element);
        
        // Look for question-answer pairs within this element
        const qElements = $element.find('h1, h2, h3, h4, h5, h6, strong, b, dt').toArray().filter((el: any) => el.type === 'tag') as Element[];
        
        qElements.forEach((qElement: Element) => {
            const $qElement = $(qElement);
            const questionText = $qElement.text().trim();

            if (questionText.length > 5 && (questionText.endsWith('?') || questionText.length > 10)) {
                // Find answer
                let answerText = '';
                
                // Check next sibling
                let $next = $qElement.next();
                if ($next.length > 0) {
                    answerText = $next.text().trim();
                }

                // If no answer, check next sibling of parent
                if (!answerText) {
                    const $parent = $qElement.parent();
                    const $parentNext = $parent.next();
                    if ($parentNext.length > 0) {
                        answerText = $parentNext.text().trim();
                    }
                }

                // Check for dd element (definition description) if dt (definition term)
                const tagName = $qElement.prop('tagName')?.toLowerCase();
                if (tagName === 'dt') {
                    const $dd = $qElement.next('dd');
                    if ($dd.length > 0) {
                        answerText = $dd.text().trim();
                    }
                }

                if (answerText.length > 10) {
                    faqs.push({
                        index: index++,
                        question: questionText,
                        answer: answerText.substring(0, 500),
                        source: 'heuristic',
                        hasSchema: false
                    });
                }
            }
        });
    });

    return faqs;
}

/**
 * Signal 4: Accordion / Toggle Detection
 * Look for expandable elements with ARIA attributes
 */
function detectAccordionFaqs($: CheerioAPI): FaqInfo[] {
    const faqs: FaqInfo[] = [];
    let index = 0;

    // Find elements with accordion-related attributes
    $('[aria-expanded], [role="button"], .accordion, .toggle, [data-toggle], [data-target]').each((_: number, element: Element) => {
        const $element = $(element);
        const $parent = $element.parent();
        
        // Look for question text in the element or its children
        const questionText = $element.find('h1, h2, h3, h4, h5, h6, strong, b').first().text().trim() || 
                            $element.text().trim().split('\n')[0];

        if (questionText.length > 5 && (questionText.endsWith('?') || questionText.length > 10)) {
            // Look for answer in next sibling or in a collapsible content area
            let answerText = '';

            // Check for common accordion content selectors
            const $content = $element.next('.content, .answer, .panel, .collapse, [class*="content"], [class*="answer"]');
            if ($content.length > 0) {
                answerText = $content.text().trim();
            }

            // Check next sibling
            if (!answerText) {
                const $next = $element.next();
                if ($next.length > 0 && !$next.is('[aria-expanded], [role="button"]')) {
                    answerText = $next.text().trim();
                }
            }

            // Check parent's next sibling
            if (!answerText) {
                const $parentNext = $parent.next();
                if ($parentNext.length > 0) {
                    answerText = $parentNext.text().trim();
                }
            }

            if (answerText.length > 10) {
                faqs.push({
                    index: index++,
                    question: questionText,
                    answer: answerText.substring(0, 500),
                    source: 'accordion',
                    hasSchema: false
                });
            }
        }
    });

    return faqs;
}

/**
 * Calculate FAQ confidence score
 */
export function calculateFaqScore(faqData: FaqData): number {
    return faqData.faqScore;
}

/**
 * Get FAQ statistics
 */
export function getFaqStats(faqData: FaqData): {
    totalFaqs: number;
    schemaFaqs: number;
    htmlFaqs: number;
    heuristicFaqs: number;
    accordionFaqs: number;
    averageAnswerLength: number;
} {
    const schemaFaqs = faqData.faqPairs.filter(f => f.source === 'schema').length;
    const htmlFaqs = faqData.faqPairs.filter(f => f.source === 'html').length;
    const heuristicFaqs = faqData.faqPairs.filter(f => f.source === 'heuristic').length;
    const accordionFaqs = faqData.faqPairs.filter(f => f.source === 'accordion').length;

    const totalAnswerLength = faqData.faqPairs.reduce((sum, faq) => sum + (faq.answer?.length || 0), 0);
    const averageAnswerLength = faqData.faqPairs.length > 0 
        ? Math.round(totalAnswerLength / faqData.faqPairs.length)
        : 0;

    return {
        totalFaqs: faqData.faqCount,
        schemaFaqs,
        htmlFaqs,
        heuristicFaqs,
        accordionFaqs,
        averageAnswerLength
    };
}
