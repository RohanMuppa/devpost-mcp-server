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

/** A similar project found during idea checking */
export interface IdeaCheck {
  name: string;
  hackathon: string;
  tagline: string;
  prizes_won: string[];
  tech_stack: string[];
  url: string;
}

/** Frequency count of a single technology */
export interface TechFrequency {
  tech: string;
  count: number;
  percentage: number;
}

/** Aggregated tech stack analysis for a hackathon's winners */
export interface WinningStackAnalysis {
  hackathon: string;
  winner_count: number;
  tech_frequency: TechFrequency[];
  most_common_stack: string[];
}

/** A single sponsor/prize track */
export interface TrackAnalysis {
  track_name: string;
  sponsor: string;
  prize: string;
  winner_count: number;
}

/** Sponsor track analysis for a hackathon */
export interface SponsorTrackAnalysis {
  hackathon: string;
  tracks: TrackAnalysis[];
}

/** A section of a project submission */
export interface SubmissionSection {
  heading: string;
  word_count: number;
  has_images: boolean;
  has_code_blocks: boolean;
}

/** Template analysis of a winning project's submission */
export interface SubmissionTemplate {
  project_name: string;
  sections: SubmissionSection[];
  total_word_count: number;
  formatting_notes: string[];
}

/** Side-by-side comparison of two hackathons */
export interface HackathonComparison {
  hackathon_a: { name: string; participants: string; prizes: string; winner_count: number; top_techs: string[] };
  hackathon_b: { name: string; participants: string; prizes: string; winner_count: number; top_techs: string[] };
  comparison: { size_difference: string; shared_techs: string[]; unique_to_a: string[]; unique_to_b: string[] };
}

/** A single trending technology */
export interface TrendingTool {
  tech: string;
  count: number;
  percentage: number;
  example_projects: string[];
}

/** Aggregated trending tools analysis across hackathons */
export interface TrendingToolsAnalysis {
  hackathons_scanned: number;
  total_winners_analyzed: number;
  trending: TrendingTool[];
}
