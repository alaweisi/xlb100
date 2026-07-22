import {
  CUSTOMER_SDUI_ACTION_KEYS,
  CUSTOMER_SDUI_COMPONENT_CONTRACT_VERSIONS,
  CUSTOMER_SDUI_COMPONENT_REGIONS,
  CUSTOMER_SDUI_COMPONENT_TYPES,
  CUSTOMER_SDUI_DATA_KEYS,
  CUSTOMER_SDUI_GUARANTEE_KEYS,
  CUSTOMER_SDUI_PAGE_IDS,
  CUSTOMER_SDUI_RESOLUTION_REASONS,
  CUSTOMER_SDUI_REVISION_STATUSES,
  CUSTOMER_SDUI_SCHEMA_VERSIONS,
} from "@xlb/types";
import type { CustomerSduiManifestDefinition } from "@xlb/types";
import { z } from "zod";
import { cityCodeSchema } from "./cityCodeSchema.js";

const identifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z][a-z0-9._:-]*$/, "identifier must use an allowlist-safe format");

const revisionSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "revision contains unsupported characters");

const idempotencyKeySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "idempotency key contains unsupported characters");

const normalizedLocaleSchema = z
  .string()
  .regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/, "locale must be a normalized BCP 47 language tag");

const semanticVersionSchema = z
  .string()
  .regex(/^\d{1,6}\.\d{1,6}\.\d{1,6}$/, "app version must be normalized major.minor.patch");

function containsUnsupportedCopyCharacter(value: string): boolean {
  return value.includes("<") || value.includes(">") ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127;
    });
}

const safeCopySchema = (maximumLength: number) => z
  .string()
  .trim()
  .min(1)
  .max(maximumLength)
  .refine((value) => !containsUnsupportedCopyCharacter(value), "copy contains unsupported markup or control characters");

const auditReasonSchema = safeCopySchema(500);

function compareSemanticVersions(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export const customerSduiSchemaVersionSchema = z.enum(CUSTOMER_SDUI_SCHEMA_VERSIONS);
export const customerSduiComponentContractVersionSchema = z.enum(
  CUSTOMER_SDUI_COMPONENT_CONTRACT_VERSIONS,
);
export const customerSduiPageIdSchema = z.enum(CUSTOMER_SDUI_PAGE_IDS);
export const customerSduiComponentTypeSchema = z.enum(CUSTOMER_SDUI_COMPONENT_TYPES);
export const customerSduiComponentRegionSchema = z.enum(CUSTOMER_SDUI_COMPONENT_REGIONS);
export const customerSduiDataKeySchema = z.enum(CUSTOMER_SDUI_DATA_KEYS);
export const customerSduiActionKeySchema = z.enum(CUSTOMER_SDUI_ACTION_KEYS);
export const customerSduiGuaranteeKeySchema = z.enum(CUSTOMER_SDUI_GUARANTEE_KEYS);
export const customerSduiResolutionReasonSchema = z.enum(CUSTOMER_SDUI_RESOLUTION_REASONS);

export const customerSduiScopeSchema = z
  .object({
    cityCodes: z.array(cityCodeSchema).min(1).max(64).nullable(),
    locales: z.array(normalizedLocaleSchema).min(1).max(16),
    minimumAppVersion: semanticVersionSchema,
    maximumAppVersion: semanticVersionSchema.nullable(),
    audienceTags: z.array(identifierSchema).max(32),
  })
  .strict()
  .superRefine((scope, context) => {
    if (scope.cityCodes !== null && new Set(scope.cityCodes).size !== scope.cityCodes.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cityCodes"],
        message: "cityCodes must be unique",
      });
    }
    if (new Set(scope.locales).size !== scope.locales.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["locales"],
        message: "locales must be unique",
      });
    }
    if (new Set(scope.audienceTags).size !== scope.audienceTags.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["audienceTags"],
        message: "audienceTags must be unique",
      });
    }
    if (scope.maximumAppVersion !== null &&
        compareSemanticVersions(scope.maximumAppVersion, scope.minimumAppVersion) < 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maximumAppVersion"],
        message: "maximumAppVersion must not be lower than minimumAppVersion",
      });
    }
  });

