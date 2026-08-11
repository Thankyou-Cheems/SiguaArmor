export const RUNTIME_DOCUMENT_UPDATED_EVENT = "sigua:runtime-document-updated";

export type RuntimeDocumentName =
  | "notices"
  | "supporters"
  | "updates-china"
  | "updates-international";

export function dispatchRuntimeDocumentUpdated(documentName: RuntimeDocumentName) {
  window.dispatchEvent(
    new CustomEvent<RuntimeDocumentName>(RUNTIME_DOCUMENT_UPDATED_EVENT, {
      detail: documentName,
    }),
  );
}

export function isRuntimeDocumentUpdatedEvent(
  event: Event,
  documentName: RuntimeDocumentName,
) {
  return event instanceof CustomEvent && event.detail === documentName;
}
