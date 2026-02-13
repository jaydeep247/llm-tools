"""
Carbon Calculator
Calculates Carbon Footprint based on Sustainable Web Design model.
Ported from node-backend/src/helpers/module_A/carbon/carbonCalculator.ts
"""

from typing import Dict, Any

# Constants
KWH_PER_GB = 0.81
CARBON_INTENSITY = 442  # g per kWh


def get_carbon_rating(co2_grams: float) -> str:
    """
    Get Carbon Rating based on CO2 emissions (grams).
    Data based on digitalcarbonratings.com / websitecarbon.com benchmarks.
    """
    if co2_grams < 0.095: return 'A+'
    if co2_grams < 0.186: return 'A'
    if co2_grams < 0.341: return 'B'
    if co2_grams < 0.493: return 'C'
    if co2_grams < 0.656: return 'D'
    if co2_grams < 0.850: return 'E'
    return 'F'


def calculate_carbon(bytes_transferred: int) -> Dict[str, Any]:
    """
    Calculate Carbon Footprint from total bytes transferred.
    
    Args:
        bytes_transferred: Total bytes (HTML + resources).
        
    Returns:
        Dictionary containing co2_mg, co2_grams, and rating.
    """
    if bytes_transferred <= 0:
        return {
            'co2_mg': 0.0,
            'co2_grams': 0.0,
            'rating': 'A+'
        }

    # Convert bytes to GB
    gb = bytes_transferred / (1024 * 1024 * 1024)
    
    # Energy in kWh
    energy_kwh = gb * KWH_PER_GB
    
    # Calculate CO2 in grams
    co2_grams = energy_kwh * CARBON_INTENSITY
    
    # Calculate CO2 in milligrams
    co2_mg = co2_grams * 1000
    
    return {
        'co2_mg': round(co2_mg, 2),
        'co2_grams': round(co2_grams, 3),
        'rating': get_carbon_rating(co2_grams)
    }
