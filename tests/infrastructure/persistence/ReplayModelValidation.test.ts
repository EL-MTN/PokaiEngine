import {
	IReplay,
	IGameEvent,
	IGameMetadata,
	IReplayAnalytics,
} from '@/infrastructure/persistence/models/Replay';

describe('Replay Model Interfaces', () => {
	describe('IGameMetadata validation', () => {
		const createValidMetadata = (): IGameMetadata => ({
			gameId: 'test-game-123',
			gameName: 'Test Cash Game',
			gameType: 'cash',
			maxPlayers: 6,
			actualPlayers: 4,
			smallBlindAmount: 10,
			bigBlindAmount: 20,
			turnTimeLimit: 30,
			gameStartTime: Date.now(),
			gameEndTime: Date.now() + 5400000,
			gameDuration: 5400000,
			totalHands: 45,
			totalActions: 180,
			playerNames: {
				player1: 'Alice',
				player2: 'Bob',
			},
			winners: ['player1'],
		});

		it('should accept valid metadata', () => {
			const metadata = createValidMetadata();
			expect(metadata.gameType).toBe('cash');
			expect(metadata.maxPlayers).toBe(6);
			expect(metadata.actualPlayers).toBe(4);
		});

		it('should have correct gameType values', () => {
			const cashMetadata = createValidMetadata();
			cashMetadata.gameType = 'cash';
			expect(cashMetadata.gameType).toBe('cash');

			const tournamentMetadata = createValidMetadata();
			tournamentMetadata.gameType = 'tournament';
			expect(tournamentMetadata.gameType).toBe('tournament');
		});

		it('should validate player count relationships', () => {
			const metadata = createValidMetadata();
			expect(metadata.actualPlayers).toBeLessThanOrEqual(metadata.maxPlayers);
		});

		it('should validate blind amounts', () => {
			const metadata = createValidMetadata();
			expect(metadata.smallBlindAmount).toBeLessThan(metadata.bigBlindAmount);
		});

		it('should validate time relationships', () => {
			const metadata = createValidMetadata();
			expect(metadata.gameEndTime).toBeGreaterThan(metadata.gameStartTime);
			expect(metadata.gameDuration).toBe(
				metadata.gameEndTime - metadata.gameStartTime,
			);
		});
	});

	describe('IGameEvent validation', () => {
		const createValidEvent = (): IGameEvent => ({
			type: 'action',
			timestamp: Date.now(),
			data: {
				action: {
					type: 'bet',
					amount: 50,
				},
			},
			handNumber: 1,
			phase: 'preflop',
			playerId: 'player1',
		});

		it('should accept valid event', () => {
			const event = createValidEvent();
			expect(event.type).toBe('action');
			expect(event.timestamp).toBeGreaterThan(0);
			expect(event.data).toBeDefined();
		});

		it('should support different event types', () => {
			const eventTypes = [
				'action',
				'hand_started',
				'hand_complete',
				'game_started',
				'game_complete',
			];

			eventTypes.forEach((eventType) => {
				const event = createValidEvent();
				event.type = eventType;
				expect(event.type).toBe(eventType);
			});
		});

		it('should support different phases', () => {
			const phases = ['preflop', 'flop', 'turn', 'river'];

			phases.forEach((phase) => {
				const event = createValidEvent();
				event.phase = phase;
				expect(event.phase).toBe(phase);
			});
		});

		it('should handle optional fields', () => {
			const minimalEvent: IGameEvent = {
				type: 'game_started',
				timestamp: Date.now(),
				data: {},
			};

			expect(minimalEvent.type).toBe('game_started');
			expect(minimalEvent.handNumber).toBeUndefined();
			expect(minimalEvent.phase).toBeUndefined();
			expect(minimalEvent.playerId).toBeUndefined();
		});
	});

	describe('IReplayAnalytics validation', () => {
		const createValidAnalytics = (): IReplayAnalytics => ({
			totalEvents: 180,
			avgHandDuration: 120000,
			actionDistribution: {
				bet: 50,
				call: 80,
				fold: 50,
			},
			phaseDistribution: {
				preflop: 45,
				flop: 30,
				turn: 15,
				river: 10,
			},
			playerPerformance: {
				player1: {
					id: 'player1',
					name: 'Alice',
					initialChipStack: 1000,
					finalChipStack: 1200,
					handsPlayed: 20,
					totalActions: 45,
					winnings: 200,
				},
			},
			gameFlow: {
				peakPotSize: 800,
				longestHand: 300000,
				shortestHand: 30000,
				mostActivePlayer: 'player1',
			},
		});

		it('should accept valid analytics', () => {
			const analytics = createValidAnalytics();
			expect(analytics.totalEvents).toBe(180);
			expect(analytics.avgHandDuration).toBe(120000);
		});

		it('should validate action distribution', () => {
			const analytics = createValidAnalytics();
			const totalActions = Object.values(analytics.actionDistribution).reduce(
				(sum, count) => sum + count,
				0,
			);
			expect(totalActions).toBeGreaterThan(0);
		});

		it('should validate phase distribution', () => {
			const analytics = createValidAnalytics();
			const totalPhases = Object.values(analytics.phaseDistribution).reduce(
				(sum, count) => sum + count,
				0,
			);
			expect(totalPhases).toBeGreaterThan(0);
		});

		it('should validate game flow metrics', () => {
			const analytics = createValidAnalytics();
			expect(analytics.gameFlow.peakPotSize).toBeGreaterThan(0);
			expect(analytics.gameFlow.longestHand).toBeGreaterThan(
				analytics.gameFlow.shortestHand,
			);
			expect(analytics.gameFlow.mostActivePlayer).toBeDefined();
		});

		it('should validate player performance data', () => {
			const analytics = createValidAnalytics();
			const playerPerf = analytics.playerPerformance['player1'];

			expect(playerPerf).toBeDefined();
			expect(playerPerf.id).toBe('player1');
			expect(playerPerf.name).toBe('Alice');
			expect(playerPerf.initialChipStack).toBeGreaterThan(0);
			expect(playerPerf.handsPlayed).toBeGreaterThanOrEqual(0);
			expect(playerPerf.totalActions).toBeGreaterThanOrEqual(0);
		});
	});

	describe('IReplay structure validation', () => {
		const createValidReplay = (): Partial<IReplay> => ({
			gameId: 'test-game-123',
			metadata: {
				gameId: 'test-game-123',
				gameName: 'Test Game',
				gameType: 'cash',
				maxPlayers: 6,
				actualPlayers: 4,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
				turnTimeLimit: 30,
				gameStartTime: Date.now(),
				gameEndTime: Date.now() + 5400000,
				gameDuration: 5400000,
				totalHands: 45,
				totalActions: 180,
				playerNames: { player1: 'Alice' },
				winners: ['player1'],
			},
			events: [
				{
					type: 'hand_started',
					timestamp: Date.now(),
					data: {},
					handNumber: 1,
				},
			],
			handSummaries: [
				{
					handNumber: 1,
					startTimestamp: Date.now(),
					endTimestamp: Date.now() + 120000,
					duration: 120000,
					winner: 'player1',
					potSize: 150,
					communityCards: [],
					actions: 8,
				},
			],
			analytics: {
				totalEvents: 10,
				avgHandDuration: 120000,
				actionDistribution: { call: 5, fold: 3, bet: 2 },
				phaseDistribution: { preflop: 8, flop: 2 },
				playerPerformance: {},
				gameFlow: {
					peakPotSize: 150,
					longestHand: 120000,
					shortestHand: 120000,
					mostActivePlayer: 'player1',
				},
			},
			fileSize: 1024,
			version: '1.0.0',
		});

		it('should have all required fields', () => {
			const replay = createValidReplay();

			expect(replay.gameId).toBeDefined();
			expect(replay.metadata).toBeDefined();
			expect(replay.events).toBeDefined();
			expect(replay.handSummaries).toBeDefined();
			expect(replay.analytics).toBeDefined();
			expect(replay.fileSize).toBeDefined();
			expect(replay.version).toBeDefined();
		});

		it('should maintain data consistency', () => {
			const replay = createValidReplay();

			// gameId should match in metadata
			expect(replay.gameId).toBe(replay.metadata!.gameId);

			// Events should be ordered by timestamp
			if (replay.events!.length > 1) {
				for (let i = 1; i < replay.events!.length; i++) {
					expect(replay.events![i].timestamp).toBeGreaterThanOrEqual(
						replay.events![i - 1].timestamp,
					);
				}
			}

			// Hand summaries should be ordered by hand number
			if (replay.handSummaries!.length > 1) {
				for (let i = 1; i < replay.handSummaries!.length; i++) {
					expect(replay.handSummaries![i].handNumber).toBeGreaterThan(
						replay.handSummaries![i - 1].handNumber,
					);
				}
			}
		});

		it('should validate hand summary structure', () => {
			const replay = createValidReplay();
			const handSummary = replay.handSummaries![0];

			expect(handSummary.handNumber).toBe(1);
			expect(handSummary.endTimestamp).toBeGreaterThan(
				handSummary.startTimestamp,
			);
			expect(handSummary.duration).toBe(
				handSummary.endTimestamp - handSummary.startTimestamp,
			);
			expect(handSummary.potSize).toBeGreaterThan(0);
			expect(handSummary.winner).toBeDefined();
			expect(handSummary.actions).toBeGreaterThanOrEqual(0);
		});

		it('should handle empty collections', () => {
			const replay = createValidReplay();
			replay.events = [];
			replay.handSummaries = [];

			expect(replay.events).toHaveLength(0);
			expect(replay.handSummaries).toHaveLength(0);
			// Should still be valid replay structure
			expect(replay.gameId).toBeDefined();
			expect(replay.metadata).toBeDefined();
		});
	});

	describe('data relationships', () => {
		it('should validate cross-references between collections', () => {
			const gameId = 'test-game-123';
			const playerId = 'player1';

			const metadata: IGameMetadata = {
				gameId,
				gameType: 'cash',
				maxPlayers: 2,
				actualPlayers: 1,
				smallBlindAmount: 5,
				bigBlindAmount: 10,
				turnTimeLimit: 30,
				gameStartTime: Date.now(),
				gameEndTime: Date.now() + 3600000,
				gameDuration: 3600000,
				totalHands: 10,
				totalActions: 50,
				playerNames: { [playerId]: 'Alice' },
				winners: [playerId],
			};

			// Player referenced in event should exist in metadata
			expect(metadata.playerNames[playerId]).toBeDefined();

			// Winner should be a valid player
			expect(
				metadata.winners.every((winner) => metadata.playerNames[winner]),
			).toBe(true);
		});

		it('should validate numeric constraints', () => {
			const metadata: IGameMetadata = {
				gameId: 'test',
				gameType: 'cash',
				maxPlayers: 6,
				actualPlayers: 4,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
				turnTimeLimit: 30,
				gameStartTime: 1000,
				gameEndTime: 2000,
				gameDuration: 1000,
				totalHands: 5,
				totalActions: 25,
				playerNames: {},
				winners: [],
			};

			// Validate constraints
			expect(metadata.actualPlayers).toBeLessThanOrEqual(metadata.maxPlayers);
			expect(metadata.smallBlindAmount).toBeLessThan(metadata.bigBlindAmount);
			expect(metadata.gameEndTime).toBeGreaterThan(metadata.gameStartTime);
			expect(metadata.gameDuration).toBe(
				metadata.gameEndTime - metadata.gameStartTime,
			);
			expect(metadata.maxPlayers).toBeGreaterThan(0);
			expect(metadata.actualPlayers).toBeGreaterThanOrEqual(0);
			expect(metadata.totalHands).toBeGreaterThanOrEqual(0);
			expect(metadata.totalActions).toBeGreaterThanOrEqual(0);
		});
	});
});
