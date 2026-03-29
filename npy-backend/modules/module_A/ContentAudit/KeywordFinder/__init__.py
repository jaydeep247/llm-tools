"""
KeywordFinder — Public API

Usage
-----
    from ContentAudit.KeywordFinder import resolve_keywords, KeywordBundle

    bundle = await resolve_keywords(
        url="https://example.com/best-crm-software",
        html_content=html,
        main_keyword="",          # leave empty → auto-resolved
        title=title,
        h1=h1,
    )

    # Primary keyword resolved from all signals
    print(bundle.primary_keyword)

    # Google-ranked keywords for this URL (DataForSEO)
    print(bundle.ranked_keywords)

    # Semantically related keywords
    print(bundle.related_keywords)

    # Keywords extracted from page body (TF-IDF n-grams)
    print(bundle.on_page_keywords)

    # Question-format keywords ("how to X", "what is X")
    print(bundle.question_keywords)

    # Long-tail keywords (4+ words)
    print(bundle.long_tail_keywords)

    # Entity / brand / proper-noun keywords
    print(bundle.entity_keywords)

    # Full deduplicated union of all sources
    print(bundle.all_keywords)

    # Search intent classification:  C | I | T | N
    print(bundle.intent)

    # Content type: listicle | comparison | how-to | what | review | other
    print(bundle.post_category_type)
"""

from .finder import resolve_keywords, KeywordBundle

__all__ = ("resolve_keywords", "KeywordBundle")
