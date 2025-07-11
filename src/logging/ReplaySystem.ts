import { 
	ReplayData, 
	ReplayEvent, 
	GameState, 
	GameId, 
	PlayerId,
	ReplayCheckpoint,
	HandReplayData,
	GamePhase
} from '@types';
import { EnhancedGameLogger } from './EnhancedGameLogger';

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

export interface ReplayAnalysis {
	handAnalysis: HandAnalysisResult[];
	playerStatistics: Record<PlayerId, PlayerReplayStats>;
	gameFlow: GameFlowAnalysis;
	interestingMoments: InterestingMoment[];
}

export interface HandAnalysisResult {
	handNumber: number;
	duration: number;
	totalActions: number;
	potSize: number;
	players: PlayerId[];
	winner?: PlayerId;
	keyDecisions: KeyDecision[];
	unusual: boolean; // Flag for unusual or interesting hands
}

export interface PlayerReplayStats {
	playerId: PlayerId;
	name: string;
	handsPlayed: number;
	actionsCount: number;
	avgDecisionTime: number;
	aggression: number; // Calculated aggression factor
	tightness: number; // Calculated tightness factor
	winRate: number;
	chipStackProgression: { timestamp: number; chips: number }[];
}

export interface GameFlowAnalysis {
	totalDuration: number;
	avgHandDuration: number;
	actionDistribution: Record<string, number>;
	phaseDistribution: Record<GamePhase, number>;
	potSizeProgression: { handNumber: number; potSize: number }[];
}

export interface KeyDecision {
	eventIndex: number;
	playerId: PlayerId;
	actionTaken: string;
	alternatives: string[];
	potOdds?: number;
	estimated: boolean; // Whether this was identified as a key decision
}

export interface InterestingMoment {
	eventIndex: number;
	handNumber: number;
	type: 'big_pot' | 'unusual_play' | 'all_in' | 'bad_beat' | 'bluff_caught';
	description: string;
	players: PlayerId[];
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

	constructor(private logger?: EnhancedGameLogger) {}

	/**
	 * Loads a replay for playback
	 */
	loadReplay(replayData: ReplayData): boolean {
		try {
			this.replayData = replayData;
			this.currentEventIndex = 0;
			this.stop();
			
			console.log(`[ReplaySystem] Loaded replay: ${replayData.gameId} (${replayData.events.length} events)`);
			return true;
		} catch (error) {
			console.error(`[ReplaySystem] Failed to load replay:`, error);
			return false;
		}
	}

	/**
	 * Loads a replay from file
	 */
	loadReplayFromFile(filepath: string): boolean {
		if (!this.logger) {
			console.error('[ReplaySystem] No logger available for file operations');
			return false;
		}

		const replayData = this.logger.loadReplayFromFile(filepath);
		if (!replayData) {
			return false;
		}

		return this.loadReplay(replayData);
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

		console.log(`[ReplaySystem] Started playback at ${this.playbackSpeed}x speed`);
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
			event => event.type === 'hand_started' && event.handNumber === handNumber
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
			.filter(cp => cp.eventIndex <= eventIndex)
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
			totalEvents: this.replayData?.events.length || 0
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
		if (!this.logger || !this.replayData) return undefined;
		return this.logger.getHandReplayData(this.replayData.gameId, handNumber);
	}

