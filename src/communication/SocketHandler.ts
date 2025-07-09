import { GameController } from '@engine/GameController';
import { Action, GameEvent, GameId, PlayerId } from '@types';
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
}

export interface BotConnection {
	socket: Socket;
	playerId: PlayerId;
	gameId?: GameId;
	isConnected: boolean;
	/** Active timeout for forced action */
	turnTimer?: NodeJS.Timeout;
	/** Warning timer before timeout */
	warningTimer?: NodeJS.Timeout;
	lastAction?: number;
	eventHandler?: (event: GameEvent) => void;
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
	private connections: Map<string, BotConnection> = new Map();
	/** Map of playerId -> timeout timer */
	private turnTimers: Map<PlayerId, NodeJS.Timeout> = new Map();
	/** Map of playerId -> warning timer */
	private warningTimers: Map<PlayerId, NodeJS.Timeout> = new Map();

	constructor(io: SocketIOServer, gameController: GameController) {
		this.io = io;
		this.gameController = gameController;
		this.botInterface = new BotInterface(gameController);

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
		};

		this.connections.set(socket.id, connection);

		// Set up event listeners for this connection
		this.setupBotEventListeners(socket, connection);

		// Send welcome message
		socket.emit('connected', {
			playerId: socket.id,
			timestamp: Date.now(),
		});

