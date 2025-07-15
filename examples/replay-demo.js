#!/usr/bin/env node

/**
 * Replay System Demo
 *
 * Demonstrates the enhanced logging and replay functionality
 */

const axios = require('axios');
const io = require('socket.io-client');
const { EventEmitter } = require('events');

const SERVER_URL = 'http://localhost:3000';

// For localhost connections, we need to bypass any proxy settings
// that might be set in the environment
const axiosInstance = axios.create({
	proxy: false, // Disable proxy for localhost
	timeout: 10000,
	baseURL: SERVER_URL,
});

// Configure socket options for better connectivity
const socketConfig = {
	transports: ['websocket', 'polling'], // Try websocket first, fall back to polling
	reconnection: true,
	reconnectionAttempts: 5,
	reconnectionDelay: 1000,
	timeout: 10000,
	forceNew: true, // Force new connection for each bot
};

console.log('🔧 Configured for direct localhost connection (bypassing proxy)');

class SimpleBot extends EventEmitter {
	constructor(name) {
		super();
		this.name = name;
		this.playerId = `${name}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
		this.socket = io(SERVER_URL, socketConfig);
		this.gameState = null;
		this.setupSocketHandlers();
	}

	log(message) {
		const timestamp = new Date().toLocaleTimeString();
		console.log(`[${timestamp}] ${this.name}: ${message}`);
	}

	setupSocketHandlers() {
		this.socket.on('connect', () => {
			this.log('Connected to server');
		});

		this.socket.on('identificationSuccess', (data) => {
			this.playerId = data.playerId;
			this.log(`Joined game successfully (Player ID: ${this.playerId})`);
		});

		this.socket.on('gameState', (payload) => {
			this.gameState = payload.gameState;
		});

		this.socket.on('turnStart', (data) => {
			this.log(`It's my turn! Time limit: ${data.timeLimit}s`);
			setTimeout(() => this.makeMove(), 500); // Small delay
		});

		this.socket.on('actionSuccess', (result) => {
			this.log(`Action successful: ${result.action.type.toUpperCase()}`);
		});

		this.socket.on('gameEvent', (payload) => {
			const event = payload.event;

			if (event.type === 'hand_started') {
				this.log('🆕 NEW HAND STARTING');
				this.emit('hand_started');
			}

			if (event.type === 'hand_complete') {
				this.log('✅ HAND COMPLETED');
				this.emit('hand_complete');
			}
		});

		this.socket.on('disconnect', (reason) => {
			this.log(`Disconnected: ${reason}`);
		});
	}

	joinGame(gameId) {
		this.log(`Joining game: ${gameId}`);
		this.socket.emit('identify', {
			botName: this.name,
			gameId: gameId,
			chipStack: 1000,
		});
	}

	makeMove() {
		if (!this.gameState) {
			this.log('No game state available');
			return;
		}

		const actions = this.gameState.possibleActions || [];
		if (actions.length === 0) {
			this.log('No possible actions');
			return;
		}

		// Simple strategy: prefer check/call, sometimes fold
		let chosenAction;
		const rand = Math.random();

		if (rand < 0.1) {
			// 10% chance to fold if possible
			chosenAction = actions.find((a) => a.type === 'fold') || actions[0];
		} else {
			// Prefer passive actions
			chosenAction =
				actions.find((a) => a.type === 'check') ||
				actions.find((a) => a.type === 'call') ||
				actions[0];
		}

		const action = {
			type: chosenAction.type,
			playerId: this.playerId,
			timestamp: Date.now(),
		};

		if (chosenAction.minAmount) {
			action.amount = chosenAction.minAmount;
		}

		this.log(`Making action: ${action.type.toUpperCase()}`);
		this.socket.emit('action', { action: action });
	}
}

