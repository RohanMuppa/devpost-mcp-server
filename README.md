# devpost-mcp-server

MCP server that queries [Devpost.com](https://devpost.com), the hackathon platform. Search hackathons, fetch winning projects, analyze tech stack trends, and research what actually wins. Works with Claude Code, Cursor, or any MCP client.

This is not a hackathon project. This is a tool that reads data from the Devpost website.

## What it does

### Data Tools
Raw access to Devpost data.

| Tool | Input | Output |
|------|-------|--------|
| `search_hackathons` | query, status (upcoming/open/ended) | Hackathon names, URLs, dates, participant counts, prizes |
| `get_winners` | hackathon slug (e.g. "hackillinois-2026") | Winning projects with names, taglines, teams, prizes, tech stacks |
| `get_project` | project slug | Full project info: description, team, GitHub URL, demo video, tech stack |
| `search_projects` | query, sort (recent/popular) | Matching projects across all of Devpost |

### Research Tools
Analytical layer on top of the raw data. The part that's actually useful for hackathon prep.

| Tool | Input | Output |
|------|-------|--------|
| `check_idea_exists` | idea description | Similar projects that already exist, how they did, how many times it's been built |
| `analyze_winning_stacks` | hackathon slug | Aggregated tech stacks across winners. "React shows up in 60% of winners" |
| `analyze_sponsor_tracks` | hackathon slug | Submissions per track, win rates, competition density per sponsor |
| `get_submission_template` | hackathon slug or project slug | Structure of a winning submission: sections, tone, length, formatting patterns |
| `compare_hackathons` | two hackathon slugs | Size, prize pool, typical winner profile, tech trends side by side |
| `trending_tools` | time range (optional) | Across recent winners globally: most used APIs, frameworks, tools |

## Use Cases

- "Has someone built an AI interview tool at a hackathon before?"
- "What tech stacks did the last 3 years of HackIllinois winners use?"
- "Which sponsor track at this hackathon had the fewest submissions?"
- "Show me how the winning Devpost submission was formatted"
- "What APIs are trending across hackathon winners right now?"
- "Compare HackIllinois and TreeHacks: size, prizes, what wins"

## Install

Add to your Claude Code MCP settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "devpost": {
      "command": "npx",
      "args": ["devpost-mcp-server"]
    }
  }
}
```

Or for Cursor, add to `.cursor/mcp.json`.

**From source (for development):**
```bash
git clone https://github.com/RohanMuppa/devpost-mcp-server.git
cd devpost-mcp-server
npm install && npm run build
```

## How it works

Devpost doesn't have a public API. This server fetches HTML pages from devpost.com and parses them with [cheerio](https://cheerio.js.org/). Results are cached in memory for 5 minutes to avoid repeated requests. The research tools aggregate data across multiple pages to produce analytical results.

Uses stdio transport per the [MCP specification](https://modelcontextprotocol.io).

## License

MIT
