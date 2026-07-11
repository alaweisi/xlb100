import { useCallback, useState } from "react";
import { Button, Card, FormField, Input, StatusTag } from "@xlb/ui";
import {
  loginWorkerWithCode,
  readWorkerDebugCode,
  requestWorkerLoginCode,
  type WorkerSession,
} from "../app/workerAuth";
import { helperText, workerPanelStyle } from "./pageShared";

const DEFAULT_CITY_CODE = "hangzhou";
const DEFAULT_WORKER_PHONE = "13800000001";

export function WorkerLoginPage({
  cityCode,
  onCityChange,
  onLogin,
}: {
  cityCode: string;
  onCityChange: (value: string) => void;
  onLogin: (session: WorkerSession) => void;
}) {
  const [phone, setPhone] = useState(DEFAULT_WORKER_PHONE);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState<"request" | "debug" | "login" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debugCodeEnabledInUi =
    ((import.meta as ImportMeta & { env?: { MODE?: string } }).env?.MODE ?? "development") !== "production";

  const requestCode = useCallback(async () => {
    setLoading("request");
    setError(null);
    setNotice(null);
    try {
      const result = await requestWorkerLoginCode(phone.trim());
      setNotice(`Code sent. It expires in ${result.ttlSeconds}s.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to request login code");
    } finally {
      setLoading(null);
    }
  }, [phone]);

  const fillDebugCode = useCallback(async () => {
    setLoading("debug");
    setError(null);
    setNotice(null);
    try {
      const result = await readWorkerDebugCode(phone.trim());
      setCode(result.code);
      setNotice("Debug code filled for local verification.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Debug code unavailable");
    } finally {
      setLoading(null);
    }
  }, [phone]);

  const submitLogin = useCallback(async () => {
    setLoading("login");
    setError(null);
    setNotice(null);
    try {
      const session = await loginWorkerWithCode(phone.trim(), code.trim());
      onLogin(session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Worker login failed");
    } finally {
      setLoading(null);
    }
  }, [code, onLogin, phone]);

  return (
    <>
      <Card title="Worker Login" actions={<StatusTag tone="primary">Bearer</StatusTag>} style={workerPanelStyle}>
        <div style={{ display: "grid", gap: 10 }}>
          <p style={helperText}>Use phone OTP login before opening the worker task pool.</p>
          <FormField label="cityCode">
            <Input value={cityCode} onChange={(event) => onCityChange(event.target.value || DEFAULT_CITY_CODE)} />
          </FormField>
          <FormField label="phone">
            <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
          </FormField>
          <FormField label="code">
            <Input value={code} onChange={(event) => setCode(event.target.value)} />
          </FormField>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Button onClick={requestCode} disabled={loading !== null || !phone.trim()}>
              {loading === "request" ? "Sending" : "Send code"}
            </Button>
            {debugCodeEnabledInUi && (
              <Button onClick={fillDebugCode} disabled={loading !== null || !phone.trim()}>
                {loading === "debug" ? "Reading" : "Fill debug code"}
              </Button>
            )}
            <Button onClick={submitLogin} disabled={loading !== null || !phone.trim() || !code.trim()} variant="primary">
              {loading === "login" ? "Logging in" : "Login"}
            </Button>
          </div>
          {notice && <p style={helperText}>{notice}</p>}
          {error && <p style={{ ...helperText, color: "#fda29b" }}>{error}</p>}
        </div>
      </Card>
    </>
  );
}
