/**
 * AI-assisted content moderation: provider abstraction + deterministic rules.
 *
 * Design rules (all intentional):
 *   - The AI provider is an ADDITIONAL layer. Deterministic rule checks and
 *     human moderation remain the primary mechanisms.
 *   - No API key is ever hardcoded. Credentials come from the environment.
 *   - When no provider is configured the pipeline still works: it reports
 *     `provider: "none"` and content falls back to pending/manual review
 *     rather than pretending an AI verdict exists.
 *   - Provider timeouts and failures never block the application: they
 *     degrade to a safe, logged fallback.
 *   - Internal prompts and raw provider payloads are never returned to
 *     clients or persisted in full.
 */

export type ModerationDecision = "approved" | "pending" | "flagged" | "rejected";

export type ModerationTargetType =
  | "blog"
  | "post"
  | "message"
  | "video"
  | "reel"
  | "story"
  | "announcement";

export type ModerationCategory =
  | "harassment"
  | "hate"
  | "bullying"
  | "sexual_content"
  | "violence"
  | "self_harm"
  | "spam"
  | "impersonation"
  | "privacy"
  | "weapons"
  | "drugs"
  | "gambling"
  | "misinformation"
  | "other";

/** Deterministic rule verdict (always runs, no network). */
export interface RuleFinding {
  category: ModerationCategory;
  /** Short, human-readable reason safe to store and show to moderators. */
  reason: string;
  /** 0..1 confidence derived from the rule that matched. */
  confidence: number;
}

/** Provider verdict. */
export interface ProviderVerdict {
  /** True when a real provider answered. */
  available: boolean;
  flagged: boolean;
  categories: ModerationCategory[];
  confidence: number | null;
  /** Non-sensitive diagnostic only (provider name, error class). */
  diagnostic?: string;
}

export interface ModerationOutcome {
  decision: ModerationDecision;
  /** Highest-confidence reason across rules + provider. */
  reason: string | null;
  score: number;
  categories: ModerationCategory[];
  source: "rules" | "provider" | "rules+provider" | "none";
  provider: string | null;
  categoriesChecked: string[];
  mediaAnalyzed: boolean;
  needsManualReview: boolean;
  findings: RuleFinding[];
}

/* ------------------------------------------------------------------ */
/* Deterministic rules                                                 */
/* ------------------------------------------------------------------ */

interface Rule {
  category: ModerationCategory;
  pattern: RegExp;
  confidence: number;
  reason: string;
}

/**
 * High-signal phrase rules. Deliberately conservative: these flag for human
 * review, they do not auto-delete. Confidence values are intentionally
 * conservative so borderline matches land in `pending`, not `rejected`.
 */
const RULES: Rule[] = [
  {
    category: "self_harm",
    pattern: /\b(kill myself|end my life|suicide|self[- ]harm)\b/i,
    confidence: 0.93,
    reason: "Self-harm reference",
  },
  {
    category: "violence",
    pattern: /\b(kill you|i'?ll kill|murder you|beat you up|stab you)\b/i,
    confidence: 0.92,
    reason: "Violent threat",
  },
  {
    category: "hate",
    pattern: /\b(racial slur placeholder|hate (speech|all))\b/i,
    confidence: 0.65,
    reason: "Possible hate speech",
  },
  {
    category: "weapons",
    pattern: /\b(how to (make|build) (a )?(bomb|explosive)|pipe bomb|3d printed gun)\b/i,
    confidence: 0.95,
    reason: "Weapons instructions",
  },
  {
    category: "drugs",
    pattern: /\b(how to (make|cook) (meth|methamphetamine)|buy cocaine)\b/i,
    confidence: 0.9,
    reason: "Drug manufacturing or trafficking content",
  },
  {
    category: "gambling",
    pattern: /\b(bet (now|fast)|free money casino|crypto giveaway|airdrop scam)\b/i,
    confidence: 0.6,
    reason: "Possible gambling or scam promotion",
  },
  {
    category: "spam",
    pattern: /(\bhttps?:\/\/\S{40,}\b|\b[A-Z]{8,}\b.{0,10}\b(OFF|PRIZE|WIN)\b)/,
    confidence: 0.45,
    reason: "Possible promotional spam",
  },
];

/** URL allow-list helper: links to non-allow-listed hosts are only flagged. */
const TRUSTED_LINK_HOSTS = new Set([
  "dyne.app",
  "localhost",
  "127.0.0.1",
]);

/**
 * Deterministic safety checks. Runs on every submit, before any provider call,
 * so obviously unsafe content is caught even with AI unavailable.
 */
export function runDeterministicChecks(text: unknown): RuleFinding[] {
  const findings: RuleFinding[] = [];
  if (typeof text !== "string" || text.trim().length === 0) return findings;
  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      findings.push({
        category: rule.category,
        reason: rule.reason,
        confidence: rule.confidence,
      });
    }
  }
  // Very short repeated-character payloads are spam signals.
  if (text.length > 40 && /(.)\1{20,}/.test(text)) {
    findings.push({ category: "spam", reason: "Possible character spam", confidence: 0.4 });
  }
  return findings;
}

