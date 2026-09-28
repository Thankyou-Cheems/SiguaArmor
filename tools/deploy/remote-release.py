#!/usr/bin/env python3
"""Small, host-local release switcher. Persistent data is never part of a release."""

import argparse
import contextlib
import datetime
import filecmp
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import tarfile


PARTS = (
    "release/squad", "release/index.html",
    "release/navigator", "release/portal-assets", "services/content-admin",
    "services/analytics", "Caddyfile", "docker-compose.yml",
)
SERVICES = ("sigua-content-admin", "sigua-analytics", "sigua-public")
# One explicitly supported transition: remove the stateless page renderer,
# or restore it with the retained pre-export release. No arbitrary service migration.
LEGACY_SERVICE = "sigua-international"
OPTIONAL_PARTS = ("release/international-runtime",)
ALL_PARTS = (*PARTS, *OPTIONAL_PARTS)
RESTART_FOR = {
    "release/international-runtime": "sigua-international",
    "services/content-admin": "sigua-content-admin",
    "services/analytics": "sigua-analytics",
    "Caddyfile": "sigua-public",
}

# http.request preserves Host when connecting through a Docker service name;
# Node's fetch may replace it with the URL hostname.
PROBE_SCRIPT = """(async () => {
  const http = require('node:http');
  const host = new URL(process.env.SIGUA_PUBLIC_ORIGIN).host;
  const connection = new URL(process.env.SIGUA_PROBE_CONNECT || 'http://sigua-public:8080');
  const cases = [['/',200],['/squad/',200],['/sigua/',200],['/__admin/content/session',401]];
  if (process.env.SIGUA_PROBE_STATIC === '1') cases.push(
    ['/squad/duel',200,'text/html'], ['/sigua/duel',200,'text/html'],
    ['/squad/duel.rsc',200,'text/x-component'], ['/sigua/duel.rsc',200,'text/x-component'],
    ['/squad/factions/caf',200,'text/html'], ['/squad/__missing_release_probe__',404],
    ['/squad/server.js',404], ['/squad/',405,null,'POST']);
  for (const [path,status,contentType,method='GET'] of cases) {
    await new Promise((resolve,reject) => {
      const request = http.request({hostname: connection.hostname, port: connection.port, path, method,
        headers: {Host: host, Accept: 'text/html',
          'X-Sigua-Origin-Auth': process.env.SIGUA_ORIGIN_AUTH_SECRET}}, response => {
        response.resume();
        response.on('error', reject);
        response.on('end', () => response.statusCode === status &&
          (!contentType || response.headers['content-type']?.startsWith(contentType)) ? resolve() :
          reject(Error(path+': '+response.statusCode+' '+response.headers['content-type'])));
      });
      request.setTimeout(15000, () => request.destroy(Error(path+': timeout')));
      request.on('error', reject);
      request.end();
    });
  }
})().catch(error => {console.error(error.message);process.exit(1)})"""


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, value):
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def remove(path):
    if path.is_symlink():
        raise RuntimeError(f"Unexpected symlink: {path}")
    if path.is_dir():
        shutil.rmtree(path)
    elif path.exists():
        path.unlink()


