import asyncio
from collections import defaultdict
from typing import Any


class ContentStore:
    """In-memory pub/sub for delivering encyclopedia pages to content WebSockets.

    When the encyclopedia tool generates a page, it publishes the data here.
    Content WebSocket connections subscribe to receive pages for their session.
    """

    def __init__(self):
        self._subscribers: dict[str, list[asyncio.Queue]] = defaultdict(list)

    def subscribe(self, session_id: str) -> asyncio.Queue:
        """Subscribe to content updates for a session. Returns a Queue to await on."""
        queue: asyncio.Queue = asyncio.Queue()
        self._subscribers[session_id].append(queue)
        return queue

    def unsubscribe(self, session_id: str, queue: asyncio.Queue):
        """Remove a subscriber queue for a session."""
        if session_id in self._subscribers:
            try:
                self._subscribers[session_id].remove(queue)
            except ValueError:
                pass
            if not self._subscribers[session_id]:
                del self._subscribers[session_id]

    def publish(self, session_id: str, data: Any):
        """Publish content data to all subscribers of a session."""
        for queue in self._subscribers.get(session_id, []):
            queue.put_nowait(data)


content_store = ContentStore()
