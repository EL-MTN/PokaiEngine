#!/usr/bin/env node

/**
 * Basic Bot Example - PokaiEngine SDK
 *
 * Demonstrates the simplest possible bot implementation
 */

import { PokaiBot, ActionType, formatCards } from '../dist/index.js';

async function runBasicBot() {
	console.log('🤖 Starting Basic Bot Example');
	console.log('=============================');

	// Create bot instance
	const bot = new PokaiBot({
		credentials: {
			botId: 'b1-md6sk025-e3e666aa',
			apiKey:
				'49b2be6bd2d8daa2085882116deb43994eaa5303cfdf7c19bf178f859bc57ee7',
		},
		serverUrl: 'http://localhost:3001',
		debug: true,
	});

	let handsPlayed = 0;
	const maxHands = 5;

	const handleGameCompletion = async () => {
		console.log(`Played ${maxHands} hands, leaving game...`);
		await bot.leaveGame();
		console.log('Left the game.');
		bot.disconnect();
		process.exit(0);
	};

	let isActing = false;

	// Set up event handlers
	bot.setEventHandlers({
		onGameJoined: (data) => {
			console.log(`✅ Joined game ${data.gameId} with ${data.chipStack} chips`);
		},

		onTurnStart: async (data) => {
			if (isActing) {
				console.log('[B1] Already acting, skipping turn start');
				return;
			}
			isActing = true;
			console.log(`[B1] 🎯 My turn! (${data.timeLimit}s time limit)`);

			try {
				// Add a 5-second delay for debugging
				await new Promise((resolve) => setTimeout(resolve, 5000));

				// Get current game state
				const gameState = await bot.getGameState();
				console.log(
					`[B1] 📊 Hand: ${formatCards(gameState.playerCards)} | Pot: ${gameState.potSize} | Phase: ${gameState.currentPhase}`,
				);

				// Get possible actions
				const actions = await bot.getPossibleActions();
				console.log(
					`[B1] 🎲 Available: ${actions.map((a) => a.type).join(', ')}`,
				);

				// Simple strategy: prefer check/call over folding
				if (actions.find((a) => a.type === ActionType.Check)) {
					console.log('[B1] Choosing action: Check');
					await bot.submitAction(ActionType.Check);
				} else if (actions.find((a) => a.type === ActionType.Call)) {
					console.log('[B1] Choosing action: Call');
					await bot.submitAction(ActionType.Call);
				} else {
					console.log('[B1] Choosing action: Fold');
					await bot.submitAction(ActionType.Fold);
				}
				console.log('[B1] ✅ Action submitted successfully');
			} catch (error) {
				console.error('❌ [B1] Error during turn:', error.message);
			} finally {
				isActing = false;
			}
		},

		onGameEvent: (event) => {
			if (event.type === 'hand_complete') {
				console.log('🏁 Hand completed');
				handsPlayed++;
				if (handsPlayed >= maxHands) {
					handleGameCompletion();
				}
			}
		},

		onError: (error, code) => {
			console.error(`❌ Bot error [${code}]:`, error);
		},

		onDisconnected: (reason) => {
			console.log(`🔌 Disconnected: ${reason}`);
		},
	});

	try {
		// Connect to server
		console.log('🔗 Connecting to server...');
		await bot.connect();
		console.log('✅ Connected and authenticated');

		// List available games
		console.log('📋 Getting available games...');
		const games = await bot.getGames();
		console.log(`Found ${games.length} games`);

		if (games.length === 0) {
			console.log('❌ No games available');
			return;
		}

		// Join the first available game
		const gameToJoin = games[0];
		console.log(`🎮 Joining game: ${gameToJoin.id}`);
		console.log('gameToJoin', gameToJoin);
		await bot.joinGame({
			gameId: gameToJoin.id,
			chipStack: 1000,
		});

		// Keep the bot running
		console.log('🚀 Bot is now active and playing...');
		console.log('Press Ctrl+C to stop');
	} catch (error) {
		console.error('❌ Bot failed:', error.message);
	}
}

// Handle graceful shutdown
process.on('SIGINT', () => {
	console.log('\n🛑 Shutting down bot...');
	process.exit(0);
});

// Run the bot
runBasicBot().catch(console.error);
