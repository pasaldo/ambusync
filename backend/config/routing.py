from django.urls import path

from emergencies.consumers import EmergencyEventsConsumer

websocket_urlpatterns = [path("ws/emergencies/", EmergencyEventsConsumer.as_asgi())]
