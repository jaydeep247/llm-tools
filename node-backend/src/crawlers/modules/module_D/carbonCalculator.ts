/**
 * Module D - Carbon Footprint Calculation
 */

import { Logger } from '../../../helpers/logging/Logger.js';
import { getDatabase } from '../../../services/DatabaseService.js';
import { calculateCarbon } from '../../../helpers/module_A/carbon/carbonCalculator.js';
import { fetchResourceSizes } from '../../../helpers/module_A/carbon/resourceSizer.js';

const logger = Logger.getInstance();

export type ResourceSet = {
    css: Array<{ url: string }>;
    js: Array<{ url: string }>;
    images: Array<{ url: string }>;
};

export async function calculatePageCarbonFootprint(
    pageId: number,
    url: string,
    pageSize: number,
    resources: ResourceSet
): Promise<void> {
    try {
        const db = getDatabase();

        // Extract all resource URLs
        const resourceUrls: string[] = [
            ...resources.css.map(r => r.url),
            ...resources.js.map(r => r.url),
            ...resources.images.map(r => r.url)
        ];

        // Fetch sizes for resources
        const { totalBytes: resourcesSize } = await fetchResourceSizes(resourceUrls);

        const totalTransferredBytes = pageSize + resourcesSize;

        // Calculate CO2 and rating
        const carbonResult = calculateCarbon(totalTransferredBytes);

        // Update page in DB
        await db.updatePageCarbon(pageId, {
            transferredBytes: pageSize,
            totalTransferredBytes,
            co2Mg: carbonResult.co2Mg,
            carbonRating: carbonResult.rating
        });

        logger.debug(`Carbon metrics for ${url}: Rating=${carbonResult.rating}, CO2=${carbonResult.co2Mg}mg, Total=${totalTransferredBytes}b`);
    } catch (error) {
        logger.error(`Failed to calculate carbon metrics for ${url}`, error as Error);
    }
}
