"""Deployment request diagnostics deliberately exclude all request/private details."""

import logging


class RedactRequestLog(logging.Filter):
    def filter(self, record):
        record.msg = "HTTP request diagnostic."
        record.args = ()
        record.request = None
        record.exc_info = None
        record.exc_text = None
        record.stack_info = None
        return True
