"""Run Django tests with a process-exclusive database; never the shared test DB."""

import os
import sys
from pathlib import Path


def main():
    backend = Path(__file__).resolve().parent.parent
    sys.path.insert(0, str(backend))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    from django.conf import settings
    from django.core.management import execute_from_command_line

    settings.DATABASES["default"]["TEST"] = {"NAME": f"test_ambusync_l_{os.getpid()}"}
    execute_from_command_line(["manage.py", "test", *sys.argv[1:]])


if __name__ == "__main__":
    main()
