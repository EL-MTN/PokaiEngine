/**
 * Example of an authenticated bot connecting to PokaiEngine
 * This demonstrates the new authentication flow
 */

const io = require('socket.io-client');
const axios = require('axios');

class AuthenticatedBot {
	constructor(serverUrl = 'http://localhost:3000') {
		this.serverUrl = serverUrl;
		this.socket = null;
		this.credentials = null;
		this.playerId = null;
		this.gameState = null;
	}

	/**
	 * Register a new bot and get credentials
	 */
	async register(botName, developer, email) {
		try {
			const response = await axios.post(`${this.serverUrl}/api/bots/register`, {
				botName,
				developer,
				email
			});

			if (response.data.success) {
				this.credentials = response.data.data;
				console.log('✅ Bot registered successfully!');
				console.log('Bot ID:', this.credentials.botId);
				console.log('API Key:', this.credentials.apiKey);
				console.log('⚠️  Save your API key securely - it won\'t be shown again!');
				return this.credentials;
			}
		} catch (error) {
			console.error('❌ Registration failed:', error.response?.data?.message || error.message);
			throw error;
		}
	}

	/**
	 * Connect to the server using existing credentials
	 */
	connect(botId, apiKey) {
		return new Promise((resolve, reject) => {
			// Store credentials if provided
			if (botId && apiKey) {
				this.credentials = { botId, apiKey };
			}

			if (!this.credentials) {
				reject(new Error('No credentials provided'));
				return;
			}

			// Connect to Socket.io server
			this.socket = io(this.serverUrl);

			this.socket.on('connect', () => {
				console.log('🔌 Connected to server');
			});

			// Handle authentication required message
			this.socket.on('authRequired', (data) => {
				console.log('🔐 Authentication required:', data.message);
				this.authenticate();
			});

			// Handle authentication success
			this.socket.on('authenticated', (data) => {
				console.log('✅ Authenticated successfully!');
				console.log('   Bot:', data.botName);
				console.log('   Player ID:', data.playerId);
				this.playerId = data.playerId;
				resolve(data);
			});

			// Handle authentication errors
			this.socket.on('authError', (data) => {
				console.error('❌ Authentication failed:', data.message);
				reject(new Error(data.message));
			});

			// Handle other errors
			this.socket.on('error', (data) => {
				console.error('❌ Error:', data.message);
				if (data.code === 'AUTH_REQUIRED') {
					console.log('⚠️  You must authenticate before performing this action');
				}
			});

			// Handle game state updates
			this.socket.on('gameState', (gameState) => {
				this.gameState = gameState;
				console.log('📊 Game state updated');
				this.handleGameState(gameState);
			});

			// Handle game events
			this.socket.on('gameEvent', (event) => {
				console.log('🎮 Game event:', event.type);
			});

			// Handle disconnection
			this.socket.on('disconnect', (reason) => {
				console.log('🔌 Disconnected:', reason);
			});
		});
	}

	/**
	 * Authenticate with the server
	 */
	authenticate() {
		if (!this.socket || !this.credentials) {
			console.error('Cannot authenticate - no socket or credentials');
			return;
		}

		console.log('🔐 Authenticating with bot ID:', this.credentials.botId);
		this.socket.emit('authenticate', {
			botId: this.credentials.botId,
			apiKey: this.credentials.apiKey
		});
	}

	/**
	 * Join a game
	 */
	joinGame(gameId, chipStack = 1000) {
		if (!this.socket) {
			console.error('Not connected to server');
			return;
		}

		console.log(`🎮 Joining game ${gameId} with ${chipStack} chips`);
		this.socket.emit('identify', {
			botName: this.credentials?.botName || 'AuthBot',
			gameId: gameId,
			chipStack: chipStack
		});
	}

