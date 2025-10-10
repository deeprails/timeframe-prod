from fastapi import FastAPI, WebSocket,  HTTPException, status
import threading
import asyncio
import uvicorn
from presence_detection.index import detection_loop
from stt.index import start_stt
# from utils.camera_manager import open_camera, close_camera, capture_frames
from utils.mic_manager import close_mic
from utils.websocket_manager import manager
from utils.state_manager import get_mode, set_mode
from utils.logs_manager import LogManager, Log
from contextlib import asynccontextmanager
from datetime import datetime

# — Thread & control event —
core_thread: threading.Thread | None = None
stop_event = threading.Event()
thread_lock = threading.Lock()
log = LogManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup phase
    manager.loop = asyncio.get_running_loop()
    yield
    # Shutdown phase (optional cleanup)
    # await some_async_cleanup()
    print("FastAPI shutting down")

app = FastAPI(lifespan=lifespan)


def core_loop():
    try:
        while not stop_event.is_set():
            detection_loop(stop_event)
            start_stt(stop_event=stop_event, start_video_connection=True)
    except Exception as e:
        print("Main Exception", e)
        manager.broadcast("away")
        set_mode("away")
        log.add_log(Log(
            event="Main Exception",
            detail=str(e),
            type="error"
        ))
    finally:
        stop_event.set()
        # close_camera()


@app.get("/start-loop")
def start_loop():
    if not manager.connected:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No WebSocket client connected",
        )
    global core_thread

    # warm up camera
    # open_camera()
    # capture_frames()

    with thread_lock:
        if core_thread and core_thread.is_alive():
            raise HTTPException(status_code=400, detail="Loop already running")
        stop_event.clear()
        log.start_new_instance()

        log.add_log(Log(
            event="Start Loop Triggered ",
            detail="Instance Started",
        ))

        core_thread = threading.Thread(target=core_loop, daemon=True)
        core_thread.start()
    return {"status": "started"}


@app.get("/stop-loop")
def stop_loop():
    global core_thread
    stop_event.set()
    if core_thread:  # waiting for core thread to end
        core_thread.join()
        core_thread = None
    manager.broadcast("idle")

    log.add_log(Log(
        event="Stop Loop Triggered ",
        detail="Instance Stopped",
    ))

    # close_camera()
    close_mic()
    return {"status": "stopping"}


@app.get("/state")
def get_state():
    mode = get_mode()
    web_socket_connected = manager.connected
    core_loop_running = core_thread.is_alive() if core_thread else False
    data = {"mode": mode, "web_socket_connected": web_socket_connected,
            "core_loop_running": core_loop_running}
    return data


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    await manager.handle_events(ws, stop_event)


if __name__ == "__main__":
    uvicorn.run("index:app", host="127.0.0.1", port=8000)