	/**
	 * Analyzes the entire replay for insights
	 */
	analyzeReplay(): ReplayAnalysis | null {
		if (!this.replayData) return null;

		const handAnalysis = this.analyzeHands();
		const playerStatistics = this.calculatePlayerStatistics();
		const gameFlow = this.analyzeGameFlow();
		const interestingMoments = this.findInterestingMoments();

		return {
			handAnalysis,
			playerStatistics,
			gameFlow,
			interestingMoments
		};
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
			this.eventCallbacks.forEach(callback => {
				try {
					callback(currentEvent, gameState);
				} catch (error) {
					console.error('[ReplaySystem] Error in event callback:', error);
				}
			});
		}
	}

	private notifyPositionChange(): void {
		const position = this.getCurrentPosition();
		this.positionCallbacks.forEach(callback => {
			try {
				callback(position);
			} catch (error) {
				console.error('[ReplaySystem] Error in position callback:', error);
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
				timestamp: this.replayData?.startTime.getTime() || 0
			};
		}

		const currentEvent = this.replayData.events[this.currentEventIndex];
		const gameState = this.getCurrentGameState();

		return {
			eventIndex: this.currentEventIndex,
			sequenceId: currentEvent.sequenceId,
			handNumber: currentEvent.handNumber,
			phase: gameState?.currentPhase || GamePhase.PreFlop,
			timestamp: currentEvent.timestamp
		};
	}

	private canStepForward(): boolean {
		return this.replayData ? this.currentEventIndex < this.replayData.events.length - 1 : false;
	}

	private canStepBackward(): boolean {
		return this.currentEventIndex > 0;
	}

	private analyzeHands(): HandAnalysisResult[] {
		if (!this.replayData) return [];

		const results: HandAnalysisResult[] = [];
		const handNumbers = new Set(this.replayData.events.map(e => e.handNumber));

		for (const handNumber of handNumbers) {
			if (handNumber === 0) continue; // Skip game start events

			const handEvents = this.replayData.events.filter(e => e.handNumber === handNumber);
			const startEvent = handEvents.find(e => e.type === 'hand_started');
			const endEvent = handEvents.find(e => e.type === 'hand_complete');

			if (!startEvent || !endEvent) continue;

			const duration = endEvent.timestamp - startEvent.timestamp;
			const actions = handEvents.filter(e => e.action).length;
			const finalState = endEvent.gameStateAfter || endEvent.gameStateBefore;
			const potSize = finalState ? finalState.pots.reduce((sum, pot) => sum + pot.amount, 0) : 0;

			const players = new Set<PlayerId>();
			handEvents.forEach(e => {
				if (e.playerId) players.add(e.playerId);
			});

			results.push({
				handNumber,
				duration,
				totalActions: actions,
				potSize,
				players: Array.from(players),
				keyDecisions: [], // TODO: Implement key decision detection
				unusual: potSize > 500 || duration > 60000 // Simple heuristic for unusual hands
			});
		}

		return results;
	}

	private calculatePlayerStatistics(): Record<PlayerId, PlayerReplayStats> {
		if (!this.replayData) return {};

		const stats: Record<PlayerId, PlayerReplayStats> = {};

		// Initialize stats for all players
		Object.entries(this.replayData.metadata.playerNames).forEach(([playerId, name]) => {
			stats[playerId] = {
				playerId,
				name,
				handsPlayed: 0,
				actionsCount: 0,
				avgDecisionTime: 0,
				aggression: 0,
				tightness: 0,
				winRate: 0,
				chipStackProgression: []
			};
		});

		// Calculate statistics from events
		const decisionTimes: Record<PlayerId, number[]> = {};
		Object.keys(stats).forEach(playerId => {
			decisionTimes[playerId] = [];
		});

		this.replayData.events.forEach(event => {
			if (event.playerId && stats[event.playerId]) {
				const playerStats = stats[event.playerId];

				if (event.action) {
					playerStats.actionsCount++;
					if (event.playerDecisionContext?.timeToDecide) {
						decisionTimes[event.playerId].push(event.playerDecisionContext.timeToDecide);
					}
				}

				if (event.type === 'hand_started') {
					playerStats.handsPlayed++;
				}

				// Track chip progression
				const gameState = event.gameStateAfter || event.gameStateBefore;
				if (gameState) {
					const player = gameState.players.find(p => p.id === event.playerId);
					if (player) {
						playerStats.chipStackProgression.push({
							timestamp: event.timestamp,
							chips: player.chipStack
						});
					}
				}
			}
		});

		// Calculate average decision times
		Object.entries(decisionTimes).forEach(([playerId, times]) => {
			if (times.length > 0) {
				stats[playerId].avgDecisionTime = times.reduce((sum, time) => sum + time, 0) / times.length;
			}
		});

		return stats;
	}

	private analyzeGameFlow(): GameFlowAnalysis {
		if (!this.replayData) {
			return {
				totalDuration: 0,
				avgHandDuration: 0,
				actionDistribution: {},
				phaseDistribution: {} as Record<GamePhase, number>,
				potSizeProgression: []
			};
		}

		const actionDistribution: Record<string, number> = {};
		const phaseDistribution: Partial<Record<GamePhase, number>> = {};
		const potSizeProgression: { handNumber: number; potSize: number }[] = [];

		this.replayData.events.forEach(event => {
			// Count action types
			if (event.action) {
				actionDistribution[event.action.type] = (actionDistribution[event.action.type] || 0) + 1;
			}

			// Count phases
			if (event.phase) {
				phaseDistribution[event.phase] = (phaseDistribution[event.phase] || 0) + 1;
			}

			// Track pot progression
			if (event.type === 'hand_complete') {
				const gameState = event.gameStateAfter || event.gameStateBefore;
				if (gameState) {
					const potSize = gameState.pots.reduce((sum, pot) => sum + pot.amount, 0);
					potSizeProgression.push({
						handNumber: event.handNumber,
						potSize
					});
				}
			}
		});

		return {
			totalDuration: this.replayData.metadata.gameDuration,
			avgHandDuration: this.replayData.metadata.avgHandDuration || 0,
			actionDistribution,
			phaseDistribution: phaseDistribution as Record<GamePhase, number>,
			potSizeProgression
		};
	}

	private findInterestingMoments(): InterestingMoment[] {
		if (!this.replayData) return [];

		const moments: InterestingMoment[] = [];

		this.replayData.events.forEach((event, index) => {
			const gameState = event.gameStateAfter || event.gameStateBefore;
			if (!gameState) return;

			const potSize = gameState.pots.reduce((sum, pot) => sum + pot.amount, 0);

			// Big pot (over 500 chips)
			if (potSize > 500 && event.type === 'hand_complete') {
				moments.push({
					eventIndex: index,
					handNumber: event.handNumber,
					type: 'big_pot',
					description: `Big pot: ${potSize} chips`,
					players: gameState.players.filter(p => p.isActive).map(p => p.id)
				});
			}

			// All-in situations
			if (event.action?.type === 'all_in') {
				moments.push({
					eventIndex: index,
					handNumber: event.handNumber,
					type: 'all_in',
					description: `${event.playerId} went all-in`,
					players: [event.playerId!]
				});
			}
		});

		return moments;
	}
}