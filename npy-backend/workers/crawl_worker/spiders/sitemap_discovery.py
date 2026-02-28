"""
Sitemap Discovery Module
Discovers and parses XML sitemaps from websites
"""

import httpx
from typing import List, Dict, Any, Optional
from urllib.parse import urljoin, urlparse
import xml.etree.ElementTree as ET
from utils.logger import logger


class SitemapDiscovery:
    """Handles sitemap discovery and parsing"""
    
    SITEMAP_LOCATIONS = [
        '/sitemap.xml',
        '/sitemap_index.xml',
        '/sitemap1.xml',
        '/sitemap-index.xml',
    ]
    
    def __init__(self, timeout: int = 30):
        self.timeout = timeout
    
    async def discover_sitemaps(self, start_url: str) -> Dict[str, Any]:
        """
        Discover sitemaps from a website
        
        Returns:
            {
                'sitemap_urls': List[str],
                'discovered_urls': List[Dict],
                'errors': List[str]
            }
        """
        parsed_url = urlparse(start_url)
        base_url = f"{parsed_url.scheme}://{parsed_url.netloc}"
        
        sitemap_urls = []
        discovered_urls = []
        errors = []
        
        # Try robots.txt first
        robots_sitemaps = await self._check_robots_txt(base_url)
        sitemap_urls.extend(robots_sitemaps)
        
        # Try common sitemap locations
        if not sitemap_urls:
            for location in self.SITEMAP_LOCATIONS:
                sitemap_url = urljoin(base_url, location)
                if await self._check_sitemap_exists(sitemap_url):
                    sitemap_urls.append(sitemap_url)
                    break
        
        # Parse discovered sitemaps
        for sitemap_url in sitemap_urls:
            try:
                urls = await self._parse_sitemap(sitemap_url)
                discovered_urls.extend(urls)
            except Exception as e:
                error_msg = f"Error parsing sitemap {sitemap_url}: {str(e)}"
                logger.error(error_msg)
                errors.append(error_msg)
        
        return {
            'sitemap_urls': sitemap_urls,
            'discovered_urls': discovered_urls,
            'errors': errors
        }
    
    async def _check_robots_txt(self, base_url: str) -> List[str]:
        """Check robots.txt for sitemap declarations"""
        robots_url = urljoin(base_url, '/robots.txt')
        sitemap_urls = []
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
                response = await client.get(robots_url)
                if response.status_code == 200:
                    for line in response.text.split('\n'):
                        line = line.strip()
                        if line.lower().startswith('sitemap:'):
                            sitemap_url = line.split(':', 1)[1].strip()
                            sitemap_urls.append(sitemap_url)
        except Exception as e:
            logger.debug(f"Could not fetch robots.txt: {str(e)}")
        
        return sitemap_urls
    
    async def _check_sitemap_exists(self, sitemap_url: str) -> bool:
        """Check if a sitemap URL exists"""
        try:
            async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
                response = await client.head(sitemap_url)
                if response.status_code == 200:
                    return True
        except Exception:
            pass
        return False
    
    async def _parse_sitemap(self, sitemap_url: str) -> List[Dict[str, Any]]:
        """Parse a sitemap XML file"""
        urls = []
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
                response = await client.get(sitemap_url)
                response.raise_for_status()
                
                # Parse XML
                root = ET.fromstring(response.content)
                
                # Handle sitemap index
                if 'sitemapindex' in root.tag.lower():
                    return await self._parse_sitemap_index(root, sitemap_url)
                
                # Handle regular sitemap
                namespace = {'ns': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
                
                for url_elem in root.findall('.//ns:url', namespace):
                    url_data = {}
                    
                    loc = url_elem.find('ns:loc', namespace)
                    if loc is not None and loc.text:
                        url_data['url'] = loc.text
                    else:
                        continue
                    
                    lastmod = url_elem.find('ns:lastmod', namespace)
                    if lastmod is not None and lastmod.text:
                        url_data['last_modified'] = lastmod.text
                    
                    changefreq = url_elem.find('ns:changefreq', namespace)
                    if changefreq is not None and changefreq.text:
                        url_data['change_frequency'] = changefreq.text
                    
                    priority = url_elem.find('ns:priority', namespace)
                    if priority is not None and priority.text:
                        url_data['priority'] = priority.text
                    
                    url_data['source_sitemap'] = sitemap_url
                    urls.append(url_data)
                
        except Exception as e:
            logger.error(f"Error parsing sitemap {sitemap_url}: {str(e)}")
            raise
        
        return urls
    
    async def _parse_sitemap_index(self, root: ET.Element, index_url: str) -> List[Dict[str, Any]]:
        """Parse a sitemap index file"""
        all_urls = []
        namespace = {'ns': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
        
        for sitemap_elem in root.findall('.//ns:sitemap', namespace):
            loc = sitemap_elem.find('ns:loc', namespace)
            if loc is not None and loc.text:
                sitemap_url = loc.text
                try:
                    urls = await self._parse_sitemap(sitemap_url)
                    all_urls.extend(urls)
                except Exception as e:
                    logger.error(f"Error parsing nested sitemap {sitemap_url}: {str(e)}")
        
        return all_urls
