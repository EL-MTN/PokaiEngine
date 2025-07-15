import * as fs from 'fs';
import * as zlib from 'zlib';

import { GameState, Rank, ReplayData, Suit } from '@/domain/types';
import { ReplayStorage } from '@/infrastructure/storage/ReplayStorage';

jest.mock('@/infrastructure/logging/Logger', () => ({
	replayLogger: {
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
	},
}));

describe('ReplayStorage', () => {
	let storage: ReplayStorage;
	const testDir = './test-replays';

	beforeEach(() => {
		// Clean up test directory
		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, { recursive: true });
		}

		storage = new ReplayStorage({
			directory: testDir,
			autoSave: false,
			mongoEnabled: false,
		});
	});

	afterEach(() => {
		// Clean up test directory
		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, { recursive: true });
		}
	});

	describe('extractWinners', () => {
		it('should extract winners from hand_complete event', () => {
			const gameState = createTestGameState();
			const events = [
				{
					type: 'hand_started',
					timestamp: Date.now(),
					handNumber: 1,
					gameStateAfter: gameState,
				},
				{
					type: 'hand_complete',
					timestamp: Date.now() + 1000,
					handNumber: 1,
					winners: [
						{
							playerId: 'player1',
							winAmount: 100,
							handDescription: 'Two Pair',
						},
						{ playerId: 'player2', winAmount: 50, handDescription: 'One Pair' },
					],
					gameStateAfter: gameState,
				},
			];

			const handReplay = storage.buildHandReplayData('game1', 1, events as any);
			expect(handReplay).toBeDefined();
			expect(handReplay?.winners).toBeDefined();
			expect(handReplay?.winners).toHaveLength(2);
			expect(handReplay?.winners[0].playerId).toBe('player1');
			expect(handReplay?.winners[0].winAmount).toBe(100);
		});

		it('should extract winners from chip stack changes if no hand_complete event', () => {
			const gameStateBefore = createTestGameState();
			gameStateBefore.players[0].chipStack = 1000;
			gameStateBefore.players[1].chipStack = 1000;

			const gameStateAfter = createTestGameState();
			gameStateAfter.players[0].chipStack = 1150; // Won 150
			gameStateAfter.players[1].chipStack = 850; // Lost 150

			const events = [
				{
					type: 'hand_started',
					timestamp: Date.now(),
					handNumber: 1,
					gameStateAfter: gameStateBefore,
				},
				{
					type: 'action_taken',
					timestamp: Date.now() + 1000,
					handNumber: 1,
					gameStateBefore: gameStateBefore,
				},
				{
					type: 'showdown_complete',
					timestamp: Date.now() + 2000,
					handNumber: 1,
					gameStateAfter: gameStateAfter,
				},
				{
					type: 'hand_complete',
					timestamp: Date.now() + 3000,
					handNumber: 1,
					gameStateAfter: gameStateAfter,
				},
			];

			const handReplay = storage.buildHandReplayData('game1', 1, events as any);
			expect(handReplay?.winners).toHaveLength(1);
			expect(handReplay?.winners[0].playerId).toBe('player1');
			expect(handReplay?.winners[0].winAmount).toBe(150);
		});
	});

	describe('extractShowdownResults', () => {
		it('should extract showdown results from showdown_complete event', () => {
			const gameState = createTestGameState();
			gameState.players[0].holeCards = [
				{ suit: Suit.Hearts, rank: Rank.Ace },
				{ suit: Suit.Hearts, rank: Rank.King },
			];
			gameState.players[1].holeCards = [
				{ suit: Suit.Clubs, rank: Rank.Queen },
				{ suit: Suit.Clubs, rank: Rank.Jack },
			];
			gameState.communityCards = [
				{ suit: Suit.Hearts, rank: Rank.Queen },
				{ suit: Suit.Hearts, rank: Rank.Jack },
				{ suit: Suit.Hearts, rank: Rank.Ten },
				{ suit: Suit.Diamonds, rank: Rank.Two },
				{ suit: Suit.Diamonds, rank: Rank.Three },
			];

			const events = [
				{
					type: 'hand_started',
					timestamp: Date.now(),
					handNumber: 1,
					gameStateAfter: gameState,
				},
				{
					type: 'showdown_complete',
					timestamp: Date.now() + 1000,
					handNumber: 1,
					gameStateAfter: gameState,
				},
				{
					type: 'hand_complete',
					timestamp: Date.now() + 2000,
					handNumber: 1,
				},
			];

			const handReplay = storage.buildHandReplayData('game1', 1, events as any);
			expect(handReplay?.showdownResults).toBeDefined();
			expect(Object.keys(handReplay?.showdownResults || {})).toHaveLength(2);

			// Player 1 should have a royal flush (A-K-Q-J-10 of hearts)
			const player1Result = handReplay?.showdownResults?.['player1'];
			expect(player1Result?.rank).toBe(10); // Royal flush
		});
	});

	describe('exportReplay', () => {
		it('should export replay as JSON', () => {
			const replayData = createTestReplayData();
			const exported = storage.exportReplay(replayData, 'json');

			expect(typeof exported).toBe('string');
			const parsed = JSON.parse(exported as string);
			expect(parsed.gameId).toBe('game1');
		});

		it('should export replay as compressed data', () => {
			const replayData = createTestReplayData();
			const exported = storage.exportReplay(replayData, 'compressed');

			expect(exported).toBeInstanceOf(Buffer);
			// Decompress and verify
			const decompressed = zlib.gunzipSync(exported as Buffer).toString('utf8');
			const parsed = JSON.parse(decompressed);
			expect(parsed.gameId).toBe('game1');
		});
	});

	describe('saveReplay and loadReplayFromFile', () => {
		it('should save and load uncompressed replay', async () => {
			const replayData = createTestReplayData();
			const result = await storage.saveReplay(replayData, false);

			expect(result.fileSuccess).toBe(true);
			expect(result.filePath).toBeDefined();
			expect(result.filePath).toContain('.json');
			expect(result.filePath).not.toContain('.gz');

			// Load the replay
			const loaded = storage.loadReplayFromFile(result.filePath!);
			expect(loaded).toBeDefined();
			expect(loaded?.gameId).toBe('game1');
			expect(loaded?.metadata.handCount).toBe(5);
		});

		it('should save and load compressed replay', async () => {
			const replayData = createTestReplayData();
			const result = await storage.saveReplay(replayData, true);

			expect(result.fileSuccess).toBe(true);
			expect(result.filePath).toBeDefined();
			expect(result.filePath).toContain('.json.gz');

			// Load the compressed replay
			const loaded = storage.loadReplayFromFile(result.filePath!);
			expect(loaded).toBeDefined();
			expect(loaded?.gameId).toBe('game1');
			expect(loaded?.metadata.handCount).toBe(5);
		});
	});

	describe('listAvailableReplays', () => {
		it('should list all replay files', async () => {
			const replayData1 = createTestReplayData();
			replayData1.gameId = 'game1';
			replayData1.startTime = new Date('2025-01-01T10:00:00Z');

			const replayData2 = createTestReplayData();
			replayData2.gameId = 'game2';
			replayData2.startTime = new Date('2025-01-01T11:00:00Z');

			const result1 = await storage.saveReplay(replayData1, false);
			expect(result1.fileSuccess).toBe(true);
			expect(result1.filePath).toBeDefined();

			const result2 = await storage.saveReplay(replayData2, true);
			expect(result2.fileSuccess).toBe(true);
			expect(result2.filePath).toBeDefined();

			// Check that files exist
			expect(fs.existsSync(result1.filePath!)).toBe(true);
			expect(fs.existsSync(result2.filePath!)).toBe(true);

			const replays = storage.listAvailableReplays();
			expect(replays).toHaveLength(2);
			expect(replays.some((r) => r.includes('game1'))).toBe(true);
			expect(replays.some((r) => r.includes('game2'))).toBe(true);
			expect(
				replays.some((r) => r.endsWith('.json') && !r.endsWith('.json.gz')),
			).toBe(true);
			expect(replays.some((r) => r.endsWith('.json.gz'))).toBe(true);
		});
	});
});

