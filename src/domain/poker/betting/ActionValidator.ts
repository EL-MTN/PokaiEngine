import {
	Action,
	ActionType,
	InvalidActionError,
	PossibleAction,
} from '@/domain/types';
import { GameState } from '../game/GameState';
import { Player } from '../game/Player';

export class ActionValidator {
	/**
	 * Validates if an action is legal in the current game state
	 */
	static validateAction(gameState: GameState, action: Action): boolean {
		const player = gameState.getPlayer(action.playerId);
		if (!player) {
			throw new InvalidActionError('Player not found');
		}

		if (gameState.currentPlayerToAct !== action.playerId) {
			throw new InvalidActionError("Not player's turn to act");
		}

		if (!player.canAct()) {
			throw new InvalidActionError('Player cannot act');
		}

		switch (action.type) {
			case ActionType.Fold:
				return this.validateFold(gameState, player);
			case ActionType.Check:
				return this.validateCheck(gameState, player);
			case ActionType.Call:
				return this.validateCall(gameState, player, action.amount);
			case ActionType.Bet:
				return this.validateBet(gameState, player, action.amount);
			case ActionType.Raise:
				return this.validateRaise(gameState, player, action.amount);
			case ActionType.AllIn:
				return this.validateAllIn(gameState, player);
			default:
				throw new InvalidActionError('Invalid action type');
		}
	}

	/**
	 * Gets all possible actions for a player
	 */
	static getPossibleActions(
		gameState: GameState,
		playerId: string,
	): PossibleAction[] {
		const player = gameState.getPlayer(playerId);
		if (!player || !player.canAct()) {
			return [];
		}

		const actions: PossibleAction[] = [];
		const currentBet = gameState.getCurrentBet();
		const callAmount = Math.max(0, currentBet - player.currentBet);

		// Fold is always possible (except when checking is free)
		if (callAmount > 0) {
			actions.push({
				type: ActionType.Fold,
				description: 'Fold your hand',
			});
		}

		// Check or Call
		if (callAmount === 0) {
			actions.push({
				type: ActionType.Check,
				description: 'Check (no bet required)',
			});
		} else if (callAmount <= player.chipStack) {
			actions.push({
				type: ActionType.Call,
				minAmount: callAmount,
				maxAmount: callAmount,
				description: `Call ${callAmount}`,
			});
		}

		// Bet or Raise
		if (currentBet === 0 && !this.hasBettingOccurred(gameState)) {
			// Betting
			const minBet = gameState.bigBlindAmount;
			const maxBet = player.chipStack;

			if (maxBet >= minBet) {
				actions.push({
					type: ActionType.Bet,
					minAmount: minBet,
					maxAmount: maxBet,
					description: `Bet ${minBet} to ${maxBet}`,
				});
			}
		} else if (currentBet > 0) {
			// Raising
			const canRaise =
				(currentBet > player.currentBet &&
					gameState.lastRaiseAmount >= gameState.minimumRaise) ||
				(currentBet === player.currentBet &&
					player.currentBet === gameState.bigBlindAmount &&
					!player.hasActed);
			if (canRaise) {
				const minRaise = currentBet + gameState.minimumRaise;
				const maxRaise = player.chipStack + player.currentBet;

				if (maxRaise > currentBet) {
					actions.push({
						type: ActionType.Raise,
						minAmount: Math.min(minRaise, maxRaise),
						maxAmount: maxRaise,
						description: `Raise to ${Math.min(minRaise, maxRaise)} - ${maxRaise}`,
					});
				}
			}
		}

		// All-in (if not already all-in and has chips)
		if (player.chipStack > 0 && !player.isAllIn) {
			actions.push({
				type: ActionType.AllIn,
				minAmount: player.chipStack,
				maxAmount: player.chipStack,
				description: `All-in for ${player.chipStack}`,
			});
		}

		return actions;
	}

	/**
	 * Calculates the amount needed to call
	 */
	static getCallAmount(gameState: GameState, playerId: string): number {
		const player = gameState.getPlayer(playerId);
		if (!player) {
			return 0;
		}

		const currentBet = gameState.getCurrentBet();
		return Math.max(0, currentBet - player.currentBet);
	}

	/**
	 * Calculates the minimum raise amount
	 */
	static getMinRaiseAmount(gameState: GameState, playerId: string): number {
		const player = gameState.getPlayer(playerId);
		if (!player) {
			return 0;
		}

		const currentBet = gameState.getCurrentBet();
		return currentBet + gameState.minimumRaise;
	}

	/**
	 * Calculates the maximum raise amount
	 */
	static getMaxRaiseAmount(gameState: GameState, playerId: string): number {
		const player = gameState.getPlayer(playerId);
		if (!player) {
			return 0;
		}

		return player.chipStack + player.currentBet;
	}

	/**
	 * Validates fold action
	 */
	private static validateFold(gameState: GameState, player: Player): boolean {
		// Fold is always valid when player can act
		return true;
	}

	/**
	 * Validates check action
	 */
	private static validateCheck(gameState: GameState, player: Player): boolean {
		const currentBet = gameState.getCurrentBet();
		const callAmount = currentBet - player.currentBet;

		if (callAmount > 0) {
			throw new InvalidActionError('Cannot check when there is a bet to call');
		}

		return true;
	}

	/**
	 * Validates call action
	 */
	private static validateCall(
		gameState: GameState,
		player: Player,
		amount?: number,
	): boolean {
		const currentBet = gameState.getCurrentBet();
		const callAmount = currentBet - player.currentBet;

		if (callAmount === 0) {
			throw new InvalidActionError('Cannot call when there is no bet');
		}

		if (amount !== undefined && amount !== callAmount) {
			throw new InvalidActionError(`Call amount must be ${callAmount}`);
		}

		if (callAmount > player.chipStack) {
			throw new InvalidActionError('Not enough chips to call');
		}

		return true;
	}

