"""Profile-scoped plugin skill management shared by Desktop's plugin RPC."""
import os
import re
import shutil
import uuid
from pathlib import Path

from hermes_constants import get_hermes_home
from hermes_cli.plugins import discover_plugins, get_plugin_manager, plugin_skill_override_path, set_plugin_skill_disabled
from utils import atomic_write_text


def _manager():
    discover_plugins()
    return get_plugin_manager()


def _info(name):
    plugin_skill_override_path(name)
    info = _manager().get_plugin_skill_info(name)
    if not info:
        raise ValueError("Plugin skill not found")
    return info


def skill_row(info, inactive=False):
    local = info.get("source") in {"user", "project"}
    return {
        "name": info["bare_name"], "qualified_name": info["qualified_name"],
        "description": str(info.get("description") or ""),
        "editable": local or bool(info["customized"]), "customizable": not local,
        "customized": bool(info["customized"]), "disabled": bool(info["disabled"]),
        "inactive": inactive, "removable": local,
    }


def plugin_skill_rows(key, inactive=False):
    manager = _manager()
    loaded = manager._plugins.get(key)
    if loaded is None:
        return []
    namespace = loaded.manifest.skill_namespace or loaded.manifest.name
    return [skill_row(info, inactive) for info in manager.list_plugin_skill_info(namespace)]


def _safe_path(info, override=False):
    path = Path(info["override_path"] if override else info["effective_path"])
    is_override = override or info["customized"]
    root = (get_hermes_home() / "plugin-skill-overrides") if is_override else Path(info["plugin_path"])
    if path.name != "SKILL.md" or path.is_symlink():
        raise PermissionError("Unsafe plugin skill path")
    path.resolve().relative_to(root.resolve())
    # Reject symlinked parents even when the resolved target remains within the root.
    for parent in (path.parent, *path.parents):
        if parent == root.parent:
            break
        if parent.is_symlink():
            raise PermissionError("Unsafe plugin skill directory")
    return path


def _save(info, content):
    if not skill_row(info)["editable"] or not isinstance(content, str):
        raise PermissionError("Customise this skill before editing it")
    atomic_write_text(_safe_path(info), content)


def _customize(info, _content):
    if not skill_row(info)["customizable"]:
        raise ValueError("This skill can be edited directly")
    path = _safe_path(info, override=True)
    if not path.exists():
        original = {**info, "customized": False, "effective_path": info["original_path"]}
        text = _safe_path(original).read_text(encoding="utf-8")
        path.parent.mkdir(parents=True, exist_ok=True)
        atomic_write_text(path, text)


def _reset(info, _content):
    path = _safe_path(info, override=True)
    if path.is_file():
        path.unlink()


def _delete(info, _content):
    _safe_path({**info, "customized": False, "effective_path": info["original_path"]})
    _safe_path(info, override=True)
    _delete_user_plugin_skill(_manager(), info, info["qualified_name"])


def _enabled(info, enabled):
    set_plugin_skill_disabled(info["qualified_name"], not enabled)


_SKILL_ACTIONS = {
    "save": _save, "customize": _customize, "reset": _reset, "delete": _delete,
    "enable": lambda info, content: _enabled(info, True),
    "restore": lambda info, content: _enabled(info, True),
    "disable": lambda info, content: _enabled(info, False),
    "remove": lambda info, content: _enabled(info, False),
}


def manage_plugin_skill(name, operation, content=None):
    info = _info(name)
    if operation == "view":
        return {"ok": True, "skill": skill_row(info), "content": _safe_path(info).read_text(encoding="utf-8")}
    action = _SKILL_ACTIONS.get(operation)
    if action is None:
        raise ValueError("Unknown plugin skill action")
    action(info, content)
    if operation == "delete":
        return {"ok": True, "name": name, "deleted": True}
    return {"ok": True, "skill": skill_row(_info(name))}



