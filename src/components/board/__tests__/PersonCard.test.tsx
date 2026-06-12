import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll } from "vitest";
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

beforeAll(() => {
  // jsdom does not implement scrollIntoView, which dnd-kit's KeyboardSensor
  // calls when a keyboard drag starts
  Element.prototype.scrollIntoView = vi.fn();
});

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

  // Documented keyboard behavior: with dnd-kit's KeyboardSensor active (the
  // DndContext default, and what Board registers), Enter/Space is the drag
  // pick-up key — the sensor activator spread via {...listeners} runs first
  // and claims the event with preventDefault, so onClick (open history) must
  // NOT fire. Opening the history drawer remains a mouse/touch affordance.
  describe("keyboard listener composition", () => {
    it("Enter starts a keyboard drag (sensor claims event), not onClick", () => {
      const onClick = vi.fn();
      renderWithDnd(<PersonCard person={mockPerson} onClick={onClick} />);
      const card = screen.getByRole("button");
      card.focus();
      const notPrevented = fireEvent.keyDown(card, {
        key: "Enter",
        code: "Enter",
      });
      // dnd-kit's KeyboardSensor activator called preventDefault
      expect(notPrevented).toBe(false);
      expect(onClick).not.toHaveBeenCalled();
    });

    it("Enter falls back to onClick when no keyboard sensor claims the event", () => {
      const onClick = vi.fn();
      render(
        <DndContext sensors={[]}>
          <PersonCard person={mockPerson} onClick={onClick} />
        </DndContext>,
      );
      fireEvent.keyDown(screen.getByRole("button"), {
        key: "Enter",
        code: "Enter",
      });
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("mouse click still opens history via onClick", () => {
      const onClick = vi.fn();
      renderWithDnd(<PersonCard person={mockPerson} onClick={onClick} />);
      fireEvent.click(screen.getByRole("button"));
      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("drag styling", () => {
    it("allows touch scrolling when idle and never applies a translate", () => {
      renderWithDnd(<PersonCard person={mockPerson} />);
      const card = screen.getByRole("button");
      expect(card.style.touchAction).toBe("pan-y");
      expect(card.style.transform).toBe("");
    });

    it("keeps the original card un-translated while dragging (DragOverlay shows the moving copy)", () => {
      renderWithDnd(<PersonCard person={mockPerson} />);
      const card = screen.getByRole("button");
      fireEvent.keyDown(card, { key: "Enter", code: "Enter" });
      // dragging: dimmed in place, touch locked, but NO translate — the
      // DragOverlay copy rendered by Board is the only element that moves
      expect(card.className).toContain("opacity-30");
      expect(card.style.touchAction).toBe("none");
      expect(card.style.transform).toBe("");
    });
  });
});
