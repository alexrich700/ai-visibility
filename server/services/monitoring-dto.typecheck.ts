/**
 * Compile-time contract assertions for shared monitoring DTOs.
 *
 * These declarations are intentionally unused at runtime; they fail `tsc` if
 * shared DTO contracts drift. This file is picked up by the root tsconfig
 * `include` glob for the server directory tree.
 */
import type {
  CompetitorVisibility,
  MonitoringDashboardData,
  SentimentStatements,
} from "@shared/monitoring-dto";
import type { CheckResult, CheckSession, MonitoringClient, MonitoringGroup } from "@shared/schema";
import type { computeCompetitorVisibility } from "./scan-analytics";

type Assert<T extends true> = T;
type IsAssignable<From, To> = [From] extends [To] ? true : false;
type IsExactly<Left, Right> = IsAssignable<Left, Right> extends true
  ? IsAssignable<Right, Left> extends true
    ? true
    : false
  : false;

// Shared dashboard DTO should stay exactly aligned with core model entities.
type _DashboardClientExactlyMatches = Assert<
  IsExactly<MonitoringDashboardData["client"], MonitoringClient>
>;
type _DashboardGroupsExactlyMatch = Assert<
  IsExactly<MonitoringDashboardData["groups"], MonitoringGroup[]>
>;
type _DashboardSessionsExactlyMatch = Assert<
  IsExactly<MonitoringDashboardData["sessions"], CheckSession[]>
>;
type _DashboardResultsExactlyMatch = Assert<
  IsExactly<MonitoringDashboardData["latestResults"], CheckResult[]>
>;

// Server analytics return type should remain exactly compatible with shared DTO.
type _ServerCompetitorVisibilityExactlyMatchesShared = Assert<
  IsExactly<ReturnType<typeof computeCompetitorVisibility>[number], CompetitorVisibility>
>;

// Sentiment statements are shared across client/server and platform union must stay strict.
type _SentimentPlatformNoNarrowing = Assert<
  IsAssignable<SentimentStatements["positive"][number]["platform"], "chatgpt" | "google">
>;
type _SentimentPlatformNoExpansion = Assert<
  IsAssignable<"chatgpt" | "google", SentimentStatements["positive"][number]["platform"]>
>;