	/**
	 * Handle game state and make decisions
	 */
	handleGameState(gameState) {
		// Check if it's our turn
		if (gameState.currentPlayerToAct !== this.playerId) {
			return;
		}

		console.log('🤔 It\'s my turn!');
		console.log('   My cards:', gameState.playerCards);
		console.log('   Community cards:', gameState.communityCards);
		console.log('   Pot size:', gameState.potSize);
		console.log('   Possible actions:', gameState.possibleActions);

		// Simple decision logic - you can make this more sophisticated
		const decision = this.makeDecision(gameState);
		
		if (decision) {
			console.log(`📤 Taking action: ${decision.type}${decision.amount ? ` $${decision.amount}` : ''}`);
			this.socket.emit('action', { action: decision });
		}
	}

	/**
	 * Simple decision-making logic
	 */
	makeDecision(gameState) {
		const actions = gameState.possibleActions;
		
		// Find available actions
		const canCheck = actions.some(a => a.type === 'check');
		const canCall = actions.some(a => a.type === 'call');
		const canBet = actions.some(a => a.type === 'bet');
		const canRaise = actions.some(a => a.type === 'raise');
		const canFold = actions.some(a => a.type === 'fold');

		// Very simple logic - you should implement better decision making
		const random = Math.random();

		// 70% of the time, play conservatively
		if (random < 0.7) {
			if (canCheck) {
				return { type: 'check', playerId: this.playerId, timestamp: Date.now() };
			} else if (canCall) {
				const callAction = actions.find(a => a.type === 'call');
				return { 
					type: 'call', 
					amount: callAction.amount,
					playerId: this.playerId, 
					timestamp: Date.now() 
				};
			}
		}
		
		// 20% of the time, be aggressive
		if (random < 0.9) {
			if (canBet) {
				const betAction = actions.find(a => a.type === 'bet');
				const betAmount = betAction.minAmount + Math.floor(Math.random() * 50);
				return { 
					type: 'bet', 
					amount: Math.min(betAmount, betAction.maxAmount),
					playerId: this.playerId, 
					timestamp: Date.now() 
				};
			} else if (canRaise) {
				const raiseAction = actions.find(a => a.type === 'raise');
				const raiseAmount = raiseAction.minAmount;
				return { 
					type: 'raise', 
					amount: raiseAmount,
					playerId: this.playerId, 
					timestamp: Date.now() 
				};
			}
		}

		// 10% of the time or if nothing else is available, fold
		if (canFold) {
			return { type: 'fold', playerId: this.playerId, timestamp: Date.now() };
		}

		// Default to check if possible
		if (canCheck) {
			return { type: 'check', playerId: this.playerId, timestamp: Date.now() };
		}

		return null;
	}

	/**
	 * Leave the current game
	 */
	leaveGame() {
		if (this.socket) {
			console.log('👋 Leaving game');
			this.socket.emit('leaveGame');
		}
	}

	/**
	 * Disconnect from server
	 */
	disconnect() {
		if (this.socket) {
			console.log('👋 Disconnecting from server');
			this.socket.disconnect();
			this.socket = null;
		}
	}
}

// Example usage
async function main() {
	const bot = new AuthenticatedBot();

	// Option 1: Register a new bot (first time only)
	if (process.argv[2] === 'register') {
		try {
			await bot.register(
				'ExampleBot',           // Bot name
				'John Developer',       // Developer name
				'john@example.com'     // Email
			);
			console.log('\n💾 Save these credentials securely!');
		} catch (error) {
			console.error('Failed to register:', error.message);
		}
		return;
	}

	// Option 2: Connect with existing credentials
	const botId = process.env.BOT_ID || 'your-bot-id-here';
	const apiKey = process.env.API_KEY || 'your-api-key-here';

	if (botId === 'your-bot-id-here') {
		console.log('⚠️  Please set BOT_ID and API_KEY environment variables');
		console.log('   Or run with "register" argument to create a new bot');
		console.log('   Example: node authenticated-bot.js register');
		return;
	}

	try {
		// Connect and authenticate
		await bot.connect(botId, apiKey);

		// Join a game after a short delay
		setTimeout(() => {
			bot.joinGame('test-game', 1000);
		}, 1000);

		// Keep the bot running
		process.on('SIGINT', () => {
			console.log('\n👋 Shutting down...');
			bot.disconnect();
			process.exit();
		});

	} catch (error) {
		console.error('Failed to connect:', error.message);
		process.exit(1);
	}
}

// Run the example
main();