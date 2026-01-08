/**
 * Carbon Calculator
 * Based on Sustainable Web Design model.
 * 
 * Constants derived from various studies:
 * - 0.81 kWh/GB for data transfer (energy intensity of web data)
 * - 442g CO2/kWh (global grid average carbon intensity)
 * 
 * Formula:
 * Carbon (g) = Data (GB) * Energy (kWh/GB) * Carbon Intensity (g/kWh)
 * 
 * Simplified for KB/MB inputs:
 * 1 byte = X grams of CO2
 */

// Constants
const KWH_PER_GB = 0.81;
const CARBON_INTENSITY = 442; // g per kWh
const RETURNING_VISITOR_PERCENTAGE = 0.75; // Approx 75% are returning visitors (caching)
const FIRST_VISIT_PERCENTAGE = 0.25; // 25% are new visitors (full load)

export interface CarbonResult {
    co2Mg: number;       // CO2 in milligrams
    co2Grams: number;    // CO2 in grams
    rating: string;      // Carbon Rating (A+, A, B...)
}

/**
 * Calculate Carbon Footprint from total bytes transferred
 * @param bytes Total bytes transferred (HTML + resources)
 * @param isFirstVisit Whether to calculate for first visit (no cache) or adjusted average. Default is true (worst case/full load).
 */
export function calculateCarbon(bytes: number, isFirstVisit: boolean = true): CarbonResult {
    if (bytes <= 0) {
        return { co2Mg: 0, co2Grams: 0, rating: 'A+' };
    }

    // Convert bytes to GB
    const gb = bytes / (1024 * 1024 * 1024);
    
    // Energy in kWh
    let energyKwh = gb * KWH_PER_GB;
    
    // If we want to simulate "average" visit (factoring in caching), we might adjust here.
    // For this feature, we likely want "What does it cost to load this page fully?", so we use full load.
    // However, some calculators apply a factor for "data center vs device vs network".
    // The 0.81 figure often includes everything.
    
    // Calculate CO2 in grams
    const co2Grams = energyKwh * CARBON_INTENSITY;
    
    // Calculate CO2 in milligrams
    const co2Mg = co2Grams * 1000;
    
    return {
        co2Mg: parseFloat(co2Mg.toFixed(2)),
        co2Grams: parseFloat(co2Grams.toFixed(3)),
        rating: getCarbonRating(co2Grams)
    };
}

/**
 * Get Carbon Rating based on CO2 emissions (grams)
 * Data based on digitalcarbonratings.com / websitecarbon.com benchmarks
 */
export function getCarbonRating(co2Grams: number): string {
    // 50th percentile is roughly 0.5g per page view
    // 10th percentile is roughly 0.095g
    
    if (co2Grams < 0.095) return 'A+';
    if (co2Grams < 0.186) return 'A';
    if (co2Grams < 0.341) return 'B';
    if (co2Grams < 0.493) return 'C';
    if (co2Grams < 0.656) return 'D';
    if (co2Grams < 0.850) return 'E';
    return 'F';
}
