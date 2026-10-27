import { describe, expect, it } from "vitest";
import { GithubIcon } from "@hugeicons/core-free-icons";
import { ICON_GROUPS } from "./appearance";
import { parsePrefs } from "./preferences";

const all = ICON_GROUPS.flatMap((group) => Object.entries(group.icons));

describe("project icon picker", () => {
  it("offers the GitHub mark, found by searching for github", () => {
    const group = ICON_GROUPS.find((g) => "Github" in g.icons);
    expect(group).toBeDefined();
    expect(group!.icons.Github).toBe(GithubIcon);
    // The picker filters on the lowercase icon name.
    expect(
      Object.keys(group!.icons).filter((name) =>
        name.toLowerCase().includes("github"),
      ),
    ).toEqual(["Github"]);
  });

  it("has no icon name in two groups, which would silently hide one", () => {
    const names = all.map(([name]) => name);
    expect(names.filter((name, i) => names.indexOf(name) !== i)).toEqual([]);
  });

  it("only offers icons that can be saved and rendered", () => {
    for (const [name, icon] of all) {
      expect(icon, name).toBeTruthy();
      const prefs = parsePrefs({
        appearance: { levels: { project: { icon: `icon:${name}` } } },
      });
      expect(prefs.appearance.levels.project.icon, name).toBe(`icon:${name}`);
    }
  });

  it("keeps the GitHub choice when saved", () => {
    const prefs = parsePrefs({
      appearance: {
        levels: { project: { icon: "icon:Github", color: "pink" } },
      },
    });
    expect(prefs.appearance.levels.project).toMatchObject({
      icon: "icon:Github",
      color: "pink",
    });
  });
});
