#!/usr/bin/env python3
"""
Vendored, patched pyxtermjs terminal server.

Differences from upstream pyxtermjs 0.5.x:
  * one PTY per connected websocket client (not a single shared global PTY)
  * command and working directory can be supplied per connection
    (socket.io connect query: ?cmd=bash&cwd=/home/ubuntu)
  * optional shared-secret token via PYXTERM_TOKEN env (defense in depth on top
    of the Apache Basic Auth that fronts this service)
  * serves the page and socket.io under a reverse-proxy path prefix

Upstream: https://github.com/cs01/pyxtermjs (MIT)
"""
import os
import pty
import select
import shlex
import struct
import fcntl
import termios
import sqlite3
import time
import logging
import argparse

from flask import Flask, render_template, request, send_from_directory, abort
from flask_socketio import SocketIO

MANAGER_DB = os.environ.get(
    "MANAGER_DB", "/home/ubuntu/opencode-manager/data/manager.db"
)
COOKIE_NAME = "oc_token"


def _cookie_ok():
    """Validate the opencode-manager auth cookie against its database."""
    try:
        tok = (request.cookies or {}).get(COOKIE_NAME)
    except Exception:
        return False
    if not tok:
        return False
    try:
        con = sqlite3.connect(f"file:{MANAGER_DB}?mode=ro", uri=True, timeout=3)
        try:
            row = con.execute(
                "SELECT 1 FROM auth_sessions WHERE token = ? AND expires_at > ?",
                (tok, int(time.time() * 1000)),
            ).fetchone()
            return row is not None
        finally:
            con.close()
    except Exception:
        return False

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
logging.getLogger("werkzeug").setLevel(logging.ERROR)

app = Flask(__name__, template_folder=BASE_DIR, static_folder=BASE_DIR, static_url_path="")
app.config["SECRET_KEY"] = os.urandom(24).hex()
socketio = SocketIO(app, async_mode="threading", cors_allowed_origins="*")

TOKEN = os.environ.get("PYXTERM_TOKEN", "")
DEFAULT_CMD = os.environ.get("PYXTERM_CMD", "bash")
DEFAULT_CWD = os.environ.get("PYXTERM_CWD", os.path.expanduser("~"))

sessions = {}  # sid -> {"fd": int, "pid": int}


def set_winsize(fd, row, col):
    winsize = struct.pack("HHHH", row, col, 0, 0)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)


def _reader(sid, fd):
    while sid in sessions:
        socketio.sleep(0.01)
        try:
            ready, _, _ = select.select([fd], [], [], 0)
        except (OSError, ValueError):
            break
        if not ready:
            continue
        try:
            data = os.read(fd, 65536)
        except OSError:
            break
        if not data:
            break
        socketio.emit(
            "pty-output",
            {"output": data.decode(errors="ignore")},
            to=sid,
            namespace="/pty",
        )
    _cleanup(sid)


def _cleanup(sid):
    s = sessions.pop(sid, None)
    if not s:
        return
    try:
        os.close(s["fd"])
    except OSError:
        pass
    try:
        os.kill(s["pid"], 9)
        os.waitpid(s["pid"], 0)
    except OSError:
        pass


@app.route("/")
def index():
    if not _cookie_ok():
        abort(401)
    return render_template("index.html")


@app.route("/healthz")
def healthz():
    return {"ok": True, "sessions": len(sessions)}


@socketio.on("connect", namespace="/pty")
def on_connect(auth=None):
    sid = request.sid
    q = request.args or {}
    if not _cookie_ok():
        logging.warning("rejected unauthenticated client %s", sid)
        return False
    if TOKEN and q.get("token") != TOKEN:
        logging.warning("rejected client %s: bad token", sid)
        return False
    cmd = shlex.split(q.get("cmd") or DEFAULT_CMD)
    cwd = q.get("cwd") or DEFAULT_CWD
    if not cmd:
        cmd = ["bash"]
    if not os.path.isdir(cwd):
        cwd = DEFAULT_CWD

    pid, fd = pty.fork()
    if pid == 0:  # child
        try:
            os.chdir(cwd)
        except OSError:
            pass
        os.environ["TERM"] = "xterm-256color"
        os.environ["COLORTERM"] = "truecolor"
        try:
            os.execvp(cmd[0], cmd)
        except Exception as e:  # noqa
            os.write(2, f"exec failed: {e}\r\n".encode())
            os._exit(1)
    else:  # parent
        sessions[sid] = {"fd": fd, "pid": pid}
        set_winsize(fd, 30, 100)
        socketio.start_background_task(_reader, sid, fd)
        logging.info("session %s started cmd=%s cwd=%s pid=%s", sid, cmd, cwd, pid)


@socketio.on("pty-input", namespace="/pty")
def on_input(data):
    s = sessions.get(request.sid)
    if s and isinstance(data, dict):
        try:
            os.write(s["fd"], data.get("input", "").encode())
        except OSError:
            pass


@socketio.on("resize", namespace="/pty")
def on_resize(data):
    s = sessions.get(request.sid)
    if s and isinstance(data, dict):
        try:
            set_winsize(s["fd"], int(data.get("rows", 30)), int(data.get("cols", 100)))
        except (OSError, ValueError, TypeError):
            pass


@socketio.on("disconnect", namespace="/pty")
def on_disconnect():
    _cleanup(request.sid)


def main():
    p = argparse.ArgumentParser(description="vendored pyxtermjs terminal server")
    p.add_argument("-p", "--port", type=int, default=4098)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--debug", action="store_true")
    args = p.parse_args()
    logging.basicConfig(level=logging.DEBUG if args.debug else logging.INFO)
    logging.info("pyxtermjs serving on %s:%s", args.host, args.port)
    socketio.run(app, host=args.host, port=args.port, debug=False)


if __name__ == "__main__":
    main()
