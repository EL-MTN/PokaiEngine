# 🃏 Pokai Poker Engine

A **robust, production-ready Texas Hold'em poker engine** designed for bot battles and real-time poker tournaments. Built with TypeScript, featuring comprehensive game logic, Socket.io integration, and complete logging/replay capabilities.

## 🚀 Features

- **Complete Poker Engine**: Full Texas Hold'em implementation with all edge cases
- **Real-time Bot Communication**: Socket.io integration with turn timers
- **Advanced Game Management**: Multi-table support, side pots, complex betting scenarios
- **Comprehensive Logging**: Full game history with replay functionality
- **Production Ready**: Robust error handling, event system, and scalable architecture
- **TypeScript**: Fully typed with comprehensive interfaces
- **Testing Framework**: Jest setup with comprehensive test coverage

## 📦 Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd PokaiEngine

# Install dependencies
npm install

# Build the project
npm run build

# Run the server
npm start
```

## 🛠️ Development Setup

```bash
# Run in development mode with hot reload
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix
```

## 🎮 Quick Start

### 1. Start the Server

```bash
npm run dev
```

The server will start on `http://localhost:3000` with the following endpoints:

- **Health Check**: `GET /health`
- **Server Stats**: `GET /stats`
- **WebSocket**: `ws://localhost:3000`

### 2. Connect a Bot

```javascript
const io = require('socket.io-client');
const socket = io('http://localhost:3000');

// Connect and identify bot
socket.on('connect', () => {
	socket.emit('identify', {
		botName: 'MyBot',
		gameId: 'game-1',
		chipStack: 1000,
	});
});

// Handle game state updates
socket.on('gameState', (gameState) => {
	console.log('Current game state:', gameState);

	// Make a decision and send action
	if (gameState.currentPlayerToAct === gameState.playerId) {
		socket.emit('action', {
			action: {
				type: 'call',
				playerId: gameState.playerId,
				timestamp: Date.now(),
			},
		});
	}
});
```

## 🏗️ Architecture

```
src/
├── types/              # TypeScript interfaces and types
├── core/               # Core poker game logic
│   ├── cards/          # Card, Deck, HandEvaluator
│   ├── game/           # Player, GameState, PotManager
│   └── betting/        # ActionValidator, betting logic
├── engine/             # Game orchestration
│   ├── GameEngine.ts   # Main game engine
│   └── GameController.ts # Multi-game management
├── communication/      # Socket.io integration
│   ├── SocketHandler.ts # Real-time communication
│   └── BotInterface.ts  # Bot API abstraction
├── logging/            # Game logging and replay
│   ├── GameLogger.ts   # Event logging
│   └── ReplaySystem.ts # Game replay functionality
└── tests/              # Test suites
```

## 📡 Socket.io API

### Bot Connection Events

#### `identify` (Bot → Server)

```typescript
{
	botName: string;
	gameId: string;
	chipStack: number;
}
```

#### `action` (Bot → Server)

```typescript
{
    action: {
        type: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in';
        amount?: number;
        playerId: string;
        timestamp: number;
    }
}
```

#### `gameState` (Server → Bot)

```typescript
{
    playerId: string;
    playerCards: [Card, Card];
    communityCards: Card[];
    potSize: number;
    players: PlayerInfo[];
    currentPlayerToAct?: string;
    possibleActions: PossibleAction[];
    timeRemaining: number;
    currentPhase: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
    minimumRaise: number;
}
```

### Game Events

- `hand_started` - New hand begins
- `action_taken` - Player action processed
- `phase_changed` - Game phase transition
- `player_timeout` - Player timed out
- `hand_complete` - Hand finished
- `showdown_complete` - Showdown results

## 🎯 Usage Examples

### Create a Game Programmatically

```typescript
import { GameController, GameConfig } from './src';

const gameController = new GameController();

// Create a cash game
const config: GameConfig = {
	maxPlayers: 6,
	smallBlindAmount: 5,
	bigBlindAmount: 10,
	turnTimeLimit: 30,
	isTournament: false,
};

const game = gameController.createGame('my-game', config);

// Add players
game.addPlayer('bot1', 'AlphaBot', 1000);
game.addPlayer('bot2', 'BetaBot', 1000);

// Start the hand
game.startHand();
```

### Access Game History

```typescript
import { GameLogger } from './src';

const logger = new GameLogger();

// Get complete game log
const gameLog = logger.getGameLog('my-game');

// Get specific hand events
const handEvents = logger.getHandEvents('my-game', 1);

// Export game for analysis
const jsonData = logger.exportGameLog('my-game');
```

### Replay Games

```typescript
import { ReplaySystem } from './src';

const replaySystem = new ReplaySystem();

// Load and replay a game
const gameLog = logger.getGameLog('my-game');
replaySystem.loadGame(gameLog);

// Step through the game
replaySystem.stepForward(); // Next event
replaySystem.stepBackward(); // Previous event
replaySystem.jumpToHand(5); // Jump to specific hand
```

## 🧪 Testing

The engine includes comprehensive tests covering:

- Card and hand evaluation logic
- Betting scenarios and edge cases
- Game state transitions
- Socket communication
- Error handling

```bash
# Run all tests
npm test

# Run specific test file
npm test -- Card.test.ts

# Run with coverage
npm run test:coverage
```

## 📊 Performance

The engine is optimized for:

- **High Throughput**: Handles multiple concurrent games
- **Low Latency**: Real-time action processing
- **Memory Efficiency**: Proper cleanup and garbage collection
- **Scalability**: Stateless game engine design

## 🔧 Configuration

Environment variables:

- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment (development/production)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🏆 Tournament Support

The engine supports tournament features:

- Blind level increases
- Player elimination
- Prize pool distribution
- Multi-table management

## 🔮 Future Enhancements

- [ ] Tournament bracket management
- [ ] Player statistics tracking
- [ ] Advanced bot AI framework
- [ ] Web dashboard for game monitoring
- [ ] Database persistence layer
- [ ] Spectator mode
- [ ] Custom game variants
