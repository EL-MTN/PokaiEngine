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
			botId: 'b2-md6khjlu-731f1824',
			apiKey:
				'1acd5f66e32c36220926381d31af90f6ce09ce61aaa0aea0d0a83e0c03f587c0',
		},
		debug: true,
	});

	// Set up event handlers
	bot.setEventHandlers({
		onGameJoined: (data) => {
			console.log(`✅ Joined game ${data.gameId} with ${data.chipStack} chips`);
		},

		onTurnStart: async (data) => {
			console.log(`🎯 My turn! (${data.timeLimit}s time limit)`);
			
			try {
				// Get current game state
				const gameState = await bot.getGameState();
				console.log(`📊 Hand: ${formatCards(gameState.playerCards)} | Pot: $${gameState.potSize}`);
				
				// Get possible actions
				const actions = await bot.getPossibleActions();
				console.log(`🎲 Available: ${actions.map(a => a.type).join(', ')}`);
				
				// Simple strategy: prefer check/call over folding
				if (actions.find(a => a.type === ActionType.Check)) {
					await bot.submitAction(ActionType.Check);
				} else if (actions.find(a => a.type === ActionType.Call)) {
					await bot.submitAction(ActionType.Call);
				} else {
					await bot.submitAction(ActionType.Fold);
				}
			} catch (error) {
				console.error('❌ Error during turn:', error.message);
			}
		},

		onGameEvent: (event) => {
			if (event.type === 'hand_complete') {
				console.log('🏁 Hand completed');
			}
		},

		onError: (error, code) => {
			console.error(`❌ Bot error [${code}]:`, error);
		},

		onDisconnected: (reason) => {
			console.log(`🔌 Disconnected: ${reason}`);
		}
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
			chipStack: 1000
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