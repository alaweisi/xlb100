import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { PublishedKbCandidate } from "../../providers/nlu/supportNluProvider.js";

export type KbArticle = {
  articleId: string; cityCode: string; slug: string; language: string;
  lifecycleStatus: "draft" | "published" | "archived";
  currentDraftVersionId: string | null; publishedVersionId: string | null; version: number;
  createdByAdminId: string;
};
export type KbVersion = {
  articleVersionId: string; cityCode: string; articleId: string; revision: number;
  title: string; summary: string | null; bodyMarkdown: string; keywords: string[]; intentTags: string[];
  reviewStatus: "draft" | "pending_review" | "approved" | "rejected";
  createdByAdminId: string; contentSha256: string;
};
type ArticleRow = RowDataPacket & { article_id:string;city_code:string;slug:string;language:string;lifecycle_status:KbArticle["lifecycleStatus"];current_draft_version_id:string|null;published_version_id:string|null;version:number|string;created_by_admin_id:string;create_request_fingerprint:string };
type VersionRow = RowDataPacket & { article_version_id:string;city_code:string;article_id:string;revision:number|string;title:string;summary:string|null;body_markdown:string;keywords_json:string|string[];intent_tags_json:string|string[];review_status:KbVersion["reviewStatus"];created_by_admin_id:string;content_sha256:string;created_at:Date };
type CandidateRow = VersionRow & { article_language:string };
const array = (value:string|string[]) => Array.isArray(value) ? value : JSON.parse(value) as string[];
const mapArticle = (row:ArticleRow):KbArticle => ({ articleId:row.article_id,cityCode:row.city_code,slug:row.slug,language:row.language,lifecycleStatus:row.lifecycle_status,currentDraftVersionId:row.current_draft_version_id,publishedVersionId:row.published_version_id,version:Number(row.version),createdByAdminId:row.created_by_admin_id });
const mapVersion = (row:VersionRow):KbVersion => ({ articleVersionId:row.article_version_id,cityCode:row.city_code,articleId:row.article_id,revision:Number(row.revision),title:row.title,summary:row.summary,bodyMarkdown:row.body_markdown,keywords:array(row.keywords_json),intentTags:array(row.intent_tags_json),reviewStatus:row.review_status,createdByAdminId:row.created_by_admin_id,contentSha256:row.content_sha256 });

export interface SupportKnowledgeBaseRepositoryPort {
  loadAdminRole(c:PoolConnection,city:string,user:string):Promise<string|null>;
  findArticle(c:PoolConnection,city:string,id:string,lock?:boolean):Promise<KbArticle|null>;
  findArticleByCreateKey(c:PoolConnection,city:string,user:string,key:string):Promise<{article:KbArticle;fingerprint:string}|null>;
  insertArticle(c:PoolConnection,input:{articleId:string;city:string;slug:string;language:string;categoryId:string|null;skuId:string|null;user:string;key:string;fingerprint:string}):Promise<void>;
  nextRevision(c:PoolConnection,city:string,articleId:string):Promise<number>;
  insertVersion(c:PoolConnection,input:{versionId:string;city:string;articleId:string;revision:number;title:string;summary:string|null;body:string;keywords:string[];intentTags:string[];user:string;sha:string}):Promise<void>;
  pointDraftCas(c:PoolConnection,city:string,articleId:string,versionId:string,expectedVersion:number,key:string,fingerprint:string):Promise<boolean>;
  findVersion(c:PoolConnection,city:string,articleId:string,versionId:string):Promise<KbVersion|null>;
  findReviewReplay(c:PoolConnection,city:string,versionId:string,key:string):Promise<{action:string;fingerprint:string}|null>;
  insertReviewEvent(c:PoolConnection,input:{eventId:string;city:string;articleId:string;versionId:string;action:string;actor:string;note:string|null;key:string;fingerprint:string}):Promise<void>;
  updateVersionReview(c:PoolConnection,input:{city:string;versionId:string;status:KbVersion["reviewStatus"];actor:string;note:string|null}):Promise<boolean>;
  publishCas(c:PoolConnection,input:{city:string;articleId:string;versionId:string;expectedVersion:number;key:string;fingerprint:string}):Promise<boolean>;
  listPublishedCandidates(c:PoolConnection,city:string,language:string|null):Promise<PublishedKbCandidate[]>;
}

