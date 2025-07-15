import { Pot } from '@/domain/types';

import { Player } from './Player';

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
			// Even if no side pots are needed, we should still rebuild the main pot
			// to exclude folded players from eligibility (but keep their money in the pot)
			this.rebuildMainPotWithCorrectEligibility(players, eligiblePlayers);
			return;
		}

		// Create a list of all unique bet amounts from ALL players (including folded)
		const betAmounts = new Set<number>();
		players.forEach((player) => {
			if (player.totalBetThisHand > 0) {
				betAmounts.add(player.totalBetThisHand);
			}
		});

		const sortedAmounts = Array.from(betAmounts).sort((a, b) => a - b);

		if (sortedAmounts.length <= 1) {
			// No side pots needed, but still rebuild main pot with correct eligibility
			this.rebuildMainPotWithCorrectEligibility(players, eligiblePlayers);
			return;
		}

		// Reset pots and rebuild them
		this.pots = [];

		let previousAmount = 0;

		for (let i = 0; i < sortedAmounts.length; i++) {
			const currentAmount = sortedAmounts[i];
			const betSize = currentAmount - previousAmount;

			// Find players eligible for this pot level (only non-folded players)
			const eligibleForThisPot = eligiblePlayers.filter(
				(player) => player.totalBetThisHand >= currentAmount,
			);

			// Count ALL players (including folded) who contributed to this level
			const contributingPlayers = players.filter(
				(player) => player.totalBetThisHand >= currentAmount,
			);

			if (contributingPlayers.length > 0) {
				// Calculate pot amount based on ALL contributing players (including folded)
				const potAmount = betSize * contributingPlayers.length;

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
	 * Rebuilds the main pot with correct eligibility (keeps all money, but only eligible players can win)
	 */
	private rebuildMainPotWithCorrectEligibility(
		allPlayers: Player[],
		eligiblePlayers: Player[],
	): void {
		// Keep all the money that was bet (including from folded players)
		// but only eligible players can win it
		const totalAmount = this.getTotalPotAmount();

		this.pots = [
			{
				amount: totalAmount,
				eligiblePlayers: eligiblePlayers.map((p) => p.id),
				isMainPot: true,
			},
		];
	}

	/**
	 * Distributes pots to winners
	 */
	distributePots(
		winners: { playerId: string; potIndices: number[] }[],
	): PotDistribution[] {
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
	 * Distributes pots to winners with position-based odd chip distribution
	 */
	distributePotsWithPosition(
		winners: { playerId: string; potIndices: number[]; position: number }[],
	): PotDistribution[] {
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

			// Sort winners by position (worst position first for odd chips)
			const sortedWinners = [...eligibleWinners].sort(
				(a, b) => b.position - a.position,
			);

			sortedWinners.forEach((winner, index) => {
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
	simulateDistribution(
		winners: { playerId: string; handStrength: number }[],
		remainingPlayers?: string[],
	): {
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
		const sortedGroups = Array.from(winnerGroups.entries()).sort(
			(a, b) => b[0] - a[0],
		);

		const distributions: PotDistribution[] = [];
		let totalDistributed = 0;

		// Distribute pots starting from side pots to main pot
		for (let potIndex = this.pots.length - 1; potIndex >= 0; potIndex--) {
			const pot = this.pots[potIndex];
			let potDistributed = false;

			// Find the best hand among eligible players for this pot
			for (const [, playerIds] of sortedGroups) {
				const eligibleWinners = playerIds.filter((playerId) =>
					pot.eligiblePlayers.includes(playerId),
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
				// Fallback: distribute to any remaining eligible players
				if (remainingPlayers) {
					const remainingEligible = pot.eligiblePlayers.filter((playerId) =>
						remainingPlayers.includes(playerId),
					);

					if (remainingEligible.length > 0) {
						// Distribute equally among remaining eligible players
						const winnerCount = remainingEligible.length;
						const baseAmount = Math.floor(pot.amount / winnerCount);
						const remainder = pot.amount % winnerCount;

						remainingEligible.forEach((playerId, index) => {
							const amount = baseAmount + (index < remainder ? 1 : 0);
							distributions.push({
								playerId,
								amount,
								potIndex,
							});
							totalDistributed += amount;
						});
						potDistributed = true;
					}
				}

				// Only throw if truly no one can receive the pot
				if (!potDistributed) {
					throw new Error(
						`Pot ${potIndex} with amount ${pot.amount} has no eligible recipients`,
					);
				}
			}
		}

		return { distributions, totalDistributed };
	}

	/**
	 * Simulates pot distribution with position-based odd chip distribution
	 */
	simulateDistributionWithPosition(
		winners: { playerId: string; handStrength: number; position: number }[],
	): {
		distributions: PotDistribution[];
		totalDistributed: number;
	} {
		// Group winners by hand strength
		const winnerGroups = new Map<
			number,
			{ playerId: string; position: number }[]
		>();

		winners.forEach((winner) => {
			const group = winnerGroups.get(winner.handStrength) || [];
			group.push({ playerId: winner.playerId, position: winner.position });
			winnerGroups.set(winner.handStrength, group);
		});

		// Sort groups by hand strength (highest first)
		const sortedGroups = Array.from(winnerGroups.entries()).sort(
			(a, b) => b[0] - a[0],
		);

		const distributions: PotDistribution[] = [];
		let totalDistributed = 0;

		// Distribute pots starting from side pots to main pot
		for (let potIndex = this.pots.length - 1; potIndex >= 0; potIndex--) {
			const pot = this.pots[potIndex];
			let potDistributed = false;

			// Find the best hand among eligible players for this pot
			for (const [, players] of sortedGroups) {
				const eligibleWinners = players.filter((player) =>
					pot.eligiblePlayers.includes(player.playerId),
				);

				if (eligibleWinners.length > 0) {
					// Distribute this pot to these winners
					const winnerCount = eligibleWinners.length;
					const baseAmount = Math.floor(pot.amount / winnerCount);
					const remainder = pot.amount % winnerCount;

					// Sort winners by position (worst position first for odd chips)
					const sortedWinners = [...eligibleWinners].sort(
						(a, b) => b.position - a.position,
					);

					sortedWinners.forEach((winner, index) => {
						const amount = baseAmount + (index < remainder ? 1 : 0);
						distributions.push({
							playerId: winner.playerId,
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
				throw new Error(
					`Pot ${potIndex} with amount ${pot.amount} was not distributed`,
				);
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
