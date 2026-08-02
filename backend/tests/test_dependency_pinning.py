"""Every deploy reinstalls from requirements.txt.

Unpinned, production is whatever resolved on the day it last built: redeploying
an unchanged commit can produce a different application, a rollback does not
roll dependencies back, and any new release lands in production unreviewed.
"""

import re
from importlib.metadata import version
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
RUNTIME_REQUIREMENTS = BACKEND / "requirements.txt"
DEV_REQUIREMENTS = BACKEND / "requirements-dev.txt"


def _requirements(path):
    return [
        line.strip()
        for line in path.read_text().splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]


@pytest.mark.parametrize(
    "path", [RUNTIME_REQUIREMENTS, DEV_REQUIREMENTS], ids=["runtime", "dev"]
)
def test_every_dependency_is_pinned(path):
    unpinned = [line for line in _requirements(path) if "==" not in line]
    assert unpinned == []


def test_pins_match_the_installed_environment():
    """A pin nobody validates is a guess. These are the versions the suite runs
    against, so a drifted pin should fail here rather than in production."""
    for line in _requirements(RUNTIME_REQUIREMENTS):
        name, pinned = line.split("==")
        distribution = re.sub(r"\[.*\]$", "", name)
        assert version(distribution) == pinned, (
            f"{distribution} is pinned to {pinned} but {version(distribution)} is installed"
        )
