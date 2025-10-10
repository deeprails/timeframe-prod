import cv2
import threading
import queue
import time
from typing import Optional, Tuple
from cv2 import VideoCapture

cap: Optional[VideoCapture] = None
camera_thread: Optional[threading.Thread] = None
frame_queue: "queue.Queue[Tuple[bool, object]]" = queue.Queue(maxsize=1)
stop_event = threading.Event()
thread_lock = threading.Lock()
opened_event = threading.Event()

INDEX_MAX = 4
WARMUP_SECONDS = 2.0
GET_TIMEOUT = 2.0
REOPEN_DELAY = 1.0
READ_FAILURE_THRESHOLD = 30
BACKEND_ORDER = []
if hasattr(cv2, "CAP_ANY"): BACKEND_ORDER.append(cv2.CAP_ANY)
if hasattr(cv2, "CAP_AVFOUNDATION"): BACKEND_ORDER.append(cv2.CAP_AVFOUNDATION)
if hasattr(cv2, "CAP_QT"): BACKEND_ORDER.append(cv2.CAP_QT)

def probe_and_open():
    global cap
    for backend in BACKEND_ORDER:
        for i in range(INDEX_MAX):
            c = cv2.VideoCapture(i, backend)
            if not (c and c.isOpened()):
                try: c.release()
                except: pass
                continue
            ok = False
            for _ in range(8):
                try:
                    grabbed = c.grab()
                    if grabbed:
                        ret, _ = c.retrieve()
                        if ret:
                            ok = True
                            break
                except Exception:
                    pass
                time.sleep(0.05)
            if ok:
                cap = c
                return True
            try: c.release()
            except: pass
    cap = None
    return False

def camera_loop():
    global cap
    while not stop_event.is_set():
        opened_event.clear()
        ok = probe_and_open()
        if not ok or cap is None or not cap.isOpened():
            opened_event.clear()
            time.sleep(REOPEN_DELAY)
            continue
        opened_event.set()
        t0 = time.time()
        while time.time() - t0 < WARMUP_SECONDS and not stop_event.is_set():
            try:
                cap.grab()
                time.sleep(0.05)
            except Exception:
                time.sleep(0.05)
        read_failures = 0
        while not stop_event.is_set():
            try:
                grabbed = cap.grab()
                if not grabbed:
                    read_failures += 1
                else:
                    ret, frame = cap.retrieve()
                    if not ret:
                        read_failures += 1
                    else:
                        read_failures = 0
                        try:
                            if frame_queue.full():
                                _ = frame_queue.get_nowait()
                            frame_queue.put_nowait((True, frame))
                        except queue.Full:
                            pass
                if read_failures >= READ_FAILURE_THRESHOLD:
                    try:
                        if cap:
                            cap.release()
                    except Exception:
                        pass
                    cap = None
                    opened_event.clear()
                    time.sleep(REOPEN_DELAY)
                    break
            except Exception:
                read_failures += 1
                if read_failures >= READ_FAILURE_THRESHOLD:
                    try:
                        if cap:
                            cap.release()
                    except Exception:
                        pass
                    cap = None
                    opened_event.clear()
                    time.sleep(REOPEN_DELAY)
                    break
            time.sleep(0.005)
        try:
            if cap:
                cap.release()
        except Exception:
            pass
        cap = None
        opened_event.clear()
    try:
        if cap:
            cap.release()
    except Exception:
        pass
    cap = None
    opened_event.clear()

def open_camera() -> None:
    global camera_thread, cap
    with thread_lock:
        if camera_thread and camera_thread.is_alive():
            return
        stop_event.clear()
        opened_event.clear()
        try:
            while True:
                frame_queue.get_nowait()
        except queue.Empty:
            pass
        camera_thread = threading.Thread(target=camera_loop, daemon=True)
        camera_thread.start()
        got = opened_event.wait(WARMUP_SECONDS + 4.0)
        if not got or not (camera_thread and camera_thread.is_alive()):
            stop_event.set()
            if camera_thread:
                camera_thread.join(timeout=1.0)
            raise IOError("Could not open camera")

def capture_frames() -> Tuple[bool, object]:
    if not (camera_thread and camera_thread.is_alive() and opened_event.is_set() and cap and cap.isOpened()):
        raise IOError("Tried to capture frame while camera was not open")
    try:
        ret, frame = frame_queue.get(timeout=GET_TIMEOUT)
        return ret, frame
    except queue.Empty:
        raise IOError("No frame available — camera not producing frames")

def close_camera() -> None:
    global camera_thread, cap
    with thread_lock:
        stop_event.set()
        opened_event.clear()
        if camera_thread and camera_thread.is_alive():
            camera_thread.join(timeout=2.0)
        if cap:
            try:
                cap.release()
            except Exception:
                pass
            cap = None
        try:
            cv2.destroyAllWindows()
        except Exception:
            pass
