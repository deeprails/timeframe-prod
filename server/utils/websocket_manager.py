from fastapi import WebSocket, WebSocketDisconnect
from utils.state_manager import set_mode
import threading
import asyncio
import json
import numpy as np
from threading import Event
import cv2
from utils.frame_buffer import set_latest_frame
from utils.logs_manager import LogManager, Log, Conversation

log = LogManager()


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self.connected = False
        self.lock = threading.Lock()
        self.loop = None

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        with self.lock:
            self.active_connections.append(websocket)
            self.connected = True
        log.add_log(Log(
            event="WebSocket connected",
            detail="WebSocket client connected",
        ))

    def disconnect(self, websocket: WebSocket):
        with self.lock:
            if websocket in self.active_connections:
                self.active_connections.remove(websocket)
                self.connected = False
        log.add_log(Log(
            event="WebSocket disconnected",
            detail="WebSocket client disconnected",
        ))

    async def handle_events(self, websocket: WebSocket, stop_event: Event):
        try:
            while True:
                try:
                    raw = await websocket.receive()
                    if "bytes" in raw:
                        data = raw["bytes"]
                        nparr = np.frombuffer(data, np.uint8)
                        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                        set_latest_frame(frame)

                    if "text" in raw and raw["text"] is not None:
                        payload = json.loads(raw["text"])
                        event, data = payload.get("event"), payload.get("data")

                        log.add_log(Log(
                            event=f"Event:[{event}] received from FE",
                            detail=f"[PAYLOAD]: {raw['text']}",
                        ))

                        if self.connected:
                            if event == "start-thinking":
                                try:
                                    from thinking.index import think
                                    print("Thinking started")
                                    think(data)
                                except Exception as e:
                                    print(str(e))
                                    log.add_log(Log(
                                        event=f"Think error",
                                        detail=f"{e}",
                                        type="error"
                                    ))
                            elif event == "back-to-idle":
                                from presence_detection.index import detection_loop
                                try:
                                    with self.lock:
                                        detection_thread = threading.Thread(
                                            target=detection_loop, args=(stop_event,), daemon=True)
                                        detection_thread.start()
                                except Exception as e:
                                    print(str(e))
                                    log.add_log(Log(
                                        event=f"Presence Detection error",
                                        detail=f"{e}",
                                        type="error"
                                    ))
                            elif event == "speaking":
                                set_mode("speaking")
                            elif event == "info-log":
                                log.add_log(Log(
                                    event=data.get('event'),
                                    detail=data.get('detail'),
                                ))
                            elif event == "conversation-log":
                                log.add_conv(Conversation(
                                    question=data.get('question'),
                                    q_timestamp=data.get('q_timestamp'),
                                    answer=data.get('answer'),
                                    a_timestamp=data.get('a_timestamp')
                                ))
                            elif event == "save-logs":
                                log.commit_to_db()
                            elif event == "error":
                                set_mode("error")
                                log.add_log(Log(
                                    event="error",
                                    type="error",
                                    detail=data
                                ))
                                log.commit_to_db()
                except (ValueError, KeyError):
                    print("bad payload")

        except WebSocketDisconnect:
            print("client disconnected")
            log.add_log(Log(
                event=f"Websocket disconnected",
            ))
            self.disconnect(websocket)

    def broadcast(self, event: str, data: str = None):
        with self.lock:
            print(event)
            targets = list(self.active_connections)

        log.add_log(Log(
            event=f"Broadcast:[{event}] to FE",
            detail=f"[PAYLOAD]: {data}",
        ))

        for ws in targets:
            asyncio.run_coroutine_threadsafe(
                ws.send_text(json.dumps({
                    "event": event,
                    "data": data
                })),
                self.loop
            )
        set_mode(event)


manager = ConnectionManager()
