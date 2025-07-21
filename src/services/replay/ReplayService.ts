import fs from 'fs/promises';
import path from 'path';

import { replayLogger } from '@/services/logging/Logger';
import {
	DatabaseConnection,
	getDefaultDatabaseConfig,
} from '@/services/storage/database';
import {
	IGameEvent,
	IGameMetadata,
	IHandSummary,
	IReplay,
	IReplayAnalytics,
} from '@/services/storage/models/Replay';
import {
	ReplayListItem,
	ReplayRepository,
	ReplaySearchFilters,
} from '@/services/storage/repositories/ReplayRepository';
import { Card } from '@/types';
import { TypedError } from '@/types/database-types';
import { InterestingMoment } from '@/types/game-types';

export interface CreateReplayRequest {
	gameId: string;
	metadata: IGameMetadata;
	events?: IGameEvent[];
}

export interface ReplayAnalysisResult {
	handAnalysis: IHandSummary[];
	playerStatistics: Record<string, {
		name: string;
		handsPlayed: number;
		handsWon: number;
		totalWinnings: number;
		biggestPotWon: number;
		actions: Record<string, number>;
	}>;
	interestingMoments: InterestingMoment[];
	gameFlow: {
		avgHandDuration: number;
		actionDistribution: Record<string, number>;
		phaseDistribution: Record<string, number>;
		peakPotSize: number;
		longestHand: number;
		shortestHand: number;
		mostActivePlayer: string;
	};
}

export class ReplayService {
	private replayRepository: ReplayRepository;
	private dbConnection: DatabaseConnection | null = null;

	constructor() {
		this.replayRepository = new ReplayRepository();
	}

	private log(message: string): void {
		replayLogger.info(message);
	}

	private logError(message: string, error?: TypedError | Error): void {
		replayLogger.error(message, error);
	}

	/**
	 * Safely extracts data from event data which has unknown type
	 */
	private getEventData<T>(data: unknown): T | null {
		if (data && typeof data === 'object') {
			return data as T;
		}
		return null;
	}

