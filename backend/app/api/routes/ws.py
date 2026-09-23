from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.auth.deps import websocket_user
from app.utils.events import bus

router = APIRouter(tags=["Telemetry"])


async def _serve(websocket: WebSocket):
    # Event payloads name resources and findings, so the stream is for signed-in users only.
    if websocket_user(websocket) is None:
        await websocket.close(code=4401, reason="Not signed in")
        return
    await bus.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # keepalive / ignore client pings
    except WebSocketDisconnect:
        bus.disconnect(websocket)


# Path the frontend connects to: /ws/events?token=<access token>
@router.websocket("/ws/events")
async def events_ws(websocket: WebSocket):
    await _serve(websocket)


# Legacy path kept for backwards compatibility
@router.websocket("/api/v1/ws/telemetry")
async def telemetry_ws(websocket: WebSocket):
    await _serve(websocket)
