import asyncio
import httpx
from typing import List, Dict, Any, Optional
from datetime import datetime
import re
from bs4 import BeautifulSoup
from app.core.config import settings


class ScraperService:
    """Service for scraping leads from various platforms."""
    
    def __init__(self):
        self.timeout = 30.0
        self.user_agents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ]
    
    async def search_all_platforms(
        self, 
        keywords: str, 
        ai_context: str,
        platforms: List[str],
        location: Optional[str] = None,
        industry: Optional[str] = None,
        max_results: int = 50
    ) -> List[Dict[str, Any]]:
        """Search for leads across all specified platforms."""
        
        all_leads = []
        
        # Define platform-specific search strategies
        platform_handlers = {
            "linkedin": self._search_linkedin,
            "instagram": self._search_instagram,
            "facebook": self._search_facebook,
            "twitter": self._search_twitter,
        }
        
        # Run platform searches in parallel
        tasks = []
        for platform in platforms:
            if platform in platform_handlers:
                handler = platform_handlers[platform]
                tasks.append(
                    handler(keywords, ai_context, location, industry, max_results)
                )
        
        if tasks:
            results = await asyncio.gather(*tasks)
            for result in results:
                all_leads.extend(result)
        
        # Limit results
        return all_leads[:max_results]
    
    async def _search_linkedin(
        self, 
        keywords: str, 
        ai_context: str,
        location: Optional[str] = None,
        industry: Optional[str] = None,
        max_results: int = 20
    ) -> List[Dict[str, Any]]:
        """Search LinkedIn for leads."""
        
        leads = []
        
        try:
            # Build search query
            search_parts = [keywords]
            if location:
                search_parts.append(f"location:{location}")
            if industry:
                search_parts.append(f"industry:{industry}")
            
            search_query = " ".join(search_parts)
            
            # Simulate LinkedIn search (mock data for now)
            # In production, use LinkedIn API or a dedicated scraper
            mock_leads = self._generate_mock_leads("LinkedIn", 5)
            leads.extend(mock_leads)
            
            return leads
            
        except Exception as e:
            print(f"LinkedIn search error: {e}")
            return []
    
    async def _search_instagram(
        self, 
        keywords: str, 
        ai_context: str,
        location: Optional[str] = None,
        industry: Optional[str] = None,
        max_results: int = 20
    ) -> List[Dict[str, Any]]:
        """Search Instagram for leads."""
        
        leads = []
        
        try:
            # Instagram profile scraping logic
            # In production, use Instagram Graph API or dedicated scraper
            mock_leads = self._generate_mock_leads("Instagram", 5)
            leads.extend(mock_leads)
            
            return leads
            
        except Exception as e:
            print(f"Instagram search error: {e}")
            return []
    
    async def _search_facebook(
        self, 
        keywords: str, 
        ai_context: str,
        location: Optional[str] = None,
        industry: Optional[str] = None,
        max_results: int = 20
    ) -> List[Dict[str, Any]]:
        """Search Facebook for leads."""
        
        leads = []
        
        try:
            # Facebook page/group scraping logic
            # In production, use Facebook Graph API or dedicated scraper
            mock_leads = self._generate_mock_leads("Facebook", 5)
            leads.extend(mock_leads)
            
            return leads
            
        except Exception as e:
            print(f"Facebook search error: {e}")
            return []
    
    async def _search_twitter(
        self, 
        keywords: str, 
        ai_context: str,
        location: Optional[str] = None,
        industry: Optional[str] = None,
        max_results: int = 20
    ) -> List[Dict[str, Any]]:
        """Search Twitter for leads."""
        
        leads = []
        
        try:
            # Twitter profile scraping logic
            # In production, use Twitter API v2 or dedicated scraper
            mock_leads = self._generate_mock_leads("Twitter", 5)
            leads.extend(mock_leads)
            
            return leads
            
        except Exception as e:
            print(f"Twitter search error: {e}")
            return []
    
    def _generate_mock_leads(self, source: str, count: int) -> List[Dict[str, Any]]:
        """Generate mock leads for demonstration."""
        
        mock_names = [
            "Sarah Chen", "Michael Torres", "Jessica Park", "David Kim", 
            "Emily Foster", "James Sterling", "Lisa Wong", "John Smith",
            "Emma Johnson", "Robert Williams", "Amanda Brown", "Daniel Jones"
        ]
        
        mock_companies = [
            "TechCorp", "InnovateLabs", "GrowthHub", "NextWave", 
            "Visionary", "Pioneer", "Elevate", "Summit",
            "Nexus", "Vertex", "Apex", "Quantum"
        ]
        
        mock_positions = [
            "CEO", "Marketing Director", "Sales Manager", "Product Lead",
            "Founder", "CTO", "CMO", "VP of Sales",
            "COO", "CFO", "Head of Growth", "Business Developer"
        ]
        
        leads = []
        import random
        
        for i in range(count):
            name = random.choice(mock_names)
            company = random.choice(mock_companies)
            
            leads.append({
                "name": name,
                "email": f"{name.lower().replace(' ', '.')}@{company.lower()}.com",
                "company": company,
                "position": random.choice(mock_positions),
                "source": source,
                "location": random.choice(["New York, NY", "San Francisco, CA", "London, UK", "Austin, TX", "Seattle, WA"]),
                "industry": random.choice(["Technology", "Finance", "Healthcare", "Retail", "Education"]),
                "linkedin_url": f"https://linkedin.com/in/{name.lower().replace(' ', '')}",
                "instagram_handle": f"@{name.lower().replace(' ', '_')}",
                "twitter_handle": f"@{name.lower().replace(' ', '')}",
                "notes": f"Found on {source}",
                "scraped_from": source,
                "source_url": f"https://{source.lower()}.com/search?q={name.replace(' ', '+')}"
            })
        
        return leads
    
    async def extract_email_from_text(self, text: str) -> Optional[str]:
        """Extract email address from text."""
        email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
        match = re.search(email_pattern, text)
        return match.group(0) if match else None
    
    async def extract_phone_from_text(self, text: str) -> Optional[str]:
        """Extract phone number from text."""
        phone_pattern = r'(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}'
        match = re.search(phone_pattern, text)
        return match.group(0) if match else None
    
    async def fetch_url_content(self, url: str) -> Optional[str]:
        """Fetch content from a URL."""
        try:
            import random
            async with httpx.AsyncClient(
                timeout=self.timeout,
                headers={
                    "User-Agent": random.choice(self.user_agents)
                }
            ) as client:
                response = await client.get(url)
                if response.status_code == 200:
                    return response.text
                return None
        except Exception as e:
            print(f"Error fetching URL {url}: {e}")
            return None
    
    async def extract_visible_text(self, html_content: str) -> str:
        """Extract visible text from HTML content."""
        soup = BeautifulSoup(html_content, 'html.parser')
        for script in soup(["script", "style"]):
            script.extract()
        text = soup.get_text()
        lines = (line.strip() for line in text.splitlines())
        chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
        text = ' '.join(chunk for chunk in chunks if chunk)
        return text