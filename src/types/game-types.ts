/**
 * Game-related type definitions
 */

import { Card, GameEvent, GameState, HandEvaluation, PlayerId } from './index';

/**
 * Extended game event with additional state information
 */
export interface ExtendedGameEvent extends GameEvent {
  gameStateBefore?: GameState;
  gameStateAfter?: GameState;
  communityCards?: Card[];
  winners?: WinnerInfo[];
}

/**
 * Winner information for game events
 */
export interface WinnerInfo {
  playerId: PlayerId;
  winAmount: number;
  amount?: number;
  handEvaluation?: HandEvaluation;
  handDescription?: string;
  description?: string;
}

/**
 * Interesting moment types for replay analysis
 */
export interface InterestingMoment {
  sequenceId: number;
  type: 'big_pot' | 'all_in' | 'bluff' | 'bad_beat' | 'hero_call';
  description: string;
  involvedPlayers: PlayerId[];
  potSize?: number;
  timestamp: number;
}

/**
 * Game state with visibility methods
 */
export interface GameStateWithVisibility extends GameState {
  getStateWithVisibility(viewerType: 'player' | 'spectator' | 'replay', playerId?: PlayerId): GameState;
}

/**
 * Type guards
 */
export function isGameStateWithVisibility(state: unknown): state is GameStateWithVisibility {
  return (
    typeof state === 'object' &&
    state !== null &&
    'getStateWithVisibility' in state &&
    typeof (state as GameStateWithVisibility).getStateWithVisibility === 'function'
  );
}

export function isExtendedGameEvent(event: GameEvent): event is ExtendedGameEvent {
  return 'gameStateBefore' in event || 'gameStateAfter' in event;
}