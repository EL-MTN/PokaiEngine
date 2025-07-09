#!/usr/bin/env node

/**
 * Server Activity Monitor
 * 
 * Monitors server statistics to verify bot activity
 */

const axios = require('axios');

const SERVER_URL = 'http://localhost:3000';

class ServerMonitor {
    constructor() {
        this.previousStats = null;
        this.monitoring = false;
    }

    async getStats() {
        try {
            const response = await axios.get(`${SERVER_URL}/stats`);
            return response.data;
        } catch (error) {
            console.error('❌ Failed to get server stats:', error.message);
            return null;
        }
    }

    async getGames() {
        try {
            const response = await axios.get(`${SERVER_URL}/api/games`);
            return response.data.data;
        } catch (error) {
            console.error('❌ Failed to get games:', error.message);
            return [];
        }
    }

    formatTimestamp() {
        return new Date().toLocaleTimeString();
    }

    async showCurrentActivity() {
        const stats = await this.getStats();
        const games = await this.getGames();

        if (!stats) return;

        console.log(`[${this.formatTimestamp()}] 📊 Server Activity:`);
        console.log(`   🎮 Active Games: ${stats.activeGames}`);
        console.log(`   👥 Connected Clients: ${stats.connectedClients}`);
        console.log(`   🎯 Total Players: ${stats.totalPlayers}`);
        console.log(`   ⏱️  Server Uptime: ${(stats.serverUptime / 60).toFixed(1)} minutes`);

        if (games.length > 0) {
            console.log(`   🎲 Game Details:`);
            games.forEach(game => {
                console.log(`      - ${game.id}: ${game.playerCount}/${game.maxPlayers} players, Hand #${game.currentHand}`);
            });
        }

        // Detect changes
        if (this.previousStats) {
            const clientChange = stats.connectedClients - this.previousStats.connectedClients;
            const gameChange = stats.activeGames - this.previousStats.activeGames;
            
            if (clientChange !== 0) {
                console.log(`   📈 Client change: ${clientChange > 0 ? '+' : ''}${clientChange}`);
            }
            if (gameChange !== 0) {
                console.log(`   📈 Game change: ${gameChange > 0 ? '+' : ''}${gameChange}`);
            }
        }

        this.previousStats = stats;
        console.log('─'.repeat(60));
    }

    async startMonitoring(intervalSeconds = 5) {
        console.log('🔍 Starting Server Activity Monitor');
        console.log(`📡 Checking every ${intervalSeconds} seconds`);
        console.log('📊 Press Ctrl+C to stop\n');
        console.log('='.repeat(60));

        this.monitoring = true;

        // Initial check
        await this.showCurrentActivity();

        // Set up interval
        const interval = setInterval(async () => {
            if (!this.monitoring) {
                clearInterval(interval);
                return;
            }
            await this.showCurrentActivity();
        }, intervalSeconds * 1000);

        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n🛑 Stopping monitor...');
            this.monitoring = false;
            clearInterval(interval);
            process.exit(0);
        });
    }
}

// Run the monitor
const monitor = new ServerMonitor();
monitor.startMonitoring(3); // Check every 3 seconds