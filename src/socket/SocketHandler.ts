import { GameController } from '@/engine/game/GameController';
import { BotAuthService } from '@/services/auth/BotAuthService';
import { authLogger, communicationLogger } from '@/services/logging/Logger';
import { Action, GameEvent, GameId, GamePhase, PlayerId } from '@/types';

import { BotInterface } from './BotInterface';

// Socket interface for compatibility
export interface Socket {
	id: string;
	emit(event: string, data: any): void;
	on(event: string, callback: (...args: any[]) => void): void;
	/** Optional Socket.io room join – only available when using real Socket.IO */
	join?(room: string): void;
	/** Optional Socket.io room leave – only available when using real Socket.IO */
	leave?(room: string): void;
}

// SocketIO Server interface for compatibility
export interface SocketIOServer {
	on(event: string, callback: (socket: Socket) => void): void;
	to(room: string): { emit(event: string, data: any): void };
}

export interface BotConnection {
	socket: Socket;
	playerId: PlayerId;
	gameId?: GameId;
	isConnected: boolean;
	lastAction?: number;
	eventHandler?: (event: GameEvent) => void;
	/** Authentication status */
	authenticated: boolean;
	/** Bot ID from authentication */
	botId?: string;
	/** Bot name from database */
	botName?: string;
	/** Connection type - 'bot' for players, 'spectator' for observers */
	connectionType?: 'bot' | 'spectator';
	/** Games being spectated (for spectator connections) */
	spectatingGames?: Set<GameId>;
}

export interface TurnTimeoutEvent {
	gameId: GameId;
	playerId: PlayerId;
	timeRemaining: number;
}

export class SocketHandler {
	private io: SocketIOServer;
	private gameController: GameController;
	private botInterface: BotInterface;
	private botAuthService: BotAuthService;
	private connections: Map<string, BotConnection> = new Map();
	/** Map of playerId -> timeout timer */
	private turnTimers: Map<PlayerId, NodeJS.Timeout> = new Map();
	/** Map of playerId -> warning timer */
	private warningTimers: Map<PlayerId, NodeJS.Timeout> = new Map();
	/** Map of playerId -> timer version to prevent race conditions */
	private timerVersions: Map<PlayerId, number> = new Map();
	/** Lock to prevent concurrent timer operations */
	private timerOperationInProgress: Set<PlayerId> = new Set();

	constructor(io: SocketIOServer, gameController: GameController) {
		this.io = io;
		this.gameController = gameController;
		this.botInterface = new BotInterface(gameController);
		this.botAuthService = BotAuthService.getInstance();

		this.setupSocketHandlers();
	}

	/**
	 * Sets up Socket.io event handlers
	 */
	private setupSocketHandlers(): void {
		this.io.on('connection', (socket: Socket) => {
			this.handleConnection(socket);
		});
	}

	/**
	 * Handles a new bot connection
	 */
	private handleConnection(socket: Socket): void {
		const connection: BotConnection = {
			socket,
			playerId: socket.id,
			isConnected: true,
			lastAction: Date.now(),
			authenticated: false, // Not authenticated by default
		};

		this.connections.set(socket.id, connection);

		// Set up event listeners for this connection
		this.setupBotEventListeners(socket, connection);

		// Send authentication required message
		socket.emit('auth.required', {
			message: 'Please authenticate using your bot credentials',
			timestamp: Date.now(),
		});

		communicationLogger.info(
			`New bot connection: ${socket.id} - awaiting authentication`,
		);
	}

