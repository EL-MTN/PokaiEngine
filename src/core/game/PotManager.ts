import { Player } from './Player';
import { Pot } from '../../types';

export interface PotContribution {
	playerId: string;
	amount: number;
}

export interface PotDistribution {
	playerId: string;
	amount: number;
	potIndex: number;
}

export class PotManager {
	private pots: Pot[] = [];
	private contributions: Map<string, number> = new Map();

	constructor() {
		this.reset();
	}

	/**
	 * Resets the pot manager for a new hand
	 */
	reset(): void {
		this.pots = [];
		this.contributions.clear();
		this.createMainPot();
	}

	/**
	 * Creates the main pot
	 */
	private createMainPot(): void {
		this.pots.push({
			amount: 0,
			eligiblePlayers: [],
			isMainPot: true,
		});
	}

	/**
	 * Adds a player's bet to the appropriate pot(s)
	 */
	addBet(playerId: string, amount: number): void {
		const previousContribution = this.contributions.get(playerId) || 0;
		this.contributions.set(playerId, previousContribution + amount);

		// Add to main pot initially
		this.pots[0].amount += amount;

		// Update eligible players for main pot
		if (!this.pots[0].eligiblePlayers.includes(playerId)) {
			this.pots[0].eligiblePlayers.push(playerId);
		}
	}

	/**
	 * Creates side pots based on all-in situations
	 */
	createSidePots(players: Player[]): void {
		// Get all players who are eligible for pots (not folded)
		const eligiblePlayers = players.filter((p) => p.isEligibleForPot());

		if (eligiblePlayers.length <= 1) {
			return;
		}

		// Create a list of all unique bet amounts
		const betAmounts = new Set<number>();
		eligiblePlayers.forEach((player) => {
			if (player.totalBetThisHand > 0) {
				betAmounts.add(player.totalBetThisHand);
			}
		});

		const sortedAmounts = Array.from(betAmounts).sort((a, b) => a - b);

		if (sortedAmounts.length <= 1) {
			// No side pots needed
			return;
		}

		// Reset pots and rebuild them
		this.pots = [];

		let previousAmount = 0;

		for (let i = 0; i < sortedAmounts.length; i++) {
			const currentAmount = sortedAmounts[i];
			const betSize = currentAmount - previousAmount;

			// Find players eligible for this pot level
			const eligibleForThisPot = eligiblePlayers.filter(
				(player) => player.totalBetThisHand >= currentAmount
			);

			if (eligibleForThisPot.length > 0) {
				const potAmount = betSize * eligibleForThisPot.length;

				this.pots.push({
					amount: potAmount,
					eligiblePlayers: eligibleForThisPot.map((p) => p.id),
					isMainPot: i === 0,
				});
			}

			previousAmount = currentAmount;
		}
	}

	/**
	 * Distributes pots to winners
	 */
	distributePots(winners: { playerId: string; potIndices: number[] }[]): PotDistribution[] {
		const distributions: PotDistribution[] = [];

		for (let i = 0; i < this.pots.length; i++) {
			const pot = this.pots[i];
			const eligibleWinners = winners.filter((w) => w.potIndices.includes(i));

			if (eligibleWinners.length === 0) {
				continue;
			}

			// Split the pot among eligible winners
			const winnerCount = eligibleWinners.length;
			const baseAmount = Math.floor(pot.amount / winnerCount);
			const remainder = pot.amount % winnerCount;

			eligibleWinners.forEach((winner, index) => {
				const amount = baseAmount + (index < remainder ? 1 : 0);
				distributions.push({
					playerId: winner.playerId,
					amount: amount,
					potIndex: i,
				});
			});
		}

		return distributions;
	}

	/**
	 * Gets the total pot amount
	 */
	getTotalPotAmount(): number {
		return this.pots.reduce((total, pot) => total + pot.amount, 0);
	}

	/**
	 * Gets all pots
	 */
	getPots(): Pot[] {
		return [...this.pots];
	}

	/**
	 * Gets the main pot
	 */
	getMainPot(): Pot {
		return this.pots[0];
	}

	/**
	 * Gets all side pots
	 */
	getSidePots(): Pot[] {
		return this.pots.slice(1);
	}

	/**
	 * Gets the number of pots
	 */
	getPotCount(): number {
		return this.pots.length;
	}

	/**
	 * Checks if a player is eligible for a specific pot
	 */
	isPlayerEligibleForPot(playerId: string, potIndex: number): boolean {
		if (potIndex >= this.pots.length) {
			return false;
		}

		return this.pots[potIndex].eligiblePlayers.includes(playerId);
	}

	/**
	 * Gets all pot indices that a player is eligible for
	 */
	getEligiblePotIndices(playerId: string): number[] {
		const indices: number[] = [];

		for (let i = 0; i < this.pots.length; i++) {
			if (this.pots[i].eligiblePlayers.includes(playerId)) {
				indices.push(i);
			}
		}

		return indices;
	}

	/**
	 * Simulates pot distribution for display purposes
	 */
	simulateDistribution(winners: { playerId: string; handStrength: number }[]): {
		distributions: PotDistribution[];
		totalDistributed: number;
	} {
		// Group winners by hand strength
		const winnerGroups = new Map<number, string[]>();

		winners.forEach((winner) => {
			const group = winnerGroups.get(winner.handStrength) || [];
			group.push(winner.playerId);
			winnerGroups.set(winner.handStrength, group);
		});

		// Sort groups by hand strength (highest first)
		const sortedGroups = Array.from(winnerGroups.entries()).sort((a, b) => b[0] - a[0]);

		const distributions: PotDistribution[] = [];
		let totalDistributed = 0;

		// Distribute pots starting from side pots to main pot
		for (let potIndex = this.pots.length - 1; potIndex >= 0; potIndex--) {
			const pot = this.pots[potIndex];
			let potDistributed = false;

			// Find the best hand among eligible players for this pot
			for (const [handStrength, playerIds] of sortedGroups) {
				const eligibleWinners = playerIds.filter((playerId) =>
					pot.eligiblePlayers.includes(playerId)
				);

				if (eligibleWinners.length > 0) {
					// Distribute this pot to these winners
					const winnerCount = eligibleWinners.length;
					const baseAmount = Math.floor(pot.amount / winnerCount);
					const remainder = pot.amount % winnerCount;

					eligibleWinners.forEach((playerId, index) => {
						const amount = baseAmount + (index < remainder ? 1 : 0);
						distributions.push({
							playerId,
							amount,
							potIndex,
						});
						totalDistributed += amount;
					});

					potDistributed = true;
					break;
				}
			}

			if (!potDistributed && pot.amount > 0) {
				// This shouldn't happen in normal play, but handle it gracefully
				throw new Error(`Pot ${potIndex} with amount ${pot.amount} was not distributed`);
			}
		}

		return { distributions, totalDistributed };
	}

	/**
	 * Gets detailed pot information for debugging
	 */
	getDetailedPotInfo(): {
		totalAmount: number;
		potCount: number;
		pots: Array<{
			index: number;
			amount: number;
			eligiblePlayers: string[];
			isMainPot: boolean;
		}>;
	} {
		return {
			totalAmount: this.getTotalPotAmount(),
			potCount: this.getPotCount(),
			pots: this.pots.map((pot, index) => ({
				index,
				amount: pot.amount,
				eligiblePlayers: [...pot.eligiblePlayers],
				isMainPot: pot.isMainPot,
			})),
		};
	}
}
