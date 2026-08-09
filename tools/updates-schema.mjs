import Ajv2020 from "ajv/dist/2020.js";
import { readFile } from "node:fs/promises";

import { parseUpdatesDocument } from "../lib/updates-document.mjs";

const SCHEMA_URL = new URL("../docs/specs/schemas/updates.schema.json", import.meta.url);
let validatorPromise;

async function loadValidator() {
  const schema = JSON.parse(await readFile(SCHEMA_URL, "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  return ajv.compile(schema);
}

function validator() {
  validatorPromise ??= loadValidator();
  return validatorPromise;
}

export async function validateUpdatesDocument(value) {
  const validate = await validator();
  const schemaValid = validate(value);
  const parsed = schemaValid ? parseUpdatesDocument(value) : null;
  return {
    valid: Boolean(schemaValid && parsed),
    document: parsed,
    errors: schemaValid
      ? parsed
        ? []
        : ["runtime safety validation failed (ordering, duplicate id, or non-canonical text)"]
      : (validate.errors || []).map(
          ({ instancePath, message }) => `${instancePath || "/"} ${message || "is invalid"}`,
        ),
  };
}

export async function assertUpdatesDocument(value) {
  const result = await validateUpdatesDocument(value);
  if (!result.valid || !result.document) {
    throw new Error(`invalid updates document: ${result.errors.join("; ")}`);
  }
  return result.document;
}
