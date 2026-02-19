from typing import Set, List
from urllib.parse import urlparse, urlunparse, urlencode
from collections import deque

import requests
from bs4 import BeautifulSoup
from lxml import etree

from utils.logger import logger


def normalize_url(url: str) -> str:
    parsed = urlparse(url)
    scheme = "https"
    fragment = ""
    allowed_params: List[tuple[str, str]] = []
    query = urlencode(allowed_params)
    path = parsed.path.rstrip("/")
    if path == "":
        path = "/"
    return urlunparse(
        (
            scheme,
            parsed.netloc.lower(),
            path,
            "",
            query,
            fragment,
        )
    )


def get_sitemaps(start_url: str) -> List[str]:
    parsed = urlparse(start_url)
    base_url = f"{parsed.scheme}://{parsed.netloc}"
    robots_url = f"{base_url}/robots.txt"
    sitemaps: List[str] = []

    logger.info(f"Preflight: fetching robots.txt for {base_url}")

    try:
        r = requests.get(robots_url, timeout=5)
        if r.status_code == 200:
            for line in r.text.splitlines():
                if line.lower().startswith("sitemap:"):
                    sitemaps.append(line.split(":", 1)[1].strip())
            logger.info(f"Preflight: found {len(sitemaps)} sitemap entries in robots.txt for {base_url}")
        else:
            logger.info(f"Preflight: robots.txt returned status {r.status_code} for {base_url}")
    except Exception as e:
        logger.info(f"Preflight: error fetching robots.txt for {base_url}: {e}")

    if not sitemaps:
        default_sitemap = f"{base_url}/sitemap.xml"
        sitemaps.append(default_sitemap)
        logger.info(f"Preflight: no sitemaps in robots.txt, using default {default_sitemap}")

    return sitemaps


def parse_sitemap(url: str, discovered: Set[str], visited_sitemaps: Set[str]) -> None:
    if url in visited_sitemaps:
        return
    visited_sitemaps.add(url)

    logger.info(f"Preflight: parsing sitemap {url}")

    try:
        r = requests.get(url, timeout=5)
        if r.status_code != 200:
            logger.info(f"Preflight: sitemap {url} returned status {r.status_code}")
            return

        tree = etree.fromstring(r.content)
        ns = {"ns": "http://www.sitemaps.org/schemas/sitemap/0.9"}

        index_count = 0
        for loc in tree.xpath("//ns:sitemap/ns:loc", namespaces=ns):
            if loc.text:
                index_count += 1
                parse_sitemap(loc.text.strip(), discovered, visited_sitemaps)

        url_count_before = len(discovered)
        for loc in tree.xpath("//ns:url/ns:loc", namespaces=ns):
            if loc.text:
                discovered.add(normalize_url(loc.text.strip()))
        url_count_after = len(discovered)

        logger.info(
            f"Preflight: sitemap {url} added {url_count_after - url_count_before} URLs "
            f"(indexes={index_count}, total_now={url_count_after})"
        )
    except Exception as e:
        logger.info(f"Preflight: error parsing sitemap {url}: {e}")
        return


def discover_internal_links(start_url: str, discovered: Set[str]) -> None:
    queue: deque[tuple[str, int]] = deque([(start_url, 0)])
    visited: Set[str] = set()

    max_depth = 3
    max_urls = 5000

    domain = urlparse(start_url).netloc

    logger.info(
        f"Preflight: starting internal link discovery from {start_url} "
        f"(max_depth={max_depth}, max_urls={max_urls})"
    )

    next_log_threshold = 200

    while queue:
        url, depth = queue.popleft()

        if depth > max_depth:
            continue

        if url in visited:
            continue

        visited.add(url)

        try:
            r = requests.get(url, timeout=5)
            if r.status_code != 200:
                continue

            soup = BeautifulSoup(r.text, "lxml")
            for a in soup.select("a[href]"):
                href = a["href"]
                abs_url = normalize_url(requests.compat.urljoin(url, href))

                if urlparse(abs_url).netloc != domain:
                    continue

                if abs_url in discovered:
                    continue

                discovered.add(abs_url)

                if len(discovered) >= max_urls:
                    logger.info(
                        f"Preflight: reached max_urls={max_urls}, stopping internal link discovery "
                        f"for {start_url}"
                    )
                    return

                if len(discovered) >= next_log_threshold:
                    logger.info(
                        f"Preflight: discovered {len(discovered)} URLs so far during internal discovery "
                        f"for {start_url}"
                    )
                    next_log_threshold += 200

                queue.append((abs_url, depth + 1))
        except Exception:
            continue

    logger.info(
        f"Preflight: internal link discovery finished for {start_url}, "
        f"total URLs={len(discovered)}"
    )


def preflight_discover_all_urls(start_url: str) -> Set[str]:
    logger.info(f"Preflight: starting URL discovery for {start_url}")

    discovered: Set[str] = set()

    normalized_start = normalize_url(start_url)
    discovered.add(normalized_start)

    visited_sitemaps: Set[str] = set()
    for sitemap in get_sitemaps(start_url):
        logger.info(f"Preflight: processing sitemap entry {sitemap}")
        parse_sitemap(sitemap, discovered, visited_sitemaps)

    logger.info(
        f"Preflight: after sitemaps, discovered {len(discovered)} URLs for {start_url}"
    )

    discover_internal_links(normalized_start, discovered)

    logger.info(
        f"Preflight: completed URL discovery for {start_url}, total unique URLs={len(discovered)}"
    )

    return discovered
