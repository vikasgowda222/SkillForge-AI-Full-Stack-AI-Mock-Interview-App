import "server-only";

/**
 * Error thrown for a GitHub lookup that failed in an expected way (unknown user
 * or rate-limited), so callers can surface a friendly message.
 */
export class GitHubError extends Error {
  /** @param {string} message @param {"NOT_FOUND"|"RATE_LIMITED"|"FETCH_FAILED"} code */
  constructor(message, code) {
    super(message);
    this.name = "GitHubError";
    this.code = code;
  }
}

const API = "https://api.github.com";

function headers() {
  const base = {
    Accept: "application/vnd.github+json",
    "User-Agent": "SkillForge-AI",
  };
  // Optional: raises the unauthenticated 60 req/hr limit to 5000. Server-only.
  if (process.env.GITHUB_TOKEN) {
    base.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return base;
}

/**
 * Fetch a public GitHub profile and a compact, ranked summary of the user's
 * public repositories. Uses only public, unauthenticated endpoints (no OAuth),
 * so it works for any public username. Returns a small object safe to feed to
 * the model — no tokens or private data.
 *
 * @param {string} username
 * @returns {Promise<{ login: string, name: string|null, bio: string|null, publicRepos: number, topRepos: Array<{name:string, description:string|null, language:string|null, stars:number}>, languages: string[] }>}
 */
export async function fetchGitHubProfile(username) {
  const user = username.trim();
  let userRes, repoRes;
  try {
    [userRes, repoRes] = await Promise.all([
      fetch(`${API}/users/${encodeURIComponent(user)}`, {
        headers: headers(),
        cache: "no-store",
      }),
      fetch(
        `${API}/users/${encodeURIComponent(user)}/repos?sort=pushed&per_page=100&type=owner`,
        { headers: headers(), cache: "no-store" },
      ),
    ]);
  } catch {
    throw new GitHubError("Could not reach GitHub.", "FETCH_FAILED");
  }

  if (userRes.status === 404) {
    throw new GitHubError(`No GitHub user "${user}".`, "NOT_FOUND");
  }
  if (userRes.status === 403) {
    throw new GitHubError("GitHub rate limit reached.", "RATE_LIMITED");
  }
  if (!userRes.ok) {
    throw new GitHubError("GitHub request failed.", "FETCH_FAILED");
  }

  const profile = await userRes.json();
  const repos = repoRes.ok ? await repoRes.json() : [];

  const owned = Array.isArray(repos) ? repos.filter((r) => !r.fork) : [];
  const topRepos = owned
    .slice()
    .sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0))
    .slice(0, 8)
    .map((r) => ({
      name: r.name,
      description: r.description ?? null,
      language: r.language ?? null,
      stars: r.stargazers_count ?? 0,
    }));

  const languageCounts = {};
  for (const r of owned) {
    if (r.language)
      languageCounts[r.language] = (languageCounts[r.language] ?? 0) + 1;
  }
  const languages = Object.entries(languageCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([lang]) => lang);

  return {
    login: profile.login,
    name: profile.name ?? null,
    bio: profile.bio ?? null,
    publicRepos: profile.public_repos ?? owned.length,
    topRepos,
    languages,
  };
}
