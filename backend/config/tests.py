import asyncio
import os
import subprocess
import sys
import uuid
from pathlib import Path

from django.conf import settings
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

    def test_idle_blocking_receive_survives_past_redis_socket_timeout(self):
        """Keepalive reads must outlive channels_redis' 5s blocking receive."""
        from channels.layers import get_channel_layer

        async def exercise_idle_receive():
            layer = get_channel_layer()
            channel = await layer.new_channel("ambusync.probe")
            receive_task = asyncio.create_task(layer.receive(channel))
            try:
                await asyncio.sleep(layer.brpop_timeout + 1)
                expected = {"type": "probe.message", "marker": "after-idle"}
                await layer.send(channel, expected)
                message = await asyncio.wait_for(receive_task, timeout=2)
                self.assertEqual(message, expected)
            finally:
                if not receive_task.done():
                    receive_task.cancel()
                    try:
                        await receive_task
                    except asyncio.CancelledError:
                        pass

        if not os.environ.get("VALKEY_URL"):
            self.skipTest("Configura VALKEY_URL para probar lecturas bloqueantes de Valkey.")
        asyncio.run(exercise_idle_receive())


class RuntimeChannelLayerConfigurationTests(SimpleTestCase):
    def test_runtime_uses_channels_and_requires_valkey_url(self):
        from channels.layers import get_channel_layer
        from channels_redis.core import RedisChannelLayer
        from channels_redis.utils import create_pool

        self.assertEqual(settings.ASGI_APPLICATION, "config.asgi.application")
        self.assertIn("daphne", settings.INSTALLED_APPS)
        self.assertIsInstance(get_channel_layer(), RedisChannelLayer)

        layer = get_channel_layer()
        pool = create_pool(layer.hosts[0])
        redis_connection = pool.connection_class(**pool.connection_kwargs)
        self.assertGreater(
            redis_connection.socket_timeout,
            layer.brpop_timeout,
            "Redis socket timeout must exceed the channel layer's blocking receive timeout.",
        )

        environment = os.environ.copy()
        # Prevent settings.py's dotenv loader from restoring the local .env value.
        environment["VALKEY_URL"] = ""
        result = subprocess.run(
            [sys.executable, "-c", "import config.settings"],
            cwd=Path(__file__).resolve().parent.parent,
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("VALKEY_URL", result.stderr)
