"""Desktop plugin parity through the real scoped RPC and runtime skill resolver."""
from pathlib import Path
import json
import pytest
from tui_gateway import server
from hermes_cli import plugins
from agent.secret_scope import set_multiplex_active


def install(home, name='demo', text='original'):
    root = home / 'plugins' / name
    (root / 'skills' / 'sample').mkdir(parents=True)
    (root / 'plugin.yaml').write_text(f'name: {name}\nversion: 1.0.0\nprovides_skills:\n  - sample\n  - survivor\n')
    (root / '__init__.py').write_text("def register(ctx):\n    ctx.register_skill('sample', __import__('pathlib').Path(__file__).parent / 'skills/sample/SKILL.md')\n    ctx.register_skill('survivor', __import__('pathlib').Path(__file__).parent / 'skills/survivor/SKILL.md')\n")
    (root / 'skills/sample/SKILL.md').write_text(text)
    (root / 'skills/survivor').mkdir()
    (root / 'skills/survivor/SKILL.md').write_text('survivor')
    (home / 'config.yaml').write_text(f'plugins:\n  enabled: [{name}]\n')
    return root


def call(**params):
    response = server.handle_request({'id': 'parity', 'method': 'plugins.manage', 'params': params})
    assert 'error' not in response, response
    return response['result']


def test_scoped_lifecycle_and_recoverable_uninstall(tmp_path, monkeypatch):
    a, b = tmp_path / 'a', tmp_path / 'b'
    ra, rb = install(a, text='A'), install(b, text='B')
    monkeypatch.setenv('HERMES_HOME', str(a))
    monkeypatch.setattr(server, '_hermes_home', str(a))
    monkeypatch.setattr(server, '_profile_home', lambda name: b if name == 'b' else a)
    monkeypatch.setenv('HERMES_BUNDLED_PLUGINS', str(tmp_path / 'bundled'))
    set_multiplex_active(True)
    try:
        for profile, expected in [('a', 'A'), ('b', 'B'), ('a', 'A')]:
            assert call(action='skill', skill='demo:sample', operation='view', profile=profile)['content'] == expected
            row = next(r for r in call(action='list', profile=profile)['plugins'] if r['name'] == 'demo')
            assert row['skills'][0]['qualified_name'] == 'demo:sample'
        call(action='skill', skill='demo:sample', operation='save', content='edited B', profile='b')
        assert (ra / 'skills/sample/SKILL.md').read_text() == 'A'
        assert (rb / 'skills/sample/SKILL.md').read_text() == 'edited B'
        for operation, disabled in [('disable', True), ('enable', False), ('remove', True), ('restore', False)]:
            assert call(action='skill', skill='demo:sample', operation=operation, profile='b')['skill']['disabled'] is disabled
        call(action='skill', skill='demo:sample', operation='delete', profile='b')
        assert not (rb / 'skills/sample').exists()
        assert (ra / 'skills/sample/SKILL.md').exists()
        assert 'sample' not in (rb / 'plugin.yaml').read_text()
        scopes = server._profile_runtime_scope_tokens(b)
        try:
            manager = plugins.get_plugin_manager()
            assert manager._plugins['demo'].enabled
            assert manager.find_plugin_skill('demo:survivor').read_text() == 'survivor'
            assert manager.find_plugin_skill('demo:sample') is None
        finally:
            server._release_profile_runtime_scope_tokens(scopes)
        result = call(action='remove', name='demo', profile='b')
        assert not rb.exists()
        assert Path(result['trash_path']).is_relative_to(b / 'plugin-trash')
        assert (Path(result['trash_path']) / 'plugin.yaml').is_file()
        assert ra.is_dir()
        assert call(action='skill', skill='demo:sample', operation='view', profile='a')['content'] == 'A'
    finally:
        set_multiplex_active(False)


def test_bundled_override_and_path_boundaries(tmp_path, monkeypatch):
    home = tmp_path / 'home'
    bundled_home = tmp_path / 'vendor'
    source = install(bundled_home)
    home.mkdir()
    (home / 'config.yaml').write_text('plugins:\n  enabled: [demo]\n')
    monkeypatch.setenv('HERMES_HOME', str(home))
    monkeypatch.setattr(server, '_hermes_home', str(home))
    monkeypatch.setenv('HERMES_BUNDLED_PLUGINS', str(bundled_home / 'plugins'))
    assert call(action='skill', skill='demo:sample', operation='view')['skill']['customizable']
    call(action='skill', skill='demo:sample', operation='customize')
    call(action='skill', skill='demo:sample', operation='save', content='override')
    assert plugins.get_plugin_manager().find_plugin_skill('demo:sample').read_text() == 'override'
    assert (source / 'skills/sample/SKILL.md').read_text() == 'original'
    call(action='skill', skill='demo:sample', operation='disable')
    assert plugins.get_plugin_manager().find_plugin_skill('demo:sample') is None
    call(action='skill', skill='demo:sample', operation='enable')
    call(action='skill', skill='demo:sample', operation='reset')
    assert plugins.get_plugin_manager().find_plugin_skill('demo:sample').read_text() == 'original'
    for params in [dict(action='skill', skill='demo:sample', operation='save', content='bad'),
                   dict(action='skill', skill='demo:sample', operation='delete'),
                   dict(action='skill', skill='demo:../escape', operation='customize'),
                   dict(action='remove', name='../vendor')]:
        assert 'error' in server.handle_request({'id': 'bad', 'method': 'plugins.manage', 'params': params})
    outside = tmp_path / 'outside'; outside.mkdir()
    override = home / 'plugin-skill-overrides/demo/sample'
    override.rmdir()
    override.symlink_to(outside, target_is_directory=True)
    response = server.handle_request({'id': 'bad', 'method': 'plugins.manage', 'params': {
        'action': 'skill', 'skill': 'demo:sample', 'operation': 'customize'}})
    assert 'error' in response
    assert list(outside.iterdir()) == []