async function runReplayDemo() {
	console.log('🎮 POKER REPLAY SYSTEM DEMO');
	console.log('============================');
	console.log('This demo will:');
	console.log('1. Create a game with enhanced logging');
	console.log('2. Run 3 hands with two bots');
	console.log('3. Save the replay to file');
	console.log('4. Demonstrate replay analysis');
	console.log('');

	const gameId = `replay-demo-${Date.now()}`;
	let handsPlayed = 0;
	const targetHands = 3;

	let bot1, bot2;

	try {
		// Create game
		console.log('🎮 Creating game...');
		await axiosInstance.post('/api/games', {
			gameId: gameId,
			maxPlayers: 2,
			smallBlindAmount: 5,
			bigBlindAmount: 10,
			turnTimeLimit: 5,
			isTournament: false,
			startSettings: {
				condition: 'minPlayers',
				minPlayers: 2,
			},
		});
		console.log(`✅ Game created: ${gameId}`);

		// Create and connect bots
		console.log('🤖 Creating bots...');
		bot1 = new SimpleBot('Demo-Bot-1');
		bot2 = new SimpleBot('Demo-Bot-2');

		// Wait for connection
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Track hand completion
		bot1.on('hand_complete', () => {
			handsPlayed++;
			console.log(`📊 Hand ${handsPlayed}/${targetHands} completed`);
		});

		// Join game
		console.log('🔗 Joining game...');
		bot1.joinGame(gameId);
		await new Promise((resolve) => setTimeout(resolve, 500));
		bot2.joinGame(gameId);

		// Wait for game to complete target hands
		console.log(`🚀 Playing ${targetHands} hands...`);
		console.log('='.repeat(50));

		await new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error(`Timeout waiting for ${targetHands} hands`));
			}, 45000);

			const checkComplete = () => {
				if (handsPlayed >= targetHands) {
					clearTimeout(timeout);
					resolve();
				} else {
					setTimeout(checkComplete, 1000);
				}
			};
			checkComplete();
		});

		console.log('='.repeat(50));
		console.log(`✅ Completed ${targetHands} hands!`);

		// Disconnect bots
		console.log('🔌 Disconnecting bots...');
		bot1.socket.disconnect();
		bot2.socket.disconnect();

		// Test replay functionality
		console.log('');
		console.log('🎬 TESTING REPLAY FUNCTIONALITY');
		console.log('===============================');

		// Get replay data
		console.log('📊 Getting replay data...');
		try {
			const replayResponse = await axiosInstance.get(`/api/replays/${gameId}`);
			if (replayResponse.data.success) {
				const replayData = replayResponse.data.data;
				console.log(`✅ Replay data retrieved successfully`);
				console.log(`📈 Events captured: ${replayData.events?.length || 0}`);
				console.log(
					`🕐 Game duration: ${Math.round((replayData.metadata?.gameDuration || 0) / 1000)}s`,
				);
				console.log(
					`🎯 Total actions: ${replayData.metadata?.totalActions || 0}`,
				);
				console.log(
					`🤖 Players: ${Object.keys(replayData.metadata?.playerNames || {}).length}`,
				);
			}
		} catch (error) {
			console.log(
				'⚠️  Could not retrieve replay data:',
				error.response?.data?.message || error.message,
			);
		}

		// Get replay analysis
		console.log('🔍 Getting replay analysis...');
		try {
			const analysisResponse = await axiosInstance.get(
				`/api/replays/${gameId}/analysis`,
			);
			if (analysisResponse.data.success) {
				const analysis = analysisResponse.data.data;
				console.log('✅ Replay analysis completed');
				console.log(`📊 Hands analyzed: ${analysis.handAnalysis?.length || 0}`);
				console.log(
					`🎮 Players analyzed: ${Object.keys(analysis.playerStatistics || {}).length}`,
				);
				console.log(
					`⚡ Interesting moments: ${analysis.interestingMoments?.length || 0}`,
				);

				// Show some interesting stats
				if (analysis.gameFlow) {
					const flow = analysis.gameFlow;
					console.log(
						`⏱️  Average hand duration: ${Math.round(flow.avgHandDuration / 1000)}s`,
					);
					const actions = Object.keys(flow.actionDistribution);
					if (actions.length > 0) {
						console.log(`🎯 Most common action: ${actions[0]}`);
					}
				}
			}
		} catch (error) {
			console.log(
				'⚠️  Could not get replay analysis:',
				error.response?.data?.message || error.message,
			);
		}

		// Test hand-specific replay
		console.log('🎲 Getting hand replay data...');
		try {
			const handResponse = await axiosInstance.get(
				`/api/replays/${gameId}/hands/1`,
			);
			if (handResponse.data.success) {
				const handData = handResponse.data.data;
				console.log(`✅ Hand 1 replay retrieved`);
				console.log(
					`👥 Players in hand: ${handData.playersInvolved?.length || 0}`,
				);
				console.log(
					`🃏 Community cards: ${handData.communityCards?.length || 0}`,
				);
				console.log(`💰 Final pot: $${handData.potSize || 0}`);
			}
		} catch (error) {
			console.log(
				'⚠️  Could not get hand replay:',
				error.response?.data?.message || error.message,
			);
		}

		// Save replay
		console.log('💾 Saving replay to file...');
		try {
			const saveResponse = await axiosInstance.post(
				`/api/replays/${gameId}/save`,
			);
			if (saveResponse.data.success) {
				console.log('✅ Replay saved to file successfully');
			}
		} catch (error) {
			console.log(
				'⚠️  Could not save replay:',
				error.response?.data?.message || error.message,
			);
		}

		// Delete game
		console.log('🧹 Cleaning up...');
		await axiosInstance.delete(`/api/games/${gameId}`);
		console.log('✅ Game deleted');
	} catch (error) {
		console.error(
			'❌ Demo failed:',
			error.response?.data?.message || error.message,
		);
	} finally {
		if (bot1) bot1.socket.disconnect();
		if (bot2) bot2.socket.disconnect();

		console.log('');
		console.log('🎉 DEMO COMPLETE!');
		console.log('The enhanced logging system captured:');
		console.log('- Complete game state at each event');
		console.log('- Player decision contexts and timing');
		console.log('- Detailed replay data for analysis');
		console.log('');
		console.log('Next steps:');
		console.log('- Add REST API endpoints for replay access');
		console.log('- Build web UI for replay visualization');
		console.log('- Implement advanced analysis features');
	}
}

runReplayDemo().catch(console.error);
