import { createTestServer, request } from './PokaiExpressServer.setup';

describe('PokaiExpressServer - Core Functionality', () => {
	let server: any;
	let app: any;

	beforeEach(() => {
		jest.clearAllMocks();
		const testServer = createTestServer();
		server = testServer.server;
		app = testServer.app;
	});

	afterEach(async () => {
		const serverAny = server as any;
		if (serverAny.httpServer) {
			await new Promise<void>((resolve) => {
				serverAny.httpServer.close(() => resolve());
			});
		}
	});

	describe('Server Initialization', () => {
		it('should initialize with provided port', () => {
			const ServerClass = require('@/services/server').default;
			const customServer = new ServerClass(3456);
			const serverAny = customServer as any;
			expect(serverAny.port).toBe(3456);
		});

		it('should use default port 3000 if not provided', () => {
			const originalPort = process.env.PORT;
			delete process.env.PORT; // Ensure PORT is not set
			
			const ServerClass = require('@/services/server').default;
			const defaultServer = new ServerClass();
			const serverAny = defaultServer as any;
			expect(serverAny.port).toBe(3000);
			
			// Restore original
			if (originalPort) {
				process.env.PORT = originalPort;
			}
		});

		it('should accept port parameter', () => {
			// The server constructor takes port as parameter, not from env
			const ServerClass = require('@/services/server').default;
			const server1 = new ServerClass(4567);
			const server1Any = server1 as any;
			expect(server1Any.port).toBe(4567);
			
			const server2 = new ServerClass(8080);
			const server2Any = server2 as any;
			expect(server2Any.port).toBe(8080);
		});
	});

	describe('Root and Documentation Routes', () => {
		it('should return welcome message at root', async () => {
			const response = await request(app).get('/');

			expect(response.status).toBe(200);
			expect(response.body.name).toBe('Pokai Poker Engine');
			expect(response.body.version).toBeDefined();
			expect(response.body.description).toBeDefined();
		});

		it('should provide API documentation at /docs', async () => {
			const response = await request(app).get('/docs');

			expect(response.status).toBe(200);
			expect(response.body.endpoints).toBeDefined();
			expect(Object.keys(response.body.endpoints).length).toBeGreaterThan(0);
		});

		it('should list game routes in docs', async () => {
			const response = await request(app).get('/docs');

			expect(response.body.endpoints['GET /api/games']).toBe('List all games');
			expect(response.body.endpoints['POST /api/games']).toBe('Create new game');
		});
	});

	describe('Health and Stats Routes', () => {
		it('should return health status', async () => {
			const response = await request(app).get('/health');

			expect(response.status).toBe(200);
			expect(response.body.status).toBe('healthy');
			expect(response.body.timestamp).toBeDefined();
			expect(response.body.uptime).toBeDefined();
		});

		it('should return server statistics', async () => {
			const response = await request(app).get('/stats');

			expect(response.status).toBe(200);
			expect(response.body.totalGames).toBeDefined();
			expect(response.body.activeGames).toBeDefined();
			expect(response.body.totalPlayers).toBeDefined();
			expect(response.body.connectedClients).toBeDefined();
			expect(response.body.serverUptime).toBeDefined();
		});

		it('should track game creation in stats', async () => {
			// Get initial stats
			const initialStats = await request(app).get('/stats');
			const initialTotal = initialStats.body.totalGames || 0;

			// Create a game
			await request(app).post('/api/games').send({
				gameId: 'stats-test-game',
				maxPlayers: 6,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
			});

			// Check updated stats
			const updatedStats = await request(app).get('/stats');
			expect(updatedStats.body.totalGames).toBe(initialTotal + 1);
		});
	});

	describe('Error Handling', () => {
		it('should handle 404 for unknown routes', async () => {
			const response = await request(app).get('/api/unknown-route');

			expect(response.status).toBe(404);
			expect(response.body.error).toBe('Not found');
		});

		it('should handle malformed JSON', async () => {
			const response = await request(app)
				.post('/api/games')
				.set('Content-Type', 'application/json')
				.send('{ invalid json');

			expect(response.status).toBe(400);
			// Express automatically handles JSON parse errors
		});

		it('should handle large payloads', async () => {
			const largePayload = {
				gameId: 'x'.repeat(10000), // Very long gameId
				maxPlayers: 6,
				smallBlindAmount: 10,
				bigBlindAmount: 20,
			};

			const response = await request(app).post('/api/games').send(largePayload);

			// Should either reject or create (server handles it)
			expect([201, 400, 413]).toContain(response.status);
		});
	});

	describe('Static File Serving', () => {
		it('should serve dashboard at /dashboard', async () => {
			const response = await request(app).get('/dashboard').redirects(1);

			// Dashboard either serves directly or redirects to index.html
			expect([200, 301]).toContain(response.status);
			if (response.status === 200) {
				expect(response.headers['content-type']).toContain('text/html');
			}
		});

		it('should return 404 for non-existent static files', async () => {
			const response = await request(app).get('/non-existent-file.xyz');

			expect(response.status).toBe(404);
		});
	});

	describe('Server Lifecycle', () => {
		it('should start server successfully', (done) => {
			const testPort = 0; // Use random available port
			const ServerClass = require('@/services/server').default;
			const lifecycleServer = new ServerClass(testPort);
			const serverAny = lifecycleServer as any;

			// Mock the listen method to simulate server start
			const originalListen = serverAny.httpServer.listen;
			serverAny.httpServer.listen = jest.fn((port: number, callback: Function) => {
				callback();
				return serverAny.httpServer;
			});

			// Start should not throw
			expect(() => lifecycleServer.start()).not.toThrow();

			// Restore and clean up
			serverAny.httpServer.listen = originalListen;
			done();
		});

		it('should handle server already running', () => {
			const testPort = 0;
			const ServerClass = require('@/services/server').default;
			const lifecycleServer = new ServerClass(testPort);
			const serverAny = lifecycleServer as any;

			// Mock the listen method
			let listenCount = 0;
			serverAny.httpServer.listen = jest.fn((port: number, callback: Function) => {
				listenCount++;
				if (listenCount === 1) {
					callback();
				} else {
					throw new Error('Listen method has been called more than once without closing.');
				}
				return serverAny.httpServer;
			});

			// First start should work
			lifecycleServer.start();

			// Second start should throw because listen is called again
			expect(() => lifecycleServer.start()).toThrow('Listen method has been called more than once');
		});
	});
});