	/**
	 * Sets up event listeners for a bot connection
	 */
	private setupBotEventListeners(
		socket: Socket,
		connection: BotConnection,
	): void {
		// Authentication handler - must be called first
		socket.on('auth.login', async (data: { botId: string; apiKey: string }) => {
			await this.handleAuthentication(connection, data);
		});

		// Bot identification and game joining (requires authentication)
		socket.on('game.join', (data: { gameId: GameId; chipStack: number }) => {
			if (!this.requireAuth(connection)) return;
			this.handleBotIdentification(connection, data);
		});

		// Bot actions (requires authentication)
		socket.on('action.submit', async (data: { action: Omit<Action, 'playerId'> }) => {
			if (!this.requireAuth(connection)) return;
			await this.handleBotAction(connection, data.action);
		});

		// Game state requests (requires authentication)
		socket.on('state.current', () => {
			if (!this.requireAuth(connection)) return;
			this.sendGameState(connection);
		});

		// Possible actions request (requires authentication)
		socket.on('state.actions', () => {
			if (!this.requireAuth(connection)) return;
			this.sendPossibleActions(connection);
		});

		// Leave game (requires authentication)
		socket.on('game.leave', () => {
			if (!this.requireAuth(connection)) return;
			this.handleLeaveGame(connection);
		});

		// Request to unseat after current hand / immediately if possible (requires authentication)
		socket.on('game.unseat', () => {
			if (!this.requireAuth(connection)) return;
			this.handleUnseatRequest(connection);
		});

		// List available games
		socket.on('game.list', () => {
			this.sendGamesList(socket);
		});

		// Ping/pong for connection monitoring
		socket.on('system.ping', () => {
			socket.emit('system.ping.success', { timestamp: Date.now() });
		});

		// Handle disconnection
		socket.on('disconnect', () => {
			this.handleDisconnection(connection);
		});

		// Handle reconnection
		socket.on('system.reconnect', () => {
			this.handleReconnection(connection);
		});

		// Spectator events
		socket.on('spectator.auth', (data: { adminKey?: string }) => {
			this.handleSpectatorAuth(connection, data);
		});

		socket.on('spectator.watch', (data: { gameId: GameId }) => {
			if (!this.requireSpectatorAuth(connection)) return;
			this.handleSpectateGame(connection, data.gameId);
		});

		socket.on('spectator.unwatch', (data: { gameId: GameId }) => {
			if (!this.requireSpectatorAuth(connection)) return;
			this.handleStopSpectating(connection, data.gameId);
		});

		socket.on('spectator.games', () => {
			if (!this.requireSpectatorAuth(connection)) return;
			this.sendActiveGamesList(connection);
		});
	}

	/**
	 * Handles bot identification and game joining
	 */
	private handleBotIdentification(
		connection: BotConnection,
		data: { gameId: GameId; chipStack: number },
	): void {
		try {
			// Check if game exists
			const game = this.gameController.getGame(data.gameId);
			if (!game) {
				throw new Error(`Game ${data.gameId} not found`);
			}

			// Use the botName from the authenticated connection, fallback to botId or playerId
			const botName =
				connection.botName || connection.botId || connection.playerId;

			// Check if this is a reconnection (player already in the game)
			const existingGameId = this.gameController.getPlayerGameId(
				connection.playerId,
			);

			if (existingGameId) {
				// This is a reconnection scenario
				if (existingGameId !== data.gameId) {
					throw new Error(
						`Player ${connection.playerId} is already in a different game: ${existingGameId}`,
					);
				}

				// Player is reconnecting to the same game - just update connection info
				connection.gameId = data.gameId;
				communicationLogger.info(
					`Player ${connection.playerId} reconnected to game ${data.gameId}`,
				);
			} else {
				// This is a new connection - check capacity and add player
				const gameState = game.getGameState();
				const maxPlayers = game.getConfig().maxPlayers;

				if (gameState.players.length >= maxPlayers) {
					throw new Error(
						`Game ${data.gameId} is full (${maxPlayers} players)`,
					);
				}

				// Join the game using the authenticated bot's name
				this.gameController.addPlayerToGame(
					data.gameId,
					connection.playerId,
					botName,
					data.chipStack,
				);

				connection.gameId = data.gameId;
			}

			// Now that gameId is known, ensure event subscription is active
			this.subscribeToGameEvents(connection);

			// Join socket.io room for this game if available
			if (typeof connection.socket.join === 'function') {
				connection.socket.join(`game_${data.gameId}`);
			}

			// Send success confirmation
			connection.socket.emit('game.join.success', {
				playerId: connection.playerId,
				gameId: data.gameId,
				botName: botName,
				chipStack: data.chipStack,
				timestamp: Date.now(),
			});

			// Send initial game state
			this.sendGameState(connection);

			// If it's already this bot's turn, start the turn timer immediately.
			const joinedGame = this.gameController.getGame(data.gameId);
			if (
				joinedGame &&
				joinedGame.getGameState().currentPlayerToAct === connection.playerId &&
				!this.timerOperationInProgress.has(connection.playerId)
			) {
				this.startTurnTimer(connection).catch((error) => {
					communicationLogger.error(
						`Failed to start turn timer for player ${connection.playerId}:`,
						error,
					);
				});
			}
		} catch (error) {
			connection.socket.emit('game.join.error', {
				error: error instanceof Error ? error.message : 'Unknown error',
				timestamp: Date.now(),
			});
		}
	}

