import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

import { Card as CardClass } from '@/engine/poker/Card';
import { HandEvaluator } from '@/engine/poker/HandEvaluator';
import { replayLogger } from '@/services/logging/Logger';
import { ReplayService } from '@/services/replay/ReplayService';
import {
	IGameEvent,
	IGameMetadata,
} from '@/services/storage/models/Replay';
import {
	Card,
	GameId,
	GameState,
	HandEvaluation,
	HandReplayData,
	PlayerId,
	ReplayData,
	ReplayEvent,
} from '@/types';

export interface ReplayStorageConfig {
	directory: string;
	autoSave: boolean;
	mongoEnabled: boolean;
	fileEnabled: boolean; // New: explicitly control file storage
	preferMongo: boolean; // New: which storage to prefer when both available
}

/**
 * ReplayStorage handles all persistence operations for replay data.
 * Supports both file-based and MongoDB storage.
 */
export class ReplayStorage {
	private config: ReplayStorageConfig;
	private replayService: ReplayService | null = null;

	constructor(config?: Partial<ReplayStorageConfig>) {
		// Detect if we're in a test environment
		const isTestEnvironment =
			process.env.NODE_ENV === 'test' ||
			process.env.JEST_WORKER_ID !== undefined;

		// Default configuration with test environment adjustments
		const defaults: ReplayStorageConfig = {
			directory: './replays',
			autoSave: false,
			mongoEnabled: !isTestEnvironment, // Disable MongoDB in tests by default
			fileEnabled: true,
			preferMongo: !isTestEnvironment, // Prefer files in tests, MongoDB in production
		};

		this.config = {
			...defaults,
			...config,
		};

		// Log configuration in development
		if (process.env.NODE_ENV === 'development') {
			replayLogger.debug('ReplayStorage configuration:', {
				...this.config,
				isTestEnvironment,
			});
		}

		// Ensure replay directory exists if file storage is enabled
		if (this.config.fileEnabled && this.config.directory) {
			this.ensureDirectoryExists(this.config.directory);
		}

		// Initialize MongoDB replay service if enabled
		if (this.config.mongoEnabled) {
			this.initializeReplayService();
		}
	}

	/**
	 * Saves replay data to both file and MongoDB (if available)
	 */
	async saveReplay(
		replayData: ReplayData,
		compressed: boolean = false,
	): Promise<{
		fileSuccess: boolean;
		mongoSuccess: boolean;
		filePath?: string;
		error?: string;
	}> {
		const results = {
			fileSuccess: false,
			mongoSuccess: false,
			filePath: undefined as string | undefined,
			error: undefined as string | undefined,
		};

		// Ensure dates are proper Date objects (handle JSON serialization issue)
		const processedReplayData = this.ensureDatesAreValid(replayData);

		// Save to file if enabled
		if (this.config.fileEnabled) {
			try {
				const filePath = this.saveReplayToFile(processedReplayData, compressed);
				if (filePath) {
					results.fileSuccess = true;
					results.filePath = filePath;
				}
			} catch (error) {
				replayLogger.error('Failed to save replay to file:', error);
				results.error =
					error instanceof Error ? error.message : 'File save failed';
			}
		}

		// Save to MongoDB
		if (this.replayService) {
			try {
				await this.saveReplayToMongo(processedReplayData);
				results.mongoSuccess = true;
			} catch (error) {
				replayLogger.error('Failed to save replay to MongoDB:', error);
				if (!results.error) {
					results.error =
						error instanceof Error ? error.message : 'MongoDB save failed';
				}
			}
		}

		return results;
	}

	/**
	 * Loads replay data from file
	 */
	loadReplayFromFile(filepath: string): ReplayData | undefined {
		try {
			// Check if file is compressed (ends with .gz)
			let jsonData: string;
			if (filepath.endsWith('.gz')) {
				const compressedData = fs.readFileSync(filepath);
				jsonData = zlib.gunzipSync(compressedData).toString('utf8');
			} else {
				jsonData = fs.readFileSync(filepath, 'utf8');
			}

			const replayData: ReplayData = JSON.parse(jsonData);

			// Convert date strings back to Date objects
			replayData.startTime = new Date(replayData.startTime);
			if (replayData.endTime) {
				replayData.endTime = new Date(replayData.endTime);
			}
			replayData.metadata.createdAt = new Date(replayData.metadata.createdAt);

			return replayData;
		} catch (error) {
			replayLogger.error('Failed to load replay from file:', error);
			return undefined;
		}
	}

