"""
Real-time event bus -> WebSocket clients at /ws/events.

Event shape matches frontend/src/components/LiveStream.jsx:
    {"type": "scan.completed", "severity": "INFO", "title": "...", "detail": "...", "link": "/scans"}

Why this exists: scans run in a worker thread (BackgroundTasks) or another process (Celery).
Calling `asyncio.run(ws.send(...))` from there (the old approach) creates a *new* event loop,
so the send never reaches sockets owned by the server loop. Here we:
  - capture the server loop at startup and hop onto it with run_coroutine_threadsafe
  - optionally fan in via Redis pub/sub so Celery worker processes can publish too
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import WebSocket

from app.config import settings

logger = logging.getLogger(__name__)
CHANNEL = "nimbus:events"


class EventBus:
    def __init__(self):
        self.clients: set[WebSocket] = set()
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self._redis_task: Optional[asyncio.Task] = None

    async def start(self):
        self.loop = asyncio.get_running_loop()
        if settings.EVENTS_BACKEND == "redis":
            self._redis_task = asyncio.create_task(self._redis_listener())

    async def stop(self):
        if self._redis_task:
            self._redis_task.cancel()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.clients.add(ws)

    def disconnect(self, ws: WebSocket):
        self.clients.discard(ws)

    async def _fanout(self, event: dict):
        dead = []
        payload = json.dumps(event, default=str)
        for ws in list(self.clients):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)

    async def _redis_listener(self):
        import redis.asyncio as aioredis
        while True:
            try:
                r = aioredis.from_url(settings.REDIS_URL)
                pubsub = r.pubsub()
                await pubsub.subscribe(CHANNEL)
                async for msg in pubsub.listen():
                    if msg.get("type") == "message":
                        await self._fanout(json.loads(msg["data"]))
            except asyncio.CancelledError:
                raise
            except Exception as e:  # reconnect on Redis blips
                logger.warning("event listener error, retrying in 5s: %s", e)
                await asyncio.sleep(5)

    def publish(self, type: str, title: str, detail: str = "", severity: str = "INFO", link: str = "/", **extra):
        """Thread-safe; callable from sync code, threads, or Celery workers."""
        event = {"type": type, "severity": severity, "title": title, "detail": detail, "link": link,
                 "ts": datetime.now(timezone.utc).isoformat(), **extra}
        if settings.EVENTS_BACKEND == "redis":
            try:
                import redis
                redis.Redis.from_url(settings.REDIS_URL).publish(CHANNEL, json.dumps(event, default=str))
                return
            except Exception as e:
                logger.warning("redis publish failed, falling back to in-process: %s", e)
        if self.loop and self.loop.is_running():
            try:
                running = asyncio.get_running_loop()
            except RuntimeError:
                running = None
            if running is self.loop:
                self.loop.create_task(self._fanout(event))
            else:
                asyncio.run_coroutine_threadsafe(self._fanout(event), self.loop)


bus = EventBus()