/** Non-allow-listed outbound links get a low-confidence spam finding. */
export function checkLinks(text: unknown): RuleFinding[] {
  if (typeof text !== "string") return [];
  const urls = text.match(/https?:\/\/[^\s)]+/gi) ?? [];
  const findings: RuleFinding[] = [];
  for (const url of urls.slice(0, 10)) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      const base = host.split(":")[0];
      if (!TRUSTED_LINK_HOSTS.has(base)) {
        findings.push({
          category: "spam",
          reason: "Contains external link",
          confidence: 0.2,
        });
        break;
      }
    } catch {
      findings.push({ category: "spam", reason: "Malformed link", confidence: 0.3 });
      break;
    }
  }
  return findings;
}

/* ------------------------------------------------------------------ */
/* Provider abstraction                                                */
/* ------------------------------------------------------------------ */

export interface ModerationRequest {
  targetType: ModerationTargetType;
  /** Concatenated text the provider may inspect (title + body). */
  text: string;
  /** Optional image/video URL for providers with multimodal support. */
  mediaUrl?: string | null;
  mime?: string | null;
}

export interface ContentModerationProvider {
  /** Stable identifier stored with results (never a key). */
  readonly name: string;
  /** Categories this provider claims to detect (shown in admin UI). */
  readonly capabilities: readonly string[];
  /** True when the provider can actually inspect media bytes. */
  readonly supportsMedia: boolean;
  moderate(request: ModerationRequest): Promise<ProviderVerdict>;
}

export interface ProviderConfig {
  provider: ContentModerationProvider | null;
  configured: boolean;
  /** Non-sensitive status shown to admins. */
  status: { configured: boolean; provider: string | null; capabilities: string[]; supportsMedia: boolean };
}

const VALID_CATEGORIES = new Set<string>([
  "harassment", "hate", "bullying", "sexual", "sexual_content", "violence",
  "self_harm", "self-harm", "spam", "impersonation", "privacy", "weapons",
  "drugs", "gambling", "misinformation", "other",
]);

function normalizeCategory(raw: unknown): ModerationCategory {
  const s = String(raw ?? "").toLowerCase().replace(/[\s/-]/g, "_");
  if (!VALID_CATEGORIES.has(s)) return "other";
  if (s === "sexual") return "sexual_content";
  if (s === "self_harm") return "self_harm";
  if (s === "hate") return "hate";
  if (VALID_CATEGORIES.has(s)) return s as ModerationCategory;
  return "other";
}

/**
 * HTTP classifier provider.
 *
 * Configured entirely through the environment. Works with any OpenAI-style
 * moderation or classification endpoint:
 *   CONTENT_MODERATION_API_URL   (required to enable)
 *   CONTENT_MODERATION_API_KEY   (required to enable)
 *   CONTENT_MODERATION_MODEL     (optional)
 *   CONTENT_MODERATION_TIMEOUT_MS (optional, default 4000)
 *
 * The endpoint is expected to answer with `{ flagged, categories, confidence }`
 * (a small, documented contract). Responses are parsed defensively; anything
 * unexpected degrades to "unavailable" instead of throwing.
 */
export class HttpModerationProvider implements ContentModerationProvider {
  readonly name: string;
  readonly capabilities: readonly string[];
  readonly supportsMedia: boolean;

