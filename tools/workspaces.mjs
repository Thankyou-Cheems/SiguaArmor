import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function git(args, cwd = root, allowFailure = false) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) throw new Error(result.stderr.trim());
  return allowFailure ? result.status === 0 : result.stdout;
}

const annotated = new Map();
for (const line of git(["for-each-ref", "refs/tags", "--format=%(refname:short)%00%(*objectname)%00%(objecttype)"]).trim().split("\n")) {
  const [tag, commit, type] = line.split("\0");
  if (type === "tag") annotated.set(commit, [...(annotated.get(commit) ?? []), tag]);
}
const worktrees = [];
for (const block of git(["worktree", "list", "--porcelain", "-z"]).split("\0\0").filter(Boolean)) {
  const fields = Object.fromEntries(block.split("\0").filter(Boolean).map((field) => {
    const space = field.indexOf(" ");
    return space < 0 ? [field, true] : [field.slice(0, space), field.slice(space + 1)];
  }));
  const location = fields.worktree;
  const relative = path.relative(root, location);
  const managed = relative === "" || (relative.startsWith(`.local${path.sep}worktrees${path.sep}`) && !path.isAbsolute(relative));
  try {
    worktrees.push({ path: location, branch: fields.branch?.replace("refs/heads/", "") ?? "detached", commit: fields.HEAD,
      managed, dirty: git(["status", "--porcelain", "-z"], location).length > 0,
      ignoredEntries: git(["ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z"], location).split("\0").filter(Boolean),
      locked: fields.locked ?? false });
  } catch (error) {
    worktrees.push({ path: location, error: error.message });
  }
}
const branches = git(["for-each-ref", "refs/heads", "--format=%(refname:short)%00%(objectname)"]).trim().split("\n").filter(Boolean).map((line) => {
  const [branch, commit] = line.split("\0");
  return { branch, commit, retainedOnMain: git(["merge-base", "--is-ancestor", commit, "main"], root, true),
    exactAnnotatedTags: annotated.get(commit) ?? [] };
});
console.log(JSON.stringify({ root, main: git(["rev-parse", "main"]).trim(), worktrees, branches,
  note: "Read-only inventory. A retained commit and clean status do not authorize removal: review ignored custody and active process ownership." }, null, 2));
