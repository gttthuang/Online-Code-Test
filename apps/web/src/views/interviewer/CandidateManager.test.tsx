import type { AuthUser } from "@oct/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as api from "../../lib/api";
import { CandidateManager } from "./CandidateManager";

vi.mock("../../lib/api");
const mocked = vi.mocked(api);

function makeCandidate(overrides: Partial<AuthUser> = {}): AuthUser {
  return { id: "cand_1", name: "Dave", email: "dave@example.com", role: "candidate", ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getCandidates.mockResolvedValue([makeCandidate()]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CandidateManager", () => {
  it("loads candidates on mount and reports them upward", async () => {
    const onUpdated = vi.fn();
    render(<CandidateManager token="t" onCandidatesUpdated={onUpdated} />);

    expect(await screen.findByText("Dave")).toBeInTheDocument();
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith([makeCandidate()]));
  });

  it("creates a candidate and refetches", async () => {
    mocked.createCandidate.mockResolvedValue({ user: makeCandidate({ id: "cand_2", name: "Eve" }) } as never);
    render(<CandidateManager token="t" onCandidatesUpdated={vi.fn()} />);
    await screen.findByText("Dave");

    fireEvent.change(screen.getByPlaceholderText(/David Candidate/), { target: { value: "Eve" } });
    fireEvent.change(screen.getByPlaceholderText(/david@example.com/), { target: { value: "eve@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Candidate" }));

    await waitFor(() =>
      expect(mocked.createCandidate).toHaveBeenCalledWith("t", { name: "Eve", email: "eve@example.com" })
    );
    expect(await screen.findByText(/created successfully/)).toBeInTheDocument();
  });

  it("surfaces a create error", async () => {
    mocked.createCandidate.mockRejectedValue(new Error("create boom"));
    render(<CandidateManager token="t" onCandidatesUpdated={vi.fn()} />);
    await screen.findByText("Dave");

    fireEvent.change(screen.getByPlaceholderText(/David Candidate/), { target: { value: "Eve" } });
    fireEvent.change(screen.getByPlaceholderText(/david@example.com/), { target: { value: "eve@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Candidate" }));

    expect(await screen.findByText("create boom")).toBeInTheDocument();
  });

  it("filters the candidate list by the search query", async () => {
    mocked.getCandidates.mockResolvedValue([
      makeCandidate({ id: "cand_1", name: "Dave", email: "dave@example.com" }),
      makeCandidate({ id: "cand_2", name: "Zoe", email: "zoe@example.com" })
    ]);
    render(<CandidateManager token="t" onCandidatesUpdated={vi.fn()} />);
    await screen.findByText("Dave");

    fireEvent.change(screen.getByPlaceholderText("Search candidates..."), { target: { value: "zoe" } });
    expect(screen.getByText("Zoe")).toBeInTheDocument();
    expect(screen.queryByText("Dave")).not.toBeInTheDocument();
  });

  it("deletes a candidate only after confirmation", async () => {
    mocked.deleteCandidate.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<CandidateManager token="t" onCandidatesUpdated={vi.fn()} />);
    await screen.findByText("Dave");

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(mocked.deleteCandidate).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mocked.deleteCandidate).toHaveBeenCalledWith("t", "cand_1"));
  });

  it("shows an error when candidates fail to load", async () => {
    mocked.getCandidates.mockRejectedValue(new Error("load boom"));
    render(<CandidateManager token="t" onCandidatesUpdated={vi.fn()} />);
    expect(await screen.findByText("load boom")).toBeInTheDocument();
  });
});
