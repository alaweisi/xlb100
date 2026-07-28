import { useCallback, useState } from "react";
import { Button, Card, FormField, Input, StatusTag } from "@xlb/ui";
import {
  loginWorkerWithCode,
  readWorkerDebugCode,
  requestWorkerLoginCode,
  type WorkerSession,
  workerVisibleError,
} from "../app/workerAuth";
import {
  IS_WORKER_INVESTOR_DEMO,
  WORKER_INVESTOR_DEMO_PHONE,
} from "../investorDemo";
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
  const [phone, setPhone] = useState(
    IS_WORKER_INVESTOR_DEMO
      ? WORKER_INVESTOR_DEMO_PHONE
      : DEFAULT_WORKER_PHONE,
  );
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
      if (result.stagingDemoCode) {
        setCode(result.stagingDemoCode);
        setNotice(`演示验证码已准备，有效期 ${result.ttlSeconds} 秒。`);
      } else {
        setNotice(`验证码已发送，有效期 ${result.ttlSeconds} 秒。`);
      }
    } catch (caught) {
      setError(workerVisibleError(caught, "验证码暂时无法获取，请稍后重试。"));
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
      setError(workerVisibleError(caught, "本地调试验证码不可用。"));
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
      setError(workerVisibleError(caught, "登录未完成，请重新获取验证码。"));
    } finally {
      setLoading(null);
    }
  }, [code, onLogin, phone]);

  return (
    <>
      <Card title="师傅端登录" actions={<StatusTag tone="primary">演示验证</StatusTag>} style={workerPanelStyle}>
        <div style={{ display: "grid", gap: 10 }}>
          <p style={helperText}>验证演示手机号后即可进入杭州任务池。</p>
          <FormField label="服务城市">
            {IS_WORKER_INVESTOR_DEMO ? (
              <Input aria-label="杭州演示区" value="杭州演示区" readOnly />
            ) : (
              <Input value={cityCode} onChange={(event) => onCityChange(event.target.value || DEFAULT_CITY_CODE)} />
            )}
          </FormField>
          <FormField label="手机号码">
            <Input
              value={phone}
              readOnly={IS_WORKER_INVESTOR_DEMO}
              onChange={(event) => setPhone(event.target.value)}
            />
          </FormField>
          <FormField label="验证码">
            <Input value={code} onChange={(event) => setCode(event.target.value)} />
          </FormField>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Button onClick={requestCode} disabled={loading !== null || !phone.trim()}>
              {loading === "request" ? "正在获取…" : "获取验证码"}
            </Button>
            {debugCodeEnabledInUi && (
              <Button onClick={fillDebugCode} disabled={loading !== null || !phone.trim()}>
                {loading === "debug" ? "读取中…" : "填入本地调试码"}
              </Button>
            )}
            <Button onClick={submitLogin} disabled={loading !== null || !phone.trim() || !code.trim()} variant="primary">
              {loading === "login" ? "正在登录…" : "登录师傅端"}
            </Button>
          </div>
          {notice && <p style={helperText}>{notice}</p>}
          {error && <p style={{ ...helperText, color: "#fda29b" }}>{error}</p>}
        </div>
      </Card>
    </>
  );
}
