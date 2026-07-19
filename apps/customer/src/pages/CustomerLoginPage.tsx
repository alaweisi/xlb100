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
      setNotice(`Verification code sent. It expires in ${Math.ceil(result.ttlSeconds / 60)} minutes.`);
    } catch (caught) {
      setError(customerAuthErrorMessage(caught, "Unable to send the verification code."));
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
      setError(customerAuthErrorMessage(caught, "Unable to sign in."));
    } finally {
      setBusy(null);
    }
  }, [code, onLogin, phone]);

  return (
    <main className="customer-auth-page">
      <section className="customer-auth-panel" aria-labelledby="customer-login-title">
        <div className="customer-auth-brand" aria-hidden="true">喜乐帮</div>
        <Card title="Customer login" actions={<StatusTag tone="primary">OTP</StatusTag>}>
          <form className="customer-auth-form" onSubmit={(event) => void submit(event)}>
            <div>
              <h1 id="customer-login-title">Welcome back</h1>
              <p>Sign in with the one-time code sent to your mobile phone.</p>
            </div>
            {reason === "expired" && (
              <div className="customer-auth-session-notice" role="status">
                Your session expired. Please sign in again.
              </div>
            )}
            <FormField label="Phone number">
              <Input
                aria-label="Phone number"
                autoComplete="tel"
                inputMode="tel"
                maxLength={11}
                placeholder="11-digit mobile number"
                value={phone}
                onChange={(event) => setPhone(event.target.value.replace(/\D/gu, "").slice(0, 11))}
              />
            </FormField>
            <div className="customer-auth-code-row">
              <FormField label="Verification code">
                <Input
                  aria-label="Verification code"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6-digit code"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/gu, "").slice(0, 6))}
                />
              </FormField>
              <Button type="button" disabled={busy !== null || !phoneReady} onClick={() => void requestCode()}>
                {busy === "request" ? "Sending…" : codeRequested ? "Resend code" : "Send code"}
              </Button>
            </div>
            <Button type="submit" variant="primary" disabled={busy !== null || !phoneReady || !codeReady}>
              {busy === "login" ? "Signing in…" : "Sign in"}
            </Button>
            {notice && <div className="customer-auth-success" role="status">{notice}</div>}
            {error && <div className="customer-auth-error" role="alert">{error}</div>}
            <p className="customer-auth-privacy">The code is single-use. Never share it with support staff.</p>
          </form>
        </Card>
      </section>
    </main>
  );
}
