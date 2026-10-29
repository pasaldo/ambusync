from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from institutions.models import Institution


class DestinationListView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        if not request.user.groups.filter(name="ambulance").exists():
            raise PermissionDenied("Se requiere permiso de ambulancia.")

        destinations = Institution.objects.filter(
            enabled=True,
            kind__in=(Institution.Kind.RECEIVER, Institution.Kind.COMBINED),
        ).order_by("name", "id")
        return Response([{"id": str(item.pk), "name": item.name} for item in destinations])
