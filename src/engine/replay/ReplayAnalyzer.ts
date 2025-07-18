import { GamePhase, PlayerId, ReplayData, ReplayEvent } from '@/types';

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

export interface ReplayAnalysis {
	handAnalysis: HandAnalysisResult[];
	playerStatistics: Record<PlayerId, PlayerReplayStats>;
	gameFlow: GameFlowAnalysis;
	interestingMoments: InterestingMoment[];
}

/**
 * ReplayAnalyzer provides analysis and insights for poker game replays.
 * Focuses purely on analyzing replay data without any storage concerns.
 */
export class ReplayAnalyzer {
	/**
	 * Analyzes a complete replay for insights
	 */
	analyzeReplay(replayData: ReplayData): ReplayAnalysis {
		const handAnalysis = this.analyzeHands(replayData);
		const playerStatistics = this.calculatePlayerStatistics(replayData);
		const gameFlow = this.analyzeGameFlow(replayData);
		const interestingMoments = this.findInterestingMoments(replayData);

		return {
			handAnalysis,
			playerStatistics,
			gameFlow,
			interestingMoments,
		};
	}

	/**
	 * Analyzes individual hands
	 */
	analyzeHands(replayData: ReplayData): HandAnalysisResult[] {
		const results: HandAnalysisResult[] = [];
		const handNumbers = new Set(replayData.events.map((e) => e.handNumber));

		for (const handNumber of handNumbers) {
			if (handNumber === 0) continue; // Skip game start events

			const handEvents = replayData.events.filter(
				(e) => e.handNumber === handNumber,
			);
			const startEvent = handEvents.find((e) => e.type === 'hand_started');
			const endEvent = handEvents.find((e) => e.type === 'hand_complete');

			if (!startEvent || !endEvent) continue;

			const duration = endEvent.timestamp - startEvent.timestamp;
			const actions = handEvents.filter((e) => e.action).length;
			const finalState = endEvent.gameStateAfter || endEvent.gameStateBefore;
			const potSize = finalState
				? finalState.pots.reduce((sum, pot) => sum + pot.amount, 0)
				: 0;

			const players = new Set<PlayerId>();
			handEvents.forEach((e) => {
				if (e.playerId) players.add(e.playerId);
			});

			results.push({
				handNumber,
				duration,
				totalActions: actions,
				potSize,
				players: Array.from(players),
				keyDecisions: this.identifyKeyDecisions(handEvents),
				unusual: potSize > 500 || duration > 60000, // Simple heuristic for unusual hands
			});
		}

		return results;
	}

	/**
	 * Calculates player statistics
	 */
	calculatePlayerStatistics(
		replayData: ReplayData,
	): Record<PlayerId, PlayerReplayStats> {
		const stats: Record<PlayerId, PlayerReplayStats> = {};

		// Initialize stats for all players
		Object.entries(replayData.metadata.playerNames).forEach(
			([playerId, name]) => {
				stats[playerId] = {
					playerId,
					name,
					handsPlayed: 0,
					actionsCount: 0,
					avgDecisionTime: 0,
					aggression: 0,
					tightness: 0,
					winRate: 0,
					chipStackProgression: [],
				};
			},
		);

		// Calculate statistics from events
		const decisionTimes: Record<PlayerId, number[]> = {};
		Object.keys(stats).forEach((playerId) => {
			decisionTimes[playerId] = [];
		});

		replayData.events.forEach((event) => {
			if (event.playerId && stats[event.playerId]) {
				const playerStats = stats[event.playerId];

				if (event.action) {
					playerStats.actionsCount++;
					if (event.playerDecisionContext?.timeToDecide) {
						decisionTimes[event.playerId].push(
							event.playerDecisionContext.timeToDecide,
						);
					}
				}

				if (event.type === 'hand_started') {
					playerStats.handsPlayed++;
				}

				// Track chip progression
				const gameState = event.gameStateAfter || event.gameStateBefore;
				if (gameState) {
					const player = gameState.players.find((p) => p.id === event.playerId);
					if (player) {
						playerStats.chipStackProgression.push({
							timestamp: event.timestamp,
							chips: player.chipStack,
						});
					}
				}
			}
		});

		// Calculate average decision times
		Object.entries(decisionTimes).forEach(([playerId, times]) => {
			if (times.length > 0) {
				stats[playerId].avgDecisionTime =
					times.reduce((sum, time) => sum + time, 0) / times.length;
			}
		});

		// Calculate aggression and tightness factors
		this.calculatePlayingStyles(stats, replayData);

		return stats;
	}

