export type SensitiveSupportClassification =
  | "financial" | "safety" | "account_security" | "human_requested" | "conversation_transferred";

export type SensitiveSupportDecision = {
  mustHandOff: boolean;
  classification: SensitiveSupportClassification | null;
  reasonCodes: string[];
  ruleVersion: "phase24e-sensitive-v1";
};

const RULES: Array<{ classification: SensitiveSupportClassification; reason: string; pattern: RegExp }> = [
  { classification: "human_requested", reason: "explicit_human_request",
    pattern: /(?:人工|真人|客服人员|human\s*(?:agent|support)|live\s*agent)/iu },
  { classification: "financial", reason: "financial_or_payment_sensitive",
    pattern: /(?:退款|赔偿|提现|银行卡|支付|转账|refund|withdraw(?:al)?|bank\s*card|payment)/iu },
  { classification: "safety", reason: "personal_safety_sensitive",
    pattern: /(?:威胁|人身|受伤|报警|危险|骚扰|伤害|threat|injur(?:y|ed)|danger|harass)/iu },
  { classification: "account_security", reason: "account_secret_sensitive",
    pattern: /(?:盗号|验证码|密码|身份证|账号被盗|verification\s*code|password|identity\s*card)/iu },
];

export function classifySensitiveSupport(input: {
  text: string;
  ticketType?: string | null;
  conversationStatus?: string | null;
}): SensitiveSupportDecision {
  if (["transferred", "escalated"].includes(input.conversationStatus ?? "")) {
    return { mustHandOff: true, classification: "conversation_transferred",
      reasonCodes: ["conversation_already_transferred"], ruleVersion: "phase24e-sensitive-v1" };
  }
  if (["withdrawal_issue", "safety", "account_issue"].includes(input.ticketType ?? "")) {
    return { mustHandOff: true,
      classification: input.ticketType === "safety" ? "safety"
        : input.ticketType === "account_issue" ? "account_security" : "financial",
      reasonCodes: [`sensitive_ticket_type:${input.ticketType}`], ruleVersion: "phase24e-sensitive-v1" };
  }
  const normalized = input.text.normalize("NFKC").replace(/\s+/g, " ").trim();
  const hit = RULES.find((rule) => rule.pattern.test(normalized));
  return hit
    ? { mustHandOff: true, classification: hit.classification, reasonCodes: [hit.reason], ruleVersion: "phase24e-sensitive-v1" }
    : { mustHandOff: false, classification: null, reasonCodes: [], ruleVersion: "phase24e-sensitive-v1" };
}
