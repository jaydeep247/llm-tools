"""
Pixel Width Calculator
Calculates approximate pixel width for text strings (Titles, Meta Descriptions)
Calibrated to match Screaming Frog / Google SERP rendering (Arial ~16px).
"""

# Average character widths in pixels for Arial 16px (Google SERP title font).
# Measured from font metrics and calibrated against Screaming Frog output.
_CHAR_WIDTHS = {
    ' ': 4, '!': 5, '"': 6, '#': 9, '$': 9, '%': 13, '&': 11, "'": 4,
    '(': 5, ')': 5, '*': 6, '+': 9, ',': 4, '-': 5, '.': 4, '/': 5,
    '0': 9, '1': 9, '2': 9, '3': 9, '4': 9, '5': 9, '6': 9, '7': 9,
    '8': 9, '9': 9, ':': 5, ';': 5, '<': 9, '=': 9, '>': 9, '?': 9,
    '@': 16,
    'A': 11, 'B': 11, 'C': 11, 'D': 11, 'E': 10, 'F': 9, 'G': 12,
    'H': 11, 'I': 4, 'J': 7, 'K': 11, 'L': 9, 'M': 13, 'N': 11,
    'O': 12, 'P': 10, 'Q': 12, 'R': 11, 'S': 10, 'T': 9, 'U': 11,
    'V': 10, 'W': 15, 'X': 10, 'Y': 10, 'Z': 10,
    '[': 5, '\\': 5, ']': 5, '^': 9, '_': 9, '`': 5,
    'a': 9, 'b': 9, 'c': 8, 'd': 9, 'e': 9, 'f': 5, 'g': 9,
    'h': 9, 'i': 4, 'j': 4, 'k': 8, 'l': 4, 'm': 13, 'n': 9,
    'o': 9, 'p': 9, 'q': 9, 'r': 5, 's': 8, 't': 5, 'u': 9,
    'v': 8, 'w': 12, 'x': 8, 'y': 8, 'z': 8,
    '{': 5, '|': 4, '}': 5, '~': 9,
}

_DEFAULT_WIDTH = 9  # Fallback for unmapped characters


def calculate_pixel_width(text: str, font_size: float = 16.0) -> int:
    """
    Calculate approximate pixel width of text based on Arial character widths.
    The base table is calibrated for 16px; callers should pass the target
    font size (e.g. 20 for SERP titles, 13 for SERP descriptions).

    Args:
        text: The string to measure.
        font_size: Target font size in pixels (default 16).

    Returns:
        Estimated pixel width as an integer.
    """
    if not text:
        return 0

    base_width = sum(_CHAR_WIDTHS.get(c, _DEFAULT_WIDTH) for c in text)
    return round(base_width * font_size / 16.0)
