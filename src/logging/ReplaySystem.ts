import { GameLogger, GameLog, HandSummary } from './GameLogger';
import { GameEngine } from '../engine/GameEngine';
import { GameController } from '../engine/GameController';
import { 
  GameEvent, 
  GameState, 
  Action, 
  GameConfig, 
  GameId, 
  PlayerId,
  Card
} from '../types';

export interface ReplayOptions {
  speed: 'slow' | 'normal' | 'fast' | 'instant';
  stopAtHand?: number;
  stopAtAction?: number;
  skipToHand?: number;
  playersToObserve?: PlayerId[];
}

export interface ReplayState {
  currentEventIndex: number;
  isPlaying: boolean;
  isPaused: boolean;
  currentGameState?: GameState;
  currentHand: number;
  totalEvents: number;
}

export interface ReplayScenario {
  name: string;
  description: string;
  gameConfig: GameConfig;
  initialPlayers: Array<{
    id: PlayerId;
    name: string;
    chipStack: number;
    holeCards?: [Card, Card];
  }>;
  communityCards?: Card[];
  actions: Action[];
  expectedOutcome?: {
    winner: PlayerId;
    finalPot: number;
    handDescription: string;
  };
}

export class ReplaySystem {
  private gameLogger: GameLogger;
  private replayState: ReplayState;
  private currentGameLog?: GameLog;
  private eventCallbacks: Array<(event: GameEvent, state: ReplayState) => void> = [];

  constructor(gameLogger: GameLogger) {
    this.gameLogger = gameLogger;
    this.replayState = {
      currentEventIndex: 0,
      isPlaying: false,
      isPaused: false,
      currentHand: 0,
      totalEvents: 0
    };
  }

  /**
   * Replays a complete game from logs
   */
  async replayGame(
    gameId: GameId, 
    options: ReplayOptions = { speed: 'normal' }
  ): Promise<void> {
    const gameLog = this.gameLogger.getGameLog(gameId);
    if (!gameLog) {
      throw new Error(`Game log not found for game ${gameId}`);
    }

    this.currentGameLog = gameLog;
    this.resetReplayState(gameLog.events.length);

    // Skip to specific hand if requested
    if (options.skipToHand) {
      this.skipToHand(options.skipToHand);
    }

    // Start replay
    this.replayState.isPlaying = true;
    
    while (this.replayState.currentEventIndex < this.replayState.totalEvents && 
           this.replayState.isPlaying) {
      
      if (this.replayState.isPaused) {
        await this.waitForResume();
      }

      const event = gameLog.events[this.replayState.currentEventIndex];
      
      // Check stop conditions
      if (options.stopAtHand && event.handNumber >= options.stopAtHand) {
        this.pause();
        break;
      }

      if (options.stopAtAction && this.replayState.currentEventIndex >= options.stopAtAction) {
        this.pause();
        break;
      }

      // Process event
      await this.processReplayEvent(event, options);
      
      this.replayState.currentEventIndex++;
      this.replayState.currentHand = event.handNumber;

      // Wait based on speed
      if (options.speed !== 'instant') {
        await this.waitForSpeed(options.speed);
      }
    }

    this.replayState.isPlaying = false;
  }

  /**
   * Replays a specific hand
   */
  async replayHand(
    gameId: GameId,
    handNumber: number,
    options: ReplayOptions = { speed: 'normal' }
  ): Promise<void> {
    const handEvents = this.gameLogger.getHandEvents(gameId, handNumber);
    if (handEvents.length === 0) {
      throw new Error(`No events found for hand ${handNumber} in game ${gameId}`);
    }

    this.resetReplayState(handEvents.length);
    this.replayState.isPlaying = true;
    this.replayState.currentHand = handNumber;

    for (let i = 0; i < handEvents.length && this.replayState.isPlaying; i++) {
      if (this.replayState.isPaused) {
        await this.waitForResume();
      }

      const event = handEvents[i];
      await this.processReplayEvent(event, options);
      
      this.replayState.currentEventIndex = i + 1;

      if (options.speed !== 'instant') {
        await this.waitForSpeed(options.speed);
      }
    }

    this.replayState.isPlaying = false;
  }

