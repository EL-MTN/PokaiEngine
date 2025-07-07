import { GameEvent, GameState, Action, Card, HandEvaluation, GameId, PlayerId } from '../types';

export interface GameLog {
  gameId: GameId;
  startTime: number;
  endTime?: number;
  events: GameEvent[];
  playerNames: Map<PlayerId, string>;
  initialGameState: GameState;
  finalGameState?: GameState;
  metadata: {
    smallBlind: number;
    bigBlind: number;
    maxPlayers: number;
    handCount: number;
  };
}

export interface HandSummary {
  handNumber: number;
  startTime: number;
  endTime: number;
  players: PlayerId[];
  winner?: PlayerId;
  winAmount?: number;
  finalBoard: Card[];
  handEvaluations?: Map<PlayerId, HandEvaluation>;
  actions: Action[];
}

export class GameLogger {
  private logs: Map<GameId, GameLog> = new Map();
  private currentGameStates: Map<GameId, GameState> = new Map();

  /**
   * Starts logging for a new game
   */
  startGame(
    gameId: GameId,
    initialGameState: GameState,
    playerNames: Map<PlayerId, string>
  ): void {
    const gameLog: GameLog = {
      gameId,
      startTime: Date.now(),
      events: [],
      playerNames: new Map(playerNames),
      initialGameState: this.cloneGameState(initialGameState),
      metadata: {
        smallBlind: initialGameState.smallBlindAmount,
        bigBlind: initialGameState.bigBlindAmount,
        maxPlayers: initialGameState.players.length,
        handCount: 0
      }
    };

    this.logs.set(gameId, gameLog);
    this.currentGameStates.set(gameId, this.cloneGameState(initialGameState));
  }

  /**
   * Logs a game event
   */
  logEvent(gameId: GameId, event: GameEvent): void {
    const gameLog = this.logs.get(gameId);
    if (!gameLog) {
      throw new Error(`No log found for game ${gameId}`);
    }

    // Add event to log
    gameLog.events.push(this.cloneEvent(event));

    // Update current game state if provided
    if (event.gameState) {
      this.currentGameStates.set(gameId, this.cloneGameState(event.gameState));
    }

    // Track hand count
    if (event.type === 'hand_started') {
      gameLog.metadata.handCount++;
    }
  }

  /**
   * Ends logging for a game
   */
  endGame(gameId: GameId, finalGameState: GameState): void {
    const gameLog = this.logs.get(gameId);
    if (!gameLog) {
      throw new Error(`No log found for game ${gameId}`);
    }

    gameLog.endTime = Date.now();
    gameLog.finalGameState = this.cloneGameState(finalGameState);
  }

  /**
   * Gets the complete log for a game
   */
  getGameLog(gameId: GameId): GameLog | undefined {
    return this.logs.get(gameId);
  }

  /**
   * Gets all game logs
   */
  getAllLogs(): GameLog[] {
    return Array.from(this.logs.values());
  }

  /**
   * Gets events for a specific game
   */
  getGameEvents(gameId: GameId): GameEvent[] {
    const gameLog = this.logs.get(gameId);
    return gameLog ? [...gameLog.events] : [];
  }

  /**
   * Gets events for a specific hand
   */
  getHandEvents(gameId: GameId, handNumber: number): GameEvent[] {
    const gameLog = this.logs.get(gameId);
    if (!gameLog) {
      return [];
    }

    return gameLog.events.filter(event => event.handNumber === handNumber);
  }

  /**
   * Gets a summary of a specific hand
   */
  getHandSummary(gameId: GameId, handNumber: number): HandSummary | undefined {
    const handEvents = this.getHandEvents(gameId, handNumber);
    if (handEvents.length === 0) {
      return undefined;
    }

    const startEvent = handEvents.find(e => e.type === 'hand_started');
    const endEvent = handEvents.find(e => e.type === 'hand_complete');
    const actions = handEvents
      .filter(e => e.action)
      .map(e => e.action!)
      .filter(a => a !== undefined);

    if (!startEvent || !endEvent) {
      return undefined;
    }

    const summary: HandSummary = {
      handNumber,
      startTime: startEvent.timestamp,
      endTime: endEvent.timestamp,
      players: this.getPlayersInHand(handEvents),
      finalBoard: this.getFinalBoard(handEvents),
      actions
    };

    // Try to determine winner from showdown event
    const showdownEvent = handEvents.find(e => e.type === 'showdown_complete');
    if (showdownEvent && showdownEvent.gameState) {
      // In a real implementation, you'd extract winner info from the game state
      // For now, we'll leave it undefined
    }

    return summary;
  }