const noParametersSchema = z.object({}).strict();

export const customerSduiDataSourceSchema = z.discriminatedUnion("dataKey", [
  z.object({
    id: identifierSchema,
    dataKey: z.literal("customer.current_location"),
    parameters: noParametersSchema,
  }).strict(),
  z.object({
    id: identifierSchema,
    dataKey: z.literal("customer.notification_summary"),
    parameters: noParametersSchema,
  }).strict(),
  z.object({
    id: identifierSchema,
    dataKey: z.literal("catalog.service_categories"),
    parameters: z.object({ limit: z.union([z.literal(4), z.literal(8), z.literal(12), z.literal(16)]) }).strict(),
  }).strict(),
  z.object({
    id: identifierSchema,
    dataKey: z.literal("catalog.recommended_services"),
    parameters: z.object({
      limit: z.number().int().min(1).max(20),
      strategy: z.enum(["default", "nearby", "popular"]),
    }).strict(),
  }).strict(),
  z.object({
    id: identifierSchema,
    dataKey: z.literal("provider.nearby"),
    parameters: z.object({
      limit: z.number().int().min(1).max(20),
      radiusMeters: z.number().int().min(500).max(50_000),
    }).strict(),
  }).strict(),
  z.object({
    id: identifierSchema,
    dataKey: z.literal("content.home_promotions"),
    parameters: z.object({
      limit: z.number().int().min(1).max(10),
      placement: z.literal("home"),
    }).strict(),
  }).strict(),
  z.object({
    id: identifierSchema,
    dataKey: z.literal("content.trust_guarantees"),
    parameters: noParametersSchema,
  }).strict(),
]);

export const customerSduiActionDefinitionSchema = z
  .object({
    id: identifierSchema,
    actionKey: customerSduiActionKeySchema,
  })
  .strict();

export const customerSduiDataBindingSchema = z
  .object({
    slot: identifierSchema,
    dataRef: identifierSchema,
    required: z.boolean(),
  })
  .strict();

export const customerSduiActionBindingSchema = z
  .object({
    slot: identifierSchema,
    actionRef: identifierSchema,
  })
  .strict();

const componentBaseShape = {
  id: identifierSchema,
  contractVersion: customerSduiComponentContractVersionSchema,
  order: z.number().int().min(0).max(999),
  enabled: z.boolean(),
  dataBindings: z.array(customerSduiDataBindingSchema).max(16),
  actionBindings: z.array(customerSduiActionBindingSchema).max(16),
};

export const customerSduiComponentInstanceSchema = z.discriminatedUnion("type", [
  z.object({
    ...componentBaseShape,
    type: z.literal("location_header"),
    region: z.literal("header"),
    props: z.object({
      subtitle: safeCopySchema(80).nullable(),
      showNotifications: z.boolean(),
    }).strict(),
  }).strict(),
  z.object({
    ...componentBaseShape,
    type: z.literal("search_bar"),
    region: z.literal("header"),
    props: z.object({
      placeholder: safeCopySchema(40),
      accessibleLabel: safeCopySchema(80),
    }).strict(),
  }).strict(),
  z.object({
    ...componentBaseShape,
    type: z.literal("service_grid"),
    region: z.literal("content"),
    props: z.object({
      title: safeCopySchema(40),
      columns: z.literal(4),
      maxItems: z.union([z.literal(4), z.literal(8), z.literal(12), z.literal(16)]),
      showViewAll: z.boolean(),
    }).strict(),
  }).strict(),
  z.object({
    ...componentBaseShape,
    type: z.literal("promotion_banner"),
    region: z.literal("content"),
    props: z.object({
      title: safeCopySchema(40).nullable(),
      autoplay: z.boolean(),
      intervalMs: z.number().int().min(3_000).max(10_000).nullable(),
    }).strict().superRefine((props, context) => {
      if (props.autoplay !== (props.intervalMs !== null)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["intervalMs"],
          message: "autoplay requires intervalMs and a disabled carousel must use null",
        });
      }
    }),
  }).strict(),
  z.object({
    ...componentBaseShape,
    type: z.literal("recommend_list"),
    region: z.literal("content"),
    props: z.object({
      title: safeCopySchema(40),
      maxItems: z.number().int().min(1).max(20),
      cardDensity: z.enum(["comfortable", "compact"]),
    }).strict(),
  }).strict(),
  z.object({
    ...componentBaseShape,
    type: z.literal("worker_nearby"),
    region: z.literal("content"),
    props: z.object({
      title: safeCopySchema(40),
      maxItems: z.number().int().min(1).max(20),
      showDistance: z.boolean(),
      showVerification: z.boolean(),
    }).strict(),
  }).strict(),
  z.object({
    ...componentBaseShape,
    type: z.literal("trust_guarantee"),
    region: z.literal("content"),
    props: z.object({
      itemKeys: z.array(customerSduiGuaranteeKeySchema).min(1).max(4),
    }).strict().refine((props) => new Set(props.itemKeys).size === props.itemKeys.length, {
      message: "trust guarantee itemKeys must be unique",
      path: ["itemKeys"],
    }),
  }).strict(),
  z.object({
    ...componentBaseShape,
    type: z.literal("bottom_navigation"),
    region: z.literal("footer"),
    props: z.object({
      activeItem: z.literal("home"),
      showDemandAction: z.boolean(),
    }).strict(),
  }).strict(),
]);

