import { GameEngine } from './GameEngine';
import {
	GameConfig,
	GameId,
	PlayerId,
	Action,
	GameEvent,
	BotGameState,
	PossibleAction,
} from '../types';

export interface GameInfo {
	id: GameId;
	playerCount: number;
	maxPlayers: number;
	isRunning: boolean;
	currentHand: number;
	smallBlind: number;
	bigBlind: number;
}

export class GameController {
	private games: Map<GameId, GameEngine> = new Map();
	private playerGameMap: Map<PlayerId, GameId> = new Map();
	private eventCallbacks: Map<GameId, ((event: GameEvent) => void)[]> = new Map();

	/**
	 * Creates a new game
	 */
	createGame(gameId: GameId, config: GameConfig): GameEngine {
		if (this.games.has(gameId)) {
			throw new Error(`Game with ID ${gameId} already exists`);
		}

		const game = new GameEngine(gameId, config);
		this.games.set(gameId, game);
		this.eventCallbacks.set(gameId, []);

		// Subscribe to game events
		game.onEvent((event) => {
			this.handleGameEvent(gameId, event);
		});

		return game;
	}

	/**
	 * Removes a game
	 */
	removeGame(gameId: GameId): void {
		const game = this.games.get(gameId);
		if (!game) {
			throw new Error(`Game with ID ${gameId} not found`);
		}

		// Remove all players from the game mapping
		for (const [playerId, playerGameId] of this.playerGameMap) {
			if (playerGameId === gameId) {
				this.playerGameMap.delete(playerId);
			}
		}

		// Clean up
		this.games.delete(gameId);
		this.eventCallbacks.delete(gameId);
	}

	/**
	 * Gets a game by ID
	 */
	getGame(gameId: GameId): GameEngine | undefined {
		return this.games.get(gameId);
	}

	/**
	 * Gets all games
	 */
	getAllGames(): GameEngine[] {
		return Array.from(this.games.values());
	}

	/**
	 * Gets game information
	 */
	getGameInfo(gameId: GameId): GameInfo | undefined {
		const game = this.games.get(gameId);
		if (!game) {
			return undefined;
		}

		const gameState = game.getGameState();
		const config = game['config']; // Access private config via bracket notation

		return {
			id: gameId,
			playerCount: gameState.getActivePlayers().length,
			maxPlayers: config.maxPlayers,
			isRunning: game.isGameRunning(),
			currentHand: gameState.handNumber,
			smallBlind: gameState.smallBlindAmount,
			bigBlind: gameState.bigBlindAmount,
		};
	}

	/**
	 * Lists all games with their basic information
	 */
	listGames(): GameInfo[] {
		return Array.from(this.games.keys())
			.map((gameId) => this.getGameInfo(gameId))
			.filter((info) => info !== undefined) as GameInfo[];
	}

	/**
	 * Adds a player to a game
	 */
	addPlayerToGame(
		gameId: GameId,
		playerId: PlayerId,
		playerName: string,
		chipStack: number
	): void {
		const game = this.games.get(gameId);
		if (!game) {
			throw new Error(`Game with ID ${gameId} not found`);
		}

		// Check if player is already in another game
		if (this.playerGameMap.has(playerId)) {
			throw new Error(`Player ${playerId} is already in a game`);
		}

		game.addPlayer(playerId, playerName, chipStack);
		this.playerGameMap.set(playerId, gameId);
	}

	/**
	 * Removes a player from a game
	 */
	removePlayerFromGame(gameId: GameId, playerId: PlayerId): void {
		const game = this.games.get(gameId);
		if (!game) {
			throw new Error(`Game with ID ${gameId} not found`);
		}

		game.removePlayer(playerId);
		this.playerGameMap.delete(playerId);
	}

	/**
	 * Starts a hand in a game
	 */
	startHand(gameId: GameId): void {
		const game = this.games.get(gameId);
		if (!game) {
			throw new Error(`Game with ID ${gameId} not found`);
		}

		game.startHand();
	}

	/**
	 * Processes a player action
	 */
	processAction(gameId: GameId, action: Action): void {
		const game = this.games.get(gameId);
		if (!game) {
			throw new Error(`Game with ID ${gameId} not found`);
		}

		game.processAction(action);
	}

	/**
	 * Forces a player to act (timeout)
	 */
	forcePlayerAction(gameId: GameId, playerId: PlayerId): void {
		const game = this.games.get(gameId);
		if (!game) {
			throw new Error(`Game with ID ${gameId} not found`);
		}

		game.forcePlayerAction(playerId);
	}

	/**
	 * Gets possible actions for a player
	 */
	getPossibleActions(gameId: GameId, playerId: PlayerId): PossibleAction[] {
		const game = this.games.get(gameId);
		if (!game) {
			throw new Error(`Game with ID ${gameId} not found`);
		}

		return game.getPossibleActions(playerId);
	}

	/**
	 * Gets bot game state for a player
	 */
	getBotGameState(gameId: GameId, playerId: PlayerId): BotGameState {
		const game = this.games.get(gameId);
		if (!game) {
			throw new Error(`Game with ID ${gameId} not found`);
		}

		return game.getBotGameState(playerId);
	}

