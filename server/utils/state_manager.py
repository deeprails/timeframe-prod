from utils.logs_manager import LogManager, Log

all_modes = ["idle", "listening", "thinking", "speaking", "away"]
mode: str = "idle"  # "idle" | "listening" | "thinking" | "speaking" | "away"
log = LogManager()


def set_mode(_mode: str):
    """
    Will only update mode if it valid
    """
    global mode, log
    if _mode in all_modes:
        mode = _mode
        log.add_log(Log(
            event="Mode change",
            detail=f"Mode changed to {_mode}",
            type="info"
        ))


def get_mode() -> str:
    global mode
    return mode
