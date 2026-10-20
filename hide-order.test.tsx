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

it("keeps hidden projects and sections below the visible ones when shown", async () => {
  const three = [
    {
      id: "pa",
      projectId: "pa",
      hostId: "h1",
      parentId: null,
      path: "/a",
      name: "Alpha hidden",
      sort: 0,
    },
    {
      id: "pb",
      projectId: "pb",
      hostId: "h1",
      parentId: null,
      path: "/b",
      name: "Bravo visible",
      sort: 1,
    },
    {
      id: "pc",
      projectId: "pc",
      hostId: "h1",
      parentId: null,
      path: "/c",
      name: "Charlie visible",
      sort: 2,
    },
  ];
  const secs = [
    {
      id: "s1",
      projectId: "pb",
      hostId: "h1",
      parentId: null,
      path: "/b/one",
      name: "Section hidden",
      sort: 0,
    },
    {
      id: "s2",
      projectId: "pb",
      hostId: "h1",
      parentId: null,
      path: "/b/two",
      name: "Section visible",
      sort: 1,
    },
  ];
  const prefs = structuredClone(defaultPrefs);
  prefs.view.showHidden = true;
  const items = { "p:pa": { hidden: true }, "f:s1": { hidden: true } };
  const rpc = {
    list: () => ({ folders: secs, roots: three, bindings: {}, errors: [] }),
    prefs_get: () => ({ prefs, items, stored: true }),
    prefs_save: () => ({ ok: true }),
  };
  const view = renderSlot(
    app.threadLists[0]!,
    { activeThreadId: null, onNavigate() {} },
    { sidebarThreads: { threads: [], projects: [] }, rpc },
  );
  await view.findByText("Alpha hidden");
  const order = () =>
    Array.from(view.container.querySelectorAll(".pf-label > span"))
      .map((el) => el.textContent)
      .filter((t) => /Alpha|Bravo|Charlie|Section/.test(t ?? ""));
  expect(order()).toEqual([
    "Bravo visible",
    "Section visible",
    "Section hidden",
    "Charlie visible",
    "Alpha hidden",
  ]);
  view.lifecycle.unmount();
});
