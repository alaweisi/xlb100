// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "@xlb/ui";

describe("AppErrorBoundary contract", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders a recoverable fallback and reports render errors", () => {
    const onError = vi.fn();
    const onReset = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let shouldThrow = true;

    function Child() {
      if (shouldThrow) {
        throw new Error("phase23c-render-failure");
      }
      return <p>Recovered application</p>;
    }

    render(
      <AppErrorBoundary
        onError={onError}
        onReset={onReset}
        fallback={({ error, reset }) => (
          <div role="alert">
            <span>{error.message}</span>
            <button onClick={() => { shouldThrow = false; reset(); }}>Retry application</button>
          </div>
        )}
      >
        <Child />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole("alert").textContent).toContain("phase23c-render-failure");
    expect(onError).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Retry application" }));
    expect(screen.queryByText("Recovered application")).not.toBeNull();
    expect(onReset).toHaveBeenCalledOnce();
  });
});
