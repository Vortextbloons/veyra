type AbortHandler = () => void;

let handler: AbortHandler | null = null;

export function registerPendingQuestionAbort(onAbort: AbortHandler) {
  handler = onAbort;
}

export function unregisterPendingQuestionAbort() {
  handler = null;
}

export function abortPendingQuestion() {
  handler?.();
  handler = null;
}
