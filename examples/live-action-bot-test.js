#!/usr/bin/env node

/**
 * Live Action Bot Test
 *
 * Real-time bot action logging to verify bots are actively playing
 */

const axios = require('axios');
const io = require('socket.io-client');
const { EventEmitter } = require('events');

const SERVER_URL = 'http://localhost:3000';

class ActionLoggingBot extends EventEmitter {
	constructor(name, strategy) {
		super();
		this.name = name;
		this.strategy = strategy;
		this.playerId = `${name}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
		this.socket = io(SERVER_URL);
		this.gameState = null;
		this.actionCount = 0;
		this.handsPlayed = 0;
		this.wins = 0;
		this.actionHistory = [];
		this.setupSocketHandlers();
	}

	log(message, type = 'info') {
		const timestamp = new Date().toLocaleTimeString();
		const prefix =
			type === 'action' ? '🎯' : type === 'win' ? '🏆' : type === 'lose' ? '😞' : 'ℹ️';
		console.log(`[${timestamp}] ${prefix} ${this.name}: ${message}`);
	}

	setupSocketHandlers() {
		this.socket.on('connect', () => {
			this.log('Connected to server');
		});

		this.socket.on('identificationSuccess', (data) => {
			// IMPORTANT: Use the server-provided player ID, not our custom one
			this.playerId = data.playerId;
			this.log(
				`Joined game successfully (Server Player ID: ${this.playerId}, Chips: $${data.chipStack})`
			);
		});

		this.socket.on('gameState', (payload) => {
			this.gameState = payload.gameState;
			const actualGameState = this.gameState;

			if (
				actualGameState &&
				actualGameState.players &&
				Array.isArray(actualGameState.players)
			) {
				const myPlayer = actualGameState.players.find((p) => p.id === this.playerId);
				if (myPlayer && actualGameState.playerCards) {
					const cards = actualGameState.playerCards
						.map((c) => this.formatCard(c))
						.join(' ');
					const communityCards =
						actualGameState.communityCards && actualGameState.communityCards.length > 0
							? actualGameState.communityCards
									.map((c) => this.formatCard(c))
									.join(' ')
							: 'None';

					this.log(
						`📊 ${actualGameState.currentPhase.toUpperCase()} | Pot: $${
							actualGameState.potSize
						} | Chips: $${
							myPlayer.chipStack
						} | Hand: [${cards}] | Board: [${communityCards}]`
					);
				}
			}
		});

		this.socket.on('turnStart', (data) => {
			this.log(`🎯 MY TURN! Time limit: ${data.timeLimit}s`, 'action');
			setTimeout(() => this.makeMove(), 100); // Small delay to ensure game state is updated
		});

		this.socket.on('actionSuccess', (result) => {
			this.actionCount++;
			const actionStr = `${result.action.type.toUpperCase()}${
				result.action.amount ? ` $${result.action.amount}` : ''
			}`;
			this.log(`✅ Action #${this.actionCount}: ${actionStr}`, 'action');
			this.actionHistory.push({
				action: result.action.type,
				amount: result.action.amount,
				timestamp: new Date(),
			});
		});

		this.socket.on('actionError', (result) => {
			this.log(`❌ Action FAILED: ${result.error}`, 'action');
		});

		this.socket.on('gameEvent', (payload) => {
			const gameEvent = payload.event;

			// Opponent action
			if (gameEvent.type === 'action_taken' && gameEvent.action?.playerId !== this.playerId) {
				const opponentAction = `${gameEvent.action.type.toUpperCase()}${
					gameEvent.action.amount ? ` $${gameEvent.action.amount}` : ''
				}`;
				this.log(`👤 Opponent: ${opponentAction}`);
			}

			// New hand started
			if (gameEvent.type === 'hand_started') {
				this.log('🆕 NEW HAND STARTING');
				console.log('─'.repeat(80));
			}

			// Hand complete
			if (gameEvent.type === 'hand_complete') {
				this.handsPlayed++;
				const myWin =
					gameEvent.winners &&
					gameEvent.winners.find((w) => w.playerId === this.playerId);

				if (myWin) {
					this.wins++;
					this.log(
						`🎉 WON HAND #${this.handsPlayed} with ${myWin.handDescription}! (W/L: ${
							this.wins
						}/${this.handsPlayed - this.wins})`,
						'win'
					);
				} else {
					this.log(
						`💸 Lost hand #${this.handsPlayed}. (W/L: ${this.wins}/${
							this.handsPlayed - this.wins
						})`,
						'lose'
					);
				}

				// Emit an event to signal a hand has been played
				this.emit('hand_complete');

				// Show action summary for this hand
				const handActions = this.actionHistory.slice(-5); // Last 5 actions
				if (handActions.length > 0) {
					this.log(
						`📋 Hand summary: ${handActions
							.map((a) => a.action + (a.amount ? `($${a.amount})` : ''))
							.join(' → ')}`
					);
				}
			}
		});

		this.socket.on('turnWarning', (data) => {
			this.log(`⚠️ Time warning: ${data.timeRemaining}s remaining!`);
		});

		this.socket.on('identificationError', (data) => {
			this.log(`❌ Failed to join: ${data.error}`);
		});

		this.socket.on('disconnect', (reason) => {
			this.log(`❌ Disconnected: ${reason}`);
		});
	}

	formatCard(card) {
		const suits = { H: '♥', D: '♦', C: '♣', S: '♠' };
		const ranks = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
		const rank = ranks[card.rank] || card.rank.toString();
		const suit = suits[card.suit] || card.suit;
		return `${rank}${suit}`;
	}

	joinGame(gameId) {
		this.log(`Attempting to join game: ${gameId}`);
		this.socket.emit('identify', {
			botName: this.name,
			gameId: gameId,
			chipStack: 1000,
		});
	}

	makeMove() {
		if (!this.gameState) {
			this.log('❌ No game state available for decision');
			return;
		}

		const actualGameState = this.gameState;
		const actions = actualGameState.possibleActions || [];

		if (actions.length === 0) {
			this.log('❌ No possible actions available');
			return;
		}

		this.log(
			`🤔 Thinking... Available: [${actions.map((a) => a.type.toUpperCase()).join(', ')}]`
		);

		let chosenAction;

		if (this.strategy === 'aggressive') {
			// Aggressive: Always try to raise/bet
			chosenAction =
				actions.find((a) => a.type === 'raise') ||
				actions.find((a) => a.type === 'bet') ||
				actions.find((a) => a.type === 'call') ||
				actions.find((a) => a.type === 'check') ||
				actions[0];
		} else if (this.strategy === 'conservative') {
			// Conservative: Prefer passive actions
			chosenAction =
				actions.find((a) => a.type === 'check') ||
				actions.find((a) => a.type === 'call') ||
				actions.find((a) => a.type === 'fold') ||
				actions[0];
		} else {
			// Random strategy
			chosenAction = actions[Math.floor(Math.random() * actions.length)];
		}

		const action = {
			type: chosenAction.type,
			playerId: this.playerId,
			timestamp: Date.now(),
		};

		if (chosenAction.minAmount) {
			action.amount = chosenAction.minAmount;
		}

		const actionStr = `${action.type.toUpperCase()}${
			action.amount ? ` $${action.amount}` : ''
		}`;
		this.log(`🎯 DECISION: ${actionStr} (Strategy: ${this.strategy})`, 'action');

		// Wrap action in data object as expected by server
		this.socket.emit('action', { action: action });
	}

	getStats() {
		return {
			hands: this.handsPlayed,
			wins: this.wins,
			actions: this.actionCount,
			winRate: this.handsPlayed > 0 ? ((this.wins / this.handsPlayed) * 100).toFixed(1) : 0,
			actionsPerHand:
				this.handsPlayed > 0 ? (this.actionCount / this.handsPlayed).toFixed(1) : 0,
		};
	}
}

