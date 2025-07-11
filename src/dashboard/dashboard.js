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
        this.replays = new Map();
        this.currentReplay = null;
        this.replayPlayer = null;
        
        this.init();
    }

    init() {
        this.connectWebSocket();
        this.setupEventListeners();
        this.setupReplayEventListeners();
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

        // Refresh replays button
        const refreshReplaysBtn = document.getElementById('refresh-replays-btn');
        if (refreshReplaysBtn) {
            refreshReplaysBtn.addEventListener('click', () => {
                this.loadReplays();
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
                this.updateActiveGames(),
                this.loadReplays()
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

    // Replay System Methods
    async loadReplays() {
        try {
            const response = await fetch('/api/replays');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            if (result.success && result.data) {
                this.replays.clear();
                result.data.forEach(replay => {
                    // Extract gameId from filename 
                    const gameId = replay.filename.split('_')[0];
                    const replayData = {
                        gameId: gameId,
                        filename: replay.filename,
                        path: replay.path,
                        timestamp: this.extractTimestampFromFilename(replay.filename),
                        // Set default values for display
                        handsPlayed: 0,
                        totalActions: 0,
                        playerCount: 0,
                        duration: 0
                    };
                    this.replays.set(gameId, replayData);
                });
                
                this.addLog('info', `Loaded ${result.data.length} replays`);
                this.updateReplaysDisplay();
                
                // Load detailed metadata for each replay
                this.loadReplayMetadata();
            } else {
                this.addLog('error', `Invalid replay API response: ${result.error || 'Unknown error'}`);
            }
        } catch (error) {
            this.addLog('error', `Failed to load replays: ${error.message}`);
        }
    }

    extractTimestampFromFilename(filename) {
        // Extract timestamp from filename format: replay-demo-1752252712373_2025-07-11T16-51-52-385Z.json
        const parts = filename.split('_');
        if (parts.length > 1) {
            const timestampPart = parts[1].replace('.json', '');
            try {
                return new Date(timestampPart).getTime();
            } catch (error) {
                return Date.now();
            }
        }
        return Date.now();
    }

    async loadReplayMetadata() {
        // Load detailed metadata for each replay to show better statistics
        const replayIds = Array.from(this.replays.keys());
        
        for (const gameId of replayIds) {
            try {
                const replay = this.replays.get(gameId);
                if (!replay) continue;
                
                // Load replay file directly from the file path
                const response = await fetch(`/${replay.path}`);
                if (response.ok) {
                    const replayFileData = await response.json();
                    if (replayFileData && replayFileData.events) {
                        // Count events and extract metadata
                        const events = replayFileData.events || [];
                        const playerActions = events.filter(e => e.type === 'player_action');
                        const handEvents = events.filter(e => e.type === 'hand_completed');
                        
                        // Get unique players from events
                        const playerIds = new Set();
                        events.forEach(event => {
                            if (event.playerId) playerIds.add(event.playerId);
                            if (event.gameState?.players) {
                                event.gameState.players.forEach(p => playerIds.add(p.id));
                            }
                        });
                        
                        // Calculate duration
                        const startTime = events[0]?.timestamp || 0;
                        const endTime = events[events.length - 1]?.timestamp || 0;
                        const duration = endTime - startTime;
                        
                        // Update with actual metadata
                        replay.handsPlayed = handEvents.length;
                        replay.totalActions = playerActions.length;
                        replay.playerCount = playerIds.size;
                        replay.duration = duration;
                        replay.events = events; // Store events for later use
                        this.replays.set(gameId, replay);
                    }
                }
            } catch (error) {
                console.warn(`Failed to load metadata for replay ${gameId}:`, error);
            }
        }
        
        // Update display with new metadata
        this.updateReplaysDisplay();
    }

    updateReplaysDisplay() {
        const replaysContainer = document.getElementById('replays-list');
        if (!replaysContainer) return;

        const replays = Array.from(this.replays.values());

        if (replays.length === 0) {
            replaysContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-play-circle"></i>
                    <h3>No Replays Found</h3>
                    <p>Play some games to generate replay data</p>
                </div>
            `;
            return;
        }

        replaysContainer.innerHTML = replays.map(replay => `
            <div class="replay-item" data-game-id="${replay.gameId}">
                <div class="replay-item-header">
                    <div class="replay-game-id">${replay.gameId}</div>
                    <div class="replay-date">${new Date(replay.timestamp || Date.now()).toLocaleString()}</div>
                </div>
                <div class="replay-stats">
                    <div class="replay-stat">
                        <div class="replay-stat-value">${replay.handsPlayed || 0}</div>
                        <div class="replay-stat-label">Hands</div>
                    </div>
                    <div class="replay-stat">
                        <div class="replay-stat-value">${replay.totalActions || 0}</div>
                        <div class="replay-stat-label">Actions</div>
                    </div>
                    <div class="replay-stat">
                        <div class="replay-stat-value">${replay.playerCount || 0}</div>
                        <div class="replay-stat-label">Players</div>
                    </div>
                    <div class="replay-stat">
                        <div class="replay-stat-value">${Math.round((replay.duration || 0) / 1000)}s</div>
                        <div class="replay-stat-label">Duration</div>
                    </div>
                </div>
                <div class="replay-actions">
                    <button class="btn btn-primary btn-small" onclick="dashboard.openReplayViewer('${replay.gameId}')">
                        <i class="fas fa-play"></i> View Replay
                    </button>
                    <button class="btn btn-secondary btn-small" onclick="dashboard.analyzeReplay('${replay.gameId}')">
                        <i class="fas fa-chart-bar"></i> Analyze
                    </button>
                    <button class="btn btn-success btn-small" onclick="dashboard.exportReplay('${replay.gameId}')">
                        <i class="fas fa-download"></i> Export
                    </button>
                    <button class="btn btn-danger btn-small" onclick="dashboard.deleteReplay('${replay.gameId}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </div>
        `).join('');
    }

    async openReplayViewer(gameId) {
        try {
            const replay = this.replays.get(gameId);
            if (!replay) {
                throw new Error(`Replay not found: ${gameId}`);
            }

            // If we already have the events cached, use them
            if (replay.events) {
                this.currentReplay = {
                    gameId: gameId,
                    events: replay.events,
                    metadata: {
                        handsPlayed: replay.handsPlayed,
                        totalActions: replay.totalActions,
                        playerCount: replay.playerCount,
                        duration: replay.duration
                    },
                    analysis: this.generateBasicAnalysis(replay.events)
                };
                this.showReplayViewer();
                this.initializeReplayPlayer();
                return;
            }

            // Load replay file directly from the file path
            const response = await fetch(`/${replay.path}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const replayFileData = await response.json();
            
            if (replayFileData && replayFileData.events) {
                this.currentReplay = {
                    gameId: gameId,
                    events: replayFileData.events || [],
                    metadata: {
                        handsPlayed: replay.handsPlayed || 0,
                        totalActions: replay.totalActions || 0,
                        playerCount: replay.playerCount || 0,
                        duration: replay.duration || 0
                    },
                    analysis: this.generateBasicAnalysis(replayFileData.events || [])
                };
                this.showReplayViewer();
                this.initializeReplayPlayer();
            } else {
                throw new Error('Invalid replay file format');
            }
        } catch (error) {
            this.addLog('error', `Failed to open replay viewer: ${error.message}`);
        }
    }

    generateBasicAnalysis(events) {
        if (!events || events.length === 0) {
            return {
                hands: [],
                players: [],
                interestingMoments: [],
                averageHandDuration: 0,
                mostCommonAction: 'N/A'
            };
        }

        // Count action types
        const actionCounts = {};
        const playerActions = events.filter(e => e.type === 'player_action');
        playerActions.forEach(event => {
            const action = event.action?.type || 'unknown';
            actionCounts[action] = (actionCounts[action] || 0) + 1;
        });

        const mostCommonAction = Object.entries(actionCounts)
            .sort(([,a], [,b]) => b - a)[0]?.[0] || 'N/A';

        // Basic hand analysis
        const handEvents = events.filter(e => e.type === 'hand_completed');
        const hands = handEvents.map((event, index) => ({
            handNumber: index + 1,
            winner: event.winner || 'Unknown',
            finalPot: event.pot || 0,
            duration: 30, // Default duration
            actionCount: 5 // Default action count
        }));

        // Basic player analysis
        const playerIds = new Set();
        events.forEach(event => {
            if (event.playerId) playerIds.add(event.playerId);
        });

        const players = Array.from(playerIds).map(playerId => ({
            name: playerId,
            handsPlayed: hands.length,
            totalActions: playerActions.filter(e => e.playerId === playerId).length,
            startingChips: 1000, // Default
            finalChips: 1000, // Default
            vpip: 0.3, // Default
            pfr: 0.2 // Default
        }));

        return {
            hands,
            players,
            interestingMoments: [],
            averageHandDuration: hands.length > 0 ? 30 : 0,
            mostCommonAction
        };
    }

    showReplayViewer() {
        const modal = document.getElementById('replay-viewer-modal');
        const title = document.getElementById('replay-viewer-title');
        
        if (!modal || !title || !this.currentReplay) return;

        title.textContent = `Game Replay - ${this.currentReplay.gameId}`;
        modal.classList.add('show');
    }

    initializeReplayPlayer() {
        if (!this.currentReplay) return;

        // Initialize replay player state
        this.replayPlayer = {
            currentEventIndex: 0,
            isPlaying: false,
            playbackSpeed: 1,
            events: this.currentReplay.events || [],
            metadata: this.currentReplay.metadata || {},
            analysis: this.currentReplay.analysis || {}
        };

        // Update UI elements
        this.updateReplayProgress();
        this.updateGameStateDisplay();
        this.updateReplayAnalysis();
        
        // Set up event listeners if not already done
        this.setupReplayEventListeners();
    }

    setupReplayEventListeners() {
        // Replay control buttons
        const playPauseBtn = document.getElementById('replay-play-pause');
        const stepBackBtn = document.getElementById('replay-step-back');
        const stepForwardBtn = document.getElementById('replay-step-forward');
        const restartBtn = document.getElementById('replay-restart');
        const speedSelect = document.getElementById('replay-speed');
        const progressSlider = document.getElementById('progress-slider');
        const closeReplayBtn = document.getElementById('close-replay-modal');

        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', () => this.toggleReplayPlayback());
        }

        if (stepBackBtn) {
            stepBackBtn.addEventListener('click', () => this.stepReplayBackward());
        }

        if (stepForwardBtn) {
            stepForwardBtn.addEventListener('click', () => this.stepReplayForward());
        }

        if (restartBtn) {
            restartBtn.addEventListener('click', () => this.restartReplay());
        }

        if (speedSelect) {
            speedSelect.addEventListener('change', (e) => {
                if (this.replayPlayer) {
                    this.replayPlayer.playbackSpeed = parseFloat(e.target.value);
                }
            });
        }

        if (progressSlider) {
            progressSlider.addEventListener('input', (e) => this.seekToProgress(e.target.value));
        }

        if (closeReplayBtn) {
            closeReplayBtn.addEventListener('click', () => {
                this.closeReplayViewer();
            });
        }

        // Analysis tab buttons
        const tabButtons = document.querySelectorAll('.tab-button');
        tabButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                this.switchAnalysisTab(e.target.dataset.tab);
            });
        });
    }

    toggleReplayPlayback() {
        if (!this.replayPlayer) return;

        this.replayPlayer.isPlaying = !this.replayPlayer.isPlaying;
        
        const playPauseBtn = document.getElementById('replay-play-pause');
        if (playPauseBtn) {
            const icon = playPauseBtn.querySelector('i');
            if (this.replayPlayer.isPlaying) {
                icon.className = 'fas fa-pause';
                this.startReplayPlayback();
            } else {
                icon.className = 'fas fa-play';
                this.stopReplayPlayback();
            }
        }
    }

    startReplayPlayback() {
        if (!this.replayPlayer || !this.replayPlayer.isPlaying) return;

        const playbackInterval = setInterval(() => {
            if (!this.replayPlayer.isPlaying) {
                clearInterval(playbackInterval);
                return;
            }

            if (this.replayPlayer.currentEventIndex >= this.replayPlayer.events.length - 1) {
                this.replayPlayer.isPlaying = false;
                const playPauseBtn = document.getElementById('replay-play-pause');
                if (playPauseBtn) {
                    playPauseBtn.querySelector('i').className = 'fas fa-play';
                }
                clearInterval(playbackInterval);
                return;
            }

            this.stepReplayForward();
        }, 1000 / this.replayPlayer.playbackSpeed);
    }

    stopReplayPlayback() {
        if (this.replayPlayer) {
            this.replayPlayer.isPlaying = false;
        }
    }

    stepReplayForward() {
        if (!this.replayPlayer) return;
        
        if (this.replayPlayer.currentEventIndex < this.replayPlayer.events.length - 1) {
            this.replayPlayer.currentEventIndex++;
            this.updateReplayProgress();
            this.updateGameStateDisplay();
        }
    }

    stepReplayBackward() {
        if (!this.replayPlayer) return;
        
        if (this.replayPlayer.currentEventIndex > 0) {
            this.replayPlayer.currentEventIndex--;
            this.updateReplayProgress();
            this.updateGameStateDisplay();
        }
    }

    restartReplay() {
        if (!this.replayPlayer) return;
        
        this.replayPlayer.currentEventIndex = 0;
        this.replayPlayer.isPlaying = false;
        
        const playPauseBtn = document.getElementById('replay-play-pause');
        if (playPauseBtn) {
            playPauseBtn.querySelector('i').className = 'fas fa-play';
        }
        
        this.updateReplayProgress();
        this.updateGameStateDisplay();
    }

    seekToProgress(progressPercent) {
        if (!this.replayPlayer) return;
        
        const targetIndex = Math.floor((progressPercent / 100) * (this.replayPlayer.events.length - 1));
        this.replayPlayer.currentEventIndex = Math.max(0, Math.min(targetIndex, this.replayPlayer.events.length - 1));
        
        this.updateReplayProgress();
        this.updateGameStateDisplay();
    }

    updateReplayProgress() {
        if (!this.replayPlayer) return;

        const currentEvent = document.getElementById('current-event');
        const totalEvents = document.getElementById('total-events');
        const progressBar = document.getElementById('progress-bar');
        const progressSlider = document.getElementById('progress-slider');

        const current = this.replayPlayer.currentEventIndex + 1;
        const total = this.replayPlayer.events.length;
        const progressPercent = total > 0 ? (current / total) * 100 : 0;

        if (currentEvent) currentEvent.textContent = current;
        if (totalEvents) totalEvents.textContent = total;
        if (progressBar) progressBar.style.width = `${progressPercent}%`;
        if (progressSlider) progressSlider.value = progressPercent;
    }

    updateGameStateDisplay() {
        if (!this.replayPlayer || this.replayPlayer.events.length === 0) return;

        const currentEvent = this.replayPlayer.events[this.replayPlayer.currentEventIndex];
        if (!currentEvent) return;

        // The gameState is in the event.gameState field, not gameStateAfter
        const gameState = currentEvent.gameState || currentEvent.gameStateAfter;

        // Update hand info
        const currentHand = document.getElementById('current-hand');
        const currentPhase = document.getElementById('current-phase');
        const currentPot = document.getElementById('current-pot');

        if (currentHand) currentHand.textContent = gameState.handNumber || 1;
        if (currentPhase) currentPhase.textContent = gameState.phase || 'Pre-Flop';
        if (currentPot) currentPot.textContent = gameState.potManager?.totalPot || 0;

        // Update community cards
        this.updateCommunityCards(gameState.communityCards || []);

        // Update players
        this.updatePlayersDisplay(gameState.players || []);

        // Update action log
        this.updateActionLog(currentEvent);
    }

    updateCommunityCards(cards) {
        const communityCardsContainer = document.getElementById('community-cards');
        if (!communityCardsContainer) return;

        // Show placeholders for 5 cards
        const cardElements = [];
        for (let i = 0; i < 5; i++) {
            const card = cards[i];
            if (card) {
                const suitClass = card.suit.toLowerCase();
                cardElements.push(`
                    <div class="card ${suitClass}">
                        ${card.rank}${card.suit === 'HEARTS' ? '♥' : card.suit === 'DIAMONDS' ? '♦' : card.suit === 'CLUBS' ? '♣' : '♠'}
                    </div>
                `);
            } else {
                cardElements.push('<div class="card card-placeholder">?</div>');
            }
        }

        communityCardsContainer.innerHTML = cardElements.join('');
    }

    updatePlayersDisplay(players) {
        const playersContainer = document.getElementById('players-display');
        if (!playersContainer) return;

        // Ensure we show up to 6 player seats
        const seats = [];
        for (let i = 0; i < Math.max(6, players.length); i++) {
            const player = players[i];
            if (player) {
                const isActive = player.isActive || false;
                const isFolded = player.hasActed && player.lastAction === 'FOLD';
                const isCurrentTurn = player.isCurrentTurn || false;
                
                let seatClasses = 'player-seat';
                if (isActive) seatClasses += ' active';
                if (isFolded) seatClasses += ' folded';
                if (isCurrentTurn) seatClasses += ' current-turn';

                seats.push(`
                    <div class="${seatClasses}">
                        <div class="player-name">${player.name}</div>
                        <div class="player-chips">$${player.chipStack}</div>
                        ${player.currentBet > 0 ? `<div class="player-bet">Bet: $${player.currentBet}</div>` : ''}
                        ${player.lastAction ? `<div class="player-action">${player.lastAction}</div>` : ''}
                    </div>
                `);
            } else {
                seats.push(`
                    <div class="player-seat">
                        <div class="player-name">Empty</div>
                        <div class="player-chips">-</div>
                    </div>
                `);
            }
        }

        playersContainer.innerHTML = seats.join('');
    }

    updateActionLog(currentEvent) {
        const actionLog = document.getElementById('action-log');
        if (!actionLog) return;

        // Get recent events for context
        const startIndex = Math.max(0, this.replayPlayer.currentEventIndex - 10);
        const endIndex = this.replayPlayer.currentEventIndex + 1;
        const recentEvents = this.replayPlayer.events.slice(startIndex, endIndex);

        const actionEntries = recentEvents.map((event, index) => {
            const isCurrent = startIndex + index === this.replayPlayer.currentEventIndex;
            const actionType = this.getActionType(event);
            
            return `
                <div class="action-entry ${actionType} ${isCurrent ? 'current' : ''}">
                    ${this.formatEventDescription(event)}
                </div>
            `;
        });

        actionLog.innerHTML = actionEntries.join('');
        
        // Scroll to bottom
        actionLog.scrollTop = actionLog.scrollHeight;
    }

    getActionType(event) {
        if (!event.type) return 'system';
        
        const type = event.type.toLowerCase();
        if (type.includes('fold')) return 'fold';
        if (type.includes('call')) return 'call';
        if (type.includes('raise') || type.includes('bet')) return 'raise';
        if (type.includes('check')) return 'check';
        return 'system';
    }

    formatEventDescription(event) {
        if (!event.type) return 'Unknown event';
        
        // Format event description based on type
        switch (event.type) {
            case 'player_action':
                return `${event.playerId}: ${event.action?.type || 'action'} ${event.action?.amount ? `$${event.action.amount}` : ''}`;
            case 'hand_started':
                return `Hand #${event.handNumber || 1} started`;
            case 'hand_completed':
                return `Hand completed - Winner: ${event.winner || 'Unknown'}`;
            case 'phase_change':
                return `Phase changed to ${event.newPhase || event.phase}`;
            case 'cards_dealt':
                return `Cards dealt: ${event.cardType || 'community'}`;
            case 'game_started':
                return 'Game started';
            case 'player_joined':
                return `Player ${event.playerId} joined`;
            case 'player_left':
                return `Player ${event.playerId} left`;
            default:
                return event.type.replace(/_/g, ' ').toLowerCase();
        }
    }

    updateReplayAnalysis() {
        if (!this.replayPlayer) return;

        // Update overview tab
        this.updateAnalysisOverview();
        
        // Update hands tab
        this.updateAnalysisHands();
        
        // Update players tab
        this.updateAnalysisPlayers();
        
        // Update decisions tab
        this.updateAnalysisDecisions();
    }

    updateAnalysisOverview() {
        const overviewContainer = document.getElementById('game-overview');
        if (!overviewContainer) return;

        const metadata = this.replayPlayer.metadata;
        const analysis = this.replayPlayer.analysis;

        overviewContainer.innerHTML = `
            <div class="analysis-grid">
                <div class="analysis-stat">
                    <div class="analysis-stat-value">${metadata.handsPlayed || 0}</div>
                    <div class="analysis-stat-label">Hands Played</div>
                </div>
                <div class="analysis-stat">
                    <div class="analysis-stat-value">${metadata.totalActions || 0}</div>
                    <div class="analysis-stat-label">Total Actions</div>
                </div>
                <div class="analysis-stat">
                    <div class="analysis-stat-value">${metadata.playerCount || 0}</div>
                    <div class="analysis-stat-label">Players</div>
                </div>
                <div class="analysis-stat">
                    <div class="analysis-stat-value">${Math.round((metadata.duration || 0) / 1000)}s</div>
                    <div class="analysis-stat-label">Duration</div>
                </div>
                <div class="analysis-stat">
                    <div class="analysis-stat-value">${analysis.averageHandDuration || 0}s</div>
                    <div class="analysis-stat-label">Avg Hand Time</div>
                </div>
                <div class="analysis-stat">
                    <div class="analysis-stat-value">${analysis.mostCommonAction || 'N/A'}</div>
                    <div class="analysis-stat-label">Most Common Action</div>
                </div>
            </div>
        `;
    }

    updateAnalysisHands() {
        const handsContainer = document.getElementById('hands-breakdown');
        if (!handsContainer) return;

        const analysis = this.replayPlayer.analysis;
        const hands = analysis.hands || [];

        if (hands.length === 0) {
            handsContainer.innerHTML = '<p>No hand data available</p>';
            return;
        }

        const handsList = hands.map((hand, index) => `
            <div class="hand-summary" onclick="dashboard.seekToHand(${index})">
                <div class="hand-summary-header">
                    <div class="hand-number">Hand #${index + 1}</div>
                    <div class="hand-winner">Winner: ${hand.winner || 'Unknown'}</div>
                </div>
                <div class="hand-summary-info">
                    Pot: $${hand.finalPot || 0} | Duration: ${hand.duration || 0}s | Actions: ${hand.actionCount || 0}
                </div>
            </div>
        `).join('');

        handsContainer.innerHTML = `<div class="hands-list">${handsList}</div>`;
    }

    updateAnalysisPlayers() {
        const playersContainer = document.getElementById('player-stats');
        if (!playersContainer) return;

        const analysis = this.replayPlayer.analysis;
        const players = analysis.players || [];

        if (players.length === 0) {
            playersContainer.innerHTML = '<p>No player data available</p>';
            return;
        }

        const playerCards = players.map(player => {
            const profit = player.finalChips - player.startingChips;
            const profitClass = profit >= 0 ? 'positive' : 'negative';
            
            return `
                <div class="player-stat-card">
                    <div class="player-stat-header">
                        <div class="player-stat-name">${player.name}</div>
                        <div class="player-stat-profit ${profitClass}">
                            ${profit >= 0 ? '+' : ''}$${profit}
                        </div>
                    </div>
                    <div class="player-stat-metrics">
                        <div class="player-metric">
                            <div class="player-metric-value">${player.handsPlayed || 0}</div>
                            <div class="player-metric-label">Hands</div>
                        </div>
                        <div class="player-metric">
                            <div class="player-metric-value">${Math.round((player.vpip || 0) * 100)}%</div>
                            <div class="player-metric-label">VPIP</div>
                        </div>
                        <div class="player-metric">
                            <div class="player-metric-value">${Math.round((player.pfr || 0) * 100)}%</div>
                            <div class="player-metric-label">PFR</div>
                        </div>
                        <div class="player-metric">
                            <div class="player-metric-value">${player.totalActions || 0}</div>
                            <div class="player-metric-label">Actions</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        playersContainer.innerHTML = `<div class="player-stats-grid">${playerCards}</div>`;
    }

    updateAnalysisDecisions() {
        const decisionsContainer = document.getElementById('decision-analysis');
        if (!decisionsContainer) return;

        const analysis = this.replayPlayer.analysis;
        const interestingMoments = analysis.interestingMoments || [];

        if (interestingMoments.length === 0) {
            decisionsContainer.innerHTML = '<p>No interesting decisions identified</p>';
            return;
        }

        const moments = interestingMoments.map(moment => `
            <div class="decision-moment" onclick="dashboard.seekToEvent(${moment.eventIndex})">
                <div class="decision-header">
                    <strong>${moment.type}</strong> - ${moment.player}
                </div>
                <div class="decision-description">
                    ${moment.description}
                </div>
                <div class="decision-context">
                    Pot Odds: ${moment.potOdds}% | Stack: $${moment.stackSize}
                </div>
            </div>
        `).join('');

        decisionsContainer.innerHTML = moments;
    }

    switchAnalysisTab(tabName) {
        // Remove active class from all tabs and panes
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));

        // Add active class to selected tab and pane
        const selectedTab = document.querySelector(`[data-tab="${tabName}"]`);
        const selectedPane = document.getElementById(`analysis-${tabName}`);

        if (selectedTab) selectedTab.classList.add('active');
        if (selectedPane) selectedPane.classList.add('active');
    }

    seekToHand(handIndex) {
        if (!this.replayPlayer) return;
        
        // Find the event index for the start of this hand
        const targetEvent = this.replayPlayer.events.find(event => 
            event.type === 'HAND_STARTED' && (event.handNumber - 1) === handIndex
        );
        
        if (targetEvent) {
            const eventIndex = this.replayPlayer.events.indexOf(targetEvent);
            this.replayPlayer.currentEventIndex = eventIndex;
            this.updateReplayProgress();
            this.updateGameStateDisplay();
        }
    }

    seekToEvent(eventIndex) {
        if (!this.replayPlayer) return;
        
        this.replayPlayer.currentEventIndex = Math.max(0, Math.min(eventIndex, this.replayPlayer.events.length - 1));
        this.updateReplayProgress();
        this.updateGameStateDisplay();
    }

    closeReplayViewer() {
        this.stopReplayPlayback();
        const modal = document.getElementById('replay-viewer-modal');
        if (modal) {
            modal.classList.remove('show');
        }
        this.currentReplay = null;
        this.replayPlayer = null;
    }

    async analyzeReplay(gameId) {
        try {
            const replay = this.replays.get(gameId);
            if (!replay) {
                throw new Error(`Replay not found: ${gameId}`);
            }

            const filenameWithoutExt = replay.filename.replace('.json', '');
            const response = await fetch(`/api/replays/${filenameWithoutExt}/analysis`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            if (result.success) {
                this.addLog('info', `Analysis completed for replay ${gameId}`);
                console.log('Replay Analysis:', result.data);
            } else {
                throw new Error(result.error || 'Analysis failed');
            }
        } catch (error) {
            this.addLog('error', `Failed to analyze replay: ${error.message}`);
        }
    }

    async exportReplay(gameId) {
        try {
            const replay = this.replays.get(gameId);
            if (!replay) {
                throw new Error(`Replay not found: ${gameId}`);
            }

            const filenameWithoutExt = replay.filename.replace('.json', '');
            const response = await fetch(`/api/replays/${filenameWithoutExt}/export`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = replay.filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            this.addLog('info', `Replay ${gameId} exported successfully`);
        } catch (error) {
            this.addLog('error', `Failed to export replay: ${error.message}`);
        }
    }

    async deleteReplay(gameId) {
        if (!confirm(`Are you sure you want to delete replay "${gameId}"?`)) {
            return;
        }

        try {
            const replay = this.replays.get(gameId);
            if (!replay) {
                throw new Error(`Replay not found: ${gameId}`);
            }

            const filenameWithoutExt = replay.filename.replace('.json', '');
            const response = await fetch(`/api/replays/${filenameWithoutExt}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                this.addLog('info', `Replay ${gameId} deleted successfully`);
                this.replays.delete(gameId);
                this.updateReplaysDisplay();
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            this.addLog('error', `Failed to delete replay: ${error.message}`);
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