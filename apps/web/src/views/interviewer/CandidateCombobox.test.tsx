import type { AuthUser } from "@oct/contracts";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CandidateCombobox, getCandidateLabel } from "./CandidateCombobox";

const candidates: AuthUser[] = [
  {
    id: "candidate_1",
    name: "Alice",
    email: "alice@example.com",
    role: "candidate"
  },
  {
    id: "candidate_2",
    name: "Bob",
    email: "bob@example.com",
    role: "candidate"
  }
];

function renderCombobox(value = "", onChange = vi.fn()) {
  return {
    onChange,
    ...render(
      <CandidateCombobox
        candidates={candidates}
        id="candidate-options"
        onChange={onChange}
        placeholder="Choose candidate"
        value={value}
      />
    )
  };
}

describe("CandidateCombobox", () => {
  it("formats labels and selects an option with the pointer", () => {
    const { onChange } = renderCombobox();
    const input = screen.getByRole("combobox");

    fireEvent.focus(input);
    expect(screen.getAllByRole("option")).toHaveLength(2);
    fireEvent.mouseEnter(screen.getByRole("option", { name: /Bob/ }));
    expect(input).toHaveAttribute(
      "aria-activedescendant",
      "candidate-options-option-1"
    );
    fireEvent.click(screen.getByRole("option", { name: /Bob/ }));

    expect(onChange).toHaveBeenCalledWith(getCandidateLabel(candidates[1]));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("filters candidates, shows an empty state, and clears the value", () => {
    const onChange = vi.fn();
    const { rerender } = renderCombobox("", onChange);
    const input = screen.getByRole("combobox");

    fireEvent.change(input, { target: { value: "nobody" } });
    expect(onChange).toHaveBeenCalledWith("nobody");

    rerender(
      <CandidateCombobox
        candidates={candidates}
        id="candidate-options"
        onChange={onChange}
        value="nobody"
      />
    );
    expect(screen.getByText("No matching candidates")).toBeInTheDocument();

    rerender(
      <CandidateCombobox
        candidates={candidates}
        id="candidate-options"
        onChange={onChange}
        value={getCandidateLabel(candidates[0])}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onChange).toHaveBeenLastCalledWith("");
    expect(input).toHaveFocus();
  });

  it("supports arrow, enter, and escape keyboard navigation", () => {
    const { onChange } = renderCombobox();
    const input = screen.getByRole("combobox");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute(
      "aria-activedescendant",
      "candidate-options-option-0"
    );
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute(
      "aria-activedescendant",
      "candidate-options-option-1"
    );
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(getCandidateLabel(candidates[0]));

    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("selects the sole filtered match with enter and closes on outside blur", () => {
    const onChange = vi.fn();
    const { rerender } = renderCombobox("ali", onChange);
    const input = screen.getByRole("combobox");

    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(getCandidateLabel(candidates[0]));

    rerender(
      <CandidateCombobox
        candidates={candidates}
        id="candidate-options"
        onChange={onChange}
        value=""
      />
    );
    fireEvent.focus(input);
    fireEvent.blur(input, { relatedTarget: document.body });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("keeps the active option in range and visible as results filter", () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const onChange = vi.fn();
    const { rerender } = renderCombobox("", onChange);
    const input = screen.getByRole("combobox");

    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });

    rerender(
      <CandidateCombobox
        candidates={candidates}
        id="candidate-options"
        onChange={onChange}
        value="ali"
      />
    );

    expect(input).toHaveAttribute(
      "aria-activedescendant",
      "candidate-options-option-0"
    );
    expect(scrollIntoView).toHaveBeenCalled();

    const option = screen.getByRole("option", { name: /Alice/ });
    fireEvent.blur(input, { relatedTarget: option });
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("does not reselect the current value or submit an ambiguous match", () => {
    const onChange = vi.fn();
    const selectedLabel = getCandidateLabel(candidates[0]);
    const { rerender } = render(
      <CandidateCombobox
        candidates={candidates}
        onChange={onChange}
        value={selectedLabel}
      />
    );
    const input = screen.getByRole("combobox");

    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getAllByRole("option")[0]).not.toHaveAttribute("id");

    rerender(
      <CandidateCombobox
        candidates={candidates}
        onChange={onChange}
        value=""
      />
    );
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.keyDown(input, { key: "Tab" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });
});
