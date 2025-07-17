/**
 * PokaiEngine Bot SDK - Core Bot Client
 * 
 * A comprehensive, developer-friendly client for building poker bots
 */

import { EventEmitter } from 'events';
import { io, Socket } from 'socket.io-client';
import {
	BotConfig,
	BotCredentials,
	JoinGameOptions,
	GameState,
	Action,
	ActionType,
	PossibleAction,
	GameEvent,
	GameInfo,
	BotEventHandlers,
	AuthResponse,
	GameListResponse,
	PokaiError,
	AuthenticationError,
	GameError,
	ConnectionError,
	Logger,
	LogLevel
} from './types.js';

/**
 * Default logger implementation
 */
class DefaultLogger implements Logger {
	constructor(private level: LogLevel = 'info', private prefix: string = '[PokaiBot]') {}

	private shouldLog(level: LogLevel): boolean {
		const levels = ['debug', 'info', 'warn', 'error'];
		return levels.indexOf(level) >= levels.indexOf(this.level);
	}

	debug(message: string, ...args: any[]): void {
		if (this.shouldLog('debug')) console.debug(`${this.prefix} ${message}`, ...args);
	}

	info(message: string, ...args: any[]): void {
		if (this.shouldLog('info')) console.info(`${this.prefix} ${message}`, ...args);
	}

	warn(message: string, ...args: any[]): void {
		if (this.shouldLog('warn')) console.warn(`${this.prefix} ${message}`, ...args);
	}

	error(message: string, ...args: any[]): void {
		if (this.shouldLog('error')) console.error(`${this.prefix} ${message}`, ...args);
	}
}

/**
 * Main PokaiBot client class
 */
export class PokaiBot extends EventEmitter {
	private socket: Socket | null = null;
	private config: Required<BotConfig>;
	private logger: Logger;
	private isAuthenticated = false;
	private currentGameId: string | null = null;
	private currentPlayerId: string | null = null;
	private currentGameState: GameState | null = null;
	private reconnectAttempts = 0;
	private isReconnecting = false;
	private actionTimeout: NodeJS.Timeout | null = null;

	constructor(config: BotConfig, logger?: Logger) {
		super();

		// Set default configuration
		this.config = {
			credentials: config.credentials,
			serverUrl: config.serverUrl || 'http://localhost:3000',
			reconnectAttempts: config.reconnectAttempts || 5,
			reconnectDelay: config.reconnectDelay || 2000,
			actionTimeout: config.actionTimeout || 25000, // 25 seconds (5s buffer before server timeout)
			debug: config.debug ?? false
		};

		this.logger = logger || new DefaultLogger(
			this.config.debug ? 'debug' : 'info',
			`[PokaiBot:${this.config.credentials.botId}]`
		);

		this.logger.debug('Bot client initialized', { config: this.config });
	}

	// === Connection Management ===

