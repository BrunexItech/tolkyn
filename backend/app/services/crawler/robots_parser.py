import httpx
import re
from typing import Dict, Set, Optional
from urllib.parse import urlparse, urljoin
from collections import defaultdict


class RobotsParser:
    """Parse and respect robots.txt rules."""
    
    def __init__(self):
        self.rules: Dict[str, Dict[str, Set[str]]] = {}
        self.sitemaps: Set[str] = set()
        self.crawl_delays: Dict[str, float] = {}
        self.fetched_domains: Set[str] = set()
    
    async def fetch_robots(self, base_url: str) -> None:
        """Fetch and parse robots.txt for a domain."""
        parsed = urlparse(base_url)
        domain = parsed.netloc
        
        # Skip if already fetched
        if domain in self.fetched_domains:
            return
        
        scheme = parsed.scheme or "https"
        robots_url = f"{scheme}://{domain}/robots.txt"
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(robots_url)
                if response.status_code == 200:
                    self._parse_robots(response.text, domain)
                else:
                    self._allow_all(domain)
                    
        except Exception as e:
            print(f"[RobotsParser] Error fetching {robots_url}: {e}")
            self._allow_all(domain)
        
        self.fetched_domains.add(domain)
    
    def _parse_robots(self, content: str, domain: str) -> None:
        """Parse robots.txt content."""
        lines = content.splitlines()
        
        current_user_agent = "*"
        self.rules[domain] = {}
        self.rules[domain][current_user_agent] = set()
        
        for line in lines:
            line = line.strip()
            
            if not line or line.startswith('#'):
                continue
            
            if ': ' in line:
                key, value = line.split(': ', 1)
            elif ':' in line:
                key, value = line.split(':', 1)
            else:
                continue
            
            key = key.lower().strip()
            value = value.strip()
            
            if key == 'user-agent':
                current_user_agent = value
                if current_user_agent not in self.rules[domain]:
                    self.rules[domain][current_user_agent] = set()
            
            elif key == 'disallow':
                if current_user_agent:
                    self.rules[domain][current_user_agent].add(value)
            
            elif key == 'allow':
                if current_user_agent:
                    if current_user_agent not in self.rules[domain]:
                        self.rules[domain][current_user_agent] = set()
                    self.rules[domain][current_user_agent].add(f"allow:{value}")
            
            elif key == 'sitemap':
                self.sitemaps.add(value)
            
            elif key == 'crawl-delay':
                try:
                    self.crawl_delays[domain] = float(value)
                except ValueError:
                    pass
    
    def _allow_all(self, domain: str) -> None:
        """Allow all URLs for a domain."""
        self.rules[domain] = {"*": set()}
    
    def is_allowed(self, url: str, user_agent: str = "*") -> bool:
        """Check if a URL is allowed by robots.txt."""
        domain = urlparse(url).netloc
        
        if domain not in self.rules:
            return True
        
        rules = self.rules[domain]
        
        user_agent_rule = None
        
        if user_agent in rules:
            user_agent_rule = rules[user_agent]
        elif "*" in rules:
            user_agent_rule = rules["*"]
        else:
            return True
        
        if not user_agent_rule:
            return True
        
        path = urlparse(url).path
        
        for rule in user_agent_rule:
            if rule.startswith("allow:"):
                continue
            
            rule_pattern = rule.replace('*', '.*')
            
            if rule_pattern and re.search(rule_pattern, path):
                allow_rule = f"allow:{rule}"
                if allow_rule in user_agent_rule:
                    continue
                return False
        
        return True
    
    def get_crawl_delay(self, domain: str) -> float:
        """Get crawl delay for a domain."""
        return self.crawl_delays.get(domain, 1.0)
    
    def get_sitemaps(self) -> Set[str]:
        """Get all sitemap URLs found."""
        return self.sitemaps