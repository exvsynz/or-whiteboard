import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DndContext } from "@dnd-kit/core";
import { PersonCard } from "../PersonCard";
import type { BoardPerson } from "@/lib/board-constants";

const mockPerson: BoardPerson = {
  id: "test-id-1",
  name: "王小明",
  role: "麻醉護理師",
  color: "bg-amber-100",
  area: "R1",
};

function renderWithDnd(ui: React.ReactElement) {
  return render(<DndContext>{ui}</DndContext>);
}

describe("PersonCard", () => {
  it("renders person name and role", () => {
    renderWithDnd(<PersonCard person={mockPerson} />);
    expect(screen.getByText("王小明")).toBeInTheDocument();
    expect(screen.getByText("麻醉護理師")).toBeInTheDocument();
  });

  it("has draggable attributes (role='button', tabIndex)", () => {
    renderWithDnd(<PersonCard person={mockPerson} />);
    const card = screen.getByRole("button");
    expect(card).toHaveAttribute("tabindex", "0");
  });

  it("has aria-roledescription", () => {
    renderWithDnd(<PersonCard person={mockPerson} />);
    const card = screen.getByRole("button");
    expect(card).toHaveAttribute("aria-roledescription", "draggable item");
  });
});
