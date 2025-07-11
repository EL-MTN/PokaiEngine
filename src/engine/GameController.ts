import {
	Action,
	BotGameState,
	GameConfig,
	GameEvent,
	GameId,
	PlayerId,
	PossibleAction,
	GamePhase,
	StartCondition,
} from '@types';
import { GameEngine } from './GameEngine';
import { EnhancedGameLogger } from '../logging/EnhancedGameLogger';
import { ReplaySystem } from '../logging/ReplaySystem';

export interface GameInfo {
	id: GameId;
	playerCount: number;
	maxPlayers: number;
	isRunning: boolean;
	currentHand: number;
	smallBlind: number;
	bigBlind: number;
	turnTimeLimit: number;
	isTournament: boolean;
}

export class GameController {
	private games: Map<GameId, GameEngine> = new Map();
	private playerGameMap: Map<PlayerId, GameId> = new Map();
	private eventCallbacks: Map<GameId, ((event: GameEvent) => void)[]> = new Map();
	/** Players who have requested to leave after the current hand finishes */
	private pendingUnseats: Map<GameId, Set<PlayerId>> = new Map();
	/** Cleanup timers for empty games */
	private cleanupTimers: Map<GameId, NodeJS.Timeout> = new Map();
	/** Enhanced game logger for replay functionality */
	private enhancedLogger: EnhancedGameLogger;
	/** Replay system for playback */
	private replaySystem: ReplaySystem;

	constructor(loggerConfig?: any) {
		// Enable auto-save by default for replay files
		const defaultConfig = {
			autoSave: true,
			enabled: true,
			directory: './replays',
			...loggerConfig
		};
		this.enhancedLogger = new EnhancedGameLogger(defaultConfig);
		this.replaySystem = new ReplaySystem(this.enhancedLogger);
	}

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

		// Start enhanced logging for the game
		const initialGameState = game.getGameState();
		const playerNames = new Map<PlayerId, string>();
		
		// Extract player names from initial state (if any players exist)
		if (initialGameState && initialGameState.players) {
			initialGameState.players.forEach(player => {
				playerNames.set(player.id, player.name);
			});
		}

		// Only start logging if we have a valid game state
		if (initialGameState) {
			this.enhancedLogger.startGame(gameId, config, initialGameState, playerNames);
		}

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

		// End enhanced logging for the game
		const finalGameState = game.getGameState();
		this.enhancedLogger.endGame(gameId, finalGameState);

		// Cancel any pending cleanup timer
		const cleanupTimer = this.cleanupTimers.get(gameId);
		if (cleanupTimer) {
			clearTimeout(cleanupTimer);
			this.cleanupTimers.delete(gameId);
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
		this.pendingUnseats.delete(gameId);
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
			turnTimeLimit: config.turnTimeLimit,
			isTournament: config.isTournament,
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

		// Cancel any pending cleanup since game is no longer empty
		const cleanupTimer = this.cleanupTimers.get(gameId);
		if (cleanupTimer) {
			clearTimeout(cleanupTimer);
			this.cleanupTimers.delete(gameId);
		}

		game.addPlayer(playerId, playerName, chipStack);
		this.playerGameMap.set(playerId, gameId);

		// Check if we should auto-start based on start settings
		this.checkAutoStart(gameId);
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

		// Schedule cleanup if game is now empty
		this.scheduleCleanupIfEmpty(gameId);
	}

