#!/usr/bin/env node

/**
 * Advanced Strategy Bot - PokaiEngine SDK
 * 
 * Demonstrates sophisticated poker strategy using SDK utilities
 */

import { 
	PokaiBot, 
	ActionType, 
	formatCards,
	calculatePotOdds,
	isProfitableCall,
	getPositionType,
	findAction,
	calculateBetSize,
	getPlayersInHand,
	addRandomDelay
} from '../dist/index.js';

class AdvancedStrategyBot {
	constructor(credentials) {
		this.bot = new PokaiBot({
			credentials,
			debug: true,
			actionTimeout: 20000 // Give ourselves more thinking time
		});
		
		this.gameStats = {
			handsPlayed: 0,
			vpip: 0, // Voluntarily put money in pot
			pfr: 0,  // Pre-flop raise
			aggression: 0,
			showdownWins: 0
		};
		
		this.handHistory = [];
		this.opponentStats = new Map();
	}

	async start() {
		console.log('🧠 Starting Advanced Strategy Bot');
		console.log('=================================');

		this.setupEventHandlers();

		try {
			await this.bot.connect();
			await this.findOptimalGame();
			console.log('🚀 Advanced bot is analyzing the table...');
		} catch (error) {
			console.error('❌ Failed to start:', error.message);
		}
	}

	setupEventHandlers() {
		this.bot.setEventHandlers({
			onGameJoined: (data) => {
				console.log(`🎯 Joined game ${data.gameId} - Analyzing opponents...`);
				this.initializeOpponentTracking();
			},

			onTurnStart: async (data) => {
				await this.makeStrategicDecision(data.timeLimit);
			},

			onGameEvent: (event) => {
				this.trackGameEvent(event);
			},

			onActionSuccess: (action) => {
				this.updatePersonalStats(action);
				console.log(`✅ Strategic action: ${action.type.toUpperCase()}${action.amount ? ` $${action.amount}` : ''}`);
			},

			onError: (error) => {
				console.error('❌ Strategic error:', error);
			}
		});
	}

	async makeStrategicDecision(timeLimit) {
		try {
			// Realistic thinking time
			await addRandomDelay(800, 2500);

			const gameState = await this.bot.getGameState();
			const actions = await this.bot.getPossibleActions();

			console.log(`\n🎯 Strategic Analysis - Hand #${this.gameStats.handsPlayed + 1}`);
			console.log(`🃏 Hand: ${formatCards(gameState.playerCards)}`);
			console.log(`💰 Pot: $${gameState.potSize} | Phase: ${gameState.currentPhase}`);

			// Comprehensive analysis
			const analysis = await this.analyzeGameState(gameState, actions);
			const decision = this.calculateOptimalAction(analysis, actions);

			console.log(`📊 Hand Strength: ${(analysis.handStrength * 100).toFixed(1)}%`);
			console.log(`📍 Position: ${analysis.positionType} (${analysis.positionName})`);
			console.log(`🎲 Decision: ${decision.action.toUpperCase()}${decision.amount ? ` $${decision.amount}` : ''}`);
			console.log(`💭 Strategy: ${decision.reasoning}`);

			await this.bot.submitAction(decision.action, decision.amount);

		} catch (error) {
			console.error('❌ Decision error:', error.message);
			await this.fallbackAction();
		}
	}

	async analyzeGameState(gameState, actions) {
		const myPlayerId = this.bot.getCurrentPlayerId();
		const myPlayer = gameState.players.find(p => p.id === myPlayerId);
		const playersInHand = getPlayersInHand(gameState.players);
		
		return {
			// Hand analysis
			handStrength: this.evaluateHandStrength(gameState.playerCards, gameState.communityCards),
			handCategory: this.categorizeHand(gameState.playerCards),
			
			// Position analysis
			position: myPlayer.position,
			positionType: getPositionType(myPlayer.position, gameState.players.length),
			positionName: this.getPositionName(myPlayer.position, gameState.players.length),
			
			// Table dynamics
			playersInHand: playersInHand.length,
			activePlayers: gameState.players.filter(p => p.isActive).length,
			totalPot: this.calculateTotalPot(gameState),
			
			// Betting analysis
			callAmount: this.getCallAmount(actions),
			potOdds: this.calculatePotOdds(gameState, actions),
			stackRatio: myPlayer.chipStack / gameState.potSize,
			
			// Opponent analysis
			aggressiveOpponents: this.countAggressiveOpponents(),
			tightOpponents: this.countTightOpponents(),
			
			// Game state
			phase: gameState.currentPhase,
			handNumber: gameState.handNumber,
			isHeadsUp: playersInHand.length === 2
		};
	}

