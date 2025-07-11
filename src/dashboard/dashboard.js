/**
 * Pokai Admin Dashboard
 * Real-time monitoring and management interface for the poker engine
 */

class PokaiDashboard {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.autoRefresh = true;
        this.refreshInterval = null;
        this.games = new Map();
        this.logs = [];
        
        this.init();
    }

    init() {
        this.connectWebSocket();
        this.setupEventListeners();
        this.startAutoRefresh();
        this.loadInitialData();
    }

    // WebSocket Connection Management
    connectWebSocket() {
        try {
            this.socket = io();
            
            this.socket.on('connect', () => {
                this.isConnected = true;
                this.updateConnectionStatus('connected');
                this.addLog('info', 'Connected to server');
            });

            this.socket.on('disconnect', () => {
                this.isConnected = false;
                this.updateConnectionStatus('disconnected');
                this.addLog('warn', 'Disconnected from server');
            });

            this.socket.on('connect_error', (error) => {
                this.addLog('error', `Connection error: ${error.message}`);
            });

            // Listen for game events
            this.socket.on('gameEvent', (data) => {
                this.handleGameEvent(data);
            });

        } catch (error) {
            this.addLog('error', `Failed to connect WebSocket: ${error.message}`);
        }
    }

    updateConnectionStatus(status) {
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            statusElement.className = `status-indicator ${status}`;
            statusElement.innerHTML = status === 'connected' 
                ? '<i class="fas fa-circle"></i> Connected'
                : '<i class="fas fa-circle"></i> Disconnected';
        }
    }

    // Event Listeners
    setupEventListeners() {
        // Auto refresh toggle
        const autoRefreshCheckbox = document.getElementById('auto-refresh');
        if (autoRefreshCheckbox) {
            autoRefreshCheckbox.addEventListener('change', (e) => {
                this.autoRefresh = e.target.checked;
                if (this.autoRefresh) {
                    this.startAutoRefresh();
                } else {
                    this.stopAutoRefresh();
                }
            });
        }

        // Manual refresh button
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshData();
            });
        }

        // Create game modal
        const createGameBtn = document.getElementById('create-game-btn');
        const createGameModal = document.getElementById('create-game-modal');
        const closeModalBtn = document.getElementById('close-modal');
        const cancelCreateBtn = document.getElementById('cancel-create');

        if (createGameBtn && createGameModal) {
            createGameBtn.addEventListener('click', () => {
                createGameModal.classList.add('show');
            });
        }

        if (closeModalBtn && createGameModal) {
            closeModalBtn.addEventListener('click', () => {
                createGameModal.classList.remove('show');
            });
        }

        if (cancelCreateBtn && createGameModal) {
            cancelCreateBtn.addEventListener('click', () => {
                createGameModal.classList.remove('show');
            });
        }

        // Create game form
        const createGameForm = document.getElementById('create-game-form');
        if (createGameForm) {
            createGameForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.createGame(new FormData(createGameForm));
            });
        }

        // Game details modal
        const gameDetailsModal = document.getElementById('game-details-modal');
        const closeDetailsBtn = document.getElementById('close-details-modal');

        if (closeDetailsBtn && gameDetailsModal) {
            closeDetailsBtn.addEventListener('click', () => {
                gameDetailsModal.classList.remove('show');
            });
        }

        // Clear logs button
        const clearLogsBtn = document.getElementById('clear-logs-btn');
        if (clearLogsBtn) {
            clearLogsBtn.addEventListener('click', () => {
                this.clearLogs();
            });
        }

        // Close modals on background click
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.classList.remove('show');
            }
        });
    }

    // Data Loading and Refreshing
    async loadInitialData() {
        await this.refreshData();
    }

    async refreshData() {
        try {
            await Promise.all([
                this.loadServerStats(),
                this.loadGames(),
                this.updateActiveGames()
            ]);
        } catch (error) {
            this.addLog('error', `Failed to refresh data: ${error.message}`);
        }
    }

    async loadServerStats() {
        try {
            const response = await fetch('/api/dashboard/stats');
            const result = await response.json();
            
            if (result.success) {
                const stats = result.data;
                this.updateStatCard('active-games-count', stats.totalGames || 0);
                this.updateStatCard('connected-players-count', stats.activeConnections || 0);
                this.updateStatCard('total-hands-count', stats.totalHands || 0);
                this.updateStatCard('server-load', `${Math.round((stats.memoryUsage?.heapUsed || 0) / 1024 / 1024)}MB`);
                
                // Update server uptime
                const uptimeElement = document.getElementById('server-uptime');
                if (uptimeElement && stats.serverUptime) {
                    const hours = Math.floor(stats.serverUptime / 3600);
                    const minutes = Math.floor((stats.serverUptime % 3600) / 60);
                    uptimeElement.textContent = `Uptime: ${hours}h ${minutes}m`;
                }
            }
            
        } catch (error) {
            this.addLog('error', `Failed to load server stats: ${error.message}`);
        }
    }

    async loadGames() {
        try {
            const response = await fetch('/api/games');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            console.log('Games API response:', result); // Debug logging
            
            if (result.success && result.data) {
                this.games.clear();
                
                if (!Array.isArray(result.data)) {
                    throw new Error('Expected games data to be an array');
                }
                
                result.data.forEach(game => {
                    // Transform API response to expected format
                    const transformedGame = {
                        gameId: game.id,
                        id: game.id,
                        maxPlayers: game.maxPlayers || 0,
                        smallBlind: game.smallBlind || 0,
                        bigBlind: game.bigBlind || 0,
                        playerCount: game.playerCount || 0,
                        players: Array(game.playerCount || 0).fill().map((_, i) => ({ id: `player-${i}` })), // Placeholder for player count
                        status: game.isRunning ? 'running' : 'waiting',
                        isRunning: game.isRunning || false,
                        currentHand: game.currentHand || 0,
                        isTournament: game.isTournament || false,
                        turnTimeLimit: game.turnTimeLimit || 30,
                        potSize: 0, // Default value, will be updated when we get detailed state
                        currentPhase: 'waiting' // Default value, will be updated when we get detailed state
                    };
                    this.games.set(game.id, transformedGame);
                });
                
                this.addLog('info', `Loaded ${result.data.length} games`);
                this.updateGamesTable();
            } else {
                console.error('Invalid API response:', result);
                this.addLog('error', `Invalid API response: ${result.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Load games error:', error);
            this.addLog('error', `Failed to load games: ${error.message}`);
        }
    }

    async updateActiveGames() {
        const activeGamesContainer = document.getElementById('active-games-list');
        if (!activeGamesContainer) return;

        // Filter for games with players or running games
        const activeGames = Array.from(this.games.values()).filter(game => 
            game.status === 'running' || game.playerCount > 0
        );

        if (activeGames.length === 0) {
            activeGamesContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-gamepad"></i>
                    <h3>No Active Games</h3>
                    <p>Create a new game to get started</p>
                </div>
            `;
            return;
        }

        // Fetch detailed state for each active game
        const gamesWithState = await Promise.all(
            activeGames.map(async (game) => {
                try {
                    const stateResponse = await fetch(`/api/games/${game.gameId}/state`);
                    if (stateResponse.ok) {
                        const stateResult = await stateResponse.json();
                        if (stateResult.success) {
                            return { ...game, ...stateResult.data };
                        }
                    }
                } catch (error) {
                    console.warn(`Failed to fetch state for game ${game.gameId}:`, error);
                }
                return game; // Return original game if state fetch fails
            })
        );

        activeGamesContainer.innerHTML = gamesWithState.map(game => `
            <div class="game-card" data-game-id="${game.gameId}">
                <div class="game-card-header">
                    <div class="game-card-title">${game.gameId}</div>
                    <div class="game-card-status status-${game.status || 'waiting'}">
                        ${(game.status || 'waiting').toUpperCase()}
                    </div>
                </div>
                <div class="game-card-info">
                    <div class="info-item">
                        <div class="info-label">Players</div>
                        <div class="info-value">${game.players ? game.players.length : game.playerCount}/${game.maxPlayers}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Blinds</div>
                        <div class="info-value">$${game.smallBlind}/$${game.bigBlind}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Pot</div>
                        <div class="info-value">$${game.potSize || 0}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Phase</div>
                        <div class="info-value">${game.currentPhase || 'waiting'}</div>
                    </div>
                </div>
                <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
                    <button class="btn btn-secondary btn-small" onclick="dashboard.viewGameDetails('${game.gameId}')">
                        <i class="fas fa-eye"></i> View
                    </button>
                    ${game.status !== 'running' ? `
                        <button class="btn btn-success btn-small" onclick="dashboard.startGame('${game.gameId}')">
                            <i class="fas fa-play"></i> Start
                        </button>
                    ` : ''}
                    <button class="btn btn-danger btn-small" onclick="dashboard.deleteGame('${game.gameId}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </div>
        `).join('');
    }

    updateGamesTable() {
        const tableContainer = document.getElementById('games-table-container');
        if (!tableContainer) return;

        const games = Array.from(this.games.values());

        if (games.length === 0) {
            tableContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-table"></i>
                    <h3>No Games Found</h3>
                    <p>Create your first game to get started</p>
                </div>
            `;
            return;
        }

        tableContainer.innerHTML = `
            <table class="table">
                <thead>
                    <tr>
                        <th>Game ID</th>
                        <th>Players</th>
                        <th>Blinds</th>
                        <th>Status</th>
                        <th>Type</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${games.map(game => `
                        <tr>
                            <td><strong>${game.gameId}</strong></td>
                            <td>${game.players ? game.players.length : game.playerCount}/${game.maxPlayers}</td>
                            <td>$${game.smallBlind}/$${game.bigBlind}</td>
                            <td>
                                <span class="game-card-status status-${game.status || 'waiting'}">
                                    ${(game.status || 'waiting').toUpperCase()}
                                </span>
                            </td>
                            <td>${game.isTournament ? 'Tournament' : 'Cash'}</td>
                            <td>
                                <button class="btn btn-secondary btn-small" onclick="dashboard.viewGameDetails('${game.gameId}')">
                                    View
                                </button>
                                ${game.status !== 'running' ? `
                                    <button class="btn btn-success btn-small" onclick="dashboard.startGame('${game.gameId}')">
                                        Start
                                    </button>
                                ` : ''}
                                <button class="btn btn-danger btn-small" onclick="dashboard.deleteGame('${game.gameId}')">
                                    Delete
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    updateStatCard(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    // Game Management
    async createGame(formData) {
        try {
            const gameData = {
                gameId: formData.get('gameId'),
                maxPlayers: parseInt(formData.get('maxPlayers')),
                smallBlindAmount: parseInt(formData.get('smallBlindAmount')),
                bigBlindAmount: parseInt(formData.get('bigBlindAmount')),
                turnTimeLimit: parseInt(formData.get('turnTimeLimit')),
                handStartDelay: parseInt(formData.get('handStartDelay')),
                isTournament: formData.get('isTournament') === 'on',
                startSettings: {
                    condition: formData.get('startCondition') || 'minPlayers'
                }
            };

            const response = await fetch('/api/games', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(gameData)
            });

            const result = await response.json();

            if (result.success) {
                this.addLog('info', `Game "${gameData.gameId}" created successfully`);
                document.getElementById('create-game-modal').classList.remove('show');
                document.getElementById('create-game-form').reset();
                await this.refreshData();
            } else {
                throw new Error(result.message || 'Failed to create game');
            }
        } catch (error) {
            this.addLog('error', `Failed to create game: ${error.message}`);
        }
    }

    async startGame(gameId) {
        try {
            const response = await fetch(`/api/games/${gameId}/start`, {
                method: 'POST'
            });
            const result = await response.json();

            if (result.success) {
                this.addLog('info', `Game "${gameId}" started successfully`);
                await this.refreshData();
            } else {
                throw new Error(result.message || 'Failed to start game');
            }
        } catch (error) {
            this.addLog('error', `Failed to start game: ${error.message}`);
        }
    }

    async deleteGame(gameId) {
        if (!confirm(`Are you sure you want to delete game "${gameId}"?`)) {
            return;
        }

        try {
            const response = await fetch(`/api/games/${gameId}`, {
                method: 'DELETE'
            });
            const result = await response.json();

            if (result.success) {
                this.addLog('info', `Game "${gameId}" deleted successfully`);
                await this.refreshData();
            } else {
                throw new Error(result.message || 'Failed to delete game');
            }
        } catch (error) {
            this.addLog('error', `Failed to delete game: ${error.message}`);
        }
    }

    async viewGameDetails(gameId) {
        try {
            // Get game config and current state
            const [configResponse, stateResponse] = await Promise.all([
                fetch(`/api/games/${gameId}`),
                fetch(`/api/games/${gameId}/state`)
            ]);
            
            const configResult = await configResponse.json();
            const stateResult = await stateResponse.json();

            if (configResult.success && stateResult.success) {
                // Merge config and state data
                const gameData = {
                    ...configResult.data,
                    ...stateResult.data
                };
                this.showGameDetailsModal(gameData);
            } else {
                throw new Error('Failed to load game details');
            }
        } catch (error) {
            this.addLog('error', `Failed to load game details: ${error.message}`);
        }
    }

    showGameDetailsModal(game) {
        const modal = document.getElementById('game-details-modal');
        const title = document.getElementById('game-details-title');
        const content = document.getElementById('game-details-content');

        if (!modal || !title || !content) return;

        title.textContent = `Game Details - ${game.gameId}`;
        
        content.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
                <div>
                    <h4>Game Configuration</h4>
                    <div class="info-item">
                        <div class="info-label">Game ID</div>
                        <div class="info-value">${game.gameId}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Max Players</div>
                        <div class="info-value">${game.maxPlayers}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Small Blind</div>
                        <div class="info-value">$${game.smallBlind}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Big Blind</div>
                        <div class="info-value">$${game.bigBlind}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Turn Time Limit</div>
                        <div class="info-value">${game.turnTimeLimit}s</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Type</div>
                        <div class="info-value">${game.isTournament ? 'Tournament' : 'Cash Game'}</div>
                    </div>
                </div>
                <div>
                    <h4>Current State</h4>
                    <div class="info-item">
                        <div class="info-label">Status</div>
                        <div class="info-value">${game.status || 'waiting'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Players</div>
                        <div class="info-value">${game.players.length}/${game.maxPlayers}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Current Phase</div>
                        <div class="info-value">${game.currentPhase || 'N/A'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Pot Size</div>
                        <div class="info-value">$${game.potSize || 0}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Hand Number</div>
                        <div class="info-value">${game.handNumber || 0}</div>
                    </div>
                </div>
            </div>
            
            ${game.players.length > 0 ? `
                <div style="margin-top: 2rem;">
                    <h4>Players</h4>
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Player ID</th>
                                <th>Name</th>
                                <th>Chips</th>
                                <th>Position</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${game.players.map(player => `
                                <tr>
                                    <td>${player.id}</td>
                                    <td>${player.name}</td>
                                    <td>$${player.chipStack}</td>
                                    <td>${player.position}</td>
                                    <td>${player.isActive ? 'Active' : 'Inactive'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : ''}
        `;

        modal.classList.add('show');
    }

    // Event Handling
    handleGameEvent(data) {
        // Handle real-time game events from WebSocket
        this.addLog('info', `Game event: ${data.event?.type || 'unknown'}`);
        
        // Refresh relevant data
        if (this.autoRefresh) {
            this.refreshData();
        }
    }

    // Logging
    addLog(level, message) {
        const timestamp = new Date().toISOString();
        const logEntry = { level, message, timestamp };
        
        this.logs.unshift(logEntry);
        
        // Keep only last 100 logs
        if (this.logs.length > 100) {
            this.logs = this.logs.slice(0, 100);
        }
        
        this.updateLogsDisplay();
    }

    updateLogsDisplay() {
        const logsContainer = document.getElementById('system-logs-list');
        if (!logsContainer) return;

        const logLevel = document.getElementById('log-level')?.value || 'all';
        const filteredLogs = logLevel === 'all' 
            ? this.logs 
            : this.logs.filter(log => log.level === logLevel);

        if (filteredLogs.length === 0) {
            logsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-file-alt"></i>
                    <h3>No Logs</h3>
                    <p>No logs match the current filter</p>
                </div>
            `;
            return;
        }

        logsContainer.innerHTML = filteredLogs.map(log => `
            <div class="log-entry ${log.level}">
                <span class="log-timestamp">${new Date(log.timestamp).toLocaleTimeString()}</span>
                ${log.message}
            </div>
        `).join('');
    }

    clearLogs() {
        this.logs = [];
        this.updateLogsDisplay();
    }

    // Auto Refresh
    startAutoRefresh() {
        this.stopAutoRefresh();
        this.refreshInterval = setInterval(() => {
            if (this.autoRefresh && this.isConnected) {
                this.refreshData();
            }
        }, 5000); // Refresh every 5 seconds
    }

    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }
}

// Initialize dashboard when page loads
let dashboard;
document.addEventListener('DOMContentLoaded', () => {
    dashboard = new PokaiDashboard();
});

// Make dashboard globally available for onclick handlers
window.dashboard = dashboard;