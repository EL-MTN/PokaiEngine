#!/usr/bin/env node

/**
 * Live Action Bot Test
 * 
 * Real-time bot action logging to verify bots are actively playing
 */

const axios = require('axios');
const io = require('socket.io-client');

const SERVER_URL = 'http://localhost:3000';

class ActionLoggingBot {
    constructor(name, strategy) {
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
        const prefix = type === 'action' ? '🎯' : type === 'win' ? '🏆' : type === 'lose' ? '😞' : 'ℹ️';
        console.log(`[${timestamp}] ${prefix} ${this.name}: ${message}`);
    }

    setupSocketHandlers() {
        this.socket.on('connect', () => {
            this.log('Connected to server');
        });

        this.socket.on('identificationSuccess', (data) => {
            // IMPORTANT: Use the server-provided player ID, not our custom one
            this.playerId = data.playerId;
            this.log(`Joined game successfully (Server Player ID: ${this.playerId}, Chips: $${data.chipStack})`);
        });

        this.socket.on('gameState', (state) => {
            this.gameState = state;
            const actualGameState = state.gameState || state;
            
            if (actualGameState.players && Array.isArray(actualGameState.players)) {
                const myPlayer = actualGameState.players.find(p => p.id === this.playerId);
                if (myPlayer && actualGameState.playerCards) {
                    const cards = actualGameState.playerCards.map(c => this.formatCard(c)).join(' ');
                    const communityCards = actualGameState.communityCards && actualGameState.communityCards.length > 0 
                        ? actualGameState.communityCards.map(c => this.formatCard(c)).join(' ')
                        : 'None';
                    
                    this.log(`📊 ${actualGameState.currentPhase.toUpperCase()} | Pot: $${actualGameState.potSize} | Chips: $${myPlayer.chipStack} | Hand: [${cards}] | Board: [${communityCards}]`);
                }
            }
        });

        this.socket.on('turnStart', (data) => {
            this.log(`🎯 MY TURN! Time limit: ${data.timeLimit}s`, 'action');
            setTimeout(() => this.makeMove(), 100); // Small delay to ensure game state is updated
        });

        this.socket.on('actionResult', (result) => {
            if (result.success) {
                this.actionCount++;
                const actionStr = `${result.action.type.toUpperCase()}${result.action.amount ? ` $${result.action.amount}` : ''}`;
                this.log(`✅ Action #${this.actionCount}: ${actionStr}`, 'action');
                this.actionHistory.push({
                    action: result.action.type,
                    amount: result.action.amount,
                    timestamp: new Date()
                });
            } else {
                this.log(`❌ Action FAILED: ${result.error}`, 'action');
            }
        });

        this.socket.on('handComplete', (data) => {
            this.handsPlayed++;
            if (data.winner && data.winner.playerId === this.playerId) {
                this.wins++;
                this.log(`🎉 WON HAND #${this.handsPlayed} with ${data.winner.handRank}! (W/L: ${this.wins}/${this.handsPlayed - this.wins})`, 'win');
            } else if (data.winner) {
                this.log(`💸 Lost hand #${this.handsPlayed} to ${data.winner.handRank} (W/L: ${this.wins}/${this.handsPlayed - this.wins})`, 'lose');
            } else {
                this.log(`🤝 Hand #${this.handsPlayed} tied`);
            }
            
            // Show action summary for this hand
            const handActions = this.actionHistory.slice(-5); // Last 5 actions
            if (handActions.length > 0) {
                this.log(`📋 Hand summary: ${handActions.map(a => a.action + (a.amount ? `($${a.amount})` : '')).join(' → ')}`);
            }
        });

        this.socket.on('gameEvent', (event) => {
            if (event.action && event.action.playerId !== this.playerId) {
                const opponentAction = `${event.action.type.toUpperCase()}${event.action.amount ? ` $${event.action.amount}` : ''}`;
                this.log(`👤 Opponent: ${opponentAction}`);
            }
            
            if (event.type === 'newHand') {
                this.log('🆕 NEW HAND STARTING');
                console.log('─'.repeat(80));
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
        const suits = { 'H': '♥', 'D': '♦', 'C': '♣', 'S': '♠' };
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
            chipStack: 1000
        });
    }

    makeMove() {
        if (!this.gameState) {
            this.log('❌ No game state available for decision');
            return;
        }

        const actualGameState = this.gameState.gameState || this.gameState;
        const actions = actualGameState.possibleActions || [];
        
        if (actions.length === 0) {
            this.log('❌ No possible actions available');
            return;
        }

        this.log(`🤔 Thinking... Available: [${actions.map(a => a.type.toUpperCase()).join(', ')}]`);

        let chosenAction;

        if (this.strategy === 'aggressive') {
            // Aggressive: Always try to raise/bet
            chosenAction = actions.find(a => a.type === 'raise') || 
                         actions.find(a => a.type === 'bet') || 
                         actions.find(a => a.type === 'call') || 
                         actions.find(a => a.type === 'check') || 
                         actions[0];
        } else if (this.strategy === 'conservative') {
            // Conservative: Prefer passive actions
            chosenAction = actions.find(a => a.type === 'check') || 
                         actions.find(a => a.type === 'call') || 
                         actions.find(a => a.type === 'fold') ||
                         actions[0];
        } else {
            // Random strategy
            chosenAction = actions[Math.floor(Math.random() * actions.length)];
        }

        const action = {
            type: chosenAction.type,
            playerId: this.playerId,
            timestamp: Date.now()
        };

        if (chosenAction.minAmount) {
            action.amount = chosenAction.minAmount;
        }

        const actionStr = `${action.type.toUpperCase()}${action.amount ? ` $${action.amount}` : ''}`;
        this.log(`🎯 DECISION: ${actionStr} (Strategy: ${this.strategy})`, 'action');
        
        // Wrap action in data object as expected by server
        this.socket.emit('action', { action: action });
    }

    getStats() {
        return {
            hands: this.handsPlayed,
            wins: this.wins,
            actions: this.actionCount,
            winRate: this.handsPlayed > 0 ? (this.wins / this.handsPlayed * 100).toFixed(1) : 0,
            actionsPerHand: this.handsPlayed > 0 ? (this.actionCount / this.handsPlayed).toFixed(1) : 0
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

    try {
        // Create game with shorter turn times for faster action
        console.log('🎮 Creating game with fast turns...');
        await axios.post(`${SERVER_URL}/api/games`, {
            gameId: gameId,
            maxPlayers: 2,
            smallBlindAmount: 10,
            bigBlindAmount: 20,
            turnTimeLimit: 5, // 5 seconds for faster gameplay
            isTournament: false
        });
        console.log(`✅ Game created: ${gameId}\n`);

        // Create bots with different strategies
        console.log('🤖 Creating bots with different strategies...');
        const aggressiveBot = new ActionLoggingBot('AggressiveBot', 'aggressive');
        const conservativeBot = new ActionLoggingBot('ConservativeBot', 'conservative');

        // Wait for connections
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Join game
        console.log('🔗 Connecting bots to game...');
        aggressiveBot.joinGame(gameId);
        conservativeBot.joinGame(gameId);
        
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Start game
        console.log('🚀 Starting live gameplay...\n');
        console.log('=' .repeat(80));
        await axios.post(`${SERVER_URL}/api/games/${gameId}/start`);

        // Monitor for 60 seconds
        console.log('👀 MONITORING LIVE GAMEPLAY (60 seconds)...\n');
        await new Promise(resolve => setTimeout(resolve, 60000));

        // Show comprehensive final stats
        console.log('\n' + '='.repeat(80));
        console.log('📊 FINAL STATISTICS');
        console.log('='.repeat(80));
        
        const aggStats = aggressiveBot.getStats();
        const conStats = conservativeBot.getStats();
        
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

    } catch (error) {
        console.error('\n❌ Test failed:', error.response?.data?.message || error.message);
    }
}

// Add process handlers
process.on('SIGINT', () => {
    console.log('\n\n🛑 Test interrupted by user');
    process.exit(0);
});

runLiveActionTest().catch(console.error);