import {
	GameId,
	GameConfig,
	GameState,
	PlayerId,
	ReplayData,
	Action,
	PossibleAction,
	PlayerDecisionContext,
} from '@/domain/types';
import { GameReplayRecorder } from './GameReplayRecorder';
import { ReplayStorage } from '@/infrastructure/storage/ReplayStorage';
import { ReplayAnalyzer, ReplayAnalysis } from './ReplayAnalyzer';
import { replayLogger } from '@/infrastructure/logging/Logger';

/**
 * ReplayManager is a facade that coordinates recording, storage, and analysis of game replays.
 * This is the main entry point for replay functionality.
 */
export class ReplayManager {
	private recorder: GameReplayRecorder;
	private storage: ReplayStorage;
	private analyzer: ReplayAnalyzer;

	constructor() {
		this.recorder = new GameReplayRecorder();
		this.storage = new ReplayStorage();
		this.analyzer = new ReplayAnalyzer();
	}

	// Recording methods
	startRecording(
		gameId: GameId,
		gameConfig: GameConfig,
		initialGameState: GameState,
		playerNames: Map<PlayerId, string>,
	): void {
		this.recorder.startRecording(
			gameId,
			gameConfig,
			initialGameState,
			playerNames,
		);
	}

	recordEvent(
		gameId: GameId,
		event: any,
		gameStateBefore?: GameState,
		gameStateAfter?: GameState,
		playerDecisionContext?: PlayerDecisionContext,
	): void {
		this.recorder.recordEvent(
			gameId,
			event,
			gameStateBefore,
			gameStateAfter,
			playerDecisionContext,
		);
	}

	recordPlayerDecision(
		gameId: GameId,
		playerId: PlayerId,
		action: Action,
		possibleActions: PossibleAction[],
		gameStateBefore: GameState,
		gameStateAfter: GameState,
		timeToDecide: number,
		equity?: { before: number; after: number },
	): void {
		this.recorder.recordPlayerDecision(
			gameId,
			playerId,
			action,
			possibleActions,
			gameStateBefore,
			gameStateAfter,
			timeToDecide,
			equity,
		);
	}

	async endRecording(gameId: GameId, finalGameState: GameState): Promise<void> {
		this.recorder.endRecording(gameId, finalGameState);

		// Auto-save to storage when recording ends
		const replayData = this.recorder.getReplayData(gameId);
		if (replayData) {
			try {
				const results = await this.storage.saveReplay(replayData);
				replayLogger.info(
					`Saved replay ${gameId} - File: ${results.fileSuccess}, Mongo: ${results.mongoSuccess}`,
				);
			} catch (error) {
				replayLogger.error(`Failed to save replay ${gameId}:`, error);
			}
		}
	}

	// Storage methods
	async saveReplay(gameId: GameId): Promise<{
		fileSuccess: boolean;
		mongoSuccess: boolean;
		filePath?: string;
		error?: string;
	}> {
		const replayData = this.recorder.getReplayData(gameId);
		if (!replayData) {
			return {
				fileSuccess: false,
				mongoSuccess: false,
				error: 'No replay data found',
			};
		}

		return await this.storage.saveReplay(replayData);
	}

	loadReplayFromFile(filepath: string): ReplayData | undefined {
		return this.storage.loadReplayFromFile(filepath);
	}

	async loadReplayFromMongo(gameId: GameId): Promise<any | null> {
		return await this.storage.loadReplayFromMongo(gameId);
	}

	listAvailableReplays(): string[] {
		return this.storage.listAvailableReplays();
	}

	async listRecentReplays(limit: number = 50): Promise<any[]> {
		return await this.storage.listRecentReplays(limit);
	}

	// Analysis methods
	analyzeReplay(replayData: ReplayData): ReplayAnalysis {
		return this.analyzer.analyzeReplay(replayData);
	}

	analyzeRecordedGame(gameId: GameId): ReplayAnalysis | null {
		const replayData = this.recorder.getReplayData(gameId);
		if (!replayData) return null;

		return this.analyzer.analyzeReplay(replayData);
	}

	comparePlayerStats(
		replayData: ReplayData,
		playerId1: PlayerId,
		playerId2: PlayerId,
	) {
		return this.analyzer.comparePlayerStats(replayData, playerId1, playerId2);
	}

	getSummaryStats(replayData: ReplayData) {
		return this.analyzer.getSummaryStats(replayData);
	}

	// Recorder access methods
	getReplayData(gameId: GameId): ReplayData | undefined {
		return this.recorder.getReplayData(gameId);
	}

	isRecording(gameId: GameId): boolean {
		return this.recorder.isRecording(gameId);
	}

	getActiveRecordings(): GameId[] {
		return this.recorder.getActiveRecordings();
	}

	getCompletedRecordings(): GameId[] {
		return this.recorder.getCompletedRecordings();
	}

	removeRecording(gameId: GameId): boolean {
		return this.recorder.removeRecording(gameId);
	}

	getMemoryStats() {
		return this.recorder.getMemoryStats();
	}

	// Storage utility methods
	async getStorageStatistics() {
		return await this.storage.getStorageStatistics();
	}

	async deleteReplay(gameId: GameId) {
		return await this.storage.deleteReplay(gameId);
	}

	exportReplay(
		gameId: GameId,
		format: 'json' | 'compressed' = 'json',
	): string | Buffer | undefined {
		const replayData = this.recorder.getReplayData(gameId);
		if (!replayData) return undefined;

		return this.storage.exportReplay(replayData, format);
	}

	isMongoAvailable(): boolean {
		return this.storage.isMongoAvailable();
	}

	async healthCheck() {
		return await this.storage.healthCheck();
	}
}
