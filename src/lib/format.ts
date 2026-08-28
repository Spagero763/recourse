export const SYMBOLS: Record<string, string> = {
  GBP: "£",
  USD: "$",
  EUR: "€",
  NGN: "₦",
};

export function symbolFor(currency: string): string {
  return SYMBOLS[currency] ?? `${currency} `;
}

export function amount(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export function clockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relative(ms: number): string {
  const seconds = Math.round((Date.now() - ms) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return shortDate(ms);
}

export function countdown(ms: number): string {
  const days = Math.ceil((ms - Date.now()) / 86_400_000);
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

type Tone = "wait" | "live" | "won" | "dead";

export const STATUS: Record<string, { label: string; tone: Tone }> = {
  drafting: { label: "Drafting", tone: "wait" },
  awaiting_reply: { label: "Awaiting reply", tone: "wait" },
  negotiating: { label: "Negotiating", tone: "live" },
  escalated: { label: "Escalated", tone: "live" },
  resolved: { label: "Resolved", tone: "won" },
  closed: { label: "Closed", tone: "dead" },
};

export const TONE_CLASS: Record<Tone, string> = {
  wait: "text-state-wait bg-sunk",
  live: "text-state-live bg-state-live-wash",
  won: "text-state-won bg-state-won-wash",
  dead: "text-state-dead bg-state-dead-wash",
};

// Splits letter text on bracketed clause references so each one can be made
// interactive without touching the letter's own wording.
export function segmentCitations(
  body: string,
): Array<{ text: string; ref?: string }> {
  const parts: Array<{ text: string; ref?: string }> = [];
  const pattern = /\[([^\]\n]{1,60})\]/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(body))) {
    if (match.index > cursor) {
      parts.push({ text: body.slice(cursor, match.index) });
    }
    parts.push({ text: match[0], ref: match[1] });
    cursor = match.index + match[0].length;
  }
  if (cursor < body.length) parts.push({ text: body.slice(cursor) });
  return parts;
}

export function refKey(raw: string): string {
  return String(raw)
    .toLowerCase()
    .replace(/[[\]()]/g, "")
    .replace(/[.\s]+$/, "")
    .trim();
}
