import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../../app/ViewerErrorBoundary.tsx", import.meta.url), "utf8");
const parsed = ts.createSourceFile("ViewerErrorBoundary.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const node = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "createViewerCleanup");
if (!node) throw new Error("Missing production viewer cleanup");
const code = parsed.statements.find((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((item) => item.name.getText(parsed) === "VIEWER_CONTEXT_LOST"));
if (!code) throw new Error("Missing production context-loss code");
const context = { console };
vm.runInNewContext(ts.transpileModule(code.getText(parsed).replace(/^export /u, "") + "\n" + node.getText(parsed).replace(/^export /u, "") + "\nObject.assign(globalThis, { createViewerCleanup, VIEWER_CONTEXT_LOST });", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
export const createViewerCleanup = context.createViewerCleanup;

export const VIEWER_CONTEXT_LOST = context.VIEWER_CONTEXT_LOST;