export class SupportKnowledgeBaseRepository implements SupportKnowledgeBaseRepositoryPort {
  async loadAdminRole(c:PoolConnection,city:string,user:string){const [r]=await c.query<RowDataPacket[]>(`SELECT au.role FROM admin_users au INNER JOIN admin_city_scopes acs ON acs.admin_user_id=au.id AND acs.city_code=? WHERE au.id=? AND au.role IN ('admin','operator','auditor') LIMIT 1`,[city,user]);return r[0]?String(r[0].role):null;}
  async findArticle(c:PoolConnection,city:string,id:string,lock=false){const [r]=await c.query<ArticleRow[]>(`SELECT * FROM support_kb_articles WHERE city_code=? AND article_id=? LIMIT 1${lock?" FOR UPDATE":""}`,[city,id]);return r[0]?mapArticle(r[0]):null;}
  async findArticleByCreateKey(c:PoolConnection,city:string,user:string,key:string){const [r]=await c.query<ArticleRow[]>(`SELECT * FROM support_kb_articles WHERE city_code=? AND created_by_admin_id=? AND create_idempotency_key=? LIMIT 1`,[city,user,key]);return r[0]?{article:mapArticle(r[0]),fingerprint:r[0].create_request_fingerprint}:null;}
  async insertArticle(c:PoolConnection,x:{articleId:string;city:string;slug:string;language:string;categoryId:string|null;skuId:string|null;user:string;key:string;fingerprint:string}){await c.query(`INSERT INTO support_kb_articles(article_id,city_code,slug,category_id,sku_id,language,create_idempotency_key,create_request_fingerprint,created_by_admin_id) VALUES(?,?,?,?,?,?,?,?,?)`,[x.articleId,x.city,x.slug,x.categoryId,x.skuId,x.language,x.key,x.fingerprint,x.user]);}
  async nextRevision(c:PoolConnection,city:string,articleId:string){const [r]=await c.query<(RowDataPacket&{next_revision:number|string})[]>(`SELECT COALESCE(MAX(revision),0)+1 next_revision FROM support_kb_article_versions WHERE city_code=? AND article_id=?`,[city,articleId]);return Number(r[0]!.next_revision);}
  async insertVersion(c:PoolConnection,x:{versionId:string;city:string;articleId:string;revision:number;title:string;summary:string|null;body:string;keywords:string[];intentTags:string[];user:string;sha:string}){await c.query(`INSERT INTO support_kb_article_versions(article_version_id,city_code,article_id,revision,title,summary,body_markdown,keywords_json,intent_tags_json,created_by_admin_id,content_sha256) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,[x.versionId,x.city,x.articleId,x.revision,x.title,x.summary,x.body,JSON.stringify(x.keywords),JSON.stringify(x.intentTags),x.user,x.sha]);}
  async pointDraftCas(c:PoolConnection,city:string,articleId:string,versionId:string,expectedVersion:number,key:string,fingerprint:string){const [r]=await c.query<ResultSetHeader>(`UPDATE support_kb_articles SET current_draft_version_id=?,version=version+1,mutation_idempotency_key=?,mutation_request_fingerprint=? WHERE city_code=? AND article_id=? AND version=?`,[versionId,key,fingerprint,city,articleId,expectedVersion]);return r.affectedRows===1;}
  async findVersion(c:PoolConnection,city:string,articleId:string,versionId:string){const [r]=await c.query<VersionRow[]>(`SELECT * FROM support_kb_article_versions WHERE city_code=? AND article_id=? AND article_version_id=? LIMIT 1`,[city,articleId,versionId]);return r[0]?mapVersion(r[0]):null;}
  async findReviewReplay(c:PoolConnection,city:string,versionId:string,key:string){const [r]=await c.query<(RowDataPacket&{action:string;request_fingerprint:string})[]>(`SELECT action,request_fingerprint FROM support_kb_review_events WHERE city_code=? AND article_version_id=? AND idempotency_key=? LIMIT 1`,[city,versionId,key]);return r[0]?{action:r[0].action,fingerprint:r[0].request_fingerprint}:null;}
  async insertReviewEvent(c:PoolConnection,x:{eventId:string;city:string;articleId:string;versionId:string;action:string;actor:string;note:string|null;key:string;fingerprint:string}){await c.query(`INSERT INTO support_kb_review_events(review_event_id,city_code,article_id,article_version_id,action,actor_admin_id,note,idempotency_key,request_fingerprint) VALUES(?,?,?,?,?,?,?,?,?)`,[x.eventId,x.city,x.articleId,x.versionId,x.action,x.actor,x.note,x.key,x.fingerprint]);}
  async updateVersionReview(c:PoolConnection,x:{city:string;versionId:string;status:KbVersion["reviewStatus"];actor:string;note:string|null}){const submitted=x.status==="pending_review";const [r]=await c.query<ResultSetHeader>(`UPDATE support_kb_article_versions SET review_status=?,submitted_by_admin_id=IF(?, ?, submitted_by_admin_id),submitted_at=IF(?,CURRENT_TIMESTAMP(3),submitted_at),reviewed_by_admin_id=IF(?,reviewed_by_admin_id,?),reviewed_at=IF(?,reviewed_at,CURRENT_TIMESTAMP(3)),review_note=IF(?,review_note,?) WHERE city_code=? AND article_version_id=? AND review_status=?`,[x.status,submitted,x.actor,submitted,submitted,x.actor,submitted,submitted,x.note,x.city,x.versionId,submitted?"draft":"pending_review"]);return r.affectedRows===1;}
  async publishCas(c:PoolConnection,x:{city:string;articleId:string;versionId:string;expectedVersion:number;key:string;fingerprint:string}){const [r]=await c.query<ResultSetHeader>(`UPDATE support_kb_articles SET published_version_id=?,lifecycle_status='published',version=version+1,mutation_idempotency_key=?,mutation_request_fingerprint=? WHERE city_code=? AND article_id=? AND version=?`,[x.versionId,x.key,x.fingerprint,x.city,x.articleId,x.expectedVersion]);return r.affectedRows===1;}
  async listPublishedCandidates(c:PoolConnection,city:string,language:string|null){const [r]=await c.query<CandidateRow[]>(`SELECT v.*,a.language article_language FROM support_kb_articles a INNER JOIN support_kb_article_versions v ON v.city_code=a.city_code AND v.article_version_id=a.published_version_id WHERE a.city_code=? AND a.lifecycle_status='published' AND (? IS NULL OR a.language=?) ORDER BY v.created_at DESC,a.article_id ASC LIMIT 200`,[city,language,language]);return r.map(row=>({articleId:row.article_id,articleVersionId:row.article_version_id,language:row.article_language,title:row.title,summary:row.summary,bodyMarkdown:row.body_markdown,keywords:array(row.keywords_json),intentTags:array(row.intent_tags_json),publishedAt:row.created_at.toISOString()}));}
}

export const supportKnowledgeBaseRepository = new SupportKnowledgeBaseRepository();