	calculateOptimalAction(analysis, actions) {
		const { handStrength, positionType, potOdds, callAmount, phase } = analysis;

		// Pre-flop strategy
		if (phase === 'preflop') {
			return this.calculatePreFlopAction(analysis, actions);
		}

		// Post-flop strategy
		return this.calculatePostFlopAction(analysis, actions);
	}

	calculatePreFlopAction(analysis, actions) {
		const { handStrength, positionType, handCategory } = analysis;
		
		// Premium hands (AA, KK, QQ, AK)
		if (handCategory === 'premium') {
			const raiseAction = findAction(actions, ActionType.Raise);
			if (raiseAction) {
				const raiseSize = this.calculateRaiseSize(analysis, 'value');
				return {
					action: ActionType.Raise,
					amount: raiseSize,
					confidence: 0.9,
					reasoning: 'Premium hand - raising for value'
				};
			}
		}

		// Strong hands (JJ, 10-10, AQ, AJ)
		if (handCategory === 'strong') {
			if (positionType === 'late') {
				const raiseAction = findAction(actions, ActionType.Raise);
				if (raiseAction) {
					return {
						action: ActionType.Raise,
						amount: raiseAction.minAmount,
						confidence: 0.8,
						reasoning: 'Strong hand in late position'
					};
				}
			}
			
			const callAction = findAction(actions, ActionType.Call);
			if (callAction) {
				return {
					action: ActionType.Call,
					confidence: 0.7,
					reasoning: 'Strong hand - calling to see flop'
				};
			}
		}

		// Speculative hands (suited connectors, small pairs)
		if (handCategory === 'speculative' && positionType === 'late') {
			const callAction = findAction(actions, ActionType.Call);
			if (callAction && analysis.callAmount < analysis.stackRatio * 0.05) {
				return {
					action: ActionType.Call,
					confidence: 0.5,
					reasoning: 'Speculative hand with good pot odds'
				};
			}
		}

		// Default to folding weak hands
		return {
			action: ActionType.Fold,
			confidence: 0.8,
			reasoning: 'Weak hand - folding pre-flop'
		};
	}

	calculatePostFlopAction(analysis, actions) {
		const { handStrength, potOdds, callAmount, positionType } = analysis;

		// Strong hands (top pair or better)
		if (handStrength >= 0.7) {
			const betAction = findAction(actions, ActionType.Bet);
			const raiseAction = findAction(actions, ActionType.Raise);
			
			if (betAction) {
				const betSize = this.calculateBetSize(analysis, 'value');
				return {
					action: ActionType.Bet,
					amount: betSize,
					confidence: handStrength,
					reasoning: 'Strong hand - betting for value'
				};
			}
			
			if (raiseAction) {
				const raiseSize = this.calculateRaiseSize(analysis, 'value');
				return {
					action: ActionType.Raise,
					amount: raiseSize,
					confidence: handStrength,
					reasoning: 'Strong hand - raising for value'
				};
			}
		}

		// Drawing hands
		if (this.hasDrawingPotential(analysis)) {
			if (potOdds && isProfitableCall(potOdds, handStrength + 0.2)) {
				return {
					action: ActionType.Call,
					confidence: 0.6,
					reasoning: 'Drawing hand with good pot odds'
				};
			}
		}

		// Bluffing opportunities
		if (this.shouldBluff(analysis)) {
			const betAction = findAction(actions, ActionType.Bet);
			if (betAction) {
				const bluffSize = this.calculateBetSize(analysis, 'bluff');
				return {
					action: ActionType.Bet,
					amount: bluffSize,
					confidence: 0.4,
					reasoning: 'Bluff attempt - representing strength'
				};
			}
		}

		// Pot odds decision
		if (potOdds && isProfitableCall(potOdds, handStrength)) {
			return {
				action: ActionType.Call,
				confidence: handStrength,
				reasoning: `Profitable call (${potOdds.odds.toFixed(1)}:1 odds)`
			};
		}

		// Check or fold
		const checkAction = findAction(actions, ActionType.Check);
		if (checkAction) {
			return {
				action: ActionType.Check,
				confidence: 0.5,
				reasoning: 'Weak hand - checking for free card'
			};
		}

		return {
			action: ActionType.Fold,
			confidence: 1 - handStrength,
			reasoning: 'Weak hand - folding'
		};
	}

