import {
	Action,
	BotGameState,
	GameConfig,
	GameEvent,
	GameId,
	PlayerId,
	PossibleAction,
	GamePhase,
} from '@types';
import { GameEngine } from './GameEngine';

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
	/** Players who have requested to leave after the current hand finishes */
	private pendingUnseats: Map<GameId, Set<PlayerId>> = new Map();

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
		const config = game.getConfig();

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

		// Automatically start the first hand if the game hasn't started and now has enough players
		const gameState = game.getGameState();
		if (!game.isGameRunning() && gameState.players.length >= 2) {
			console.log(
				`[GameController] Two or more players have joined game ${gameId}. Starting first hand.`
			);
			this.startHand(gameId);
		}
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

		// Forward event to all subscribers
		callbacks.forEach((cb) => {
			try {
				cb(event);
			} catch (error) {
				console.error(`Error in event callback for game ${gameId}:`, error);
			}
		});

		// If the hand is complete, automatically start the next one after a short delay
		if (event.type === 'hand_complete') {
			// First, process any players that requested to unseat
			const pending = this.pendingUnseats.get(gameId);
			if (pending && pending.size > 0) {
				pending.forEach((pid) => {
					try {
						this.removePlayerFromGame(gameId, pid);
					} catch (err) {
						console.error(`Error removing player ${pid} from game ${gameId}:`, err);
					}
				});
				this.pendingUnseats.delete(gameId);
			}
			const game = this.games.get(gameId);
			const handStartDelay = game?.getConfig().handStartDelay ?? 2000; // Default to 2 seconds if not specified
			
			const timer = setTimeout(() => {
				const game = this.games.get(gameId);
				// Check if game still exists and has enough players to continue
				if (game && game.getGameState().players.length >= 2) {
					console.log(`[GameController] Automatically starting new hand for game: ${gameId}`);
					this.startHand(gameId);
				} else {
					console.log(
						`[GameController] Game ${gameId} ended or not enough players to continue.`
					);
				}
			}, handStartDelay);
			timer.unref();
		}
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
		const config = game.getConfig();

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

	/**
	 * Player requests to leave the table. If no hand is running (or hand already complete)
	 * we remove them immediately, otherwise mark them to be removed once the hand finishes.
	 */
	requestUnseat(gameId: GameId, playerId: PlayerId): void {
		const game = this.games.get(gameId);
		if (!game) {
			throw new Error(`Game with ID ${gameId} not found`);
		}

		const phase = game.getGameState().currentPhase;

		// If no hand is in progress (hand complete) remove right away
		if (phase === GamePhase.HandComplete) {
			// hand already finished; safe to remove now
			this.removePlayerFromGame(gameId, playerId);
			return;
		}

		// Otherwise add to pending set – they will be removed after the hand
		let set = this.pendingUnseats.get(gameId);
		if (!set) {
			set = new Set<PlayerId>();
			this.pendingUnseats.set(gameId, set);
		}
		set.add(playerId);
	}
}
