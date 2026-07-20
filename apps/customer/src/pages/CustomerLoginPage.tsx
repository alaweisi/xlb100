import { type FormEvent, useCallback, useState } from "react";
import { Button, Card, FormField, Input, StatusTag } from "@xlb/ui";
import {
  customerAuthErrorMessage,
  isValidCustomerPhone,
  loginCustomerWithOtp,
  requestCustomerOtp,
  type CustomerSession,
} from "../features/auth/customerAuth";

export function CustomerLoginPage({
  reason,
  onLogin,
}: {
  reason?: "expired";
  onLogin: (session: CustomerSession) => void;
}) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeRequested, setCodeRequested] = useState(false);
  const [busy, setBusy] = useState<"request" | "login" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const phoneReady = isValidCustomerPhone(phone);
  const codeReady = /^\d{6}$/u.test(code.trim());

  const requestCode = useCallback(async () => {
    setBusy("request");
    setError(null);
    setNotice(null);
    try {
      const result = await requestCustomerOtp(phone);
      setCodeRequested(true);
      setNotice(`验证码已发送，${Math.ceil(result.ttlSeconds / 60)} 分钟内有效。`);
    } catch (caught) {
      setError(customerAuthErrorMessage(caught, "验证码发送失败，请稍后重试。"));
    } finally {
      setBusy(null);
    }
  }, [phone]);

  const submit = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    setBusy("login");
    setError(null);
    try {
      onLogin(await loginCustomerWithOtp(phone, code));
    } catch (caught) {
      setError(customerAuthErrorMessage(caught, "登录失败，请稍后重试。"));
    } finally {
      setBusy(null);
    }
  }, [code, onLogin, phone]);

  return (
    <main className="customer-auth-page">
      <section className="customer-auth-panel" aria-labelledby="customer-login-title">
        <div className="customer-auth-brand" aria-hidden="true">喜乐帮</div>
        <Card title="顾客登录" actions={<StatusTag tone="primary">短信验证</StatusTag>}>
          <form className="customer-auth-form" onSubmit={(event) => void submit(event)}>
            <div>
              <h1 id="customer-login-title">欢迎回来</h1>
              <p>使用发送到手机的一次性验证码登录。</p>
            </div>
            {reason === "expired" && (
              <div className="customer-auth-session-notice" role="status">
                登录状态已失效，请重新登录。
              </div>
            )}
            <FormField label="手机号">
              <Input
                aria-label="手机号"
                autoComplete="tel"
                inputMode="tel"
                maxLength={11}
                placeholder="请输入 11 位手机号"
                value={phone}
                onChange={(event) => setPhone(event.target.value.replace(/\D/gu, "").slice(0, 11))}
              />
            </FormField>
            <div className="customer-auth-code-row">
              <FormField label="短信验证码">
                <Input
                  aria-label="短信验证码"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="请输入 6 位验证码"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/gu, "").slice(0, 6))}
                />
              </FormField>
              <Button type="button" disabled={busy !== null || !phoneReady} onClick={() => void requestCode()}>
                {busy === "request" ? "正在发送…" : codeRequested ? "重新获取" : "获取验证码"}
              </Button>
            </div>
            <Button type="submit" variant="primary" disabled={busy !== null || !phoneReady || !codeReady}>
              {busy === "login" ? "正在登录…" : "登录并继续"}
            </Button>
            {notice && <div className="customer-auth-success" role="status">{notice}</div>}
            {error && <div className="customer-auth-error" role="alert">{error}</div>}
            <p className="customer-auth-privacy">验证码仅可使用一次，请勿向任何人透露。</p>
          </form>
        </Card>
      </section>
    </main>
  );
}
