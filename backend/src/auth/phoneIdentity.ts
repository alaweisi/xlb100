import { createHmac } from "node:crypto";
import { loadEnv } from "@xlb/config";

export function validateMainlandPhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone);
}

export function maskPhone(phone: string): string {
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

export function hashPhoneIdentity(phone: string): string {
  return createHmac("sha256", loadEnv().authPhoneHashSecret)
    .update(`xlb:worker-phone:v1:${phone}`, "utf8")
    .digest("hex");
}
