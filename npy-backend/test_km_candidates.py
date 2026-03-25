"""Quick smoke-test for keyword candidate helpers (no external deps)."""
import sys
sys.path.insert(0, ".")
import modules.module_A.ContentAudit.KeywordMetrics as km

# ── _sanitize_keyword ──────────────────────────────────────────────────────
assert km._sanitize_keyword("Best (AI) Tools: Now!") == "Best AI Tools Now"
assert km._sanitize_keyword("  hello   world  ") == "hello world"
assert km._sanitize_keyword("seo/tools") == "seotools"
assert km._sanitize_keyword("seo & content") == "seo content"
print("_sanitize_keyword: OK")

# ── _keyword_candidates ─────────────────────────────────────────────────────
# Each tuple: (input, expected core-candidate at index -1 or None)
tests = [
    # 3-word core should be the most specific useful phrase
    ("affiliate marketing services to get more revenue",   "affiliate marketing services"),
    ("top ai detection tools to adopt for your business",  "ai detection tools"),
    ("leading ai seo agencies to boost your rankings",     "ai seo agencies"),
    ("top ai seo tools and why you need to use them",      "ai seo tools"),
    ("digital marketing blog by experts at attrock.com",   "digital marketing blog"),
    ("10 best ai content marketing tools for businesses",  "ai content marketing"),
    # Short phrase — only 1 candidate
    ("digital marketing company", None),
    ("about us", None),
]
for kw, expected_core in tests:
    s = km._sanitize_keyword(kw)
    result = km._keyword_candidates(s)
    print(f"Input:  {kw!r}")
    for i, c in enumerate(result):
        print(f"  [{i}] {c!r}")
    assert all(isinstance(c, str) and c for c in result), "Empty candidate"
    assert len(result) == len(set(result)), "Duplicate candidates"
    if expected_core:
        assert expected_core in result, f"Expected core {expected_core!r} not in {result}"
    print()

print("_keyword_candidates: OK")
print("ALL TESTS PASSED")
