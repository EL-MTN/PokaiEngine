import {
	Action,
	GameConfig,
	GameEvent,
	GameId,
	GameState,
	PlayerDecisionContext,
	PlayerId,
	Position,
	PossibleAction,
	ReplayCheckpoint,
	ReplayData,
	ReplayEvent,
	ReplayMetadata,
} from '@/domain/types';
import { shouldShowHoleCards } from '@/domain/types/visibility';
import { replayLogger } from '@/infrastructure/logging/Logger';

export interface ReplayRecordingConfig {
	enabled: boolean;
	maxReplaysInMemory: number;
	checkpointInterval: number; // Events between checkpoints
}

export interface GameRecordingEntry {
	gameId: GameId;
	replayData: ReplayData;
	isActive: boolean;
}

/**
 * GameReplayRecorder handles the recording of game events and building replay data structures.
 * It focuses solely on capturing game state and events - no storage or analysis.
 */
export class GameReplayRecorder {
	private recordings: Map<GameId, GameRecordingEntry> = new Map();
	private config: ReplayRecordingConfig;
	private sequenceCounter: number = 0;

	constructor(config?: Partial<ReplayRecordingConfig>) {
		this.config = {
			enabled: true,
			maxReplaysInMemory: 100,
			checkpointInterval: 50,
			...config,
		};
	}

	/**
	 * Starts recording for a new game
	 */
	startRecording(
		gameId: GameId,
		gameConfig: GameConfig,
		initialGameState: GameState,
		playerNames: Map<PlayerId, string>,
	): void {
		if (!this.config.enabled) {
			return;
		}

		const now = new Date();

		const metadata: ReplayMetadata = {
			gameConfig: this.cloneObject(gameConfig),
			playerNames: Object.fromEntries(playerNames),
			handCount: 0,
			totalEvents: 0,
			totalActions: 0,
			gameDuration: 0,
			createdAt: now,
			version: '1.0.0',
		};

		const replayData: ReplayData = {
			gameId,
			startTime: now,
			events: [],
			initialGameState: this.cloneGameState(initialGameState),
			metadata,
			checkpoints: [],
		};

		const entry: GameRecordingEntry = {
			gameId,
			replayData,
			isActive: true,
		};

		this.recordings.set(gameId, entry);

		// Record game start event
		this.recordEvent(gameId, {
			type: 'game_started',
			timestamp: now.getTime(),
			handNumber: 0,
			gameState: initialGameState,
		});

		replayLogger.info(`Started recording for game: ${gameId}`);
	}

	/**
	 * Records a game event
	 */
	recordEvent(
		gameId: GameId,
		event: GameEvent,
		gameStateBefore?: GameState,
		gameStateAfter?: GameState,
		playerDecisionContext?: PlayerDecisionContext,
	): void {
		const entry = this.recordings.get(gameId);
		if (!entry || !this.config.enabled) {
			return;
		}

		const replayEvent: ReplayEvent = {
			...this.cloneEvent(event),
			sequenceId: ++this.sequenceCounter,
			gameStateBefore: gameStateBefore
				? this.cloneGameState(gameStateBefore)
				: undefined,
			gameStateAfter: gameStateAfter
				? this.cloneGameState(gameStateAfter)
				: undefined,
			playerDecisionContext: playerDecisionContext
				? this.cloneObject(playerDecisionContext)
				: undefined,
		};

		// Calculate event duration if we have previous events
		if (entry.replayData.events.length > 0) {
			const lastEvent =
				entry.replayData.events[entry.replayData.events.length - 1];
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

		// Create checkpoint if needed
		if (this.shouldCreateCheckpoint(entry.replayData)) {
			this.createCheckpoint(entry.replayData, replayEvent);
		}

		// Memory management
		this.manageMemory();
	}

	/**
	 * Records a player decision with context
	 */
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
		const player = gameStateBefore.players.find((p) => p.id === playerId);
		if (!player) return;

		const potSize = gameStateBefore.pots.reduce(
			(sum, pot) => sum + pot.amount,
			0,
		);
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
			effectiveStackSize: Math.min(
				player.chipStack,
				this.getMaxOpponentStack(gameStateBefore, playerId),
			),
		};

		const gameEvent: GameEvent = {
			type: 'action_taken',
			playerId,
			action,
			timestamp: Date.now(),
			handNumber: gameStateBefore.handNumber,
			phase: gameStateBefore.currentPhase,
			gameState: gameStateAfter,
		};

