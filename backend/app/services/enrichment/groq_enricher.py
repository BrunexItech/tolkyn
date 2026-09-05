import os
import json
from typing import Dict, Any, Optional
from groq import Groq
from app.core.config import settings


class GroqEnricher:
    """Enrich lead data using Groq AI."""
    
    def __init__(self):
        self.client = Groq(api_key=settings.GROQ_API_KEY)
        self.model = "llama-3.1-8b-instant"
    
    async def generate_lead_score(self, lead_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate AI lead score."""
        
        prompt = f"""
        Analyze this lead and provide:
        1. A score from 0-100
        2. A rating: HOT, WARM, or COLD
        3. A brief summary (max 50 words)
        4. A recommendation (max 30 words)
        5. 3-5 intent signals
        
        Lead: {lead_data}
        """
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a lead scoring AI. Return ONLY valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=300,
            )
            
            result = json.loads(response.choices[0].message.content)
            return result
            
        except Exception as e:
            print(f"Groq error: {e}")
            return {
                "score": 50,
                "rating": "WARM",
                "summary": "Unable to score with AI",
                "recommendation": "Manual review required",
                "intent_signals": ["manual_review_needed"]
            }
    
    async def enrich_lead_data(self, lead_data: Dict[str, Any]) -> Dict[str, Any]:
        """Enrich lead data."""
        
        prompt = f"""
        Enrich this lead with professional insights:
        
        {lead_data}
        
        Provide:
        1. A professional summary
        2. Seniority level (entry/mid/senior/executive)
        3. Topics of interest (list)
        4. Outreach angle
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
            print(f"Groq enrichment error: {e}")
            return {
                "summary": lead_data.get('description', 'No description available'),
                "seniority": "unknown",
                "topics_of_interest": [],
                "outreach_angle": "General outreach recommended"
            }