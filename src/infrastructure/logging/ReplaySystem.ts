import {
	ReplayData,
	ReplayEvent,
	GameState,
	GameId,
	PlayerId,
	ReplayCheckpoint,
	HandReplayData,
	GamePhase,
} from '@/domain/types';
import { GameReplayRecorder } from '@/domain/replay/GameReplayRecorder';
import { ReplayStorage } from '@/infrastructure/storage/ReplayStorage';
import { ReplayAnalyzer, ReplayAnalysis } from '@/domain/replay/ReplayAnalyzer';
import { replayLogger } from './Logger';

export interface ReplayPosition {
	eventIndex: number;
	sequenceId: number;
	handNumber: number;
	phase: GamePhase;
	timestamp: number;
}

export interface ReplayControls {
	isPlaying: boolean;
	playbackSpeed: number; // 0.25x to 8x
	currentPosition: ReplayPosition;
	canStepForward: boolean;
	canStepBackward: boolean;
	totalEvents: number;
}

/**
 * ReplaySystem handles playback control and analysis of poker game replays
 */
export class ReplaySystem {
	private replayData: ReplayData | null = null;
	private currentEventIndex: number = 0;
	private isPlaying: boolean = false;
	private playbackSpeed: number = 1.0;
	private playbackInterval: NodeJS.Timeout | null = null;
	private eventCallbacks: ((event: ReplayEvent, gameState: GameState) => void)[] = [];
	private positionCallbacks: ((position: ReplayPosition) => void)[] = [];
	private replayStorage: ReplayStorage;
	private replayAnalyzer: ReplayAnalyzer;

	constructor(private recorder?: GameReplayRecorder) {
		this.replayStorage = new ReplayStorage();
		this.replayAnalyzer = new ReplayAnalyzer();
	}

	private log(message: string): void {
		replayLogger.info(message);
	}

	private logError(message: string, error?: any): void {
		replayLogger.error(message, error);
	}

	// Removed initializeReplayService - now handled by ReplayStorage

	/**
	 * Loads a replay for playback
	 */
	loadReplay(replayData: ReplayData): boolean {
		try {
			this.replayData = replayData;
			this.currentEventIndex = 0;
			this.stop();

			this.log(`Loaded replay: ${replayData.gameId} (${replayData.events.length} events)`);
			return true;
		} catch (error) {
			this.logError(`Failed to load replay:`, error);
			return false;
		}
	}

	/**
	 * Loads a replay from file
	 */
	loadReplayFromFile(filepath: string): boolean {
		const replayData = this.replayStorage.loadReplayFromFile(filepath);
		if (!replayData) {
			return false;
		}

		return this.loadReplay(replayData);
	}

	/**
	 * Loads a replay from MongoDB by gameId
	 */
	async loadReplayFromMongo(gameId: GameId): Promise<boolean> {
		try {
			const mongoReplay = await this.replayStorage.loadReplayFromMongo(gameId);
			if (!mongoReplay) {
				this.logError(`No replay found for game ${gameId}`);
				return false;
			}

			// Convert MongoDB replay to ReplayData format
			const replayData = this.convertMongoReplayToReplayData(mongoReplay);
			return this.loadReplay(replayData);
		} catch (error) {
			this.logError(`Failed to load replay from MongoDB for game ${gameId}:`, error);
			return false;
		}
	}

	/**
	 * Gets replay analysis from MongoDB
	 */
	async getReplayAnalysisFromMongo(gameId: GameId): Promise<any | null> {
		try {
			return await this.replayStorage.getReplayAnalysis(gameId);
		} catch (error) {
			this.logError(`Failed to get replay analysis from MongoDB for game ${gameId}:`, error);
			return null;
		}
	}

	/**
	 * Gets hand replay from MongoDB
	 */
	async getHandReplayFromMongo(gameId: GameId, handNumber: number): Promise<any | null> {
		try {
			return await this.replayStorage.getHandReplay(gameId, handNumber);
		} catch (error) {
			this.logError(
				`Failed to get hand replay from MongoDB for game ${gameId}, hand ${handNumber}:`,
				error
			);
			return null;
		}
	}

	/**
	 * Lists available replays from MongoDB
	 */
	async listMongoReplays(limit: number = 50): Promise<any[]> {
		try {
			return await this.replayStorage.listRecentReplays(limit);
		} catch (error) {
			this.logError('Failed to list MongoDB replays:', error);
			return [];
		}
	}

