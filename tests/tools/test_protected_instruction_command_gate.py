"""Terminal and code execution must not bypass protected-instruction approvals (#143266)."""

from unittest.mock import patch


def test_terminal_command_mentions_route_through_protected_write_gate():
    from tools import approval

    with patch("tools.file_tools_write_guards._check_protected_instruction_write", return_value="blocked") as gate:
        result = approval._protected_instruction_command_block("printf x > ./AGENTS.md")

    assert result is not None
    gate.assert_called_once_with(["./AGENTS.md"], "default")


def test_python_write_apis_are_in_scope_for_code_guard():
    from tools import approval

    with patch("tools.file_tools_write_guards._check_protected_instruction_write", return_value="blocked") as gate:
        result = approval._protected_instruction_command_block(
            "from pathlib import Path; Path('SOUL.md').write_text('x')")

    assert result is not None
    gate.assert_called_once_with(["SOUL.md"], "default")


def test_process_stdin_commands_are_guarded_after_spawn():
    import json

    from tools.process_registry import _handle_process

    with patch("tools.approval._protected_instruction_command_block", return_value={"approved": False}) as gate:
        result = json.loads(_handle_process({"action": "write", "session_id": "proc-1", "data": "cat > CLAUDE.md"}))

    assert result == {"approved": False}
    gate.assert_called_once_with("cat > CLAUDE.md")


def test_hermes_policy_file_write_requires_one_time_gate_even_when_approvals_are_off():
    from tools import approval

    command = 'sed -n "w $HOME/.hermes/config.yaml" payload'
    with patch("tools.file_tools_write_guards._request_protected_instruction_approval",
               return_value="requires human approval") as gate, patch.object(
                   approval.approval_context, "_get_approval_mode", return_value="off"):
        result = approval.check_all_command_guards(command, "local")

    assert result["approved"] is False
    gate.assert_called_once_with(["Hermes security config"])
