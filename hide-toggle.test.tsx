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
    id: "p1",
    projectId: "p1",
    hostId: "h1",
    parentId: null,
    path: "/work",
    name: "Working project",
  },
  {
    id: "p2",
    projectId: "p2",
    hostId: "h1",
    parentId: null,
    path: "/sandbox",
    name: "LP sandbox rules",
  },
];
const folders = [
  {
    id: "f1",
    projectId: "p1",
    hostId: "h1",
    parentId: null,
    path: "/work/Ads",
    name: "Ads",
  },
];

it("offers a Show hidden toggle in the sidebar that counts what is hidden", async () => {
  const saved: Array<{ prefs: typeof defaultPrefs }> = [];
  let prefs = structuredClone(defaultPrefs);
  const items = { "p:p2": { hidden: true }, "f:f1": { hidden: true } };
  const rpc = {
    list: () => ({ folders, roots, bindings: {}, errors: [] }),
    prefs_get: () => ({ prefs, items, stored: true }),
    prefs_save: (input: { prefs: typeof prefs }) => {
      saved.push(input);
      prefs = input.prefs;
      return { ok: true };
    },
  };
  const view = renderSlot(
    app.threadLists[0]!,
    { activeThreadId: null, onNavigate() {} },
    { sidebarThreads: { threads: [], projects: [] }, rpc },
  );
  await view.findByText("Working project");
  expect(view.queryByText("LP sandbox rules")).toBeNull();
  fireEvent.click(
    await view.findByRole("button", { name: /Show hidden \(2\)/ }),
  );
  await waitFor(() => expect(saved.at(-1)?.prefs.view.showHidden).toBe(true));
  expect(await view.findByText("LP sandbox rules")).toBeTruthy();
  fireEvent.click(await view.findByRole("button", { name: /Hide hidden/ }));
  await waitFor(() => expect(saved.at(-1)?.prefs.view.showHidden).toBe(false));
  view.lifecycle.unmount();
});
