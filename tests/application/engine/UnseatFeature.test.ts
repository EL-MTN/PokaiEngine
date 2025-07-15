import { GameController } from '@/application/engine/GameController';
import { ActionType } from '@/domain/types';

describe('Unseat Feature', () => {
	describe('Deferred unseat after current hand', () => {
		it('should keep player through hand and remove before next hand', () => {
			jest.useFakeTimers();
			const gc = new GameController();
			const game = gc.createCashGame('g2', 5, 10);

			gc.addPlayerToGame('g2', 'p1', 'Alice', 1000);
			gc.addPlayerToGame('g2', 'p2', 'Bob', 1000);

			// Hand is already running. Request to unseat p1.
			gc.requestUnseat('g2', 'p1');

			// Fold whichever player is currently to act to finish the hand quickly
			const currentAct = game.getGameState().currentPlayerToAct!;
			gc.processAction('g2', {
				type: ActionType.Fold,
				playerId: currentAct,
				timestamp: Date.now(),
			});

			// Fast-forward >2s so GameController auto-start timer fires
			jest.advanceTimersByTime(2500);

			// p1 should now be removed before the next hand
			expect(
				game.getGameState().players.find((p) => p.id === 'p1'),
			).toBeUndefined();
			jest.useRealTimers();
		});
	});
});
