import { 
	Action, 
	Card, 
	GameEvent, 
	GameId, 
	GameState, 
	HandEvaluation, 
	PlayerId,
	ReplayEvent,
	ReplayData,
	ReplayMetadata,
	ReplayCheckpoint,
	HandReplayData,
	PlayerDecisionContext,
	GameConfig,
	Position,
	GamePhase,
	PossibleAction
} from '@/domain/types';
import { ReplayService } from '@/application/services/ReplayService';
import { IGameMetadata, IGameEvent } from '@/infrastructure/persistence/models/Replay';
import { replayLogger } from './Logger';
import * as fs from 'fs';
import * as path from 'path';

export interface ReplayStorageConfig {
	enabled: boolean;
	directory: string;
	autoSave: boolean;
	compressOldReplays: boolean;
	maxReplaysInMemory: number;
	checkpointInterval: number; // Events between checkpoints
	mongoEnabled: boolean; // New option for MongoDB integration
	silent?: boolean; // Disable logging for tests
}

export interface GameLogEntry {
	gameId: GameId;
	replayData: ReplayData;
	isActive: boolean;
}

/**
 * Enhanced GameLogger with comprehensive replay functionality
 * Captures detailed game state, player decisions, and timing information
 */
export class EnhancedGameLogger {
	private logs: Map<GameId, GameLogEntry> = new Map();
	private config: ReplayStorageConfig;
	private sequenceCounter: number = 0;
	private replayService: ReplayService | null = null;
	
	constructor(config?: Partial<ReplayStorageConfig>) {
		this.config = {
			enabled: true,
			directory: './replays',
			autoSave: false,
			compressOldReplays: false,
			maxReplaysInMemory: 100,
			checkpointInterval: 50,
			mongoEnabled: true, // Enable MongoDB by default
			...config
		};
		
		// Ensure replay directory exists
		if (this.config.enabled && this.config.directory) {
			this.ensureDirectoryExists(this.config.directory);
		}

		// Initialize MongoDB replay service if enabled
		if (this.config.mongoEnabled) {
			this.initializeReplayService();
		}
	}

	private log(message: string): void {
		replayLogger.info(message);
	}

	private logError(message: string, error?: any): void {
		replayLogger.error(message, error);
	}

	private async initializeReplayService(): Promise<void> {
		try {
			this.replayService = new ReplayService();
			await this.replayService.initialize();
			this.log('MongoDB replay service initialized');
		} catch (error) {
			this.logError('Failed to initialize MongoDB replay service, falling back to file-only logging:', error);
			this.replayService = null;
		}
	}

	/**
	 * Starts logging for a new game with enhanced replay capabilities
	 */
	async startGame(
		gameId: GameId,
		gameConfig: GameConfig,
		initialGameState: GameState,
		playerNames: Map<PlayerId, string>
	): Promise<void> {
		const now = new Date();
		
		const metadata: ReplayMetadata = {
			gameConfig: this.cloneObject(gameConfig),
			playerNames: Object.fromEntries(playerNames),
			handCount: 0,
			totalEvents: 0,
			totalActions: 0,
			gameDuration: 0,
			createdAt: now,
			version: '1.0.0'
		};

		const replayData: ReplayData = {
			gameId,
			startTime: now,
			events: [],
			initialGameState: this.cloneGameState(initialGameState),
			metadata,
			checkpoints: []
		};

		const entry: GameLogEntry = {
			gameId,
			replayData,
			isActive: true
		};

		this.logs.set(gameId, entry);
		
		// Create MongoDB replay if service is available
		if (this.replayService) {
			try {
				const mongoMetadata: IGameMetadata = {
					gameId,
					gameType: gameConfig.isTournament ? 'tournament' : 'cash',
					maxPlayers: gameConfig.maxPlayers,
					actualPlayers: initialGameState.players.length,
					smallBlindAmount: gameConfig.smallBlindAmount,
					bigBlindAmount: gameConfig.bigBlindAmount,
					turnTimeLimit: gameConfig.turnTimeLimit,
					gameStartTime: now.getTime(),
					gameEndTime: 0,
					gameDuration: 0,
					totalHands: 0,
					totalActions: 0,
					playerNames: Object.fromEntries(playerNames),
					winners: []
				};

				const initialEvents: IGameEvent[] = [{
					type: 'game_started',
					timestamp: now.getTime(),
					data: {
						gameConfig,
						initialGameState,
						playerNames: Object.fromEntries(playerNames)
					}
				}];

				await this.replayService.createReplay({
					gameId,
					metadata: mongoMetadata,
					events: initialEvents
				});

				this.log(`Created MongoDB replay for game: ${gameId}`);
			} catch (error) {
				this.logError(`Failed to create MongoDB replay for game ${gameId}:`, error);
			}
		}
		
		// Log game start event
		this.logEvent(gameId, {
			type: 'game_started',
			timestamp: now.getTime(),
			handNumber: 0,
			gameState: initialGameState
		});

		this.log(`Started logging for game: ${gameId}`);
	}

