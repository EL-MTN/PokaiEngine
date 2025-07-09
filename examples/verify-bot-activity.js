#!/usr/bin/env node

/**
 * Bot Activity Verification Script
 * 
 * Quick verification that bots are actually playing by monitoring actions
 */

const axios = require('axios');
const io = require('socket.io-client');

const SERVER_URL = 'http://localhost:3000';

// Simple action counter
let totalActions = 0;
let actionLog = [];

function logAction(botName, action, details = '') {
    totalActions++;
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${botName}: ${action} ${details}`;
    actionLog.push(logEntry);
    console.log(`✅ Action #${totalActions} - ${logEntry}`);
}

// Quick bot that just logs actions
class QuickBot {
    constructor(name, strategy) {
        this.name = name;
        this.strategy = strategy;
        this.playerId = `${name}-${Date.now()}`;
        this.socket = io(SERVER_URL);
        this.setupHandlers();
    }

    setupHandlers() {
        this.socket.on('connect', () => {
            console.log(`🔗 ${this.name} connected`);
        });

        this.socket.on('identificationSuccess', () => {
            console.log(`✅ ${this.name} joined game`);
        });

        this.socket.on('turnStart', () => {
            logAction(this.name, 'TURN_START', '(thinking...)');
            setTimeout(() => this.act(), 200);
        });

        this.socket.on('actionResult', (result) => {
            if (result.success) {
                logAction(this.name, 'ACTION_SUCCESS', `${result.action.type.toUpperCase()}${result.action.amount ? ` $${result.action.amount}` : ''}`);
            }
        });

        this.socket.on('gameEvent', (event) => {
            if (event.action && event.action.playerId !== this.playerId) {
                logAction('OPPONENT', 'ACTION', `${event.action.type.toUpperCase()}${event.action.amount ? ` $${event.action.amount}` : ''}`);
            }
        });

        this.socket.on('handComplete', (data) => {
            if (data.winner) {
                const winner = data.winner.playerId === this.playerId ? this.name : 'OPPONENT';
                logAction(winner, 'HAND_WON', data.winner.handRank);
            }
        });
    }

    join(gameId) {
        this.socket.emit('identify', {
            botName: this.name,
            gameId: gameId,
            chipStack: 1000
        });
    }

    act() {
        // Simple action - just call/check
        this.socket.emit('action', {
            type: 'check',
            playerId: this.playerId,
            timestamp: Date.now()
        });
    }
}

async function verifyActivity() {
    console.log('🔍 BOT ACTIVITY VERIFICATION');
    console.log('============================');
    console.log('⏱️  Running 30-second verification test...\n');

    const gameId = `verify-${Date.now()}`;
    
    try {
        // Create game
        await axios.post(`${SERVER_URL}/api/games`, {
            gameId: gameId,
            maxPlayers: 2,
            smallBlindAmount: 5,
            bigBlindAmount: 10,
            turnTimeLimit: 4,
            isTournament: false
        });

        console.log(`✅ Test game created: ${gameId}`);

        // Create bots
        const bot1 = new QuickBot('TestBot1', 'simple');
        const bot2 = new QuickBot('TestBot2', 'simple');

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Join and start
        bot1.join(gameId);
        bot2.join(gameId);
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        await axios.post(`${SERVER_URL}/api/games/${gameId}/start`);
        console.log('🚀 Game started - monitoring actions...\n');

        // Monitor for 30 seconds
        const startTime = Date.now();
        const monitorDuration = 30000;

        await new Promise(resolve => setTimeout(resolve, monitorDuration));

        // Results
        const endTime = Date.now();
        const actualDuration = (endTime - startTime) / 1000;

        console.log('\n' + '='.repeat(50));
        console.log('📊 VERIFICATION RESULTS');
        console.log('='.repeat(50));
        console.log(`⏱️  Test Duration: ${actualDuration.toFixed(1)} seconds`);
        console.log(`🎯 Total Actions Detected: ${totalActions}`);
        console.log(`📈 Actions per Second: ${(totalActions / actualDuration).toFixed(2)}`);
        
        if (totalActions > 0) {
            console.log('\n✅ SUCCESS: Bots are actively playing!');
            console.log('\n📋 Recent Actions:');
            actionLog.slice(-10).forEach(action => console.log(`   ${action}`));
        } else {
            console.log('\n❌ WARNING: No bot actions detected!');
            console.log('   This could indicate:');
            console.log('   • Server connection issues');
            console.log('   • Game not starting properly');
            console.log('   • Bot logic problems');
        }

        // Server stats check
        try {
            const stats = await axios.get(`${SERVER_URL}/stats`);
            console.log('\n📊 Server Stats:');
            console.log(`   Connected Clients: ${stats.data.connectedClients}`);
            console.log(`   Active Games: ${stats.data.activeGames}`);
            console.log(`   Total Players: ${stats.data.totalPlayers}`);
        } catch (e) {
            console.log('\n❌ Could not fetch server stats');
        }

    } catch (error) {
        console.error('\n❌ Verification failed:', error.response?.data?.message || error.message);
    }
}

verifyActivity().catch(console.error);