export const customerSduiFallbackPolicySchema = z
  .object({
    strategy: z.literal("last_known_good_then_builtin"),
    builtinManifestId: z.literal("customer.home.builtin"),
    maximumStaleSeconds: z.number().int().min(0).max(604_800),
  })
  .strict();

export const customerSduiPageManifestSchema = z
  .object({
    schemaVersion: customerSduiSchemaVersionSchema,
    componentContractVersion: customerSduiComponentContractVersionSchema,
    manifestId: identifierSchema,
    pageId: customerSduiPageIdSchema,
    revision: revisionSchema,
    contentHashSha256: z.string().regex(/^[a-f0-9]{64}$/, "contentHashSha256 must be a lowercase SHA-256 hex digest"),
    scope: customerSduiScopeSchema,
    components: z.array(customerSduiComponentInstanceSchema).min(4).max(32),
    dataSources: z.array(customerSduiDataSourceSchema).max(32),
    actions: z.array(customerSduiActionDefinitionSchema).max(64),
    effectiveAt: z.string().datetime(),
    expiresAt: z.string().datetime().nullable(),
    publishedAt: z.string().datetime(),
    fallbackPolicy: customerSduiFallbackPolicySchema,
  })
  .strict()
  .superRefine((manifest, context) => {
    const publishedAt = Date.parse(manifest.publishedAt);
    const effectiveAt = Date.parse(manifest.effectiveAt);
    if (publishedAt > effectiveAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["publishedAt"],
        message: "publishedAt must not be later than effectiveAt",
      });
    }
    if (manifest.expiresAt !== null && Date.parse(manifest.expiresAt) <= effectiveAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expiresAt"],
        message: "expiresAt must be later than effectiveAt",
      });
    }

    const componentIds = new Set<string>();
    const componentOrders = new Set<string>();
    const componentTypeCounts = new Map<string, number>();
    const dataIds = new Set<string>();
    const actionIds = new Set<string>();

    for (const [index, source] of manifest.dataSources.entries()) {
      if (dataIds.has(source.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dataSources", index, "id"],
          message: "data source ids must be unique",
        });
      }
      dataIds.add(source.id);
    }

    for (const [index, action] of manifest.actions.entries()) {
      if (actionIds.has(action.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["actions", index, "id"],
          message: "action ids must be unique",
        });
      }
      actionIds.add(action.id);
    }

    for (const [index, component] of manifest.components.entries()) {
      if (componentIds.has(component.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["components", index, "id"],
          message: "component ids must be unique",
        });
      }
      componentIds.add(component.id);

      const orderKey = `${component.region}:${component.order}`;
      if (componentOrders.has(orderKey)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["components", index, "order"],
          message: "component order must be unique within a region",
        });
      }
      componentOrders.add(orderKey);
      componentTypeCounts.set(component.type, (componentTypeCounts.get(component.type) ?? 0) + 1);

      const dataSlots = new Set<string>();
      for (const [bindingIndex, binding] of component.dataBindings.entries()) {
        if (dataSlots.has(binding.slot)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["components", index, "dataBindings", bindingIndex, "slot"],
            message: "data binding slots must be unique per component",
          });
        }
        dataSlots.add(binding.slot);
        if (!dataIds.has(binding.dataRef)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["components", index, "dataBindings", bindingIndex, "dataRef"],
            message: "dataRef must reference a data source in this manifest",
          });
        }
      }

      const actionSlots = new Set<string>();
      for (const [bindingIndex, binding] of component.actionBindings.entries()) {
        if (actionSlots.has(binding.slot)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["components", index, "actionBindings", bindingIndex, "slot"],
            message: "action binding slots must be unique per component",
          });
        }
        actionSlots.add(binding.slot);
        if (!actionIds.has(binding.actionRef)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["components", index, "actionBindings", bindingIndex, "actionRef"],
            message: "actionRef must reference an action in this manifest",
          });
        }
      }
    }

    for (const protectedType of ["location_header", "search_bar", "bottom_navigation"] as const) {
      if (componentTypeCounts.get(protectedType) !== 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["components"],
          message: `home manifest requires exactly one ${protectedType}`,
        });
      }
      const protectedComponent = manifest.components.find((component) => component.type === protectedType);
      if (protectedComponent !== undefined && !protectedComponent.enabled) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["components", manifest.components.indexOf(protectedComponent), "enabled"],
          message: `${protectedType} is a protected home shell component and must stay enabled`,
        });
      }
    }

    if (!manifest.components.some((component) => component.region === "content" && component.enabled)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["components"],
        message: "home manifest requires at least one enabled content component",
      });
    }
  });

