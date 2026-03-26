import * as cheerio from "cheerio";
import type {
  Hackathon,
  HackathonWinner,
  ProjectDetails,
  ProjectSearchResult,
  CacheEntry,
  IdeaCheck,
  WinningStackAnalysis,
  TechFrequency,
  SponsorTrackAnalysis,
  TrackAnalysis,
  SubmissionTemplate,
  SubmissionSection,
  HackathonComparison,
  TrendingToolsAnalysis,
  TrendingTool,
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

/**
 * Check if a project idea already exists on Devpost.
 * Searches for similar projects and returns top matches with details.
 */
export async function checkIdeaExists(idea: string): Promise<IdeaCheck[]> {
  const searchResults = await searchProjects(idea);
  const top5 = searchResults.slice(0, 5);

  const results: IdeaCheck[] = [];
  for (const result of top5) {
    // Extract slug from URL: https://devpost.com/software/my-project -> my-project
    const slug = result.url.split("/software/").pop() || "";
    if (!slug) continue;

    try {
      const details = await getProjectDetails(slug);
      results.push({
        name: details.name,
        hackathon: result.hackathon,
        tagline: details.tagline,
        prizes_won: details.prizes,
        tech_stack: details.tech_stack,
        url: details.devpost_url,
      });
    } catch {
      // If we can't fetch details, use search result data
      results.push({
        name: result.name,
        hackathon: result.hackathon,
        tagline: result.tagline,
        prizes_won: [],
        tech_stack: result.tech_stack,
        url: result.url,
      });
    }
  }

  return results;
}

/**
 * Analyze winning tech stacks for a hackathon.
 * Fetches all winners, gets their full tech stacks, and aggregates frequency counts.
 */
export async function analyzeWinningStacks(
  hackathonSlug: string
): Promise<WinningStackAnalysis> {
  const winners = await getHackathonWinners(hackathonSlug);

  const techCounts = new Map<string, number>();
  let winnersWithTech = 0;

  for (const winner of winners) {
    // Try to get full project details for richer tech stack info
    const slug = winner.url.split("/software/").pop() || "";
    let techStack = winner.tech_stack;

    if (slug) {
      try {
        const details = await getProjectDetails(slug);
        if (details.tech_stack.length > 0) {
          techStack = details.tech_stack;
        }
      } catch {
        // Fall back to winner's tech_stack from gallery
      }
    }

    if (techStack.length > 0) {
      winnersWithTech++;
      for (const tech of techStack) {
        const normalized = tech.toLowerCase().trim();
        if (normalized) {
          techCounts.set(normalized, (techCounts.get(normalized) || 0) + 1);
        }
      }
    }
  }

  const totalWinners = winnersWithTech || 1; // avoid division by zero
  const techFrequency: TechFrequency[] = Array.from(techCounts.entries())
    .map(([tech, count]) => ({
      tech,
      count,
      percentage: Math.round((count / totalWinners) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  // Most common stack: top 5 technologies
  const mostCommonStack = techFrequency.slice(0, 5).map((t) => t.tech);

  return {
    hackathon: hackathonSlug,
    winner_count: winners.length,
    tech_frequency: techFrequency,
    most_common_stack: mostCommonStack,
  };
}

/**
 * Analyze sponsor tracks for a hackathon.
 * Fetches the hackathon main page for prize/track info and cross-references with winners.
 */
export async function analyzeSponsorTracks(
  hackathonSlug: string
): Promise<SponsorTrackAnalysis> {
  // Fetch main hackathon page for prize/track info
  const mainPageHtml = await fetchPage(
    `https://${hackathonSlug}.devpost.com`
  );
  const $main = cheerio.load(mainPageHtml);

  // Fetch winners to cross-reference
  const winners = await getHackathonWinners(hackathonSlug);

  // Parse prize/track sections from the main page
  const tracks: TrackAnalysis[] = [];
  const seenTracks = new Set<string>();

  // Look for prize listings on the main page
  $main(
    ".prize, [class*='prize'], .challenge-prize, [id*='prize'], [class*='track']"
  ).each((_i, el) => {
    const $el = $main(el);
    const trackName =
      $el.find("h2, h3, h4, h5, .prize-title, [class*='title']").first().text().trim() ||
      $el.find("strong, b").first().text().trim() ||
      $el.text().trim().split("\n")[0]?.trim() ||
      "";

    if (!trackName || trackName.length > 200 || seenTracks.has(trackName)) return;
    seenTracks.add(trackName);

    const sponsor =
      $el.find("[class*='sponsor'], .sponsor").first().text().trim() || "";
    const prize =
      $el.find("[class*='amount'], [class*='value'], .prize-amount").first().text().trim() ||
      $el.find("p").first().text().trim() ||
      "";

    // Count how many winners won this track
    const winnerCount = winners.filter((w) =>
      w.prizes_won.some(
        (p) =>
          p.toLowerCase().includes(trackName.toLowerCase()) ||
          trackName.toLowerCase().includes(p.toLowerCase())
      )
    ).length;

    tracks.push({
      track_name: trackName,
      sponsor,
      prize,
      winner_count: winnerCount,
    });
  });

  // If no tracks found from main page, derive from winner prizes
  if (tracks.length === 0) {
    const prizeMap = new Map<string, number>();
    for (const winner of winners) {
      for (const prize of winner.prizes_won) {
        const normalized = prize.trim();
        if (normalized) {
          prizeMap.set(normalized, (prizeMap.get(normalized) || 0) + 1);
        }
      }
    }
    for (const [prizeName, count] of prizeMap.entries()) {
      tracks.push({
        track_name: prizeName,
        sponsor: "",
        prize: "",
        winner_count: count,
      });
    }
  }

  return {
    hackathon: hackathonSlug,
    tracks,
  };
}

/**
 * Get a submission template by analyzing a winning project's structure.
 * Fetches full description HTML and parses sections by headers.
 */
export async function getSubmissionTemplate(
  projectSlug: string
): Promise<SubmissionTemplate> {
  const devpostUrl = `https://devpost.com/software/${projectSlug}`;
  const html = await fetchPage(devpostUrl);
  const $ = cheerio.load(html);

  const projectName =
    $("h1, #app-title, [id*='title']").first().text().trim() || projectSlug;

  // Get the FULL description HTML (not capped at 2000 chars)
  const descriptionEl = $(
    "#app-details-left, .app-details, [class*='description'], article, .content"
  ).first();
  const descriptionHtml = descriptionEl.html() || "";
  const fullText = descriptionEl.text().trim();

  // Parse sections by h2/h3 headers
  const sections: SubmissionSection[] = [];
  const formattingNotes: string[] = [];

  // Split description by headers
  const $desc = cheerio.load(descriptionHtml);
  const headers = $desc("h2, h3");

  if (headers.length > 0) {
    headers.each((_i, el) => {
      const $header = $desc(el);
      const heading = $header.text().trim();

      // Collect content until next header
      let sectionHtml = "";
      let next = $header.next();
      while (next.length > 0 && !next.is("h2, h3")) {
        sectionHtml += $desc.html(next) || "";
        next = next.next();
      }

      const $section = cheerio.load(sectionHtml);
      const sectionText = $section.root().text().trim();
      const wordCount = sectionText.split(/\s+/).filter((w) => w.length > 0).length;
      const hasImages = $section("img").length > 0;
      const hasCodeBlocks = $section("code, pre").length > 0;

      sections.push({
        heading,
        word_count: wordCount,
        has_images: hasImages,
        has_code_blocks: hasCodeBlocks,
      });
    });
  } else {
    // No headers found - treat entire description as one section
    const wordCount = fullText.split(/\s+/).filter((w) => w.length > 0).length;
    sections.push({
      heading: "(no headers - single block)",
      word_count: wordCount,
      has_images: $desc("img").length > 0,
      has_code_blocks: $desc("code, pre").length > 0,
    });
  }

  const totalWordCount = fullText.split(/\s+/).filter((w) => w.length > 0).length;

  // Detect formatting patterns
  if ($desc("img").length > 0) {
    formattingNotes.push(`Includes ${$desc("img").length} image(s)`);
  }
  if ($desc("code, pre").length > 0) {
    formattingNotes.push("Includes code blocks");
  }
  if ($desc("strong, b").length > 0) {
    formattingNotes.push("Uses bold text for emphasis");
  }
  if ($desc("ul, ol").length > 0) {
    formattingNotes.push("Uses bullet/numbered lists");
  }
  if ($desc("a[href]").length > 0) {
    formattingNotes.push("Includes hyperlinks");
  }
  if (headers.length > 0) {
    formattingNotes.push(`${headers.length} section header(s) found`);
  }

  return {
    project_name: projectName,
    sections,
    total_word_count: totalWordCount,
    formatting_notes: formattingNotes,
  };
}

/**
 * Compare two hackathons side by side.
 * Fetches data and winners for both, compares stats and tech stacks.
 */
export async function compareHackathons(
  slugA: string,
  slugB: string
): Promise<HackathonComparison> {
  // Helper to gather hackathon info
  async function gatherInfo(slug: string) {
    const hackathons = await searchHackathons(slug);
    const info = hackathons.find(
      (h) => h.url.includes(slug)
    ) || hackathons[0] || { name: slug, participants_count: "", prizes: "" };

    const winners = await getHackathonWinners(slug);

    // Aggregate tech stacks
    const techCounts = new Map<string, number>();
    for (const winner of winners) {
      for (const tech of winner.tech_stack) {
        const normalized = tech.toLowerCase().trim();
        if (normalized) {
          techCounts.set(normalized, (techCounts.get(normalized) || 0) + 1);
        }
      }
    }

    const topTechs = Array.from(techCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tech]) => tech);

    return {
      name: info.name,
      participants: info.participants_count,
      prizes: info.prizes,
      winner_count: winners.length,
      top_techs: topTechs,
    };
  }

  const [infoA, infoB] = await Promise.all([
    gatherInfo(slugA),
    gatherInfo(slugB),
  ]);

  const techSetA = new Set(infoA.top_techs);
  const techSetB = new Set(infoB.top_techs);

  const sharedTechs = infoA.top_techs.filter((t) => techSetB.has(t));
  const uniqueToA = infoA.top_techs.filter((t) => !techSetB.has(t));
  const uniqueToB = infoB.top_techs.filter((t) => !techSetA.has(t));

  const sizeDiff =
    infoA.winner_count !== infoB.winner_count
      ? `${infoA.name} had ${infoA.winner_count} winners vs ${infoB.name} with ${infoB.winner_count} winners`
      : `Both hackathons had ${infoA.winner_count} winners`;

  return {
    hackathon_a: infoA,
    hackathon_b: infoB,
    comparison: {
      size_difference: sizeDiff,
      shared_techs: sharedTechs,
      unique_to_a: uniqueToA,
      unique_to_b: uniqueToB,
    },
  };
}

/**
 * Analyze trending tools across recent hackathon winners.
 * Scans winners across N recent ended hackathons and aggregates tech frequency.
 */
export async function trendingTools(
  count: number = 10
): Promise<TrendingToolsAnalysis> {
  // Get recent ended hackathons
  const hackathons = await searchHackathons("", "ended");
  const toScan = hackathons.slice(0, count);

  const globalTechCounts = new Map<string, { count: number; examples: string[] }>();
  let totalWinners = 0;

  for (const hackathon of toScan) {
    // Extract slug from URL: https://slug.devpost.com -> slug
    const urlMatch = hackathon.url.match(/https?:\/\/([^.]+)\.devpost\.com/);
    const slug = urlMatch?.[1];
    if (!slug) continue;

    try {
      const winners = await getHackathonWinners(slug);
      totalWinners += winners.length;

      for (const winner of winners) {
        for (const tech of winner.tech_stack) {
          const normalized = tech.toLowerCase().trim();
          if (!normalized) continue;

          const existing = globalTechCounts.get(normalized) || {
            count: 0,
            examples: [],
          };
          existing.count++;
          if (existing.examples.length < 3) {
            existing.examples.push(winner.name);
          }
          globalTechCounts.set(normalized, existing);
        }
      }
    } catch {
      // Skip hackathons that fail to load
    }
  }

  const totalForPercentage = totalWinners || 1;
  const trending: TrendingTool[] = Array.from(globalTechCounts.entries())
    .map(([tech, data]) => ({
      tech,
      count: data.count,
      percentage: Math.round((data.count / totalForPercentage) * 100),
      example_projects: data.examples,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    hackathons_scanned: toScan.length,
    total_winners_analyzed: totalWinners,
    trending,
  };
}
