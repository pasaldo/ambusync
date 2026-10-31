import uuid

from django.http import JsonResponse


def csrf_failure(request, reason=""):
    return JsonResponse(
        {
            "code": "csrf_failed",
            "message": "La solicitud no superó la validación CSRF.",
            "fields": {},
            "correlation_id": str(uuid.uuid4()),
        },
        status=403,
    )
