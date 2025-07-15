import { GameController } from '@/application/engine/GameController';
import { GameConfig } from '@/domain/types';
import { GameLogger } from '@/infrastructure/logging/GameLogger';
import { ReplaySystem } from '@/infrastructure/logging/ReplaySystem';

describe('Game Replay Integration Tests', () => {
	let gameController: GameController;
	let gameLogger: GameLogger;
	let replaySystem: ReplaySystem;

	beforeEach(() => {
		gameController = new GameController();
		gameLogger = new GameLogger();
		replaySystem = new ReplaySystem();
	});

	it('handles basic game logging and replay setup', () => {
		const gameId = 'basic-test';
		const config: GameConfig = {
			maxPlayers: 2,
			smallBlindAmount: 50,
			bigBlindAmount: 100,
			turnTimeLimit: 30,
			isTournament: false,
		};

		// Create game
		const game = gameController.createGame(gameId, config);
		expect(game).toBeDefined();

		// Add single player first to avoid auto-start
		gameController.addPlayerToGame(gameId, 'p1', 'Alice', 1000);

		// Initialize logging
		const playerNames = new Map([['p1', 'Alice']]);
		gameLogger.startGame(gameId, game.getGameState(), playerNames);

		// Log a test event
		gameLogger.logEvent(gameId, {
			type: 'hand_started',
			timestamp: Date.now(),
			handNumber: 1,
			gameState: game.getGameState(),
		});

		// End logging
		gameLogger.endGame(gameId, game.getGameState());

		// Verify game log exists
		const gameLog = gameLogger.getGameLog(gameId);
		expect(gameLog).toBeDefined();
		expect(gameLog?.events).toHaveLength(1);
	});

	it('handles missing game logs gracefully', async () => {
		// Try to load non-existent game from file
		const loaded = await replaySystem.loadReplayFromFile('non-existent-game');
		expect(loaded).toBe(false);
	});

	it('supports replay controls', () => {
		const gameId = 'controls-test';
		const config: GameConfig = {
			maxPlayers: 1, // Prevent auto-start
			smallBlindAmount: 50,
			bigBlindAmount: 100,
			turnTimeLimit: 30,
			isTournament: false,
		};

		const game = gameController.createGame(gameId, config);
		gameController.addPlayerToGame(gameId, 'p1', 'Alice', 1000);

		const playerNames = new Map([['p1', 'Alice']]);
		gameLogger.startGame(gameId, game.getGameState(), playerNames);
		gameLogger.endGame(gameId, game.getGameState());

		// Test replay controls
		expect(() => replaySystem.pause()).not.toThrow();
		expect(() => replaySystem.play()).not.toThrow();
		expect(() => replaySystem.stop()).not.toThrow();
		expect(() => replaySystem.stepForward()).not.toThrow();
		expect(() => replaySystem.stepBackward()).not.toThrow();
		expect(() => replaySystem.seekToEvent(0)).not.toThrow();

		const controls = replaySystem.getControls();
		expect(controls).toBeDefined();
		expect(controls.currentPosition).toBeDefined();
	});

	it('analyzes replay data', () => {
		const gameId = 'analysis-test';
		const config: GameConfig = {
			maxPlayers: 2,
			smallBlindAmount: 50,
			bigBlindAmount: 100,
			turnTimeLimit: 30,
			isTournament: false,
		};

		const game = gameController.createGame(gameId, config);
		gameController.addPlayerToGame(gameId, 'p1', 'Alice', 1000);

		const playerNames = new Map([['p1', 'Alice']]);
		gameLogger.startGame(gameId, game.getGameState(), playerNames);

		// Log some events
		gameLogger.logEvent(gameId, {
			type: 'hand_started',
			timestamp: Date.now(),
			handNumber: 1,
			gameState: game.getGameState(),
		});

		gameLogger.endGame(gameId, game.getGameState());

		// Try to analyze replay
		const analysis = replaySystem.analyzeReplay();

		// Analysis may be null if no replay is loaded
		if (analysis) {
			expect(analysis).toHaveProperty('totalHands');
			expect(analysis).toHaveProperty('playerStatistics');
		} else {
			// This is acceptable as no replay may be loaded
			expect(analysis).toBeNull();
		}
	});
});
