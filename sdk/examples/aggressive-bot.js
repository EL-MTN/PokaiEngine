#!/usr/bin/env node

/**
 * Aggressive Bot Example - PokaiEngine SDK
 * 
 * Demonstrates an aggressive playing style using SDK utilities
 */

import { 
	PokaiBot, 
	ActionType, 
	formatCards, 
	createAggressiveDecision,
	findAction,
	calculateBetSize,
	addRandomDelay
} from '../dist/index.js';

class AggressiveBot {
	constructor(credentials) {
		this.bot = new PokaiBot({
			credentials,
			debug: true
		});
		
		this.handsPlayed = 0;
		this.aggressionLevel = 0.8; // High aggression
	}

	async start() {
		console.log('🔥 Starting Aggressive Bot');
		console.log('==========================');

		this.setupEventHandlers();

		try {
			await this.bot.connect();
			await this.findAndJoinGame();
			console.log('🚀 Aggressive bot is now hunting for action...');
		} catch (error) {
			console.error('❌ Failed to start:', error.message);
		}
	}

	setupEventHandlers() {
		this.bot.setEventHandlers({
			onGameJoined: (data) => {
				console.log(`💪 Joined game ${data.gameId} - Time to dominate!`);
			},

			onTurnStart: async (data) => {
				await this.makeAggressiveDecision(data.timeLimit);
			},

			onGameEvent: (event) => {
				if (event.type === 'hand_started') {
					this.handsPlayed++;
					console.log(`🆕 Hand #${this.handsPlayed} - Let's get aggressive!`);
				}
				
				if (event.type === 'hand_complete') {
					if (event.winners?.find(w => w.playerId === this.bot.getCurrentPlayerId())) {
						console.log('🏆 VICTORY! Aggression pays off!');
					} else {
						console.log('😤 Lost that one, but staying aggressive!');
					}
				}
			},

			onActionSuccess: (action) => {
				const actionStr = `${action.type.toUpperCase()}${action.amount ? ` $${action.amount}` : ''}`;
				console.log(`⚡ Aggressive action: ${actionStr}`);
			},

			onError: (error) => {
				console.error('❌ Error:', error);
			}
		});
	}

	async makeAggressiveDecision(timeLimit) {
		try {
			// Add some thinking time to appear more human
			await addRandomDelay(300, 1000);

			const gameState = await this.bot.getGameState();
			const actions = await this.bot.getPossibleActions();

			console.log(`🎯 My turn! Hand: ${formatCards(gameState.playerCards)}`);
			console.log(`💰 Pot: $${gameState.potSize} | Players: ${gameState.players.length}`);

			// Analyze hand strength (simplified)
			const handStrength = this.analyzeHandStrength(gameState.playerCards, gameState.communityCards);
			
			// Make aggressive decision
			const decision = this.calculateAggressiveAction(actions, gameState, handStrength);
			
			console.log(`🧠 Decision: ${decision.action.toUpperCase()}${decision.amount ? ` $${decision.amount}` : ''}`);
			console.log(`📈 Reasoning: ${decision.reasoning}`);

			await this.bot.submitAction(decision.action, decision.amount);

		} catch (error) {
			console.error('❌ Error making decision:', error.message);
			
			// Fallback to safe action
			try {
				const actions = await this.bot.getPossibleActions();
				if (findAction(actions, ActionType.Check)) {
					await this.bot.submitAction(ActionType.Check);
				} else if (findAction(actions, ActionType.Fold)) {
					await this.bot.submitAction(ActionType.Fold);
				}
			} catch (fallbackError) {
				console.error('❌ Fallback action failed:', fallbackError.message);
			}
		}
	}

