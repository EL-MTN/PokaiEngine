import { GameController } from '@/application/engine/GameController';
import { GameConfig, GameEvent, ActionType } from '@/domain/types';

describe('Hand Start Delay', () => {
	let gameController: GameController;

	beforeEach(() => {
		gameController = new GameController();
	});

	afterEach(async () => {
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
		
		// Track timing
		let handCompleteTime: number = 0;
		let newHandStartTime: number = 0;
		
		// Create promise to wait for second hand start
		const secondHandStarted = new Promise<void>((resolve) => {
			let handCount = 0;
			
			gameController.subscribeToGame(gameId, (event: GameEvent) => {
				if (event.type === 'hand_complete') {
					handCompleteTime = Date.now();
				} else if (event.type === 'hand_started') {
					handCount++;
					if (handCount === 2) {
						newHandStartTime = Date.now();
						resolve();
					}
				}
			});
		});

		// Add players to start the game
		gameController.addPlayerToGame(gameId, 'p1', 'Player 1', 1000);
		gameController.addPlayerToGame(gameId, 'p2', 'Player 2', 1000);

		// Make one player fold immediately to end the hand
		await new Promise(resolve => setTimeout(resolve, 100));
		const state = game.getGameState();
		if (state.currentPlayerToAct) {
			gameController.processAction(gameId, { 
				type: ActionType.Fold, 
				playerId: state.currentPlayerToAct,
				timestamp: Date.now()
			});
		}

		// Wait for second hand to start
		await secondHandStarted;
		
		// Verify delay
		const delay = newHandStartTime - handCompleteTime;
		expect(delay).toBeGreaterThanOrEqual(1900);
		expect(delay).toBeLessThan(2200);
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
		
		// Track timing
		let handCompleteTime: number = 0;
		let newHandStartTime: number = 0;
		
		// Create promise to wait for second hand start
		const secondHandStarted = new Promise<void>((resolve) => {
			let handCount = 0;
			
			gameController.subscribeToGame(gameId, (event: GameEvent) => {
				if (event.type === 'hand_complete') {
					handCompleteTime = Date.now();
				} else if (event.type === 'hand_started') {
					handCount++;
					if (handCount === 2) {
						newHandStartTime = Date.now();
						resolve();
					}
				}
			});
		});

		// Add players to start the game
		gameController.addPlayerToGame(gameId, 'p1', 'Player 1', 1000);
		gameController.addPlayerToGame(gameId, 'p2', 'Player 2', 1000);

		// Make one player fold immediately to end the hand
		await new Promise(resolve => setTimeout(resolve, 100));
		const state = game.getGameState();
		if (state.currentPlayerToAct) {
			gameController.processAction(gameId, { 
				type: ActionType.Fold, 
				playerId: state.currentPlayerToAct,
				timestamp: Date.now()
			});
		}

		// Wait for second hand to start
		await secondHandStarted;
		
		// Verify delay
		const delay = newHandStartTime - handCompleteTime;
		expect(delay).toBeGreaterThanOrEqual(400);
		expect(delay).toBeLessThan(700);
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
		
		// Track timing
		let handCompleteTime: number = 0;
		let newHandStartTime: number = 0;
		
		// Create promise to wait for second hand start
		const secondHandStarted = new Promise<void>((resolve) => {
			let handCount = 0;
			
			gameController.subscribeToGame(gameId, (event: GameEvent) => {
				if (event.type === 'hand_complete') {
					handCompleteTime = Date.now();
				} else if (event.type === 'hand_started') {
					handCount++;
					if (handCount === 2) {
						newHandStartTime = Date.now();
						resolve();
					}
				}
			});
		});

		// Add players to start the game
		gameController.addPlayerToGame(gameId, 'p1', 'Player 1', 1000);
		gameController.addPlayerToGame(gameId, 'p2', 'Player 2', 1000);

		// Make one player fold immediately to end the hand
		await new Promise(resolve => setTimeout(resolve, 100));
		const state = game.getGameState();
		if (state.currentPlayerToAct) {
			gameController.processAction(gameId, { 
				type: ActionType.Fold, 
				playerId: state.currentPlayerToAct,
				timestamp: Date.now()
			});
		}

		// Wait for second hand to start
		await secondHandStarted;
		
		// Verify delay
		const delay = newHandStartTime - handCompleteTime;
		expect(delay).toBeLessThan(100);
	});
});