"""Preserve the local Responses file-tool schema contract across upgrades."""
from copy import deepcopy

import pytest

from agent.codex_responses_adapter import _responses_tools


@pytest.mark.parametrize("name", ["write_file", "patch"])
def test_file_tool_requires_path_and_nullable_optional_arguments(name, monkeypatch):
    monkeypatch.setattr("agent.runtime_cwd.resolve_context_cwd", lambda: "/tmp/ordinary-workspace")
    schema = {
        "type": "object",
        "properties": {
            "path": {"type": "string"},
            "mode": {"type": "string", "enum": ["replace", "append"], "default": "replace"},
        },
        "required": ["path"],
    }
    original = deepcopy(schema)
    file_tool, other_tool = _responses_tools([
        {"type": "function", "function": {"name": name, "parameters": schema}},
        {"type": "function", "function": {"name": "terminal", "parameters": schema}},
    ])
    assert file_tool["strict"] is True
    assert file_tool["parameters"] == {
        "type": "object",
        "properties": {
            "path": {"type": "string"},
            "mode": {"type": ["string", "null"], "enum": ["replace", "append", None]},
        },
        "required": ["path", "mode"],
        "additionalProperties": False,
    }
    assert other_tool["strict"] is False
    assert schema == original


def test_measured_case_b_workspace_keeps_its_existing_exception(monkeypatch):
    monkeypatch.setattr("agent.runtime_cwd.resolve_context_cwd", lambda: "/tmp/ai-strategy-workshop/case-b")
    tool = _responses_tools([{"function": {"name": "write_file", "parameters": {"type": "object"}}}])[0]
    assert tool["strict"] is False
