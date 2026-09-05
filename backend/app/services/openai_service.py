import json
from typing import Optional, List, Dict, Any
from openai import OpenAI
from app.core.config import settings


class OpenAIService:
    """Service for interacting with OpenAI API."""
    
    def __init__(self):
        self.client = OpenAI(api_key=settings.OPENAI_API_KEY)
        self.model = "gpt-4o-mini"
    
    async def generate_lead_score(self, lead_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate AI lead score and insights based on lead data."""
        
        prompt = f"""
        Analyze this lead and provide:
        1. A score from 0-100 (confidence level)
        2. A lead rating: HOT, WARM, or COLD
        3. A brief summary (max 50 words)
        4. A recommendation for next action (max 30 words)
        5. 3-5 intent signals detected (keywords/phrases)
        
        Lead Data:
        - Name: {lead_data.get('name', 'Unknown')}
        - Company: {lead_data.get('company', 'Unknown')}
        - Position: {lead_data.get('position', 'Unknown')}
        - Industry: {lead_data.get('industry', 'Unknown')}
        - Location: {lead_data.get('location', 'Unknown')}
        - Source: {lead_data.get('source', 'Unknown')}
        - Notes: {lead_data.get('notes', 'None provided')}
        
        Return ONLY valid JSON in this exact format:
        {{
            "score": 85,
            "rating": "HOT",
            "summary": "Brief summary here",
            "recommendation": "Recommendation here",
            "intent_signals": ["signal1", "signal2", "signal3"]
        }}
        """
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a lead scoring AI assistant. Return ONLY valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=300,
            )
            
            result = json.loads(response.choices[0].message.content)
            return result
            
        except Exception as e:
            print(f"OpenAI error: {e}")
            return {
                "score": 50,
                "rating": "WARM",
                "summary": "Unable to analyze lead",
                "recommendation": "Manual review required",
                "intent_signals": ["manual_review_needed"],
                "error": str(e)
            }
    
    async def generate_search_queries(self, keywords: str, ai_context: str) -> Dict[str, Any]:
        """Generate platform-specific search queries from natural language input."""
        
        prompt = f"""
        Given the following user input, generate search queries for LinkedIn, Instagram, Facebook, and Twitter.
        
        Keywords: {keywords}
        AI Context: {ai_context}
        
        Return ONLY valid JSON in this exact format:
        {{
            "linkedin": "specific LinkedIn search query",
            "instagram": "specific Instagram search query", 
            "facebook": "specific Facebook search query",
            "twitter": "specific Twitter search query"
        }}
        
        Make each query specific and optimized for that platform's search syntax.
        """
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a search query generator. Return ONLY valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.5,
                max_tokens=200,
            )
            
            result = json.loads(response.choices[0].message.content)
            return result
            
        except Exception as e:
            print(f"OpenAI search query error: {e}")
            return {
                "linkedin": keywords,
                "instagram": keywords,
                "facebook": keywords,
                "twitter": keywords,
                "error": str(e)
            }
    
    async def enrich_lead_data(self, raw_data: Dict[str, Any]) -> Dict[str, Any]:
        """Enrich raw scraped data with AI insights."""
        
        prompt = f"""
        Enrich this lead data with additional insights:
        
        Raw Data: {raw_data}
        
        Provide:
        1. A professional summary
        2. Estimated seniority level
        3. Key topics of interest
        4. Suggested outreach angle
        
        Return ONLY valid JSON in this exact format:
        {{
            "summary": "Professional summary here",
            "seniority": "entry/mid/senior/executive",
            "topics_of_interest": ["topic1", "topic2"],
            "outreach_angle": "Suggested outreach approach"
        }}
        """
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a lead enrichment assistant. Return ONLY valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.4,
                max_tokens=250,
            )
            
            result = json.loads(response.choices[0].message.content)
            return result
            
        except Exception as e:
            print(f"OpenAI enrichment error: {e}")
            return {
                "summary": raw_data.get('description', 'No description available'),
                "seniority": "unknown",
                "topics_of_interest": [],
                "outreach_angle": "General outreach recommended",
                "error": str(e)
            }