function createTestReplayData(): ReplayData {
	return {
		gameId: 'game1',
		startTime: new Date(),
		endTime: new Date(),
		events: [],
		initialGameState: createTestGameState(),
		finalGameState: createTestGameState(),
		metadata: {
			gameConfig: {
				maxPlayers: 6,
				smallBlindAmount: 5,
				bigBlindAmount: 10,
				turnTimeLimit: 30,
				isTournament: false,
			},
			playerNames: {
				player1: 'Alice',
				player2: 'Bob',
			},
			handCount: 5,
			totalEvents: 100,
			totalActions: 50,
			gameDuration: 300000,
			avgHandDuration: 60000,
			createdAt: new Date(),
			version: '1.0.0',
		},
	};
}

function createTestGameState(): GameState {
	return {
		gameId: 'game1',
		handNumber: 1,
		currentPhase: 'preflop',
		dealerPosition: 0,
		smallBlindPosition: 1,
		bigBlindPosition: 2,
		currentPlayerToAct: 0,
		currentBet: 10,
		communityCards: [],
		pots: [{ amount: 20, eligiblePlayers: ['player1', 'player2'] }],
		players: [
			{
				id: 'player1',
				name: 'Alice',
				chipStack: 1000,
				betAmount: 0,
				isInHand: true,
				isActive: true,
				isSittingOut: false,
				hasActed: false,
				position: 0,
				holeCards: undefined,
			},
			{
				id: 'player2',
				name: 'Bob',
				chipStack: 1000,
				betAmount: 0,
				isInHand: true,
				isActive: true,
				isSittingOut: false,
				hasActed: false,
				position: 1,
				holeCards: undefined,
			},
		],
		lastAction: undefined,
		numPlayersInHand: 2,
		numActivePlayers: 2,
		handStartTime: Date.now(),
		currentRoundStartTime: Date.now(),
	} as any;
}
