import { GameController } from '@/application/engine/GameController';
import {
  Action,
  BotGameState,
  GameEvent,
  GameId,
  PlayerId,
  PossibleAction
} from '@/domain/types';

export interface BotAPI {
  getGameState(gameId: GameId, playerId: PlayerId): BotGameState;
  getPossibleActions(gameId: GameId, playerId: PlayerId): PossibleAction[];
  submitAction(gameId: GameId, action: Action): void;
  joinGame(gameId: GameId, playerId: PlayerId, botName: string, chipStack: number): void;
  leaveGame(gameId: GameId, playerId: PlayerId): void;
}

export class BotInterface implements BotAPI {
  private gameController: GameController;

  constructor(gameController: GameController) {
    this.gameController = gameController;
  }

  /**
   * Gets the current game state for a bot
   */
  getGameState(gameId: GameId, playerId: PlayerId): BotGameState {
    return this.gameController.getBotGameState(gameId, playerId);
  }

  /**
   * Gets possible actions for a bot
   */
  getPossibleActions(gameId: GameId, playerId: PlayerId): PossibleAction[] {
    return this.gameController.getPossibleActions(gameId, playerId);
  }

  /**
   * Submits an action for a bot
   */
  submitAction(gameId: GameId, action: Action): void {
    this.gameController.processAction(gameId, action);
  }

  /**
   * Joins a bot to a game
   */
  joinGame(gameId: GameId, playerId: PlayerId, botName: string, chipStack: number): void {
    // Engine requires a positive chip stack. If the caller provides a non-positive
    // value (e.g. bots signalling “use table default”), coerce it to 1 so that
    // the engine validation passes. The precise starting stack can be adjusted
    // later by the game owner via add-chips actions.
    const sanitizedStack = chipStack > 0 ? chipStack : 1;
    this.gameController.addPlayerToGame(gameId, playerId, botName, sanitizedStack);
  }

  /**
   * Removes a bot from a game
   */
  leaveGame(gameId: GameId, playerId: PlayerId): void {
    this.gameController.removePlayerFromGame(gameId, playerId);
  }

  /**
   * Validates if a bot can join a game
   */
  canJoinGame(gameId: GameId, playerId: PlayerId): boolean {
    return this.gameController.canPlayerJoinGame(gameId, playerId);
  }

  /**
   * Finds available games for a bot
   */
  findAvailableGames(maxPlayers?: number) {
    return this.gameController.findAvailableGames(maxPlayers);
  }

  /**
   * Gets game information
   */
  getGameInfo(gameId: GameId) {
    return this.gameController.getGameInfo(gameId);
  }

  /**
   * Lists all games
   */
  listGames() {
    return this.gameController.listGames();
  }

  /**
   * Subscribes to game events
   */
  subscribeToGameEvents(gameId: GameId, callback: (event: GameEvent) => void): void {
    this.gameController.subscribeToGame(gameId, callback);
  }

  /**
   * Unsubscribes from game events
   */
  unsubscribeFromGameEvents(gameId: GameId, callback: (event: GameEvent) => void): void {
    this.gameController.unsubscribeFromGame(gameId, callback);
  }
} 