	// === Helper Methods ===

	evaluateHandStrength(holeCards, communityCards) {
		// Simplified hand evaluation - in real implementation, 
		// this would use a proper hand evaluator
		if (!holeCards || holeCards.length !== 2) return 0.2;

		let strength = 0.2;
		const [card1, card2] = holeCards;

		// Pocket pairs
		if (card1.rank === card2.rank) {
			strength = 0.4 + (card1.rank / 14) * 0.4;
		}

		// High cards
		const highCard = Math.max(card1.rank, card2.rank);
		if (highCard >= 12) strength += 0.2;
		if (highCard === 14) strength += 0.1;

		// Suited bonus
		if (card1.suit === card2.suit) strength += 0.1;

		// Connected bonus
		const gap = Math.abs(card1.rank - card2.rank);
		if (gap <= 1) strength += 0.1;
		if (gap <= 4) strength += 0.05;

		return Math.min(strength, 1.0);
	}

	categorizeHand(holeCards) {
		if (!holeCards || holeCards.length !== 2) return 'weak';

		const [card1, card2] = holeCards;
		const highRank = Math.max(card1.rank, card2.rank);
		const lowRank = Math.min(card1.rank, card2.rank);
		const isPair = card1.rank === card2.rank;
		const isSuited = card1.suit === card2.suit;

		// Premium hands
		if (isPair && highRank >= 12) return 'premium'; // QQ+
		if (highRank === 14 && lowRank >= 13) return 'premium'; // AK, AQ suited

		// Strong hands  
		if (isPair && highRank >= 10) return 'strong'; // JJ, TT
		if (highRank === 14 && lowRank >= 11) return 'strong'; // AJ, AQ

		// Speculative hands
		if (isSuited && Math.abs(card1.rank - card2.rank) <= 2) return 'speculative';
		if (isPair) return 'speculative';

		return 'weak';
	}

	calculateRaiseSize(analysis, type) {
		const { totalPot, activePlayers } = analysis;
		
		if (type === 'value') {
			// Value betting - size based on hand strength and opponents
			return calculateBetSize(totalPot, 60 + (activePlayers * 5));
		} else if (type === 'bluff') {
			// Bluffing - smaller size to minimize risk
			return calculateBetSize(totalPot, 40 + (activePlayers * 2));
		}
		
		return calculateBetSize(totalPot, 50);
	}

	calculateBetSize(analysis, type) {
		return this.calculateRaiseSize(analysis, type);
	}

	shouldBluff(analysis) {
		const { positionType, activePlayers, handStrength, phase } = analysis;
		
		// Bluff more in late position with fewer opponents
		const positionFactor = positionType === 'late' ? 0.3 : 0.1;
		const opponentFactor = Math.max(0, 0.4 - (activePlayers * 0.1));
		const boardFactor = phase === 'turn' || phase === 'river' ? 0.2 : 0.1;
		
		const bluffProbability = positionFactor + opponentFactor + boardFactor;
		
		return handStrength < 0.3 && Math.random() < bluffProbability;
	}

	hasDrawingPotential(analysis) {
		// Simplified - would need actual hand evaluation
		return analysis.phase === 'flop' || analysis.phase === 'turn';
	}

	// === Tracking Methods ===

	trackGameEvent(event) {
		if (event.type === 'hand_started') {
			this.gameStats.handsPlayed++;
		}
		
		if (event.type === 'action_taken') {
			this.trackOpponentAction(event.action);
		}
	}