	/**
	 * Starts playback
	 */
	play(): void {
		if (!this.replayData || this.isPlaying) return;

		this.isPlaying = true;
		const intervalMs = Math.max(50, 1000 / this.playbackSpeed); // Min 50ms interval

		this.playbackInterval = setInterval(() => {
			if (!this.stepForward()) {
				this.stop();
			}
		}, intervalMs);

		this.log(`Started playback at ${this.playbackSpeed}x speed`);
	}

	/**
	 * Pauses playback
	 */
	pause(): void {
		this.isPlaying = false;
		if (this.playbackInterval) {
			clearInterval(this.playbackInterval);
			this.playbackInterval = null;
		}
	}

	/**
	 * Stops playback and resets to beginning
	 */
	stop(): void {
		this.pause();
		this.currentEventIndex = 0;
		this.notifyPositionChange();
	}

	/**
	 * Steps forward one event
	 */
	stepForward(): boolean {
		if (!this.replayData || this.currentEventIndex >= this.replayData.events.length - 1) {
			return false;
		}

		this.currentEventIndex++;
		this.processCurrentEvent();
		this.notifyPositionChange();
		return true;
	}

	/**
	 * Steps backward one event
	 */
	stepBackward(): boolean {
		if (!this.replayData || this.currentEventIndex <= 0) {
			return false;
		}

		this.currentEventIndex--;
		this.processCurrentEvent();
		this.notifyPositionChange();
		return true;
	}

	/**
	 * Jumps to a specific event index
	 */
	seekToEvent(eventIndex: number): boolean {
		if (!this.replayData || eventIndex < 0 || eventIndex >= this.replayData.events.length) {
			return false;
		}

		this.currentEventIndex = eventIndex;
		this.processCurrentEvent();
		this.notifyPositionChange();
		return true;
	}

	/**
	 * Jumps to a specific hand
	 */
	seekToHand(handNumber: number): boolean {
		if (!this.replayData) return false;

		const handStartEvent = this.replayData.events.findIndex(
			(event) => event.type === 'hand_started' && event.handNumber === handNumber
		);

		if (handStartEvent === -1) return false;

		return this.seekToEvent(handStartEvent);
	}

	/**
	 * Jumps to the nearest checkpoint before a specific event
	 */
	seekToCheckpoint(eventIndex: number): boolean {
		if (!this.replayData || !this.replayData.checkpoints) return false;

		// Find the latest checkpoint before the target event
		const checkpoint = this.replayData.checkpoints
			.filter((cp) => cp.eventIndex <= eventIndex)
			.sort((a, b) => b.eventIndex - a.eventIndex)[0];

		if (!checkpoint) return false;

		return this.seekToEvent(checkpoint.eventIndex);
	}

	/**
	 * Sets playback speed (0.25x to 8x)
	 */
	setPlaybackSpeed(speed: number): void {
		this.playbackSpeed = Math.max(0.25, Math.min(8.0, speed));

		// Restart playback with new speed if currently playing
		if (this.isPlaying) {
			this.pause();
			this.play();
		}
	}

	/**
	 * Gets current replay controls state
	 */
	getControls(): ReplayControls {
		return {
			isPlaying: this.isPlaying,
			playbackSpeed: this.playbackSpeed,
			currentPosition: this.getCurrentPosition(),
			canStepForward: this.canStepForward(),
			canStepBackward: this.canStepBackward(),
			totalEvents: this.replayData?.events.length || 0,
		};
	}

	/**
	 * Gets the current game state at the current position
	 */
	getCurrentGameState(): GameState | null {
		if (!this.replayData || this.currentEventIndex < 0) {
			return this.replayData?.initialGameState || null;
		}

		const currentEvent = this.replayData.events[this.currentEventIndex];
		return currentEvent?.gameStateAfter || currentEvent?.gameStateBefore || null;
	}

	/**
	 * Gets replay data for a specific hand
	 */
	getHandReplay(handNumber: number): HandReplayData | undefined {
		if (!this.replayData) return undefined;
		return this.replayStorage.buildHandReplayData(
			this.replayData.gameId,
			handNumber,
			this.replayData.events
		);
	}

	/**
	 * Analyzes the entire replay for insights
	 */
	analyzeReplay(): ReplayAnalysis | null {
		if (!this.replayData) return null;

		return this.replayAnalyzer.analyzeReplay(this.replayData);
	}

	/**
	 * Subscribes to event notifications during playback
	 */
	onEvent(callback: (event: ReplayEvent, gameState: GameState) => void): void {
		this.eventCallbacks.push(callback);
	}

	/**
	 * Subscribes to position change notifications
	 */
	onPositionChange(callback: (position: ReplayPosition) => void): void {
		this.positionCallbacks.push(callback);
	}

