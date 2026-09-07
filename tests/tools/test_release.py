import copy
import importlib.util
import io
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import subprocess
import tarfile
import tempfile
import threading
import unittest

SPEC = importlib.util.spec_from_file_location(
    "release", Path(__file__).resolve().parents[2] / "tools/deploy/remote-release.py"
)
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)


class FakeHost:
    def __init__(self):
        self.restarts = []
        self.fail_verify = False

    def config(self, folder):
        return json.loads((folder / "docker-compose.yml").read_text())

    def validate(self, folder, config):
        pass

    def restart(self, services):
        self.restarts.append(services)

    def verify(self):
        if self.fail_verify:
            self.fail_verify = False
            raise RuntimeError("unhealthy candidate")


def fixture(folder):
    folder.mkdir(exist_ok=True)
    for name in release.PARTS:
        path = folder / name
        path.parent.mkdir(parents=True, exist_ok=True)
        if name in ("Caddyfile", "docker-compose.yml", "release/index.html"):
            path.write_text("old", encoding="utf-8")
        else:
            path.mkdir()
            (path / "app.js").write_text("old", encoding="utf-8")
    assets = folder / "release/squad/assets"
    assets.mkdir()
    (assets / "old.js").write_text("old chunk", encoding="utf-8")
    (folder / "docker-compose.yml").write_text(json.dumps({
        "services": {name: {"image": "test", "environment": {}} for name in release.SERVICES}
    }))
    release.write_json(folder / "release.json", {"sourceCommit": "old"})


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "stack"
        fixture(self.root)
        (self.root / "data").mkdir()
        (self.root / "data/analytics.db").write_bytes(b"live database")
        (self.root / ".env").write_text("secret")
        self.host = FakeHost()

    def candidate(self):
        candidate = self.root / "incoming"
        release.snapshot(self.root, candidate)
        release.write_json(candidate / "release.json", {"sourceCommit": "new"})
        return candidate

    def test_origin_probe_uses_site_host_when_connecting_to_service_address(self):
        seen = []
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                seen.append(self.path)
                valid = self.headers.get('Host') == 'armor.example' and self.headers.get('X-Sigua-Origin-Auth') == 'test-only'
                self.send_response((401 if self.path.startswith('/__admin') else 200) if valid else 404)
                self.end_headers()
            def log_message(self, *args):
                pass
        with HTTPServer(('127.0.0.1', 0), Handler) as server:
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                result = subprocess.run(['node', '-e', release.PROBE_SCRIPT], capture_output=True, text=True,
                    env={**os.environ, 'SIGUA_PUBLIC_ORIGIN': 'https://armor.example',
                         'SIGUA_ORIGIN_AUTH_SECRET': 'test-only',
                         'SIGUA_PROBE_CONNECT': f'http://127.0.0.1:{server.server_port}'}, timeout=20)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(seen, ['/', '/squad/', '/sigua/', '/__admin/content/session'])
            finally:
                server.shutdown()
                thread.join()

    def test_static_publish_preserves_mounts_services_and_live_data(self):
        candidate = self.candidate()
        (candidate / "release/squad/assets/old.js").unlink()
        (candidate / "release/squad/assets/new.js").write_text("new chunk")
        mount = (self.root / "release").stat().st_ino
        service = (self.root / "services/content-admin").stat().st_ino
        result = release.activate(self.root, candidate, self.host)
        self.assertEqual(result["restarted"], [])
        self.assertEqual(mount, (self.root / "release").stat().st_ino)
        self.assertEqual(service, (self.root / "services/content-admin").stat().st_ino)
        self.assertEqual((self.root / "data/analytics.db").read_bytes(), b"live database")
        self.assertEqual((self.root / ".env").read_text(), "secret")
        self.assertTrue((self.root / "release/previous-assets/assets/old.js").is_file())
        self.assertFalse((self.root / "release/previous-assets/index.html").exists())
        self.assertFalse(candidate.exists())

    def test_service_change_only_recreates_that_service(self):
        candidate = self.candidate()
        (candidate / "services/content-admin/app.js").write_text("new")
        result = release.activate(self.root, candidate, self.host)
        self.assertEqual(result["restarted"], ["sigua-content-admin"])

    def test_compose_change_recreates_only_changed_service(self):
        before = self.host.config(self.root)
        after = copy.deepcopy(before)
        after["services"]["sigua-international"]["environment"]["OPTION"] = "new"
        self.assertEqual(release.affected_services(["docker-compose.yml"], before, after), ["sigua-international"])

    def test_failed_activation_restores_complete_current_and_keeps_previous(self):
        fixture(self.root / "previous")
        (self.root / "previous/release/index.html").write_text("older")
        candidate = self.candidate()
        (candidate / "release/international-runtime/app.js").write_text("broken")
        self.host.fail_verify = True
        with self.assertRaisesRegex(RuntimeError, "unhealthy candidate"):
            release.activate(self.root, candidate, self.host)
        self.assertEqual((self.root / "release/international-runtime/app.js").read_text(), "old")
        self.assertEqual((self.root / "previous/release/index.html").read_text(), "older")
        self.assertFalse((self.root / ".previous-pending").exists())
        self.assertTrue(candidate.exists())

    def test_rollback_is_reversible_and_rotates_one_previous(self):
        candidate = self.candidate()
        (candidate / "Caddyfile").write_text("new config")
        release.activate(self.root, candidate, self.host)
        result = release.rollback(self.root, self.host)
        self.assertEqual(result["restarted"], ["sigua-public"])
        self.assertEqual((self.root / "Caddyfile").read_text(), "old")
        self.assertEqual((self.root / "previous/Caddyfile").read_text(), "new config")
        release.rollback(self.root, self.host)
        self.assertEqual((self.root / "Caddyfile").read_text(), "new config")

    def test_interrupted_switch_restores_missing_component(self):
        release.snapshot(self.root, self.root / ".previous-pending")
        (self.root / "docker-compose.yml").rename(self.root / "docker-compose.yml.deploy-old")
        (self.root / "release/index.html").write_text("partial")
        result = release.rollback(self.root, self.host)
        self.assertTrue(result["recoveredInterruptedRelease"])
        self.assertEqual((self.root / "release/index.html").read_text(), "old")
        self.assertTrue((self.root / "docker-compose.yml").is_file())
        self.assertFalse((self.root / "docker-compose.yml.deploy-old").exists())

    def test_identical_build_does_not_discard_functional_rollback(self):
        fixture(self.root / "previous")
        (self.root / "previous/release/index.html").write_text("older")
        result = release.activate(self.root, self.candidate(), self.host)
        self.assertEqual(result["restarted"], [])
        self.assertEqual((self.root / "previous/release/index.html").read_text(), "older")

    def test_assets_rotate_without_accumulating_older_generations(self):
        for number in range(2):
            candidate = self.candidate()
            asset_dir = candidate / "release/squad/assets"
            release.remove(asset_dir)
            asset_dir.mkdir()
            (asset_dir / f"build-{number}.js").write_text(str(number))
            release.activate(self.root, candidate, self.host)
        self.assertEqual([p.name for p in (self.root / "release/previous-assets/assets").iterdir()], ["build-0.js"])
        self.assertFalse((self.root / "previous/release/previous-assets").exists())

    def test_incomplete_candidate_never_changes_live_version(self):
        candidate = self.candidate()
        release.remove(candidate / "release/squad")
        with self.assertRaisesRegex(RuntimeError, "Incomplete release"):
            release.activate(self.root, candidate, self.host)
        self.assertEqual((self.root / "release/index.html").read_text(), "old")

    def test_archive_rejects_traversal_and_links(self):
        for number, (name, member_type) in enumerate((("../escape", tarfile.REGTYPE),
                                                    ("release/link", tarfile.SYMTYPE))):
            archive = Path(self.temp.name) / f"bad-{number}.tar.gz"
            with tarfile.open(archive, "w:gz") as tar:
                member = tarfile.TarInfo(name)
                member.type = member_type
                member.size = 1 if member.isfile() else 0
                member.linkname = "/etc"
                tar.addfile(member, io.BytesIO(b"x") if member.isfile() else None)
            with self.assertRaisesRegex(RuntimeError, "Unsafe archive"):
                release.unpack(archive, self.root / f"bad-{number}")
        self.assertFalse((self.root / "escape").exists())


if __name__ == "__main__":
    unittest.main()