	trackOpponentAction(action) {
		if (action.playerId === this.bot.getCurrentPlayerId()) return;
		
		if (!this.opponentStats.has(action.playerId)) {
			this.opponentStats.set(action.playerId, {
				actions: 0,
				aggressiveActions: 0,
				vpip: 0
			});
		}
		
		const stats = this.opponentStats.get(action.playerId);
		stats.actions++;
		
		if (action.type === 'bet' || action.type === 'raise') {
			stats.aggressiveActions++;
		}
	}

	updatePersonalStats(action) {
		if (action.type !== 'fold' && action.type !== 'check') {
			this.gameStats.vpip++;
		}
		
		if (action.type === 'bet' || action.type === 'raise') {
			this.gameStats.pfr++;
			this.gameStats.aggression++;
		}
	}

	// === Utility Methods ===

	getCallAmount(actions) {
		const callAction = findAction(actions, ActionType.Call);
		return callAction?.minAmount || 0;
	}

	calculatePotOdds(gameState, actions) {
		const callAmount = this.getCallAmount(actions);
		if (callAmount === 0) return null;
		
		return calculatePotOdds(gameState.potSize, callAmount);
	}

	calculateTotalPot(gameState) {
		return gameState.potSize + gameState.players.reduce((sum, p) => sum + p.currentBet, 0);
	}

	countAggressiveOpponents() {
		let count = 0;
		for (const [playerId, stats] of this.opponentStats) {
			if (stats.actions > 5 && (stats.aggressiveActions / stats.actions) > 0.3) {
				count++;
			}
		}
		return count;
	}

	countTightOpponents() {
		let count = 0;
		for (const [playerId, stats] of this.opponentStats) {
			if (stats.actions > 5 && (stats.vpip / this.gameStats.handsPlayed) < 0.2) {
				count++;
			}
		}
		return count;
	}

	getPositionName(position, totalPlayers) {
		// Simplified position naming
		if (totalPlayers <= 2) return position === 0 ? 'Button' : 'BB';
		const positions = ['Button', 'SB', 'BB', 'UTG', 'MP', 'CO'];
		return positions[position] || `Pos${position}`;
	}

	async findOptimalGame() {
		const games = await this.bot.getGames();
		
		if (games.length === 0) {
			throw new Error('No games available');
		}

		// Prefer games with 4-6 players for optimal strategy
		const optimalGame = games.find(g => g.currentPlayers >= 4 && g.currentPlayers <= 6) || games[0];
		
		await this.bot.joinGame({
			gameId: optimalGame.gameId,
			chipStack: 1000
		});
	}

	async fallbackAction() {
		try {
			const actions = await this.bot.getPossibleActions();
			
			if (findAction(actions, ActionType.Check)) {
				await this.bot.submitAction(ActionType.Check);
			} else if (findAction(actions, ActionType.Fold)) {
				await this.bot.submitAction(ActionType.Fold);
			}
		} catch (error) {
			console.error('❌ Fallback failed:', error.message);
		}
	}

	initializeOpponentTracking() {
		this.opponentStats.clear();
		console.log('📊 Opponent tracking initialized');
	}

	stop() {
		console.log('\n📊 Final Statistics:');
		console.log(`Hands Played: ${this.gameStats.handsPlayed}`);
		console.log(`VPIP: ${this.gameStats.handsPlayed > 0 ? (this.gameStats.vpip / this.gameStats.handsPlayed * 100).toFixed(1) : 0}%`);
		console.log(`PFR: ${this.gameStats.handsPlayed > 0 ? (this.gameStats.pfr / this.gameStats.handsPlayed * 100).toFixed(1) : 0}%`);
		
		this.bot.disconnect();
	}
}

// Example usage
async function runAdvancedBot() {
	const credentials = {
		botId: 'advanced-strategy-bot',
		apiKey: 'your-api-key'
	};

	const bot = new AdvancedStrategyBot(credentials);
	
	process.on('SIGINT', () => {
		console.log('\n🛑 Shutting down advanced bot...');
		bot.stop();
		process.exit(0);
	});

	await bot.start();
}

runAdvancedBot().catch(console.error);