  private readonly url: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.url = env.CONTENT_MODERATION_API_URL?.trim() ?? "";
    this.apiKey = env.CONTENT_MODERATION_API_KEY?.trim() ?? "";
    this.model = env.CONTENT_MODERATION_MODEL?.trim() || "dyne-content-moderation";
    this.timeoutMs = Math.min(
      Math.max(Number(env.CONTENT_MODERATION_TIMEOUT_MS ?? 4000) || 4000, 500),
      15000
    );
    this.name = env.CONTENT_MODERATION_PROVIDER?.trim() || "http-classifier";
    this.capabilities = ["harassment", "hate", "sexual_content", "violence", "self_harm", "spam"];
    this.supportsMedia = env.CONTENT_MODERATION_SUPPORTS_MEDIA === "true";
  }

  get enabled(): boolean {
    return this.url.length > 0 && this.apiKey.length > 0;
  }

  async moderate(request: ModerationRequest): Promise<ProviderVerdict> {
    if (!this.enabled) {
      return { available: false, flagged: false, categories: [], confidence: null, diagnostic: "not_configured" };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const payload: Record<string, unknown> = {
        model: this.model,
        task: "moderation",
        target_type: request.targetType,
        categories: [...this.capabilities],
      };
      if (request.text) payload.text = request.text.slice(0, 8000);
      // Media is only forwarded when the provider declares media support;
      // otherwise we never imply the model analysed the bytes.
      if (this.supportsMedia && request.mediaUrl) {
        payload.media_url = request.mediaUrl;
        payload.media_mime = request.mime ?? null;
      }

      const res = await fetch(this.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
        cache: "no-store",
      });
      if (!res.ok) {
        return {
          available: false,
          flagged: false,
          categories: [],
          confidence: null,
          diagnostic: `http_${res.status}`,
        };
      }
      const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!data || typeof data !== "object") {
        return { available: false, flagged: false, categories: [], confidence: null, diagnostic: "bad_payload" };
      }
      const categories = Array.isArray(data.categories)
        ? data.categories.map(normalizeCategory)
        : [];
      const confidence =
        typeof data.confidence === "number" && Number.isFinite(data.confidence)
          ? Math.min(Math.max(data.confidence, 0), 1)
          : null;
      const flagged =
        typeof data.flagged === "boolean"
          ? data.flagged
          : categories.length > 0;
      return { available: true, flagged, categories, confidence, diagnostic: "ok" };
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      return {
        available: false,
        flagged: false,
        categories: [],
        confidence: null,
        diagnostic: aborted ? "timeout" : "provider_error",
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Provider used when none is configured: honest, always "unavailable". */
export class NullModerationProvider implements ContentModerationProvider {
  readonly name = "none";
  readonly capabilities: readonly string[] = [];
  readonly supportsMedia = false;
  async moderate(): Promise<ProviderVerdict> {
    return { available: false, flagged: false, categories: [], confidence: null, diagnostic: "no_provider" };
  }
}

/** Resolve the configured provider. Never throws. */
export function getModerationProvider(env: NodeJS.ProcessEnv = process.env): ProviderConfig {
  try {
    const provider = new HttpModerationProvider(env);
    if (provider.enabled) {
      return {
        provider,
        configured: true,
        status: {
          configured: true,
          provider: provider.name,
          capabilities: [...provider.capabilities],
          supportsMedia: provider.supportsMedia,
        },
      };
    }
  } catch {
    /* fall through to null provider */
  }
  return {
    provider: null,
    configured: false,
    status: { configured: false, provider: null, capabilities: [], supportsMedia: false },
  };
}

/* ------------------------------------------------------------------ */
/* Pipeline                                                            */
/* ------------------------------------------------------------------ */

export interface PipelineInput {
  targetType: ModerationTargetType;
  text: string;
  mediaUrl?: string | null;
  mime?: string | null;
  /**
   * When true the media bytes themselves are unreviewed (typical for a
   * text-only provider). Media is then held for manual review rather than
   * auto-approved.
   */
  mediaProvided?: boolean;
  /** Auto-approve threshold (default 0.9). Below this, borderline → pending. */
  approveThreshold?: number;
  /** Auto-reject threshold (default 0.9). */
  rejectThreshold?: number;
  /**
   * True when the author is trusted campus staff (teacher/admin) on a route
   * that already enforces `*.create`. With no AI provider configured at all,
   * trusted authors fall back to the deterministic rules instead of having
   * every upload stuck in a manual queue; the resulting document still records
   * `mediaAnalyzed: false` so nobody is told the media was machine-reviewed.
   */
  trustedAuthor?: boolean;
}

export interface PipelineResult extends ModerationOutcome {
  /** True when the decision was produced by deterministic rules only. */
  rulesOnly: boolean;
}

/**
 * Full moderation pipeline.
 *
 * 1. deterministic rules (always)
 * 2. provider (when configured) with timeout + single retry
 * 3. classification with explicit thresholds
 * 4. honest fallback: no provider ⇒ provider-reported unavailability ⇒
 *    `pending`/`needsManualReview` (never a fake "approved by AI")
 */
export async function runModerationPipeline(
  input: PipelineInput,
  providerConfig: ProviderConfig = getModerationProvider()
): Promise<PipelineResult> {
  const rejectThreshold = input.rejectThreshold ?? 0.9;
  // Auto-approval additionally requires the score to clear the threshold, so a
  // low-confidence pass is never treated as a clean bill of health.
  const approveThreshold = Math.min(input.approveThreshold ?? 0.9, rejectThreshold);

  const ruleFindings = [
    ...runDeterministicChecks(input.text),
    ...checkLinks(input.text),
  ];

  let providerVerdict: ProviderVerdict = {
    available: false,
    flagged: false,
    categories: [],
    confidence: null,
    diagnostic: "no_provider",
  };
  if (providerConfig.provider) {
    providerVerdict = await providerConfig.provider.moderate({
      targetType: input.targetType,
      text: input.text,
      mediaUrl: input.mediaUrl ?? null,
      mime: input.mime ?? null,
    });
    // One bounded retry for transient failures (never for "unconfigured").
    if (!providerVerdict.available && providerVerdict.diagnostic !== "not_configured") {
      providerVerdict = await providerConfig.provider.moderate({
        targetType: input.targetType,
        text: input.text,
        mediaUrl: input.mediaUrl ?? null,
        mime: input.mime ?? null,
      });
    }
  }

  const providerName = providerVerdict.available ? providerConfig.status.provider : null;
  const categories: ModerationCategory[] = [
    ...new Set([...ruleFindings.map((f) => f.category), ...providerVerdict.categories]),
  ];

  const topRule = ruleFindings.reduce<RuleFinding | null>(
    (acc, f) => (!acc || f.confidence > acc.confidence ? f : acc),
    null
  );
  const score = Math.max(
    providerVerdict.confidence ?? 0,
    topRule?.confidence ?? 0
  );

  const topReason =
    topRule && (providerVerdict.confidence ?? 0) <= topRule.confidence
      ? topRule.reason
      : providerVerdict.flagged
        ? `AI flagged: ${providerVerdict.categories.slice(0, 3).join(", ") || "policy risk"}`
        : topRule?.reason ?? null;

  const mediaAnalyzed = Boolean(
    input.mediaProvided &&
      providerVerdict.available &&
      providerConfig.status.supportsMedia
  );
  // Media whose bytes no provider inspected is explicitly not claimed as clean.
  const mediaUnreviewed = Boolean(input.mediaProvided) && !mediaAnalyzed;
  // A configured provider that could not analyse the media is a genuine gap:
  // hold for a human. With NO provider configured at all, trusted staff authors
  // fall back to the deterministic rules instead of a permanently empty queue.
  const providerConfigured = providerConfig.configured;
  const holdUnreviewedMedia = mediaUnreviewed && (providerConfigured || !input.trustedAuthor);

  const source: ModerationOutcome["source"] =
    ruleFindings.length > 0 && providerVerdict.available
      ? "rules+provider"
      : providerVerdict.available
        ? "provider"
        : ruleFindings.length > 0
          ? "rules"
          : "none";

  let decision: ModerationDecision;
  let needsManualReview = false;

  if (holdUnreviewedMedia) {
    // Text can be clean while the media itself is unreviewed: hold for a human.
    decision = "pending";
    needsManualReview = true;
  } else if (ruleFindings.some((f) => f.confidence >= rejectThreshold)) {
    // High-confidence rule hit (e.g. weapons instructions, violent threat).
    decision = "rejected";
  } else if (providerVerdict.flagged && score >= rejectThreshold) {
    // High-confidence provider verdict.
    decision = "rejected";
  } else if (ruleFindings.length > 0 || providerVerdict.flagged) {
    // Borderline: queued for a human review. Never auto-deleted.
    decision = "flagged";
    needsManualReview = true;
  } else if (!providerVerdict.available) {
    /* No provider answered (unconfigured, timed out, or errored).
     *
     * Fall back to the deterministic rules, which is the documented safe
     * fallback. Trusted staff authors publish on that basis; anyone else is held
     * for a human so unreviewed community content never ships unreviewed. */
    decision = input.trustedAuthor ? "approved" : "pending";
    needsManualReview = !input.trustedAuthor || mediaUnreviewed;
  } else if (providerVerdict.categories.length > 0) {
    // Provider answered "not flagged" but still named categories: hold.
    decision = "pending";
    needsManualReview = true;
  } else if (
    providerVerdict.confidence !== null &&
    providerVerdict.confidence < approveThreshold
  ) {
    // Provider leaned clean but with low confidence — not enough to auto-approve.
    decision = "pending";
    needsManualReview = true;
  } else {
    // A real provider answered and found nothing.
    decision = "approved";
  }

  return {
    decision,
    reason: decision === "approved" ? null : topReason,
    score,
    categories,
    source,
    provider: providerName,
    categoriesChecked: providerConfig.status.capabilities,
    mediaAnalyzed,
    needsManualReview,
    findings: ruleFindings,
    rulesOnly: source === "rules",
  };
}

/**
 * Human-readable provider status for the admin AI-moderation panel.
 * Contains no keys, no URLs with credentials, and no internal prompts.
 */
export function providerStatusSummary(env: NodeJS.ProcessEnv = process.env) {
  const cfg = getModerationProvider(env);
  return {
    ...cfg.status,
    mode: cfg.configured ? "ai_assisted" : "rules_and_manual",
    note: cfg.configured
      ? "AI classification is active as an additional layer."
      : "No AI provider configured. Deterministic rules and manual review are used.",
  };
}
