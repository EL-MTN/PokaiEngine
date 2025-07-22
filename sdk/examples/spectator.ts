#!/usr/bin/env node

/**
 * Spectator Bot Example - PokaiEngine SDK
 *
 * Demonstrates how to use the spectator mode to watch games.
 */

import * as fs from 'fs';
import * as path from 'path';

import { GameEvent, GameState, PokaiBot } from '../src/index';

const logs: any[] = [];
const logFilePath = path.join(process.cwd(), 'spectator_logs.json');

async function runSpectatorBot() {
	console.log('Starting Spectator Bot Example');
	console.log('=================================');

	// Create bot instance
	const bot = new PokaiBot({
		credentials: {
			botId: 'spec-mddx68i0-4cc4af76',
			apiKey:
				'1fac493f61cf8ca89bd137a516dba098ff72ac4cf07896ead128bea9c14129c1', // Not used for spectator auth
		},
		serverUrl: 'http://localhost:3000',
		debug: true,
	});

	// Set up event handlers
	bot.setEventHandlers({
		onSpectatorState: (data: { gameId: string; gameState: GameState }) => {
			const logEntry = {
				timestamp: new Date().toISOString(),
				type: 'state',
				...data,
			};
			logs.push(logEntry);
			console.log(
				`[SPECTATOR] Received state for game ${data.gameId}:`,
				data.gameState,
			);
		},
		onSpectatorEvent: (data: { gameId: string; event: GameEvent }) => {
			const logEntry = {
				timestamp: new Date().toISOString(),
				type: 'event',
				...data,
			};
			logs.push(logEntry);
			console.log(
				`[SPECTATOR] Received event for game ${data.gameId}:`,
				data.event,
			);
			      if (data.event.type === 'hand_complete') {
        console.log('Hand completed, stopping spectator bot...');
        (async () => {
          await bot.unwatchGame({ gameId: data.gameId });
          fs.writeFileSync(logFilePath, JSON.stringify(logs, null, 2));
          console.log(`Logs saved to ${logFilePath}`);
          bot.disconnect();
          process.exit(0);
        })();
      }
		},
		onError: (error: string, code?: string) => {
			console.error(`Bot error [${code}]:`, error);
		},
		onDisconnected: (reason: string) => {
			console.log(`Disconnected: ${reason}`);
		},
	});

	try {
		// Connect to server
		console.log('Connecting to server...');
		await bot.connect();
		console.log('Connected to server');

		// Authenticate as a spectator
		console.log('Authenticating as spectator...');
		// IMPORTANT: Replace with your actual admin key from .env file
		await bot.authenticateAsSpectator(
			process.env.SPECTATOR_ADMIN_KEY || 'adminKey',
		);
		console.log('Authenticated as spectator');

		// Get list of games to spectate
		console.log('Getting available games for spectating...');
		const games = await bot.getSpectatorGames();
		console.log(`Found ${games.length} games`);

		if (games.length === 0) {
			console.log('No games available to spectate');
			bot.disconnect();
			return;
		}

		// Spectate the first available game
		const gameToSpectate = games[0];
		console.log(`Spectating game: ${gameToSpectate.id}`);
		await bot.spectateGame({ gameId: gameToSpectate.id });

		// Keep the bot running until a hand is completed
		console.log('Spectator bot is now active...');
		console.log('Watching until a hand is completed, then exiting.');
	} catch (error) {
		console.error('Bot failed:', (error as Error).message);
		process.exit(1);
	}
}

// Handle graceful shutdown
process.on('SIGINT', () => {
	fs.writeFileSync(logFilePath, JSON.stringify(logs, null, 2));
	console.log(`Logs saved to ${logFilePath}`);
	console.log('Shutting down bot...');
	process.exit(0);
});

// Run the bot
runSpectatorBot().catch(console.error);
