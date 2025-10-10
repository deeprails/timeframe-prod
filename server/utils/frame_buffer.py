import threading

_latest_frame = None
_lock = threading.Lock()

def set_latest_frame(frame):
    global _latest_frame
    with _lock:
        _latest_frame = frame

def get_latest_frame():
    with _lock:
        return _latest_frame
