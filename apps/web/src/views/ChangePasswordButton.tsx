import { useState } from "react";
import type { FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { MIN_PASSWORD_LENGTH } from "@oct/contracts";

import { changePassword } from "../lib/api";
import { PasswordInput } from "./PasswordInput";

export function ChangePasswordButton({ token }: { readonly token: string }) {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function close() {
    setOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setSaving(false);
    setDone(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await changePassword(token, currentPassword, newPassword);
      setDone(true);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to change password");
    } finally {
      setSaving(false);
    }
  }

  const tooShort = newPassword.length > 0 && newPassword.length < MIN_PASSWORD_LENGTH;
  const canSubmit =
    !saving &&
    currentPassword.length > 0 &&
    newPassword.length >= MIN_PASSWORD_LENGTH &&
    confirmPassword.length > 0;

  return (
    <>
      <button className="secondary-button icon-button-text" onClick={() => setOpen(true)} type="button">
        <KeyRound aria-hidden="true" size={16} />
        <span>Change Password</span>
      </button>

      {open ? (
        <div className="modal-backdrop">
          <button aria-label="Close change password" className="modal-overlay-button" onClick={close} type="button" />
          <div className="modal change-password-modal">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Account</p>
                <h2>Change password</h2>
              </div>
              <button className="chip-button" onClick={close} type="button">
                Close
              </button>
            </div>

            {done ? (
              <div className="stack-form">
                <output className="toast toast-success">Your password has been updated.</output>
                <button className="primary-button" onClick={close} type="button">
                  Done
                </button>
              </div>
            ) : (
              <form className="stack-form" onSubmit={handleSubmit}>
                <label className="field">
                  <span>Current password</span>
                  <PasswordInput
                    autoComplete="current-password"
                    onChange={setCurrentPassword}
                    value={currentPassword}
                  />
                </label>

                <label className="field">
                  <span>New password</span>
                  <PasswordInput
                    autoComplete="new-password"
                    onChange={setNewPassword}
                    value={newPassword}
                  />
                </label>

                <label className="field">
                  <span>Confirm new password</span>
                  <PasswordInput
                    autoComplete="new-password"
                    onChange={setConfirmPassword}
                    value={confirmPassword}
                  />
                </label>

                {tooShort ? <small className="field-hint">Use at least {MIN_PASSWORD_LENGTH} characters.</small> : null}
                {error ? <p className="error-text">{error}</p> : null}

                <button className="primary-button" disabled={!canSubmit} type="submit">
                  {saving ? "Saving..." : "Update password"}
                </button>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
