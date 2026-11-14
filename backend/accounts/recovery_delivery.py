"""Bounded volatile delivery: public responses never wait for SMTP."""

import logging
from concurrent.futures import ThreadPoolExecutor
from threading import BoundedSemaphore

from django.conf import settings
from django.core.mail import get_connection, send_mail

logger = logging.getLogger(__name__)
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="recovery-mail")
_slots = BoundedSemaphore(32)


def deliver_mail(recipient, url):
    return send_mail(
        "Recupera tu cuenta de AmbuSync",
        f"Confirma el correo indicado en este mensaje y establece tu contraseña personal. "
        f"El enlace sirve una sola vez y vence en 30 minutos:\n{url}\n\n"
        "Si no solicitaste esta recuperación, ignora el mensaje y contacta al soporte institucional.",
        settings.DEFAULT_FROM_EMAIL,
        [recipient],
        fail_silently=False,
        connection=get_connection(timeout=5),
    )


def enqueue_mail(recipient, url):
    _submit(lambda: deliver_mail(recipient, url))


def enqueue_request(email, origin):
    def request_job():
        from django.db import close_old_connections, connections

        from accounts.recovery import request_recovery

        close_old_connections()
        try:
            request_recovery(email, origin)
        finally:
            connections.close_all()

    _submit(request_job)


def _submit(job):
    if not _slots.acquire(blocking=False):
        logger.warning("Recovery delivery capacity unavailable.")
        return

    def work():
        try:
            job()
        except Exception:  # noqa: BLE001 -- never log email, token or SMTP exception text.
            logger.warning("Recovery delivery failed.")
        finally:
            _slots.release()

    try:
        _executor.submit(work)
    except Exception:  # noqa: BLE001 -- a shutdown must not expose account existence.
        _slots.release()
        logger.warning("Recovery delivery unavailable.")
