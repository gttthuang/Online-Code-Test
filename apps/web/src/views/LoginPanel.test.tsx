import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LoginPanel } from "./LoginPanel";

describe("LoginPanel", () => {
  it("disables the submit button until an email is entered", () => {
    render(<LoginPanel error={null} isLoading={false} onLogin={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Sign In" });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("name@example.com"), { target: { value: "a@b.com" } });
    expect(button).toBeEnabled();
  });

  it("submits the trimmed email", () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<LoginPanel error={null} isLoading={false} onLogin={onLogin} />);

    fireEvent.change(screen.getByPlaceholderText("name@example.com"), { target: { value: "  a@b.com  " } });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    expect(onLogin).toHaveBeenCalledWith("a@b.com");
  });

  it("shows the loading label and an error message", () => {
    const { rerender } = render(<LoginPanel error={null} isLoading onLogin={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Signing In..." })).toBeDisabled();

    rerender(<LoginPanel error="nope" isLoading={false} onLogin={vi.fn()} />);
    expect(screen.getByText("nope")).toBeInTheDocument();
  });
});
