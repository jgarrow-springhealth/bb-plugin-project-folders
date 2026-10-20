// @vitest-environment jsdom
import { beforeAll, afterEach, expect, it } from "vitest";
import { fireEvent, waitFor, cleanup } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { installTestMatchMedia } from "./test-match-media";
import { defaultPrefs, parsePrefs } from "./preferences";

let app: Awaited<ReturnType<typeof loadPluginApp>>;
beforeAll(async () => {
  installTestMatchMedia();
  app = await loadPluginApp(() => import("./app"));
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

const roots = [
  {
    id: "p2",
    projectId: "p2",
    hostId: "h1",
    parentId: null,
    path: "/sandbox",
    name: "LP sandbox rules",
  },
];

it("shows a hidden project again without sending an empty field", async () => {
  const saved: Array<{ key: string; style: unknown }> = [];
  const prefs = structuredClone(defaultPrefs);
  prefs.view.showHidden = true;
  const items: Record<string, unknown> = {
    "p:p2": { icon: "icon:Bug", color: "red", hidden: true },
  };
  const rpc = {
    list: () => ({ folders: [], roots, bindings: {}, errors: [] }),
    prefs_get: () => ({ prefs, items, stored: true }),
    prefs_save: () => ({ ok: true }),
    item_style_save: (input: { key: string; style: unknown }) => {
      saved.push(input);
      return { ok: true };
    },
  };
  const view = renderSlot(
    app.threadLists[0]!,
    { activeThreadId: null, onNavigate() {} },
    { sidebarThreads: { threads: [], projects: [] }, rpc },
  );
  fireEvent.contextMenu(await view.findByText("LP sandbox rules"));
  fireEvent.click(
    await view.findByRole("menuitem", { name: /Show in the tree/ }),
  );
  await waitFor(() => expect(saved.length).toBe(1));
  expect(saved[0]).toStrictEqual({
    key: "p:p2",
    style: { icon: "icon:Bug", color: "red" },
  });
  expect("hidden" in (saved[0]!.style as object)).toBe(false);
  view.lifecycle.unmount();
});