	/**
	 * Logs a game event with enhanced replay information
	 */
	async logEvent(
		gameId: GameId, 
		event: GameEvent, 
		gameStateBefore?: GameState,
		gameStateAfter?: GameState,
		playerDecisionContext?: PlayerDecisionContext
	): Promise<void> {
		const entry = this.logs.get(gameId);
		if (!entry || !this.config.enabled) {
			return;
		}

		const replayEvent: ReplayEvent = {
			...this.cloneEvent(event),
			sequenceId: ++this.sequenceCounter,
			gameStateBefore: gameStateBefore ? this.cloneGameState(gameStateBefore) : undefined,
			gameStateAfter: gameStateAfter ? this.cloneGameState(gameStateAfter) : undefined,
			playerDecisionContext: playerDecisionContext ? this.cloneObject(playerDecisionContext) : undefined
		};

		// Calculate event duration if we have before/after timestamps
		if (entry.replayData.events.length > 0) {
			const lastEvent = entry.replayData.events[entry.replayData.events.length - 1];
			replayEvent.eventDuration = event.timestamp - lastEvent.timestamp;
		}

		entry.replayData.events.push(replayEvent);
		entry.replayData.metadata.totalEvents++;

		// Update metadata
		if (event.action) {
			entry.replayData.metadata.totalActions++;
		}

		if (event.type === 'hand_started') {
			entry.replayData.metadata.handCount++;
		}

		// Add to MongoDB if service is available
		if (this.replayService) {
			try {
				const mongoEvent: IGameEvent = {
					type: event.type,
					timestamp: event.timestamp,
					data: {
						action: event.action,
						gameState: event.gameState,
						gameStateBefore,
						gameStateAfter,
						playerDecisionContext,
						eventDuration: replayEvent.eventDuration,
						...event
					},
					phase: event.phase?.toString(),
					handNumber: event.handNumber,
					playerId: event.playerId
				};

				await this.replayService.addEvents(gameId, [mongoEvent]);
			} catch (error) {
				this.logError(`Failed to add event to MongoDB for game ${gameId}:`, error);
			}
		}

		// Create checkpoint if needed
		if (this.shouldCreateCheckpoint(entry.replayData)) {
			this.createCheckpoint(entry.replayData, replayEvent);
		}

		// Memory management
		this.manageMemory();
	}

	/**
	 * Logs a player decision with context for analysis
	 */
	async logPlayerDecision(
		gameId: GameId,
		playerId: PlayerId,
		action: Action,
		possibleActions: PossibleAction[],
		gameStateBefore: GameState,
		gameStateAfter: GameState,
		timeToDecide: number,
		equity?: { before: number; after: number }
	): Promise<void> {
		const player = gameStateBefore.players.find(p => p.id === playerId);
		if (!player) return;

		const potSize = gameStateBefore.pots.reduce((sum, pot) => sum + pot.amount, 0);
		const callAmount = this.getCallAmount(possibleActions);
		
		const decisionContext: PlayerDecisionContext = {
			playerId,
			possibleActions: this.cloneObject(possibleActions),
			timeToDecide,
			equityBefore: equity?.before,
			equityAfter: equity?.after,
			position: player.position || Position.Button,
			chipStack: player.chipStack,
			potOdds: callAmount > 0 ? callAmount / (potSize + callAmount) : 0,
			effectiveStackSize: Math.min(player.chipStack, this.getMaxOpponentStack(gameStateBefore, playerId))
		};

		const gameEvent: GameEvent = {
			type: 'action_taken',
			playerId,
			action,
			timestamp: Date.now(),
			handNumber: gameStateBefore.handNumber,
			phase: gameStateBefore.currentPhase,
			gameState: gameStateAfter
		};

		await this.logEvent(gameId, gameEvent, gameStateBefore, gameStateAfter, decisionContext);
	}

