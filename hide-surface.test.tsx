// @vitest-environment jsdom
import { beforeAll, afterEach, expect, it } from "vitest";
import { fireEvent, waitFor, cleanup } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { installTestMatchMedia } from "./test-match-media";
import { defaultPrefs } from "./preferences";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

let app: Awaited<ReturnType<typeof loadPluginApp>>;
beforeAll(async () => {
  installTestMatchMedia();
  app = await loadPluginApp(() => import("./app"));
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

const base: PluginSidebarThread = {
  id: "t",
  projectId: "pa",
  title: "Chat",
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
  isUnread: false,
  isPinned: false,
  isArchived: false,
  environment: {
    id: "e",
    name: null,
    branchName: null,
    providerId: null,
    workspaceDisplayKind: null,
  },
  host: { id: "h1", name: "Mini" },
  createdAt: 1,
  updatedAt: 1,
  lastReadAt: 1,
  latestAttentionAt: 1,
};

it("surfaces a hidden project or section while something in it needs you", async () => {
  const roots = [
    {
      id: "pa",
      projectId: "pa",
      hostId: "h1",
      parentId: null,
      path: "/a",
      name: "Alpha hidden unread",
      sort: 0,
    },
    {
      id: "pb",
      projectId: "pb",
      hostId: "h1",
      parentId: null,
      path: "/b",
      name: "Bravo hidden quiet",
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
    {
      id: "pd",
      projectId: "pd",
      hostId: "h1",
      parentId: null,
      path: "/d",
      name: "Delta hidden running",
      sort: 3,
    },
  ];
  const folders = [
    {
      id: "sd1",
      projectId: "pd",
      hostId: "h1",
      parentId: null,
      path: "/d/1",
      name: "Delta section hidden",
      sort: 0,
    },
  ];
  const threads = [
    { ...base, id: "t1", projectId: "pa", environment: null, isUnread: true },
    {
      ...base,
      id: "t2",
      projectId: "pd",
      environment: { ...base.environment!, id: "env-d" },
      indicator: "runtime" as const,
    },
  ];
  const prefs = structuredClone(defaultPrefs);
  const items = {
    "p:pa": { hidden: true },
    "p:pb": { hidden: true },
    "p:pd": { hidden: true },
    "f:sd1": { hidden: true },
  };
  const rpc = {
    list: () => ({ folders, roots, bindings: { "env-d": "sd1" }, errors: [] }),
    prefs_get: () => ({ prefs, items, stored: true }),
    prefs_save: () => ({ ok: true }),
  };
  const view = renderSlot(
    app.threadLists[0]!,
    { activeThreadId: null, onNavigate() {} },
    { sidebarThreads: { threads, projects: [] }, rpc },
  );
  await view.findByText("Charlie visible");
  const names = () =>
    Array.from(view.container.querySelectorAll(".pf-label > span"))
      .map((el) => el.textContent)
      .filter((t) => /Alpha|Bravo|Charlie|Delta/.test(t ?? ""));
  // Unread outranks running outranks quiet; the quiet hidden one stays out.
  expect(names()).toEqual([
    "Alpha hidden unread",
    "Delta hidden running",
    "Delta section hidden",
    "Charlie visible",
  ]);
  // The button counts only what is still tucked away.
  expect(view.getByRole("button", { name: /Show hidden \(1\)/ })).toBeTruthy();
  view.lifecycle.unmount();
});