	/**
	 * Handles bot actions
	 */
	private async handleBotAction(
		connection: BotConnection,
		actionData: Omit<Action, 'playerId'>,
	): Promise<void> {
		if (!connection.gameId) {
			connection.socket.emit('action.submit.error', {
				error: 'Not in a game',
				timestamp: Date.now(),
			});
			return;
		}

		try {
			// Clear turn timer for this player
			await this.clearTurnTimer(connection.playerId);

			// Create action with the connection's playerId
			const action: Action = {
				...actionData,
				playerId: connection.playerId,
			};

			// Process the action
			this.gameController.processAction(connection.gameId, action);

			// Update last action timestamp
			connection.lastAction = Date.now();

			// Send action confirmation
			connection.socket.emit('action.submit.success', {
				action,
				timestamp: Date.now(),
			});
		} catch (error) {
			connection.socket.emit('action.submit.error', {
				error: error instanceof Error ? error.message : 'Unknown error',
				action: {
					...actionData,
					playerId: connection.playerId,
				},
				timestamp: Date.now(),
			});
		}
	}

	/**
	 * Handles a bot leaving the current game
	 */
	private handleLeaveGame(connection: BotConnection): void {
		if (!connection.gameId) {
			connection.socket.emit('game.leave.error', {
				error: 'Bot is not in a game',
				timestamp: Date.now(),
			});
			return;
		}

		try {
			this.gameController.removePlayerFromGame(
				connection.gameId,
				connection.playerId,
			);

			// Unsubscribe from events and leave room
			this.unsubscribeFromGameEvents(connection);
			if (typeof connection.socket.leave === 'function') {
				connection.socket.leave(`game_${connection.gameId}`);
			}

			connection.gameId = undefined;

			connection.socket.emit('game.leave.success', {
				timestamp: Date.now(),
			});
		} catch (error) {
			connection.socket.emit('game.leave.error', {
				error: error instanceof Error ? error.message : 'Unknown error',
				timestamp: Date.now(),
			});
		}
	}

	/**
	 * Handles a player's request to unseat (leave after current hand).
	 */
	private handleUnseatRequest(connection: BotConnection): void {
		if (!connection.gameId) {
			connection.socket.emit('game.unseat.error', {
				error: 'Bot is not in a game',
				timestamp: Date.now(),
			});
			return;
		}

		try {
			this.gameController.requestUnseat(connection.gameId, connection.playerId);

			connection.socket.emit('game.unseat.success', {
				timestamp: Date.now(),
			});

			// Optional: If removed immediately, we can send updated game state
		} catch (error) {
			connection.socket.emit('game.unseat.error', {
				error: error instanceof Error ? error.message : 'Unknown error',
				timestamp: Date.now(),
			});
		}
	}

	/**
	 * Sends available games list
	 */
	private sendGamesList(socket: Socket): void {
		const games = this.gameController.listGames();
		socket.emit('game.list.success', {
			games,
			timestamp: Date.now(),
		});
	}

	/**
	 * Sends possible actions for the bot in current game state
	 */
	private sendPossibleActions(connection: BotConnection): void {
		if (!connection.gameId) {
			connection.socket.emit('state.actions.error', {
				error: 'Not in a game',
				timestamp: Date.now(),
			});
			return;
		}

		try {
			const possibleActions = this.gameController.getPossibleActions(
				connection.gameId,
				connection.playerId,
			);

			connection.socket.emit('state.actions.success', {
				possibleActions,
				timestamp: Date.now(),
			});
		} catch (error) {
			connection.socket.emit('state.actions.error', {
				error: error instanceof Error ? error.message : 'Unknown error',
				timestamp: Date.now(),
			});
		}
	}

	/**
	 * Sends current game state to a bot
	 */
	private sendGameState(connection: BotConnection): void {
		if (!connection.gameId) {
			return;
		}

		try {
			const gameState = this.gameController.getBotGameState(
				connection.gameId,
				connection.playerId,
			);

			connection.socket.emit('state.current.success', {
				gameState,
				timestamp: Date.now(),
			});
		} catch (error) {
			connection.socket.emit('state.current.error', {
				error: error instanceof Error ? error.message : 'Unknown error',
				timestamp: Date.now(),
			});
		}
	}

	/**
	 * Subscribes to game events for a bot
	 */
	private subscribeToGameEvents(connection: BotConnection): void {
		// Clean up any existing subscription first
		this.unsubscribeFromGameEvents(connection);

		const eventHandler = (event: GameEvent) => {
			this.handleGameEvent(connection, event);
		};

		// Store the event handler for cleanup
		connection.eventHandler = eventHandler;

		// Subscribe to game events when bot joins a game
		if (connection.gameId) {
			this.gameController.subscribeToGame(connection.gameId, eventHandler);
		}
	}