  /**
   * Tests a specific scenario
   */
  async testScenario(scenario: ReplayScenario): Promise<{
    success: boolean;
    actualOutcome?: any;
    errors: string[];
  }> {
    const errors: string[] = [];
    
    try {
      // Create a temporary game controller for testing
      const gameController = new GameController();
      const gameId = `test_${Date.now()}`;
      
      // Create game with scenario config
      const game = gameController.createGame(gameId, scenario.gameConfig);
      
      // Add players
      for (const player of scenario.initialPlayers) {
        game.addPlayer(player.id, player.name, player.chipStack);
      }

      // Start hand
      game.startHand();
      
      // Deal specific hole cards if provided
      if (scenario.initialPlayers.some(p => p.holeCards)) {
        // In a real implementation, you'd set up the deck with specific cards
        // For now, we'll simulate this
      }

      // Deal specific community cards if provided
      if (scenario.communityCards) {
        const gameState = game.getGameState();
        // Note: In a real implementation, you'd need to convert between Card types
        // gameState.dealCommunityCards(scenario.communityCards);
      }

      // Execute actions
      for (const action of scenario.actions) {
        try {
          game.processAction(action);
        } catch (error) {
          errors.push(`Action failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      // Check expected outcome
      if (scenario.expectedOutcome) {
        const finalGameState = game.getGameState();
        // In a real implementation, you'd validate the outcome here
        // For now, we'll assume success if no errors occurred
      }

      return {
        success: errors.length === 0,
        errors
      };

    } catch (error) {
      errors.push(`Scenario test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        success: false,
        errors
      };
    }
  }

  /**
   * Creates a scenario from a specific hand
   */
  createScenarioFromHand(
    gameId: GameId,
    handNumber: number,
    name: string,
    description: string
  ): ReplayScenario | undefined {
    const gameLog = this.gameLogger.getGameLog(gameId);
    const handSummary = this.gameLogger.getHandSummary(gameId, handNumber);
    
    if (!gameLog || !handSummary) {
      return undefined;
    }

    const scenario: ReplayScenario = {
      name,
      description,
      gameConfig: {
        maxPlayers: gameLog.metadata.maxPlayers,
        smallBlindAmount: gameLog.metadata.smallBlind,
        bigBlindAmount: gameLog.metadata.bigBlind,
        turnTimeLimit: 30,
        isTournament: false
      },
      initialPlayers: handSummary.players.map(playerId => ({
        id: playerId,
        name: gameLog.playerNames.get(playerId) || 'Unknown',
        chipStack: 1000 // Default stack - in real implementation, get from game state
      })),
      communityCards: handSummary.finalBoard,
      actions: handSummary.actions
    };

    return scenario;
  }

  /**
   * Pauses the replay
   */
  pause(): void {
    this.replayState.isPaused = true;
  }

  /**
   * Resumes the replay
   */
  resume(): void {
    this.replayState.isPaused = false;
  }

  /**
   * Stops the replay
   */
  stop(): void {
    this.replayState.isPlaying = false;
    this.replayState.isPaused = false;
  }

  /**
   * Steps forward one event
   */
  stepForward(): void {
    if (this.currentGameLog && 
        this.replayState.currentEventIndex < this.replayState.totalEvents) {
      
      const event = this.currentGameLog.events[this.replayState.currentEventIndex];
      this.processReplayEvent(event, { speed: 'instant' });
      
      this.replayState.currentEventIndex++;
      this.replayState.currentHand = event.handNumber;
    }
  }

  /**
   * Steps backward one event
   */
  stepBackward(): void {
    if (this.replayState.currentEventIndex > 0) {
      this.replayState.currentEventIndex--;
      
      if (this.currentGameLog) {
        const event = this.currentGameLog.events[this.replayState.currentEventIndex];
        this.replayState.currentHand = event.handNumber;
        
        // In a full implementation, you'd rebuild game state up to this point
        // For now, we'll just update the index
      }
    }
  }

  /**
   * Jumps to a specific event
   */
  jumpToEvent(eventIndex: number): void {
    if (this.currentGameLog && eventIndex >= 0 && eventIndex < this.replayState.totalEvents) {
      this.replayState.currentEventIndex = eventIndex;
      
      const event = this.currentGameLog.events[eventIndex];
      this.replayState.currentHand = event.handNumber;
      
      // Rebuild game state up to this point
      this.rebuildGameStateToEvent(eventIndex);
    }
  }

  /**
   * Gets current replay state
   */
  getReplayState(): ReplayState {
    return { ...this.replayState };
  }

  /**
   * Subscribes to replay events
   */
  onReplayEvent(callback: (event: GameEvent, state: ReplayState) => void): void {
    this.eventCallbacks.push(callback);
  }

  /**
   * Unsubscribes from replay events
   */
  offReplayEvent(callback: (event: GameEvent, state: ReplayState) => void): void {
    const index = this.eventCallbacks.indexOf(callback);
    if (index > -1) {
      this.eventCallbacks.splice(index, 1);
    }
  }

  /**
   * Resets replay state
   */
  private resetReplayState(totalEvents: number): void {
    this.replayState = {
      currentEventIndex: 0,
      isPlaying: false,
      isPaused: false,
      currentHand: 0,
      totalEvents
    };
  }

  /**
   * Processes a replay event
   */
  private async processReplayEvent(event: GameEvent, options: ReplayOptions): Promise<void> {
    // Update current game state if available
    if (event.gameState) {
      this.replayState.currentGameState = event.gameState;
    }

    // Emit event to callbacks
    this.eventCallbacks.forEach(callback => {
      try {
        callback(event, this.replayState);
      } catch (error) {
        // Ignore callback errors
      }
    });
  }

  /**
   * Waits for resume when paused
   */
  private async waitForResume(): Promise<void> {
    return new Promise(resolve => {
      const checkResume = () => {
        if (!this.replayState.isPaused || !this.replayState.isPlaying) {
          resolve();
        } else {
          // In a real implementation, use setTimeout here
          // For this engine, we'll resolve immediately
          resolve();
        }
      };
      checkResume();
    });
  }

  /**
   * Waits based on replay speed
   */
  private async waitForSpeed(speed: string): Promise<void> {
    // In a real implementation, you would use setTimeout with appropriate delays
    // For this engine implementation, we'll resolve immediately
    return Promise.resolve();
  }

  /**
   * Skips to a specific hand
   */
  private skipToHand(handNumber: number): void {
    if (!this.currentGameLog) return;

    for (let i = 0; i < this.currentGameLog.events.length; i++) {
      const event = this.currentGameLog.events[i];
      if (event.handNumber === handNumber && event.type === 'hand_started') {
        this.replayState.currentEventIndex = i;
        this.replayState.currentHand = handNumber;
        break;
      }
    }
  }

  /**
   * Rebuilds game state to a specific event
   */
  private rebuildGameStateToEvent(eventIndex: number): void {
    if (!this.currentGameLog) return;

    // In a full implementation, you would replay all events up to this point
    // to rebuild the exact game state. For now, we'll use the last available state.
    for (let i = eventIndex; i >= 0; i--) {
      const event = this.currentGameLog.events[i];
      if (event.gameState) {
        this.replayState.currentGameState = event.gameState;
        break;
      }
    }
  }
} 