	async initialize(): Promise<void> {
		try {
			if (!this.dbConnection) {
				const config = getDefaultDatabaseConfig();
				this.dbConnection = DatabaseConnection.getInstance(config);
				await this.dbConnection.connect();
				this.log('Database connection initialized');
			}
		} catch (error) {
			this.logError('Failed to initialize database connection:', error as Error);
			throw new Error(
				`Failed to initialize ReplayService: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		}
	}

	async createReplay(request: CreateReplayRequest): Promise<IReplay> {
		await this.ensureInitialized();

		try {
			// Generate initial analytics
			const analytics = this.generateInitialAnalytics(request.events || []);

			const replayData: Partial<IReplay> = {
				gameId: request.gameId,
				metadata: request.metadata,
				events: request.events || [],
				handSummaries: [],
				analytics,
				version: '1.0.0',
			};

			return await this.replayRepository.create(replayData);
		} catch (error) {
			this.logError(
				`Failed to create replay for game ${request.gameId}:`,
				error as Error,
			);
			throw error;
		}
	}

	async getReplay(gameId: string): Promise<IReplay | null> {
		await this.ensureInitialized();
		return await this.replayRepository.findByGameId(gameId);
	}

	async getReplayList(
		filters: ReplaySearchFilters = {},
	): Promise<ReplayListItem[]> {
		await this.ensureInitialized();
		return await this.replayRepository.findAll(filters);
	}

	async getRecentReplays(limit: number = 10): Promise<ReplayListItem[]> {
		await this.ensureInitialized();
		return await this.replayRepository.getRecentReplays(limit);
	}

	async addEvents(gameId: string, events: IGameEvent[]): Promise<void> {
		await this.ensureInitialized();

		try {
			const replay = await this.replayRepository.findByGameId(gameId);
			if (!replay) {
				throw new Error(`Replay not found for game ${gameId}`);
			}

			// Add events to the replay
			await this.replayRepository.addEvents(gameId, events);

			// Update analytics with new events
			const updatedReplay = await this.replayRepository.findByGameId(gameId);
			if (updatedReplay) {
				const newAnalytics = this.generateAnalytics(updatedReplay.events);
				await this.replayRepository.updateAnalytics(gameId, newAnalytics);
			}
		} catch (error) {
			this.logError(`Failed to add events to replay ${gameId}:`, error as Error);
			throw error;
		}
	}

	async getAnalysis(gameId: string): Promise<ReplayAnalysisResult | null> {
		await this.ensureInitialized();

		try {
			const replay = await this.replayRepository.findByGameId(gameId);
			if (!replay) {
				return null;
			}

			return this.generateDetailedAnalysis(replay);
		} catch (error) {
			this.logError(`Failed to get analysis for game ${gameId}:`, error as Error);
			throw error;
		}
	}

	async getHandReplay(
		gameId: string,
		handNumber: number,
	): Promise<{
		handNumber: number;
		events: IGameEvent[];
		playersInvolved: string[];
		communityCards: Card[];
		potSize: number;
		winner?: string;
	} | null> {
		await this.ensureInitialized();

		try {
			const events = await this.replayRepository.getEventsByGameId(gameId, {
				handNumber,
			});
			if (events.length === 0) {
				return null;
			}

			// Extract hand-specific data
			const playersInvolved = [
				...new Set(events.filter((e) => e.playerId).map((e) => e.playerId!)),
			];

			let communityCards: Card[] = [];
			let potSize = 0;
			let winner: string | undefined;

			// Find final state events
			for (const event of events.reverse()) {
				if (event.type === 'hand_complete') {
					const data = this.getEventData<{
						communityCards?: Card[];
						potSize?: number;
						winners?: Array<{ playerId: string }>;
					}>(event.data);
					
					if (data) {
						communityCards = data.communityCards || [];
						potSize = data.potSize || 0;
						if (data.winners && data.winners.length > 0) {
							winner = data.winners[0].playerId;
						}
					}
					break;
				}
			}

			return {
				handNumber,
				events: events.reverse(), // Restore chronological order
				playersInvolved,
				communityCards,
				potSize,
				winner,
			};
		} catch (error) {
			this.logError(
				`Failed to get hand replay for game ${gameId}, hand ${handNumber}:`,
				error as Error,
			);
			throw error;
		}
	}

	async saveReplayToFile(
		gameId: string,
	): Promise<{ success: boolean; filePath?: string; error?: string }> {
		await this.ensureInitialized();

		try {
			const replay = await this.replayRepository.findByGameId(gameId);
			if (!replay) {
				return { success: false, error: 'Replay not found' };
			}

			// Ensure replays directory exists
			const replaysDir = path.join(process.cwd(), 'replays');
			try {
				await fs.access(replaysDir);
			} catch {
				await fs.mkdir(replaysDir, { recursive: true });
			}

			// Generate filename with timestamp
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
			const filename = `${gameId}_${timestamp}.json`;
			const filePath = path.join(replaysDir, filename);

			// Save to file
			const replayData = {
				...replay.toObject(),
				exportedAt: new Date().toISOString(),
				version: replay.version,
			};

			await fs.writeFile(filePath, JSON.stringify(replayData, null, 2));

			return { success: true, filePath };
		} catch (error) {
			this.logError(`Failed to save replay to file for game ${gameId}:`, error as Error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			};
		}
	}

	async deleteReplay(gameId: string): Promise<boolean> {
		await this.ensureInitialized();
		return await this.replayRepository.delete(gameId);
	}

	async getStorageStatistics(): Promise<{
		totalReplays: number;
		totalSizeBytes: number;
		totalSizeMB: string;
		avgSizePerReplayMB: string;
		oldestReplay: Date | null;
		newestReplay: Date | null;
	}> {
		await this.ensureInitialized();
		return await this.replayRepository.getStorageStats();
	}

	async healthCheck(): Promise<boolean> {
		try {
			if (!this.dbConnection) {
				return false;
			}
			return await this.dbConnection.healthCheck();
		} catch {
			return false;
		}
	}

	private async ensureInitialized(): Promise<void> {
		if (!this.dbConnection || !this.dbConnection.isConnectionReady()) {
			await this.initialize();
		}
	}

	private generateInitialAnalytics(events: IGameEvent[]): IReplayAnalytics {
		return {
			totalEvents: events.length,
			avgHandDuration: 0,
			actionDistribution: {},
			phaseDistribution: {},
			playerPerformance: {},
			gameFlow: {
				peakPotSize: 0,
				longestHand: 0,
				shortestHand: 0,
				mostActivePlayer: '',
			},
		};
	}

	private generateAnalytics(events: IGameEvent[]): IReplayAnalytics {
		const actionDistribution: Record<string, number> = {};
		const phaseDistribution: Record<string, number> = {};
		const playerActions: Record<string, number> = {};

		let peakPotSize = 0;
		const handDurations: number[] = [];
		const handStarts: Record<number, number> = {};

		// Process events
		for (const event of events) {
			// Count action types
			if (event.type === 'action_taken') {
				const data = this.getEventData<{ action?: { type: string } }>(event.data);
				const actionType = data?.action?.type;
				if (actionType) {
					actionDistribution[actionType] =
						(actionDistribution[actionType] || 0) + 1;
				}

				// Count player actions
				if (event.playerId) {
					playerActions[event.playerId] =
						(playerActions[event.playerId] || 0) + 1;
				}
			}

			// Count phases
			if (event.phase) {
				phaseDistribution[event.phase] =
					(phaseDistribution[event.phase] || 0) + 1;
			}

			// Track pot sizes
			const potData = this.getEventData<{ potSize?: number }>(event.data);
			if (potData?.potSize && potData.potSize > peakPotSize) {
				peakPotSize = potData.potSize;
			}

			// Track hand durations
			if (event.type === 'hand_started' && event.handNumber) {
				handStarts[event.handNumber] = event.timestamp;
			} else if (event.type === 'hand_complete' && event.handNumber) {
				const startTime = handStarts[event.handNumber];
				if (startTime) {
					handDurations.push(event.timestamp - startTime);
				}
			}
		}

		// Calculate averages and find most active player
		const avgHandDuration =
			handDurations.length > 0
				? handDurations.reduce((a, b) => a + b, 0) / handDurations.length
				: 0;

		let mostActivePlayer = '';
		let maxActions = 0;
		for (const [playerId, actions] of Object.entries(playerActions)) {
			if (actions > maxActions) {
				maxActions = actions;
				mostActivePlayer = playerId;
			}
		}

		return {
			totalEvents: events.length,
			avgHandDuration,
			actionDistribution,
			phaseDistribution,
			playerPerformance: {},
			gameFlow: {
				peakPotSize,
				longestHand: handDurations.length > 0 ? Math.max(...handDurations) : 0,
				shortestHand: handDurations.length > 0 ? Math.min(...handDurations) : 0,
				mostActivePlayer,
			},
		};
	}

	private generateDetailedAnalysis(replay: IReplay): ReplayAnalysisResult {
		const handAnalysis: IHandSummary[] = [];
		const playerStatistics: Record<string, any> = {};
		const interestingMoments: InterestingMoment[] = [];

		// Group events by hand
		const handEvents = new Map<number, IGameEvent[]>();
		for (const event of replay.events) {
			if (event.handNumber) {
				if (!handEvents.has(event.handNumber)) {
					handEvents.set(event.handNumber, []);
				}
				handEvents.get(event.handNumber)!.push(event);
			}
		}

		// Analyze each hand
		for (const [handNumber, events] of handEvents.entries()) {
			const handStart = events.find((e) => e.type === 'hand_started');
			const handEnd = events.find((e) => e.type === 'hand_complete');

			if (handStart && handEnd) {
				const duration = handEnd.timestamp - handStart.timestamp;
				const actions = events.filter((e) => e.type === 'action_taken').length;

				const handData = this.getEventData<{
					winners?: Array<{ playerId: string }>;
					potSize?: number;
					communityCards?: Card[];
				}>(handEnd.data);

				handAnalysis.push({
					handNumber,
					startTimestamp: handStart.timestamp,
					endTimestamp: handEnd.timestamp,
					duration,
					winner: handData?.winners?.[0]?.playerId || 'Unknown',
					potSize: handData?.potSize || 0,
					communityCards: handData?.communityCards || [],
					actions,
				});

				// Identify interesting moments
				if (duration > 60000) {
					// Hand longer than 1 minute
					interestingMoments.push({
						sequenceId: 0, // Using 0 as IGameEvent doesn't have sequenceId
						type: 'all_in' as const, // Using 'all_in' as placeholder since 'long_hand' is not in the type
						description: `Hand ${handNumber} took ${Math.round(duration / 1000)}s`,
						involvedPlayers: [],
						timestamp: handEnd.timestamp,
					});
				}

				if (handData?.potSize && handData.potSize > 1000) {
					// Large pot
					interestingMoments.push({
						sequenceId: 0, // Using 0 as IGameEvent doesn't have sequenceId
						type: 'big_pot',
						description: `Large pot of $${handData.potSize} in hand ${handNumber}`,
						involvedPlayers: [],
						potSize: handData.potSize,
						timestamp: handEnd.timestamp,
					});
				}
			}
		}

		// Calculate player statistics
		for (const [playerId, playerName] of Object.entries(
			replay.metadata.playerNames,
		)) {
			const playerEvents = replay.events.filter((e) => e.playerId === playerId);
			const actions = playerEvents.filter((e) => e.type === 'action_taken');

			playerStatistics[playerId] = {
				name: playerName,
				totalActions: actions.length,
				handsPlayed: new Set(
					playerEvents.filter((e) => e.handNumber).map((e) => e.handNumber),
				).size,
				actionTypes: actions.reduce((acc: Record<string, number>, event) => {
					const data = this.getEventData<{ action?: { type: string } }>(event.data);
					const actionType = data?.action?.type;
					if (actionType) {
						acc[actionType] = (acc[actionType] || 0) + 1;
					}
					return acc;
				}, {}),
			};
		}

		return {
			handAnalysis,
			playerStatistics,
			interestingMoments,
			gameFlow: {
				avgHandDuration: replay.analytics.avgHandDuration,
				actionDistribution: replay.analytics.actionDistribution as Record<
					string,
					number
				>,
				phaseDistribution: replay.analytics.phaseDistribution as Record<
					string,
					number
				>,
				peakPotSize: replay.analytics.gameFlow.peakPotSize,
				longestHand: replay.analytics.gameFlow.longestHand,
				shortestHand: replay.analytics.gameFlow.shortestHand,
				mostActivePlayer: replay.analytics.gameFlow.mostActivePlayer,
			},
		};
	}
}

export default ReplayService;
