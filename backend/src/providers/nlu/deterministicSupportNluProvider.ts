import type {
  PublishedKbCandidate, SupportNluEnvelope, SupportNluInput, SupportNluProvider,
} from "./supportNluProvider.js";

export const DETERMINISTIC_NLU_RULE_VERSION = "phase24e-deterministic-v1";
const MATCH_THRESHOLD = 6000;

export function normalizeSupportText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function tokens(value: string): Set<string> {
  return new Set(normalizeSupportText(value).split(" ").filter(Boolean));
}

function scoreCandidate(text: string, candidate: PublishedKbCandidate) {
  const normalized = normalizeSupportText(text);
  const textTokens = tokens(normalized);
  const intent = candidate.intentTags
    .map((tag) => normalizeSupportText(tag))
    .filter(Boolean)
    .find((tag) => normalized === tag || normalized.includes(tag));
  if (intent) return { score: 9000, intent, reason: "intent_tag_exact" };

  const normalizedKeywords = [...new Set(candidate.keywords.map(normalizeSupportText).filter(Boolean))];
  if (!normalizedKeywords.length) return { score: 0, intent: null, reason: "no_keyword_match" };
  const matched = normalizedKeywords.filter((keyword) => normalized.includes(keyword)
    || [...tokens(keyword)].every((token) => textTokens.has(token)));
  if (!matched.length) return { score: 0, intent: null, reason: "no_keyword_match" };
  const ratio = matched.length / normalizedKeywords.length;
  const score = Math.min(8500, Math.round(5500 + ratio * 3000));
  return { score, intent: candidate.intentTags[0] ?? null, reason: "keyword_overlap" };
}

export class DeterministicSupportNluProvider implements SupportNluProvider {
  readonly kind = "deterministic" as const;

  async classifyAndRetrieve(input: SupportNluInput): Promise<SupportNluEnvelope> {
    const language = input.language?.toLowerCase() ?? null;
    const ranked = input.publishedCandidates
      .filter((candidate) => !language || candidate.language.toLowerCase() === language)
      .map((candidate) => ({ candidate, ...scoreCandidate(input.normalizedText, candidate) }))
      .sort((left, right) => right.score - left.score
        || Date.parse(right.candidate.publishedAt) - Date.parse(left.candidate.publishedAt)
        || left.candidate.articleId.localeCompare(right.candidate.articleId));
    const best = ranked[0];
    if (!best || best.score < MATCH_THRESHOLD) {
      return { provider: "deterministic", providerName: "xlb-deterministic-nlu",
        providerStatus: "no_match_local", externalProviderExecuted: false, intent: null,
        confidenceBasisPoints: best?.score ?? 0, matchedArticleVersionIds: [],
        reasonCodes: [best ? "below_threshold" : "no_published_candidate"],
        ruleVersion: DETERMINISTIC_NLU_RULE_VERSION };
    }
    const second = ranked[1];
    if (second && second.score === best.score) {
      return { provider: "deterministic", providerName: "xlb-deterministic-nlu",
        providerStatus: "no_match_local", externalProviderExecuted: false, intent: null,
        confidenceBasisPoints: best.score, matchedArticleVersionIds: [],
        reasonCodes: ["ambiguous_equal_score"], ruleVersion: DETERMINISTIC_NLU_RULE_VERSION };
    }
    return { provider: "deterministic", providerName: "xlb-deterministic-nlu",
      providerStatus: "matched_local", externalProviderExecuted: false, intent: best.intent,
      confidenceBasisPoints: best.score,
      matchedArticleVersionIds: [best.candidate.articleVersionId],
      reasonCodes: [best.reason], ruleVersion: DETERMINISTIC_NLU_RULE_VERSION };
  }
}

export const deterministicSupportNluProvider = new DeterministicSupportNluProvider();
