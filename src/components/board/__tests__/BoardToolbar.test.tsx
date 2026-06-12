import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BoardToolbar } from "../BoardToolbar";

const baseProps = {
  searchQuery: "",
  onSearchChange: vi.fn(),
  onAddPerson: vi.fn(),
  onReset: vi.fn(),
};

describe("BoardToolbar export menu", () => {
  it("toggles open via the 匯出班表 button", () => {
    render(<BoardToolbar {...baseProps} onExportCSV={vi.fn()} />);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /匯出班表/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    render(<BoardToolbar {...baseProps} onExportCSV={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /匯出班表/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes on mousedown outside", () => {
    render(<BoardToolbar {...baseProps} onExportCSV={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /匯出班表/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("stays open on mousedown inside the menu", () => {
    render(<BoardToolbar {...baseProps} onExportCSV={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /匯出班表/ }));
    fireEvent.mouseDown(screen.getByRole("menuitem", { name: /CSV/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("closes after choosing an export option", () => {
    const onExportCSV = vi.fn();
    render(<BoardToolbar {...baseProps} onExportCSV={onExportCSV} />);
    fireEvent.click(screen.getByRole("button", { name: /匯出班表/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /CSV/ }));
    expect(onExportCSV).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("BoardToolbar save button", () => {
  it("renders no save button when onSave is not provided", () => {
    render(<BoardToolbar {...baseProps} />);
    expect(
      screen.queryByRole("button", { name: /儲存/ }),
    ).not.toBeInTheDocument();
  });

  it("calls onSave when clicked", () => {
    const onSave = vi.fn();
    render(<BoardToolbar {...baseProps} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("shows 儲存中… and disables the button while saving", () => {
    render(<BoardToolbar {...baseProps} onSave={vi.fn()} saveState="saving" />);
    const button = screen.getByRole("button", { name: /儲存中/ });
    expect(button).toBeDisabled();
  });

  it("shows 已儲存 feedback when saved", () => {
    render(<BoardToolbar {...baseProps} onSave={vi.fn()} saveState="saved" />);
    expect(screen.getByRole("button", { name: /已儲存/ })).toBeInTheDocument();
  });
});
