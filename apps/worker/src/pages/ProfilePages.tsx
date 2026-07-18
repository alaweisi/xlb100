import type { WorkerCertification, WorkerLocation } from "@xlb/types";
import { Button, Card, FormField, Input, Select, StatusTag } from "@xlb/ui";
import { formatBusinessCode, formatCityName, formatDateTime, formatServiceName, helperText, mutedBoxStyle, statusTone, uiChoice, uiStateIs, workerPanelStyle } from "./pageShared";

type QueryParams = { cityCode: string };
const certStatusLabels: Record<WorkerCertification["status"], string> = { pending: "待审核", approved: "已通过", rejected: "已拒绝", expired: "已过期" };

export function WorkerLocationPage({ location, busy, error, notice, networkOnline = true, latitude, longitude, radius, sharing,
  onLatitudeChange, onLongitudeChange, onRadiusChange, onSharingChange, onSave, onReload,
}: {
  location: WorkerLocation | null; busy: boolean; error: string | null; notice?: string | null; networkOnline?: boolean;
  latitude: string; longitude: string; radius: string; sharing: boolean;
  onLatitudeChange: (value: string) => void; onLongitudeChange: (value: string) => void;
  onRadiusChange: (value: string) => void; onSharingChange: (value: boolean) => void;
  onSave: () => void; onReload: () => void;
}) {
  const latitudeNumber = Number(latitude), longitudeNumber = Number(longitude), radiusNumber = Number(radius);
  const valid = Number.isFinite(latitudeNumber) && latitudeNumber >= -90 && latitudeNumber <= 90 && Number.isFinite(longitudeNumber) && longitudeNumber >= -180 && longitudeNumber <= 180 && Number.isFinite(radiusNumber) && radiusNumber >= 1 && radiusNumber <= 50;
  return <>
    {!networkOnline && <div className="worker-state-banner worker-state-banner--danger" role="status"><strong>当前网络已断开</strong><span>位置更新已关闭。恢复网络后先刷新，避免覆盖其他设备上的新状态。</span></div>}
    {error && <Card title="位置状态暂不可用" actions={<StatusTag tone="danger">请核对</StatusTag>} style={workerPanelStyle}><p className="worker-error-copy">{error}</p></Card>}
    {notice && <Card title="位置设置已同步" actions={<StatusTag tone="success">已保存</StatusTag>} style={workerPanelStyle}><p style={helperText}>{notice}</p></Card>}
    <Card title="位置共享与接单半径" actions={<StatusTag tone={uiChoice(uiStateIs(location?.freshness, "fresh"), "success", "warning")}>{uiChoice(uiStateIs(location?.freshness, "fresh"), "位置有效", location ? "位置已过期" : "尚未上报")}</StatusTag>} style={workerPanelStyle}>
      <div className="worker-stack-list">
        {location && <div style={mutedBoxStyle}><div className="worker-card-actions"><strong>{location.locationSharingEnabled ? "位置共享已开启" : "位置共享已关闭"}</strong><StatusTag tone={uiChoice(uiStateIs(location.freshness, "fresh"), "success", "warning")}>{uiChoice(uiStateIs(location.freshness, "fresh"), "新鲜", "陈旧")}</StatusTag></div><span style={helperText}>精确坐标：{location.latitude}, {location.longitude}</span><span style={helperText}>有效至：{formatDateTime(location.expiresAt)} · 服务半径 {location.serviceRadiusKm} 公里</span></div>}
        <FormField label="纬度（-90～90）"><Input step="any" type="number" value={latitude} onChange={(event) => onLatitudeChange(event.target.value)} /></FormField>
        <FormField label="经度（-180～180）"><Input step="any" type="number" value={longitude} onChange={(event) => onLongitudeChange(event.target.value)} /></FormField>
        <FormField label="服务半径（1～50 公里）"><Input min="1" max="50" type="number" value={radius} onChange={(event) => onRadiusChange(event.target.value)} /></FormField>
        <label className="worker-checkbox-row"><input type="checkbox" checked={sharing} onChange={(event) => onSharingChange(event.target.checked)} /><span><strong>参与位置匹配</strong><small>关闭后仍保存位置，但不参与轻量位置匹配。</small></span></label>
        {!valid && <p className="worker-error-copy">请填写有效经纬度，并将服务半径设为 1～50 公里。</p>}
        <div className="worker-card-actions"><Button variant="primary" disabled={busy || !networkOnline || !valid} onClick={onSave}>{busy ? "正在更新" : "更新当前位置"}</Button><Button disabled={busy || !networkOnline} onClick={onReload}>刷新状态</Button></div>
        <p className="worker-contract-note">精确坐标仅返回给当前已认证师傅；管理侧只读取距离、预计到达时间和新鲜度等派生信息。页面不会声称第三方地图服务已执行。</p>
      </div>
    </Card>
  </>;
}

