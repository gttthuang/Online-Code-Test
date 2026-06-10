import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../lib/api";
import { ChangePasswordButton } from "./ChangePasswordButton";

vi.mock("../lib/api");
const mocked = vi.mocked(api);

describe("ChangePasswordButton", () => {
  beforeEach(() => vi.clearAllMocks());

  function open() {
    render(<ChangePasswordButton token="t" />);
    fireEvent.click(screen.getByRole("button", { name: /change password/i }));
  }

  it("submits a matching new password and shows success", async () => {
    mocked.changePassword.mockResolvedValue(undefined);
    open();

    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "1234567890" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "brand-new-pass" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "brand-new-pass" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => expect(mocked.changePassword).toHaveBeenCalledWith("t", "1234567890", "brand-new-pass"));
    expect(await screen.findByText("Your password has been updated.")).toBeInTheDocument();
  });

  it("blocks submit when the new password is too short", () => {
    open();

    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "1234567890" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "short" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "short" } });

    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update password" })).toBeDisabled();
  });

  it("shows an error when the confirmation does not match", () => {
    open();

    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "1234567890" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "brand-new-pass" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "different-pass" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    expect(screen.getByText("New passwords do not match.")).toBeInTheDocument();
    expect(mocked.changePassword).not.toHaveBeenCalled();
  });
});
