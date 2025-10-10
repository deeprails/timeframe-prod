import sqlite3
from datetime import datetime
from threading import Lock
from dataclasses import dataclass
import uuid

# ----------------- Data classes -----------------


@dataclass(frozen=True)
class Log:
    # Required
    event: str

    # Optional (auto-filled at instance creation time)
    detail: str = ""
    type: str = "info" # "info" | "error"
    instance_uuid: str | None = None
    ts: str | None = None
    mode: str | None = None

    def __post_init__(self):
        if self.instance_uuid is None:
            inst_id = LogManager().get_instance_id() or str(uuid.uuid4())
            object.__setattr__(self, "instance_uuid", inst_id)
        if self.ts is None:
            object.__setattr__(self, "ts", datetime.now().isoformat())
        if self.mode is None:
            from utils.state_manager import get_mode
            object.__setattr__(self, "mode", get_mode())

    def as_tuple(self):
        return (self.instance_uuid, self.ts, self.mode, self.event, self.detail, self.type)


@dataclass(frozen=True)
class Conversation:
    # Provide one or both of question/answer
    question: str | None = None
    answer: str | None = None

    # Explicit timestamps (must be provided by caller alongside the field)
    q_timestamp: str | None = None
    a_timestamp: str | None = None

    # Keep the instance/session id on conversation rows
    instance_uuid: str | None = None

    def __post_init__(self):
        if self.question is not None and not self.q_timestamp:
            raise ValueError(
                "q_timestamp must be provided when question is set.")
        if self.answer is not None and not self.a_timestamp:
            raise ValueError(
                "a_timestamp must be provided when answer is set.")
        if self.question is None and self.answer is None:
            raise ValueError(
                "Conversation must have question, answer, or both.")
        if self.instance_uuid is None:
            inst_id = LogManager().get_instance_id() or str(uuid.uuid4())
            object.__setattr__(self, "instance_uuid", inst_id)

    def as_tuple(self):
        # matches INSERT column order below
        return (self.instance_uuid, self.question, self.answer, self.q_timestamp, self.a_timestamp)

class SingletonMeta(type):
    _instances = {}
    _lock = Lock()

    def __call__(cls, *args, **kwargs):
        with cls._lock:
            if cls not in cls._instances:
                cls._instances[cls] = super().__call__(*args, **kwargs)
        return cls._instances[cls]

# ----------------- Log Manager -----------------


# The `LogManager` class is responsible for managing logs and conversations in a database. It
# provides methods to add log entries and conversation entries to in-memory buffers, commit
# these entries to a SQLite database, start a new logging instance with a unique identifier, and
# retrieve the current instance ID.
class LogManager(metaclass=SingletonMeta):
    def __init__(self, db_path="logs.db"):
        self.db_path = db_path
        self.current_instance_uuid = None
        self.log_buf = []   # list[Log|tuple]
        self.conv_buf = []  # list[Conversation|tuple]
        self.buf_lock = Lock()
        self._ensure_tables()

    # --- public API ---
    def add_log(self, log_entry: Log | tuple):
        with self.buf_lock:
            self.log_buf.append(log_entry)

    def add_conv(self, conv_entry: Conversation | tuple):
        with self.buf_lock:
            self.conv_buf.append(conv_entry)

    def commit_to_db(self) -> int:
        # snapshot buffers
        with self.buf_lock:
            log_rows = self._rowify(self.log_buf, is_log=True)
            conv_rows = self._rowify(self.conv_buf, is_log=False)
            self.log_buf = []
            self.conv_buf = []

        if not log_rows and not conv_rows:
            return 0

        conn = self._get_connection()
        try:
            cur = conn.cursor()
            cur.execute("BEGIN IMMEDIATE;")
            if log_rows:
                cur.executemany(
                    "INSERT INTO logs (instance_uuid, ts, mode, event, detail, type) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    log_rows
                )
            if conv_rows:
                cur.executemany(
                    "INSERT INTO conversations (instance_uuid, question, answer, q_timestamp, a_timestamp) "
                    "VALUES (?, ?, ?, ?, ?)",
                    conv_rows
                )
            conn.commit()
            return len(log_rows) + len(conv_rows)
        except Exception:
            conn.rollback()
            # restore buffers so caller can retry
            with self.buf_lock:
                self.log_buf = log_rows + self.log_buf
                self.conv_buf = conv_rows + self.conv_buf
            raise
        finally:
            conn.close()

    def start_new_instance(self) -> str:
        with self.buf_lock:
            self.current_instance_uuid = str(uuid.uuid4())
            self.log_buf.clear()
            self.conv_buf.clear()
        return self.current_instance_uuid

    def get_instance_id(self) -> str | None:
        return self.current_instance_uuid

    # --- internals ---
    def _rowify(self, rows: list, is_log: bool) -> list[tuple]:
        out = []
        for r in rows:
            if hasattr(r, "as_tuple"):
                out.append(r.as_tuple())
            elif isinstance(r, tuple):
                out.append(r)
            else:
                # dict fallback if needed
                if is_log:
                    out.append((
                        r["instance_uuid"], r["ts"], r["mode"], r["event"],
                        r.get("detail", ""), r.get("type", "success")
                    ))
                else:
                    out.append((
                        r.get("instance_uuid"),
                        r.get("question"),
                        r.get("answer"),
                        r.get("q_timestamp"),
                        r.get("a_timestamp"),
                    ))
        return out

    def _get_connection(self):
        return sqlite3.connect(self.db_path, check_same_thread=False)

    def _ensure_tables(self):
        with self._get_connection() as conn:
            c = conn.cursor()
            c.execute("""
                CREATE TABLE IF NOT EXISTS logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    instance_uuid TEXT NOT NULL,
                    ts TEXT NOT NULL,
                    mode TEXT,
                    event TEXT,
                    detail TEXT,
                    type TEXT
                )
            """)
            c.execute("""
                CREATE TABLE IF NOT EXISTS conversations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    instance_uuid TEXT NOT NULL,
                    question TEXT,
                    answer TEXT,
                    q_timestamp TEXT,
                    a_timestamp TEXT
                )
            """)
            c.execute(
                "CREATE INDEX IF NOT EXISTS idx_logs_inst_ts ON logs (instance_uuid, ts)")
            c.execute(
                "CREATE INDEX IF NOT EXISTS idx_conv_inst_qts ON conversations (instance_uuid, q_timestamp)")
            c.execute(
                "CREATE INDEX IF NOT EXISTS idx_conv_inst_ats ON conversations (instance_uuid, a_timestamp)")
            conn.commit()

    def close(self):
        pass
