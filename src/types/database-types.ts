/**
 * Database and storage-related type definitions
 */

import { ReplayEvent, ReplayMetadata } from './index';

/**
 * MongoDB Replay types
 */
export interface MongoReplay {
  _id: string;
  gameId: string;
  events: MongoReplayEvent[];
  metadata: ReplayMetadata;
  createdAt: Date;
  updatedAt?: Date;
  analytics?: {
    avgHandDuration?: number;
    totalEvents?: number;
  };
  version?: string;
}

export interface MongoReplayEvent {
  sequenceId: number;
  type: string;
  timestamp: number;
  phase?: string;
  handNumber?: number;
  playerId?: string;
  data: ReplayEvent;
}

/**
 * Database query types
 */
export interface DatabaseQuery {
  [key: string]: unknown;
}

/**
 * Error types
 */
export interface TypedError extends Error {
  code?: string;
  statusCode?: number;
  details?: unknown;
}

/**
 * Type guard for typed errors
 */
export function isTypedError(error: unknown): error is TypedError {
  return error instanceof Error;
}