def _delete_user_plugin_skill(manager, info: dict, qualified_name: str) -> None:
    """Permanently delete a conventional user/project plugin skill safely."""
    if info.get("source") not in {"user", "project"}:
        raise PermissionError("Only user and project plugin skills can be deleted")
    plugin_name, skill_name = qualified_name.split(":", 1)
    plugin_root_raw = info.get("plugin_path")
    if not plugin_root_raw:
        raise ValueError("Plugin does not expose a managed source directory")
    plugin_root = Path(plugin_root_raw).expanduser().resolve()
    original = Path(info.get("original_path") or "").expanduser()
    expected_dir = (plugin_root / "skills" / skill_name).resolve()
    if (
        original.name != "SKILL.md"
        or original.is_symlink()
        or not original.is_file()
        or original.parent.is_symlink()
        or original.parent.resolve() != expected_dir
    ):
        raise PermissionError("Plugin skill source is not safe to delete")

    manifest_file = next(
        (path for path in (plugin_root / "plugin.yaml", plugin_root / "plugin.yml") if path.is_file() and not path.is_symlink()),
        None,
    )
    if manifest_file is None:
        raise ValueError("Plugin manifest is missing")
    import hermes_yaml as yaml

    manifest_text = manifest_file.read_text(encoding="utf-8")
    manifest_data = yaml.safe_load(manifest_text) or {}
    declared = manifest_data.get("provides_skills") if isinstance(manifest_data, dict) else None
    if not isinstance(declared, list) or skill_name not in declared:
        raise ValueError("Skill is not managed by the plugin manifest")

    lines = manifest_text.splitlines(keepends=True)
    header_index = next(
        (i for i, line in enumerate(lines) if re.match(r"^\s*provides_skills\s*:\s*(?:#.*)?$", line.rstrip("\r\n"))),
        None,
    )
    if header_index is None:
        raise ValueError("Plugin uses an unsupported skill manifest format")
    header_indent = len(lines[header_index]) - len(lines[header_index].lstrip())
    item_pattern = re.compile(
        r"^\s*-\s*(?:['\"])?" + re.escape(skill_name) + r"(?:['\"])?\s*(?:#.*)?(?:\r?\n)?$"
    )
    item_index = None
    for i in range(header_index + 1, len(lines)):
        stripped = lines[i].strip()
        indent = len(lines[i]) - len(lines[i].lstrip())
        if stripped and not stripped.startswith("#") and indent <= header_indent:
            break
        if item_pattern.match(lines[i]):
            item_index = i
            break
    if item_index is None:
        raise ValueError("Plugin uses an unsupported skill manifest format")

    staged_dir = expected_dir.with_name(f".{expected_dir.name}.deleting-{uuid.uuid4().hex}")
    expected_dir.rename(staged_dir)
    try:
        updated_text = "".join(lines[:item_index] + lines[item_index + 1:])
        temp_manifest = manifest_file.with_name(f".{manifest_file.name}.{uuid.uuid4().hex}.tmp")
        try:
            temp_manifest.write_text(updated_text, encoding="utf-8")
            os.replace(temp_manifest, manifest_file)
        finally:
            if temp_manifest.exists():
                temp_manifest.unlink()
    except Exception:
        staged_dir.rename(expected_dir)
        raise

    shutil.rmtree(staged_dir)
    override = Path(info.get("override_path") or "").expanduser()
    if override.is_file() and not override.is_symlink():
        override.unlink()
    set_plugin_skill_disabled(qualified_name, False)
    remove_skill = getattr(manager, "remove_plugin_skill", None)
    if callable(remove_skill):
        remove_skill(qualified_name)
    manager.discover_and_load(force=True)



def trash_user_plugin(name):
    """WebUI parity: keep the complete install in the active profile's plugin-trash."""
    from hermes_cli import plugins_cmd as pc
    target = pc._user_installed_plugin_dir(name)
    link = pc._plugins_dir() / name
    if target is None or link.is_symlink():
        raise ValueError("Plugin is not a managed user install")
    target.relative_to(pc._plugins_dir().resolve())
    trash = get_hermes_home() / "plugin-trash"
    if trash.is_symlink():
        raise PermissionError("Unsafe plugin trash directory")
    trash.mkdir(parents=True, exist_ok=True)
    destination = trash / f"{target.name}-{uuid.uuid4().hex}"
    aliases = pc._plugin_aliases(name) | {name, target.name}
    from hermes_cli.plugin_oauth import plugin_key
    grant_key = plugin_key(target)
    shutil.move(str(target), str(destination))
    try:
        pc._forget_plugin_config(aliases)
    except Exception:
        shutil.move(str(destination), str(target))
        raise
    from hermes_cli.plugin_oauth import forget_plugin_grants
    forget_plugin_grants(grant_key)
    _manager().discover_and_load(force=True)
    return {"ok": True, "name": name, "trash_path": str(destination)}
