import { ReplayAnalyzer } from '@/domain/replay/ReplayAnalyzer';
import {
	GamePhase,
	GameState,
	PlayerInfo,
	Position,
	ReplayData,
	ReplayEvent,
} from '@/domain/types';

describe('ReplayAnalyzer', () => {
	let analyzer: ReplayAnalyzer;

	const createMockReplayData = (customEvents?: ReplayEvent[]): ReplayData => {
		const baseEvents: ReplayEvent[] = [
			{
				type: 'game_started',
				timestamp: 1000,
				handNumber: 0,
				phase: GamePhase.PreFlop,
				sequenceId: 1,
			},
			{
				type: 'hand_started',
				timestamp: 2000,
				handNumber: 1,
				phase: GamePhase.PreFlop,
				playerId: 'player1', // Add back playerId for hand counting
				sequenceId: 2,
				gameStateBefore: createMockGameState(1),
				gameStateAfter: createMockGameState(1),
			},
			{
				type: 'hand_started',
				timestamp: 2000,
				handNumber: 1,
				phase: GamePhase.PreFlop,
				playerId: 'player2', // Add hand_started for player2 as well
				sequenceId: 3,
				gameStateBefore: createMockGameState(1),
				gameStateAfter: createMockGameState(1),
			},
			{
				type: 'action_taken',
				timestamp: 3000,
				handNumber: 1,
				phase: GamePhase.PreFlop,
				playerId: 'player1',
				action: { type: 'call' as any, amount: 20, playerId: 'player1', timestamp: 3000 },
				sequenceId: 4,
				playerDecisionContext: {
					playerId: 'player1',
					possibleActions: [],
					timeToDecide: 2000,
					position: Position.SmallBlind,
					chipStack: 1000,
					potOdds: 0.2,
					effectiveStackSize: 1000,
				},
				gameStateBefore: createMockGameState(1),
				gameStateAfter: createMockGameState(1),
			},
			{
				type: 'action_taken',
				timestamp: 5000,
				handNumber: 1,
				phase: GamePhase.PreFlop,
				playerId: 'player2',
				action: { type: 'raise' as any, amount: 60, playerId: 'player2', timestamp: 5000 },
				sequenceId: 5,
				playerDecisionContext: {
					playerId: 'player2',
					possibleActions: [],
					timeToDecide: 5000,
					position: Position.BigBlind,
					chipStack: 1000,
					potOdds: 0.15,
					effectiveStackSize: 1000,
				},
				gameStateBefore: createMockGameState(1),
				gameStateAfter: createMockGameState(1),
			},
			{
				type: 'hand_complete',
				timestamp: 8000,
				handNumber: 1,
				phase: GamePhase.Showdown,
				sequenceId: 6,
				gameStateBefore: createMockGameState(1),
				gameStateAfter: createMockGameState(1, 80), // 80 chip pot
			},
		];

		return {
			gameId: 'test-game-123',
			startTime: new Date(1000),
			endTime: new Date(10000),
			events: customEvents || baseEvents,
			initialGameState: createMockGameState(0),
			finalGameState: createMockGameState(1),
			metadata: {
				gameConfig: {
					maxPlayers: 6,
					smallBlindAmount: 10,
					bigBlindAmount: 20,
					turnTimeLimit: 30000,
					isTournament: false,
				},
				playerNames: {
					player1: 'Player One',
					player2: 'Player Two',
				},
				handCount: 1,
				totalEvents: customEvents?.length || baseEvents.length,
				totalActions: 2,
				gameDuration: 9000,
				avgHandDuration: 6000,
				winners: [{ playerId: 'player1', handsWon: 1 }],
				finalChipCounts: { player1: 1040, player2: 960 },
				createdAt: new Date(1000),
				version: '1.0.0',
			},
		};
	};

	const createMockGameState = (handNumber: number, potAmount = 30): GameState => ({
		id: `game-${handNumber}`,
		currentPhase: GamePhase.PreFlop,
		handNumber,
		players: [
			{
				id: 'player1',
				name: 'Player One',
				chipStack: 1000,
				position: Position.SmallBlind,
				isActive: true,
				isFolded: false,
				currentBet: 20,
				hasActed: true,
				isAllIn: false,
				totalBetThisHand: 20,
			} as PlayerInfo,
			{
				id: 'player2',
				name: 'Player Two',
				chipStack: 1000,
				position: Position.BigBlind,
				isActive: true,
				isFolded: false,
				currentBet: 20,
				hasActed: true,
				isAllIn: false,
				totalBetThisHand: 20,
			} as PlayerInfo,
		],
		currentPlayerToAct: 'player1',
		dealerPosition: 0,
		smallBlindPosition: 0,
		bigBlindPosition: 1,
		smallBlindAmount: 10,
		bigBlindAmount: 20,
		minimumRaise: 20,
		communityCards: [],
		pots: [{ amount: potAmount, eligiblePlayers: ['player1', 'player2'], isMainPot: true }],
		isComplete: false,
	});

	beforeEach(() => {
		analyzer = new ReplayAnalyzer();
	});

	describe('Complete Replay Analysis', () => {
		test('should analyze complete replay', () => {
			const replayData = createMockReplayData();
			
			const analysis = analyzer.analyzeReplay(replayData);
			
			expect(analysis).toBeDefined();
			expect(analysis.handAnalysis).toBeDefined();
			expect(analysis.playerStatistics).toBeDefined();
			expect(analysis.gameFlow).toBeDefined();
			expect(analysis.interestingMoments).toBeDefined();
		});

		test('should return consistent analysis structure', () => {
			const replayData = createMockReplayData();
			
			const analysis = analyzer.analyzeReplay(replayData);
			
			expect(analysis.handAnalysis).toBeInstanceOf(Array);
			expect(analysis.playerStatistics).toBeInstanceOf(Object);
			expect(analysis.gameFlow).toHaveProperty('totalDuration');
			expect(analysis.gameFlow).toHaveProperty('actionDistribution');
			expect(analysis.interestingMoments).toBeInstanceOf(Array);
		});
	});

	describe('Hand Analysis', () => {
		test('should analyze hands correctly', () => {
			const replayData = createMockReplayData();
			
			const handAnalysis = analyzer.analyzeHands(replayData);
			
			expect(handAnalysis).toHaveLength(1);
			expect(handAnalysis[0]).toMatchObject({
				handNumber: 1,
				duration: 6000, // 8000 - 2000
				totalActions: 2,
				potSize: 80,
				players: expect.arrayContaining(['player1', 'player2']),
			});
		});

		test('should identify unusual hands', () => {
			const bigPotEvents = [
				...createMockReplayData().events.slice(0, -1),
				{
					type: 'hand_complete',
					timestamp: 8000,
					handNumber: 1,
					phase: GamePhase.Showdown,
					sequenceId: 6,
					gameStateBefore: createMockGameState(1, 600), // Big pot
					gameStateAfter: createMockGameState(1, 600),
				},
			];
			
			const replayData = createMockReplayData(bigPotEvents as ReplayEvent[]);
			const handAnalysis = analyzer.analyzeHands(replayData);
			
			expect(handAnalysis[0].unusual).toBe(true);
			expect(handAnalysis[0].potSize).toBe(600);
		});

		test('should handle hands without start or end events', () => {
			const incompleteEvents: ReplayEvent[] = [
				{
					type: 'action_taken',
					timestamp: 3000,
					handNumber: 1,
					phase: GamePhase.PreFlop,
					playerId: 'player1',
					action: { type: 'call' as any, amount: 20, playerId: 'player1', timestamp: 3000 },
					sequenceId: 4,
				},
			];
			
			const replayData = createMockReplayData(incompleteEvents);
			const handAnalysis = analyzer.analyzeHands(replayData);
			
			expect(handAnalysis).toHaveLength(0);
		});

		test('should analyze specific hand by number', () => {
			const replayData = createMockReplayData();
			
			const handAnalysis = analyzer.analyzeHand(replayData, 1);
			
			expect(handAnalysis).toBeDefined();
			expect(handAnalysis?.handNumber).toBe(1);
			expect(handAnalysis?.duration).toBe(6000);
		});

		test('should return undefined for non-existent hand', () => {
			const replayData = createMockReplayData();
			
			const handAnalysis = analyzer.analyzeHand(replayData, 999);
			
			expect(handAnalysis).toBeUndefined();
		});
	});

	describe('Player Statistics', () => {
		test('should calculate basic player statistics', () => {
			const replayData = createMockReplayData();
			
			const playerStats = analyzer.calculatePlayerStatistics(replayData);
			
			expect(playerStats['player1']).toBeDefined();
			expect(playerStats['player2']).toBeDefined();
			
			expect(playerStats['player1']).toMatchObject({
				playerId: 'player1',
				name: 'Player One',
				handsPlayed: 1,
				actionsCount: 1,
				avgDecisionTime: 2000,
			});
			
			expect(playerStats['player2']).toMatchObject({
				playerId: 'player2',
				name: 'Player Two',
				handsPlayed: 1,
				actionsCount: 1,
				avgDecisionTime: 5000,
			});
		});

		test('should calculate aggression and tightness factors', () => {
			const aggressiveEvents: ReplayEvent[] = [
				...createMockReplayData().events.slice(0, 2),
				{
					type: 'action_taken',
					timestamp: 3000,
					handNumber: 1,
					phase: GamePhase.PreFlop,
					playerId: 'player1',
					action: { type: 'raise' as any, amount: 60, playerId: 'player1', timestamp: 3000 },
					sequenceId: 4,
				},
				{
					type: 'action_taken',
					timestamp: 4000,
					handNumber: 1,
					phase: GamePhase.PreFlop,
					playerId: 'player2',
					action: { type: 'fold' as any, amount: 0, playerId: 'player2', timestamp: 4000 },
					sequenceId: 5,
				},
				{
					type: 'hand_complete',
					timestamp: 5000,
					handNumber: 1,
					phase: GamePhase.Showdown,
					sequenceId: 6,
					gameStateBefore: createMockGameState(1),
					gameStateAfter: createMockGameState(1),
				},
			];
			
			const replayData = createMockReplayData(aggressiveEvents as ReplayEvent[]);
			const playerStats = analyzer.calculatePlayerStatistics(replayData);
			
			expect(playerStats['player1'].aggression).toBeGreaterThan(0);
			expect(playerStats['player2'].tightness).toBeGreaterThan(0);
		});

		test('should track chip stack progression', () => {
			const replayData = createMockReplayData();
			
			const playerStats = analyzer.calculatePlayerStatistics(replayData);
			
			expect(playerStats['player1'].chipStackProgression).toBeDefined();
			expect(playerStats['player1'].chipStackProgression.length).toBeGreaterThan(0);
		});

		test('should handle empty decision times', () => {
			const eventsWithoutContext = createMockReplayData().events.map(event => ({
				...event,
				playerDecisionContext: undefined,
			}));
			
			const replayData = createMockReplayData(eventsWithoutContext as ReplayEvent[]);
			const playerStats = analyzer.calculatePlayerStatistics(replayData);
			
			expect(playerStats['player1'].avgDecisionTime).toBe(0);
			expect(playerStats['player2'].avgDecisionTime).toBe(0);
		});
	});

	describe('Game Flow Analysis', () => {
		test('should analyze action distribution', () => {
			const replayData = createMockReplayData();
			
			const gameFlow = analyzer.analyzeGameFlow(replayData);
			
			expect(gameFlow.actionDistribution).toBeDefined();
			expect(gameFlow.actionDistribution['call']).toBe(1);
			expect(gameFlow.actionDistribution['raise']).toBe(1);
		});

		test('should analyze phase distribution', () => {
			const replayData = createMockReplayData();
			
			const gameFlow = analyzer.analyzeGameFlow(replayData);
			
			expect(gameFlow.phaseDistribution).toBeDefined();
			expect(gameFlow.phaseDistribution[GamePhase.PreFlop]).toBeGreaterThan(0);
		});

		test('should track pot size progression', () => {
			const replayData = createMockReplayData();
			
			const gameFlow = analyzer.analyzeGameFlow(replayData);
			
			expect(gameFlow.potSizeProgression).toBeDefined();
			expect(gameFlow.potSizeProgression).toHaveLength(1);
			expect(gameFlow.potSizeProgression[0]).toMatchObject({
				handNumber: 1,
				potSize: 80,
			});
		});

		test('should calculate game duration correctly', () => {
			const replayData = createMockReplayData();
			
			const gameFlow = analyzer.analyzeGameFlow(replayData);
			
			expect(gameFlow.totalDuration).toBe(9000);
			expect(gameFlow.avgHandDuration).toBe(6000);
		});
	});

	describe('Interesting Moments Detection', () => {
		test('should detect big pots', () => {
			const bigPotEvents = [
				...createMockReplayData().events.slice(0, -1),
				{
					type: 'hand_complete',
					timestamp: 8000,
					handNumber: 1,
					phase: GamePhase.Showdown,
					sequenceId: 6,
					gameStateBefore: createMockGameState(1, 600), // Big pot
					gameStateAfter: createMockGameState(1, 600),
				},
			];
			
			const replayData = createMockReplayData(bigPotEvents as ReplayEvent[]);
			const moments = analyzer.findInterestingMoments(replayData);
			
			const bigPotMoment = moments.find(m => m.type === 'big_pot');
			expect(bigPotMoment).toBeDefined();
			expect(bigPotMoment?.description).toContain('600 chips');
		});

		test('should detect all-in situations', () => {
			const allInEvents: ReplayEvent[] = [
				...createMockReplayData().events.slice(0, 3), // game_started, hand_started for player1, hand_started for player2
				{
					type: 'action_taken',
					timestamp: 3000,
					handNumber: 1,
					phase: GamePhase.PreFlop,
					playerId: 'player1',
					action: { type: 'all_in' as any, amount: 1000, playerId: 'player1', timestamp: 3000 },
					sequenceId: 4,
					gameStateBefore: createMockGameState(1),
					gameStateAfter: createMockGameState(1),
				},
				...createMockReplayData().events.slice(4), // Skip the original first action_taken event
			];
			
			const replayData = createMockReplayData(allInEvents as ReplayEvent[]);
			const moments = analyzer.findInterestingMoments(replayData);
			
			const allInMoment = moments.find(m => m.type === 'all_in');
			expect(allInMoment).toBeDefined();
			expect(allInMoment?.description).toContain('went all-in');
			expect(allInMoment?.players).toContain('player1');
		});

		test('should detect unusual long decision times', () => {
			const longDecisionEvents = createMockReplayData().events.map(event => {
				if (event.playerDecisionContext) {
					return {
						...event,
						playerDecisionContext: {
							...event.playerDecisionContext,
							timeToDecide: 25000, // 25 seconds
						},
					};
				}
				return event;
			});
			
			const replayData = createMockReplayData(longDecisionEvents as ReplayEvent[]);
			const moments = analyzer.findInterestingMoments(replayData);
			
			const longDecisionMoments = moments.filter(m => m.type === 'unusual_play');
			expect(longDecisionMoments.length).toBeGreaterThan(0);
			expect(longDecisionMoments[0].description).toContain('25s to decide');
		});

		test('should handle events without game state', () => {
			const eventsWithoutState = createMockReplayData().events.map(event => ({
				...event,
				gameStateBefore: undefined,
				gameStateAfter: undefined,
			}));
			
			const replayData = createMockReplayData(eventsWithoutState as ReplayEvent[]);
			
			// Should not throw
			expect(() => analyzer.findInterestingMoments(replayData)).not.toThrow();
		});
	});

	describe('Player Comparison', () => {
		test('should compare two players successfully', () => {
			const replayData = createMockReplayData();
			
			const comparison = analyzer.comparePlayerStats(replayData, 'player1', 'player2');
			
			expect(comparison).toBeDefined();
			expect(comparison?.player1).toBeDefined();
			expect(comparison?.player2).toBeDefined();
			expect(comparison?.comparison).toBeDefined();
			expect(comparison?.comparison.fasterDecisions).toBe('player1'); // 2000ms vs 5000ms
		});

		test('should handle non-existent players', () => {
			const replayData = createMockReplayData();
			
			const comparison = analyzer.comparePlayerStats(replayData, 'player1', 'non-existent');
			
			expect(comparison).toBeUndefined();
		});

		test('should identify more aggressive player', () => {
			const aggressiveEvents: ReplayEvent[] = [
				...createMockReplayData().events.slice(0, 2),
				{
					type: 'action_taken',
					timestamp: 3000,
					handNumber: 1,
					phase: GamePhase.PreFlop,
					playerId: 'player1',
					action: { type: 'raise' as any, amount: 60, playerId: 'player1', timestamp: 3000 },
					sequenceId: 4,
				},
				{
					type: 'action_taken',
					timestamp: 4000,
					handNumber: 1,
					phase: GamePhase.PreFlop,
					playerId: 'player2',
					action: { type: 'call' as any, amount: 40, playerId: 'player2', timestamp: 4000 },
					sequenceId: 5,
				},
				{
					type: 'hand_complete',
					timestamp: 5000,
					handNumber: 1,
					phase: GamePhase.Showdown,
					sequenceId: 6,
					gameStateBefore: createMockGameState(1),
					gameStateAfter: createMockGameState(1),
				},
			];
			
			const replayData = createMockReplayData(aggressiveEvents as ReplayEvent[]);
			const comparison = analyzer.comparePlayerStats(replayData, 'player1', 'player2');
			
			expect(comparison?.comparison.moreAggressive).toBe('player1');
		});
	});

	describe('Summary Statistics', () => {
		test('should calculate summary statistics', () => {
			const replayData = createMockReplayData();
			
			const summary = analyzer.getSummaryStats(replayData);
			
			expect(summary).toMatchObject({
				totalHands: 1,
				totalActions: 2,
				avgPotSize: 80,
				longestHand: 6000,
				shortestHand: 6000,
				mostActivePlayer: expect.any(String),
			});
		});

		test('should handle empty replay data', () => {
			const emptyReplay: ReplayData = {
				...createMockReplayData(),
				events: [],
				metadata: {
					...createMockReplayData().metadata,
					handCount: 0,
					totalActions: 0,
				},
			};
			
			const summary = analyzer.getSummaryStats(emptyReplay);
			
			expect(summary.totalHands).toBe(0);
			expect(summary.totalActions).toBe(0);
			expect(summary.avgPotSize).toBe(0);
			expect(summary.longestHand).toBe(0);
			expect(summary.shortestHand).toBe(0);
		});

		test('should identify most active player', () => {
			const multiActionEvents: ReplayEvent[] = [
				...createMockReplayData().events.slice(0, 2),
				{
					type: 'action_taken',
					timestamp: 3000,
					handNumber: 1,
					phase: GamePhase.PreFlop,
					playerId: 'player1',
					action: { type: 'raise' as any, amount: 60, playerId: 'player1', timestamp: 3000 },
					sequenceId: 4,
				},
				{
					type: 'action_taken',
					timestamp: 4000,
					handNumber: 1,
					phase: GamePhase.PreFlop,
					playerId: 'player1',
					action: { type: 'bet' as any, amount: 40, playerId: 'player1', timestamp: 4000 },
					sequenceId: 5,
				},
				{
					type: 'action_taken',
					timestamp: 5000,
					handNumber: 1,
					phase: GamePhase.PreFlop,
					playerId: 'player2',
					action: { type: 'call' as any, amount: 40, playerId: 'player2', timestamp: 5000 },
					sequenceId: 6,
				},
				{
					type: 'hand_complete',
					timestamp: 6000,
					handNumber: 1,
					phase: GamePhase.Showdown,
					sequenceId: 7,
					gameStateBefore: createMockGameState(1),
					gameStateAfter: createMockGameState(1),
				},
			];
			
			const replayData = createMockReplayData(multiActionEvents as ReplayEvent[]);
			const summary = analyzer.getSummaryStats(replayData);
			
			expect(summary.mostActivePlayer).toBe('Player One'); // player1 has more actions
		});
	});

	describe('Key Decision Identification', () => {
		test('should identify key decisions with large bets', () => {
			const largeBetEvents: ReplayEvent[] = [
				...createMockReplayData().events.slice(0, 2),
				{
					type: 'action_taken',
					timestamp: 3000,
					handNumber: 1,
					phase: GamePhase.PreFlop,
					playerId: 'player1',
					action: { type: 'bet' as any, amount: 150, playerId: 'player1', timestamp: 3000 }, // Large bet
					sequenceId: 4,
					playerDecisionContext: {
						playerId: 'player1',
						possibleActions: [],
						timeToDecide: 2000,
						position: Position.SmallBlind,
						chipStack: 1000,
						potOdds: 0.2,
						effectiveStackSize: 1000,
					},
				},
				...createMockReplayData().events.slice(3),
			];
			
			const replayData = createMockReplayData(largeBetEvents as ReplayEvent[]);
			const handAnalysis = analyzer.analyzeHands(replayData);
			
			expect(handAnalysis[0].keyDecisions).toBeDefined();
			expect(handAnalysis[0].keyDecisions.length).toBeGreaterThan(0);
			expect(handAnalysis[0].keyDecisions[0].actionTaken).toBe('bet');
		});

		test('should not identify small actions as key decisions', () => {
			const smallBetEvents: ReplayEvent[] = [
				...createMockReplayData().events.slice(0, 2),
				{
					type: 'action_taken',
					timestamp: 3000,
					handNumber: 1,
					phase: GamePhase.PreFlop,
					playerId: 'player1',
					action: { type: 'bet' as any, amount: 10, playerId: 'player1', timestamp: 3000 }, // Small bet
					sequenceId: 4,
				},
				...createMockReplayData().events.slice(3),
			];
			
			const replayData = createMockReplayData(smallBetEvents as ReplayEvent[]);
			const handAnalysis = analyzer.analyzeHands(replayData);
			
			expect(handAnalysis[0].keyDecisions).toHaveLength(0);
		});
	});

	describe('Error Handling', () => {
		test('should handle replay data without player names', () => {
			const replayData = {
				...createMockReplayData(),
				metadata: {
					...createMockReplayData().metadata,
					playerNames: {},
				},
			};
			
			expect(() => analyzer.calculatePlayerStatistics(replayData)).not.toThrow();
		});

		test('should handle events without actions', () => {
			const eventsWithoutActions = createMockReplayData().events.map(event => ({
				...event,
				action: undefined,
			}));
			
			const replayData = createMockReplayData(eventsWithoutActions as ReplayEvent[]);
			
			expect(() => analyzer.analyzeReplay(replayData)).not.toThrow();
		});

		test('should handle events without player decision context', () => {
			const eventsWithoutContext = createMockReplayData().events.map(event => ({
				...event,
				playerDecisionContext: undefined,
			}));
			
			const replayData = createMockReplayData(eventsWithoutContext as ReplayEvent[]);
			const playerStats = analyzer.calculatePlayerStatistics(replayData);
			
			expect(playerStats['player1'].avgDecisionTime).toBe(0);
		});
	});
}); 