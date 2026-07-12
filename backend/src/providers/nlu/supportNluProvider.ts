export type PublishedKbCandidate = {
  articleId: string;
  articleVersionId: string;
  language: string;
  title: string;
  summary: string | null;
  bodyMarkdown: string;
  keywords: string[];
  intentTags: string[];
  publishedAt: string;
};

export type SupportNluEnvelope = {
  provider: "deterministic" | "mock";
  providerName: "xlb-deterministic-nlu" | "xlb-memory-nlu-mock";
  providerStatus: "matched_local" | "no_match_local" | "forced_mock";
  externalProviderExecuted: false;
  intent: string | null;
  confidenceBasisPoints: number;
  matchedArticleVersionIds: string[];
  reasonCodes: string[];
  ruleVersion: string;
};

export type SupportNluInput = {
  cityCode: string;
  language: string | null;
  normalizedText: string;
  publishedCandidates: ReadonlyArray<PublishedKbCandidate>;
};

export interface SupportNluProvider {
  readonly kind: "deterministic" | "mock";
  classifyAndRetrieve(input: SupportNluInput): Promise<SupportNluEnvelope>;
}
