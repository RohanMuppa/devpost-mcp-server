/** A hackathon listing from Devpost */
export interface Hackathon {
  name: string;
  url: string;
  dates: string;
  participants_count: string;
  prizes: string;
  status: string;
}

/** A winning project from a hackathon */
export interface HackathonWinner {
  name: string;
  tagline: string;
  url: string;
  team_members: string[];
  prizes_won: string[];
  tech_stack: string[];
  likes: string;
}

/** Full details for a single Devpost project */
export interface ProjectDetails {
  name: string;
  tagline: string;
  description: string;
  tech_stack: string[];
  team: string[];
  prizes: string[];
  demo_video_url: string | null;
  github_url: string | null;
  devpost_url: string;
}

/** A project from search results */
export interface ProjectSearchResult {
  name: string;
  tagline: string;
  url: string;
  hackathon: string;
  tech_stack: string[];
  likes: string;
}

/** In-memory cache entry */
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
