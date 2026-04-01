"""
Link Extractor
Extracts internal and external links with metadata.

Normalisation applied to every extracted URL:
  1. Strip whitespace
  2. Resolve relative → absolute via Scrapy urljoin
  3. Remove URL fragments (#section)
  4. Strip UTM / tracking query parameters
  5. Collapse redundant path slashes and strip trailing slash
  6. Lowercase scheme + host
  7. Normalise http → https

Filtering:
  - Skips mailto:, tel:, javascript:, empty, fragment-only hrefs
  - Skips <a> tags inside <script>, <style>, <noscript>, <template>,
    or elements with hidden/aria-hidden attributes
"""

import re
from scrapy.http import Response
from typing import Dict, Any, List
from urllib.parse import urlparse, urlunparse, parse_qs, urlencode

# Query parameters stripped before deduplication
_TRACKING_PARAMS = frozenset({
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "utm_id", "utm_source_platform", "utm_creative_format", "utm_marketing_tactic",
    "fbclid", "gclid", "gclsrc", "dclid", "msclkid", "twclid",
    "mc_cid", "mc_eid", "oly_anon_id", "oly_enc_id",
    "vero_id", "vero_conv", "_hsenc", "_hsmi", "hsa_cam",
    "ref", "ref_src",
})

# Tags whose descendant <a> elements are ignored
_IGNORED_ANCESTOR_TAGS = frozenset({"script", "style", "noscript", "template"})


def _normalize_url(url: str) -> str:
    """
    Canonical normalisation for a fully-resolved URL.

    Steps: lowercase host, https scheme, strip www, strip fragment,
    strip ALL query params, collapse double-slashes in path, strip
    trailing slash.
    """
    if not url:
        return url
    try:
        parsed = urlparse(url)
        scheme = "https"  # normalise http→https
        netloc = (parsed.netloc or "").lower()
        # Strip www. for consistent matching with inlink graph
        netloc = netloc.replace("www.", "", 1) if netloc.startswith("www.") else netloc
        path = re.sub(r"/+", "/", parsed.path) if parsed.path else "/"
        if path != "/" and path.endswith("/"):
            path = path[:-1]
        # Strip ALL query params for consistent inlink matching
        root = f"{scheme}://{netloc}/"
        clean = f"{scheme}://{netloc}{path}"
        if clean != root:
            clean = clean.rstrip("/")
        return clean
    except Exception:
        return url


def _is_hidden_element(sel) -> bool:
    """Return True if the Scrapy selector node or any ancestor is hidden."""
    style = (sel.attrib.get("style") or "").lower()
    if "display:none" in style.replace(" ", "") or "visibility:hidden" in style.replace(" ", ""):
        return True
    if sel.attrib.get("hidden") is not None:
        return True
    aria = (sel.attrib.get("aria-hidden") or "").lower()
    if aria == "true":
        return True
    return False


