import { env } from "../_generated/server";

// @agentmail/convex 0.1.0 exposes its remote calls as internalActions, and on
// convex 1.45 those do not resolve from the parent app: `Couldn't resolve
// agentmail.lib.listInboxes`. Its queries and mutations resolve fine, so the
// component still owns inbound ingest and the reactive message store, and only
// the outbound calls come through here against the same REST API it wraps.
const BASE = "https://api.agentmail.to/v0";

async function call<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${env.AGENTMAIL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `AgentMail ${init?.method ?? "GET"} ${path} failed: ${response.status} ${text.slice(0, 300)}`,
    );
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export type Inbox = {
  inbox_id: string;
  // The API calls this "email"; it is the same string as inbox_id today, but
  // reading it from the documented field rather than relying on that.
  email?: string;
  display_name?: string;
};

export async function listInboxes(): Promise<Array<Inbox>> {
  const body = await call<{ inboxes?: Array<Inbox>; count?: number }>("/inboxes");
  return body.inboxes ?? [];
}

export async function createInbox(args: {
  username?: string;
  displayName?: string;
}): Promise<Inbox> {
  return await call<Inbox>("/inboxes", {
    method: "POST",
    body: { username: args.username, display_name: args.displayName },
  });
}

export type SentMessage = {
  message_id?: string;
  thread_id?: string;
};

export async function sendMessage(
  inboxId: string,
  message: {
    to: Array<string> | string;
    subject: string;
    text: string;
    labels?: Array<string>;
  },
): Promise<SentMessage> {
  return await call<SentMessage>(`/inboxes/${inboxId}/messages/send`, {
    method: "POST",
    body: {
      to: Array.isArray(message.to) ? message.to : [message.to],
      subject: message.subject,
      text: message.text,
      labels: message.labels,
    },
  });
}

export async function replyToMessage(
  inboxId: string,
  parentMessageId: string,
  message: { text: string; labels?: Array<string> },
): Promise<SentMessage> {
  return await call<SentMessage>(
    `/inboxes/${inboxId}/messages/${parentMessageId}/reply`,
    { method: "POST", body: { text: message.text, labels: message.labels } },
  );
}
