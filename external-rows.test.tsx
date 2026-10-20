// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { installTestMatchMedia } from "./test-match-media";
import { defaultPrefs } from "./preferences";

let app: Awaited<ReturnType<typeof loadPluginApp>>;
beforeAll(async () => {
  installTestMatchMedia();
  app = await loadPluginApp(() => import("./app"));
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

it("renders contributed Pair Review links as rows inside their existing project", async () => {
  const root = {
    id: "proj_pair",
    projectId: "proj_pair",
    hostId: "host_1",
    parentId: null,
    path: "/work/pair-review",
    name: "Pair Review",
  };
  const view = renderSlot(
    app.threadLists[0]!,
    { activeThreadId: null, onNavigate() {} },
    {
      sidebarThreads: { threads: [], projects: [] },
      rpc: {
        list: () => ({
          folders: [],
          roots: [root],
          bindings: {},
          places: {},
          errors: [],
          machines: [],
          externalRows: [
            {
              id: "run/0",
              projectId: "proj_pair",
              title: "Review in progress",
              href: "/plugins/pair-review/reviews/run/0",
              status: "running",
              statusLabel: "In progress",
              updatedAt: 2,
            },
            {
              id: "done/0",
              projectId: "proj_pair",
              title: "Completed PR",
              href: "/plugins/pair-review/reviews/done/0",
              status: "done",
              statusLabel: "7 findings",
              count: 7,
              updatedAt: 1,
            },
          ],
        }),
        prefs_get: () => ({ prefs: defaultPrefs, items: {}, stored: true }),
      },
    },
  );

  expect(await view.findByText("Pair Review")).toBeTruthy();
  const running = view.getByRole("link", { name: /Review in progress/ });
  expect(running.getAttribute("href")).toBe(
    "/plugins/pair-review/reviews/run/0",
  );
  expect(
    view.getByRole("link", { name: /Completed PR/ }).textContent,
  ).toContain("7");
  view.lifecycle.unmount();
});
