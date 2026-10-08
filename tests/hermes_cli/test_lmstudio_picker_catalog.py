"""Named LM Studio endpoints must expose chat models across refresh/cache/config paths."""
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from hermes_cli.model_switch_providers import (
    _discover_endpoint_models,
    _endpoint_native_catalog_provider,
    _fetch_picker_live_models,
)
from hermes_cli.models import cached_fetch_api_models


@pytest.fixture
def model_server():
    state = {"models": [
        {"key": "local/chat", "type": "llm"},
        {"key": "opaque-vector-model", "type": "embedding"},
    ], "requests": [], "native": True}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            state["requests"].append((self.path, self.headers.get("X-Test")))
            if self.path == "/api/v1/models" and state["native"]:
                data = {"models": state["models"]}
            elif self.path == "/v1/models":
                data = {"data": [{"id": row["key"]} for row in state["models"]]}
            else:
                self.send_error(404)
                return
            self.send_response(200)
            self.end_headers()
            self.wfile.write(json.dumps(data).encode())

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/v1", state
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


@pytest.mark.parametrize("embedding_only", [False, True])
def test_lmstudio_native_catalog_survives_cache_and_saved_snapshot(model_server, embedding_only, monkeypatch):
    from hermes_cli.config import load_config, save_config
    url, state = model_server
    if embedding_only:
        state["models"] = state["models"][1:]
    expected = [] if embedding_only else ["local/chat"]
    headers = {"X-Test": "catalog"}
    cfg = load_config()
    cfg["custom_providers"] = [{"name": "LM Studio Local", "base_url": url,
                                "api_key": "local-key", "extra_headers": headers,
                                "models": {"opaque-vector-model": {}}, "models_discovered": True}]
    save_config(cfg)
    provider = _endpoint_native_catalog_provider("LM Studio Local", url)
    discovered, empty = _discover_endpoint_models(
        "local-key", url, provider, False, headers=headers, api_mode=None,
        probe_live=True, discovery_allowed=True, for_picker=True)
    assert discovered == expected
    assert empty == embedding_only
    assert state["requests"] == [("/api/v1/models", "catalog")]
    assert cached_fetch_api_models("local-key", url, headers=headers, cache_only=True) == expected
    cached, cached_empty = _discover_endpoint_models(
        "local-key", url, provider, False, headers=headers, api_mode=None,
        probe_live=False, discovery_allowed=True, for_picker=True)
    assert (cached, cached_empty) == (expected, embedding_only)
    assert len(state["requests"]) == 1
    # Exercise the actual named-provider row builder, including its snapshot write.
    monkeypatch.setattr("hermes_cli.model_switch_providers._build_curated_lists", lambda *a, **k: {})
    monkeypatch.setattr("hermes_cli.model_switch_providers._iter_builtin_candidates", lambda *a, **k: [])
    monkeypatch.setattr("hermes_cli.providers.HERMES_OVERLAYS", {})
    from hermes_cli.model_switch_providers import list_authenticated_providers
    rows = list_authenticated_providers(custom_providers=load_config()["custom_providers"], for_picker=True)
    row = next(row for row in rows if row["name"] == "LM Studio Local")
    assert row["models"] == expected
    if expected:
        assert list(load_config()["custom_providers"][0]["models"]) == expected


def test_native_failure_preserves_generic_endpoint_and_explicit_allowlist(model_server):
    url, state = model_server
    state["native"] = False
    # Older endpoints retain the generic fallback, and explicit allowlists still opt out.
    assert _fetch_picker_live_models("key", url, "lmstudio", True, cache=False) is None
    assert not state["requests"]
    assert _fetch_picker_live_models("key", url, "lmstudio", False, cache=False) == [
        row["key"] for row in state["models"]]
    assert [path for path, _ in state["requests"]] == ["/api/v1/models", "/v1/models"]
    assert _endpoint_native_catalog_provider("Other endpoint", "http://host:8000/v1") == "custom"
    assert _endpoint_native_catalog_provider("Other endpoint", "http://host:1234/v1") == "lmstudio"
