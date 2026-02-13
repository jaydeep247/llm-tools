"""
Pixel Width Calculator
Calculates approximate pixel width for text strings (Titles, Meta Descriptions)
Ported from node-backend/src/helpers/module_A/pageMetrics/titleExtractor.ts
"""

def calculate_pixel_width(text: str) -> int:
    """
    Calculate approximate pixel width of text based on character widths.
    
    Args:
        text: The string to measure.
        
    Returns:
        Estimated pixel width as an integer.
    """
    if not text:
        return 0
        
    width = 0
    for char in text:
        # Approximate character widths (in pixels) based on common fonts (e.g., Arial 16px)
        if char == ' ':
            width += 3
        elif char in 'iIl1.,;:\'-':
            width += 4
        elif char in 'fjtJ':
            width += 5
        elif 'a' <= char <= 'z':
            width += 6
        elif 'A' <= char <= 'Z':
            width += 7
        elif char in 'wWmM':
            width += 9
        else:
            width += 6  # default
            
    return round(width)