		// Subscribe to game events for this bot
		this.subscribeToGameEvents(connection);
	}

	/**
	 * Sets up event listeners for a bot connection
	 */
	private setupBotEventListeners(socket: Socket, connection: BotConnection): void {
		// Bot identification and game joining
		socket.on('identify', (data: { botName: string; gameId: GameId; chipStack: number }) => {
			this.handleBotIdentification(connection, data);
		});

		// Bot actions
		socket.on('action', (data: { action: Action }) => {
			this.handleBotAction(connection, data.action);
		});

		// Game state requests
		socket.on('requestGameState', () => {
			this.sendGameState(connection);
		});

		// Possible actions request
		socket.on('requestPossibleActions', () => {
			this.sendPossibleActions(connection);
		});

		// Leave game
		socket.on('leaveGame', () => {
			this.handleLeaveGame(connection);
		});

		// List available games
		socket.on('listGames', () => {
			this.sendGamesList(socket);
		});

		// Ping/pong for connection monitoring
		socket.on('ping', () => {
			socket.emit('pong', { timestamp: Date.now() });
		});

		// Handle disconnection
		socket.on('disconnect', () => {
			this.handleDisconnection(connection);
		});

		// Handle reconnection
		socket.on('reconnect', () => {
			this.handleReconnection(connection);
		});
	}

	/**
	 * Handles bot identification and game joining
	 */
	private handleBotIdentification(
		connection: BotConnection,
		data: { botName: string; gameId: GameId; chipStack: number }
	): void {
		try {
			// Check if game exists and has capacity
			const game = this.gameController.getGame(data.gameId);
			if (!game) {
				throw new Error(`Game ${data.gameId} not found`);
			}

			const gameState = game.getGameState();
			const maxPlayers = game.getConfig().maxPlayers;

			if (gameState.players.length >= maxPlayers) {
				throw new Error(`Game ${data.gameId} is full (${maxPlayers} players)`);
			}

			// Join the game
			this.gameController.addPlayerToGame(
				data.gameId,
				connection.playerId,
				data.botName,
				data.chipStack
			);

			connection.gameId = data.gameId;

			// Now that gameId is known, ensure event subscription is active
			this.subscribeToGameEvents(connection);

			// Join socket.io room for this game if available
			if (typeof connection.socket.join === 'function') {
				connection.socket.join(`game_${data.gameId}`);
			}

			// Send success confirmation
			connection.socket.emit('identificationSuccess', {
				playerId: connection.playerId,
				gameId: data.gameId,
				botName: data.botName,
				chipStack: data.chipStack,
				timestamp: Date.now(),
			});

			// Send initial game state
			this.sendGameState(connection);
		} catch (error) {
			connection.socket.emit('identificationError', {
				error: error instanceof Error ? error.message : 'Unknown error',
				timestamp: Date.now(),
			});
		}
	}

	/**
	 * Handles bot actions
	 */
	private handleBotAction(connection: BotConnection, action: Action): void {
		if (!connection.gameId) {
			connection.socket.emit('actionError', {
				error: 'Not in a game',
				timestamp: Date.now(),
			});
			return;
		}

		try {
			// Clear turn timer for this player
			this.clearTurnTimer(connection.playerId);

			// Validate action belongs to this bot
			if (action.playerId !== connection.playerId) {
				throw new Error('Action must be from the connected bot');
			}

			// Process the action
			this.gameController.processAction(connection.gameId, action);

			// Update last action timestamp
			connection.lastAction = Date.now();

			// Send action confirmation
			connection.socket.emit('actionSuccess', {
				action,
				timestamp: Date.now(),
			});
		} catch (error) {
			connection.socket.emit('actionError', {
				error: error instanceof Error ? error.message : 'Unknown error',
				action,
				timestamp: Date.now(),
			});
		}
	}

	/**
	 * Handles a bot leaving the current game
	 */
	private handleLeaveGame(connection: BotConnection): void {
		if (!connection.gameId) {
			connection.socket.emit('leaveGameError', {
				error: 'Bot is not in a game',
				timestamp: Date.now(),
			});
			return;
		}

		try {
			this.gameController.removePlayerFromGame(connection.gameId, connection.playerId);

			// Unsubscribe from events and leave room
			if (connection.eventHandler) {
				try {
					this.gameController.unsubscribeFromGame(
						connection.gameId,
						connection.eventHandler
					);
				} catch (error) {
					// Log error but don't prevent cleanup
					console.error(
						`Failed to unsubscribe from game events for player ${connection.playerId}:`,
						error
					);
				}
				// Clear the handler reference to prevent memory leaks
				connection.eventHandler = undefined;
			}
			if (typeof connection.socket.leave === 'function') {
				connection.socket.leave(`game_${connection.gameId}`);
			}

			connection.gameId = undefined;

			connection.socket.emit('leftGame', {
				timestamp: Date.now(),
			});
		} catch (error) {
			connection.socket.emit('leaveGameError', {
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
		socket.emit('gamesList', {
			games,
			timestamp: Date.now(),
		});
	}

	/**
	 * Sends possible actions for the bot in current game state
	 */
	private sendPossibleActions(connection: BotConnection): void {
		if (!connection.gameId) {
			connection.socket.emit('possibleActionsError', {
				error: 'Not in a game',
				timestamp: Date.now(),
			});
			return;
		}

		try {
			const possibleActions = this.gameController.getPossibleActions(
				connection.gameId,
				connection.playerId
			);

			connection.socket.emit('possibleActions', {
				possibleActions,
				timestamp: Date.now(),
			});
		} catch (error) {
			connection.socket.emit('possibleActionsError', {
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
				connection.playerId
			);

			connection.socket.emit('gameState', {
				gameState,
				timestamp: Date.now(),
			});
		} catch (error) {
			connection.socket.emit('gameStateError', {
				error: error instanceof Error ? error.message : 'Unknown error',
				timestamp: Date.now(),
			});
		}
	}

	/**
	 * Subscribes to game events for a bot
	 */
	private subscribeToGameEvents(connection: BotConnection): void {
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
	 * Handles game events and forwards them to appropriate bots
	 */
	private handleGameEvent(connection: BotConnection, event: GameEvent): void {
		if (!connection.isConnected) {
			return;
		}

		// Send event to the bot
		connection.socket.emit('gameEvent', {
			event,
			timestamp: Date.now(),
		});

		// Handle specific events
		switch (event.type) {
			case 'hand_started':
				this.sendGameState(connection);
				// Immediately start timer if it's this player's turn after blinds
				if (event.gameState?.currentPlayerToAct === connection.playerId) {
					this.startTurnTimer(connection);
				}
				break;

			case 'action_taken':
				this.sendGameState(connection);

				// Check if it's this bot's turn
				if (event.gameState?.currentPlayerToAct === connection.playerId) {
					this.startTurnTimer(connection);
				}
				break;

			case 'flop_dealt':
			case 'turn_dealt':
			case 'river_dealt':
				this.sendGameState(connection);
				if (event.gameState?.currentPlayerToAct === connection.playerId) {
					this.startTurnTimer(connection);
				}
				break;

			case 'showdown_complete':
			case 'hand_complete':
				this.sendGameState(connection);
				this.clearTurnTimer(connection.playerId);
				break;
		}
	}

	/**
	 * Starts a turn timer for a bot
	 */
	private startTurnTimer(connection: BotConnection): void {
		if (!connection.gameId) {
			return;
		}

		// Clear existing timers first
		this.clearTurnTimer(connection.playerId);

		// Get configuration
		const game = this.gameController.getGame(connection.gameId);
		if (!game) {
			return;
		}

		const timeLimitMs = game.getConfig().turnTimeLimit * 1000;
		const warningDelayMs = timeLimitMs * 0.7; // send warning when 70% of time has elapsed

		// Turn start notification
		connection.socket.emit('turnStart', {
			timeLimit: timeLimitMs / 1000,
			timestamp: Date.now(),
		});

		// Warning timer - only set if there's enough time for a meaningful warning
		let warningTimer: NodeJS.Timeout | undefined;
		if (timeLimitMs > 1000) {
			// Only warn if timeout is longer than 1 second
			warningTimer = setTimeout(() => {
				connection.socket.emit('turnWarning', {
					timeRemaining: (timeLimitMs - warningDelayMs) / 1000,
					timestamp: Date.now(),
				});
			}, warningDelayMs);
		}

		// Timeout timer
		const timeoutTimer = setTimeout(() => {
			this.handleTurnTimeout(connection);
		}, timeLimitMs);

		// Store timers
		if (warningTimer) {
			this.warningTimers.set(connection.playerId, warningTimer);
			connection.warningTimer = warningTimer;
		}
		this.turnTimers.set(connection.playerId, timeoutTimer);
		connection.turnTimer = timeoutTimer;
	}

	/**
	 * Clears turn timer for a player
	 */
	private clearTurnTimer(playerId: PlayerId): void {
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
	}

	/**
	 * Handles turn timeout
	 */
	private handleTurnTimeout(connection: BotConnection): void {
		if (!connection.gameId) {
			return;
		}

		// Clear timers first to avoid duplicate actions
		this.clearTurnTimer(connection.playerId);

		// Send timeout notification
		connection.socket.emit('turnTimeout', {
			timestamp: Date.now(),
		});

		// Force action through game controller
		try {
			this.gameController.forcePlayerAction(connection.gameId, connection.playerId);
		} catch (error) {
			// Log error but don't crash - game should continue functioning
			console.error(`Force action failed for player ${connection.playerId}:`, error);

			// Notify the player that force action failed
			connection.socket.emit('forceActionError', {
				error: error instanceof Error ? error.message : 'Unknown error',
				timestamp: Date.now(),
			});
		}
	}

	/**
	 * Handles bot disconnection
	 */
	private handleDisconnection(connection: BotConnection): void {
		connection.isConnected = false;

		// Clear timers
		this.clearTurnTimer(connection.playerId);

		// Unsubscribe from game events
		if (connection.gameId && connection.eventHandler) {
			try {
				this.gameController.unsubscribeFromGame(connection.gameId, connection.eventHandler);
			} catch (error) {
				// Log error but don't prevent cleanup
				console.error(
					`Failed to unsubscribe from game events for player ${connection.playerId}:`,
					error
				);
			}
			// Clear the handler reference to prevent memory leaks
			connection.eventHandler = undefined;
		}

		// Remove from connections
		this.connections.delete(connection.socket.id);

		// Note: We don't remove the player from the game immediately
		// to allow for reconnection attempts
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
		for (const connection of this.connections.values()) {
			if (connection.gameId === gameId && connection.isConnected) {
				connection.socket.emit(event, data);
			}
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
	} {
		const totalConnections = this.connections.size;
		const activeConnections = Array.from(this.connections.values()).filter(
			(c) => c.isConnected
		).length;
		const botsInGames = Array.from(this.connections.values()).filter(
			(c) => c.gameId && c.isConnected
		).length;
		const activeTurnTimers = this.turnTimers.size;

		return {
			totalConnections,
			activeConnections,
			botsInGames,
			activeTurnTimers,
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

		for (const [socketId, connection] of this.connections) {
			const shouldRemove =
				!connection.isConnected ||
				(connection.lastAction && now - connection.lastAction > inactiveThreshold);

			if (shouldRemove) {
				connectionsToRemove.push(connection);
			}
		}

		// Remove inactive connections
		for (const connection of connectionsToRemove) {
			this.handleDisconnection(connection);
		}
	}
}
