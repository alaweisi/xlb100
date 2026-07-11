import type {
  WorkerBankAccountResponse,
  WorkerReceivableBalanceResponse,
  WorkerWithdrawalResponse,
} from "@xlb/api-client";
import { Button, Card, EmptyState, FormField, Input, Select, StatusTag, Table } from "@xlb/ui";
import { formatAmount, helperText, mutedBoxStyle, workerPanelStyle } from "./pageShared";

export function WalletPage({
  balance, bankAccounts, withdrawals, busy, error, accountHolder, bankName, bankCardNumber,
  withdrawalAmount, selectedBankAccountId, onReload, onAccountHolderChange, onBankNameChange,
  onBankCardNumberChange, onWithdrawalAmountChange, onSelectedBankAccountChange, onAddBankAccount, onRequestWithdrawal,
}: {
  balance: WorkerReceivableBalanceResponse | null;
  bankAccounts: WorkerBankAccountResponse[];
  withdrawals: WorkerWithdrawalResponse[];
  busy: boolean;
  error: string | null;
  accountHolder: string;
  bankName: string;
  bankCardNumber: string;
  withdrawalAmount: string;
  selectedBankAccountId: string;
  onReload: () => void;
  onAccountHolderChange: (value: string) => void;
  onBankNameChange: (value: string) => void;
  onBankCardNumberChange: (value: string) => void;
  onWithdrawalAmountChange: (value: string) => void;
  onSelectedBankAccountChange: (value: string) => void;
  onAddBankAccount: () => void;
  onRequestWithdrawal: () => void;
}) {
  return <>
    <Card title="Receivable Wallet" actions={<StatusTag tone="success">Real API</StatusTag>} style={workerPanelStyle}>
      <div style={{ ...mutedBoxStyle, gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
        <div><p style={helperText}>Available</p><strong>{formatAmount(balance?.availableAmount ?? 0)}</strong></div>
        <div><p style={helperText}>Accrued</p><strong>{formatAmount(balance?.accruedAmount ?? 0)}</strong></div>
        <div><p style={helperText}>Requested</p><strong>{formatAmount(balance?.requestedWithdrawalAmount ?? 0)}</strong></div>
        <div><p style={helperText}>Marked paid</p><strong>{formatAmount(balance?.markedPaidAmount ?? 0)}</strong></div>
      </div>
      <div style={{ marginTop: 10 }}><Button onClick={onReload} disabled={busy}>Refresh wallet</Button></div>
    </Card>
    <Card title="Bank Account" actions={<StatusTag tone="primary">{bankAccounts.length}</StatusTag>} style={workerPanelStyle}>
      <div style={{ display: "grid", gap: 10 }}>
        {bankAccounts.map(account => <div key={account.bankAccountId} style={mutedBoxStyle}>
          <strong>{account.bankName} · {account.bankCardMasked}</strong><span style={helperText}>{account.accountHolder}</span>
        </div>)}
        <FormField label="Account holder"><Input value={accountHolder} onChange={event => onAccountHolderChange(event.target.value)} /></FormField>
        <FormField label="Bank"><Input value={bankName} onChange={event => onBankNameChange(event.target.value)} /></FormField>
        <FormField label="Card number"><Input value={bankCardNumber} onChange={event => onBankCardNumberChange(event.target.value)} /></FormField>
        <Button variant="primary" disabled={busy || !accountHolder.trim() || !bankName.trim() || bankCardNumber.length < 12} onClick={onAddBankAccount}>Add bank account</Button>
      </div>
    </Card>
    <Card title="Withdrawal Request" actions={<StatusTag tone="warning">No provider payout</StatusTag>} style={workerPanelStyle}>
      <div style={{ display: "grid", gap: 10 }}>
        <FormField label="Bank account"><Select value={selectedBankAccountId} onChange={event => onSelectedBankAccountChange(event.target.value)}><option value="">Select account</option>{bankAccounts.map(account => <option key={account.bankAccountId} value={account.bankAccountId}>{account.bankName} · {account.bankCardLast4}</option>)}</Select></FormField>
        <FormField label="Amount"><Input type="number" value={withdrawalAmount} onChange={event => onWithdrawalAmountChange(event.target.value)} /></FormField>
        <Button variant="primary" disabled={busy || !selectedBankAccountId || Number(withdrawalAmount) <= 0} onClick={onRequestWithdrawal}>Submit request</Button>
        {withdrawals.length === 0 ? <EmptyState title="No withdrawal request" /> : <Table rows={withdrawals} getRowKey={row => row.withdrawalId} columns={[
          { key: "id", title: "Request", render: row => row.withdrawalId },
          { key: "amount", title: "Amount", render: row => formatAmount(row.amount) },
          { key: "status", title: "Status", render: row => <StatusTag tone={row.status === "rejected" ? "danger" : row.status === "marked_paid" ? "success" : "warning"}>{row.status}</StatusTag> },
        ]} />}
      </div>
      {error && <p style={{ ...helperText, color: "#fda29b", marginTop: 10 }}>{error}</p>}
    </Card>
  </>;
}