	/**
	 * Analyzes game flow patterns
	 */
	analyzeGameFlow(replayData: ReplayData): GameFlowAnalysis {
		const actionDistribution: Record<string, number> = {};
		const phaseDistribution: Partial<Record<GamePhase, number>> = {};
		const potSizeProgression: { handNumber: number; potSize: number }[] = [];

		replayData.events.forEach((event) => {
			// Count action types
			if (event.action) {
				actionDistribution[event.action.type] =
					(actionDistribution[event.action.type] || 0) + 1;
			}

			// Count phases
			if (event.phase) {
				phaseDistribution[event.phase] =
					(phaseDistribution[event.phase] || 0) + 1;
			}

			// Track pot progression
			if (event.type === 'hand_complete') {
				const gameState = event.gameStateAfter || event.gameStateBefore;
				if (gameState) {
					const potSize = gameState.pots.reduce(
						(sum, pot) => sum + pot.amount,
						0,
					);
					potSizeProgression.push({
						handNumber: event.handNumber,
						potSize,
					});
				}
			}
		});

		return {
			totalDuration: replayData.metadata.gameDuration,
			avgHandDuration: replayData.metadata.avgHandDuration || 0,
			actionDistribution,
			phaseDistribution: phaseDistribution as Record<GamePhase, number>,
			potSizeProgression,
		};
	}

	/**
	 * Finds interesting moments in the game
	 */
	findInterestingMoments(replayData: ReplayData): InterestingMoment[] {
		const moments: InterestingMoment[] = [];

		replayData.events.forEach((event, index) => {
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
					players: gameState.players.filter((p) => p.isActive).map((p) => p.id),
				});
			}

			// All-in situations
			if (event.action?.type === 'all_in') {
				moments.push({
					eventIndex: index,
					handNumber: event.handNumber,
					type: 'all_in',
					description: `${event.playerId} went all-in`,
					players: [event.playerId!],
				});
			}

