/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as analysis from "../analysis.js";
import type * as cases from "../cases.js";
import type * as chase from "../chase.js";
import type * as clauses from "../clauses.js";
import type * as crons from "../crons.js";
import type * as drafting from "../drafting.js";
import type * as email from "../email.js";
import type * as extraction from "../extraction.js";
import type * as http from "../http.js";
import type * as inboxes from "../inboxes.js";
import type * as letters from "../letters.js";
import type * as lib_agentmail from "../lib/agentmail.js";
import type * as lib_llm from "../lib/llm.js";
import type * as policies from "../policies.js";
import type * as replies from "../replies.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  analysis: typeof analysis;
  cases: typeof cases;
  chase: typeof chase;
  clauses: typeof clauses;
  crons: typeof crons;
  drafting: typeof drafting;
  email: typeof email;
  extraction: typeof extraction;
  http: typeof http;
  inboxes: typeof inboxes;
  letters: typeof letters;
  "lib/agentmail": typeof lib_agentmail;
  "lib/llm": typeof lib_llm;
  policies: typeof policies;
  replies: typeof replies;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agentmail: import("@agentmail/convex/_generated/component.js").ComponentApi<"agentmail">;
  firecrawl: import("@firecrawl/firecrawl-convex/_generated/component.js").ComponentApi<"firecrawl">;
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  rag: import("@convex-dev/rag/_generated/component.js").ComponentApi<"rag">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
  crawlPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"crawlPool">;
  mailPool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"mailPool">;
};
