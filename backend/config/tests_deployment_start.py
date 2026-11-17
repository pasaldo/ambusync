import os
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.core.management import call_command
from django.db import connection
from django.test import SimpleTestCase, TransactionTestCase, override_settings

SHA = "a" * 40


class DeploymentStartTests(SimpleTestCase):
    def test_unapproved_pending_migrations_never_apply_or_listen(self):
        from config.deployment_start import prepare_database

        with (
            patch("config.deployment_start.verify_database"),
            patch("config.deployment_start.migration_lock"),
            patch("config.deployment_start.call_command", side_effect=SystemExit(1)) as command,
            self.assertRaises(RuntimeError),
        ):
            prepare_database(SHA, "")
        self.assertEqual(command.call_args.kwargs.get("check"), True)
        self.assertEqual(command.call_count, 1)

    def test_mismatched_sha_is_rejected_before_database_access(self):
        from config.deployment_start import prepare_database

        with (
            patch("config.deployment_start.verify_database") as verify,
            self.assertRaises(RuntimeError),
        ):
            prepare_database(SHA, "b" * 40)
        verify.assert_not_called()

    def test_approved_pending_migrations_must_succeed_and_be_rechecked(self):
        from config.deployment_start import prepare_database

        for outcome in (None, RuntimeError("private-migration-detail")):
            with (
                self.subTest(failure=outcome is not None),
                patch("config.deployment_start.verify_database"),
                patch("config.deployment_start.migration_lock"),
                patch(
                    "config.deployment_start.call_command",
                    side_effect=[SystemExit(1), outcome, None],
                ) as command,
            ):
                if outcome:
                    with self.assertRaises(RuntimeError):
                        prepare_database(SHA, SHA)
                    self.assertEqual(command.call_count, 2)
                else:
                    prepare_database(SHA, SHA)
                    self.assertEqual(
                        [c.kwargs.get("check", False) for c in command.call_args_list],
                        [True, False, True],
                    )

    def test_repeated_start_with_no_pending_migrations_does_not_apply(self):
        from config.deployment_start import prepare_database

        with (
            patch("config.deployment_start.verify_database"),
            patch("config.deployment_start.migration_lock"),
            patch("config.deployment_start.call_command") as command,
        ):
            prepare_database(SHA, "")
            prepare_database(SHA, "")
        self.assertEqual(command.call_count, 2)
        self.assertTrue(all(call.kwargs["check"] for call in command.call_args_list))

    def test_start_failures_never_exec_or_print_private_detail(self):
        from config import deployment_start

        with TemporaryDirectory() as directory:
            source = Path(directory, "build-sha")
            source.write_text(SHA)
            for env, failure in (
                ({"DJANGO_SETTINGS_MODULE": "config.settings"}, None),
                ({"DJANGO_SETTINGS_MODULE": "config.deployment_settings", "PORT": "invalid"}, None),
                (
                    {"DJANGO_SETTINGS_MODULE": "config.deployment_settings", "PORT": "10000"},
                    RuntimeError("PRIVATE-TOKEN"),
                ),
            ):
                with (
                    self.subTest(env=env),
                    patch.dict(os.environ, env, clear=True),
                    patch.object(deployment_start, "BUILD_SHA_FILE", source),
                    patch("config.deployment_start.django.setup"),
                    patch("config.deployment_start.prepare_database", side_effect=failure),
                    patch("config.deployment_start.os.execv") as execute,
                    patch("sys.stderr", new_callable=StringIO) as stderr,
                ):
                    self.assertEqual(deployment_start.main(), 1)
                    execute.assert_not_called()
                    self.assertNotIn("PRIVATE-TOKEN", stderr.getvalue())

    def test_start_execs_asgi_directly_with_access_log_disabled(self):
        from config import deployment_start

        with (
            TemporaryDirectory() as directory,
            patch.dict(
                os.environ,
                {"DJANGO_SETTINGS_MODULE": "config.deployment_settings", "PORT": "10000"},
                clear=True,
            ),
            patch("config.deployment_start.django.setup"),
            patch("config.deployment_start.prepare_database"),
            patch("config.deployment_start.os.execv") as execute,
        ):
            source = Path(directory, "build-sha")
            source.write_text(SHA)
            with patch.object(deployment_start, "BUILD_SHA_FILE", source):
                deployment_start.main()
        argv = execute.call_args.args[1]
        self.assertEqual(argv[-1], "config.asgi:application")
        self.assertEqual(argv[argv.index("--access-log") + 1], os.devnull)
        self.assertEqual(argv[argv.index("-p") + 1], "10000")
        self.assertNotIn("shell", argv)


class DeploymentDatabaseStartTests(TransactionTestCase):
    def test_real_exclusive_database_check_and_lock_do_not_change_accounts(self):
        from accounts.models import User
        from config.deployment_start import prepare_database

        self.assertTrue(connection.settings_dict["NAME"].startswith("test_ambusync_l_"))
        user = User.objects.create(username="synthetic-start-preserved")
        with override_settings(
            AMBUSYNC_EXPECTED_DATABASE_HOST=connection.settings_dict["HOST"],
            AMBUSYNC_EXPECTED_DATABASE_NAME=connection.settings_dict["NAME"],
        ):
            prepare_database(SHA, "")
            prepare_database(SHA, "")
        self.assertTrue(
            User.objects.filter(pk=user.pk, username="synthetic-start-preserved").exists()
        )

    def test_wrong_effective_database_aborts_before_migration(self):
        from config.deployment_start import prepare_database

        with (
            override_settings(
                AMBUSYNC_EXPECTED_DATABASE_HOST=connection.settings_dict["HOST"],
                AMBUSYNC_EXPECTED_DATABASE_NAME="never-this-database",
            ),
            patch("config.deployment_start.call_command") as command,
            self.assertRaises(RuntimeError),
        ):
            prepare_database(SHA, SHA)
        command.assert_not_called()

    def test_real_migration_replay_only_in_exclusive_test_database(self):
        from config.deployment_start import prepare_database

        self.assertTrue(connection.settings_dict["NAME"].startswith("test_ambusync_l_"))
        # Remove only the new, unused operational table inside our disposable DB.
        call_command("migrate", "accounts", "0005", verbosity=0)
        try:
            with override_settings(
                AMBUSYNC_EXPECTED_DATABASE_HOST=connection.settings_dict["HOST"],
                AMBUSYNC_EXPECTED_DATABASE_NAME=connection.settings_dict["NAME"],
            ):
                with self.assertRaises(RuntimeError):
                    prepare_database(SHA, "")
                prepare_database(SHA, SHA)
        finally:
            call_command("migrate", "accounts", verbosity=0)