	/**
	 * Unsubscribes from game events for a bot
	 */
	private unsubscribeFromGameEvents(connection: BotConnection): void {
		if (connection.eventHandler && connection.gameId) {
			try {
				this.gameController.unsubscribeFromGame(
					connection.gameId,
					connection.eventHandler,
				);
			} catch (error) {
				// Log but don't throw - unsubscribe errors shouldn't break the flow
				communicationLogger.warn(
					`Failed to unsubscribe from game events: ${error instanceof Error ? error.message : 'Unknown error'}`,
				);
			}
			connection.eventHandler = undefined;
		}
	}

	/**
	 * Handles game events and forwards them to appropriate bots
	 */
	private handleGameEvent(connection: BotConnection, event: GameEvent): void {
		if (!connection.isConnected) {
			return;
		}

		// Send event to the bot
		connection.socket.emit('event.game', {
			event,
			timestamp: Date.now(),
		});

		// Handle specific events
		switch (event.type) {
			case 'hand_started':
				this.sendGameState(connection);
				// Immediately start timer if it's this player's turn after blinds
				// Verify we're in preflop phase to avoid stale state issues
				if (event.gameState?.currentPlayerToAct === connection.playerId &&
				    event.gameState?.currentPhase === GamePhase.PreFlop &&
				    !this.timerOperationInProgress.has(connection.playerId)) {
					this.startTurnTimer(connection).catch((error) => {
						communicationLogger.error(
							`Failed to start turn timer for player ${connection.playerId}:`,
							error,
						);
					});
				}
				break;

			case 'action_taken':
				this.sendGameState(connection);

				// Check if it's this bot's turn and we're not in hand_complete phase
				if (event.gameState?.currentPlayerToAct === connection.playerId &&
				    event.gameState?.currentPhase !== GamePhase.HandComplete &&
				    !this.timerOperationInProgress.has(connection.playerId)) {
					this.startTurnTimer(connection).catch((error) => {
						communicationLogger.error(
							`Failed to start turn timer for player ${connection.playerId}:`,
							error,
						);
					});
				}
				break;

			case 'flop_dealt':
			case 'turn_dealt':
			case 'river_dealt':
				this.sendGameState(connection);
				// Only start timer if game is running and we're not in hand_complete phase
				if (event.gameState?.currentPlayerToAct === connection.playerId &&
				    event.gameState?.currentPhase !== GamePhase.HandComplete &&
				    !this.timerOperationInProgress.has(connection.playerId)) {
					this.startTurnTimer(connection).catch((error) => {
						communicationLogger.error(
							`Failed to start turn timer for player ${connection.playerId}:`,
							error,
						);
					});
				}
				break;

			case 'showdown_complete':
			case 'hand_complete':
				this.sendGameState(connection);
				this.clearTurnTimer(connection.playerId).catch((error) => {
					communicationLogger.error(
						`Failed to clear turn timer for player ${connection.playerId}:`,
						error,
					);
				});
				// IMPORTANT: Do not start timers for hand_complete events
				// The currentPlayerToAct might still be set from the last action
				break;
		}
	}

	/**
	 * Starts a turn timer for a bot
	 */
	private async startTurnTimer(connection: BotConnection): Promise<void> {
		if (!connection.gameId) {
			return;
		}

		// Prevent concurrent timer operations
		if (this.timerOperationInProgress.has(connection.playerId)) {
			communicationLogger.warn(
				`Timer operation already in progress for player ${connection.playerId}`,
			);
			return;
		}

		this.timerOperationInProgress.add(connection.playerId);

		try {
			// Increment timer version to invalidate any pending timer callbacks
			const currentVersion = (this.timerVersions.get(connection.playerId) || 0) + 1;
			this.timerVersions.set(connection.playerId, currentVersion);

			// Clear existing timers first
			await this.clearTurnTimer(connection.playerId);

			// Get configuration
			const game = this.gameController.getGame(connection.gameId);
			if (!game) {
				return;
			}

			const gameState = game.getGameState();
			
			// Double-check the player is still the current actor after async operations
			if (gameState.currentPlayerToAct !== connection.playerId) {
				communicationLogger.info(
					`Player ${connection.playerId} is no longer the current actor, skipping timer`,
				);
				return;
			}

			// Prevent starting timers during hand_complete phase or when game is not running
			if (gameState.currentPhase === GamePhase.HandComplete || !game.isGameRunning()) {
				communicationLogger.info(
					`Skipping timer for player ${connection.playerId} - game phase: ${gameState.currentPhase}, running: ${game.isGameRunning()}`,
				);
				return;
			}

			const timeLimitMs = game.getConfig().turnTimeLimit * 1000;
			const warningDelayMs = timeLimitMs * 0.7; // send warning when 70% of time has elapsed

			// Turn start notification
			connection.socket.emit('turn.start', {
				timeLimit: timeLimitMs / 1000,
				timestamp: Date.now(),
			});

			// Warning timer - only set if there's enough time for a meaningful warning
			let warningTimer: NodeJS.Timeout | undefined;
			if (timeLimitMs > 1000) {
				// Only warn if timeout is longer than 1 second
				warningTimer = setTimeout(() => {
					// Check if this timer is still valid
					if (this.timerVersions.get(connection.playerId) !== currentVersion) {
						return;
					}
					connection.socket.emit('turn.warning', {
						timeRemaining: (timeLimitMs - warningDelayMs) / 1000,
						timestamp: Date.now(),
					});
				}, warningDelayMs);
			}

			// Timeout timer
			const timeoutTimer = setTimeout(() => {
				// Check if this timer is still valid
				if (this.timerVersions.get(connection.playerId) !== currentVersion) {
					return;
				}
				this.handleTurnTimeout(connection).catch((error) => {
					communicationLogger.error(
						`Error in turn timeout handler for player ${connection.playerId}:`,
						error,
					);
				});
			}, timeLimitMs);

			// Store timers
			if (warningTimer) {
				this.warningTimers.set(connection.playerId, warningTimer);
			}
			this.turnTimers.set(connection.playerId, timeoutTimer);
		} finally {
			this.timerOperationInProgress.delete(connection.playerId);
		}
	}

