import re
import urllib.parse
from typing import List, Dict, Any, Optional, Set
from urllib.parse import urlparse, urljoin
from bs4 import BeautifulSoup
import tldextract


class LeadExtractor:
    """Extract lead data from HTML content."""
    
    # Email regex pattern
    EMAIL_PATTERN = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
    
    # Phone patterns (US/International)
    PHONE_PATTERNS = [
        r'\+?\d{1,3}[-.\s]?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}',
        r'\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}',
        r'\d{3}[-.\s]\d{3}[-.\s]\d{4}',
        r'\+\d{1,3}\s?\d{1,14}',
    ]
    
    # Social media patterns
    SOCIAL_PATTERNS = {
        'linkedin': r'(?:https?://)?(?:www\.)?linkedin\.com/(?:company|in)/[a-zA-Z0-9-]+',
        'instagram': r'(?:https?://)?(?:www\.)?instagram\.com/[a-zA-Z0-9_.]+',
        'facebook': r'(?:https?://)?(?:www\.)?facebook\.com/[a-zA-Z0-9.]+',
        'twitter': r'(?:https?://)?(?:www\.)?(?:twitter|x)\.com/[a-zA-Z0-9_]+',
        'youtube': r'(?:https?://)?(?:www\.)?youtube\.com/(?:c|channel|user)/[a-zA-Z0-9_-]+',
    }
    
    def __init__(self):
        self.visited_urls: Set[str] = set()
        self.discovered_leads: List[Dict[str, Any]] = []
    
    def extract_from_html(self, html: str, url: str) -> Dict[str, Any]:
        """Extract all lead data from HTML content."""
        
        soup = BeautifulSoup(html, 'html.parser')
        
        # Check if this is a Google search page
        is_google_search = 'google.com/search' in url
        
        result = {
            'url': url,
            'domain': self._extract_domain(url),
            'title': self._extract_title(soup),
            'description': self._extract_description(soup),
            'emails': self._extract_emails(html, soup),
            'phones': self._extract_phones(html),
            'company_name': self._extract_company_name(soup, url),
            'social_links': self._extract_social_links(soup),
            'meta_keywords': self._extract_meta_keywords(soup),
            'headers': self._extract_headers(soup),
            'all_links': self._extract_all_links(soup, url, is_google_search),
        }
        
        lead = self._create_lead(result)
        
        return lead
    
    def extract_google_search_links(self, html: str) -> List[str]:
        """Extract actual search result links from Google search page."""
        soup = BeautifulSoup(html, 'html.parser')
        links = []
        
        for link in soup.find_all('a', href=True):
            href = link.get('href', '')
            if href.startswith('/url?q='):
                parsed = urllib.parse.parse_qs(href)
                if 'q' in parsed:
                    actual_url = parsed['q'][0]
                    if actual_url.startswith('http') and 'google.com' not in actual_url:
                        links.append(actual_url)
        
        return links
    
    def _extract_domain(self, url: str) -> str:
        """Extract domain from URL."""
        try:
            extracted = tldextract.extract(url)
            return f"{extracted.domain}.{extracted.suffix}"
        except:
            return ""
    
    def _extract_title(self, soup: BeautifulSoup) -> str:
        """Extract page title."""
        title_tag = soup.find('title')
        if title_tag:
            return title_tag.get_text().strip()
        
        og_title = soup.find('meta', {'property': 'og:title'})
        if og_title:
            return og_title.get('content', '').strip()
        
        return ""
    
    def _extract_description(self, soup: BeautifulSoup) -> str:
        """Extract page description."""
        meta_desc = soup.find('meta', {'name': 'description'})
        if meta_desc:
            return meta_desc.get('content', '').strip()
        
        og_desc = soup.find('meta', {'property': 'og:description'})
        if og_desc:
            return og_desc.get('content', '').strip()
        
        first_p = soup.find('p')
        if first_p:
            text = first_p.get_text().strip()
            if len(text) > 50:
                return text
        
        return ""
    
    def _extract_emails(self, html: str, soup: BeautifulSoup) -> List[str]:
        """Extract all emails from HTML."""
        emails = set()
        
        matches = re.findall(self.EMAIL_PATTERN, html, re.IGNORECASE)
        for email in matches:
            if not email.startswith('example') and not email.endswith('.png'):
                emails.add(email.lower())
        
        mailto_links = soup.find_all('a', href=re.compile(r'^mailto:'))
        for link in mailto_links:
            href = link.get('href', '')
            if href.startswith('mailto:'):
                email = href.replace('mailto:', '').strip()
                if email and '@' in email:
                    emails.add(email.lower())
        
        return list(emails)
    
    def _extract_phones(self, html: str) -> List[str]:
        """Extract all phone numbers from HTML."""
        phones = set()
        
        for pattern in self.PHONE_PATTERNS:
            matches = re.findall(pattern, html)
            for phone in matches:
                cleaned = self._clean_phone(phone)
                if cleaned and len(cleaned) >= 10:
                    phones.add(cleaned)
        
        return list(phones)
    
    def _clean_phone(self, phone: str) -> str:
        """Clean and normalize phone number."""
        phone = phone.strip()
        phone = re.sub(r'[.\s-]', '', phone)
        phone = re.sub(r'[^0-9+]', '', phone)
        return phone
    
    def _extract_company_name(self, soup: BeautifulSoup, url: str) -> str:
        """Extract company name from page."""
        og_site = soup.find('meta', {'property': 'og:site_name'})
        if og_site:
            return og_site.get('content', '').strip()
        
        brand = soup.find('meta', {'name': 'brand'})
        if brand:
            return brand.get('content', '').strip()
        
        title = self._extract_title(soup)
        if title:
            separators = [' | ', ' - ', ' — ', ' › ', ' :: ']
            for sep in separators:
                if sep in title:
                    parts = title.split(sep)
                    company = parts[0].strip()
                    if len(company) < 50:
                        return company
        
        domain = self._extract_domain(url)
        if domain:
            parts = domain.replace('.com', '').replace('.co', '').replace('.org', '').split('.')
            if parts:
                name = parts[0].replace('-', ' ').replace('_', ' ')
                return name.title()
        
        return ""
    
    def _extract_social_links(self, soup: BeautifulSoup) -> Dict[str, str]:
        """Extract social media links."""
        social_links = {}
        
        all_links = soup.find_all('a', href=True)
        
        for link in all_links:
            href = link.get('href', '')
            if not href:
                continue
            
            for platform, pattern in self.SOCIAL_PATTERNS.items():
                if re.search(pattern, href, re.IGNORECASE):
                    if not href.startswith('http'):
                        href = 'https://' + href
                    social_links[platform] = href
        
        return social_links
    
    def _extract_meta_keywords(self, soup: BeautifulSoup) -> List[str]:
        """Extract meta keywords."""
        meta_keywords = soup.find('meta', {'name': 'keywords'})
        if meta_keywords:
            content = meta_keywords.get('content', '')
            return [kw.strip() for kw in content.split(',') if kw.strip()]
        return []
    
    def _extract_headers(self, soup: BeautifulSoup) -> List[str]:
        """Extract all header text."""
        headers = []
        for h in ['h1', 'h2', 'h3']:
            for tag in soup.find_all(h):
                text = tag.get_text().strip()
                if text and len(text) < 200:
                    headers.append(text)
        return headers
    
    def _extract_all_links(self, soup: BeautifulSoup, base_url: str, is_google_search: bool = False) -> List[str]:
        """Extract all unique links from page."""
        links = set()
        
        # If Google search, extract actual result links
        if is_google_search:
            google_links = self.extract_google_search_links(str(soup))
            for link in google_links:
                links.add(link)
        
        # Also extract regular links
        for link in soup.find_all('a', href=True):
            href = link.get('href', '')
            if href and not href.startswith('#') and not href.startswith('javascript:'):
                absolute_url = urljoin(base_url, href)
                if absolute_url.startswith('http'):
                    # Skip Google internal links
                    if 'google.com' not in absolute_url:
                        links.add(absolute_url)
        
        return list(links)
    
    def _create_lead(self, extracted_data: Dict[str, Any]) -> Dict[str, Any]:
        """Convert extracted data into lead format."""
        
        primary_email = extracted_data['emails'][0] if extracted_data['emails'] else None
        primary_phone = extracted_data['phones'][0] if extracted_data['phones'] else None
        
        company_name = extracted_data['company_name']
        if not company_name:
            company_name = extracted_data['domain']
        
        social = extracted_data['social_links']
        
        return {
            'name': company_name,
            'company': company_name,
            'email': primary_email,
            'emails': extracted_data['emails'],
            'phone': primary_phone,
            'phones': extracted_data['phones'],
            'website': extracted_data['url'],
            'domain': extracted_data['domain'],
            'title': extracted_data['title'],
            'description': extracted_data['description'],
            'keywords': extracted_data['meta_keywords'],
            'social_links': social,
            'headers': extracted_data['headers'],
            'linkedin': social.get('linkedin'),
            'instagram': social.get('instagram'),
            'facebook': social.get('facebook'),
            'twitter': social.get('twitter'),
            'source': 'web_crawl',
            'source_url': extracted_data['url'],
            'all_links': extracted_data['all_links'],
        }