		this.recordEvent(
			gameId,
			gameEvent,
			gameStateBefore,
			gameStateAfter,
			decisionContext,
		);
	}

	/**
	 * Ends recording for a game
	 */
	endRecording(gameId: GameId, finalGameState: GameState): void {
		const entry = this.recordings.get(gameId);
		if (!entry) return;

		const now = new Date();
		entry.replayData.endTime = now;
		entry.replayData.finalGameState = this.cloneGameState(finalGameState);
		entry.replayData.metadata.gameDuration =
			now.getTime() - entry.replayData.startTime.getTime();
		entry.isActive = false;

		// Calculate final statistics
		this.calculateFinalStatistics(entry.replayData);

		// Record game end event
		this.recordEvent(gameId, {
			type: 'game_ended',
			timestamp: now.getTime(),
			handNumber: finalGameState.handNumber,
			gameState: finalGameState,
		});

		replayLogger.info(
			`Ended recording for game: ${gameId} (${entry.replayData.metadata.totalEvents} events)`,
		);
	}

	/**
	 * Gets the complete replay data for a game
	 */
	getReplayData(gameId: GameId): ReplayData | undefined {
		const entry = this.recordings.get(gameId);
		return entry ? this.cloneObject(entry.replayData) : undefined;
	}

	/**
	 * Checks if a game is currently being recorded
	 */
	isRecording(gameId: GameId): boolean {
		const entry = this.recordings.get(gameId);
		return entry?.isActive || false;
	}

	/**
	 * Gets all active recording game IDs
	 */
	getActiveRecordings(): GameId[] {
		return Array.from(this.recordings.entries())
			.filter(([, entry]) => entry.isActive)
			.map(([gameId]) => gameId);
	}

	/**
	 * Gets all completed recording game IDs
	 */
	getCompletedRecordings(): GameId[] {
		return Array.from(this.recordings.entries())
			.filter(([, entry]) => !entry.isActive)
			.map(([gameId]) => gameId);
	}

	/**
	 * Removes a recording from memory
	 */
	removeRecording(gameId: GameId): boolean {
		return this.recordings.delete(gameId);
	}

	/**
	 * Gets memory usage statistics
	 */
	getMemoryStats(): {
		totalRecordings: number;
		activeRecordings: number;
		completedRecordings: number;
	} {
		const active = this.getActiveRecordings().length;
		const completed = this.getCompletedRecordings().length;

		return {
			totalRecordings: this.recordings.size,
			activeRecordings: active,
			completedRecordings: completed,
		};
	}

	/**
	 * Private helper methods
	 */
	private createCheckpoint(
		replayData: ReplayData,
		currentEvent: ReplayEvent,
	): void {
		if (!currentEvent.gameStateAfter) return;

		const checkpoint: ReplayCheckpoint = {
			sequenceId: currentEvent.sequenceId,
			handNumber: currentEvent.handNumber,
			phase: currentEvent.gameStateAfter.currentPhase,
			gameState: this.cloneGameState(currentEvent.gameStateAfter),
			timestamp: currentEvent.timestamp,
			eventIndex: replayData.events.length - 1,
		};

		replayData.checkpoints = replayData.checkpoints || [];
		replayData.checkpoints.push(checkpoint);
	}

	private shouldCreateCheckpoint(replayData: ReplayData): boolean {
		return replayData.events.length % this.config.checkpointInterval === 0;
	}

	private manageMemory(): void {
		const totalCount = this.recordings.size;

		if (totalCount > this.config.maxReplaysInMemory) {
			// Remove oldest inactive recordings
			const inactiveEntries = Array.from(this.recordings.entries())
				.filter(([, entry]) => !entry.isActive)
				.sort(
					([, a], [, b]) =>
						a.replayData.startTime.getTime() - b.replayData.startTime.getTime(),
				);

			const toRemove = Math.min(
				inactiveEntries.length,
				totalCount - this.config.maxReplaysInMemory,
			);

			for (let i = 0; i < toRemove; i++) {
				const [gameId] = inactiveEntries[i];
				this.recordings.delete(gameId);
			}

			if (toRemove > 0) {
				replayLogger.info(`Removed ${toRemove} old recordings from memory`);
			}
		}
	}

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
			replayData.metadata.avgHandDuration =
				handDurations.reduce((sum, duration) => sum + duration, 0) /
				handDurations.length;
		}

		// Calculate winners and final chip counts
		if (replayData.finalGameState) {
			replayData.metadata.finalChipCounts = {};
			replayData.finalGameState.players.forEach((player) => {
				replayData.metadata.finalChipCounts![player.id] = player.chipStack;
			});
		}
	}

	private cloneGameState(gameState: GameState): GameState {
		if (!gameState) {
			throw new Error('Cannot clone undefined game state');
		}

		// If we have a GameStateClass instance with visibility methods, use them
		if (
			gameState &&
			typeof (gameState as any).getStateWithVisibility === 'function'
		) {
			return (gameState as any).getStateWithVisibility('replay', undefined);
		}

		// Otherwise, manually filter the game state
		const clonedState = JSON.parse(JSON.stringify(gameState));
		const isShowdown =
			gameState.currentPhase === 'showdown' ||
			gameState.currentPhase === 'hand_complete';

		// Apply visibility rules to players
		if (clonedState.players && Array.isArray(clonedState.players)) {
			clonedState.players = clonedState.players.map((player: any) => {
				const shouldShow = shouldShowHoleCards(
					'replay',
					undefined,
					player.id,
					isShowdown,
					player.isFolded,
				);

				if (!shouldShow && player.holeCards) {
					// Remove hole cards
					const { ...publicPlayer } = player;
					return publicPlayer;
				}

				return player;
			});
		}

		return clonedState;
	}

	private cloneEvent(event: GameEvent): GameEvent {
		return JSON.parse(JSON.stringify(event));
	}

	private cloneObject<T>(obj: T): T {
		return JSON.parse(JSON.stringify(obj));
	}

	private getCallAmount(possibleActions: PossibleAction[]): number {
		const callAction = possibleActions.find((a) => a.type === 'call');
		return callAction?.minAmount || 0;
	}

	private getMaxOpponentStack(
		gameState: GameState,
		playerId: PlayerId,
	): number {
		return Math.max(
			...gameState.players
				.filter((p) => p.id !== playerId && p.isActive)
				.map((p) => p.chipStack),
		);
	}
}