	/**
	 * Validates bet action
	 */
	private static validateBet(
		gameState: GameState,
		player: Player,
		amount?: number,
	): boolean {
		const currentBet = gameState.getCurrentBet();

		if (currentBet > 0) {
			throw new InvalidActionError('Cannot bet when there is already a bet');
		}

		if (this.hasBettingOccurred(gameState)) {
			throw new InvalidActionError(
				'Cannot bet after betting has occurred this round',
			);
		}

		if (amount === undefined) {
			throw new InvalidActionError('Bet amount is required');
		}

		const minBet = gameState.bigBlindAmount;
		if (amount < minBet) {
			throw new InvalidActionError(`Bet must be at least ${minBet}`);
		}

		if (amount > player.chipStack) {
			throw new InvalidActionError('Not enough chips to bet');
		}

		return true;
	}

	/**
	 * Validates raise action
	 */
	private static validateRaise(
		gameState: GameState,
		player: Player,
		amount?: number,
	): boolean {
		const currentBet = gameState.getCurrentBet();

		if (currentBet === 0) {
			throw new InvalidActionError('Cannot raise when there is no bet');
		}

		if (amount === undefined) {
			throw new InvalidActionError('Raise amount is required');
		}

		const minRaise = currentBet + gameState.minimumRaise;
		const maxRaise = player.chipStack + player.currentBet;

		if (amount < minRaise && amount < maxRaise) {
			throw new InvalidActionError(`Raise must be at least ${minRaise}`);
		}

		if (amount > maxRaise) {
			throw new InvalidActionError(`Cannot raise more than ${maxRaise}`);
		}

		return true;
	}

	/**
	 * Validates all-in action
	 */
	private static validateAllIn(gameState: GameState, player: Player): boolean {
		if (player.chipStack === 0) {
			throw new InvalidActionError('Player has no chips to go all-in');
		}

		if (player.isAllIn) {
			throw new InvalidActionError('Player is already all-in');
		}

		return true;
	}

	/**
	 * Checks if betting has occurred in the current round
	 */
	private static hasBettingOccurred(gameState: GameState): boolean {
		return gameState.players.some((player) => player.currentBet > 0);
	}

	/**
	 * Processes blinds posting
	 */
	static processBlindPosting(gameState: GameState): void {
		const smallBlindPlayer = gameState.players[gameState.smallBlindPosition];
		const bigBlindPlayer = gameState.players[gameState.bigBlindPosition];

		if (!smallBlindPlayer || !bigBlindPlayer) {
			throw new Error('Cannot find blind players');
		}

		// Post small blind
		const smallBlindAmount = Math.min(
			gameState.smallBlindAmount,
			smallBlindPlayer.chipStack,
		);
		gameState.processBlind(smallBlindPlayer.id, smallBlindAmount);

		// Post big blind
		const bigBlindAmount = Math.min(
			gameState.bigBlindAmount,
			bigBlindPlayer.chipStack,
		);
		gameState.processBlind(bigBlindPlayer.id, bigBlindAmount);

		// Set next player to act
		gameState.setNextPlayerToAct();
	}

	/**
	 * Processes a validated action
	 */
	static processAction(gameState: GameState, action: Action): void {
		const player = gameState.getPlayer(action.playerId);
		if (!player) {
			throw new Error('Player not found');
		}

		// Record the action
		player.recordAction(action);

		switch (action.type) {
			case ActionType.Fold:
				player.fold();
				break;

			case ActionType.Check:
				player.check();
				break;

			case ActionType.Call:
				const callAmount = this.getCallAmount(gameState, action.playerId);
				gameState.processBet(action.playerId, callAmount);
				break;

			case ActionType.Bet:
				if (action.amount === undefined) {
					throw new Error('Bet amount is required');
				}
				gameState.processBet(action.playerId, action.amount);
				// Track last aggressor
				gameState.lastAggressor = action.playerId;
				gameState.lastAggressorPerRound.set(
					gameState.currentPhase,
					action.playerId,
				);
				break;

			case ActionType.Raise:
				if (action.amount === undefined) {
					throw new Error('Raise amount is required');
				}
				const raiseAmount = action.amount - player.currentBet;
				gameState.processBet(action.playerId, raiseAmount);
				// Track last aggressor
				gameState.lastAggressor = action.playerId;
				gameState.lastAggressorPerRound.set(
					gameState.currentPhase,
					action.playerId,
				);
				break;

			case ActionType.AllIn:
				const currentBetBeforeAllIn = gameState.getCurrentBet();
				gameState.processBet(action.playerId, player.chipStack);
				// Track last aggressor (all-in is considered aggressive if it's a raise)
				if (player.totalBetThisHand > currentBetBeforeAllIn) {
					gameState.lastAggressor = action.playerId;
					gameState.lastAggressorPerRound.set(
						gameState.currentPhase,
						action.playerId,
					);
				}
				break;

			default:
				throw new Error('Invalid action type');
		}

		// Move to next player
		gameState.setNextPlayerToAct();
	}

	/**
	 * Checks if a player should be forced to act (e.g., timeout)
	 */
	static getForceAction(gameState: GameState, playerId: string): Action {
		const player = gameState.getPlayer(playerId);
		if (!player) {
			throw new Error('Player not found');
		}

		const callAmount = this.getCallAmount(gameState, playerId);

		// If player can check, check. Otherwise, fold.
		if (callAmount === 0) {
			return {
				type: ActionType.Check,
				playerId: playerId,
				timestamp: Date.now(),
			};
		} else {
			return {
				type: ActionType.Fold,
				playerId: playerId,
				timestamp: Date.now(),
			};
		}
	}
}
