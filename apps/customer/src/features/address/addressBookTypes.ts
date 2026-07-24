import type { CustomerAddress, CityCode } from "@xlb/types";

export type CustomerAddressBookView = "list" | "new" | "edit";

export interface CustomerAddressBookRouteInput {
  readonly view: CustomerAddressBookView;
  readonly addressId: string | null;
  readonly pickerMode: boolean;
}

export interface CustomerAddressFormDraft {
  readonly contactName: string;
  readonly contactPhone: string;
  readonly province: string;
  readonly city: string;
  readonly district: string;
  readonly detailAddress: string;
  readonly isDefault: boolean;
}

export type CustomerAddressFormField = Exclude<keyof CustomerAddressFormDraft, "isDefault">;

export type CustomerAddressFormErrors = Readonly<
  Partial<Record<CustomerAddressFormField | "form", string>>
>;

export interface CustomerAddressBookNotice {
  readonly kind: "success" | "error" | "conflict";
  readonly message: string;
}

export interface CustomerAddressBookViewModel {
  readonly view: CustomerAddressBookView;
  readonly addresses: readonly CustomerAddress[];
  readonly editingAddress: CustomerAddress | null;
  readonly cityCode: CityCode;
  readonly pickerMode: boolean;
  readonly draft: CustomerAddressFormDraft;
  readonly errors: CustomerAddressFormErrors;
  readonly submitting: boolean;
  readonly deletingAddressId: string | null;
  readonly notice: CustomerAddressBookNotice | null;
}

export interface CustomerAddressBookActions {
  readonly onBack: () => void;
  readonly onOpenList: () => void;
  readonly onOpenNew: () => void;
  readonly onOpenEdit: (addressId: string) => void;
  readonly onSelect: (addressId: string) => void;
  readonly onDraftChange: (
    field: keyof CustomerAddressFormDraft,
    value: string | boolean,
  ) => void;
  readonly onSubmit: () => void;
  readonly onRequestDelete: (addressId: string) => void;
  readonly onCancelDelete: () => void;
  readonly onConfirmDelete: () => void;
  readonly onDismissNotice: () => void;
}

export interface CustomerAddressBookTemplateReadyData {
  readonly viewModel: CustomerAddressBookViewModel;
  readonly actions: CustomerAddressBookActions;
}

export const EMPTY_ADDRESS_DRAFT: CustomerAddressFormDraft = Object.freeze({
  contactName: "",
  contactPhone: "",
  province: "",
  city: "",
  district: "",
  detailAddress: "",
  isDefault: false,
});

export function addressDraftFrom(
  address: CustomerAddress,
): CustomerAddressFormDraft {
  return Object.freeze({
    contactName: address.contactName,
    // The API deliberately returns only a masked number. Never reconstruct it.
    contactPhone: "",
    province: address.province,
    city: address.city,
    district: address.district,
    detailAddress: address.detailAddress,
    isDefault: address.isDefault,
  });
}