			// Long decision times (over 20 seconds)
			if (
				event.playerDecisionContext?.timeToDecide &&
				event.playerDecisionContext.timeToDecide > 20000
			) {
				moments.push({
					eventIndex: index,
					handNumber: event.handNumber,
					type: 'unusual_play',
					description: `${event.playerId} took ${Math.round(event.playerDecisionContext.timeToDecide / 1000)}s to decide`,
					players: [event.playerId!],
				});
			}
		});

		return moments;
	}

	/**
	 * Analyzes a specific hand
	 */
	analyzeHand(
		replayData: ReplayData,
		handNumber: number,
	): HandAnalysisResult | undefined {
		const handEvents = replayData.events.filter(
			(e) => e.handNumber === handNumber,
		);
		if (handEvents.length === 0) return undefined;

		const startEvent = handEvents.find((e) => e.type === 'hand_started');
		const endEvent = handEvents.find((e) => e.type === 'hand_complete');

		if (!startEvent || !endEvent) return undefined;

		const duration = endEvent.timestamp - startEvent.timestamp;
		const actions = handEvents.filter((e) => e.action).length;
		const finalState = endEvent.gameStateAfter || endEvent.gameStateBefore;
		const potSize = finalState
			? finalState.pots.reduce((sum, pot) => sum + pot.amount, 0)
			: 0;

		const players = new Set<PlayerId>();
		handEvents.forEach((e) => {
			if (e.playerId) players.add(e.playerId);
		});

		return {
			handNumber,
			duration,
			totalActions: actions,
			potSize,
			players: Array.from(players),
			keyDecisions: this.identifyKeyDecisions(handEvents),
			unusual: potSize > 500 || duration > 60000,
		};
	}

	/**
	 * Compares two players' performance
	 */
	comparePlayerStats(
		replayData: ReplayData,
		playerId1: PlayerId,
		playerId2: PlayerId,
	):
		| {
				player1: PlayerReplayStats;
				player2: PlayerReplayStats;
				comparison: {
					moreAggressive: PlayerId;
					fasterDecisions: PlayerId;
					moreActive: PlayerId;
				};
		  }
		| undefined {
		const allStats = this.calculatePlayerStatistics(replayData);
		const player1Stats = allStats[playerId1];
		const player2Stats = allStats[playerId2];

		if (!player1Stats || !player2Stats) return undefined;

		return {
			player1: player1Stats,
			player2: player2Stats,
			comparison: {
				moreAggressive:
					player1Stats.aggression > player2Stats.aggression
						? playerId1
						: playerId2,
				fasterDecisions:
					player1Stats.avgDecisionTime < player2Stats.avgDecisionTime
						? playerId1
						: playerId2,
				moreActive:
					player1Stats.actionsCount > player2Stats.actionsCount
						? playerId1
						: playerId2,
			},
		};
	}

	/**
	 * Gets summary statistics
	 */
	getSummaryStats(replayData: ReplayData): {
		totalHands: number;
		totalActions: number;
		avgPotSize: number;
		longestHand: number;
		shortestHand: number;
		mostActivePlayer: string;
	} {
		const handAnalysis = this.analyzeHands(replayData);
		const playerStats = this.calculatePlayerStatistics(replayData);

		const potSizes = handAnalysis.map((h) => h.potSize).filter((p) => p > 0);
		const handDurations = handAnalysis.map((h) => h.duration);

		let mostActivePlayer = '';
		let maxActions = 0;
		Object.values(playerStats).forEach((stats) => {
			if (stats.actionsCount > maxActions) {
				maxActions = stats.actionsCount;
				mostActivePlayer = stats.name;
			}
		});

		return {
			totalHands: replayData.metadata.handCount,
			totalActions: replayData.metadata.totalActions,
			avgPotSize:
				potSizes.length > 0
					? potSizes.reduce((a, b) => a + b, 0) / potSizes.length
					: 0,
			longestHand: handDurations.length > 0 ? Math.max(...handDurations) : 0,
			shortestHand: handDurations.length > 0 ? Math.min(...handDurations) : 0,
			mostActivePlayer,
		};
	}

	/**
	 * Private helper methods
	 */
	private identifyKeyDecisions(handEvents: ReplayEvent[]): KeyDecision[] {
		const keyDecisions: KeyDecision[] = [];

		handEvents.forEach((event, index) => {
			// Simple heuristic: large bets or raises are key decisions
			if (
				event.action &&
				(event.action.type === 'raise' || event.action.type === 'bet') &&
				event.action.amount &&
				event.action.amount > 100
			) {
				keyDecisions.push({
					eventIndex: index,
					playerId: event.playerId!,
					actionTaken: event.action.type,
					alternatives: ['fold', 'call'], // Simplified
					potOdds: event.playerDecisionContext?.potOdds,
					estimated: true,
				});
			}
		});

		return keyDecisions;
	}

	private calculatePlayingStyles(
		stats: Record<PlayerId, PlayerReplayStats>,
		replayData: ReplayData,
	): void {
		// Calculate aggression and tightness factors
		replayData.events.forEach((event) => {
			if (event.action && event.playerId && stats[event.playerId]) {
				const playerStats = stats[event.playerId];

				// Aggression: ratio of raises/bets to calls
				if (event.action.type === 'raise' || event.action.type === 'bet') {
					playerStats.aggression += 1;
				}

				// Tightness: ratio of folds to total actions
				if (event.action.type === 'fold') {
					playerStats.tightness += 1;
				}
			}
		});

		// Normalize the factors
		Object.values(stats).forEach((playerStats) => {
			if (playerStats.actionsCount > 0) {
				playerStats.aggression =
					playerStats.aggression / playerStats.actionsCount;
				playerStats.tightness =
					playerStats.tightness / playerStats.actionsCount;
			}
		});
	}
}
