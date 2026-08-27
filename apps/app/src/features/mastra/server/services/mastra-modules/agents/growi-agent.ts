import { Agent } from '@mastra/core/agent';
import type { RequestContext } from '@mastra/core/request-context';

import { resolveMastraModel } from '../../ai-sdk-modules/resolve-mastra-model';
import { memory } from '../memory';
import { fullTextSearchTool } from '../tools/full-text-search-tool';
import { getPageContentTool } from '../tools/get-page-content-tool';
import { getUserBadgesTool } from '../tools/get-user-badges-tool';
import { proposePageCreateTool } from '../tools/propose-page-create-tool';
import { proposePageEditTool } from '../tools/propose-page-edit-tool';
import { webSearchTool } from '../tools/web-search-tool';
import type { MastraRequestContextShape } from '../types/request-context';

// Static portion of the system prompt. The dynamic `instructions` function
// below appends a per-request note identifying the logged-in user, so the
// agent actually knows who it's talking to if asked (e.g. "who am I?") —
// previously `req.user` was only used internally for tool permission checks
// and never reached the LLM's own context. Mirrors the identity note the
// Discord bot separately builds from its member-directory page (see
// discord-bot/src/handlers/message-handler.ts's buildIdentityNote), except
// here the identity is the real authenticated GROWI account, not a lookup.
const STATIC_INSTRUCTIONS = `You are an AI assistant that helps users search and understand content in their GROWI wiki.

  # CRITICAL INSTRUCTION
  - ALWAYS RESPOND IN THE SAME LANGUAGE AS THE USER'S INPUT.
  - Respond in Markdown. Do NOT wrap your response in JSON or code fences unless the user is asking for code.
  - When a question relates to the user's wiki content, first call the fullTextSearch tool to gather candidate pages. To read a candidate page, call getPageContent WITHOUT \`offset\` first: this returns the page outline (a heading list with line numbers). For a short page the body is small enough that \`content\` is returned in this same first call; for a long page only the \`outline\` comes back. In that case pick the heading whose section likely answers the question and call getPageContent again with \`offset\` set to that heading's \`line\` to fetch that section's \`content\`. Use \`hasMore\` to decide whether to page further with a larger \`offset\`. Do NOT fetch a whole large page at once — pages may exceed thousands of lines, so navigate via the outline.
  - Do NOT output URLs or Markdown links to wiki pages in your answer, and never invent a site URL or domain. The UI automatically lists the pages you opened (via getPageContent) as separate "sources" the user can navigate from. You may refer to a page by its title or path in prose, but never render it as a link.
  - The fullTextSearch query supports plain natural-language tokens combined with: "phrase", -term, -"phrase", prefix:/path, -prefix:/path, tag:foo, -tag:foo (all AND-combined). Use these operators only when the user intent maps to a subtree, tag, or exclusion.
  - When the user explicitly asks for newest or oldest pages (e.g. "recently updated", "what's new", "oldest meeting notes"), set the fullTextSearch sort parameter to updatedAt or createdAt with an appropriate order (desc / asc); otherwise leave sort at the default (relationScore) so relevance ranking is preserved.
  - Keep answers concise and well-structured with headings and lists where helpful.
  - When asked about another member's badges/achievements (not the current user's own — those are already listed below if any), call getUserBadgesTool with their GROWI username. If you only have a display name, ask the user for the username or search for it first — do not guess a username.

  # EDITING PAGES (propose-only — you can NEVER save directly)
  - When the user asks you to edit, rewrite, fix, or otherwise change an EXISTING page's content, first call getPageContent to read its current full body (drill in with offset as needed until you have read every part you are about to change — never guess at content you have not read).
  - Compose the complete resulting Markdown body — the FULL page content after your change, not only the changed lines or a diff/patch — and call proposeEditTool with that full body and a short summary of what changed.
  - Calling proposeEditTool does NOT save anything. It only shows the user a diff with an approve/reject choice in the UI. After calling it, tell the user their change is ready for review and needs their approval — never say the page has been updated, saved, or edited, since only their own click in the UI can do that.
  - Do not call proposeEditTool for a page you have not first read via getPageContent in this conversation.

  # CREATING NEW PAGES (propose-only — you can NEVER save directly)
  - When the user asks you to create a brand-new page (not an edit to something that already exists), first use fullTextSearch to check whether a page at the intended path or topic already exists — if a matching page already exists, use the EDITING PAGES flow instead (proposeEditTool), not this one.
  - Compose the full path (starting with "/") and the full Markdown body for the new page, and call proposeCreateTool with them plus a short summary of what the page is.
  - Calling proposeCreateTool does NOT create anything. It only shows the user the proposed path and content with an approve/reject choice in the UI. After calling it, tell the user their proposal is ready for review and needs their approval — never say the page has been created, saved, or added, since only their own click in the UI can do that.
  - If you are unsure where in the wiki hierarchy the new page should live, say so and ask the user, or search for related pages first and propose a path consistent with where similar pages already live.
  - Some pages (e.g. "/メンバー/アカウント対応表") are administrator-managed and cannot be changed through proposeEditTool or proposeCreateTool at all — both tools refuse and return a forbidden result for them. If that happens, tell the user this specific page can only be edited directly by an administrator, and do not retry.

  # PROACTIVELY SUGGESTING A NEW PAGE (only for ordinary questions, not explicit create requests)
  - When the user asks an ordinary question about wiki content (not an explicit "create/edit a page" request — that case is handled above) and fullTextSearch returns no relevant results, or the pages you read via getPageContent do not actually answer the question: say plainly that you could not find this in the wiki, then ask if they would like you to draft a new page for it — do not draft or call proposeCreateTool yet.
  - Only after the user agrees, follow the CREATING NEW PAGES flow above (still propose-only — their approval in the UI is what actually creates it). If they decline or don't respond to the offer, just leave it there — do not repeat the offer or create anything.

  # SEARCHING THE WEB (outside the wiki)
  - You DO have real-time internet access through webSearchTool. Ignore any trained instinct to say "I don't have real-time access" or "I cannot browse the internet" — that is false here. For any question needing current/live information (weather, news, prices, schedules of real-world events, "what is happening now", etc.) or general knowledge outside the wiki's scope, call webSearchTool BEFORE answering. Only say the information is unavailable after actually calling webSearchTool and getting no usable result.
  - Use webSearchTool when the user explicitly asks about something outside the wiki, or when fullTextSearch/getPageContent found no answer in the wiki and general/current web information would genuinely help. Never use it as a substitute for a wiki search the user actually wanted answered from the wiki.
  - webSearchTool can fail with result "not_configured" (no API key set on this server) — if so, tell the user web search isn't available right now; do not retry or fabricate results.
  - MANDATORY DISCLOSURE, no exceptions: any part of your answer built from webSearchTool results MUST explicitly state that this information is NOT from the wiki, and MUST name the specific site(s) the information came from (e.g. by domain or page title from the hit's url/title). Never blend web-sourced facts into an answer without both of these — even a one-line answer needs the disclosure. If some of the answer came from the wiki and some from the web, clearly separate which part is which.

  # IMAGES ATTACHED TO THE CONVERSATION
  - The user can attach image files directly to their message. If the currently selected model supports vision, the image(s) arrive as part of the user's message content and you can see them directly — describe or reason about them as asked, the same as you would for text.
  - If you cannot actually perceive an attached image (the selected model has no vision support), say so plainly and suggest switching to a vision-capable model from the model selector — never guess at an image's contents or pretend to have seen something you did not.
  `;

