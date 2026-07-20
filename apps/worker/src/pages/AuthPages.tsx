import { useCallback, useState } from "react";
import { Button, FormField, IdentityGate, Input, Select, StatusTag } from "@xlb/ui";
import {
  loginWorkerWithCode,
  requestWorkerLoginCode,
  WorkerAccessError,
  type WorkerAccessStatus,
  type WorkerSession,
} from "../app/workerAuth";
import { helperText, uiChoice, uiStateIs } from "./pageShared";

const DEFAULT_CITY_CODE = "hangzhou";
const DEFAULT_WORKER_PHONE = "13800000001";

export function WorkerLoginPage({
  cityCode,
  onCityChange,
  onLogin,
  onAccessBlocked,
}: {
  cityCode: string;
  onCityChange: (value: string) => void;
  onLogin: (session: WorkerSession) => void;
  onAccessBlocked: (status: WorkerAccessStatus) => void;
}) {
  const [phone, setPhone] = useState(DEFAULT_WORKER_PHONE);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState<"request" | "login" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestCode = useCallback(async () => {
    setLoading("request");
    setError(null);
    setNotice(null);
    try {
      const result = await requestWorkerLoginCode(phone.trim());
      if (result.debugCode) setCode(result.debugCode);
      setNotice(result.debugCode
        ? `隔离云测验证码：${result.debugCode}，已自动填入。`
        : `验证码已发送，${result.ttlSeconds} 秒内有效。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "验证码发送失败，请稍后重试");
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
      if (caught instanceof WorkerAccessError) {
        onAccessBlocked(caught.status);
        return;
      }
      setError(caught instanceof Error ? caught.message : "登录失败，请核对验证码后重试");
    } finally {
      setLoading(null);
    }
  }, [code, onAccessBlocked, onLogin, phone]);

  return (
    <IdentityGate
      visualRole="worker"
      title="师傅身份验证"
      description="使用手机号验证码登录，验证完成后进入任务大厅。"
      recoveryTarget="验证完成后返回：待接任务大厅"
      status={<StatusTag tone="primary">需要登录</StatusTag>}
      style={{ alignItems: "center", minHeight: 824, padding: 20 }}
      form={
        <>
          <FormField label={<span style={{ color: "#f8fbff" }}>工作城市</span>}>
            <Select value={cityCode} onChange={(event) => onCityChange(event.target.value || DEFAULT_CITY_CODE)}>
              <option value="hangzhou">杭州</option><option value="shanghai">上海</option><option value="beijing">北京</option>
            </Select>
          </FormField>
          <FormField label={<span style={{ color: "#f8fbff" }}>手机号</span>}>
            <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
          </FormField>
          <FormField label={<span style={{ color: "#f8fbff" }}>短信验证码</span>}>
            <Input value={code} onChange={(event) => setCode(event.target.value)} />
          </FormField>
          {notice && <p style={helperText}>{notice}</p>}
        </>
      }
      actions={
        <>
          <Button
            onClick={requestCode}
            disabled={loading !== null || !phone.trim()}
            style={{ borderColor: "rgba(184, 200, 220, 0.72)", color: "#f8fbff" }}
          >
            {uiChoice(uiStateIs(loading, "request"), "正在发送", "获取验证码")}
          </Button>
          <Button onClick={submitLogin} disabled={loading !== null || !phone.trim() || !code.trim()} variant="primary">
            {uiChoice(uiStateIs(loading, "login"), "正在登录", "登录并进入任务大厅")}
          </Button>
        </>
      }
      error={error}
    />
  );
}