	/**
	 * Clears turn timer for a player
	 */
	private async clearTurnTimer(playerId: PlayerId): Promise<void> {
		// Increment version to invalidate any pending timer callbacks
		const currentVersion = (this.timerVersions.get(playerId) || 0) + 1;
		this.timerVersions.set(playerId, currentVersion);

		const warning = this.warningTimers.get(playerId);
		if (warning) {
			clearTimeout(warning);
			this.warningTimers.delete(playerId);
		}

		const timeout = this.turnTimers.get(playerId);
		if (timeout) {
			clearTimeout(timeout);
			this.turnTimers.delete(playerId);
		}

		// Use setImmediate to ensure any pending timer callbacks in the event loop are processed
		await new Promise<void>((resolve) => setImmediate(() => resolve()));
	}

	/**
	 * Handles turn timeout
	 */
	private async handleTurnTimeout(connection: BotConnection): Promise<void> {
		if (!connection.gameId) {
			return;
		}

		// Prevent concurrent timeout handling
		if (this.timerOperationInProgress.has(connection.playerId)) {
			communicationLogger.warn(
				`Timeout handling already in progress for player ${connection.playerId}`,
			);
			return;
		}

		this.timerOperationInProgress.add(connection.playerId);

		try {
			// Clear timers first to avoid duplicate actions
			await this.clearTurnTimer(connection.playerId);

			// Verify the game state hasn't changed
			const game = this.gameController.getGame(connection.gameId);
			if (!game || game.getGameState().currentPlayerToAct !== connection.playerId) {
				communicationLogger.info(
					`Player ${connection.playerId} is no longer the current actor, skipping timeout`,
				);
				return;
			}

			// Send timeout notification
			connection.socket.emit('turn.timeout', {
				timestamp: Date.now(),
			});

			// Force action through game controller
			try {
				this.gameController.forcePlayerAction(
					connection.gameId,
					connection.playerId,
				);
			} catch (error) {
				// Log error but don't crash - game should continue functioning
				communicationLogger.error(
					`Force action failed for player ${connection.playerId}:`,
					error,
				);

				// Notify the player that force action failed
				connection.socket.emit('turn.force.error', {
					error: error instanceof Error ? error.message : 'Unknown error',
					timestamp: Date.now(),
				});
			}
		} finally {
			this.timerOperationInProgress.delete(connection.playerId);
		}
	}

	/**
	 * Handles bot disconnection
	 */
	private handleDisconnection(connection: BotConnection): void {
		connection.isConnected = false;

		// Handle spectator disconnection
		if (connection.connectionType === 'spectator') {
			// Unsubscribe from all spectated games
			if (connection.spectatingGames && connection.eventHandler) {
				for (const gameId of connection.spectatingGames) {
					try {
						this.gameController.unsubscribeFromGame(
							gameId,
							connection.eventHandler,
						);
					} catch (error) {
						communicationLogger.error(
							`Failed to unsubscribe spectator from game ${gameId}:`,
							error,
						);
					}
				}
				connection.spectatingGames.clear();
			}
			connection.eventHandler = undefined;
			this.connections.delete(connection.socket.id);
			communicationLogger.info(
				`Spectator ${connection.socket.id} disconnected`,
			);
			return;
		}

		// Handle bot disconnection
		// Clear timers
		this.clearTurnTimer(connection.playerId).catch((error) => {
			communicationLogger.error(
				`Failed to clear turn timer during disconnection for player ${connection.playerId}:`,
				error,
			);
		});

		// Unsubscribe from game events
		this.unsubscribeFromGameEvents(connection);

		// Remove from connections
		this.connections.delete(connection.socket.id);

		// Note: We don't remove the player from the game immediately
		// to allow for reconnection attempts
	}

