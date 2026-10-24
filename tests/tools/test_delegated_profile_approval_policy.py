"""A hosted room's approval policy must not replace a profile-routed child profile's policy (#143399)."""

from unittest.mock import patch

from gateway.hosted_room_execution_policy import (
    RoomExecutionPolicy,
    bind_room_execution_policy,
    execution_policy_mapping,
    reset_room_execution_policy,
)
from tools import approval_context
from tools.delegate_tool_routes import _delegated_profile_route_scope


def _room_policy(mode):
    return RoomExecutionPolicy.from_mapping(execution_policy_mapping(
        target_profile="member",
        config={"approvals": {"mode": mode}, "platform_toolsets": {"api_server": ["hermes-api-server"]}},
    ))


def test_routed_child_uses_target_profile_manual_mode_inside_off_room():
    policy_token = bind_room_execution_policy(_room_policy("off"))
    try:
        with patch.object(approval_context, "_get_approval_config", return_value={"mode": "manual"}):
            assert approval_context._get_approval_mode() == "off"
            with _delegated_profile_route_scope():
                assert approval_context._get_approval_mode() == "manual"
    finally:
        reset_room_execution_policy(policy_token)


def test_routed_child_uses_target_profile_off_mode_inside_manual_room():
    policy_token = bind_room_execution_policy(_room_policy("manual"))
    try:
        with patch.object(approval_context, "_get_approval_config", return_value={"mode": "off"}):
            assert approval_context._get_approval_mode() == "manual"
            with _delegated_profile_route_scope():
                assert approval_context._get_approval_mode() == "off"
    finally:
        reset_room_execution_policy(policy_token)
