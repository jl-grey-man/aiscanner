import time
from collections import defaultdict

_requests: dict[str, list[float]] = defaultdict(list)
LIMIT = 3
WINDOW = 3600  # 1 hour

def is_rate_limited(ip: str) -> bool:
    now = time.time()
    _requests[ip] = [t for t in _requests[ip] if now - t < WINDOW]
    if len(_requests[ip]) >= LIMIT:
        return True
    _requests[ip].append(now)
    return False
