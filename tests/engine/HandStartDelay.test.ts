import { GameController } from '@/engine/game/GameController';
import { ActionType, GameConfig, GameEvent } from '@/types';

describe('Hand Start Delay', () => {
	let gameController: GameController;

	beforeEach(() => {
		jest.useFakeTimers();
		gameController = new GameController();
	});

	afterEach(async () => {
		jest.useRealTimers();
		gameController.destroy();
	});

	it('should use default 2-second delay when not specified', async () => {
		const config: GameConfig = {
			maxPlayers: 2,
			smallBlindAmount: 10,
			bigBlindAmount: 20,
			turnTimeLimit: 30,
			isTournament: false,
		};

		const gameId = 'test-game-default-delay';
		const game = gameController.createGame(gameId, config);

		// Track events
		let handCompleted = false;
		let secondHandStarted = false;
		let handCount = 0;

		gameController.subscribeToGame(gameId, (event: GameEvent) => {
			if (event.type === 'hand_complete') {
				handCompleted = true;
			} else if (event.type === 'hand_started') {
				handCount++;
				if (handCount === 2) {
					secondHandStarted = true;
				}
			}
		});

		// Add players to start the game
		gameController.addPlayerToGame(gameId, 'p1', 'Player 1', 1000);
		gameController.addPlayerToGame(gameId, 'p2', 'Player 2', 1000);

		// Make one player fold immediately to end the hand
		jest.advanceTimersByTime(100);
		const state = game.getGameState();
		if (state.currentPlayerToAct) {
			gameController.processAction(gameId, {
				type: ActionType.Fold,
				playerId: state.currentPlayerToAct,
				timestamp: Date.now(),
			});
		}

		// Verify hand completed
		expect(handCompleted).toBe(true);
		expect(secondHandStarted).toBe(false);

		// Advance time less than delay
		jest.advanceTimersByTime(1500);
		expect(secondHandStarted).toBe(false);

		// Advance past delay
		jest.advanceTimersByTime(600);
		expect(secondHandStarted).toBe(true);
	});

	it('should use custom delay when specified', async () => {
		const customDelay = 500; // 500ms
		const config: GameConfig = {
			maxPlayers: 2,
			smallBlindAmount: 10,
			bigBlindAmount: 20,
			turnTimeLimit: 30,
			handStartDelay: customDelay,
			isTournament: false,
		};

		const gameId = 'test-game-custom-delay';
		const game = gameController.createGame(gameId, config);

		// Track events
		let handCompleted = false;
		let secondHandStarted = false;
		let handCount = 0;

		gameController.subscribeToGame(gameId, (event: GameEvent) => {
			if (event.type === 'hand_complete') {
				handCompleted = true;
			} else if (event.type === 'hand_started') {
				handCount++;
				if (handCount === 2) {
					secondHandStarted = true;
				}
			}
		});

		// Add players to start the game
		gameController.addPlayerToGame(gameId, 'p1', 'Player 1', 1000);
		gameController.addPlayerToGame(gameId, 'p2', 'Player 2', 1000);

		// Make one player fold immediately to end the hand
		jest.advanceTimersByTime(100);
		const state = game.getGameState();
		if (state.currentPlayerToAct) {
			gameController.processAction(gameId, {
				type: ActionType.Fold,
				playerId: state.currentPlayerToAct,
				timestamp: Date.now(),
			});
		}

		// Verify hand completed
		expect(handCompleted).toBe(true);
		expect(secondHandStarted).toBe(false);

		// Advance time less than delay
		jest.advanceTimersByTime(400);
		expect(secondHandStarted).toBe(false);

		// Advance past delay
		jest.advanceTimersByTime(200);
		expect(secondHandStarted).toBe(true);
	});

	it('should allow zero delay for instant hand starts', async () => {
		const config: GameConfig = {
			maxPlayers: 2,
			smallBlindAmount: 10,
			bigBlindAmount: 20,
			turnTimeLimit: 30,
			handStartDelay: 0,
			isTournament: false,
		};

		const gameId = 'test-game-zero-delay';
		const game = gameController.createGame(gameId, config);

		// Track events
		let handCompleted = false;
		let secondHandStarted = false;
		let handCount = 0;

		gameController.subscribeToGame(gameId, (event: GameEvent) => {
			if (event.type === 'hand_complete') {
				handCompleted = true;
			} else if (event.type === 'hand_started') {
				handCount++;
				if (handCount === 2) {
					secondHandStarted = true;
				}
			}
		});

		// Add players to start the game
		gameController.addPlayerToGame(gameId, 'p1', 'Player 1', 1000);
		gameController.addPlayerToGame(gameId, 'p2', 'Player 2', 1000);

		// Make one player fold immediately to end the hand
		jest.advanceTimersByTime(10);
		const state = game.getGameState();
		if (state.currentPlayerToAct) {
			gameController.processAction(gameId, {
				type: ActionType.Fold,
				playerId: state.currentPlayerToAct,
				timestamp: Date.now(),
			});
		}

		// With zero delay, next hand should start immediately
		expect(handCompleted).toBe(true);
		jest.advanceTimersByTime(10);
		expect(secondHandStarted).toBe(true);
	});
});
