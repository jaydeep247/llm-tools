"""
Pixel Width Calculator
Measures text width using Arial font rendering for the target font size.
This aligns with Screaming Frog/Google SERP style pixel-width calculations.
"""

from __future__ import annotations

from functools import lru_cache

try:
    from PIL import Image, ImageDraw, ImageFont
except Exception:  # pragma: no cover - optional dependency fallback
    Image = None
    ImageDraw = None
    ImageFont = None

# Character widths in pixels for Arial at 16px – measured from the system
# Arial.ttf via Pillow/FreeType2.  Only the final total is rounded.
_CHAR_WIDTHS: dict[str, float] = {
    ' ': 4.0,  '!': 4.0,  '"': 6.0,  '#': 9.0,  '$': 9.0,
    '%': 14.0, '&': 11.0, "'": 3.0,  '(': 5.0,  ')': 5.0,
    '*': 6.0,  '+': 9.0,  ',': 4.0,  '-': 5.0,  '.': 4.0,  '/': 4.0,
    '0': 9.0,  '1': 9.0,  '2': 9.0,  '3': 9.0,  '4': 9.0,
    '5': 9.0,  '6': 9.0,  '7': 9.0,  '8': 9.0,  '9': 9.0,
    ':': 4.0,  ';': 4.0,  '<': 9.0,  '=': 9.0,  '>': 9.0,  '?': 9.0,
    '@': 16.0,
    'A': 11.0, 'B': 11.0, 'C': 12.0, 'D': 12.0, 'E': 11.0,
    'F': 10.0, 'G': 12.0, 'H': 12.0, 'I': 4.0,  'J': 8.0,
    'K': 11.0, 'L': 9.0,  'M': 13.0, 'N': 12.0, 'O': 12.0,
    'P': 11.0, 'Q': 12.0, 'R': 12.0, 'S': 11.0, 'T': 10.0,
    'U': 12.0, 'V': 11.0, 'W': 15.0, 'X': 11.0, 'Y': 11.0, 'Z': 10.0,
    '[': 4.0,  '\\': 4.0, ']': 4.0,  '^': 8.0,  '_': 9.0,  '`': 5.0,
    'a': 9.0,  'b': 9.0,  'c': 8.0,  'd': 9.0,  'e': 9.0,
    'f': 4.0,  'g': 9.0,  'h': 9.0,  'i': 4.0,  'j': 4.0,
    'k': 8.0,  'l': 4.0,  'm': 13.0, 'n': 9.0,  'o': 9.0,
    'p': 9.0,  'q': 9.0,  'r': 5.0,  's': 8.0,  't': 4.0,
    'u': 9.0,  'v': 8.0,  'w': 12.0, 'x': 8.0,  'y': 8.0,  'z': 8.0,
    '{': 5.0,  '|': 4.0,  '}': 5.0,  '~': 9.0,
}

_DEFAULT_WIDTH: float = 9.0  # Fallback for unmapped characters


@lru_cache(maxsize=16)
def _get_arial_font(font_size: int):
    """Load Arial if available; return None when unavailable."""
    if ImageFont is None:
        return None

    candidates = (
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
        "Arial.ttf",
    )
    for path in candidates:
        try:
            return ImageFont.truetype(path, font_size)
        except Exception:
            continue
    return None


def _measure_with_font(text: str, font_size: int) -> int:
    """Measure rendered text width with PIL font metrics."""
    if Image is None or ImageDraw is None:
        return 0

    font = _get_arial_font(font_size)
    if font is None:
        return 0

    img = Image.new("RGB", (1, 1))
    draw = ImageDraw.Draw(img)
    # textlength gives sub-pixel precision with kerning.
    return int(round(draw.textlength(text, font=font)))


def calculate_pixel_width(text: str, font_size: float = 16.0) -> int:
    """
    Calculate approximate pixel width of text based on Arial character widths.
    The base table is calibrated for 16px; callers should pass the target
    font size (e.g. 20 for SERP titles, 14 for SERP descriptions).

    Args:
        text: The string to measure.
        font_size: Target font size in pixels (default 16).

    Returns:
        Estimated pixel width as an integer.
    """
    if not text:
        return 0

    target_size = int(round(font_size))
    rendered_width = _measure_with_font(text, target_size)
    if rendered_width > 0:
        return rendered_width

    # Fallback path when Pillow/Arial is unavailable.
    base_width = sum(_CHAR_WIDTHS.get(c, _DEFAULT_WIDTH) for c in text)
    return round(base_width * target_size / 16.0)
