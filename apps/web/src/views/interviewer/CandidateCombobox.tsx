import { useEffect, useRef, useState } from "react";
import type { AuthUser } from "@oct/contracts";

export function getCandidateLabel(candidate: AuthUser) {
  return `${candidate.name} (${candidate.email})`;
}

interface CandidateComboboxProps {
  readonly candidates: AuthUser[];
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  readonly id?: string;
}

export function CandidateCombobox({ candidates, value, onChange, placeholder, id }: CandidateComboboxProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // When a candidate is already selected (input holds the full label) or the
  // field is empty, show everyone so the list can still be browsed. Only filter
  // once the user starts typing a different search term.
  const hasExactSelection = candidates.some((candidate) => getCandidateLabel(candidate) === value);
  const query = value.trim().toLowerCase();
  const visibleCandidates =
    query === "" || hasExactSelection
      ? candidates
      : candidates.filter((candidate) => getCandidateLabel(candidate).toLowerCase().includes(query));

  // Keep the highlight in range as the list filters.
  useEffect(() => {
    if (activeIndex > visibleCandidates.length - 1) {
      setActiveIndex(visibleCandidates.length - 1);
    }
  }, [visibleCandidates.length, activeIndex]);

  // Keep the highlighted option scrolled into view for long lists.
  useEffect(() => {
    if (!open || activeIndex < 0) {
      return;
    }

    const option = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    if (option && typeof option.scrollIntoView === "function") {
      option.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, open]);

  function selectCandidate(candidate: AuthUser) {
    onChange(getCandidateLabel(candidate));
    setOpen(false);
    setActiveIndex(-1);
  }

  function openList() {
    setOpen(true);
    // Start the highlight on the already-selected candidate (if any) so it is
    // pre-focused when reopening the full list.
    setActiveIndex(visibleCandidates.findIndex((candidate) => getCandidateLabel(candidate) === value));
  }

  function handleBlur(event: React.FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, visibleCandidates.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      // Prefer the arrow-highlighted option; otherwise fall back to the single
      // remaining match. Either way, don't submit the surrounding form.
      const highlighted = activeIndex >= 0 && activeIndex < visibleCandidates.length ? visibleCandidates[activeIndex] : null;
      const target = highlighted ?? (visibleCandidates.length === 1 ? visibleCandidates[0] : null);

      if (open && target && getCandidateLabel(target) !== value) {
        event.preventDefault();
        selectCandidate(target);
      }
    }
  }

  return (
    <div className="combobox" onBlur={handleBlur}>
      <div className="combobox-control">
        <input
          aria-activedescendant={activeIndex >= 0 && id ? `${id}-option-${activeIndex}` : undefined}
          aria-controls={id}
          aria-expanded={open}
          autoComplete="off"
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onClick={openList}
          onFocus={openList}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          ref={inputRef}
          role="combobox"
          type="text"
          value={value}
        />
        {value ? (
          <button
            aria-label="Clear selection"
            className="combobox-clear"
            onClick={() => {
              onChange("");
              setOpen(true);
              setActiveIndex(-1);
              inputRef.current?.focus();
            }}
            type="button"
          >
            ✕
          </button>
        ) : null}
      </div>

      {open ? (
        <ul className="combobox-list" id={id} ref={listRef} role="listbox">
          {visibleCandidates.length === 0 ? (
            <li className="combobox-empty">No matching candidates</li>
          ) : (
            visibleCandidates.map((candidate, index) => {
              const label = getCandidateLabel(candidate);
              const isActive = index === activeIndex;

              return (
                <li key={candidate.id}>
                  <button
                    aria-selected={label === value}
                    className={isActive ? "combobox-option combobox-option-active" : "combobox-option"}
                    id={id ? `${id}-option-${index}` : undefined}
                    onClick={() => selectCandidate(candidate)}
                    onMouseEnter={() => setActiveIndex(index)}
                    role="option"
                    type="button"
                  >
                    {label}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
