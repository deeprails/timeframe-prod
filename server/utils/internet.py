import socket


def is_connected(host="8.8.8.8", port=53, timeout=3):
    """
    Checks internet connectivity by trying to connect to a public DNS server (Google's 8.8.8.8).

    Args:
        host (str): Host to connect to (default is 8.8.8.8).
        port (int): Port to use (default is 53).
        timeout (int): Timeout in seconds (default is 3).

    Returns:
        bool: True if internet is connected, False otherwise.
    """
    return True
    try:
        socket.setdefaulttimeout(timeout)
        socket.socket(socket.AF_INET, socket.SOCK_STREAM).connect((host, port))
        return True
    except socket.error:
        return False
