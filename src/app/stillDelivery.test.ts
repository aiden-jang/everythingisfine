import { afterEach, expect, it, vi } from "vitest";
import { downloadStill } from "./stillDelivery";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("keeps a mounted download link and its URL alive until the browser can use them", () => {
  vi.useFakeTimers();
  const revoke = vi.fn();
  let mounted = false;
  const anchor = {
    href: "",
    download: "",
    click: vi.fn(() => {
      expect(mounted).toBe(true);
      expect(revoke).not.toHaveBeenCalled();
    }),
    remove: vi.fn(() => {
      mounted = false;
    }),
  };
  vi.stubGlobal("document", {
    createElement: () => anchor,
    body: {
      append: () => {
        mounted = true;
      },
    },
  });
  vi.stubGlobal("URL", { createObjectURL: () => "blob:still", revokeObjectURL: revoke });
  downloadStill(new File(["image"], "globe.png", { type: "image/png" }));
  expect(anchor.download).toBe("globe.png");
  expect(anchor.href).toBe("blob:still");
  expect(anchor.click).toHaveBeenCalledOnce();
  expect(anchor.remove).toHaveBeenCalledOnce();
  expect(revoke).not.toHaveBeenCalled();
  vi.runAllTimers();
  expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:still");
});

it("cleans up after a refused download click", () => {
  vi.useFakeTimers();
  const remove = vi.fn();
  const revoke = vi.fn();
  vi.stubGlobal("document", {
    createElement: () => ({
      click: () => {
        throw new Error("Refused");
      },
      remove,
    }),
    body: { append: vi.fn() },
  });
  vi.stubGlobal("URL", { createObjectURL: () => "blob:still", revokeObjectURL: revoke });
  expect(() => downloadStill(new File(["image"], "globe.png"))).toThrow("Refused");
  expect(remove).toHaveBeenCalledOnce();
  vi.runAllTimers();
  expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:still");
});