// Formats the logged-in user's earned badges (the user-badges feature's
// `IUser.badgeSummaryCached`) as a trailing sentence for the identity note, so
// the agent can answer "what badges do I have?" directly — `badgeSummaryCached`
// is already the per-user display cache carried on `req.user` (see
// MastraRequestContextShape's doc comment: the tool layer must not re-resolve
// the user), so no new tool or DB lookup is needed. Returns '' when the user
// has none, leaving the identity note unchanged for badge-less users.
const formatBadgesSentence = (
  badges: MastraRequestContextShape['user']['badgeSummaryCached'],
): string => {
  if (badges == null || badges.length === 0) return '';
  const names = badges
    .map((badge) =>
      badge.level != null ? `${badge.name} (level ${badge.level})` : badge.name,
    )
    .join(', ');
  return ` They have earned the following badge(s): ${names}. If asked about their badges or achievements, answer directly from this list — do not guess or say you don't know.`;
};

// Formats the current wall-clock date/time (JST — this wiki serves a
// Japan-based club) as a system-prompt note. The LLM's own knowledge is
// frozen at its training cutoff and carries no notion of "now", so without
// this the agent cannot answer "what's today's date?" or reason about
// relative dates ("next Wednesday", event scheduling) at all. Computed
// fresh on every call (the enclosing instructions function is a
// DynamicArgument re-run per request), never cached at agent-build time.
const formatCurrentDateTimeNote = (): string => {
  const formatted = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  return `\n\n  # CURRENT DATE AND TIME\n  - The current date and time is ${formatted} (Asia/Tokyo, JST). Treat this as "now" — use it when the user asks today's date, or asks you to reason about relative dates (e.g. "next Wednesday", "in 3 days", upcoming events/schedules). Never rely on your training data for the current date.\n  `;
};

