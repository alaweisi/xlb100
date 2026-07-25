// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { ConfirmButton } from "@xlb/ui";
import React from "react";
import { describe, expect, it, vi } from "vitest";

describe("Admin mobile high-risk action confirmation", () => {
  it("requires a deliberate second activation before invoking the mutation", () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton onConfirm={onConfirm}>Mark Paid</ConfirmButton>);

    fireEvent.click(screen.getByRole("button", { name: "Mark Paid" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Confirm Mark Paid" }).getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Confirm Mark Paid" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("disarms when focus leaves the action", () => {
    const onConfirm = vi.fn();
    render(<ConfirmButton onConfirm={onConfirm}>Apply reverse</ConfirmButton>);

    const action = screen.getByRole("button", { name: "Apply reverse" });
    fireEvent.click(action);
    fireEvent.blur(action);

    expect(
      screen.getByRole("button", { name: "Apply reverse" }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
