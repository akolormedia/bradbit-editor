import { describe, expect, it } from "vitest";
import {
  defaultBaseBranch,
  findGitHubRemote,
  githubRepoUrl,
  isDefaultBranchName,
  parseGitHubRemote,
  sanitizeRepoName,
  uniqueRemoteName,
} from "./github";

describe("GitHub remote helpers (T-1.5.4)", () => {
  it("parses HTTPS, SSH and scp-style GitHub remotes", () => {
    expect(parseGitHubRemote("https://github.com/rafael/bradbit-demo.git")).toEqual({
      owner: "rafael",
      repo: "bradbit-demo",
    });
    expect(parseGitHubRemote("https://github.com/rafael/bradbit-demo")).toEqual({
      owner: "rafael",
      repo: "bradbit-demo",
    });
    expect(parseGitHubRemote("git@github.com:rafael/bradbit-demo.git")).toEqual({
      owner: "rafael",
      repo: "bradbit-demo",
    });
    expect(parseGitHubRemote("ssh://git@github.com/rafael/bradbit-demo.git")).toEqual({
      owner: "rafael",
      repo: "bradbit-demo",
    });
  });

  it("rejects non-GitHub and malformed remotes", () => {
    expect(parseGitHubRemote("https://gitlab.com/rafael/bradbit-demo.git")).toBeNull();
    expect(parseGitHubRemote("https://github.com/rafael")).toBeNull();
    expect(parseGitHubRemote("https://github.com/rafael/demo/tree/main")).toBeNull();
    expect(parseGitHubRemote("git@example.com:rafael/demo.git")).toBeNull();
    expect(parseGitHubRemote("")).toBeNull();
  });

  it("finds origin first and builds the browser URL", () => {
    const found = findGitHubRemote([
      { name: "upstream", url: "https://github.com/otro/repo.git" },
      { name: "origin", url: "git@github.com:rafael/bradbit-demo.git" },
    ]);
    expect(found?.remote.name).toBe("origin");
    expect(found?.ref).toEqual({ owner: "rafael", repo: "bradbit-demo" });
    expect(found && githubRepoUrl(found.ref)).toBe(
      "https://github.com/rafael/bradbit-demo",
    );

    expect(
      findGitHubRemote([{ name: "origin", url: "https://example.com/repo.git" }]),
    ).toBeNull();
  });

  it("sanitizes folder names into repository names", () => {
    expect(sanitizeRepoName("Mi Proyecto de Guion")).toBe("mi-proyecto-de-guion");
    expect(sanitizeRepoName("  ópera/acto 1  ")).toBe("pera-acto-1");
    expect(sanitizeRepoName("...")).toBe("mi-proyecto");
    expect(sanitizeRepoName("")).toBe("mi-proyecto");
  });

  it("detects default branches and picks a PR base", () => {
    expect(isDefaultBranchName("main")).toBe(true);
    expect(isDefaultBranchName("master")).toBe(true);
    expect(isDefaultBranchName("final-alternativo")).toBe(false);
    expect(defaultBaseBranch(["final-alternativo", "main"])).toBe("main");
    expect(defaultBaseBranch(["master", "otra"])).toBe("master");
    expect(defaultBaseBranch(["rama-a", "rama-b"])).toBe("rama-a");
    expect(defaultBaseBranch([])).toBe("main");
  });

  it("picks a free remote name when publishing", () => {
    expect(uniqueRemoteName([])).toBe("github");
    expect(uniqueRemoteName([{ name: "origin", url: "x" }])).toBe("github");
    expect(uniqueRemoteName([{ name: "github", url: "x" }])).toBe("github-2");
    expect(
      uniqueRemoteName([
        { name: "github", url: "x" },
        { name: "github-2", url: "y" },
      ]),
    ).toBe("github-3");
  });
});
