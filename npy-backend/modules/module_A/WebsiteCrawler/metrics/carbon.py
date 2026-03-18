"""
Carbon Calculator
Calculates Carbon Footprint based on the Sustainable Web Design (SWD) model.
Constants calibrated to match Screaming Frog's output.

References:
  https://sustainablewebdesign.org/calculating-digital-emissions/
  Ember Climate – Global Electricity Review 2021
"""

from typing import Dict, Any

# Constants (Screaming-Frog-compatible)
KWH_PER_GB = 0.81              # Total system energy per GB transferred
CARBON_INTENSITY = 473          # gCO2 per kWh (Ember 2021 global average)
BYTES_PER_GB = 1_000_000_000   # Decimal gigabyte (SI), not binary (1024^3)


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

    # Convert bytes to GB (decimal / SI)
    gb = bytes_transferred / BYTES_PER_GB
    
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
