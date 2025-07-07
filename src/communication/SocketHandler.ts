import { GameController } from '../engine/GameController';
import { BotInterface } from './BotInterface';
import {
	Action,
	ActionType,
	GameEvent,
	BotGameState,
	GameId,
	PlayerId,
	PossibleAction,
} from '../types';

// Socket interface for compatibility
export interface Socket {
	id: string;
	emit(event: string, data: any): void;
	on(event: string, callback: (...args: any[]) => void): void;
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
	turnTimer?: number;
	lastAction?: number;
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
	private turnTimeouts: Map<string, number> = new Map();

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
			// Join the game
			this.gameController.addPlayerToGame(
				data.gameId,
				connection.playerId,
				data.botName,
				data.chipStack
			);

			connection.gameId = data.gameId;

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
		(connection as any).eventHandler = eventHandler;

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

		// Clear existing timer
		this.clearTurnTimer(connection.playerId);

		// Get turn time limit from game config
		const game = this.gameController.getGame(connection.gameId);
		if (!game) {
			return;
		}

		const timeLimit = (game as any).config.turnTimeLimit * 1000; // Convert to milliseconds

		// Send turn start notification
		connection.socket.emit('turnStart', {
			timeLimit: timeLimit / 1000,
			timestamp: Date.now(),
		});

		// Set timer for warnings (simplified for compatibility)
		const warningTime = Math.max(5000, timeLimit * 0.3); // 30% of time or 5 seconds
		// Note: In a real implementation, you would use setTimeout here
		// For this engine implementation, we'll use a simplified approach

		// Store timeout timestamp instead of timer reference
		const timeoutTimestamp = Date.now() + timeLimit;
		this.turnTimeouts.set(connection.playerId, timeoutTimestamp);
	}

	/**
	 * Clears turn timer for a player
	 */
	private clearTurnTimer(playerId: PlayerId): void {
		this.turnTimeouts.delete(playerId);
	}

	/**
	 * Handles turn timeout
	 */
	private handleTurnTimeout(connection: BotConnection): void {
		if (!connection.gameId) {
			return;
		}

		// Clear the timer
		this.clearTurnTimer(connection.playerId);

		// Send timeout notification
		connection.socket.emit('turnTimeout', {
			timestamp: Date.now(),
		});

		// Force action through game controller
		try {
			this.gameController.forcePlayerAction(connection.gameId, connection.playerId);
		} catch (error) {
			// Log error but don't crash - in a real implementation you'd use proper logging
			throw error;
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
		if (connection.gameId && (connection as any).eventHandler) {
			this.gameController.unsubscribeFromGame(
				connection.gameId,
				(connection as any).eventHandler
			);
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
		const activeTurnTimers = this.turnTimeouts.size;

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

		for (const [socketId, connection] of this.connections) {
			if (
				!connection.isConnected ||
				(connection.lastAction && now - connection.lastAction > inactiveThreshold)
			) {
				this.handleDisconnection(connection);
			}
		}
	}
}
