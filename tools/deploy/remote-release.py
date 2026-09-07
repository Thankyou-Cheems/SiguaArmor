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
    "release/squad", "release/international-runtime", "release/index.html",
    "release/navigator", "release/portal-assets", "services/content-admin",
    "services/analytics", "Caddyfile", "docker-compose.yml",
)
SERVICES = ("sigua-international", "sigua-content-admin", "sigua-analytics", "sigua-public")
RESTART_FOR = {
    "release/international-runtime": "sigua-international",
    "services/content-admin": "sigua-content-admin",
    "services/analytics": "sigua-analytics",
    "Caddyfile": "sigua-public",
}


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
                   for p in (*PARTS, "release.json")):
            raise RuntimeError(f"Unexpected release file: {relative}")


def unpack(archive, folder):
    folder.mkdir()
    with tarfile.open(archive, "r:gz") as package:
        members = package.getmembers()
        for member in members:
            name = PurePosixPath(member.name)
            if name.is_absolute() or ".." in name.parts or not (member.isfile() or member.isdir()):
                raise RuntimeError(f"Unsafe archive member: {member.name}")
            if any(part.startswith(".") and part != "." for part in name.parts):
                raise RuntimeError(f"Unexpected hidden file: {member.name}")
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
    for name in PARTS:
        copy(root / name, staging / name)
    metadata = read_json(root / "release.json") if (root / "release.json").exists() else {
        "sourceCommit": None, "note": "Imported live version; see migration record for source."
    }
    write_json(staging / "release.json", metadata)
    staging.rename(target)


def changed_parts(root, candidate):
    filecmp.clear_cache()
    return [name for name in PARTS if not equal(root / name, candidate / name)]


def affected_services(changes, before, after):
    if set(before["services"]) != set(SERVICES) or set(after["services"]) != set(SERVICES):
        raise RuntimeError("Service additions/removals require an explicit host migration")
    affected = {RESTART_FOR[p] for p in changes if p in RESTART_FOR}
    affected.update(s for s in SERVICES if before["services"][s] != after["services"][s])
    if any(before.get(key) != after.get(key) for key in ("networks", "volumes", "secrets", "configs")):
        affected.update(SERVICES)
    return [s for s in SERVICES if s in affected]


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
        for service in SERVICES:
            status = self.run(["docker", "inspect", "--format", "{{.State.Health.Status}}", service]).strip()
            if status != "healthy":
                raise RuntimeError(f"{service}: {status}")
        # Run inside an existing Node service; secrets stay in its environment.
        script = """(async () => {
          const host = new URL(process.env.SIGUA_PUBLIC_ORIGIN).host;
          const cases = [['/',200],['/squad/',200],['/sigua/',200],['/__admin/content/session',401]];
          for (const [path,status] of cases) {
            const response = await fetch('http://sigua-public:8080'+path, {
              headers: {Host: host, Accept: 'text/html',
                'X-Sigua-Origin-Auth': process.env.SIGUA_ORIGIN_AUTH_SECRET},
              signal: AbortSignal.timeout(15000)});
            if (response.status !== status) throw Error(path+': '+response.status);
            await response.arrayBuffer();
          }
        })().catch(error => {console.error(error.message);process.exit(1)})"""
        self.run(["docker", "exec", "sigua-content-admin", "node", "-e", script])


def replace_parts(root, source, names):
    for name in names:
        target = root / name
        staged = target.with_name(target.name + ".deploy-new")
        retired = target.with_name(target.name + ".deploy-old")
        remove(staged)
        copy(source / name, staged)
        remove(retired)
        if target.exists():
            target.rename(retired)
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
    except BaseException:
        # Restore every component; also recovers an interruption between two renames.
        replace_parts(root, pending, PARTS)
        host.restart(list(SERVICES))
        host.verify()
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
        replace_parts(root, pending, PARTS)
        host.restart(list(SERVICES))
        host.verify()
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