	/**
	 * Starts a hand in a game
	 */
	startHand(gameId: GameId): void {
		const game = this.games.get(gameId);
		if (!game) {
			throw new Error(`Game with ID ${gameId} not found`);
		}

		// Before starting a new hand, purge any players who have busted.
		const busted = game.getGameState().players.filter(p => p.chipStack <= 0).map(p => p.id);
		busted.forEach(pid => {
			try {
				game.removePlayer(pid);
			} catch {}
		});

		// Now proceed to start the hand if still enough players.
		if (game.getGameState().getActivePlayers().length < 2) {
			throw new Error('Need at least 2 players to start a hand');
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

		// Log event to enhanced logger for replay functionality
		this.enhancedLogger.logEvent(gameId, event);

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
		turnTimeLimit: number = 30,
		minPlayersToStart: number = 2
	): GameEngine {
		const config: GameConfig = {
			maxPlayers,
			smallBlindAmount: smallBlind,
			bigBlindAmount: bigBlind,
			turnTimeLimit,
			isTournament: false,
			startSettings: {
				condition: 'minPlayers',
				minPlayers: minPlayersToStart,
			},
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
		turnTimeLimit: number = 30,
		creatorId?: string
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
			startSettings: {
				condition: 'manual',
				creatorId,
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

	/**
	 * Checks if a game should auto-start based on its start settings
	 */
	private checkAutoStart(gameId: GameId): void {
		const game = this.games.get(gameId);
		if (!game || game.isGameRunning()) {
			return;
		}

		const config = game.getConfig();
		const gameState = game.getGameState();
		const startSettings = config.startSettings;

		// Default behavior: auto-start with 2 players (backward compatibility)
		if (!startSettings) {
			if (gameState.players.length >= 2) {
				console.log(
					`[GameController] Two or more players have joined game ${gameId}. Starting first hand.`
				);
				this.startHand(gameId);
			}
			return;
		}

		// Handle different start conditions
		switch (startSettings.condition) {
			case 'minPlayers':
				const minPlayers = startSettings.minPlayers || 2;
				if (gameState.players.length >= minPlayers) {
					console.log(
						`[GameController] Minimum players (${minPlayers}) reached for game ${gameId}. Starting first hand.`
					);
					this.startHand(gameId);
				}
				break;

			case 'scheduled':
				// Scheduled starts would be handled by an external timer/scheduler
				// This is just a placeholder for future implementation
				break;

			case 'manual':
				// Manual starts require explicit startGame call
				break;
		}
	}

	/**
	 * Manually starts a game (for manual start condition)
	 */
	startGame(gameId: GameId, requesterId?: PlayerId): void {
		const game = this.games.get(gameId);
		if (!game) {
			throw new Error(`Game with ID ${gameId} not found`);
		}

		if (game.isGameRunning()) {
			throw new Error(`Game ${gameId} is already running`);
		}

		const config = game.getConfig();
		const startSettings = config.startSettings;

		// Check if manual start is allowed
		if (startSettings && startSettings.condition === 'manual') {
			// If creatorId is specified, verify the requester
			if (startSettings.creatorId && requesterId && startSettings.creatorId !== requesterId) {
				throw new Error(`Only the game creator can start game ${gameId}`);
			}
		}

		const gameState = game.getGameState();
		if (gameState.players.length < 2) {
			throw new Error(`Need at least 2 players to start game ${gameId}`);
		}

		console.log(`[GameController] Manually starting game ${gameId}`);
		this.startHand(gameId);
	}

	/**
	 * Schedules cleanup for a game if it's empty
	 */
	private scheduleCleanupIfEmpty(gameId: GameId): void {
		const game = this.games.get(gameId);
		if (!game) {
			return;
		}

		const gameState = game.getGameState();
		const activePlayers = gameState.getActivePlayers();

		// Only schedule cleanup if game is empty
		if (activePlayers.length === 0) {
			// Cancel any existing cleanup timer
			const existingTimer = this.cleanupTimers.get(gameId);
			if (existingTimer) {
				clearTimeout(existingTimer);
			}

			// Schedule new cleanup after 5 seconds
			console.log(`[GameController] Game ${gameId} is empty. Scheduling cleanup in 5 seconds.`);
			const timer = setTimeout(() => {
				// Double-check game is still empty before removing
				const game = this.games.get(gameId);
				if (game && game.getGameState().getActivePlayers().length === 0) {
					console.log(`[GameController] Removing empty game ${gameId}`);
					this.removeGame(gameId);
				}
				this.cleanupTimers.delete(gameId);
			}, 5000);

			// Prevent timer from keeping process alive
			timer.unref();
			this.cleanupTimers.set(gameId, timer);
		}
	}

	/**
	 * Replay System Methods
	 */

	/**
	 * Gets replay data for a game
	 */
	getReplayData(gameId: GameId) {
		return this.enhancedLogger.getReplayData(gameId);
	}

	/**
	 * Gets hand replay data for a specific hand
	 */
	getHandReplayData(gameId: GameId, handNumber: number) {
		return this.enhancedLogger.getHandReplayData(gameId, handNumber);
	}

	/**
	 * Saves a game replay to file
	 */
	saveReplayToFile(gameId: GameId): boolean {
		return this.enhancedLogger.saveReplayToFile(gameId);
	}

	/**
	 * Loads a replay from file
	 */
	loadReplayFromFile(filepath: string) {
		return this.enhancedLogger.loadReplayFromFile(filepath);
	}

	/**
	 * Lists all available replay files
	 */
	listAvailableReplays(): string[] {
		return this.enhancedLogger.listAvailableReplays();
	}

	/**
	 * Gets the replay system for playback control
	 */
	getReplaySystem(): ReplaySystem {
		return this.replaySystem;
	}

	/**
	 * Exports a replay in various formats
	 */
	exportReplay(gameId: GameId, format: 'json' | 'compressed' = 'json') {
		return this.enhancedLogger.exportReplay(gameId, format);
	}
}
