import time
import cv2
from types import *
from presence_detection.detect_person import detect_person
from config.presence_detection import *
from utils.websocket_manager import manager
from threading import Event

# --- Session state ---
stare_start_time = None
last_face_time = None


def detection_loop(stop_event: Event):
    global stare_start_time, last_face_time
    manager.broadcast("idle")
    try:
        while not stop_event.is_set():
            is_face_in_front_of_camera = detect_person()

            if is_face_in_front_of_camera:
                current_time = time.time()
                last_face_time = current_time

                if stare_start_time is None:  # face detected
                    stare_start_time = current_time
                elif current_time - stare_start_time >= STARE_TIME_LIMIT:  # person is staring for Stare limit
                    print("🟢 Session started")
                    break
            else:
                stare_start_time = None  # reset stare

            if cv2.waitKey(1) & 0xFF == ord('q'):
                break
    finally:
        cv2.destroyAllWindows()
