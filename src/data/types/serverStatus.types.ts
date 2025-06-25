/**
 * Server status types for monitoring server health
 */

export type ServerLevel = "normal" | "warning" | "error" | "unknown";

export interface ServerStatus {
  serverId: string;
  serverName: string;
  lastUpdated: string;
  level: ServerLevel;
  message: string;
  error?: string;
}

export interface ServerStatusResponse {
  overall: {
    level: ServerLevel;
    message: string;
    updatedAt: string;
  };
  servers: ServerStatus[];
  hasActiveIncidents: boolean;
}

export interface ServerStatusSummary {
  isNextJSAppDown: boolean;
  hasServerIssues: boolean;
  overallLevel: ServerLevel;
  message: string;
  serverIssues: ServerStatus[];
}
