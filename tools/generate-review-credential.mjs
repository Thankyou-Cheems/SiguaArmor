import { createHash, randomBytes, randomInt } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { EDGE_TOKEN_SECRET_ALPHABET } from "../review-gateway/server.mjs";

function randomFromAlphabet(alphabet, length) {
  return Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join("");
}

function validateIdentity(id, owner) {
  if (typeof id !== "string" || !/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(id)) {
    throw new Error("--id must be a lowercase kebab-case credential id (1-64 characters)");
  }
  if (typeof owner !== "string" || owner.length < 1 || owner.length > 80) {
    throw new Error("--owner must contain between 1 and 80 characters");
  }
}

export function generateReviewCredential(id, owner) {
  validateIdentity(id, owner);
  const reviewerKey = randomBytes(32).toString("base64url");
  return Object.freeze({
    reviewerKey,
    credential: Object.freeze({
      id,
      owner,
      keyHash: createHash("sha256").update(reviewerKey, "utf8").digest("hex"),
    }),
  });
}

export function generateRuntimeSecrets() {
  const entropyBits = 40 * Math.log2(EDGE_TOKEN_SECRET_ALPHABET.length);
  if (entropyBits < 256) {
    throw new Error("EdgeOne secret alphabet does not provide 256 bits of entropy");
  }
  return Object.freeze({
    sessionSecret: randomBytes(32).toString("base64url"),
    edgeTokenSecret: randomFromAlphabet(EDGE_TOKEN_SECRET_ALPHABET, 40),
  });
}

function argumentValue(argumentsList, name) {
  const index = argumentsList.indexOf(name);
  if (index === -1 || index + 1 >= argumentsList.length) {
    return undefined;
  }
  return argumentsList[index + 1];
}

function assertKnownArguments(argumentsList, command) {
  const allowed = command === "secrets" ? new Set() : new Set(["--id", "--owner"]);
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (!allowed.has(argument)) {
      throw new Error(`unknown argument: ${argument}`);
    }
    index += 1;
  }
}

function usage() {
  return [
    "Usage:",
    "  node tools/generate-review-credential.mjs credential --id <id> --owner <watermark owner>",
    "  node tools/generate-review-credential.mjs secrets",
    "  node tools/generate-review-credential.mjs bundle --id <id> --owner <watermark owner>",
    "",
    "The command writes secrets to stdout exactly once. Store them only in ignored runtime configuration.",
  ].join("\n");
}

function run(argumentsList) {
  const [command, ...rest] = argumentsList;
  if (!new Set(["credential", "secrets", "bundle"]).has(command)) {
    throw new Error(usage());
  }
  assertKnownArguments(rest, command);
  if (command === "secrets") {
    return generateRuntimeSecrets();
  }
  const credential = generateReviewCredential(
    argumentValue(rest, "--id"),
    argumentValue(rest, "--owner"),
  );
  if (command === "credential") {
    return credential;
  }
  return Object.freeze({ ...credential, ...generateRuntimeSecrets() });
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  try {
    process.stdout.write(`${JSON.stringify(run(process.argv.slice(2)), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