	/**
	 * Handles permanent bot disconnection (no reconnection expected)
	 */
	private handlePermanentDisconnection(connection: BotConnection): void {
		// First handle regular disconnection cleanup
		this.handleDisconnection(connection);

		// Clean up timer-related Maps to prevent memory leaks
		this.timerVersions.delete(connection.playerId);
		this.timerOperationInProgress.delete(connection.playerId);

		// Then remove player from game entirely
		if (connection.gameId) {
			try {
				communicationLogger.info(
					`Permanently removing player ${connection.playerId} from game ${connection.gameId} due to timeout`,
				);
				this.gameController.removePlayerFromGame(
					connection.gameId,
					connection.playerId,
				);
			} catch (error) {
				communicationLogger.error(
					`Failed to remove player ${connection.playerId} from game:`,
					error,
				);
			}
		}
	}

	/**
	 * Handles bot reconnection
	 */
	private handleReconnection(connection: BotConnection): void {
		connection.isConnected = true;
		connection.lastAction = Date.now();

		// Re-subscribe to game events
		this.subscribeToGameEvents(connection);

		// Send current game state
		this.sendGameState(connection);
	}

	/**
	 * Broadcasts an event to all connected bots in a game
	 */
	broadcastToGame(gameId: GameId, event: string, data: any): void {
		const room = `game_${gameId}`;
		if (this.io.to) {
			this.io.to(room).emit(event, data);
		}
	}

	/**
	 * Gets connection statistics
	 */
	getConnectionStats(): {
		totalConnections: number;
		activeConnections: number;
		botsInGames: number;
		activeTurnTimers: number;
		spectators: number;
		totalGamesBeingSpectated: number;
	} {
		const totalConnections = this.connections.size;
		const connections = Array.from(this.connections.values());
		const activeConnections = connections.filter((c) => c.isConnected).length;
		const botsInGames = connections.filter(
			(c) => c.gameId && c.isConnected && c.connectionType !== 'spectator',
		).length;
		const activeTurnTimers = this.turnTimers.size;
		const spectators = connections.filter(
			(c) => c.connectionType === 'spectator' && c.isConnected,
		).length;

		// Count unique games being spectated
		const spectatedGames = new Set<GameId>();
		connections
			.filter((c) => c.connectionType === 'spectator' && c.spectatingGames)
			.forEach((c) => {
				c.spectatingGames!.forEach((gameId) => spectatedGames.add(gameId));
			});
		const totalGamesBeingSpectated = spectatedGames.size;

		return {
			totalConnections,
			activeConnections,
			botsInGames,
			activeTurnTimers,
			spectators,
			totalGamesBeingSpectated,
		};
	}

	/**
	 * Cleans up inactive connections
	 */
	cleanupInactiveConnections(): void {
		const now = Date.now();
		const inactiveThreshold = 5 * 60 * 1000; // 5 minutes

		// Collect connections to remove to avoid modifying map while iterating
		const connectionsToRemove: BotConnection[] = [];

		for (const [, connection] of this.connections) {
			const shouldRemove =
				!connection.isConnected ||
				(connection.lastAction &&
					now - connection.lastAction > inactiveThreshold);

			if (shouldRemove) {
				connectionsToRemove.push(connection);
			}
		}

		// Remove inactive connections
		for (const connection of connectionsToRemove) {
			this.handlePermanentDisconnection(connection);
		}

		// Clean up orphaned timer versions (players no longer in any connection)
		const activePlayerIds = new Set<PlayerId>();
		for (const connection of this.connections.values()) {
			activePlayerIds.add(connection.playerId);
		}

		// Remove timer versions for players that are no longer connected
		for (const playerId of this.timerVersions.keys()) {
			if (!activePlayerIds.has(playerId)) {
				this.timerVersions.delete(playerId);
				this.timerOperationInProgress.delete(playerId);
			}
		}
	}

