import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom has no window.matchMedia. Components that gate behaviour by viewport
// (e.g. Board's responsive drag-sensor switch) read it, so stub it. Default to
// matches:true (desktop width) so unit tests keep the prior always-on sensors.
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as MediaQueryList;
}
