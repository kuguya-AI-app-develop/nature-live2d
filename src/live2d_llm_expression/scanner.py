from __future__ import annotations

from pathlib import Path

from live2d_llm_expression.profile.model_profile import Live2DResourceSet


def scan_live2d_resources(root_dir: str | Path) -> Live2DResourceSet:
    root = Path(root_dir).expanduser().resolve()
    if not root.exists():
        raise FileNotFoundError(f"Live2D resource directory does not exist: {root}")
    if not root.is_dir():
        raise NotADirectoryError(f"Live2D resource path is not a directory: {root}")

    resource_set = Live2DResourceSet(root_dir=root)

    for path in sorted(root.glob("*.json")):
        name = path.name
        if name.endswith(".model3.json"):
            resource_set.model3_path = resource_set.model3_path or path
        elif name.endswith(".cdi3.json"):
            resource_set.cdi3_path = resource_set.cdi3_path or path
        elif name.endswith(".physics3.json"):
            resource_set.physics3_path = resource_set.physics3_path or path
        elif name.endswith(".vtube.json"):
            resource_set.vtube_path = resource_set.vtube_path or path
        elif name.endswith(".exp3.json"):
            resource_set.exp3_paths.append(path)
        elif name.endswith(".xyplugin.json") or name == "items_pinned_to_model.json":
            resource_set.ignored_paths.append(path)
        else:
            resource_set.ignored_paths.append(path)

    resource_set.exp3_paths.sort()
    resource_set.ignored_paths.sort()
    return resource_set