	calculateAggressiveAction(actions, gameState, handStrength) {
		const potSize = gameState.potSize;
		const myPosition = this.getMyPosition(gameState);
		
		// Base aggressive decision
		let decision = createAggressiveDecision(actions, this.aggressionLevel);

		// Enhance based on hand strength
		if (handStrength >= 0.7) {
			// Strong hand - maximize value
			const raiseAction = findAction(actions, ActionType.Raise);
			if (raiseAction) {
				const betSize = Math.min(
					calculateBetSize(potSize, 75), // 75% pot bet
					raiseAction.maxAmount || raiseAction.minAmount
				);
				decision = {
					action: ActionType.Raise,
					amount: Math.max(betSize, raiseAction.minAmount || 0),
					confidence: handStrength,
					reasoning: `Strong hand (${(handStrength * 100).toFixed(0)}%), betting for value`
				};
			}
		} else if (handStrength >= 0.4) {
			// Medium hand - semi-bluff or pressure
			const betAction = findAction(actions, ActionType.Bet);
			const raiseAction = findAction(actions, ActionType.Raise);
			
			if (betAction && Math.random() < this.aggressionLevel) {
				const betSize = Math.min(
					calculateBetSize(potSize, 50), // 50% pot bet
					betAction.maxAmount || betAction.minAmount
				);
				decision = {
					action: ActionType.Bet,
					amount: Math.max(betSize, betAction.minAmount || 0),
					confidence: handStrength + 0.2, // Boost confidence for aggression
					reasoning: 'Semi-bluff/pressure bet with decent hand'
				};
			} else if (raiseAction && Math.random() < this.aggressionLevel * 0.7) {
				decision = {
					action: ActionType.Raise,
					amount: raiseAction.minAmount,
					confidence: handStrength + 0.1,
					reasoning: 'Aggressive raise to build pot'
				};
			}
		} else {
			// Weak hand - consider bluffing or folding
			if (Math.random() < this.aggressionLevel * 0.3) {
				const betAction = findAction(actions, ActionType.Bet);
				if (betAction) {
					const bluffSize = Math.min(
						calculateBetSize(potSize, 40), // Smaller bluff size
						betAction.maxAmount || betAction.minAmount
					);
					decision = {
						action: ActionType.Bet,
						amount: Math.max(bluffSize, betAction.minAmount || 0),
						confidence: 0.3,
						reasoning: 'Pure bluff - represent strength'
					};
				}
			}
		}

		return decision;
	}

	analyzeHandStrength(holeCards, communityCards) {
		// Simplified hand strength analysis
		if (!holeCards || holeCards.length !== 2) return 0.3;

		let strength = 0.3; // Base strength

		// Pair in hole cards
		if (holeCards[0].rank === holeCards[1].rank) {
			strength += 0.3;
			if (holeCards[0].rank >= 10) strength += 0.2; // High pair
		}

		// High cards
		const highCard = Math.max(holeCards[0].rank, holeCards[1].rank);
		if (highCard >= 12) strength += 0.2; // Face cards
		if (highCard === 14) strength += 0.1; // Ace

		// Suited
		if (holeCards[0].suit === holeCards[1].suit) {
			strength += 0.1;
		}

		// Connected
		const rankDiff = Math.abs(holeCards[0].rank - holeCards[1].rank);
		if (rankDiff <= 1) strength += 0.1; // Connected
		if (rankDiff <= 4) strength += 0.05; // Gapper

		return Math.min(strength, 1.0);
	}

	getMyPosition(gameState) {
		const myPlayerId = this.bot.getCurrentPlayerId();
		const myPlayer = gameState.players.find(p => p.id === myPlayerId);
		return myPlayer ? myPlayer.position : 0;
	}

	async findAndJoinGame() {
		const games = await this.bot.getGames();
		
		if (games.length === 0) {
			throw new Error('No games available');
		}

		// Prefer games with more players for more action
		const bestGame = games.sort((a, b) => b.currentPlayers - a.currentPlayers)[0];
		
		await this.bot.joinGame({
			gameId: bestGame.gameId,
			chipStack: 1000
		});
	}

	stop() {
		this.bot.disconnect();
	}
}

// Example usage
async function runAggressiveBot() {
	const credentials = {
		botId: 'aggressive-bot-id',
		apiKey: 'your-api-key'
	};

	const bot = new AggressiveBot(credentials);
	
	// Handle shutdown
	process.on('SIGINT', () => {
		console.log('\n🛑 Shutting down aggressive bot...');
		bot.stop();
		process.exit(0);
	});

	await bot.start();
}

runAggressiveBot().catch(console.error);