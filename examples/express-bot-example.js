#!/usr/bin/env node

/**
 * Express Bot Example
 * 
 * This example demonstrates how to create a simple poker bot
 * that interacts with the Pokai Poker Engine through both:
 * 1. REST API endpoints for game management
 * 2. WebSocket connections for real-time gameplay
 * 
 * To run this example:
 * 1. Start the Pokai server: npm run dev
 * 2. Run this script: node examples/express-bot-example.js
 */

const axios = require('axios');
const io = require('socket.io-client');

const SERVER_URL = 'http://localhost:3000';
const WEBSOCKET_URL = 'ws://localhost:3000';

class SimpleBot {
    constructor(botName, gameId) {
        this.botName = botName;
        this.gameId = gameId;
        this.playerId = `${botName}-${Date.now()}`;
        this.chipStack = 1000;
        this.socket = null;
        this.gameState = null;
    }

    async init() {
        console.log(`🤖 Initializing bot: ${this.botName}`);
        
        // First, check if the game exists using REST API
        try {
            const response = await axios.get(`${SERVER_URL}/api/games/${this.gameId}`);
            console.log(`🎮 Game found: ${response.data.data.id}`);
        } catch (error) {
            if (error.response?.status === 404) {
                console.log(`🎮 Game not found, creating new game: ${this.gameId}`);
                await this.createGame();
            } else {
                console.error('❌ Error checking game:', error.message);
                return;
            }
        }

        // Check if we can join the game
        const canJoinResponse = await axios.get(`${SERVER_URL}/api/games/${this.gameId}/can-join/${this.playerId}`);
        if (!canJoinResponse.data.data.canJoin) {
            console.log(`❌ Cannot join game ${this.gameId}`);
            return;
        }

        // Connect via WebSocket
        this.connectToGame();
    }

    async createGame() {
        try {
            const response = await axios.post(`${SERVER_URL}/api/games`, {
                gameId: this.gameId,
                maxPlayers: 4,
                smallBlindAmount: 10,
                bigBlindAmount: 20,
                turnTimeLimit: 30,
                isTournament: false
            });
            console.log(`✅ Created game: ${response.data.data.id}`);
        } catch (error) {
            console.error('❌ Error creating game:', error.response?.data?.message || error.message);
        }
    }

    connectToGame() {
        console.log(`🔌 Connecting to WebSocket: ${WEBSOCKET_URL}`);
        
        this.socket = io(WEBSOCKET_URL);

        this.socket.on('connect', () => {
            console.log(`✅ Connected to server`);
            
            // Join the game
            this.socket.emit('identify', {
                botName: this.botName,
                gameId: this.gameId,
                chipStack: this.chipStack
            });
        });

        this.socket.on('identificationSuccess', (data) => {
            console.log(`🎉 Successfully joined game as ${this.botName}`);
            console.log(`💰 Chip stack: ${data.chipStack}`);
        });

        this.socket.on('identificationError', (data) => {
            console.error(`❌ Failed to join game: ${data.error}`);
        });

        this.socket.on('gameState', (gameState) => {
            this.gameState = gameState;
            console.log(`📊 Game state updated - Phase: ${gameState.currentPhase}, Players: ${gameState.players.length}`);
            
            // Show current pot and community cards
            if (gameState.potSize > 0) {
                console.log(`💰 Pot: ${gameState.potSize}`);
            }
            if (gameState.communityCards.length > 0) {
                console.log(`🃏 Community cards: ${this.formatCards(gameState.communityCards)}`);
            }
            
            // Show our hand if we have one
            if (gameState.playerCards) {
                console.log(`🎴 Our hand: ${this.formatCards(gameState.playerCards)}`);
            }
        });

        this.socket.on('turnStart', (data) => {
            console.log(`🎯 It's our turn! Time limit: ${data.timeLimit}s`);
            
            // Get possible actions using REST API
            this.getPossibleActionsAndDecide();
        });

        this.socket.on('turnWarning', (data) => {
            console.log(`⚠️  Turn warning: ${data.timeRemaining}s remaining`);
        });

        this.socket.on('actionResult', (data) => {
            if (data.success) {
                console.log(`✅ Action successful: ${data.action.type}`);
            } else {
                console.error(`❌ Action failed: ${data.error}`);
            }
        });

        this.socket.on('gameEvent', (event) => {
            console.log(`📢 Game event: ${event.type}`);
            if (event.action) {
                console.log(`   Player ${event.action.playerId} performed ${event.action.type}`);
            }
        });

        this.socket.on('handComplete', (data) => {
            console.log(`🏁 Hand complete!`);
            if (data.winner) {
                console.log(`🏆 Winner: ${data.winner.playerId} with ${data.winner.handRank}`);
            }
        });

        this.socket.on('disconnect', () => {
            console.log(`❌ Disconnected from server`);
        });

        this.socket.on('error', (error) => {
            console.error(`❌ Socket error:`, error);
        });
    }

    async getPossibleActionsAndDecide() {
        try {
            const response = await axios.get(`${SERVER_URL}/api/games/${this.gameId}/players/${this.playerId}/actions`);
            const possibleActions = response.data.data;
            
            console.log(`🎯 Possible actions: ${possibleActions.map(a => a.type).join(', ')}`);
            
            // Simple strategy: always call if possible, otherwise fold
            const action = this.decideAction(possibleActions);
            
            console.log(`🤖 Decided to: ${action.type}`);
            
            // Submit action via WebSocket
            this.socket.emit('action', {
                ...action,
                playerId: this.playerId,
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('❌ Error getting possible actions:', error.response?.data?.message || error.message);
            
            // Fallback: fold
            this.socket.emit('action', {
                type: 'fold',
                playerId: this.playerId,
                timestamp: Date.now()
            });
        }
    }

    decideAction(possibleActions) {
        // Very simple strategy
        const canCall = possibleActions.find(a => a.type === 'call');
        const canCheck = possibleActions.find(a => a.type === 'check');
        const canFold = possibleActions.find(a => a.type === 'fold');
        
        if (canCheck) {
            return { type: 'check' };
        } else if (canCall) {
            return { type: 'call' };
        } else if (canFold) {
            return { type: 'fold' };
        } else {
            // Default to first available action
            return { type: possibleActions[0].type };
        }
    }

    formatCards(cards) {
        return cards.map(card => `${card.rank}${card.suit}`).join(' ');
    }

    async showServerStats() {
        try {
            const response = await axios.get(`${SERVER_URL}/stats`);
            console.log('\n📊 Server Statistics:');
            console.log(`   Total games: ${response.data.totalGames}`);
            console.log(`   Active games: ${response.data.activeGames}`);
            console.log(`   Total players: ${response.data.totalPlayers}`);
            console.log(`   Connected clients: ${response.data.connectedClients}`);
        } catch (error) {
            console.error('❌ Error getting server stats:', error.message);
        }
    }
}

// Example usage
async function runExample() {
    console.log('🚀 Starting Express Bot Example');
    
    // Create a simple bot
    const bot = new SimpleBot('SimpleBot', 'example-game');
    
    try {
        // Show server stats
        await bot.showServerStats();
        
        // Initialize the bot
        await bot.init();
        
        // Keep the process running
        console.log('\n🎮 Bot is running. Press Ctrl+C to exit.');
        
    } catch (error) {
        console.error('❌ Error in example:', error.message);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down bot...');
    process.exit(0);
});

// Run the example
runExample();