  /**
   * Gets all hand summaries for a game
   */
  getGameHandSummaries(gameId: GameId): HandSummary[] {
    const gameLog = this.logs.get(gameId);
    if (!gameLog) {
      return [];
    }

    const summaries: HandSummary[] = [];
    for (let handNumber = 1; handNumber <= gameLog.metadata.handCount; handNumber++) {
      const summary = this.getHandSummary(gameId, handNumber);
      if (summary) {
        summaries.push(summary);
      }
    }

    return summaries;
  }

  /**
   * Exports game log to JSON
   */
  exportGameLog(gameId: GameId): string | undefined {
    const gameLog = this.logs.get(gameId);
    if (!gameLog) {
      return undefined;
    }

    // Convert Maps to objects for JSON serialization
    const exportData = {
      ...gameLog,
      playerNames: Object.fromEntries(gameLog.playerNames),
      handSummaries: this.getGameHandSummaries(gameId)
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Imports game log from JSON
   */
  importGameLog(jsonData: string): GameId | undefined {
    try {
      const data = JSON.parse(jsonData);
      
      const gameLog: GameLog = {
        ...data,
        playerNames: new Map(Object.entries(data.playerNames))
      };

      this.logs.set(gameLog.gameId, gameLog);
      return gameLog.gameId;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Gets statistics for a game
   */
  getGameStatistics(gameId: GameId): {
    totalHands: number;
    totalActions: number;
    playerStats: Map<PlayerId, {
      handsPlayed: number;
      actionsCount: number;
      avgActionTime: number;
    }>;
    gameLength: number;
  } | undefined {
    const gameLog = this.logs.get(gameId);
    if (!gameLog) {
      return undefined;
    }

    const playerStats = new Map<PlayerId, {
      handsPlayed: number;
      actionsCount: number;
      avgActionTime: number;
    }>();

    // Initialize player stats
    for (const playerId of gameLog.playerNames.keys()) {
      playerStats.set(playerId, {
        handsPlayed: 0,
        actionsCount: 0,
        avgActionTime: 0
      });
    }

    // Calculate statistics from events
    let totalActions = 0;
    const actionTimes: number[] = [];
    let lastActionTime = 0;

    for (const event of gameLog.events) {
      if (event.action && event.playerId) {
        const stats = playerStats.get(event.playerId);
        if (stats) {
          stats.actionsCount++;
          totalActions++;

          if (lastActionTime > 0) {
            const actionTime = event.timestamp - lastActionTime;
            actionTimes.push(actionTime);
          }
          lastActionTime = event.timestamp;
        }
      }

      if (event.type === 'hand_started' && event.playerId) {
        const stats = playerStats.get(event.playerId);
        if (stats) {
          stats.handsPlayed++;
        }
      }
    }

    // Calculate average action times
    for (const [playerId, stats] of playerStats) {
      if (stats.actionsCount > 0) {
        const playerActionTimes = actionTimes.slice(0, stats.actionsCount);
        stats.avgActionTime = playerActionTimes.reduce((sum, time) => sum + time, 0) / playerActionTimes.length;
      }
    }

    const gameLength = gameLog.endTime ? gameLog.endTime - gameLog.startTime : Date.now() - gameLog.startTime;

    return {
      totalHands: gameLog.metadata.handCount,
      totalActions,
      playerStats,
      gameLength
    };
  }

  /**
   * Clears logs older than a specified time
   */
  clearOldLogs(olderThanMs: number): number {
    const cutoffTime = Date.now() - olderThanMs;
    let removedCount = 0;

    for (const [gameId, log] of this.logs) {
      if (log.startTime < cutoffTime) {
        this.logs.delete(gameId);
        this.currentGameStates.delete(gameId);
        removedCount++;
      }
    }

    return removedCount;
  }

  /**
   * Helper method to clone game state
   */
  private cloneGameState(gameState: GameState): GameState {
    return JSON.parse(JSON.stringify(gameState));
  }

  /**
   * Helper method to clone event
   */
  private cloneEvent(event: GameEvent): GameEvent {
    return JSON.parse(JSON.stringify(event));
  }

  /**
   * Extracts players from hand events
   */
  private getPlayersInHand(handEvents: GameEvent[]): PlayerId[] {
    const players = new Set<PlayerId>();
    
    for (const event of handEvents) {
      if (event.playerId) {
        players.add(event.playerId);
      }
      if (event.gameState) {
        for (const player of event.gameState.players) {
          players.add(player.id);
        }
      }
    }

    return Array.from(players);
  }

  /**
   * Extracts final board from hand events
   */
  private getFinalBoard(handEvents: GameEvent[]): Card[] {
    for (let i = handEvents.length - 1; i >= 0; i--) {
      const event = handEvents[i];
      if (event.gameState && event.gameState.communityCards.length > 0) {
        return event.gameState.communityCards;
      }
    }
    return [];
  }
} 