	/**
	 * Gets the game ID for a player
	 */
	getPlayerGameId(playerId: PlayerId): GameId | undefined {
		return this.playerGameMap.get(playerId);
	}

	/**
	 * Subscribes to events for a specific game
	 */
	subscribeToGame(gameId: GameId, callback: (event: GameEvent) => void): void {
		const callbacks = this.eventCallbacks.get(gameId);
		if (!callbacks) {
			throw new Error(`Game with ID ${gameId} not found`);
		}

		callbacks.push(callback);
	}

	/**
	 * Unsubscribes from events for a specific game
	 */
	unsubscribeFromGame(gameId: GameId, callback: (event: GameEvent) => void): void {
		const callbacks = this.eventCallbacks.get(gameId);
		if (!callbacks) {
			return;
		}

		const index = callbacks.indexOf(callback);
		if (index > -1) {
			callbacks.splice(index, 1);
		}
	}

	/**
	 * Handles game events and forwards them to subscribers
	 */
	private handleGameEvent(gameId: GameId, event: GameEvent): void {
		const callbacks = this.eventCallbacks.get(gameId);
		if (!callbacks) {
			return;
		}

		callbacks.forEach((callback) => {
			try {
				callback(event);
			} catch (error) {
				// Silently ignore callback errors
			}
		});
	}

	/**
	 * Creates a standard cash game
	 */
	createCashGame(
		gameId: GameId,
		smallBlind: number,
		bigBlind: number,
		maxPlayers: number = 9,
		turnTimeLimit: number = 30
	): GameEngine {
		const config: GameConfig = {
			maxPlayers,
			smallBlindAmount: smallBlind,
			bigBlindAmount: bigBlind,
			turnTimeLimit,
			isTournament: false,
		};

		return this.createGame(gameId, config);
	}

	/**
	 * Creates a tournament game (for future expansion)
	 */
	createTournamentGame(
		gameId: GameId,
		startingStack: number,
		initialSmallBlind: number,
		initialBigBlind: number,
		maxPlayers: number = 9,
		turnTimeLimit: number = 30
	): GameEngine {
		const config: GameConfig = {
			maxPlayers,
			smallBlindAmount: initialSmallBlind,
			bigBlindAmount: initialBigBlind,
			turnTimeLimit,
			isTournament: true,
			tournamentSettings: {
				blindLevels: [
					{
						level: 1,
						smallBlind: initialSmallBlind,
						bigBlind: initialBigBlind,
						duration: 10,
					},
					{
						level: 2,
						smallBlind: initialSmallBlind * 2,
						bigBlind: initialBigBlind * 2,
						duration: 10,
					},
					{
						level: 3,
						smallBlind: initialSmallBlind * 3,
						bigBlind: initialBigBlind * 3,
						duration: 10,
					},
					// Add more levels as needed
				],
				startingStack,
				maxPlayers,
				currentBlindLevel: 0,
			},
		};

		return this.createGame(gameId, config);
	}

	/**
	 * Gets statistics for all games
	 */
	getOverallStats(): {
		totalGames: number;
		activeGames: number;
		totalPlayers: number;
		averagePlayersPerGame: number;
	} {
		const games = this.getAllGames();
		const totalGames = games.length;
		const activeGames = games.filter((game) => game.isGameRunning()).length;
		const totalPlayers = games.reduce((sum, game) => {
			return sum + game.getGameState().getActivePlayers().length;
		}, 0);
		const averagePlayersPerGame = totalGames > 0 ? totalPlayers / totalGames : 0;

		return {
			totalGames,
			activeGames,
			totalPlayers,
			averagePlayersPerGame: Math.round(averagePlayersPerGame * 100) / 100,
		};
	}

	/**
	 * Finds available games for a player to join
	 */
	findAvailableGames(maxPlayers?: number): GameInfo[] {
		return this.listGames()
			.filter((game) => {
				if (maxPlayers && game.playerCount >= maxPlayers) {
					return false;
				}
				return game.playerCount < game.maxPlayers;
			})
			.sort((a, b) => b.playerCount - a.playerCount); // Sort by player count descending
	}

	/**
	 * Validates if a player can join a game
	 */
	canPlayerJoinGame(gameId: GameId, playerId: PlayerId): boolean {
		const game = this.games.get(gameId);
		if (!game) {
			return false;
		}

		if (this.playerGameMap.has(playerId)) {
			return false;
		}

		const gameState = game.getGameState();
		const config = game['config'];

		return gameState.getActivePlayers().length < config.maxPlayers;
	}

	/**
	 * Cleans up inactive games
	 */
	cleanupInactiveGames(): void {
		const gamesToRemove: GameId[] = [];

		for (const [gameId, game] of this.games) {
			const gameState = game.getGameState();
			const activePlayers = gameState.getActivePlayers();

			// Remove games with no active players
			if (activePlayers.length === 0) {
				gamesToRemove.push(gameId);
			}
		}

		gamesToRemove.forEach((gameId) => {
			this.removeGame(gameId);
		});
	}
}
