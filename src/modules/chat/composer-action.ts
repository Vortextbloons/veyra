/**
 * The primary action behind the composer's submit button.
 *
 * While a response is running the button turns into Stop whenever there is no
 * text to steer with, so an empty composer never becomes a dead end that leaves
 * the user waiting with only the Escape shortcut. Attachments cannot steer a
 * run, so they do not keep the button in its Send form.
 */
export type ComposerAction = "send" | "steer" | "stop" | "save-edit" | "busy";

export function resolveComposerAction({
  busy,
  stopAvailable,
  steerAvailable,
  editMode,
  sendingSteer,
  hasText,
}: {
  busy: boolean;
  /** A stop handler is wired up, so the run can actually be cancelled. */
  stopAvailable: boolean;
  /** Steering accepts text while the run continues. */
  steerAvailable: boolean;
  editMode: boolean;
  /** A steer submission is already in flight. */
  sendingSteer: boolean;
  /** The composer holds text to submit. */
  hasText: boolean;
}): ComposerAction {
  if (sendingSteer) return "steer";
  if (editMode) return "save-edit";
  if (busy) {
    if (steerAvailable && hasText) return "steer";
    return stopAvailable ? "stop" : "busy";
  }
  return "send";
}
