import { describe, it, expect } from "vitest";
import {
  sortChats,
  parseSettings,
  parseCollapseState,
  getThreadActivity,
  getThreadAccess,
  isChatKeptVisible,
  visibleChats,
  isThreadBusy,
  collectFolderThreads,
  isSectionInactive,
  isSectionCollapsed,
  hasFolderUnread,
  hasFolderInFlight,
  isThreadWorking,
  nestChats,
  crossProjectAnchors,
  visibleChatRoots,
  folderActivity,
  threadsToMarkRead,
  INACTIVE_SECTION_THRESHOLD_MS,
  sortFoldersByActivity,
} from "./chat-list";
const chat = (id: string, overrides = {}) => ({
  id,
  title: id,
  titleFallback: null,
  isPinned: false,
  isArchived: false,
  createdAt: 1,
  updatedAt: 1,
  latestAttentionAt: 1,
  ...overrides,
});
describe("chat list order", () => {
  it("promotes a chat when a new update or attention event arrives", () => {
    const initial = [chat("older"), chat("newer", { updatedAt: 4 })];
    expect(sortChats(initial, "activity", "en").map((x) => x.id)).toEqual([
      "newer",
      "older",
    ]);
    expect(
      sortChats(
        [chat("older", { latestAttentionAt: 5 }), initial[1]],
        "activity",
        "en",
      ).map((x) => x.id),
    ).toEqual(["older", "newer"]);
    expect(
      sortChats(
        [chat("older", { updatedAt: 6 }), initial[1]],
        "activity",
        "en",
      )[0].id,
    ).toBe("older");
    expect(initial[0].id).toBe("older");
  });
  it("excludes archives and keeps pinned chats above newer activity", () => {
    expect(
      sortChats(
        [
          chat("busy", { updatedAt: 99 }),
          chat("pin", { isPinned: true }),
          chat("hidden", { isArchived: true }),
        ],
        "activity",
        "en",
      ).map((x) => x.id),
    ).toEqual(["pin", "busy"]);
  });
  it("sorts names naturally and supports newest-created order", () => {
    const rows = [
      chat("10", { title: "Task 10", createdAt: 2 }),
      chat("2", { title: "Task 2", createdAt: 3 }),
    ];
    expect(sortChats(rows, "title", "en")[0].id).toBe("2");
    expect(sortChats(rows, "created", "en")[0].id).toBe("2");
  });
  it("validates persisted preferences", () => {
    for (const raw of [
      "null",
      "broken",
      '{"limit":0}',
      '{"limit":101}',
      '{"limit":2.5}',
    ])
      expect(parseSettings(raw).limit).toBe(10);
    expect(parseSettings('{"sort":"title","limit":5}')).toEqual({
      sort: "title",
      limit: 5,
      autoCollapseInactive: true,
      threadDisplay: "classic",
    });
    expect(
      parseSettings(
        '{"sort":"activity","limit":10,"autoCollapseInactive":false}',
      ),
    ).toEqual({
      sort: "activity",
      limit: 10,
      autoCollapseInactive: false,
      threadDisplay: "classic",
    });
  });
});

