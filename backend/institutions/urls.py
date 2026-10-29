from django.urls import path

from institutions.views import DestinationListView

urlpatterns = [
    path("destinations/", DestinationListView.as_view(), name="destination-list"),
]
