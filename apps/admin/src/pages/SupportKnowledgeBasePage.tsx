import { useState } from "react";
import type { SupportKbMutationResponse } from "@xlb/types";
import { ApiErrorPanel, Button, Card, FormField, Input, Select, StatusTag, Textarea } from "@xlb/ui";
import { adminOpsApi as api } from "../adminAuth";
import { cityLabel, presentFailure, statusLabel, statusTone, useOnlineStatus } from "../operationsPresentation";
import "./mobile-ops.css";

const key = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function SupportKnowledgeBasePage({ cityCode }: { cityCode: string }) {
  const online = useOnlineStatus();
  const [article, setArticle] = useState<SupportKbMutationResponse | null>(null);
  const [slug, setSlug] = useState("");
  const [language, setLanguage] = useState("zh-CN");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [keywords, setKeywords] = useState("");
  const [intents, setIntents] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const terms = (value: string) => value.split(",").map(item => item.trim()).filter(Boolean);

  async function act(action: "create" | "revision" | "submit" | "approve" | "reject" | "publish") {
    if (!online || busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      let result: SupportKbMutationResponse;
      if (action === "create") {
        result = await api.createSupportKbArticle({ slug: slug.trim(), language: language.trim(), title: title.trim(), bodyMarkdown: body, keywords: terms(keywords), intentTags: terms(intents), idempotencyKey: key("kb-create") });
      } else {
        if (!article) return;
        const currentArticle = article.article;
        const version = article.version;
        if (action === "revision") result = await api.createSupportKbRevision(currentArticle.articleId, { expectedVersion: currentArticle.version, title: title.trim(), bodyMarkdown: body, keywords: terms(keywords), intentTags: terms(intents), idempotencyKey: key("kb-revision") });
        else if (action === "submit") result = await api.submitSupportKbRevision(currentArticle.articleId, version.articleVersionId, { note: note.trim() || undefined, idempotencyKey: key("kb-submit") });
        else if (action === "approve") result = await api.approveSupportKbRevision(currentArticle.articleId, version.articleVersionId, { note: note.trim(), idempotencyKey: key("kb-approve") });
        else if (action === "reject") result = await api.rejectSupportKbRevision(currentArticle.articleId, version.articleVersionId, { note: note.trim(), idempotencyKey: key("kb-reject") });
        else result = await api.publishSupportKbRevision(currentArticle.articleId, { versionId: version.articleVersionId, expectedVersion: currentArticle.version, idempotencyKey: key("kb-publish") });
      }
      setArticle(result);
      setNotice(`${action === "create" ? "文章" : "知识库修订"}已由服务端确认更新。`);
    } catch (cause) {
      const failure = presentFailure(cause, "客服知识库操作");
      setError({ title: failure.title, detail: failure.detail });
    } finally { setBusy(false); }
  }

  const contentReady = slug.trim() && language.trim() && title.trim() && body.trim();
  return <Card className="mobile-ops mobile-ops--embedded" title="客服知识库" actions={<><StatusTag tone="primary">城市：{cityLabel(cityCode)}</StatusTag><StatusTag tone={online ? "success" : "danger"}>{online ? "在线" : "离线"}</StatusTag>{article && <><StatusTag tone={statusTone(article.article.lifecycleStatus)}>{statusLabel(article.article.lifecycleStatus)}</StatusTag><StatusTag tone={statusTone(article.version.reviewStatus)}>{statusLabel(article.version.reviewStatus)}</StatusTag></>}</>}>
    <div style={{ display: "grid", gap: 8 }}>
      <p>正文仅用于已审核的信息说明；新修订不可覆盖旧版本，发布必须使用服务端返回的版本号。</p>
      <p className="mobile-ops__oa-note"><strong>办公自动化系统承接边界：</strong>文章批量迁移与大篇幅排版后续由办公自动化系统承担；手机端保留单篇创建、送审、批准、驳回和发布。</p>
      {!online && <ApiErrorPanel title="当前网络不可用" detail="知识库写入已停用。恢复网络后再继续操作。" />}
      {error && <ApiErrorPanel title={error.title} detail={error.detail} />}
      {notice && <p role="status">{notice}</p>}
      <FormField label="文章标识"><Input placeholder="输入服务端认可的文章标识" value={slug} onChange={event => setSlug(event.target.value)} /></FormField>
      <FormField label="语言"><Select value={language} onChange={event => setLanguage(event.target.value)}><option value="zh-CN">简体中文</option></Select></FormField>
      <FormField label="标题"><Input value={title} onChange={event => setTitle(event.target.value)} /></FormField>
      <FormField label="信息说明（支持轻量标记语法）"><Textarea value={body} onChange={event => setBody(event.target.value)} /></FormField>
      <FormField label="关键词（逗号分隔）"><Input value={keywords} onChange={event => setKeywords(event.target.value)} /></FormField>
      <FormField label="意图标签（逗号分隔）"><Input value={intents} onChange={event => setIntents(event.target.value)} /></FormField>
      <FormField label="审核说明"><Textarea placeholder="批准或驳回时必填" value={note} onChange={event => setNote(event.target.value)} /></FormField>
      <div className="mobile-ops__confirm-bar">
        <Button variant="primary" disabled={!online || busy || !contentReady} onClick={() => void act("create")}>创建文章</Button>
        <Button disabled={!online || busy || !article || !title.trim() || !body.trim()} onClick={() => void act("revision")}>创建不可变新修订</Button>
        <Button disabled={!online || busy || !article || article.version.reviewStatus !== "draft"} onClick={() => void act("submit")}>提交审核</Button>
        <Button disabled={!online || busy || !article || article.version.reviewStatus !== "pending_review" || !note.trim()} onClick={() => void act("approve")}>批准修订</Button>
        <Button disabled={!online || busy || !article || article.version.reviewStatus !== "pending_review" || !note.trim()} onClick={() => void act("reject")}>驳回修订</Button>
        <Button disabled={!online || busy || !article || article.version.reviewStatus !== "approved"} onClick={() => void act("publish")}>发布修订</Button>
      </div>
      {article && <small>文章 {article.article.articleId} · 不可变修订 {article.version.revision} · 内容摘要校验值 {article.version.contentSha256}</small>}
    </div>
  </Card>;
}
