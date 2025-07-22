#!/usr/bin/env node

/**
 * Basic Bot Example - PokaiEngine SDK
 *
 * Demonstrates the simplest possible bot implementation
 */

import { ActionType, formatCards, GameEvent, PokaiBot } from '../src/index';

async function runBasicBot() {
	console.log('🤖 Starting Basic Bot Example');
	console.log('=============================');

	// Create bot instance
	const bot = new PokaiBot({
		credentials: {
			botId: 'b2-md6sktcw-3e8610c6',
			apiKey:
				'ac7fae3bd5fe4517d06fcb1fed06b88b437cb704ed07938678f5595b15157b04',
		},
		serverUrl: 'http://localhost:3000',
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
		onGameJoined: (data: { gameId: string; chipStack: number; }) => {
			console.log(`✅ Joined game ${data.gameId} with ${data.chipStack} chips`);
		},

		onTurnStart: async (data: { timeLimit: number; }) => {
			if (isActing) {
				console.log('[B2] Already acting, skipping turn start');
				return;
			}
			isActing = true;
			console.log(`[B2] 🎯 My turn! (${data.timeLimit}s time limit)`);

			try {
				// Add a 5-second delay for debugging
				await new Promise((resolve) => setTimeout(resolve, 5000));

				// Get current game state
				const gameState = await bot.getGameState();
				console.log(
					`[B2] 📊 Hand: ${formatCards(gameState.playerCards)} | Pot: ${gameState.potSize} | Phase: ${gameState.currentPhase}`,
				);

				// Get possible actions
				const actions = await bot.getPossibleActions();
				console.log(
					`[B2] 🎲 Available: ${actions.map((a) => a.type).join(', ')}`,
				);

				// Simple strategy: prefer check/call over folding
				if (actions.find((a) => a.type === ActionType.Check)) {
					console.log('[B2] Choosing action: Check');
					await bot.submitAction(ActionType.Check);
				} else if (actions.find((a) => a.type === ActionType.Call)) {
					console.log('[B2] Choosing action: Call');
					await bot.submitAction(ActionType.Call);
				} else {
					console.log('[B2] Choosing action: Fold');
					await bot.submitAction(ActionType.Fold);
				}
				console.log('[B2] ✅ Action submitted successfully');
			} catch (error) {
				console.error('❌ [B2] Error during turn:', (error as Error).message);
			} finally {
				isActing = false;
			}
		},

		onGameEvent: (event: GameEvent) => {
			if (event.type === 'hand_complete') {
				console.log('🏁 Hand completed');
				handsPlayed++;
				if (handsPlayed >= maxHands) {
					handleGameCompletion();
				}
			}
		},

		onError: (error: string, code?: string) => {
			console.error(`❌ Bot error [${code}]:`, error);
		},

		onDisconnected: (reason: string) => {
			console.log(`🔌 Disconnected: ${reason}`);
		},
	});

	try {
		// Connect to server
		console.log('🔗 Connecting to server...');
		await bot.connect();
		await bot.authenticate();
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
		console.error('❌ Bot failed:', (error as Error).message);
	}
}

// Handle graceful shutdown
process.on('SIGINT', () => {
	console.log('\n🛑 Shutting down bot...');
	process.exit(0);
});

// Run the bot
runBasicBot().catch(console.error);