	/**
	 * Loads replay data from MongoDB
	 */
	async loadReplayFromMongo(gameId: GameId): Promise<any | null> {
		if (!this.replayService) {
			return null;
		}

		try {
			return await this.replayService.getReplay(gameId);
		} catch (error) {
			replayLogger.error(
				`Failed to load replay from MongoDB for game ${gameId}:`,
				error,
			);
			return null;
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
			return fs
				.readdirSync(this.config.directory)
				.filter((file) => file.endsWith('.json') || file.endsWith('.json.gz'))
				.map((file) => path.join(this.config.directory, file));
		} catch (error) {
			replayLogger.error('Failed to list replay files:', error);
			return [];
		}
	}

	/**
	 * Lists recent replays from MongoDB
	 */
	async listRecentReplays(limit: number = 50): Promise<any[]> {
		if (!this.replayService) {
			return [];
		}

		try {
			return await this.replayService.getRecentReplays(limit);
		} catch (error) {
			replayLogger.error('Failed to list MongoDB replays:', error);
			return [];
		}
	}

	/**
	 * Gets replay analysis from MongoDB
	 */
	async getReplayAnalysis(gameId: GameId): Promise<any | null> {
		if (!this.replayService) {
			return null;
		}

		try {
			return await this.replayService.getAnalysis(gameId);
		} catch (error) {
			replayLogger.error(
				`Failed to get replay analysis for game ${gameId}:`,
				error,
			);
			return null;
		}
	}

	/**
	 * Gets hand replay from MongoDB
	 */
	async getHandReplay(gameId: GameId, handNumber: number): Promise<any | null> {
		if (!this.replayService) {
			return null;
		}

		try {
			return await this.replayService.getHandReplay(gameId, handNumber);
		} catch (error) {
			replayLogger.error(
				`Failed to get hand replay for game ${gameId}, hand ${handNumber}:`,
				error,
			);
			return null;
		}
	}