	/**
	 * Removes all event callbacks
	 */
	clearEventCallbacks(): void {
		this.eventCallbacks = [];
	}

	/**
	 * Removes all position callbacks
	 */
	clearPositionCallbacks(): void {
		this.positionCallbacks = [];
	}

	/**
	 * Private helper methods
	 */
	private processCurrentEvent(): void {
		if (!this.replayData) return;

		const currentEvent = this.replayData.events[this.currentEventIndex];
		const gameState = this.getCurrentGameState();

		if (currentEvent && gameState) {
			this.eventCallbacks.forEach((callback) => {
				try {
					callback(currentEvent, gameState);
				} catch (error) {
					this.logError('Error in event callback:', error);
				}
			});
		}
	}

	private notifyPositionChange(): void {
		const position = this.getCurrentPosition();
		this.positionCallbacks.forEach((callback) => {
			try {
				callback(position);
			} catch (error) {
				this.logError('Error in position callback:', error);
			}
		});
	}

	private getCurrentPosition(): ReplayPosition {
		if (!this.replayData || this.currentEventIndex < 0) {
			return {
				eventIndex: 0,
				sequenceId: 0,
				handNumber: 0,
				phase: GamePhase.PreFlop,
				timestamp: this.replayData?.startTime.getTime() || 0,
			};
		}

		const currentEvent = this.replayData.events[this.currentEventIndex];
		const gameState = this.getCurrentGameState();

		return {
			eventIndex: this.currentEventIndex,
			sequenceId: currentEvent.sequenceId,
			handNumber: currentEvent.handNumber,
			phase: gameState?.currentPhase || GamePhase.PreFlop,
			timestamp: currentEvent.timestamp,
		};
	}

	private canStepForward(): boolean {
		return this.replayData ? this.currentEventIndex < this.replayData.events.length - 1 : false;
	}

	private canStepBackward(): boolean {
		return this.currentEventIndex > 0;
	}

	// Analysis methods moved to ReplayAnalyzer class

	/**
	 * Helper method to convert MongoDB replay to ReplayData format
	 */
	private convertMongoReplayToReplayData(mongoReplay: any): ReplayData {
		// Convert MongoDB replay format to local ReplayData format
		const replayData: ReplayData = {
			gameId: mongoReplay.gameId,
			startTime: new Date(mongoReplay.metadata.gameStartTime),
			endTime: mongoReplay.metadata.gameEndTime
				? new Date(mongoReplay.metadata.gameEndTime)
				: undefined,
			events: mongoReplay.events.map((event: any, index: number) => ({
				...event.data,
				type: event.type,
				timestamp: event.timestamp,
				handNumber: event.handNumber || 0,
				phase: event.phase,
				playerId: event.playerId,
				sequenceId: index + 1,
				gameStateBefore: event.data.gameStateBefore,
				gameStateAfter: event.data.gameStateAfter,
				playerDecisionContext: event.data.playerDecisionContext,
				eventDuration: event.data.eventDuration,
			})),
			initialGameState:
				mongoReplay.events[0]?.data?.initialGameState ||
				mongoReplay.events[0]?.data?.gameState,
			finalGameState: mongoReplay.events[mongoReplay.events.length - 1]?.data?.gameState,
			metadata: {
				gameConfig: {
					maxPlayers: mongoReplay.metadata.maxPlayers,
					smallBlindAmount: mongoReplay.metadata.smallBlindAmount,
					bigBlindAmount: mongoReplay.metadata.bigBlindAmount,
					turnTimeLimit: mongoReplay.metadata.turnTimeLimit,
					isTournament: mongoReplay.metadata.gameType === 'tournament',
				},
				playerNames: mongoReplay.metadata.playerNames,
				handCount: mongoReplay.metadata.totalHands,
				totalEvents: mongoReplay.analytics.totalEvents,
				totalActions: mongoReplay.metadata.totalActions,
				gameDuration: mongoReplay.metadata.gameDuration,
				avgHandDuration: mongoReplay.analytics.avgHandDuration,
				winners: mongoReplay.metadata.winners,
				finalChipCounts: {},
				createdAt: new Date(mongoReplay.createdAt),
				version: mongoReplay.version || '1.0.0',
			},
			checkpoints: [], // MongoDB doesn't store checkpoints, generate on demand if needed
		};

		return replayData;
	}

	/**
	 * Check if MongoDB service is available
	 */
	isMongoAvailable(): boolean {
		return this.replayStorage.isMongoAvailable();
	}
}
