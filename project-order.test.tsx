// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleanup, waitFor } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { installTestMatchMedia } from "./test-match-media";
import { defaultPrefs } from "./preferences";

let app: Awaited<ReturnType<typeof loadPluginApp>>;
// Saved preferences are cached per page, so each test loads a fresh app.
beforeEach(async () => {
  vi.resetModules();
  installTestMatchMedia();
  app = await loadPluginApp(() => import("./app"));
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

const root = (id: string, name: string, sort: number) => ({
  id,
  projectId: id,
  hostId: "h1",
  parentId: null,
  path: `/${id}`,
  name,
  sort,
});
const unread: PluginSidebarThread = {
  id: "t",
  projectId: "pc",
  title: "Unread chat",
  titleFallback: null,
  parentThreadId: null,
  sectionId: null,
  originKind: null,
  originPluginId: null,
  providerId: "codex",
  hasPendingInteraction: false,
  activity: {
    workflows: 0,
    backgroundAgents: 0,
    backgroundCommands: 0,
    planMode: 0,
    goals: 0,
  },
  indicator: "none",
  indicatorLabel: null,
  isUnread: true,
  isPinned: false,
  isArchived: false,
  environment: null,
  host: { id: "h1", name: "Mini" },
  createdAt: 1,
  updatedAt: 1,
  lastReadAt: 0,
  latestAttentionAt: 1,
};

const expectProjectOrder = async (
  order: "activity" | "manual",
  expected: string[],
) => {
  const prefs = structuredClone(defaultPrefs);
  prefs.chatList.projectOrder = order;
  const roots = [
    root("pa", "Alpha", 0),
    root("pb", "Bravo", 1),
    root("pc", "Charlie", 2),
  ];
  const rpc = {
    list: () => ({ folders: [], roots, bindings: {}, errors: [] }),
    prefs_get: () => ({ prefs, items: {}, stored: true }),
    prefs_save: () => ({ ok: true }),
  };
  const view = renderSlot(
    app.threadLists[0]!,
    { activeThreadId: null, onNavigate() {} },
    { sidebarThreads: { threads: [unread], projects: [] }, rpc },
  );
  await view.findByText("Unread chat");
  const names = () =>
    Array.from(view.container.querySelectorAll(".pf-label > span"))
      .map((el) => el.textContent)
      .filter((t) => /Alpha|Bravo|Charlie/.test(t ?? ""));
  // Saved preferences arrive after the first render.
  await waitFor(() => expect(names()).toEqual(expected));
  view.lifecycle.unmount();
};

it("raises a project with an unread chat when projects are active first", async () => {
  expect(defaultPrefs.chatList.projectOrder).toBe("activity");
  await expectProjectOrder("activity", ["Charlie", "Alpha", "Bravo"]);
});

it("keeps the saved project order when project order is manual", async () => {
  await expectProjectOrder("manual", ["Alpha", "Bravo", "Charlie"]);
});