export function CertificationPage({ cityCode, workerId, certType, certName, submitting, error, notice, receipt, networkOnline = true, onCertTypeChange, onCertNameChange, onSubmit,
}: QueryParams & { workerId: string; certType: string; certName: string; submitting: boolean; error: string | null; notice: string | null; receipt?: WorkerCertification | null; networkOnline?: boolean; onCertTypeChange: (value: string) => void; onCertNameChange: (value: string) => void; onSubmit: () => void; }) {
  const valid = certType.trim().length > 0 && certType.trim().length <= 64 && certName.trim().length > 0 && certName.trim().length <= 128;
  return <>
    {!networkOnline && <div className="worker-state-banner worker-state-banner--danger" role="status"><strong>当前网络已断开</strong><span>认证提交已关闭；恢复网络后请先确认是否已有申请记录。</span></div>}
    {error && <Card title="认证申请未完成" actions={<StatusTag tone="danger">请核对</StatusTag>} style={workerPanelStyle}><p className="worker-error-copy">{error}</p></Card>}
    {notice && <Card title="申请回执" actions={<StatusTag tone="success">已提交</StatusTag>} style={workerPanelStyle}><p style={helperText}>{notice}</p></Card>}
    {receipt && <Card title="本次会话申请记录" actions={<StatusTag tone={statusTone(receipt.status)}>{certStatusLabels[receipt.status]}</StatusTag>} style={workerPanelStyle}><dl className="worker-fact-grid"><div><dt>申请编号</dt><dd>{formatBusinessCode(receipt.certificationId, "认证申请")}</dd></div><div><dt>资格类型</dt><dd>{formatServiceName(receipt.certType)}</dd></div><div><dt>资格名称</dt><dd>{receipt.certName}</dd></div><div><dt>提交时间</dt><dd>{formatDateTime(receipt.submittedAt)}</dd></div></dl>{receipt.rejectReason && <p className="worker-error-copy">拒绝原因：{receipt.rejectReason}</p>}</Card>}
    <Card title="提交服务资格" actions={<StatusTag tone="warning">等待人工审核</StatusTag>} style={workerPanelStyle}>
      <div className="worker-stack-list">
        <div style={mutedBoxStyle}><strong>申请主体</strong><span style={helperText}>{formatBusinessCode(workerId, "师傅编号")} · {formatCityName(cityCode)}</span></div>
        <FormField label="资格类型"><Select value={certType} onChange={(event) => onCertTypeChange(event.target.value)}><option value={certType}>{formatServiceName(certType)}</option></Select></FormField>
        <FormField label="资格名称（最多 128 字）"><Input maxLength={128} value={certName} onChange={(event) => onCertNameChange(event.target.value)} /></FormField>
        <Button disabled={submitting || !networkOnline || !valid} onClick={onSubmit} variant="primary">{submitting ? "正在提交" : "提交认证申请"}</Button>
        <p className="worker-contract-note">提交只代表进入审核，不代表资格已通过或可承接所有服务。当前共享接口尚未提供师傅侧认证列表和审核结果查询，本页只保留本次会话的真实提交回执，不会伪造“已通过”。后续资格是否可用，以具体服务的资格核验结果为准。</p>
      </div>
    </Card>
  </>;
}
