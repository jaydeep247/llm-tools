/**
 * Link Score Calculator
 * 
 * Calculates a comprehensive Link Score for pages based on:
 * 1. Number of internal links pointing to the page (inlinks)
 * 2. Quality & position of those links (menu, content, footer)
 * 3. Crawl depth (closer to homepage = stronger)
 * 4. Authority of linking pages (their link scores)
 * 
 * Link Score Range: 0-100
 */

export interface LinkData {
    sourcePageId: number;
    targetPageId: number;
    position: string | null;
    sourcePageScore?: number;
    sourceCrawlDepth?: number;
}

export interface PageLinkInfo {
    pageId: number;
    url: string;
    crawlDepth: number;
    inlinks: LinkData[];
}

/**
 * Position weights for link quality scoring
 * Higher weight = more important position
 */
const POSITION_WEIGHTS: Record<string, number> = {
    'Header': 1.5,
    'Navigation': 1.5,
    'Main': 1.0,
    'Sidebar': 0.7,
    'Footer': 0.5,
    'Unknown': 0.3
};

/**
 * Calculate base score from inlink count
 * Uses logarithmic scale to prevent extreme scores
 */
function calculateInlinkScore(inlinkCount: number): number {
    if (inlinkCount === 0) return 0;
    
    // Logarithmic scale: score increases slower as inlinks grow
    // 1 inlink = ~20, 5 inlinks = ~35, 10 inlinks = ~40, 50 inlinks = ~50, 100+ inlinks = ~55
    return Math.min(55, 20 + Math.log10(inlinkCount + 1) * 17.5);
}

/**
 * Calculate quality bonus based on link positions
 */
function calculatePositionBonus(inlinks: LinkData[]): number {
    if (inlinks.length === 0) return 0;
    
    let totalWeight = 0;
    let maxPossibleWeight = 0;
    
    for (const link of inlinks) {
        const position = link.position || 'Unknown';
        const weight = POSITION_WEIGHTS[position] || POSITION_WEIGHTS['Unknown'];
        totalWeight += weight;
        maxPossibleWeight += POSITION_WEIGHTS['Header']; // Max possible
    }
    
    // Position bonus: 0-15 points based on average link quality
    const qualityRatio = totalWeight / maxPossibleWeight;
    return qualityRatio * 15;
}

/**
 * Calculate crawl depth bonus
 * Pages closer to homepage get higher scores
 */
function calculateDepthBonus(crawlDepth: number): number {
    if (crawlDepth === undefined || crawlDepth === null) return 5;
    
    // Depth 0 (homepage) = 15 points
    // Depth 1 = 12 points
    // Depth 2 = 9 points
    // Depth 3 = 6 points
    // Depth 4+ = 3 points
    if (crawlDepth === 0) return 15;
    if (crawlDepth === 1) return 12;
    if (crawlDepth === 2) return 9;
    if (crawlDepth === 3) return 6;
    return 3;
}

/**
 * Calculate authority bonus from linking pages
 * Pages that receive links from high-scoring pages get bonus points
 */
function calculateAuthorityBonus(inlinks: LinkData[]): number {
    if (inlinks.length === 0) return 0;
    
    let totalAuthority = 0;
    let linksWithScore = 0;
    
    for (const link of inlinks) {
        if (link.sourcePageScore !== undefined && link.sourcePageScore !== null) {
            totalAuthority += link.sourcePageScore;
            linksWithScore++;
        }
    }
    
    if (linksWithScore === 0) return 5; // Default bonus if no scores available
    
    // Authority bonus: 0-15 points based on average authority of linking pages
    const averageAuthority = totalAuthority / linksWithScore;
    return (averageAuthority / 100) * 15;
}

/**
 * Calculate comprehensive Link Score for a page
 * 
 * @param pageInfo - Page information including inlinks and crawl depth
 * @returns Link Score (0-100)
 */
export function calculateLinkScore(pageInfo: PageLinkInfo): number {
    const { inlinks, crawlDepth } = pageInfo;
    
    // Component 1: Base score from inlink count (0-55 points)
    const inlinkScore = calculateInlinkScore(inlinks.length);
    
    // Component 2: Position quality bonus (0-15 points)
    const positionBonus = calculatePositionBonus(inlinks);
    
    // Component 3: Crawl depth bonus (0-15 points)
    const depthBonus = calculateDepthBonus(crawlDepth);
    
    // Component 4: Authority bonus (0-15 points)
    const authorityBonus = calculateAuthorityBonus(inlinks);
    
    // Total score: max 100 points
    const totalScore = Math.min(100, 
        inlinkScore + positionBonus + depthBonus + authorityBonus
    );
    
    // Round to 2 decimal places
    return Math.round(totalScore * 100) / 100;
}

/**
 * Calculate Link Scores for all pages in a session
 * Uses iterative approach to account for authority propagation
 * 
 * @param pages - Array of page information with their inlinks
 * @param iterations - Number of iterations for authority propagation (default: 2)
 * @returns Map of pageId to Link Score
 */
export function calculateLinkScoresForSession(
    pages: PageLinkInfo[],
    iterations: number = 2
): Map<number, number> {
    const scores = new Map<number, number>();
    
    // Initial calculation without authority
    for (const page of pages) {
        const score = calculateLinkScore(page);
        scores.set(page.pageId, score);
    }
    
    // Iteratively refine scores with authority propagation
    for (let i = 0; i < iterations; i++) {
        const newScores = new Map<number, number>();
        
        for (const page of pages) {
            // Update inlink data with current scores
            const enrichedInlinks = page.inlinks.map(link => ({
                ...link,
                sourcePageScore: scores.get(link.sourcePageId) || 0
            }));
            
            const enrichedPage = { ...page, inlinks: enrichedInlinks };
            const score = calculateLinkScore(enrichedPage);
            newScores.set(page.pageId, score);
        }
        
        // Update scores for next iteration
        for (const [pageId, score] of newScores.entries()) {
            scores.set(pageId, score);
        }
    }
    
    return scores;
}

/**
 * Get Link Score category/rating
 */
export function getLinkScoreRating(score: number): string {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    if (score >= 20) return 'Weak';
    return 'Very Weak';
}

/**
 * Get Link Score insights
 */
export function getLinkScoreInsights(pageInfo: PageLinkInfo, score: number): string[] {
    const insights: string[] = [];
    
    if (score < 20) {
        insights.push('⚠️ Very low link score - this page may be difficult to discover');
    }
    
    if (pageInfo.inlinks.length === 0) {
        insights.push('❌ No internal links pointing to this page (orphan page)');
    } else if (pageInfo.inlinks.length < 3) {
        insights.push('⚠️ Very few internal links - consider adding more');
    }
    
    if (pageInfo.crawlDepth > 3) {
        insights.push('⚠️ Page is deep in site hierarchy - consider moving closer to homepage');
    }
    
    const mainLinks = pageInfo.inlinks.filter(l => l.position === 'Main').length;
    const navLinks = pageInfo.inlinks.filter(l => l.position === 'Navigation' || l.position === 'Header').length;
    
    if (navLinks === 0 && score < 50) {
        insights.push('💡 Consider adding this page to main navigation');
    }
    
    if (mainLinks < pageInfo.inlinks.length * 0.3 && pageInfo.inlinks.length > 5) {
        insights.push('💡 Most links are from headers/footers - add more contextual content links');
    }
    
    if (score >= 70) {
        insights.push('✅ Strong link profile - this page is well-integrated');
    }
    
    return insights;
}