	/**
	 * Saves replay to file from MongoDB
	 */
	async saveReplayToFileFromMongo(
		gameId: GameId,
	): Promise<{ success: boolean; filePath?: string; error?: string }> {
		if (!this.replayService) {
			return { success: false, error: 'MongoDB service not available' };
		}

		try {
			return await this.replayService.saveReplayToFile(gameId);
		} catch (error) {
			replayLogger.error(
				`Failed to save replay to file for game ${gameId}:`,
				error,
			);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			};
		}
	}

	/**
	 * Gets storage statistics
	 */
	async getStorageStatistics(): Promise<{
		fileCount: number;
		mongoStats?: any;
	}> {
		const stats = {
			fileCount: this.listAvailableReplays().length,
			mongoStats: undefined as any,
		};

		if (this.replayService) {
			try {
				stats.mongoStats = await this.replayService.getStorageStatistics();
			} catch (error) {
				replayLogger.error('Failed to get MongoDB storage statistics:', error);
			}
		}

		return stats;
	}

	/**
	 * Deletes a replay
	 */
	async deleteReplay(
		gameId: GameId,
	): Promise<{ fileDeleted: boolean; mongoDeleted: boolean }> {
		const results = { fileDeleted: false, mongoDeleted: false };

		// Delete from MongoDB
		if (this.replayService) {
			try {
				results.mongoDeleted = await this.replayService.deleteReplay(gameId);
			} catch (error) {
				replayLogger.error(
					`Failed to delete replay from MongoDB for game ${gameId}:`,
					error,
				);
			}
		}

		// Delete from file system (would need to implement file name lookup)
		// This is complex because we'd need to match gameId to filename
		// For now, we only support MongoDB deletion

		return results;
	}

	/**
	 * Exports replay in various formats
	 */
	exportReplay(
		replayData: ReplayData,
		format: 'json' | 'compressed' = 'json',
	): string | Buffer | undefined {
		switch (format) {
			case 'json':
				return JSON.stringify(replayData, null, 2);
			case 'compressed': {
				// Compress the JSON data using gzip
				const jsonData = JSON.stringify(replayData);

				try {
					return zlib.gzipSync(jsonData);
				} catch (error) {
					replayLogger.error('Failed to compress replay data:', error);
					// Fallback to uncompressed JSON
					return jsonData;
				}
			}
			default:
				return undefined;
		}
	}

	/**
	 * Builds hand replay data from events
	 */
	buildHandReplayData(
		gameId: GameId,
		handNumber: number,
		events: ReplayEvent[],
	): HandReplayData | undefined {
		const handEvents = events.filter((e) => e.handNumber === handNumber);
		if (handEvents.length === 0) return undefined;

		const startEvent = handEvents.find((e) => e.type === 'hand_started');
		const endEvent = handEvents.find((e) => e.type === 'hand_complete');

		if (!startEvent || !endEvent) return undefined;

		const playersInvolved = new Set<PlayerId>();
		handEvents.forEach((e) => {
			if (e.playerId) playersInvolved.add(e.playerId);
			if (e.gameStateAfter) {
				e.gameStateAfter.players.forEach((p) => playersInvolved.add(p.id));
			}
		});

		const finalBoard = this.getFinalBoard(handEvents);
		const winners = this.extractWinners(handEvents);
		const potSize = this.getFinalPotSize(handEvents);

		return {
			handNumber,
			startTime: new Date(startEvent.timestamp),
			endTime: new Date(endEvent.timestamp),
			events: handEvents,
			playersInvolved: Array.from(playersInvolved),
			initialState: startEvent.gameStateAfter || startEvent.gameStateBefore!,
			finalState: endEvent.gameStateAfter || endEvent.gameStateBefore!,
			communityCards: finalBoard,
			winners,
			potSize,
			showdownResults: this.extractShowdownResults(handEvents),
		};
	}

	/**
	 * Checks if MongoDB is available
	 */
	isMongoAvailable(): boolean {
		return this.replayService !== null;
	}

	/**
	 * Health check for storage systems
	 */
	async healthCheck(): Promise<{ file: boolean; mongo: boolean }> {
		const fileCheck = fs.existsSync(this.config.directory);

		let mongoCheck = false;
		if (this.replayService) {
			try {
				mongoCheck = await this.replayService.healthCheck();
			} catch {
				mongoCheck = false;
			}
		}

		return { file: fileCheck, mongo: mongoCheck };
	}

	/**
	 * Private methods
	 */
	private async initializeReplayService(): Promise<void> {
		try {
			this.replayService = new ReplayService();
			await this.replayService.initialize();
			replayLogger.info('MongoDB replay service initialized for storage');
		} catch (error) {
			replayLogger.error(
				'Failed to initialize MongoDB replay service for storage:',
				error,
			);
			this.replayService = null;
		}
	}

	private saveReplayToFile(
		replayData: ReplayData,
		compressed: boolean = false,
	): string | null {
		if (!this.config.directory) return null;

		try {
			const extension = compressed ? '.json.gz' : '.json';
			// Include a random suffix to ensure unique filenames even with same timestamp
			const randomSuffix = Math.random().toString(36).substring(2, 8);
			const filename = `${replayData.gameId}_${replayData.startTime.toISOString().replace(/[:.]/g, '-')}_${randomSuffix}${extension}`;
			const filepath = path.join(this.config.directory, filename);

			if (compressed) {
				const jsonData = JSON.stringify(replayData, null, 2);
				const compressedData = zlib.gzipSync(jsonData);
				fs.writeFileSync(filepath, compressedData);
			} else {
				const jsonData = JSON.stringify(replayData, null, 2);
				fs.writeFileSync(filepath, jsonData);
			}

			replayLogger.info(
				`Saved replay to file: ${filepath}${compressed ? ' (compressed)' : ''}`,
			);
			return filepath;
		} catch (error) {
			replayLogger.error('Failed to save replay to file:', error);
			return null;
		}
	}

	private async saveReplayToMongo(replayData: ReplayData): Promise<void> {
		if (!this.replayService) {
			throw new Error('MongoDB service not available');
		}

		// Convert ReplayData to MongoDB format
		const mongoMetadata: IGameMetadata = {
			gameId: replayData.gameId,
			gameType: replayData.metadata.gameConfig.isTournament
				? 'tournament'
				: 'cash',
			maxPlayers: replayData.metadata.gameConfig.maxPlayers,
			actualPlayers: Object.keys(replayData.metadata.playerNames).length,
			smallBlindAmount: replayData.metadata.gameConfig.smallBlindAmount,
			bigBlindAmount: replayData.metadata.gameConfig.bigBlindAmount,
			turnTimeLimit: replayData.metadata.gameConfig.turnTimeLimit,
			gameStartTime: replayData.startTime.getTime(),
			gameEndTime: replayData.endTime?.getTime() || 0,
			gameDuration: replayData.metadata.gameDuration,
			totalHands: replayData.metadata.handCount,
			totalActions: replayData.metadata.totalActions,
			playerNames: replayData.metadata.playerNames,
			winners: [],
		};

		const mongoEvents: IGameEvent[] = replayData.events.map((event) => ({
			type: event.type,
			timestamp: event.timestamp,
			data: {
				action: event.action,
				gameState: event.gameState,
				gameStateBefore: event.gameStateBefore,
				gameStateAfter: event.gameStateAfter,
				playerDecisionContext: event.playerDecisionContext,
				eventDuration: event.eventDuration,
				...event,
			},
			phase: event.phase?.toString(),
			handNumber: event.handNumber,
			playerId: event.playerId,
		}));

		// Check if replay already exists
		const existingReplay = await this.replayService.getReplay(
			replayData.gameId,
		);

		if (existingReplay) {
			// Update existing replay with new events
			await this.replayService.addEvents(replayData.gameId, mongoEvents);
		} else {
			// Create new replay
			await this.replayService.createReplay({
				gameId: replayData.gameId,
				metadata: mongoMetadata,
				events: mongoEvents,
			});
		}

		replayLogger.info(`Saved replay to MongoDB: ${replayData.gameId}`);
	}

	private ensureDatesAreValid(replayData: ReplayData): ReplayData {
		// Deep clone to avoid modifying the original
		const processed = JSON.parse(JSON.stringify(replayData));

		// Convert date strings back to Date objects
		processed.startTime = new Date(processed.startTime);
		if (processed.endTime) {
			processed.endTime = new Date(processed.endTime);
		}
		if (processed.metadata.createdAt) {
			processed.metadata.createdAt = new Date(processed.metadata.createdAt);
		}

		return processed;
	}

	private ensureDirectoryExists(directory: string): void {
		if (!fs.existsSync(directory)) {
			fs.mkdirSync(directory, { recursive: true });
		}
	}

	private getFinalBoard(events: ReplayEvent[]): Card[] {
		for (let i = events.length - 1; i >= 0; i--) {
			const event = events[i];
			if (
				event.gameStateAfter &&
				event.gameStateAfter.communityCards.length > 0
			) {
				return event.gameStateAfter.communityCards;
			}
		}
		return [];
	}

	private extractWinners(
		events: ReplayEvent[],
	): { playerId: PlayerId; handDescription?: string; winAmount: number }[] {
		// Look for hand_complete event which contains winner information
		const handCompleteEvent = events.find((e) => e.type === 'hand_complete');
		if (handCompleteEvent && 'winners' in handCompleteEvent) {
			// The hand_complete event contains a winners array
			return (handCompleteEvent as any).winners || [];
		}

		// Fallback: look for showdown_complete event
		const showdownEvent = events.find((e) => e.type === 'showdown_complete');
		if (showdownEvent && showdownEvent.gameStateAfter) {
			// Try to extract winners from chip stack changes
			const winners: {
				playerId: PlayerId;
				handDescription?: string;
				winAmount: number;
			}[] = [];

			// Find the last action event before showdown to get chip states
			let preShowdownState: GameState | undefined;
			for (let i = events.length - 1; i >= 0; i--) {
				if (events[i].type === 'action_taken' && events[i].gameStateBefore) {
					preShowdownState = events[i].gameStateBefore;
					break;
				}
			}

			if (preShowdownState && showdownEvent.gameStateAfter) {
				// Compare chip stacks to find winners
				showdownEvent.gameStateAfter.players.forEach((player) => {
					const priorPlayer = preShowdownState!.players.find(
						(p: any) => p.id === player.id,
					);
					if (priorPlayer && player.chipStack > priorPlayer.chipStack) {
						winners.push({
							playerId: player.id,
							winAmount: player.chipStack - priorPlayer.chipStack,
							handDescription: undefined,
						});
					}
				});
			}

			return winners;
		}

		return [];
	}

	private getFinalPotSize(events: ReplayEvent[]): number {
		for (let i = events.length - 1; i >= 0; i--) {
			const event = events[i];
			if (event.gameStateAfter) {
				return event.gameStateAfter.pots.reduce(
					(sum, pot) => sum + pot.amount,
					0,
				);
			}
		}
		return 0;
	}

	private extractShowdownResults(
		events: ReplayEvent[],
	): Record<PlayerId, HandEvaluation> | undefined {
		// Look for showdown_complete event
		const showdownEvent = events.find((e) => e.type === 'showdown_complete');
		if (!showdownEvent || !showdownEvent.gameStateAfter) {
			return undefined;
		}

		const results: Record<PlayerId, HandEvaluation> = {};

		// Extract hand evaluations from the game state
		// The showdown_complete event should have player information with their hands revealed
		const playersInShowdown = showdownEvent.gameStateAfter.players.filter(
			(p: any) => !p.isFolded && p.holeCards && p.holeCards.length === 2,
		);

		// If we can't get hand evaluations from the event, we need to calculate them
		if (playersInShowdown.length > 0) {
			playersInShowdown.forEach((player: any) => {
				if (player.holeCards) {
					// Convert Card interfaces to Card class instances
					const holeCards = player.holeCards.map(
						(card: Card) => new CardClass(card.suit, card.rank),
					);
					const communityCards =
						showdownEvent.gameStateAfter!.communityCards.map(
							(card: Card) => new CardClass(card.suit, card.rank),
						);

					const evaluation = HandEvaluator.evaluateHand(
						holeCards,
						communityCards,
					);
					results[player.id] = evaluation;
				}
			});
		}

		// Return undefined if no results were found
		return Object.keys(results).length > 0 ? results : undefined;
	}
}