	/**
	 * Ends logging for a game
	 */
	async endGame(gameId: GameId, finalGameState: GameState): Promise<void> {
		const entry = this.logs.get(gameId);
		if (!entry) return;

		const now = new Date();
		entry.replayData.endTime = now;
		entry.replayData.finalGameState = this.cloneGameState(finalGameState);
		entry.replayData.metadata.gameDuration = now.getTime() - entry.replayData.startTime.getTime();
		entry.isActive = false;

		// Calculate final statistics
		this.calculateFinalStatistics(entry.replayData);

		// Log game end event
		await this.logEvent(gameId, {
			type: 'game_ended',
			timestamp: now.getTime(),
			handNumber: finalGameState.handNumber,
			gameState: finalGameState
		});

		// Auto-save if configured
		if (this.config.autoSave) {
			this.saveReplayToFile(gameId);
		}

		this.log(`Ended logging for game: ${gameId} (${entry.replayData.metadata.totalEvents} events)`);
	}

	/**
	 * Gets the complete replay data for a game
	 */
	getReplayData(gameId: GameId): ReplayData | undefined {
		const entry = this.logs.get(gameId);
		return entry ? this.cloneObject(entry.replayData) : undefined;
	}

	/**
	 * Gets replay data for a specific hand
	 */
	getHandReplayData(gameId: GameId, handNumber: number): HandReplayData | undefined {
		const entry = this.logs.get(gameId);
		if (!entry) return undefined;

		const handEvents = entry.replayData.events.filter(e => e.handNumber === handNumber);
		if (handEvents.length === 0) return undefined;

		const startEvent = handEvents.find(e => e.type === 'hand_started');
		const endEvent = handEvents.find(e => e.type === 'hand_complete');
		
		if (!startEvent || !endEvent) return undefined;

		const playersInvolved = new Set<PlayerId>();
		handEvents.forEach(e => {
			if (e.playerId) playersInvolved.add(e.playerId);
			if (e.gameStateAfter) {
				e.gameStateAfter.players.forEach(p => playersInvolved.add(p.id));
			}
		});

		const finalBoard = this.getFinalBoard(handEvents);
		const winners = this.extractWinners(handEvents);
		const potSize = this.getFinalPotSize(handEvents);

		return {
			handNumber,
			startTime: new Date(startEvent.timestamp),
			endTime: new Date(endEvent.timestamp),
			events: this.cloneObject(handEvents),
			playersInvolved: Array.from(playersInvolved),
			initialState: startEvent.gameStateAfter || startEvent.gameStateBefore!,
			finalState: endEvent.gameStateAfter || endEvent.gameStateBefore!,
			communityCards: finalBoard,
			winners,
			potSize,
			showdownResults: this.extractShowdownResults(handEvents)
		};
	}

	/**
	 * Saves replay data to file
	 */
	saveReplayToFile(gameId: GameId): boolean {
		const entry = this.logs.get(gameId);
		if (!entry || !this.config.directory) return false;

		try {
			const filename = `${gameId}_${entry.replayData.startTime.toISOString().replace(/[:.]/g, '-')}.json`;
			const filepath = path.join(this.config.directory, filename);
			
			const jsonData = JSON.stringify(entry.replayData, null, 2);
			fs.writeFileSync(filepath, jsonData);
			
			this.log(`Saved replay to: ${filepath}`);
			return true;
		} catch (error) {
			this.logError(`Failed to save replay:`, error);
			return false;
		}
	}

	/**
	 * Loads replay data from file
	 */
	loadReplayFromFile(filepath: string): ReplayData | undefined {
		try {
			const jsonData = fs.readFileSync(filepath, 'utf8');
			const replayData: ReplayData = JSON.parse(jsonData);
			
			// Convert date strings back to Date objects
			replayData.startTime = new Date(replayData.startTime);
			if (replayData.endTime) {
				replayData.endTime = new Date(replayData.endTime);
			}
			replayData.metadata.createdAt = new Date(replayData.metadata.createdAt);
			
			return replayData;
		} catch (error) {
			this.logError(`Failed to load replay:`, error);
			return undefined;
		}
	}

