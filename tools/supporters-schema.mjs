import Ajv2020 from "ajv/dist/2020.js";
import { readFile } from "node:fs/promises";

import { parseSupportersDocument } from "../lib/supporters-document.mjs";

const SCHEMA_URL = new URL("../docs/specs/schemas/supporters.schema.json", import.meta.url);
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

export async function validateSupportersDocument(value) {
  const validate = await validator();
  const schemaValid = validate(value);
  const parsed = schemaValid ? parseSupportersDocument(value) : null;
  return {
    valid: Boolean(schemaValid && parsed),
    document: parsed,
    errors: schemaValid
      ? parsed
        ? []
        : ["runtime safety validation failed (duplicate id, unsafe URL, or non-canonical text)"]
      : (validate.errors || []).map(
          ({ instancePath, message }) => `${instancePath || "/"} ${message || "is invalid"}`,
        ),
  };
}

export async function assertSupportersDocument(value) {
  const result = await validateSupportersDocument(value);
  if (!result.valid || !result.document) {
    throw new Error(`invalid supporters document: ${result.errors.join("; ")}`);
  }
  return result.document;
}
