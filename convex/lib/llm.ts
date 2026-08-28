import OpenAI from "openai";
import { env } from "../_generated/server";

// Extraction and parsing run over every policy page and every reply, so they
// take the volume tier. Drafting is what the counterparty actually reads.
export const MODELS = {
  extract: env.RECOURSE_MODEL_EXTRACT ?? "gpt-5.6-luna",
  draft: env.RECOURSE_MODEL_DRAFT ?? "gpt-5.6-terra",
  embed: "text-embedding-3-small",
} as const;

export const EMBEDDING_DIMENSIONS = 1536;

function client(): OpenAI {
  return new OpenAI({ apiKey: env.OPENAI_API_KEY });
}

export async function completeJson<T>(args: {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<T> {
  const response = await client().chat.completions.create({
    model: args.model,
    response_format: { type: "json_object" },
    max_completion_tokens: args.maxTokens ?? 4000,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error("Model returned an empty response");

  try {
    return JSON.parse(raw) as T;
  } catch {
    // Some models still fence JSON even when asked not to.
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) return JSON.parse(fenced[1]) as T;
    throw new Error(`Model returned unparseable JSON: ${raw.slice(0, 200)}`);
  }
}

export async function completeText(args: {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const response = await client().chat.completions.create({
    model: args.model,
    max_completion_tokens: args.maxTokens ?? 2000,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
  });
  return response.choices[0]?.message?.content?.trim() ?? "";
}

export async function embed(texts: Array<string>): Promise<Array<Array<number>>> {
  if (texts.length === 0) return [];
  const response = await client().embeddings.create({
    model: MODELS.embed,
    input: texts.map((t) => t.slice(0, 8000)),
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return response.data.map((d) => d.embedding);
}

// Policy documents run long. Split on headings where possible so a clause is
// unlikely to straddle two chunks, and fall back to hard slicing.
export function chunk(markdown: string, target = 12_000): Array<string> {
  if (markdown.length <= target) return [markdown];

  const sections = markdown.split(/\n(?=#{1,3}\s)/);
  const chunks: Array<string> = [];
  let current = "";

  for (const section of sections) {
    if (current && current.length + section.length > target) {
      chunks.push(current);
      current = section;
    } else {
      current = current ? `${current}\n${section}` : section;
    }
    while (current.length > target * 1.5) {
      chunks.push(current.slice(0, target));
      current = current.slice(target);
    }
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}
