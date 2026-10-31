import asyncio
import os
import uuid

from django.test import SimpleTestCase


class ValkeyChannelLayerTests(SimpleTestCase):
    def test_channels_group_delivery_with_configured_valkey(self):
        valkey_url = os.environ.get("VALKEY_URL")
        if not valkey_url:
            self.skipTest("Configura VALKEY_URL para ejecutar la prueba de integración Valkey.")

        from channels_redis.core import RedisChannelLayer

        async def exercise_channel_layer():
            layer = RedisChannelLayer(
                hosts=[{"address": valkey_url}],
                prefix=f"ambusync-test-{uuid.uuid4().hex}",
                expiry=10,
                group_expiry=60,
            )
            channel = await layer.new_channel("ambusync.probe")
            group = f"ambusync.probe.{uuid.uuid4().hex}"
            await layer.group_add(group, channel)
            try:
                await layer.group_send(
                    group,
                    {"type": "probe.message", "marker": "synthetic-only"},
                )
                message = await asyncio.wait_for(layer.receive(channel), timeout=5)
                self.assertEqual(
                    message,
                    {"type": "probe.message", "marker": "synthetic-only"},
                )
            finally:
                await layer.group_discard(group, channel)

        asyncio.run(exercise_channel_layer())
