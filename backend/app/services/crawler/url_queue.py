import queue
import threading
from typing import Optional, Tuple
from urllib.parse import urlparse


class URLQueue:
    """Thread-safe URL queue with depth tracking."""
    
    def __init__(self):
        self._queue = queue.Queue()
        self._seen_urls = set()
        self._lock = threading.Lock()
    
    def add_url(self, url: str, depth: int = 0) -> bool:
        """
        Add a URL to the queue if not already seen.
        Returns True if added, False if already seen.
        """
        # Normalize URL
        url = self._normalize_url(url)
        
        if not url:
            return False
        
        with self._lock:
            # Skip if already in queue or processed
            if url in self._seen_urls:
                return False
            
            self._seen_urls.add(url)
            self._queue.put((url, depth))
            return True
    
    def get_url(self) -> Tuple[str, int]:
        """
        Get the next URL from the queue with its depth.
        Blocks if queue is empty.
        """
        url, depth = self._queue.get(timeout=1.0)
        return url, depth
    
    def is_empty(self) -> bool:
        """Check if the queue is empty."""
        return self._queue.empty()
    
    def size(self) -> int:
        """Get the current queue size."""
        return self._queue.qsize()
    
    def clear(self) -> None:
        """Clear the queue and seen URLs."""
        with self._lock:
            self._queue = queue.Queue()
            self._seen_urls = set()
    
    def has_seen(self, url: str) -> bool:
        """Check if a URL has already been seen."""
        url = self._normalize_url(url)
        if not url:
            return True
        with self._lock:
            return url in self._seen_urls
    
    def _normalize_url(self, url: str) -> Optional[str]:
        """Normalize URL by removing fragments and trailing slashes."""
        if not url:
            return None
        
        try:
            parsed = urlparse(url)
            
            # Only handle http/https
            if parsed.scheme not in ('http', 'https'):
                return None
            
            # Reconstruct without fragment and trailing slash
            scheme = parsed.scheme
            netloc = parsed.netloc.lower()
            path = parsed.path.rstrip('/')
            
            if not path:
                path = '/'
            
            normalized = f"{scheme}://{netloc}{path}"
            
            # Add query string if present
            if parsed.query:
                normalized += f"?{parsed.query}"
            
            return normalized
            
        except Exception:
            return None
    
    def __len__(self) -> int:
        return self.size()
    
    def __contains__(self, url: str) -> bool:
        return self.has_seen(url)