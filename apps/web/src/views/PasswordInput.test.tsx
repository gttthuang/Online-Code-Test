import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PasswordInput } from "./PasswordInput";

describe("PasswordInput", () => {
  it("toggles between hidden and visible text", () => {
    render(<PasswordInput onChange={vi.fn()} placeholder="pw" value="secret" />);
    const input = screen.getByPlaceholderText("pw");

    expect(input).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("reports edits through onChange", () => {
    const onChange = vi.fn();
    render(<PasswordInput onChange={onChange} placeholder="pw" value="" />);

    fireEvent.change(screen.getByPlaceholderText("pw"), { target: { value: "hunter2" } });
    expect(onChange).toHaveBeenCalledWith("hunter2");
  });
});
