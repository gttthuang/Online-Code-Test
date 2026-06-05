import { useRef, useState } from "react";
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
  const inputRef = useRef<HTMLInputElement>(null);

  // When a candidate is already selected (input holds the full label) or the
  // field is empty, show everyone so the list can still be browsed. Only filter
  // once the user starts typing a different search term.
  const hasExactSelection = candidates.some((candidate) => getCandidateLabel(candidate) === value);
  const query = value.trim().toLowerCase();
  const visibleCandidates =
    query === "" || hasExactSelection
      ? candidates
      : candidates.filter((candidate) => getCandidateLabel(candidate).toLowerCase().includes(query));

  function handleBlur(event: React.FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setOpen(false);
    }
  }

  return (
    <div className="combobox" onBlur={handleBlur}>
      <div className="combobox-control">
        <input
          aria-controls={id}
          aria-expanded={open}
          autoComplete="off"
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onClick={() => setOpen(true)}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              return;
            }

            // When the search has narrowed to a single candidate, let Enter pick
            // it directly instead of submitting the surrounding form.
            if (event.key === "Enter" && open && visibleCandidates.length === 1) {
              const onlyLabel = getCandidateLabel(visibleCandidates[0]);

              if (onlyLabel !== value) {
                event.preventDefault();
                onChange(onlyLabel);
                setOpen(false);
              }
            }
          }}
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
              inputRef.current?.focus();
            }}
            type="button"
          >
            ✕
          </button>
        ) : null}
      </div>

      {open ? (
        <ul className="combobox-list" id={id} role="listbox">
          {visibleCandidates.length === 0 ? (
            <li className="combobox-empty">No matching candidates</li>
          ) : (
            visibleCandidates.map((candidate) => {
              const label = getCandidateLabel(candidate);

              return (
                <li key={candidate.id}>
                  <button
                    className={label === value ? "combobox-option combobox-option-active" : "combobox-option"}
                    onClick={() => {
                      onChange(label);
                      setOpen(false);
                    }}
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