def copy(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    if source.is_dir():
        shutil.copytree(source, target)
    else:
        shutil.copy2(source, target)


def equal(left, right):
    if left.is_file() and right.is_file():
        # mtime/size are insufficient for generated or restored files.
        return filecmp.cmp(left, right, shallow=False)
    if left.is_dir() and right.is_dir():
        names = {p.name for p in left.iterdir()}
        return names == {p.name for p in right.iterdir()} and all(
            equal(left / name, right / name) for name in names
        )
    return False


def validate_tree(folder):
    for name in (*PARTS, "release.json"):
        if not (folder / name).exists():
            raise RuntimeError(f"Incomplete release: {name}")
    for item in folder.rglob("*"):
        if item.is_symlink():
            raise RuntimeError(f"Release links are not supported: {item}")
        relative = item.relative_to(folder).as_posix()
        if not any(relative == p or relative.startswith(p + "/") or p.startswith(relative + "/")
                   for p in (*ALL_PARTS, "release.json")):
            raise RuntimeError(f"Unexpected release file: {relative}")


def unpack(archive, folder):
    folder.mkdir()
    with tarfile.open(archive, "r:gz") as package:
        members = package.getmembers()
        for member in members:
            name = PurePosixPath(member.name)
            if name.is_absolute() or ".." in name.parts or not (member.isfile() or member.isdir()):
                raise RuntimeError(f"Unsafe archive member: {member.name}")
        # Validated ordinary files/directories only; also works on Python 3.10 hosts.
        for member in members:
            target = folder.joinpath(*PurePosixPath(member.name).parts)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with package.extractfile(member) as source, target.open("wb") as dest:
                    shutil.copyfileobj(source, dest)
                target.chmod(member.mode & 0o755)
    validate_tree(folder)


def snapshot(root, target):
    staging = target.with_name(target.name + ".building")
    remove(staging)
    staging.mkdir()
    for name in ALL_PARTS:
        if name in PARTS or (root / name).exists():
            copy(root / name, staging / name)
    metadata = read_json(root / "release.json") if (root / "release.json").exists() else {
        "sourceCommit": None, "note": "Imported live version; see migration record for source."
    }
    write_json(staging / "release.json", metadata)
    staging.rename(target)


def changed_parts(root, candidate):
    filecmp.clear_cache()
    return [name for name in ALL_PARTS
            if ((root / name).exists() or (candidate / name).exists())
            and not equal(root / name, candidate / name)]


def service_names(config):
    names = set(config["services"])
    if names not in (set(SERVICES), {*SERVICES, LEGACY_SERVICE}):
        raise RuntimeError("Service additions/removals require an explicit host migration")
    return [s for s in (LEGACY_SERVICE, *SERVICES) if s in names]


def affected_services(changes, before, after):
    service_names(before)
    active = service_names(after)
    affected = {RESTART_FOR[p] for p in changes if p in RESTART_FOR and RESTART_FOR[p] in active}
    affected.update(s for s in active if before["services"].get(s) != after["services"][s])
    if any(before.get(key) != after.get(key) for key in ("networks", "volumes", "secrets", "configs")):
        affected.update(active)
    return [s for s in active if s in affected]


class Host:
    def __init__(self, root):
        self.root = root

    def run(self, args, timeout=180):
        result = subprocess.run(args, cwd=self.root, text=True, capture_output=True, timeout=timeout)
        if result.returncode:
            # Compose's resolved config can contain secrets; never echo its stdout.
            raise RuntimeError(f"{args[0]} failed ({result.returncode}): {result.stderr[-3000:]}")
        return result.stdout

    def compose(self, folder, *args):
        return self.run(["docker", "compose", "--project-directory", str(self.root),
                         "-f", str(folder / "docker-compose.yml"), *args])

    def config(self, folder):
        return json.loads(self.compose(folder, "config", "--format", "json"))

    def validate(self, folder, config):
        active = service_names(config)
        has_runtime = (folder / "release/international-runtime").is_dir()
        if (LEGACY_SERVICE in active) != has_runtime:
            raise RuntimeError("Renderer service and runtime files must be restored or removed together")
        self.run(["docker", "run", "--rm", "--network", "none", "--env-file", str(self.root / ".env"),
                  "-v", f"{folder / 'Caddyfile'}:/etc/caddy/Caddyfile:ro",
                  config["services"]["sigua-public"]["image"], "caddy", "validate",
                  "--config", "/etc/caddy/Caddyfile"])

    def restart(self, services):
        if "sigua-analytics" in services:
            self.compose(self.root, "build", "sigua-analytics")
        if services:
            self.compose(self.root, "up", "-d", "--no-deps", "--force-recreate", "--wait",
                         "--wait-timeout", "60", *services)

    def verify(self):
        for service in service_names(self.config(self.root)):
            status = self.run(["docker", "inspect", "--format", "{{.State.Health.Status}}", service]).strip()
            if status != "healthy":
                raise RuntimeError(f"{service}: {status}")
        # Run inside an existing Node service; secrets stay in its environment.
        metadata = read_json(self.root / "release.json")
        static = "1" if metadata.get("pageDelivery") == "static-export" else "0"
        self.run(["docker", "exec", "-e", f"SIGUA_PROBE_STATIC={static}", "sigua-content-admin", "node", "-e", PROBE_SCRIPT])

    def retire(self, services):
        for service in services:
            if service != LEGACY_SERVICE:
                raise RuntimeError(f"Unsupported service retirement: {service}")
            if self.run(["docker", "ps", "-a", "--filter", f"name=^/{service}$", "--format", "{{.Names}}"]).strip():
                # This renderer has only a read-only release mount; rollback retains
                # its configuration and executable files, never a live-data volume.
                self.run(["docker", "rm", "-f", service])


def replace_parts(root, source, names):
    for name in names:
        if name not in OPTIONAL_PARTS and not (source / name).exists():
            raise RuntimeError(f"Incomplete release: {name}")
        target = root / name
        staged = target.with_name(target.name + ".deploy-new")
        retired = target.with_name(target.name + ".deploy-old")
        remove(staged)
        if (source / name).exists():
            copy(source / name, staged)
        remove(retired)
        if target.exists():
            target.rename(retired)
        if staged.exists():
            staged.rename(target)
        remove(retired)
    write_json(root / "release.json", read_json(source / "release.json"))


def retain_browser_assets(root, source):
    # This stable parent is inside the existing Caddy mount. Never copy old HTML,
    # server code, arbitrary rollback directories, or the previous fallback itself.
    target = root / "release" / "previous-assets"
    staged = root / "release" / "previous-assets.deploy-new"
    remove(staged)
    staged.mkdir()
    for name in ("assets", "china-assets"):
        old = source / "release" / "squad" / name
        if old.is_dir():
            copy(old, staged / name)
    remove(target)
    staged.rename(target)


def activate(root, candidate, host):
    pending, previous = root / ".previous-pending", root / "previous"
    if pending.exists():
        raise RuntimeError("Interrupted release exists; run deploy:rollback before deploying again")
    validate_tree(candidate)
    before, after = host.config(root), host.config(candidate)
    changes = changed_parts(root, candidate)
    services = affected_services(changes, before, after)
    host.validate(candidate, after)
    if not changes:
        host.verify()
        metadata = read_json(candidate / "release.json")
        metadata["activatedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        write_json(root / "release.json", metadata)
        remove(candidate)
        return {"release": metadata, "changed": [], "restarted": []}
    snapshot(root, pending)
    try:
        if "release/squad" in changes:
            retain_browser_assets(root, pending)
        replace_parts(root, candidate, changes)
        host.restart(services)
        host.verify()
        host.retire(set(service_names(before)) - set(service_names(after)))
    except BaseException:
        # Restore every component; also recovers an interruption between two renames.
        replace_parts(root, pending, ALL_PARTS)
        host.restart(service_names(before))
        host.verify()
        host.retire(set(service_names(after)) - set(service_names(before)))
        remove(pending)
        raise
    remove(previous)
    pending.rename(previous)
    metadata = read_json(root / "release.json")
    metadata["activatedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    write_json(root / "release.json", metadata)
    remove(candidate)
    return {"release": metadata, "changed": changes, "restarted": services}


def rollback(root, host):
    pending, previous = root / ".previous-pending", root / "previous"
    if pending.exists():
        validate_tree(pending)
        replace_parts(root, pending, ALL_PARTS)
        active = service_names(host.config(root))
        host.restart(active)
        host.verify()
        host.retire({LEGACY_SERVICE} - set(active))
        remove(pending)
        return {"recoveredInterruptedRelease": True, "release": read_json(root / "release.json")}
    if not previous.exists():
        raise RuntimeError("No previous release")
    candidate = root / "incoming"
    remove(candidate)
    copy(previous, candidate)
    return activate(root, candidate, host)


@contextlib.contextmanager
def deployment_lock(root):
    import fcntl
    with (root / ".deploy.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("deploy", "rollback", "status"))
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--archive", type=Path)
    args = parser.parse_args()
    root = args.root.resolve(strict=True)
    if root == Path("/") or not (root / ".env").is_file() or not (root / "release").is_dir():
        parser.error("root must be an existing configured Armor stack")
    host = Host(root)
    with deployment_lock(root):
        if args.action == "status":
            print(json.dumps({name: read_json(root / name / "release.json")
                              if (root / name / "release.json").exists() else None
                              for name in (".", "previous", "incoming", ".previous-pending")}, indent=2))
        elif args.action == "rollback":
            print(json.dumps(rollback(root, host), indent=2))
        else:
            if not args.archive:
                parser.error("deploy requires --archive")
            if (root / ".previous-pending").exists():
                raise RuntimeError("Interrupted release exists; run deploy:rollback")
            candidate = root / "incoming"
            remove(candidate)
            unpack(args.archive, candidate)
            print(json.dumps(activate(root, candidate, host), indent=2))


if __name__ == "__main__":
    main()