class LinkExtractor:
    """Extracts links from page with full URL normalisation."""

    @staticmethod
    def extract(response: Response, allowed_host: str, allow_subdomains: bool) -> List[Dict[str, Any]]:
        """
        Extract links from page.

        Args:
            response: Scrapy response object
            allowed_host: Base hostname for internal/external check
            allow_subdomains: Whether to allow subdomains

        Returns:
            List of link dictionaries with normalised target_url
        """
        links = []
        source_url = _normalize_url(response.url)

        for link in response.css("a[href]"):
            # ── Skip links inside non-content containers ──────────────────
            if _is_hidden_element(link):
                continue
            # Walk up via XPath to check for ignored ancestor tags
            ancestors = link.xpath("ancestor::*")
            skip = False
            for anc in ancestors:
                tag = anc.xpath("name()").get()
                if tag and tag.lower() in _IGNORED_ANCESTOR_TAGS:
                    skip = True
                    break
            if skip:
                continue

            href = link.css("::attr(href)").get()
            if not href:
                continue
            href = href.strip()
            if (
                not href
                or href.startswith("#")
                or href.startswith("javascript:")
                or href.startswith("mailto:")
                or href.startswith("tel:")
            ):
                continue

            # Resolve relative → absolute and normalise
            target_url = _normalize_url(response.urljoin(href))
            anchor_text = " ".join(link.css("::text").getall()).strip()
            rel = link.css("::attr(rel)").get() or ""

            is_internal = LinkExtractor._is_internal(
                target_url, allowed_host, allow_subdomains,
            )
            nofollow = "nofollow" in rel.lower()

            links.append({
                "source_url": source_url,
                "target_url": target_url,
                "is_internal": is_internal,
                "anchor_text": anchor_text,
                "nofollow": nofollow,
                "rel": rel,
            })

        # ── Additional link sources for comprehensive inlink graph ────────
        def _add_extra_link(href_raw, rel_tag=""):
            if not href_raw:
                return
            href_raw = href_raw.strip()
            if (
                not href_raw
                or href_raw.startswith("#")
                or href_raw.startswith("javascript:")
                or href_raw.startswith("mailto:")
                or href_raw.startswith("tel:")
            ):
                return
            t_url = _normalize_url(response.urljoin(href_raw))
            t_internal = LinkExtractor._is_internal(
                t_url, allowed_host, allow_subdomains,
            )
            links.append({
                "source_url": source_url,
                "target_url": t_url,
                "is_internal": t_internal,
                "anchor_text": "",
                "nofollow": False,
                "rel": rel_tag,
            })

        # Canonical tag
        for href in response.css("link[rel='canonical']::attr(href)").getall():
            _add_extra_link(href, "canonical")

        # Pagination (next / prev)
        for href in response.css("link[rel='next']::attr(href)").getall():
            _add_extra_link(href, "next")
        for href in response.css("link[rel='prev']::attr(href)").getall():
            _add_extra_link(href, "prev")

        # Hreflang alternates
        for href in response.css("link[rel='alternate']::attr(href)").getall():
            _add_extra_link(href, "alternate")

        # Form actions
        for action in response.css("form::attr(action)").getall():
            _add_extra_link(action, "form-action")

        # Iframes
        for src in response.css("iframe::attr(src)").getall():
            _add_extra_link(src, "iframe")

        # data-href / data-url attributes (JS-style links)
        for href in response.css("[data-href]::attr(data-href)").getall():
            _add_extra_link(href, "data-href")
        for href in response.css("[data-url]::attr(data-url)").getall():
            _add_extra_link(href, "data-url")

        # onclick handlers — extract URLs from location.href assignments
        for val in response.css("[onclick]::attr(onclick)").getall():
            for found_url in re.findall(r"location\.href=['\"]([^'\"]+)['\"]", val):
                _add_extra_link(found_url, "onclick")

        # Image map area tags
        for href in response.css("map area::attr(href)").getall():
            _add_extra_link(href, "area")

        # Meta refresh soft redirects
        meta_refresh = response.css(
            "meta[http-equiv='refresh']::attr(content)"
        ).get()
        if meta_refresh:
            for found_url in re.findall(r"url=([^\s;]+)", meta_refresh, re.IGNORECASE):
                _add_extra_link(found_url, "meta-refresh")

        # SVG anchor tags (both href and xlink:href)
        for href in response.css("svg a::attr(href)").getall():
            _add_extra_link(href, "svg")
        # xlink:href requires XPath — CSS namespace prefix crashes lxml
        for href in response.xpath("//*[local-name()='a']/@*[name()='xlink:href']").getall():
            _add_extra_link(href, "svg-xlink")

        # HTTP Link response header (canonical/pagination via header)
        link_header = response.headers.get("Link", b"").decode("utf-8", errors="ignore")
        if link_header:
            for found_url in re.findall(r"<([^>]+)>", link_header):
                _add_extra_link(found_url, "http-link-header")

        return links

    @staticmethod
    def _is_internal(url: str, allowed_host: str, allow_subdomains: bool) -> bool:
        """Check if URL is internal (same root domain)."""
        parsed = urlparse(url)
        url_host = parsed.netloc

        def normalize_host(h: str) -> str:
            h = h.lower()
            return h.replace("www.", "", 1) if h.startswith("www.") else h

        normalized_url_host = normalize_host(url_host)
        normalized_allowed_host = normalize_host(allowed_host)

        if allow_subdomains:
            return (
                normalized_url_host == normalized_allowed_host
                or normalized_url_host.endswith(f".{normalized_allowed_host}")
            )
        return normalized_url_host == normalized_allowed_host