export const customerSduiManifestEnvelopeSchema = z
  .object({
    schemaVersion: customerSduiSchemaVersionSchema,
    requestId: z.string().uuid(),
    pageId: customerSduiPageIdSchema,
    resolvedAt: z.string().datetime(),
    scopeProof: z.string().min(1).max(256),
    resolutionReason: customerSduiResolutionReasonSchema,
    killSwitchActive: z.boolean(),
    cacheTtlSeconds: z.number().int().min(0).max(3_600),
    manifest: customerSduiPageManifestSchema.nullable(),
    fallbackPolicy: customerSduiFallbackPolicySchema,
  })
  .strict()
  .superRefine((envelope, context) => {
    if (envelope.resolutionReason === "published") {
      if (envelope.manifest === null || envelope.killSwitchActive) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["manifest"],
          message: "published resolution requires a manifest and an inactive kill switch",
        });
      }
    } else if (envelope.manifest !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["manifest"],
        message: "fallback resolutions must not carry a remote manifest",
      });
    }

    if (envelope.killSwitchActive !== (envelope.resolutionReason === "kill_switch")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["killSwitchActive"],
        message: "killSwitchActive and kill_switch resolution must agree",
      });
    }
    if (envelope.killSwitchActive && envelope.cacheTtlSeconds !== 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cacheTtlSeconds"],
        message: "kill switch responses must not be cached",
      });
    }
    if (envelope.manifest !== null) {
      if (envelope.manifest.pageId !== envelope.pageId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["manifest", "pageId"],
          message: "manifest pageId must match the requested page",
        });
      }
      if (JSON.stringify(envelope.manifest.fallbackPolicy) !== JSON.stringify(envelope.fallbackPolicy)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fallbackPolicy"],
          message: "envelope and manifest fallback policies must agree",
        });
      }
    }
  });

export type CustomerSduiScopeInput = z.infer<typeof customerSduiScopeSchema>;
export type CustomerSduiDataSourceInput = z.infer<typeof customerSduiDataSourceSchema>;
export type CustomerSduiActionDefinitionInput = z.infer<typeof customerSduiActionDefinitionSchema>;
export type CustomerSduiComponentInstanceInput = z.infer<typeof customerSduiComponentInstanceSchema>;
export type CustomerSduiPageManifestInput = z.infer<typeof customerSduiPageManifestSchema>;
export type CustomerSduiManifestEnvelopeInput = z.infer<typeof customerSduiManifestEnvelopeSchema>;
