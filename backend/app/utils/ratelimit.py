"""Small in-process sliding-window limiter.

Good enough for one API process (the default deployment). With several API replicas, move this to
Redis (INCR + EXPIRE) so limits are shared — listed in the roadmap."""
import threading
import time
from collections import defaultdict, deque


class SlidingWindow:
    def __init__(self, limit: int, window_seconds: float):
        self.limit, self.window = limit, window_seconds
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def _trim(self, q: deque, now: float):
        while q and now - q[0] > self.window:
            q.popleft()

    def hit(self, key: str) -> bool:
        """Record a hit; False if the key is over its limit (the hit is not recorded then)."""
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            self._trim(q, now)
            if len(q) >= self.limit:
                return False
            q.append(now)
            return True

    def blocked(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            q = self._hits.get(key)
            if not q:
                return False
            self._trim(q, now)
            return len(q) >= self.limit

    def retry_after(self, key: str) -> int:
        with self._lock:
            q = self._hits.get(key)
            return int(self.window - (time.monotonic() - q[0])) + 1 if q else 0

    def reset(self, key: str):
        with self._lock:
            self._hits.pop(key, None)
