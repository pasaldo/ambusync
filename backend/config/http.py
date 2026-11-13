from django.utils.cache import add_never_cache_headers
from rest_framework.views import APIView


class NoStoreResourceView(APIView):
    """Protected data must not enter intermediary or browser HTTP caches."""

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        add_never_cache_headers(response)
        return response
