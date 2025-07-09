# Express HTTP Server for Bot Development

The Pokai Poker Engine provides a comprehensive HTTP server built with Express that makes it easy for bot developers to create poker bots using both REST APIs and WebSocket connections.

## Features

- **REST API** for game management and discovery
- **WebSocket integration** for real-time gameplay
- **Comprehensive documentation** with examples
- **CORS support** for web-based bots
- **Error handling** with detailed error messages
- **Health monitoring** and statistics

## Quick Start

### 1. Start the Server

For the original Socket.IO server:
```bash
npm run dev
```

For the Express server with REST API:
```bash
npm run dev:express
```

The server will start on `http://localhost:3000` with the following endpoints available:

- **Health Check**: `GET /health`
- **Server Stats**: `GET /stats`
- **API Documentation**: `GET /docs`
- **Code Examples**: `GET /docs/examples`

### 2. Create a Game

```bash
curl -X POST http://localhost:3000/api/games \
  -H "Content-Type: application/json" \
  -d '{
    "gameId": "my-game",
    "maxPlayers": 4,
    "smallBlindAmount": 10,
    "bigBlindAmount": 20,
    "turnTimeLimit": 30
  }'
```

### 3. Connect Your Bot

```javascript
const io = require('socket.io-client');
const socket = io('http://localhost:3000');

// Join the game
socket.emit('identify', {
    botName: 'MyBot',
    gameId: 'my-game',
    chipStack: 1000
});

// Listen for your turn
socket.on('turnStart', (data) => {
    // Submit an action
    socket.emit('action', {
        type: 'call',
        playerId: data.playerId,
        timestamp: Date.now()
    });
});
```

## REST API Endpoints

### Game Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/games` | List all games |
| `POST` | `/api/games` | Create a new game |
| `GET` | `/api/games/available` | Find available games |
| `GET` | `/api/games/:gameId` | Get game information |
| `POST` | `/api/games/:gameId/start` | Start a hand in game |

### Player Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/games/:gameId/can-join/:playerId` | Check if player can join |
| `GET` | `/api/games/:gameId/players/:playerId/state` | Get player's game state |
| `GET` | `/api/games/:gameId/players/:playerId/actions` | Get possible actions |

### Health & Monitoring

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/stats` | Server statistics |
| `GET` | `/docs` | API documentation |
| `GET` | `/docs/examples` | Code examples |

## WebSocket Events

### Client → Server

| Event | Description | Data |
|-------|-------------|------|
| `identify` | Join a game | `{ botName, gameId, chipStack }` |
| `action` | Submit poker action | `{ type, playerId, timestamp, amount? }` |

### Server → Client

| Event | Description | Data |
|-------|-------------|------|
| `identificationSuccess` | Successfully joined game | `{ chipStack, gameId }` |
| `identificationError` | Failed to join game | `{ error }` |
| `gameState` | Game state update | `{ players, communityCards, potSize, ... }` |
| `turnStart` | Your turn to act | `{ playerId, timeLimit }` |
| `turnWarning` | Turn timeout warning | `{ timeRemaining }` |
| `actionResult` | Action result | `{ success, action?, error? }` |
| `gameEvent` | Game event occurred | `{ type, action?, ... }` |
| `handComplete` | Hand finished | `{ winner?, ... }` |

## Example Bot Implementation

See `examples/express-bot-example.js` for a complete working example that demonstrates:

- Creating games via REST API
- Joining games via WebSocket
- Handling turns and making decisions
- Processing game events
- Error handling

## Error Handling

All API responses follow a consistent format:

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional success message"
}
```

Error responses:

```json
{
  "success": false,
  "error": "Error category",
  "message": "Detailed error message"
}
```

## Testing

The Express API functionality is fully tested with comprehensive test coverage. Run tests with:

```bash
npm test
```

The test suite includes:
- Health and info endpoints
- Game management operations
- Player operations
- Error handling scenarios
- All 15 test cases passing ✅

## Integration

The Express server integrates seamlessly with the existing Pokai Poker Engine architecture:

- Uses the same `GameController` and `SocketHandler` classes
- Maintains all existing functionality
- Adds HTTP layer without breaking changes
- Provides both REST and WebSocket access to the same game state

This makes it easy for bot developers to choose their preferred interaction method while accessing the full power of the Pokai Poker Engine.