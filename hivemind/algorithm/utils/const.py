
import os
from pathlib import Path

from loguru import logger

import hivemind


MESSAGE_ROUTE_FROM = "sent_from"
MESSAGE_ROUTE_TO = "send_to"
MESSAGE_ROUTE_CAUSE_BY = "cause_by"
MESSAGE_META_ROLE = "role"
MESSAGE_ROUTE_TO_ALL = "<all>"
MESSAGE_ROUTE_TO_NONE = "<none>"


def get_hivemind_package_root():
    """Get the root directory of the installed package."""
    package_root = Path(hivemind.__file__).parent.parent
    for i in (".git", ".project_root", ".gitignore"):
        if (package_root / i).exists():
            break
    else:
        package_root = Path.cwd()

    logger.info(f"Package root set to {str(package_root)}")
    return package_root

def get_hivemind_root():
    """Get the project root directory."""
    # Check if a project root is specified in the environment variable
    project_root_env = os.getenv("METAGPT_PROJECT_ROOT")
    if project_root_env:
        project_root = Path(project_root_env)
        logger.info(f"PROJECT_ROOT set from environment variable to {str(project_root)}")
    else:
        # Fallback to package root if no environment variable is set
        project_root = get_hivemind_package_root()
    return project_root


METAGPT_ROOT = get_hivemind_root()  # Dependent on METAGPT_PROJECT_ROOT
DEFAULT_WORKSPACE_ROOT = METAGPT_ROOT / "workspace"