	/**
	 * Handles bot authentication
	 */
	private async handleAuthentication(
		connection: BotConnection,
		data: { botId: string; apiKey: string },
	): Promise<void> {
		try {
			// Validate bot credentials
			const isValid = await this.botAuthService.validateBot(
				data.botId,
				data.apiKey,
			);

			if (!isValid) {
				connection.socket.emit('auth.login.error', {
					message: 'Invalid bot credentials',
					timestamp: Date.now(),
				});
				authLogger.warn(
					`Authentication failed for bot ${data.botId} from ${connection.socket.id}`,
				);
				return;
			}

			// Get bot information
			const bot = await this.botAuthService.getBot(data.botId);
			if (!bot) {
				connection.socket.emit('auth.login.error', {
					message: 'Bot not found',
					timestamp: Date.now(),
				});
				return;
			}

			// Mark connection as authenticated
			connection.authenticated = true;
			connection.botId = data.botId;
			connection.botName = bot.botName;

			// Send success response
			connection.socket.emit('auth.login.success', {
				botId: data.botId,
				botName: bot.botName,
				playerId: connection.playerId,
				timestamp: Date.now(),
			});

			authLogger.info(
				`Bot ${data.botId} (${bot.botName}) authenticated successfully`,
			);
		} catch (error) {
			authLogger.error(`Authentication error for bot ${data.botId}:`, error);
			connection.socket.emit('auth.login.error', {
				message: 'Authentication failed',
				timestamp: Date.now(),
			});
		}
	}

	/**
	 * Checks if connection is authenticated
	 */
	private requireAuth(connection: BotConnection): boolean {
		// Bypass authentication only when explicitly requested
		if (process.env.SKIP_BOT_AUTH === 'true') {
			connection.authenticated = true;
			return true;
		}

		if (!connection.authenticated) {
			connection.socket.emit('system.error', {
				code: 'AUTH_REQUIRED',
				message: 'Authentication required. Please authenticate first.',
				timestamp: Date.now(),
			});
			return false;
		}
		return true;
	}

	/**
	 * Gets authenticated bot name for logging
	 */
	private getBotIdentifier(connection: BotConnection): string {
		if (connection.authenticated && connection.botName) {
			return `${connection.botName} (${connection.botId})`;
		}
		return connection.playerId;
	}

	/**
	 * Handles spectator authentication
	 */
	private handleSpectatorAuth(
		connection: BotConnection,
		data: { adminKey?: string },
	): void {
		// For now, we'll use a simple admin key check
		// In production, this should integrate with a proper auth system
		const validAdminKey = process.env.SPECTATOR_ADMIN_KEY || 'admin123';

		if (data.adminKey === validAdminKey) {
			connection.authenticated = true;
			connection.connectionType = 'spectator';
			connection.spectatingGames = new Set();

			connection.socket.emit('spectator.auth.success', {
				message: 'Authenticated as spectator',
				timestamp: Date.now(),
			});

			communicationLogger.info(
				`Spectator authenticated: ${connection.socket.id}`,
			);
		} else {
			connection.socket.emit('spectator.auth.error', {
				error: 'Invalid admin key',
				timestamp: Date.now(),
			});
		}
	}

	/**
	 * Checks if connection is authenticated as spectator
	 */
	private requireSpectatorAuth(connection: BotConnection): boolean {
		if (
			!connection.authenticated ||
			connection.connectionType !== 'spectator'
		) {
			connection.socket.emit('spectator.auth.required', {
				error: 'Spectator authentication required',
				timestamp: Date.now(),
			});
			return false;
		}
		return true;
	}

	/**
	 * Handles spectator joining a game
	 */
	private handleSpectateGame(connection: BotConnection, gameId: GameId): void {
		try {
			const game = this.gameController.getGame(gameId);
			if (!game) {
				throw new Error(`Game ${gameId} not found`);
			}

			// Add game to spectated list
			if (!connection.spectatingGames) {
				connection.spectatingGames = new Set();
			}
			connection.spectatingGames.add(gameId);

			// Join the game room to receive events
			if (typeof connection.socket.join === 'function') {
				connection.socket.join(`game_${gameId}`);
			}

			// Subscribe to game events with a spectator event handler
			const spectatorEventHandler = (event: GameEvent) => {
				this.handleSpectatorGameEvent(connection, gameId, event);
			};

			// Store handler for cleanup
			if (!connection.eventHandler) {
				connection.eventHandler = spectatorEventHandler;
			}

			this.gameController.subscribeToGame(gameId, spectatorEventHandler);

			// Send current full game state
			this.sendFullGameState(connection, gameId);

			connection.socket.emit('spectator.watch.success', {
				gameId,
				message: `Now spectating game ${gameId}`,
				timestamp: Date.now(),
			});

			communicationLogger.info(
				`Spectator ${connection.socket.id} started spectating game ${gameId}`,
			);
		} catch (error) {
			connection.socket.emit('spectator.watch.error', {
				error:
					error instanceof Error ? error.message : 'Failed to spectate game',
				timestamp: Date.now(),
			});
		}
	}