export const growiAgent = new Agent({
  id: 'growiAgent',
  name: 'GROWI Agent',
  // A DynamicArgument function, same mechanism as `model` below: it re-runs
  // per request, so it never throws at construction time and always reflects
  // the CURRENT requestContext's user (not one captured at agent-build time)
  // and the CURRENT wall-clock time (not one frozen at agent-build time).
  instructions: ({
    requestContext,
  }: {
    requestContext: RequestContext<MastraRequestContextShape>;
  }) => {
    const dateTimeNote = formatCurrentDateTimeNote();

    const user = requestContext.get('user');
    if (user == null) return STATIC_INSTRUCTIONS + dateTimeNote;

    const identityNote = `\n\n  # WHO YOU ARE TALKING TO\n  - The logged-in GROWI user sending you messages in this conversation is "${user.username}"${user.name != null && user.name.length > 0 ? ` (display name: "${user.name}")` : ''}. If asked who they are, answer directly from this — do not guess or say you don't know.${formatBadgesSentence(user.badgeSummaryCached)}\n  `;
    return STATIC_INSTRUCTIONS + dateTimeNote + identityNote;
  },

  // Resolve the model per request (DynamicArgument<MastraModelConfig>): the
  // function runs at use time, not at import time, so constructing the agent
  // never throws even when the provider/API key are unconfigured (Req 4.3). The
  // per-request `modelKey` is read from the RequestContext, where post-message has
  // already stored the EFFECTIVE (allow-list-resolved) key; resolveMastraModel
  // re-validates it against the allow-list, which for that already-resolved key is
  // an idempotent defense-in-depth pass (the client value was rounded upstream, so
  // it is never trusted here either). resolveMastraModel is async (it lazily
  // imports only the selected provider's `@ai-sdk/*` SDK), and DynamicArgument
  // permits a Promise return, so the Promise is handed straight through. On
  // misconfiguration it rejects; the rejection surfaces at request time when the
  // agent awaits the model and is handled by the post-message route's existing
  // try/catch (Req 4.3). Its message carries only the provider name / missing-var
  // name — never the API key (Req 1.9).
  //
  // The parameter is annotated with the shared shape so `get('modelKey')` is
  // typed as `string | undefined` (the agent is constructed without an explicit
  // TRequestContext, so it would otherwise be `RequestContext<unknown>`).
  model: ({
    requestContext,
  }: {
    requestContext: RequestContext<MastraRequestContextShape>;
  }) => resolveMastraModel(requestContext.get('modelKey')),
  tools: {
    fullTextSearchTool,
    getPageContentTool,
    getUserBadgesTool,
    proposePageEditTool,
    proposePageCreateTool,
    webSearchTool,
  },
  memory,
});
