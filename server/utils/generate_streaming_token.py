from config.stt import ASSEMBLYAI_API_KEY
import requests


def get_token():
    url = "https://streaming.assemblyai.com/v3/token"
    params = {
        "expires_in_seconds": 600,          # 1–600
        # "max_session_duration_seconds": 10800,  # optional, 60–10800 (defaults to 10800)
    }
    headers = {"Authorization": ASSEMBLYAI_API_KEY}

    print("token req init")
    r = requests.get(url, headers=headers, params=params)
    print("token response")
    r.raise_for_status()
    data = r.json()
    return data["token"]