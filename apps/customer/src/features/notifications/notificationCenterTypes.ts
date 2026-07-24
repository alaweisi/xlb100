import type {
  NotificationInboxItem,
  NotificationInboxView,
} from "@xlb/types";

export interface NotificationCenterRouteInput {
  readonly view: NotificationInboxView;
  readonly cursor: string | null;
}

export type NotificationOperationKind =
  | "marking-read"
  | "archiving"
  | "restoring";

export interface NotificationOperation {
  readonly notificationId: string;
  readonly kind: NotificationOperationKind;
}

export interface NotificationCenterNotice {
  readonly kind: "success" | "error" | "conflict" | "safe";
  readonly message: string;
}

export interface NotificationCenterViewModel {
  readonly view: NotificationInboxView;
  readonly items: readonly NotificationInboxItem[];
  readonly nextCursor: string | null;
  readonly unreadCount: number | null;
  readonly unreadCountUnavailable: boolean;
  readonly refreshing: boolean;
  readonly loadingMore: boolean;
  readonly operation: NotificationOperation | null;
  readonly notice: NotificationCenterNotice | null;
}

export interface NotificationCenterActions {
  readonly onBack: () => void;
  readonly onSelectView: (view: NotificationInboxView) => void;
  readonly onRefresh: () => void;
  readonly onLoadMore: () => void;
  readonly onMarkRead: (item: NotificationInboxItem) => void;
  readonly onSetArchived: (
    item: NotificationInboxItem,
    archived: boolean,
  ) => void;
  readonly onOpenReference: (item: NotificationInboxItem) => void;
  readonly onDismissNotice: () => void;
}

export interface CustomerNotificationTemplateReadyData {
  readonly viewModel: NotificationCenterViewModel;
  readonly actions: NotificationCenterActions;
}

export function mergeNotificationItems(
  current: readonly NotificationInboxItem[],
  incoming: readonly NotificationInboxItem[],
): readonly NotificationInboxItem[] {
  const merged = [...current];
  const indexes = new Map(
    merged.map((item, index) => [item.notificationId, index] as const),
  );

  for (const item of incoming) {
    const index = indexes.get(item.notificationId);
    if (index === undefined) {
      indexes.set(item.notificationId, merged.length);
      merged.push(item);
      continue;
    }
    if (item.rowVersion >= merged[index]!.rowVersion) {
      merged[index] = item;
    }
  }

  return Object.freeze(merged);
}
