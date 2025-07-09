#!/usr/bin/env node

/**
 * Quick Bot vs Bot Test
 * 
 * A simplified version for quick testing of two bots playing each other.
 * This creates a game and connects two bots with different strategies.
 */

const axios = require('axios');
const io = require('socket.io-client');

const SERVER_URL = 'http://localhost:3000';

// Simple bot implementation
class SimpleBot {
    constructor(name, strategy) {
        this.name = name;
        this.strategy = strategy;
        this.playerId = `${name}-${Date.now()}`;
        this.socket = io(SERVER_URL);
        this.gameState = null;
        this.setupSocketHandlers();
    }

    setupSocketHandlers() {
        this.socket.on('connect', () => {
            console.log(`✅ ${this.name} connected`);
        });

        this.socket.on('identificationSuccess', (data) => {
            // Use server-provided player ID
            this.playerId = data.playerId;
            console.log(`🎉 ${this.name} joined game successfully (ID: ${this.playerId})`);
        });

        this.socket.on('gameState', (state) => {
            this.gameState = state;
            
            // Handle nested game state structure
            const actualGameState = state.gameState || state;
            
            if (actualGameState.players && Array.isArray(actualGameState.players)) {
                const myPlayer = actualGameState.players.find(p => p.id === this.playerId);
                if (myPlayer) {
                    const cards = actualGameState.playerCards ? 
                        actualGameState.playerCards.map(c => `${c.rank}${c.suit}`).join(' ') : 'No cards';
                    console.log(`📊 ${this.name} - Phase: ${actualGameState.currentPhase || 'unknown'}, Pot: $${actualGameState.potSize || 0}, Chips: $${myPlayer.chipStack}, Cards: ${cards}`);
                }
            }
        });

        this.socket.on('turnStart', () => {
            console.log(`🎯 ${this.name}'s turn`);
            this.makeMove();
        });

        this.socket.on('actionResult', (result) => {
            if (result.success) {
                console.log(`✅ ${this.name} - ${result.action.type} successful`);
            } else {
                console.log(`❌ ${this.name} - Action failed: ${result.error}`);
            }
        });

        this.socket.on('handComplete', (data) => {
            console.log(`🏁 Hand complete!`);
            if (data.winner) {
                if (data.winner.playerId === this.playerId) {
                    console.log(`🏆 ${this.name} WON with ${data.winner.handRank}!`);
                } else {
                    console.log(`😞 ${this.name} lost`);
                }
            }
        });

        this.socket.on('gameEvent', (event) => {
            if (event.action && event.action.playerId !== this.playerId) {
                console.log(`📢 Opponent: ${event.action.type}${event.action.amount ? ` $${event.action.amount}` : ''}`);
            }
        });

        this.socket.on('error', (error) => {
            console.error(`❌ ${this.name} socket error:`, error);
        });

        this.socket.on('disconnect', (reason) => {
            console.log(`❌ ${this.name} disconnected:`, reason);
        });

        this.socket.on('identificationError', (data) => {
            console.error(`❌ ${this.name} identification error:`, data.error);
        });
    }

    joinGame(gameId) {
        this.socket.emit('identify', {
            botName: this.name,
            gameId: gameId,
            chipStack: 1000
        });
    }

    makeMove() {
        if (!this.gameState) {
            console.log(`❌ ${this.name} - No game state available`);
            return;
        }

        // Handle nested game state structure
        const actualGameState = this.gameState.gameState || this.gameState;
        const actions = actualGameState.possibleActions || [];
        if (actions.length === 0) {
            console.log(`❌ ${this.name} - No possible actions available`);
            return;
        }

        let chosenAction;

        if (this.strategy === 'aggressive') {
            // Aggressive: Always raise/bet if possible
            chosenAction = actions.find(a => a.type === 'raise') || 
                         actions.find(a => a.type === 'bet') || 
                         actions.find(a => a.type === 'call') || 
                         actions.find(a => a.type === 'check') || 
                         actions.find(a => a.type === 'fold') ||
                         actions[0]; // Fallback to first action
        } else {
            // Conservative: Check/call when possible
            chosenAction = actions.find(a => a.type === 'check') || 
                         actions.find(a => a.type === 'call') || 
                         actions.find(a => a.type === 'fold') ||
                         actions[0]; // Fallback to first action
        }

        if (!chosenAction) {
            console.log(`❌ ${this.name} - No suitable action found`);
            return;
        }

        const action = {
            type: chosenAction.type,
            playerId: this.playerId,
            timestamp: Date.now()
        };

        if (chosenAction.minAmount) {
            action.amount = chosenAction.minAmount;
        }

        console.log(`🤖 ${this.name} chooses: ${action.type}${action.amount ? ` $${action.amount}` : ''}`);
        // Wrap action in data object as expected by server
        this.socket.emit('action', { action: action });
    }
}

// Main test function
async function quickTest() {
    console.log('🚀 Quick Bot vs Bot Test');
    console.log('========================\n');

    const gameId = `quick-test-${Date.now()}`;

    try {
        // Create game
        console.log('🎮 Creating game...');
        await axios.post(`${SERVER_URL}/api/games`, {
            gameId: gameId,
            maxPlayers: 2,
            smallBlindAmount: 10,
            bigBlindAmount: 20,
            turnTimeLimit: 8,
            isTournament: false
        });
        console.log('✅ Game created\n');

        // Create bots
        console.log('🤖 Creating bots...');
        const aggressiveBot = new SimpleBot('AggressiveBot', 'aggressive');
        const conservativeBot = new SimpleBot('ConservativeBot', 'conservative');

        // Wait for connections
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Join game
        console.log('🎯 Bots joining game...');
        aggressiveBot.joinGame(gameId);
        conservativeBot.joinGame(gameId);

        // Wait for bots to join
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Start game
        console.log('🚀 Starting game...\n');
        await axios.post(`${SERVER_URL}/api/games/${gameId}/start`);

        // Let them play
        console.log('🎮 Bots are playing...');
        console.log('========================\n');

        // Run for 30 seconds
        await new Promise(resolve => setTimeout(resolve, 30000));

        console.log('\n✅ Test completed!');

    } catch (error) {
        console.error('❌ Test failed:', error.response?.data?.message || error.message);
    }
}

// Run the test
quickTest().catch(console.error);