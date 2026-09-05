import asyncio
import httpx
import time
from typing import List, Dict, Any, Optional, Set
from urllib.parse import urlparse, urljoin
from datetime import datetime
import random

from app.services.crawler.lead_extractor import LeadExtractor
from app.services.crawler.robots_parser import RobotsParser
from app.services.crawler.url_queue import URLQueue


class BaseCrawler:
    """Core web crawler for discovering and extracting lead data."""
    
    def __init__(
        self,
        max_pages: int = 50,
        max_depth: int = 2,
        delay: float = 1.0,
        timeout: float = 30.0,
        user_agent: str = None
    ):
        self.max_pages = max_pages
        self.max_depth = max_depth
        self.delay = delay
        self.timeout = timeout
        self.user_agent = user_agent or self._get_random_user_agent()
        
        self.url_queue = URLQueue()
        self.visited_urls: Set[str] = set()
        self.extracted_leads: List[Dict[str, Any]] = []
        self.extractor = LeadExtractor()
        self.robots_parser = RobotsParser()
        
        self.processed_count = 0
        self.start_time = None
        
    def _get_random_user_agent(self) -> str:
        """Get a random user agent."""
        user_agents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
        ]
        return random.choice(user_agents)
    
    async def crawl(self, start_url: str) -> List[Dict[str, Any]]:
        """
        Start crawling from a given URL.
        """
        self.start_time = datetime.now()
        self.visited_urls = set()
        self.extracted_leads = []
        self.processed_count = 0
        
        # Ensure URL has scheme
        if not start_url.startswith(('http://', 'https://')):
            start_url = 'https://' + start_url
        
        self.url_queue.add_url(start_url, depth=0)
        
        print(f"[Crawler] Starting crawl from: {start_url}")
        print(f"[Crawler] Max pages: {self.max_pages}, Max depth: {self.max_depth}")
        
        # Check robots.txt
        await self.robots_parser.fetch_robots(start_url)
        
        async with httpx.AsyncClient(
            timeout=self.timeout,
            headers={"User-Agent": self.user_agent},
            follow_redirects=True,
        ) as client:
            
            while not self.url_queue.is_empty() and self.processed_count < self.max_pages:
                current_url, depth = self.url_queue.get_url()
                
                # Skip if already visited
                if current_url in self.visited_urls:
                    continue
                
                # Check if allowed by robots.txt
                if not self.robots_parser.is_allowed(current_url, self.user_agent):
                    print(f"[Crawler] Skipping {current_url} (robots.txt)")
                    self.visited_urls.add(current_url)
                    continue
                
                print(f"[Crawler] Fetching: {current_url} (depth: {depth})")
                
                try:
                    # Fetch the page
                    response = await client.get(current_url)
                    response.raise_for_status()
                    
                    # Check content type
                    content_type = response.headers.get('content-type', '')
                    if 'text/html' not in content_type.lower():
                        print(f"[Crawler] Skipping {current_url} (not HTML)")
                        self.visited_urls.add(current_url)
                        continue
                    
                    # Extract lead data
                    lead_data = self.extractor.extract_from_html(response.text, current_url)
                    
                    # Add source info
                    lead_data['crawled_at'] = datetime.now().isoformat()
                    lead_data['depth'] = depth
                    
                    # Save if has email or phone or company
                    if lead_data.get('emails') or lead_data.get('phones') or lead_data.get('company_name'):
                        self.extracted_leads.append(lead_data)
                        print(f"[Crawler] Found lead: {lead_data.get('company_name', 'Unknown')} "
                              f"- Emails: {len(lead_data.get('emails', []))} "
                              f"- Phones: {len(lead_data.get('phones', []))}")
                    
                    self.visited_urls.add(current_url)
                    self.processed_count += 1
                    
                    # Add new URLs to queue if depth allows
                    if depth < self.max_depth:
                        new_urls = lead_data.get('all_links', [])[:20]
                        for new_url in new_urls:
                            if new_url not in self.visited_urls:
                                if self._same_domain(current_url, new_url):
                                    self.url_queue.add_url(new_url, depth + 1)
                    
                    # Respect delay
                    await asyncio.sleep(self.delay + random.uniform(0, 0.5))
                    
                except httpx.TimeoutException:
                    print(f"[Crawler] Timeout: {current_url}")
                    self.visited_urls.add(current_url)
                    
                except httpx.HTTPStatusError as e:
                    print(f"[Crawler] HTTP Error {e.response.status_code}: {current_url}")
                    self.visited_urls.add(current_url)
                    
                except Exception as e:
                    print(f"[Crawler] Error: {current_url} - {e}")
                    self.visited_urls.add(current_url)
        
        elapsed = (datetime.now() - self.start_time).total_seconds()
        print(f"\n[Crawler] Crawl completed!")
        print(f"[Crawler] Pages processed: {self.processed_count}")
        print(f"[Crawler] Leads found: {len(self.extracted_leads)}")
        print(f"[Crawler] Time elapsed: {elapsed:.2f}s")
        
        return self.extracted_leads
    
    def _same_domain(self, url1: str, url2: str) -> bool:
        """Check if two URLs are from the same domain."""
        try:
            domain1 = urlparse(url1).netloc
            domain2 = urlparse(url2).netloc
            return domain1 == domain2
        except:
            return False
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get crawling statistics."""
        return {
            'processed_count': self.processed_count,
            'leads_found': len(self.extracted_leads),
            'visited_urls': len(self.visited_urls),
            'queue_size': self.url_queue.size(),
            'max_pages': self.max_pages,
            'max_depth': self.max_depth,
        }