	/**
	 * Gets all available replay files
	 */
	listAvailableReplays(): string[] {
		if (!this.config.directory || !fs.existsSync(this.config.directory)) {
			return [];
		}

		try {
			return fs.readdirSync(this.config.directory)
				.filter(file => file.endsWith('.json'))
				.map(file => path.join(this.config.directory, file));
		} catch (error) {
			this.logError(`Failed to list replays:`, error);
			return [];
		}
	}

	/**
	 * Exports replay in various formats
	 */
	exportReplay(gameId: GameId, format: 'json' | 'compressed' = 'json'): string | Buffer | undefined {
		const entry = this.logs.get(gameId);
		if (!entry) return undefined;

		switch (format) {
			case 'json':
				return JSON.stringify(entry.replayData, null, 2);
			case 'compressed':
				// TODO: Implement compression (gzip)
				return JSON.stringify(entry.replayData);
			default:
				return undefined;
		}
	}

	/**
	 * Creates a checkpoint for faster seeking
	 */
	private createCheckpoint(replayData: ReplayData, currentEvent: ReplayEvent): void {
		if (!currentEvent.gameStateAfter) return;

		const checkpoint: ReplayCheckpoint = {
			sequenceId: currentEvent.sequenceId,
			handNumber: currentEvent.handNumber,
			phase: currentEvent.gameStateAfter.currentPhase,
			gameState: this.cloneGameState(currentEvent.gameStateAfter),
			timestamp: currentEvent.timestamp,
			eventIndex: replayData.events.length - 1
		};

		replayData.checkpoints = replayData.checkpoints || [];
		replayData.checkpoints.push(checkpoint);
	}

	/**
	 * Determines if a checkpoint should be created
	 */
	private shouldCreateCheckpoint(replayData: ReplayData): boolean {
		return replayData.events.length % this.config.checkpointInterval === 0;
	}

	/**
	 * Manages memory by removing old inactive replays
	 */
	private manageMemory(): void {
		const activeCount = Array.from(this.logs.values()).filter(entry => entry.isActive).length;
		const totalCount = this.logs.size;

		if (totalCount > this.config.maxReplaysInMemory) {
			// Remove oldest inactive replays
			const inactiveEntries = Array.from(this.logs.entries())
				.filter(([_, entry]) => !entry.isActive)
				.sort(([_, a], [__, b]) => a.replayData.startTime.getTime() - b.replayData.startTime.getTime());

			const toRemove = Math.min(inactiveEntries.length, totalCount - this.config.maxReplaysInMemory);
			
			for (let i = 0; i < toRemove; i++) {
				const [gameId] = inactiveEntries[i];
				this.logs.delete(gameId);
			}

			if (toRemove > 0) {
				this.log(`Removed ${toRemove} old replays from memory`);
			}
		}
	}

	/**
	 * Calculates final statistics for the replay
	 */
	private calculateFinalStatistics(replayData: ReplayData): void {
		const handDurations: number[] = [];
		let currentHandStart = 0;

		// Calculate average hand duration
		for (const event of replayData.events) {
			if (event.type === 'hand_started') {
				currentHandStart = event.timestamp;
			} else if (event.type === 'hand_complete' && currentHandStart > 0) {
				handDurations.push(event.timestamp - currentHandStart);
			}
		}

		if (handDurations.length > 0) {
			replayData.metadata.avgHandDuration = handDurations.reduce((sum, duration) => sum + duration, 0) / handDurations.length;
		}

		// Calculate winners and final chip counts
		if (replayData.finalGameState) {
			replayData.metadata.finalChipCounts = {};
			replayData.finalGameState.players.forEach(player => {
				replayData.metadata.finalChipCounts![player.id] = player.chipStack;
			});
		}
	}

	/**
	 * Helper methods
	 */
	private cloneGameState(gameState: GameState): GameState {
		if (!gameState) {
			throw new Error('Cannot clone undefined game state');
		}
		return JSON.parse(JSON.stringify(gameState));
	}

	private cloneEvent(event: GameEvent): GameEvent {
		return JSON.parse(JSON.stringify(event));
	}

	private cloneObject<T>(obj: T): T {
		return JSON.parse(JSON.stringify(obj));
	}

