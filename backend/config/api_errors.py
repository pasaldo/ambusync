import uuid

from rest_framework.views import exception_handler


def error_response(code, message, status_code, fields=None):
    from rest_framework.response import Response

    return Response(
        {
            "code": code,
            "message": message,
            "fields": fields or {},
            "correlation_id": str(uuid.uuid4()),
        },
        status=status_code,
    )


def api_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return None

    data = response.data
    if isinstance(data, dict) and "detail" in data:
        detail = data["detail"]
        code = getattr(detail, "code", "request_error")
        message = str(detail)
        fields = {}
    else:
        code = "validation_error"
        message = "Revisa los campos indicados."
        fields = data

    response.data = {
        "code": str(code),
        "message": message,
        "fields": fields,
        "correlation_id": str(uuid.uuid4()),
    }
    return response
