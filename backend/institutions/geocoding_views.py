from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from config.http import NoStoreResourceView
from institutions.geocoding import ATTRIBUTION, lookup_address
from institutions.system_management import require_system_admin


class GeocodingView(NoStoreResourceView):
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        require_system_admin(request.user)
        if (
            not isinstance(request.data, dict)
            or set(request.data) - {"address", "retry"}
            or type(request.data.get("retry", False)) is not bool
        ):
            raise ValidationError("Revisa la solicitud de ubicación.")
        row = lookup_address(request.data.get("address"), request.data.get("retry", False))
        return Response(
            {
                "lookup_id": row.pk,
                "status": row.status,
                "candidates": row.candidates,
                "attribution": ATTRIBUTION,
            }
        )