	private ensureDirectoryExists(directory: string): void {
		if (!fs.existsSync(directory)) {
			fs.mkdirSync(directory, { recursive: true });
		}
	}

	private getCallAmount(possibleActions: PossibleAction[]): number {
		const callAction = possibleActions.find(a => a.type === 'call');
		return callAction?.minAmount || 0;
	}

	private getMaxOpponentStack(gameState: GameState, playerId: PlayerId): number {
		return Math.max(...gameState.players
			.filter(p => p.id !== playerId && p.isActive)
			.map(p => p.chipStack));
	}

	private getFinalBoard(events: ReplayEvent[]): Card[] {
		for (let i = events.length - 1; i >= 0; i--) {
			const event = events[i];
			if (event.gameStateAfter && event.gameStateAfter.communityCards.length > 0) {
				return event.gameStateAfter.communityCards;
			}
		}
		return [];
	}

	private extractWinners(events: ReplayEvent[]): { playerId: PlayerId; handDescription?: string; winAmount: number }[] {
		// TODO: Extract winner information from hand_complete events
		return [];
	}

	private getFinalPotSize(events: ReplayEvent[]): number {
		for (let i = events.length - 1; i >= 0; i--) {
			const event = events[i];
			if (event.gameStateAfter) {
				return event.gameStateAfter.pots.reduce((sum, pot) => sum + pot.amount, 0);
			}
		}
		return 0;
	}

	private extractShowdownResults(events: ReplayEvent[]): Record<PlayerId, HandEvaluation> | undefined {
		// TODO: Extract showdown results from events
		return undefined;
	}

	/**
	 * MongoDB integration methods
	 */
	
	async getMongoReplay(gameId: GameId): Promise<any | null> {
		if (!this.replayService) {
			return null;
		}

		try {
			return await this.replayService.getReplay(gameId);
		} catch (error) {
			this.logError(`Failed to get MongoDB replay for game ${gameId}:`, error);
			return null;
		}
	}

	async getReplayAnalysis(gameId: GameId): Promise<any | null> {
		if (!this.replayService) {
			return null;
		}

		try {
			return await this.replayService.getAnalysis(gameId);
		} catch (error) {
			this.logError(`Failed to get replay analysis for game ${gameId}:`, error);
			return null;
		}
	}

	async getHandReplayFromMongo(gameId: GameId, handNumber: number): Promise<any | null> {
		if (!this.replayService) {
			return null;
		}

		try {
			return await this.replayService.getHandReplay(gameId, handNumber);
		} catch (error) {
			this.logError(`Failed to get hand replay for game ${gameId}, hand ${handNumber}:`, error);
			return null;
		}
	}

	async saveReplayToMongo(gameId: GameId): Promise<{ success: boolean; filePath?: string; error?: string }> {
		if (!this.replayService) {
			// Fallback to file-based saving
			return { success: this.saveReplayToFile(gameId) };
		}

		try {
			return await this.replayService.saveReplayToFile(gameId);
		} catch (error) {
			this.logError(`Failed to save replay to file for game ${gameId}:`, error);
			return { 
				success: false, 
				error: error instanceof Error ? error.message : 'Unknown error' 
			};
		}
	}

	async getRecentReplaysFromMongo(limit: number = 10): Promise<any[]> {
		if (!this.replayService) {
			return [];
		}

		try {
			return await this.replayService.getRecentReplays(limit);
		} catch (error) {
			this.logError('Failed to get recent replays:', error);
			return [];
		}
	}

	async getStorageStatistics(): Promise<any> {
		if (!this.replayService) {
			return {
				totalReplays: this.logs.size,
				memoryBased: true
			};
		}

		try {
			return await this.replayService.getStorageStatistics();
		} catch (error) {
			this.logError('Failed to get storage statistics:', error);
			return {
				totalReplays: 0,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	isMongoAvailable(): boolean {
		return this.replayService !== null;
	}

	async healthCheck(): Promise<{ memory: boolean; mongo: boolean }> {
		const memoryCheck = this.logs.size >= 0; // Simple check
		
		let mongoCheck = false;
		if (this.replayService) {
			try {
				mongoCheck = await this.replayService.healthCheck();
			} catch {
				mongoCheck = false;
			}
		}

		return { memory: memoryCheck, mongo: mongoCheck };
	}
}