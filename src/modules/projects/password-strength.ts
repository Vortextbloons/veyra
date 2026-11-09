/**
 * Password strength for the lock-creation form.
 *
 * This is advisory UI only. The enforced rule is the backend's minimum length
 * and character-class check; strength here exists to discourage a password that
 * someone could guess, because there is no recovery path if it is forgotten.
 */

export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Very weak" | "Weak" | "Fair" | "Strong" | "Very strong";
  /** 0–100, for the meter width. */
  percent: number;
  warnings: string[];
};

const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890",
  "qwertyuiop", "letmein123", "iloveyou", "admin1234", "welcome123", "changeme",
  "correcthorsebatterystaple", "trustno1", "sunshine1", "monkey123",
]);

/** Approximate guesses per second for offline Argon2id cracking on a GPU. */
const GUESSES_PER_SECOND = 1e6;

export function evaluatePasswordStrength(password: string): PasswordStrength {
  const warnings: string[] = [];
  const length = [...password].length;

  if (length === 0) {
    return { score: 0, label: "Very weak", percent: 0, warnings: ["Enter a password."] };
  }

  let score = 0;
  if (length >= 10) score += 1;
  if (length >= 14) score += 1;
  if (length >= 20) score += 1;

  const classes = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  if (classes >= 3) score += 1;

  // Repeated or sequential characters add little real entropy.
  if (/(.)\1{2,}/.test(password)) {
    score = Math.max(0, score - 1);
    warnings.push("Repeated characters are easy to guess.");
  }
  if (/^(?:0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf)/i.test(password)) {
    score = Math.max(0, score - 1);
    warnings.push("Sequences like 1234 or qwerty are easy to guess.");
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    score = 0;
    warnings.push("This is one of the most commonly used passwords.");
  }
  if (length < 10) {
    warnings.push("Use at least 10 characters.");
  } else if (length < 14 && classes < 3) {
    warnings.push("Add another character type, or make it longer.");
  }

  const bounded = Math.min(4, Math.max(0, score)) as PasswordStrength["score"];
  const labels: Record<PasswordStrength["score"], PasswordStrength["label"]> = {
    0: "Very weak",
    1: "Weak",
    2: "Fair",
    3: "Strong",
    4: "Very strong",
  };
  return {
    score: bounded,
    label: labels[bounded],
    percent: [8, 30, 55, 78, 100][bounded],
    warnings,
  };
}

/** Rough offline-cracking estimate, shown as an order of magnitude. */
export function estimateCrackTime(password: string): string {
  const length = [...password].length;
  if (length === 0) return "";
  let alphabet = 0;
  if (/[a-z]/.test(password)) alphabet += 26;
  if (/[A-Z]/.test(password)) alphabet += 26;
  if (/[0-9]/.test(password)) alphabet += 10;
  if (/[^A-Za-z0-9]/.test(password)) alphabet += 33;
  if (alphabet === 0) return "";
  const guesses = Math.pow(alphabet, length) / 2;
  const seconds = guesses / GUESSES_PER_SECOND;

  if (seconds < 1) return "instantly";
  if (seconds < 60) return `${Math.round(seconds)} seconds`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} hours`;
  if (seconds < 31_536_000) return `${Math.round(seconds / 86_400)} days`;
  if (seconds < 31_536_000 * 1000) return `${Math.round(seconds / 31_536_000)} years`;
  if (seconds < 31_536_000 * 1e6) return `${Math.round(seconds / (31_536_000 * 1000))} thousand years`;
  return "longer than the age of the universe";
}