async function runLiveActionTest() {
	console.log('🎮 LIVE ACTION BOT TESTING');
	console.log('==========================');
	console.log('🔍 Real-time bot action monitoring');
	console.log('📊 Detailed game state logging');
	console.log('⚡ Live decision making process\n');

	const gameId = `live-test-${Date.now()}`;
	currentGameId = gameId; // Set global for cleanup
	let handsPlayed = 0;
	const handsToPlay = 5;

	let aggressiveBot;
	let conservativeBot;

	try {
		await new Promise((resolve, reject) => {
			let timeoutId;
			
			const onHandPlayed = () => {
				handsPlayed++;
				console.log(`🎯 Hand ${handsPlayed}/${handsToPlay} completed`);
				if (handsPlayed >= handsToPlay) {
					clearTimeout(timeoutId);
					resolve();
				}
			};

			timeoutId = setTimeout(() => {
				reject(new Error(`Test timed out after failing to complete ${handsToPlay} hands in 45 seconds.`));
			}, 45000); // 45-second timeout for 5 hands

			const run = async () => {
				try {
					// Create game with shorter turn times for faster action
					console.log('🎮 Creating game with fast turns...');
					await axios.post(`${SERVER_URL}/api/games`, {
						gameId: gameId,
						maxPlayers: 2,
						smallBlindAmount: 10,
						bigBlindAmount: 20,
						turnTimeLimit: 8, // 8 seconds for more reliable gameplay
						isTournament: false,
						startSettings: {
							condition: 'minPlayers', // Ensure auto-start
							minPlayers: 2
						}
					});
					console.log(`✅ Game created: ${gameId}\n`);

					// Create bots with different strategies
					console.log('🤖 Creating bots with different strategies...');
					aggressiveBot = new ActionLoggingBot('AggressiveBot', 'aggressive');
					conservativeBot = new ActionLoggingBot('ConservativeBot', 'conservative');
					
					// Set global reference for cleanup
					currentBots = [aggressiveBot, conservativeBot];

					// One bot will report hand completions
					aggressiveBot.on('hand_complete', onHandPlayed);

					// Wait for socket connections to establish
					await new Promise((resolve) => setTimeout(resolve, 1000));

					// Join game
					console.log('🔗 Connecting bots to game...');
					aggressiveBot.joinGame(gameId);
					
					// Small delay between bot connections
					await new Promise((resolve) => setTimeout(resolve, 500));
					conservativeBot.joinGame(gameId);

					// Wait for both bots to join and game to start
					console.log('🚀 Waiting for game to start...\n');
					console.log('='.repeat(80));
				} catch (err) {
					clearTimeout(timeoutId);
					reject(err);
				}
			};

			run();
		});

		console.log(`\n🏁 Test complete after ${handsToPlay} hands.`);
	} catch (error) {
		console.error('\n❌ Test failed:', error.response?.data?.message || error.message);
	} finally {
		console.log('\n' + '='.repeat(80));
		console.log('📊 FINAL STATISTICS');
		console.log('='.repeat(80));

		if (aggressiveBot && conservativeBot) {
			const aggStats = aggressiveBot.getStats();
			const conStats = conservativeBot.getStats();

			// Disconnect bots first
			console.log('🔌 Disconnecting bots...');
			aggressiveBot.socket.disconnect();
			conservativeBot.socket.disconnect();

			console.log('\n🤖 AggressiveBot Performance:');
			console.log(`   Hands Played: ${aggStats.hands}`);
			console.log(`   Actions Taken: ${aggStats.actions}`);
			console.log(`   Wins: ${aggStats.wins} (${aggStats.winRate}%)`);
			console.log(`   Actions per Hand: ${aggStats.actionsPerHand}`);

			console.log('\n🤖 ConservativeBot Performance:');
			console.log(`   Hands Played: ${conStats.hands}`);
			console.log(`   Actions Taken: ${conStats.actions}`);
			console.log(`   Wins: ${conStats.wins} (${conStats.winRate}%)`);
			console.log(`   Actions per Hand: ${conStats.actionsPerHand}`);

			const totalActions = aggStats.actions + conStats.actions;
			console.log(`\n📈 Game Summary:`);
			console.log(`   Total Actions: ${totalActions}`);
			console.log(`   Total Hands: ${Math.max(aggStats.hands, conStats.hands)}`);
			console.log(`   Average Game Speed: ${totalActions > 0 ? 'Active' : 'Inactive'}`);

			if (totalActions === 0) {
				console.log('\n⚠️  WARNING: No actions detected! Check bot logic.');
			} else {
				console.log('\n✅ SUCCESS: Bots are actively playing!');
			}
		} else {
			console.log('\n⚠️  Bots were not initialized, no stats to display.');
		}

		// Clean up the game by deleting it
		try {
			console.log('\n🧹 Cleaning up game...');
			await axios.delete(`${SERVER_URL}/api/games/${gameId}`);
			console.log('✅ Game deleted successfully');
		} catch (cleanupError) {
			console.log('⚠️  Failed to delete game (it may have been auto-cleaned):', cleanupError.response?.data?.message || cleanupError.message);
		}
	}
}

// Add process handlers for cleanup on interruption
let currentGameId = null;
let currentBots = [];

process.on('SIGINT', async () => {
	console.log('\n\n🛑 Test interrupted by user');
	
	// Clean up bots and game
	if (currentBots.length > 0) {
		console.log('🔌 Disconnecting bots...');
		currentBots.forEach(bot => {
			if (bot && bot.socket) {
				bot.socket.disconnect();
			}
		});
	}
	
	if (currentGameId) {
		try {
			console.log('🧹 Cleaning up game...');
			await axios.delete(`${SERVER_URL}/api/games/${currentGameId}`);
			console.log('✅ Game cleaned up');
		} catch (error) {
			console.log('⚠️  Failed to cleanup game:', error.message);
		}
	}
	
	process.exit(0);
});

runLiveActionTest().catch(console.error);
