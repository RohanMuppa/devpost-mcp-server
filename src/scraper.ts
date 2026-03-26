import * as cheerio from "cheerio";
import type {
  Hackathon,
  HackathonWinner,
  ProjectDetails,
  ProjectSearchResult,
  CacheEntry,
} from "./types.js";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// In-memory cache keyed by URL
const cache = new Map<string, CacheEntry<string>>();

/**
 * Fetch a page with caching, user-agent spoofing, and error handling.
 */
async function fetchPage(url: string): Promise<string> {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (response.status === 403 || response.status === 429) {
    throw new Error(
      `Devpost returned HTTP ${response.status}. This usually means rate limiting. Try again in a few minutes.`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Devpost returned HTTP ${response.status} for ${url}`
    );
  }

  const html = await response.text();
  cache.set(url, { data: html, timestamp: Date.now() });
  return html;
}

/**
 * Search for hackathons on Devpost.
 */
export async function searchHackathons(
  query: string,
  status?: "upcoming" | "open" | "ended"
): Promise<Hackathon[]> {
  const params = new URLSearchParams();
  if (query) params.set("search", query);
  if (status) {
    // Devpost uses these filter params:
    // open => status[]=open
    // upcoming => status[]=upcoming
    // ended => status[]=ended
    params.set("status[]", status);
  }

  const url = `https://devpost.com/hackathons?${params.toString()}`;
  const html = await fetchPage(url);
  const $ = cheerio.load(html);

  const hackathons: Hackathon[] = [];

  // Each hackathon tile is in a .hackathon-tile or similar container
  $(".hackathon-tile, .challenge-listing, [data-hackathon-tile]").each(
    (_i, el) => {
      const $el = $(el);
      const name =
        $el.find("h2, h3, .title, .hackathon-title, [class*='title']").first().text().trim() ||
        $el.find("a").first().text().trim();
      const url =
        $el.find("a[href*='devpost.com'], a[href*='/hackathons']").first().attr("href") ||
        $el.find("a").first().attr("href") ||
        "";
      const dates =
        $el.find(".dates, .submission-period, [class*='date']").first().text().trim() ||
        "";
      const participants =
        $el.find("[class*='participant'], [class*='count']").first().text().trim() ||
        "";
      const prizes =
        $el.find("[class*='prize'], .prize").first().text().trim() || "";
      const statusText =
        $el.find("[class*='status'], .status-label").first().text().trim() || "";

      if (name) {
        hackathons.push({
          name,
          url: url.startsWith("http") ? url : `https://devpost.com${url}`,
          dates,
          participants_count: participants,
          prizes,
          status: statusText || status || "unknown",
        });
      }
    }
  );

  // Fallback: try parsing the more modern Devpost layout
  if (hackathons.length === 0) {
    // Try alternate selectors for the hackathon listing page
    $("a.hackathon-thumbnail, .challenge-card, [class*='hackathon']").each(
      (_i, el) => {
        const $el = $(el);
        const href = $el.attr("href") || $el.find("a").first().attr("href") || "";
        const name =
          $el.find("h2, h3, .title").first().text().trim() ||
          $el.text().trim().split("\n")[0]?.trim() ||
          "";

        if (name && name.length < 200) {
          hackathons.push({
            name,
            url: href.startsWith("http") ? href : `https://devpost.com${href}`,
            dates: "",
            participants_count: "",
            prizes: "",
            status: status || "unknown",
          });
        }
      }
    );
  }

  // Third fallback: extract from any structured result blocks
  if (hackathons.length === 0) {
    $("[class*='result'], [class*='listing'], .row .col-md-4, .row .col-lg-4").each(
      (_i, el) => {
        const $el = $(el);
        const link = $el.find("a").first();
        const href = link.attr("href") || "";
        const name = link.text().trim() || $el.find("h2, h3, h4").first().text().trim();

        if (name && href && name.length < 200) {
          hackathons.push({
            name,
            url: href.startsWith("http") ? href : `https://devpost.com${href}`,
            dates: "",
            participants_count: "",
            prizes: "",
            status: status || "unknown",
          });
        }
      }
    );
  }

  return hackathons;
}

/**
 * Get winning projects from a specific hackathon.
 */
export async function getHackathonWinners(
  hackathonSlug: string
): Promise<HackathonWinner[]> {
  const url = `https://${hackathonSlug}.devpost.com/project-gallery?winners=true`;
  const html = await fetchPage(url);
  const $ = cheerio.load(html);

  const winners: HackathonWinner[] = [];

  // Project gallery entries
  $(
    ".gallery-item, .software-entry, [class*='project'], [id*='702'] .row > div"
  ).each((_i, el) => {
    const $el = $(el);
    const link = $el.find("a[href*='/software/']").first();
    const name =
      $el.find("h2, h3, h4, h5, .entry-title, [class*='title']").first().text().trim() ||
      link.text().trim();
    const href = link.attr("href") || "";
    const tagline =
      $el.find("p, .tagline, [class*='tagline'], [class*='subtitle']").first().text().trim() || "";

    // Team members
    const teamMembers: string[] = [];
    $el.find("[class*='member'], [class*='user'], .team-member").each(
      (_j, member) => {
        const memberName = $(member).text().trim();
        if (memberName) teamMembers.push(memberName);
      }
    );

    // Prizes
    const prizesWon: string[] = [];
    $el.find("[class*='prize'], .winner-label, .prize").each((_j, prize) => {
      const prizeText = $(prize).text().trim();
      if (prizeText) prizesWon.push(prizeText);
    });

    // Tech stack (built with)
    const techStack: string[] = [];
    $el.find("[class*='built'], .tag, [class*='tech']").each((_j, tech) => {
      const techText = $(tech).text().trim();
      if (techText) techStack.push(techText);
    });

    const likes =
      $el.find("[class*='like'], [class*='heart'], .vote-count").first().text().trim() || "0";

    if (name) {
      winners.push({
        name,
        tagline,
        url: href.startsWith("http") ? href : `https://devpost.com${href}`,
        team_members: teamMembers,
        prizes_won: prizesWon,
        tech_stack: techStack,
        likes,
      });
    }
  });

  return winners;
}

/**
 * Get full details of a Devpost project.
 */
export async function getProjectDetails(
  projectSlug: string
): Promise<ProjectDetails> {
  const devpostUrl = `https://devpost.com/software/${projectSlug}`;
  const html = await fetchPage(devpostUrl);
  const $ = cheerio.load(html);

  const name =
    $("h1, #app-title, [id*='title']").first().text().trim() || projectSlug;

  const tagline =
    $(".app-tagline, [class*='tagline'], h1 + p, [class*='subtitle']")
      .first()
      .text()
      .trim() || "";

  // Description: usually in the main content area
  const description =
    $(
      "#app-details-left, .app-details, [class*='description'], article, .content"
    )
      .first()
      .text()
      .trim()
      .substring(0, 2000) || ""; // cap at 2000 chars

  // Tech stack / "Built With"
  const techStack: string[] = [];
  $(".built-with .cp-tag, [class*='built-with'] a, [class*='built-with'] span, .tag").each(
    (_i, el) => {
      const tech = $(el).text().trim();
      if (tech && tech.length < 50) techStack.push(tech);
    }
  );

  // Team members
  const team: string[] = [];
  $(
    ".software-team-member, [class*='team-member'], [class*='member'] .user-name, .contributors a"
  ).each((_i, el) => {
    const member = $(el).text().trim();
    if (member && member.length < 100) team.push(member);
  });

  // Prizes
  const prizes: string[] = [];
  $(".winner-tag, [class*='prize'], .prize").each((_i, el) => {
    const prize = $(el).text().trim();
    if (prize) prizes.push(prize);
  });

  // Demo video
  const demoVideoUrl =
    $("iframe[src*='youtube'], iframe[src*='vimeo'], video source, [class*='video'] iframe")
      .first()
      .attr("src") ||
    $("a[href*='youtube.com/watch'], a[href*='youtu.be']").first().attr("href") ||
    null;

  // GitHub URL
  const githubUrl =
    $("a[href*='github.com']").first().attr("href") || null;

  return {
    name,
    tagline,
    description,
    tech_stack: techStack,
    team,
    prizes,
    demo_video_url: demoVideoUrl,
    github_url: githubUrl,
    devpost_url: devpostUrl,
  };
}

/**
 * Search across all Devpost projects.
 */
export async function searchProjects(
  query: string,
  sort?: "recent" | "popular"
): Promise<ProjectSearchResult[]> {
  const params = new URLSearchParams();
  params.set("query", query);
  if (sort === "popular") {
    params.set("order_by", "popularity");
  } else if (sort === "recent") {
    params.set("order_by", "newest");
  }

  const url = `https://devpost.com/software/search?${params.toString()}`;
  const html = await fetchPage(url);
  const $ = cheerio.load(html);

  const projects: ProjectSearchResult[] = [];

  // Software entries in search results
  $(
    ".software-entry, .gallery-item, [class*='software'], [class*='project-card']"
  ).each((_i, el) => {
    const $el = $(el);
    const link = $el.find("a[href*='/software/']").first();
    const name =
      $el.find("h2, h3, h4, h5, .entry-title, [class*='title']").first().text().trim() ||
      link.text().trim();
    const href = link.attr("href") || "";
    const tagline =
      $el
        .find("p, .tagline, [class*='tagline'], [class*='subtitle']")
        .first()
        .text()
        .trim() || "";

    const hackathon =
      $el
        .find("[class*='hackathon'], [class*='challenge'], .challenge-name")
        .first()
        .text()
        .trim() || "";

    const techStack: string[] = [];
    $el.find(".cp-tag, .tag, [class*='built-with'] span, [class*='tech']").each(
      (_j, tech) => {
        const techText = $(tech).text().trim();
        if (techText && techText.length < 50) techStack.push(techText);
      }
    );

    const likes =
      $el.find("[class*='like'], [class*='heart'], .vote-count").first().text().trim() || "0";

    if (name) {
      projects.push({
        name,
        tagline,
        url: href.startsWith("http") ? href : `https://devpost.com${href}`,
        hackathon,
        tech_stack: techStack,
        likes,
      });
    }
  });

  return projects;
}
