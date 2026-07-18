import type {
  WorkerBankAccountResponse,
  WorkerReceivableBalanceResponse,
  WorkerWithdrawalResponse,
} from "@xlb/api-client";
import { Button, Card, EmptyState, FormField, Input, Select, StatusTag } from "@xlb/ui";
import { formatAmount, formatBusinessCode, formatDateTime, helperText, mutedBoxStyle, statusTone, uiChoice, uiStateIs, workerPanelStyle } from "./pageShared";

const withdrawalLabels: Record<WorkerWithdrawalResponse["status"], string> = {
  requested: "待审核", approved: "已审核", rejected: "已拒绝", marked_paid: "已标记打款", cancelled: "已取消",
};

export function WalletPage({
  balance, bankAccounts, withdrawals, busy, error, notice, networkOnline = true, accountHolder, bankName, bankCardNumber,
  withdrawalAmount, selectedBankAccountId, onReload, onAccountHolderChange, onBankNameChange,
  onBankCardNumberChange, onWithdrawalAmountChange, onSelectedBankAccountChange, onAddBankAccount, onRequestWithdrawal,
}: {
  balance: WorkerReceivableBalanceResponse | null; bankAccounts: WorkerBankAccountResponse[]; withdrawals: WorkerWithdrawalResponse[];
  busy: boolean; error: string | null; notice?: string | null; networkOnline?: boolean; accountHolder: string; bankName: string;
  bankCardNumber: string; withdrawalAmount: string; selectedBankAccountId: string; onReload: () => void;
  onAccountHolderChange: (value: string) => void; onBankNameChange: (value: string) => void;
  onBankCardNumberChange: (value: string) => void; onWithdrawalAmountChange: (value: string) => void;
  onSelectedBankAccountChange: (value: string) => void; onAddBankAccount: () => void; onRequestWithdrawal: () => void;
}) {
  const amount = Number(withdrawalAmount);
  const cardValid = /^\s*\d(?:[\d ]{10,30})\d\s*$/.test(bankCardNumber);
  const amountValid = Number.isFinite(amount) && amount > 0 && Boolean(balance) && amount <= (balance?.availableAmount ?? 0);
  return <>
    {!networkOnline && <div className="worker-state-banner worker-state-banner--danger" role="status"><strong>当前网络已断开</strong><span>钱包数据可能不是最新状态。请恢复网络并刷新后再新增账户或提交提现。</span></div>}
    {error && <Card title="部分数据或操作暂不可用" actions={<StatusTag tone="danger">请核对</StatusTag>} style={workerPanelStyle}><p className="worker-error-copy">{error}</p><Button disabled={!networkOnline || busy} onClick={onReload}>重新加载钱包</Button></Card>}
    {notice && <Card title="操作已记录" actions={<StatusTag tone="success">已同步</StatusTag>} style={workerPanelStyle}><p style={helperText}>{notice}</p></Card>}

    <Card title="应收钱包" actions={<StatusTag tone={balance ? "success" : "warning"}>{balance ? "余额已加载" : "等待余额"}</StatusTag>} style={workerPanelStyle}>
      <div className="worker-finance-grid">
        <div><span>可申请提现</span><strong>{balance ? formatAmount(balance.availableAmount) : "—"}</strong></div>
        <div><span>累计应收</span><strong>{balance ? formatAmount(balance.accruedAmount) : "—"}</strong></div>
        <div><span>提现审核中</span><strong>{balance ? formatAmount(balance.requestedWithdrawalAmount) : "—"}</strong></div>
        <div><span>已标记打款</span><strong>{balance ? formatAmount(balance.markedPaidAmount) : "—"}</strong></div>
        <div><span>应收调整</span><strong>{balance ? formatAmount(balance.adjustedAmount) : "—"}</strong></div>
      </div>
      <p className="worker-contract-note">“已标记打款”是平台账务状态，不等同于银行到账证明；本页不会展示或伪造第三方支付服务打款成功。</p>
      <Button disabled={busy || !networkOnline} onClick={onReload}>{busy ? "正在同步" : "刷新钱包"}</Button>
    </Card>

    <Card title="收款账户" actions={<StatusTag tone="primary">{bankAccounts.length} 个</StatusTag>} style={workerPanelStyle}>
      <div className="worker-stack-list">
        {bankAccounts.map((account) => <article key={account.bankAccountId} style={mutedBoxStyle}><div className="worker-card-actions"><strong>{account.bankName} · {account.bankCardMasked}</strong><StatusTag tone={uiChoice(uiStateIs(account.status, "active"), "success", "muted")}>{uiChoice(uiStateIs(account.status, "active"), "可用", "停用")}</StatusTag></div><span style={helperText}>户名：{account.accountHolder}</span></article>)}
        {bankAccounts.length === 0 && <EmptyState title="尚未添加收款账户" description="账户由平台安全保存；页面只回显掩码卡号。" />}
        <FormField label="账户姓名（最多 128 字）"><Input maxLength={128} value={accountHolder} onChange={(event) => onAccountHolderChange(event.target.value)} /></FormField>
        <FormField label="开户银行（最多 128 字）"><Input maxLength={128} value={bankName} onChange={(event) => onBankNameChange(event.target.value)} /></FormField>
        <FormField label="银行卡号（12～32 位，可含空格）"><Input inputMode="numeric" maxLength={32} value={bankCardNumber} onChange={(event) => onBankCardNumberChange(event.target.value)} /></FormField>
        <Button variant="primary" disabled={busy || !networkOnline || !accountHolder.trim() || !bankName.trim() || !cardValid} onClick={onAddBankAccount}>{busy ? "正在保存" : "保存收款账户"}</Button>
      </div>
    </Card>

    <Card title="申请提现" actions={<StatusTag tone="warning">需平台审核</StatusTag>} style={workerPanelStyle}>
      <div className="worker-stack-list">
        <FormField label="收款账户"><Select value={selectedBankAccountId} onChange={(event) => onSelectedBankAccountChange(event.target.value)}><option value="">请选择账户</option>{bankAccounts.filter((account) => account.status === "active").map((account) => <option key={account.bankAccountId} value={account.bankAccountId}>{account.bankName} · 尾号 {account.bankCardLast4}</option>)}</Select></FormField>
        <FormField label="申请金额（人民币）"><Input min="0.01" step="0.01" type="number" value={withdrawalAmount} onChange={(event) => onWithdrawalAmountChange(event.target.value)} /></FormField>
        {withdrawalAmount && !amountValid && <p className="worker-error-copy">金额须大于 0，且不能超过当前可提现余额。</p>}
        <Button variant="primary" disabled={busy || !networkOnline || !selectedBankAccountId || !amountValid} onClick={onRequestWithdrawal}>{busy ? "正在提交" : "提交提现申请"}</Button>
        <p className="worker-contract-note">提交后进入审核流程，不代表已结算、已打款或已到账。网络中断或结果未知时，请先刷新提现记录，避免重复提交。</p>
      </div>
    </Card>

    <Card title="提现记录" actions={<StatusTag tone="muted">{withdrawals.length} 条</StatusTag>} style={workerPanelStyle}>
      {withdrawals.length === 0 ? <EmptyState title="暂无提现记录" description="成功提交的申请会显示在这里。" /> : <div className="worker-stack-list">{withdrawals.map((row) => <article className="worker-record-card" key={row.withdrawalId}><div className="worker-task-card__topline"><div><span>申请编号</span><strong>{formatBusinessCode(row.withdrawalId, "提现单")}</strong></div><StatusTag tone={statusTone(row.status)}>{withdrawalLabels[row.status]}</StatusTag></div><dl className="worker-fact-grid"><div><dt>申请金额</dt><dd>{formatAmount(row.amount)}</dd></div><div><dt>申请时间</dt><dd>{formatDateTime(row.requestedAt)}</dd></div></dl>{row.reviewNote && <p style={helperText}>审核说明：{row.reviewNote}</p>}{row.markedPaidNote && <p style={helperText}>打款标记说明：{row.markedPaidNote}</p>}</article>)}</div>}
    </Card>
  </>;
}
