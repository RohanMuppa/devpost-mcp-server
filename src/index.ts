#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  searchHackathons,
  getHackathonWinners,
  getProjectDetails,
  searchProjects,
} from "./scraper.js";

const server = new McpServer({
  name: "devpost",
  version: "0.1.0",
});

// --- Tool: search_hackathons ---
server.tool(
  "search_hackathons",
  "Search for hackathons on Devpost. Returns name, URL, dates, participant count, prizes, and status.",
  {
    query: z.string().describe("Search query for hackathons"),
    status: z
      .enum(["upcoming", "open", "ended"])
      .optional()
      .describe("Filter by hackathon status"),
  },
  async ({ query, status }) => {
    try {
      const results = await searchHackathons(query, status);
      if (results.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No hackathons found for query "${query}"${status ? ` with status "${status}"` : ""}. Try broadening your search.`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error searching hackathons: ${error instanceof Error ? error.message : "Could not parse Devpost response"}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --- Tool: get_hackathon_winners ---
server.tool(
  "get_hackathon_winners",
  "Get winning projects from a specific hackathon on Devpost. Provide the hackathon slug (e.g., 'hackillinois-2026').",
  {
    hackathon_slug: z
      .string()
      .describe(
        'The hackathon slug from the Devpost URL, e.g., "hackillinois-2026" from hackillinois-2026.devpost.com'
      ),
  },
  async ({ hackathon_slug }) => {
    try {
      const results = await getHackathonWinners(hackathon_slug);
      if (results.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No winners found for hackathon "${hackathon_slug}". The hackathon may not have announced winners yet, or the slug may be incorrect.`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error fetching hackathon winners: ${error instanceof Error ? error.message : "Could not parse Devpost response"}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --- Tool: get_project_details ---
server.tool(
  "get_project_details",
  "Get full details of a Devpost project including description, tech stack, team, prizes, demo video, and GitHub link.",
  {
    project_slug: z
      .string()
      .describe(
        'The project slug from the Devpost URL, e.g., "my-project" from devpost.com/software/my-project'
      ),
  },
  async ({ project_slug }) => {
    try {
      const result = await getProjectDetails(project_slug);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error fetching project details: ${error instanceof Error ? error.message : "Could not parse Devpost response"}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --- Tool: search_projects ---
server.tool(
  "search_projects",
  "Search across all Devpost projects. Returns name, tagline, URL, hackathon, tech stack, and likes.",
  {
    query: z.string().describe("Search query for projects"),
    sort: z
      .enum(["recent", "popular"])
      .optional()
      .describe("Sort order: recent or popular"),
  },
  async ({ query, sort }) => {
    try {
      const results = await searchProjects(query, sort);
      if (results.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No projects found for query "${query}". Try different keywords.`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error searching projects: ${error instanceof Error ? error.message : "Could not parse Devpost response"}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --- Start the server ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Devpost MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
