from stt.stt_service import STTService
# from stt.stt_offline import OfflineSTT
from utils.websocket_manager import manager
from utils.internet import is_connected
from threading import Event


def get_stt_instance():
    stt = None
    if is_connected():
        stt = STTService.get_instance()

    # else:
    #     stt = OfflineSTT.get_instance()
    return stt


def start_stt(stop_event: Event, start_video_connection=False):
    if (stop_event.is_set()):
        return
    print("Listening mode is started")
    # Start the video streaming service connection
    if start_video_connection:
        manager.broadcast("start-video-connection")

    stt = get_stt_instance()
    stt.reset()
    stt.start(stop_event)
