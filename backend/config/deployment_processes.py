"""One non-root process unit for capture mode. No external targets or child logs."""

import os
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

from config.test_mailbox import capture_services_ready


def process_specs(port: int, directory: str, password_hash: str, origin: str) -> list:
    base = {key: value for key, value in os.environ.items()
            if key in {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP"}}
    base.update(HOME=directory, XDG_CONFIG_HOME=directory, XDG_DATA_HOME=directory,
                GOMEMLIMIT="64MiB", GOMAXPROCS="1")
    app_env = {key: value for key, value in os.environ.items()
               if not key.upper().startswith("MP_")}
    return [
        ("mailpit", [
            "/usr/local/bin/mailpit", "--smtp", "127.0.0.1:1025",
            "--listen", "127.0.0.1:8025", "--allowed-hosts", "127.0.0.1:8025",
            "--webroot", "buzon-pruebas", "--database", str(Path(directory) / "mailpit.sqlite3"),
            "--max", "100", "--max-age", "24h", "--max-message-size", "1",
            "--smtp-max-recipients", "1", "--disable-version-check", "--smtp-disable-rdns",
            "--block-remote-css-and-fonts", "--quiet",
        ], dict(base)),
        ("daphne", [
            sys.executable, "-m", "daphne", "-b", "127.0.0.1", "-p", "8000",
            "--access-log", os.devnull, "-v", "0", "config.asgi:application",
        ], app_env),
        ("caddy", [
            "/usr/local/bin/caddy", "run", "--config", "/app/mailbox/Caddyfile",
            "--adapter", "caddyfile",
        ], {**base, "PORT": str(port), "AMBUSYNC_PUBLIC_ORIGIN": origin,
            "AMBUSYNC_TEST_MAILBOX_PASSWORD_HASH": password_hash}),
    ]


def wait_until_ready(children: list, port: int, stopped: threading.Event) -> None:
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline and not stopped.is_set():
        if any(child.poll() is not None for child in children):
            raise RuntimeError("Capture unit child exited.")
        try:
            with socket.create_connection(("127.0.0.1", 8000), timeout=0.3), \
                    socket.create_connection(("127.0.0.1", port), timeout=0.3):
                if capture_services_ready():
                    return
        except OSError:
            pass
        stopped.wait(0.1)
    raise TimeoutError("Capture unit startup unavailable.")


def run_deployment_processes(port: int, mode: str) -> int:
    if mode != "mailpit" or not 1024 <= port <= 65535 or port in {1025, 8000, 8025}:
        return 1
    children, handlers = [], {}
    stopped = threading.Event()
    result = 1
    with tempfile.TemporaryDirectory(prefix="ambusync-capture-") as directory:
        try:
            for sig in (signal.SIGTERM, signal.SIGINT):
                handlers[sig] = signal.signal(sig, lambda *_: stopped.set())
            for _name, args, env in process_specs(
                port, directory, os.environ["AMBUSYNC_TEST_MAILBOX_PASSWORD_HASH"],
                os.environ["FRONTEND_BASE_URL"].rstrip("/"),
            ):
                children.append(subprocess.Popen(
                    args, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL, shell=False,
                ))
            wait_until_ready(children, port, stopped)
            while not stopped.is_set():
                if any(child.poll() is not None for child in children):
                    break
                stopped.wait(0.1)
            else:
                result = 0
        except Exception:  # noqa: BLE001 -- never emit child output, URLs, hashes or exception text.
            result = 0 if stopped.is_set() else 1
        finally:
            for child in reversed(children):
                if child.poll() is None:
                    child.terminate()
            deadline = time.monotonic() + 10
            for child in reversed(children):
                try:
                    child.wait(timeout=max(0, deadline - time.monotonic()))
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait()
            for sig, handler in handlers.items():
                signal.signal(sig, handler)
    if result:
        sys.stderr.write("Capture process unit unavailable.\n")
    return result