	/**
	 * Connect to the PokaiEngine server
	 */
	async connect(): Promise<void> {
		if (this.socket?.connected) {
			this.logger.warn('Already connected to server');
			return;
		}

		this.logger.info('Connecting to server...');

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new ConnectionError('Connection timeout'));
			}, 10000);

			this.socket = io(this.config.serverUrl, {
				transports: ['websocket', 'polling'],
				reconnection: false, // We handle reconnection manually
				timeout: 10000
			});

			this.setupSocketHandlers();

			this.socket.once('connect', () => {
				clearTimeout(timeout);
				this.logger.info('Connected to server');
				this.authenticate()
					.then(() => resolve())
					.catch(reject);
			});

			this.socket.once('connect_error', (error) => {
				clearTimeout(timeout);
				this.logger.error('Connection failed', error);
				reject(new ConnectionError(`Failed to connect: ${error.message}`));
			});
		});
	}

	/**
	 * Disconnect from the server
	 */
	disconnect(): void {
		this.logger.info('Disconnecting from server');
		this.isAuthenticated = false;
		this.currentGameId = null;
		this.currentPlayerId = null;
		this.currentGameState = null;
		this.clearActionTimeout();

		if (this.socket) {
			this.socket.disconnect();
			this.socket = null;
		}
	}

	/**
	 * Check if bot is connected and authenticated
	 */
	isReady(): boolean {
		return (this.socket?.connected ?? false) && this.isAuthenticated;
	}

	// === Authentication ===

	/**
	 * Authenticate with the server
	 */
	private async authenticate(): Promise<void> {
		if (!this.socket) {
			throw new ConnectionError('Not connected to server');
		}

		this.logger.info('Authenticating...');

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new AuthenticationError('Authentication timeout'));
			}, 5000);

			const onSuccess = (data: AuthResponse) => {
				clearTimeout(timeout);
				this.isAuthenticated = true;
				this.currentPlayerId = data.playerId;
				this.logger.info(`Authenticated successfully as ${data.botName} (${data.playerId})`);
				resolve();
			};

			const onError = (data: { message: string }) => {
				clearTimeout(timeout);
				this.logger.error('Authentication failed', data.message);
				reject(new AuthenticationError(data.message));
			};

			this.socket!.once('auth.login.success', onSuccess);
			this.socket!.once('auth.login.error', onError);

			this.socket!.emit('auth.login', {
				botId: this.config.credentials.botId,
				apiKey: this.config.credentials.apiKey
			});
		});
	}

	// === Game Management ===

	/**
	 * Get list of available games
	 */
	async getGames(): Promise<GameInfo[]> {
		if (!this.isReady()) {
			throw new ConnectionError('Bot is not connected and authenticated');
		}

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new GameError('Get games request timeout'));
			}, 5000);

			const onSuccess = (data: GameListResponse) => {
				clearTimeout(timeout);
				resolve(data.games);
			};

			this.socket!.once('game.list.success', onSuccess);
			this.socket!.emit('game.list', {});
		});
	}

	/**
	 * Join a game
	 */
	async joinGame(options: JoinGameOptions): Promise<void> {
		if (!this.isReady()) {
			throw new ConnectionError('Bot is not connected and authenticated');
		}

		if (this.currentGameId) {
			throw new GameError('Already in a game. Leave current game first.');
		}

		this.logger.info(`Joining game ${options.gameId} with ${options.chipStack} chips`);

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new GameError('Join game request timeout'));
			}, 10000);

			const onSuccess = (data: any) => {
				clearTimeout(timeout);
				this.currentGameId = options.gameId;
				this.currentPlayerId = data.playerId;
				this.logger.info(`Successfully joined game ${options.gameId}`);
				resolve();
			};

			const onError = (data: { error: string }) => {
				clearTimeout(timeout);
				this.logger.error('Failed to join game', data.error);
				reject(new GameError(data.error));
			};

			this.socket!.once('game.join.success', onSuccess);
			this.socket!.once('game.join.error', onError);

			this.socket!.emit('game.join', {
				gameId: options.gameId,
				chipStack: options.chipStack
			});
		});
	}

	/**
	 * Leave the current game
	 */
	async leaveGame(): Promise<void> {
		if (!this.currentGameId) {
			throw new GameError('Not currently in a game');
		}

		this.logger.info(`Leaving game ${this.currentGameId}`);

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new GameError('Leave game request timeout'));
			}, 5000);

			const onSuccess = () => {
				clearTimeout(timeout);
				this.currentGameId = null;
				this.currentGameState = null;
				this.clearActionTimeout();
				this.logger.info('Successfully left game');
				resolve();
			};

			const onError = (data: { error: string }) => {
				clearTimeout(timeout);
				this.logger.error('Failed to leave game', data.error);
				reject(new GameError(data.error));
			};

			this.socket!.once('game.leave.success', onSuccess);
			this.socket!.once('game.leave.error', onError);

			this.socket!.emit('game.leave', {});
		});
	}

	// === Game Actions ===

	/**
	 * Submit an action to the game
	 */
	async submitAction(actionType: ActionType, amount?: number): Promise<void> {
		if (!this.currentGameId) {
			throw new GameError('Not currently in a game');
		}

		const action: Action = {
			type: actionType,
			timestamp: Date.now(),
			...(amount && { amount })
		};

		this.logger.debug(`Submitting action: ${actionType}${amount ? ` (${amount})` : ''}`);

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new GameError('Action submission timeout'));
			}, 5000);

			const onSuccess = (data: { action: Action }) => {
				clearTimeout(timeout);
				this.clearActionTimeout();
				this.logger.info(`Action successful: ${data.action.type}${data.action.amount ? ` (${data.action.amount})` : ''}`);
				resolve();
			};

			const onError = (data: { error: string }) => {
				clearTimeout(timeout);
				this.logger.error('Action failed', data.error);
				reject(new GameError(data.error));
			};

			this.socket!.once('action.submit.success', onSuccess);
			this.socket!.once('action.submit.error', onError);

			this.socket!.emit('action.submit', { action });
		});
	}

	/**
	 * Get possible actions for the current turn
	 */
	async getPossibleActions(): Promise<PossibleAction[]> {
		if (!this.currentGameId) {
			throw new GameError('Not currently in a game');
		}

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new GameError('Get possible actions timeout'));
			}, 5000);

			const onSuccess = (data: { possibleActions: PossibleAction[] }) => {
				clearTimeout(timeout);
				resolve(data.possibleActions);
			};

			const onError = (data: { error: string }) => {
				clearTimeout(timeout);
				reject(new GameError(data.error));
			};

			this.socket!.once('state.actions.success', onSuccess);
			this.socket!.once('state.actions.error', onError);

			this.socket!.emit('state.actions', {});
		});
	}

	/**
	 * Get current game state
	 */
	async getGameState(): Promise<GameState> {
		if (!this.currentGameId) {
			throw new GameError('Not currently in a game');
		}

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new GameError('Get game state timeout'));
			}, 5000);

			const onSuccess = (data: { gameState: GameState }) => {
				clearTimeout(timeout);
				this.currentGameState = data.gameState;
				resolve(data.gameState);
			};

			const onError = (data: { error: string }) => {
				clearTimeout(timeout);
				reject(new GameError(data.error));
			};

			this.socket!.once('state.current.success', onSuccess);
			this.socket!.once('state.current.error', onError);

			this.socket!.emit('state.current', {});
		});
	}

	// === Utility Methods ===

	/**
	 * Get current game ID
	 */
	getCurrentGameId(): string | null {
		return this.currentGameId;
	}

	/**
	 * Get current player ID
	 */
	getCurrentPlayerId(): string | null {
		return this.currentPlayerId;
	}

	/**
	 * Get cached game state (updated automatically)
	 */
	getCachedGameState(): GameState | null {
		return this.currentGameState;
	}

	/**
	 * Set event handlers for bot events
	 */
	setEventHandlers(handlers: BotEventHandlers): void {
		Object.entries(handlers).forEach(([event, handler]) => {
			if (handler) {
				this.on(event.replace('on', '').toLowerCase(), handler);
			}
		});
	}

	// === Private Methods ===

	private setupSocketHandlers(): void {
		if (!this.socket) return;

		// Game events
		this.socket.on('game.join.success', (data) => {
			this.emit('gamejoined', data);
		});

		this.socket.on('turn.start', (data) => {
			this.logger.info(`Turn started - ${data.timeLimit}s time limit`);
			this.startActionTimeout(data.timeLimit);
			this.emit('turnstart', data);
		});

		this.socket.on('turn.warning', (data) => {
			this.logger.warn(`Turn warning - ${data.timeRemaining}s remaining`);
			this.emit('turnwarning', data);
		});

		this.socket.on('state.current.success', (data) => {
			this.currentGameState = data.gameState;
			this.emit('gamestate', data.gameState);
		});

		this.socket.on('event.game', (data) => {
			this.emit('gameevent', data.event);
		});

		this.socket.on('action.submit.success', (data) => {
			this.emit('actionsuccess', data.action);
		});

		this.socket.on('action.submit.error', (data) => {
			this.emit('actionerror', data.error);
		});

		// Error handling
		this.socket.on('system.error', (data) => {
			this.logger.error('System error', data);
			this.emit('error', data.message, data.code);
		});

		// Connection events
		this.socket.on('disconnect', (reason) => {
			this.logger.warn('Disconnected', reason);
			this.isAuthenticated = false;
			this.clearActionTimeout();
			this.emit('disconnected', reason);
			this.handleReconnection();
		});

		this.socket.on('connect', () => {
			if (this.isReconnecting) {
				this.logger.info('Reconnected to server');
				this.isReconnecting = false;
				this.reconnectAttempts = 0;
				this.emit('reconnected');
			}
		});
	}

	private startActionTimeout(timeLimit: number): void {
		this.clearActionTimeout();
		
		// Set timeout for 80% of time limit to give buffer for action submission
		const timeoutMs = timeLimit * 800;
		this.actionTimeout = setTimeout(() => {
			this.logger.warn('Action timeout approaching, consider implementing automatic fallback action');
		}, timeoutMs);
	}

	private clearActionTimeout(): void {
		if (this.actionTimeout) {
			clearTimeout(this.actionTimeout);
			this.actionTimeout = null;
		}
	}

	private async handleReconnection(): Promise<void> {
		if (this.isReconnecting || this.reconnectAttempts >= this.config.reconnectAttempts) {
			return;
		}

		this.isReconnecting = true;
		this.reconnectAttempts++;

		this.logger.info(`Attempting reconnection ${this.reconnectAttempts}/${this.config.reconnectAttempts}`);

		setTimeout(async () => {
			try {
				await this.connect();
				if (this.currentGameId) {
					// Try to rejoin the game
					await this.getGameState(); // This will update our state
				}
			} catch (error) {
				this.logger.error('Reconnection failed', error);
				if (this.reconnectAttempts < this.config.reconnectAttempts) {
					this.handleReconnection();
				} else {
					this.logger.error('Max reconnection attempts reached');
					this.emit('error', 'Max reconnection attempts reached', 'RECONNECTION_FAILED');
				}
			}
		}, this.config.reconnectDelay);
	}
}