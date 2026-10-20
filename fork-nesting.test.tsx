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
  createdAt: Date.now(),
  updatedAt: Date.now(),
  lastReadAt: Date.now(),
  latestAttentionAt: Date.now(),
};

const root = {
  id: "p1",
  projectId: "p1",
  hostId: "h1",
  parentId: null,
  path: "/work",
  name: "Project",
};

it("nests a fork under the chat it was forked from", async () => {
  const asked: string[][] = [];
  const threads = [
    {
      ...base,
      id: "src",
      projectId: "p1",
      title: "Original chat",
      environment: null,
      updatedAt: 10,
    },
    {
      ...base,
      id: "fork",
      projectId: "p1",
      title: "Forked chat",
      environment: null,
      originKind: "fork" as const,
      updatedAt: 20,
    },
    {
      ...base,
      id: "other",
      projectId: "p1",
      title: "Unrelated chat",
      environment: null,
      updatedAt: 5,
    },
  ];
  const rpc = {
    list: () => ({ folders: [], roots: [root], bindings: {}, errors: [] }),
    prefs_get: () => ({
      prefs: structuredClone(defaultPrefs),
      items: {},
      stored: true,
    }),
    fork_sources: (input: { threadIds: string[] }) => {
      asked.push(input.threadIds);
      return { sources: { fork: "src" } };
    },
  };
  const view = renderSlot(
    app.threadLists[0]!,
    { activeThreadId: null, onNavigate() {} },
    { sidebarThreads: { threads, projects: [] }, rpc },
  );
  const nested = await waitFor(() => {
    const el = view.container.querySelector(".pf-thread-children");
    expect(el).not.toBeNull();
    return el!;
  });
  expect(nested.textContent).toContain("Forked chat");
  expect(nested.textContent).not.toContain("Unrelated chat");
  expect(asked).toEqual([["fork"]]);
  view.lifecycle.unmount();
});
