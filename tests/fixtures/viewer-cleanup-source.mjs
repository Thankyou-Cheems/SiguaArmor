import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../../app/ViewerErrorBoundary.tsx", import.meta.url), "utf8");
const parsed = ts.createSourceFile("ViewerErrorBoundary.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const node = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "createViewerCleanup");
if (!node) throw new Error("Missing production viewer cleanup");
const context = { console };
vm.runInNewContext(ts.transpileModule(node.getText(parsed).replace(/^export /u, "") + "\nglobalThis.createViewerCleanup = createViewerCleanup;", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
export const createViewerCleanup = context.createViewerCleanup;
