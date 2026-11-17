"""Publish a fixed set of build artifacts, never arbitrary filesystem paths."""

import mimetypes
import re
from functools import lru_cache
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse
from django.views.decorators.http import require_safe

PUBLIC = {
    "index.html",
    "sw.js",
    "manifest.webmanifest",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/apple-touch-icon.png",
}
HASHED = re.compile(r"^assets/[a-zA-Z0-9_.-]+-[a-zA-Z0-9_-]{8,}\.(js|css|woff2?|png|svg)$")
MIME = {".js": "text/javascript", ".webmanifest": "application/manifest+json"}


@lru_cache(maxsize=4)
def artifact_map(directory):
    root = Path(directory).resolve(strict=True)
    result = {}
    for item in root.rglob("*"):
        relative = item.relative_to(root).as_posix()
        if relative not in PUBLIC and not HASHED.fullmatch(relative):
            continue
        resolved = item.resolve()
        if resolved.is_relative_to(root) and resolved.is_file():
            result[relative] = resolved
    return root, result


def serve(request, name):
    if not getattr(settings, "AMBUSYNC_SERVE_FRONTEND", False):
        raise Http404
    if any(part in name for part in ("..", "\\", "%", "\x00")):
        raise Http404
    try:
        root, artifacts = artifact_map(str(settings.AMBUSYNC_FRONTEND_ROOT))
        target = artifacts.get(name)
        if target is None or not target.resolve(strict=True).is_relative_to(root):
            raise Http404
        mime = (
            MIME.get(target.suffix) or mimetypes.guess_type(name)[0] or "application/octet-stream"
        )
        if request.method == "HEAD":
            response = HttpResponse(content_type=mime)
            response["Content-Length"] = target.stat().st_size
        else:
            response = FileResponse(target.open("rb"), content_type=mime)
    except OSError, ValueError:
        raise Http404 from None
    response["Cache-Control"] = (
        "public, max-age=31536000, immutable" if HASHED.fullmatch(name) else "no-store"
    )
    response["X-Content-Type-Options"] = "nosniff"
    response["Referrer-Policy"] = "no-referrer"
    return response


@require_safe
def frontend_entry(request):
    return serve(request, "index.html")


@require_safe
def frontend_asset(request, asset_path):
    return serve(request, asset_path)
