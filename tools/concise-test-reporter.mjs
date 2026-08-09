function firstErrorLine(error) {
  if (!error) return null;
  const message =
    typeof error.message === "string"
      ? error.message
      : String(error);
  return message.split(/\r?\n/u)[0].slice(0, 500);
}

export default async function* conciseTestReporter(source) {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for await (const event of source) {
    if (event.type === "test:pass") {
      passed += 1;
      continue;
    }
    if (event.type === "test:fail") {
      failed += 1;
      yield `${JSON.stringify({
        event: "test-failure",
        name: event.data.name,
        file: event.data.file ?? null,
        line: event.data.line ?? null,
        error: firstErrorLine(event.data.details?.error),
      })}\n`;
      continue;
    }
    if (event.type === "test:skip") {
      skipped += 1;
    }
  }
  yield `${JSON.stringify({
    event: "test-summary",
    passed,
    failed,
    skipped,
  })}\n`;
}
