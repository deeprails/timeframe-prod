from utils.websocket_manager import manager
from utils.internet import is_connected
from thinking.llm_online import think as think_online
from thinking.ll_offline import think as think_offline
from utils.logs_manager import LogManager, Conversation
from datetime import datetime

chat = []
log = LogManager()


def think(input_txt):
    global chat

    manager.broadcast("thinking")
    push_message({
        "role": "user",
        "content": input_txt
    })
    if is_connected():
        # LLM and Guardrail Layer
        q_timestamp = datetime.now().isoformat()
        output_txt = think_online(input_txt, chat)

        log.add_conv(Conversation(
            question=input_txt,
            q_timestamp=q_timestamp,
            answer=output_txt,
            a_timestamp=datetime.now().isoformat()
        ))

        push_message({
            "role": "assistant",
            "content": output_txt
        })
        manager.broadcast(event="start-speaking",
                          data=output_txt)  # trigger speak mode
    else:
        video_id = think_offline(input_txt, chat)
        video_src = video_id + ".mp4"
        manager.broadcast(event="start-offline-speaking",
                          data=video_src)  # trigger speak mode


def push_message(message: dict, max_messages: int = 10):
    global chat
    chat.append(message)

    # trim oldest if too long
    if len(chat) > max_messages:
        chat[:] = chat[-max_messages:]

    return chat
