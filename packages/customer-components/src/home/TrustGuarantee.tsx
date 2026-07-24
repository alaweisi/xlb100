import {
  ClipboardText,
  SealCheck,
  ShieldCheck,
  Tag,
  type Icon,
} from "@phosphor-icons/react";
import type { CustomerHomeComponentProps, HomeTrustGuarantee } from "./homeTypes.js";
import { readArray } from "./homeTypes.js";

const DEFAULT_GUARANTEES: Readonly<Record<string, Omit<HomeTrustGuarantee, "guaranteeKey">>> = {
  verified_identity: { title: "实名认证", description: "师傅资质可核验" },
  transparent_pricing: { title: "价格透明", description: "服务价格有依据" },
  service_tracking: { title: "服务跟踪", description: "服务进度可查看" },
  aftersale_guarantee: { title: "售后保障", description: "问题处理有通道" },
};

const GUARANTEE_ICON: Readonly<Record<string, Icon>> = {
  verified_identity: SealCheck,
  transparent_pricing: Tag,
  service_tracking: ClipboardText,
  aftersale_guarantee: ShieldCheck,
};

export function TrustGuarantee({
  instance,
  data,
}: CustomerHomeComponentProps<"trust_guarantee">) {
  const delivered = new Map(
    readArray<HomeTrustGuarantee>(data.items).map((item) => [item.guaranteeKey, item]),
  );

  return (
    <section className="xlb-home-trust" aria-label="平台服务保障">
      {instance.props.itemKeys.map((key) => {
        const item = delivered.get(key) ?? { guaranteeKey: key, ...DEFAULT_GUARANTEES[key] };
        const GuaranteeIcon = GUARANTEE_ICON[key] ?? ShieldCheck;
        return (
          <div key={key}>
            <GuaranteeIcon aria-hidden="true" />
            <span>
              <strong>{item.title}</strong>
              <small>{item.description}</small>
            </span>
          </div>
        );
      })}
    </section>
  );
}