	/**
	 * Handles spectator leaving a game
	 */
	private handleStopSpectating(
		connection: BotConnection,
		gameId: GameId,
	): void {
		try {
			if (connection.spectatingGames?.has(gameId)) {
				connection.spectatingGames.delete(gameId);

				// Leave the game room
				if (typeof connection.socket.leave === 'function') {
					connection.socket.leave(`game_${gameId}`);
				}

				// Unsubscribe from events if not spectating any other games
				if (connection.spectatingGames.size === 0 && connection.eventHandler) {
					this.gameController.unsubscribeFromGame(
						gameId,
						connection.eventHandler,
					);
					connection.eventHandler = undefined;
				}

				connection.socket.emit('spectator.unwatch.success', {
					gameId,
					message: `Stopped spectating game ${gameId}`,
					timestamp: Date.now(),
				});

				communicationLogger.info(
					`Spectator ${connection.socket.id} stopped spectating game ${gameId}`,
				);
			}
		} catch (error) {
			connection.socket.emit('spectator.unwatch.error', {
				error:
					error instanceof Error ? error.message : 'Failed to stop spectating',
				timestamp: Date.now(),
			});
		}
	}

	/**
	 * Sends list of active games to spectator
	 */
	private sendActiveGamesList(connection: BotConnection): void {
		const games = this.gameController.listGames();
		const activeGames = games.map((game) => ({
			...game,
			canSpectate: true,
			playerNames: this.getPlayerNamesForGame(game.id),
		}));

		connection.socket.emit('spectator.games.success', {
			games: activeGames,
			timestamp: Date.now(),
		});
	}

	/**
	 * Sends full game state to spectator with visibility rules applied
	 */
	private sendFullGameState(connection: BotConnection, gameId: GameId): void {
		try {
			const game = this.gameController.getGame(gameId);
			if (!game) {
				throw new Error(`Game ${gameId} not found`);
			}

			const gameState = game.getGameState();

			// Get game state with visibility rules applied (simple showdown-only visibility)
			let spectatorGameState;
			if (typeof (gameState as any).getStateWithVisibility === 'function') {
				spectatorGameState = (gameState as any).getStateWithVisibility(
					'spectator',
					undefined,
				);
			} else {
				// Fallback for plain game state objects
				const isShowdown =
					gameState.currentPhase === 'showdown' ||
					gameState.currentPhase === 'hand_complete';
				spectatorGameState = {
					...gameState,
					players: gameState.players.map((player) => ({
						...player,
						holeCards:
							isShowdown && !player.isFolded
								? player.holeCards || []
								: undefined,
					})),
				};
			}

			connection.socket.emit('spectator.state', {
				gameId,
				gameState: spectatorGameState,
				timestamp: Date.now(),
			});
		} catch (error) {
			connection.socket.emit('state.current.error', {
				error:
					error instanceof Error ? error.message : 'Failed to get game state',
				timestamp: Date.now(),
			});
		}
	}

	/**
	 * Handles game events for spectators
	 */
	private handleSpectatorGameEvent(
		connection: BotConnection,
		gameId: GameId,
		event: GameEvent,
	): void {
		if (!connection.isConnected || !connection.spectatingGames?.has(gameId)) {
			return;
		}

		// Send the event with full visibility
		connection.socket.emit('spectator.event', {
			gameId,
			event: {
				...event,
				// Include additional state if available (cast to any to handle extended properties)
				gameState: event.gameState,
				gameStateBefore: (event as any).gameStateBefore,
				gameStateAfter: (event as any).gameStateAfter,
			},
			timestamp: Date.now(),
		});

		// For certain events, also send updated full game state
		switch (event.type) {
			case 'hand_started':
			case 'action_taken':
			case 'flop_dealt':
			case 'turn_dealt':
			case 'river_dealt':
			case 'showdown_complete':
			case 'hand_complete':
				this.sendFullGameState(connection, gameId);
				break;
		}
	}

	/**
	 * Gets player names for a game
	 */
	private getPlayerNamesForGame(gameId: GameId): Record<string, string> {
		const playerNames: Record<string, string> = {};
		for (const connection of this.connections.values()) {
			if (connection.gameId === gameId && connection.botName) {
				playerNames[connection.playerId] = connection.botName;
			}
		}
		return playerNames;
	}
}
