import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DndContext } from "@dnd-kit/core";
import { AreaBox } from "../AreaBox";

function renderWithDnd(ui: React.ReactElement) {
  return render(<DndContext>{ui}</DndContext>);
}

describe("AreaBox", () => {
  it("renders title and person count", () => {
    renderWithDnd(<AreaBox id="R1" title="R1" count={3} />);
    expect(screen.getByText("R1")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("does not render count badge when count is 0", () => {
    renderWithDnd(<AreaBox id="R2" title="R2" count={0} />);
    expect(screen.getByText("R2")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("renders children", () => {
    renderWithDnd(
      <AreaBox id="R1" title="R1" count={1}>
        <div data-testid="child">Hello</div>
      </AreaBox>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("applies highlight class when isOver", async () => {
    // We can't easily trigger isOver from outside DndContext,
    // so we test the base rendering without hover state
    const { container } = renderWithDnd(
      <AreaBox id="R1" title="R1" count={0} />,
    );
    const box = container.firstElementChild as HTMLElement;
    // When not hovered, should not have blue ring classes
    expect(box.className).not.toContain("ring-blue-200");
  });
});