describe("auto-collapsing inactive sections", () => {
  const folders = [
    { id: "sec1", projectId: "p1", parentId: null },
    { id: "sub1", projectId: "p1", parentId: "sec1" },
  ];
  const bindings = {
    env1: "sec1",
    env2: "sub1",
  };

  it("parses collapse state from both legacy boolean and timestamped formats", () => {
    expect(parseCollapseState(null)).toEqual({});
    expect(parseCollapseState("invalid")).toEqual({});
    expect(
      parseCollapseState(JSON.stringify({ sec1: true, sec2: false })),
    ).toEqual({
      sec1: { collapsed: true, at: 0 },
      sec2: { collapsed: false, at: 0 },
    });
    expect(
      parseCollapseState(
        JSON.stringify({
          sec1: { collapsed: true, at: 1000 },
          sec2: { collapsed: false, at: 2000 },
        }),
      ),
    ).toEqual({
      sec1: { collapsed: true, at: 1000 },
      sec2: { collapsed: false, at: 2000 },
    });
  });

  it("hides chats idle longer than 48 hours under the remaining list", () => {
    const now = 200_000_000_000;
    const day = 24 * 60 * 60 * 1000;
    const hideIdleMs = 48 * 60 * 60 * 1000;
    const recent = {
      id: "recent",
      projectId: "p1",
      lastReadAt: now - day,
      updatedAt: now - day,
      createdAt: now - 10 * day,
    };
    const idle = {
      id: "idle",
      projectId: "p1",
      lastReadAt: now - 3 * day,
      updatedAt: now - 3 * day,
      createdAt: now - 10 * day,
    };
    const pinned = { ...idle, id: "pin", isPinned: true };
    const unread = { ...idle, id: "unread", isUnread: true };
    const busy = { ...idle, id: "busy", status: "active" };
    const open = { ...idle, id: "open" };

    expect(getThreadAccess(recent)).toBe(now - day);
    expect(isChatKeptVisible(idle, { hideIdleMs, now })).toBe(false);
    expect(isChatKeptVisible(recent, { hideIdleMs, now })).toBe(true);
    expect(isChatKeptVisible(pinned, { hideIdleMs, now })).toBe(true);
    expect(isChatKeptVisible(unread, { hideIdleMs, now })).toBe(true);
    expect(isChatKeptVisible(busy, { hideIdleMs, now })).toBe(true);
    expect(
      isChatKeptVisible(open, { hideIdleMs, now, activeThreadId: "open" }),
    ).toBe(true);
    expect(isChatKeptVisible(idle, { hideIdleMs: 0, now })).toBe(true);

    expect(
      visibleChats([recent, idle, pinned], {
        expanded: false,
        limit: 10,
        hideIdleMs,
        now,
      }).map((c) => c.id),
    ).toEqual(["recent", "pin"]);
    expect(
      visibleChats([recent, idle], {
        expanded: true,
        limit: 10,
        hideIdleMs,
        now,
      }).map((c) => c.id),
    ).toEqual(["recent", "idle"]);
    expect(
      visibleChats([recent, { ...recent, id: "r2" }, idle], {
        expanded: false,
        limit: 1,
        hideIdleMs,
        now,
      }).map((c) => c.id),
    ).toEqual(["recent"]);
  });

  it("calculates thread activity from updatedAt, latestAttentionAt, and createdAt", () => {
    expect(getThreadActivity({ createdAt: 10 })).toBe(10);
    expect(getThreadActivity({ createdAt: 10, updatedAt: 20 })).toBe(20);
    expect(
      getThreadActivity({
        createdAt: 10,
        updatedAt: 20,
        latestAttentionAt: 30,
      }),
    ).toBe(30);
    // When thread is simply read, updatedAt matches lastReadAt and does not count as conversation activity
    expect(
      getThreadActivity({
        createdAt: 10,
        latestAttentionAt: 25,
        updatedAt: 1000,
        lastReadAt: 1000,
      }),
    ).toBe(25);
  });

  it("identifies busy threads", () => {
    expect(isThreadBusy({})).toBe(false);
    expect(isThreadBusy({ indicator: "running" })).toBe(true);
    expect(isThreadBusy({ indicator: "workflow" })).toBe(true);
    expect(isThreadBusy({ status: "active" })).toBe(true);
    expect(isThreadBusy({ hasPendingInteraction: true })).toBe(true);
    expect(isThreadBusy({ activity: { workflows: 1 } })).toBe(true);
    expect(isThreadBusy({ activity: { backgroundAgents: 1 } })).toBe(true);
    expect(isThreadBusy({ activity: { backgroundCommands: 1 } })).toBe(true);
  });

  it("collects threads including child subsections", () => {
    const threads = [
      { id: "t1", projectId: "p1", environment: { id: "env1" } },
      { id: "t2", projectId: "p1", environment: { id: "env2" } },
      { id: "t3", projectId: "p2", environment: { id: "other" } },
    ];
    const sec1Threads = collectFolderThreads(
      "sec1",
      "p1",
      folders,
      bindings,
      threads,
    );
    expect(sec1Threads.map((t) => t.id)).toEqual(["t1", "t2"]);

    const sub1Threads = collectFolderThreads(
      "sub1",
      "p1",
      folders,
      bindings,
      threads,
    );
    expect(sub1Threads.map((t) => t.id)).toEqual(["t2"]);
  });

  it("marks a section as inactive when chats are older than 2 hours", () => {
    const now = 10_000_000;
    const oldTime = now - 3 * 60 * 60 * 1000; // 3 hours ago
    const freshTime = now - 30 * 60 * 1000; // 30 minutes ago

    // Section with old chats -> inactive
    expect(
      isSectionInactive({
        folderId: "sec1",
        projectId: "p1",
        folders,
        bindings,
        threads: [
          {
            id: "t1",
            projectId: "p1",
            environment: { id: "env1" },
            updatedAt: oldTime,
          },
        ],
        now,
      }),
    ).toBe(true);

    // Section with recent chat -> active
    expect(
      isSectionInactive({
        folderId: "sec1",
        projectId: "p1",
        folders,
        bindings,
        threads: [
          {
            id: "t1",
            projectId: "p1",
            environment: { id: "env1" },
            updatedAt: freshTime,
          },
        ],
        now,
      }),
    ).toBe(false);

    // Empty section -> not inactive (no clutter)
    expect(
      isSectionInactive({
        folderId: "sec1",
        projectId: "p1",
        folders,
        bindings,
        threads: [],
        now,
      }),
    ).toBe(false);

    // Active thread open in UI -> not inactive
    expect(
      isSectionInactive({
        folderId: "sec1",
        projectId: "p1",
        folders,
        bindings,
        threads: [
          {
            id: "t1",
            projectId: "p1",
            environment: { id: "env1" },
            updatedAt: oldTime,
          },
        ],
        activeThreadId: "t1",
        now,
      }),
    ).toBe(false);

    // Running background task -> not inactive
    expect(
      isSectionInactive({
        folderId: "sec1",
        projectId: "p1",
        folders,
        bindings,
        threads: [
          {
            id: "t1",
            projectId: "p1",
            environment: { id: "env1" },
            updatedAt: oldTime,
            indicator: "running",
          },
        ],
        now,
      }),
    ).toBe(false);

    // Activity in subsection prevents parent from becoming inactive
    expect(
      isSectionInactive({
        folderId: "sec1",
        projectId: "p1",
        folders,
        bindings,
        threads: [
          {
            id: "t1",
            projectId: "p1",
            environment: { id: "env1" },
            updatedAt: oldTime,
          },
          {
            id: "t2",
            projectId: "p1",
            environment: { id: "env2" },
            updatedAt: freshTime,
          },
        ],
        now,
      }),
    ).toBe(false);
  });

  it("determines section collapsed state with auto-collapse and manual overrides", () => {
    const now = 20_000_000;
    const oldTime = now - 3 * 60 * 60 * 1000; // 3 hours ago
    const freshTime = now - 15 * 60 * 1000; // 15 mins ago
    const oldThreads = [
      {
        id: "t1",
        projectId: "p1",
        environment: { id: "env1" },
        updatedAt: oldTime,
      },
    ];
    const freshThreads = [
      {
        id: "t1",
        projectId: "p1",
        environment: { id: "env1" },
        updatedAt: freshTime,
      },
    ];

    // Root project folder is never auto-collapsed
    expect(
      isSectionCollapsed({
        folderId: "sec1",
        projectId: "p1",
        root: true,
        folders,
        bindings,
        threads: oldThreads,
        now,
      }),
    ).toBe(false);

    // Section with old chats is auto-collapsed by default
    expect(
      isSectionCollapsed({
        folderId: "sec1",
        projectId: "p1",
        root: false,
        folders,
        bindings,
        threads: oldThreads,
        now,
      }),
    ).toBe(true);

    // Section with fresh chats is expanded
    expect(
      isSectionCollapsed({
        folderId: "sec1",
        projectId: "p1",
        root: false,
        folders,
        bindings,
        threads: freshThreads,
        now,
      }),
    ).toBe(false);

    // If user manually expanded an inactive section recently (< 2 hours), it stays open
    expect(
      isSectionCollapsed({
        folderId: "sec1",
        projectId: "p1",
        root: false,
        folders,
        bindings,
        threads: oldThreads,
        record: { collapsed: false, at: now - 30 * 60 * 1000 },
        now,
      }),
    ).toBe(false);

    // If user manual expand happened > 2 hours ago with no new activity, it auto-collapses again
    expect(
      isSectionCollapsed({
        folderId: "sec1",
        projectId: "p1",
        root: false,
        folders,
        bindings,
        threads: oldThreads,
        record: { collapsed: false, at: now - 3 * 60 * 60 * 1000 },
        now,
      }),
    ).toBe(true);

    // If user explicitly collapsed, it stays collapsed even with busy threads or active chat
    expect(
      isSectionCollapsed({
        folderId: "sec1",
        projectId: "p1",
        root: false,
        folders,
        bindings,
        threads: [
          {
            id: "t1",
            projectId: "p1",
            environment: { id: "env1" },
            updatedAt: now,
            indicator: "workflow",
          },
        ],
        activeThreadId: "t1",
        record: { collapsed: true, at: now },
        now,
      }),
    ).toBe(true);

    // When autoCollapseInactive is false, old chats do not auto-collapse
    expect(
      isSectionCollapsed({
        folderId: "sec1",
        projectId: "p1",
        root: false,
        folders,
        bindings,
        threads: oldThreads,
        autoCollapseInactive: false,
        now,
      }),
    ).toBe(false);

    expect(
      isSectionCollapsed({
        folderId: "sec1",
        projectId: "p1",
        root: false,
        folders,
        bindings,
        threads: [],
        now,
      }),
    ).toBe(true);
  });

  it("keeps manually reordered projects in order when sorting sections by activity", () => {
    const projects = [
      { id: "p2", projectId: "p2", parentId: null, sort: 0 },
      { id: "p1", projectId: "p1", parentId: null, sort: 1 },
    ];
    const threads = [
      {
        id: "unread-in-p1",
        projectId: "p1",
        environment: { id: "env-p1" },
        isUnread: true,
      },
    ];
    expect(
      sortFoldersByActivity(projects, {
        enabled: true,
        root: true,
        folders: [],
        bindings: {},
        threads,
      }).map((project) => project.projectId),
    ).toEqual(["p2", "p1"]);
  });

  it("sorts sibling sections by unread reply, then busy, then activity", () => {
    const now = 50_000_000;
    const siblings = [
      { id: "idle", projectId: "p1", parentId: null, sort: 0 },
      { id: "fresh", projectId: "p1", parentId: null, sort: 1 },
      { id: "busy", projectId: "p1", parentId: null, sort: 2 },
      { id: "reply", projectId: "p1", parentId: null, sort: 3 },
    ];
    const tree = [...siblings, { id: "sec1", projectId: "p1", parentId: null }];
    const threads = [
      {
        id: "t-idle",
        projectId: "p1",
        environment: { id: "env-idle" },
        updatedAt: now - 10 * 60 * 60 * 1000,
      },
      {
        id: "t-fresh",
        projectId: "p1",
        environment: { id: "env-fresh" },
        updatedAt: now - 10 * 60 * 1000,
      },
      {
        id: "t-busy",
        projectId: "p1",
        environment: { id: "env-busy" },
        updatedAt: now - 8 * 60 * 60 * 1000,
        status: "active",
      },
      {
        id: "t-reply",
        projectId: "p1",
        environment: { id: "env-reply" },
        updatedAt: now - 9 * 60 * 60 * 1000,
        isUnread: true,
      },
    ];
    const bind = {
      "env-idle": "idle",
      "env-fresh": "fresh",
      "env-busy": "busy",
      "env-reply": "reply",
    };
    expect(
      sortFoldersByActivity(siblings, {
        enabled: true,
        root: false,
        folders: tree,
        bindings: bind,
        threads,
      }).map((f) => f.id),
    ).toEqual(["reply", "busy", "fresh", "idle"]);
    expect(
      sortFoldersByActivity(siblings, {
        enabled: false,
        root: false,
        folders: tree,
        bindings: bind,
        threads,
      }).map((f) => f.id),
    ).toEqual(["idle", "fresh", "busy", "reply"]);
  });

  it("counts only real work as in progress, not drafts", () => {
    expect(
      isThreadWorking({ id: "a", projectId: "p", indicator: "runtime" }),
    ).toBe(true);
    expect(
      isThreadWorking({
        id: "a",
        projectId: "p",
        indicator: "none",
        activity: { backgroundAgents: 1 },
      }),
    ).toBe(true);
    for (const indicator of [
      "draft",
      "working-draft",
      "none",
      "unread-success",
    ])
      expect(isThreadWorking({ id: "a", projectId: "p", indicator })).toBe(
        false,
      );
  });

  it("ranks unread, waiting and in-progress projects above quiet ones", () => {
    const rank = (thread: object) =>
      folderActivity({
        folderId: "p1",
        projectId: "p1",
        root: true,
        folders: [],
        bindings: {},
        threads: [{ id: "t", projectId: "p1", ...thread }],
      }).rank;
    expect(rank({ indicator: "unread-success", isUnread: true })).toBe(3);
    expect(rank({ indicator: "unread-error" })).toBe(3);
    expect(rank({ hasPendingInteraction: true })).toBe(3);
    expect(rank({ indicator: "runtime" })).toBe(2);
    expect(rank({ indicator: "draft", updatedAt: 5 })).toBe(1);
    expect(rank({ isArchived: true, isUnread: true })).toBe(0);
  });

  it("preserves the server's stored project order in manual mode", () => {
    const roots = [
      { id: "project-z", projectId: "project-z" },
      { id: "project-a", projectId: "project-a" },
      { id: "project-m", projectId: "project-m" },
    ];

    expect(
      sortFoldersByActivity(roots, {
        enabled: false,
        root: true,
        folders: [],
        bindings: {},
        threads: [],
      }).map((root) => root.id),
    ).toEqual(["project-z", "project-a", "project-m"]);
  });

  it("does not raise a section when you only open a chat", () => {
    const now = 60_000_000;
    const siblings = [
      { id: "other-unread", projectId: "p1", parentId: null, sort: 0 },
      { id: "opened", projectId: "p1", parentId: null, sort: 1 },
      { id: "busy", projectId: "p1", parentId: null, sort: 2 },
    ];
    const bind = {
      "env-other": "other-unread",
      "env-opened": "opened",
      "env-busy": "busy",
    };
    const afterOpen = [
      {
        id: "t-other",
        projectId: "p1",
        environment: { id: "env-other" },
        updatedAt: now - 60 * 60 * 1000,
        isUnread: true,
      },
      {
        id: "t-opened",
        projectId: "p1",
        environment: { id: "env-opened" },
        updatedAt: now,
        lastReadAt: now,
        latestAttentionAt: now - 3 * 60 * 60 * 1000,
        isUnread: false,
      },
      {
        id: "t-busy",
        projectId: "p1",
        environment: { id: "env-busy" },
        updatedAt: now - 30 * 60 * 1000,
        status: "active",
      },
    ];
    expect(
      sortFoldersByActivity(siblings, {
        enabled: true,
        root: false,
        folders: siblings,
        bindings: bind,
        threads: afterOpen,
      }).map((f) => f.id),
    ).toEqual(["other-unread", "busy", "opened"]);
  });

  it("detects unread chats anywhere in the hierarchy", () => {
    const threads = [
      {
        id: "t1",
        projectId: "p1",
        environment: { id: "env1" },
        isUnread: false,
      },
      {
        id: "t2",
        projectId: "p1",
        environment: { id: "env2" },
        isUnread: true,
      },
    ];

    // Parent folder sec1 sees unread from subfolder sub1
    expect(
      hasFolderUnread({
        folderId: "sec1",
        projectId: "p1",
        root: false,
        folders,
        bindings,
        threads,
      }),
    ).toBe(true);

    // Subfolder sub1 itself has unread t2
    expect(
      hasFolderUnread({
        folderId: "sub1",
        projectId: "p1",
        root: false,
        folders,
        bindings,
        threads,
      }),
    ).toBe(true);

    // Project root has unread
    expect(
      hasFolderUnread({
        folderId: "p1",
        projectId: "p1",
        root: true,
        folders,
        bindings,
        threads,
      }),
    ).toBe(true);

    // If all threads are read, returns false
    const readThreads = [
      {
        id: "t1",
        projectId: "p1",
        environment: { id: "env1" },
        isUnread: false,
      },
      {
        id: "t2",
        projectId: "p1",
        environment: { id: "env2" },
        isUnread: false,
      },
    ];
    expect(
      hasFolderUnread({
        folderId: "sec1",
        projectId: "p1",
        root: false,
        folders,
        bindings,
        threads: readThreads,
      }),
    ).toBe(false);
  });

  it("flags every parent folder of an in-flight chat", () => {
    const threads = [
      {
        id: "t1",
        projectId: "p1",
        environment: { id: "env1" },
        indicator: "none",
      },
      {
        id: "t2",
        projectId: "p1",
        environment: { id: "env2" },
        indicator: "runtime",
      },
    ];
    const inFlight = (folderId: string, root = false, list = threads) =>
      hasFolderInFlight({
        folderId,
        projectId: "p1",
        root,
        folders,
        bindings,
        threads: list,
      });
    expect(inFlight("sub1")).toBe(true);
    expect(inFlight("sec1")).toBe(true);
    expect(inFlight("p1", true)).toBe(true);
    // A sibling subtree without running chats stays quiet.
    expect(
      hasFolderInFlight({
        folderId: "sub1",
        projectId: "p1",
        root: false,
        folders,
        bindings,
        threads: [threads[0]],
      }),
    ).toBe(false);
    // Archived, waiting-for-input and finished chats are not in flight.
    for (const extra of [
      { isArchived: true },
      { hasPendingInteraction: true },
      { indicator: "unread-success" },
    ]) {
      expect(inFlight("sec1", false, [{ ...threads[1], ...extra }])).toBe(
        false,
      );
    }
  });

  describe("nested chats", () => {
    const chat = (
      id: string,
      parentThreadId: string | null = null,
      extra = {},
    ) => ({
      id,
      projectId: "p1",
      parentThreadId,
      updatedAt: 1,
      ...extra,
    });
    const ids = (list: { id: string }[]) => list.map((c) => c.id);

    it("nests a chat under its parent and keeps the incoming order", () => {
      const { roots, children } = nestChats([
        chat("a"),
        chat("c1", "a"),
        chat("b"),
        chat("c2", "a"),
        chat("g1", "c1"),
      ]);
      expect(ids(roots)).toEqual(["a", "b"]);
      expect(ids(children.get("a")!)).toEqual(["c1", "c2"]);
      expect(ids(children.get("c1")!)).toEqual(["g1"]);
    });

    it("keeps a chat top-level when its parent is not in the list", () => {
      const { roots, children } = nestChats([chat("orphan", "elsewhere")]);
      expect(ids(roots)).toEqual(["orphan"]);
      expect(children.size).toBe(0);
    });

    it("breaks parent loops instead of hiding the chats", () => {
      const { roots } = nestChats([
        chat("a", "b"),
        chat("b", "a"),
        chat("s", "s"),
      ]);
      expect(ids(roots).sort()).toEqual(["a", "b", "s"]);
    });

    it("keeps an idle parent visible while a child is unread", () => {
      const { roots, children } = nestChats([
        chat("old", null, { updatedAt: 0 }),
        chat("kid", "old", { isUnread: true }),
        chat("other", null, { updatedAt: 0 }),
      ]);
      const params = {
        expanded: false,
        limit: 10,
        hideIdleMs: 1000,
        now: 10_000_000,
      };
      expect(ids(visibleChatRoots(roots, children, params))).toEqual(["old"]);
      expect(
        ids(visibleChatRoots(roots, children, { ...params, expanded: true })),
      ).toEqual(["old", "other"]);
      expect(
        ids(visibleChatRoots(roots, children, { ...params, limit: 0 })),
      ).toEqual([]);
    });
  });

  describe("chats spawned from another project", () => {
    const chat = (
      id: string,
      projectId: string,
      parentThreadId: string | null = null,
      extra = {},
    ) => ({ id, projectId, parentThreadId, ...extra });
    const entries = (map: Map<string, string>) =>
      Object.fromEntries([...map.entries()].sort());

    it("follows a parent in another project, with its own children", () => {
      expect(
        entries(
          crossProjectAnchors([
            chat("lead", "personal"),
            chat("kid", "repo", "lead"),
            chat("grandkid", "repo", "kid"),
            chat("back", "personal", "grandkid"),
          ]),
        ),
      ).toEqual({ back: "lead", grandkid: "lead", kid: "lead" });
    });

    it("leaves same-project and unlinked chats in their own place", () => {
      expect(
        crossProjectAnchors([
          chat("a", "p1"),
          chat("a-kid", "p1", "a"),
          chat("orphan", "p2", "gone"),
          chat("self", "p2", "self"),
        ]).size,
      ).toBe(0);
    });

    it("stays put when the parent in another project is archived", () => {
      expect(
        crossProjectAnchors([
          chat("lead", "personal", null, { isArchived: true }),
          chat("kid", "repo", "lead"),
        ]).size,
      ).toBe(0);
    });

    it("keeps every chat in a parent loop in its own place", () => {
      expect(
        entries(
          crossProjectAnchors([
            chat("a", "p1", "b"),
            chat("b", "p2", "a"),
            chat("tail", "p3", "a"),
          ]),
        ),
      ).toEqual({ tail: "a" });
    });
  });

  it("selects unread subtree threads and skips archived and pending interaction", () => {
    const threads = [
      {
        id: "parent-unread",
        projectId: "p1",
        environment: { id: "env1" },
        isUnread: true,
      },
      {
        id: "nested-unread",
        projectId: "p1",
        environment: { id: "env2" },
        isUnread: true,
      },
      {
        id: "archived",
        projectId: "p1",
        environment: { id: "env1" },
        isUnread: true,
        isArchived: true,
      },
      {
        id: "pending",
        projectId: "p1",
        environment: { id: "env1" },
        isUnread: true,
        hasPendingInteraction: true,
      },
      {
        id: "read",
        projectId: "p1",
        environment: { id: "env1" },
        isUnread: false,
      },
      {
        id: "other-project",
        projectId: "p2",
        environment: { id: "env1" },
        isUnread: true,
      },
    ];
    expect(
      threadsToMarkRead({
        folderId: "sec1",
        projectId: "p1",
        root: false,
        folders,
        bindings,
        threads,
      }).map((t) => t.id),
    ).toEqual(["parent-unread", "nested-unread"]);
    expect(
      threadsToMarkRead({
        folderId: "sub1",
        projectId: "p1",
        root: false,
        folders,
        bindings,
        threads,
      }).map((t) => t.id),
    ).toEqual(["nested-unread"]);
    expect(
      threadsToMarkRead({
        folderId: "p1",
        projectId: "p1",
        root: true,
        folders,
        bindings,
        threads,
      }).map((t) => t.id),
    ).toEqual(["parent-unread", "nested-unread"]);
  });
});
