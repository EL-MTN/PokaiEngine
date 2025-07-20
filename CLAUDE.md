# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

### Development
- `npm run dev` - Run server with hot reload using tsx watch
- `npm run dev:build` - Build and start in production mode
- `npm start` - Start server in production mode

### Building
- `npm run build` - Compile TypeScript and resolve path aliases
- `npm run clean` - Remove dist folder

### Testing
- `npm test` - Run all tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate coverage report
- To run a single test file: `npm test -- path/to/test.ts`
- To run tests matching a pattern: `npm test -- --testNamePattern="pattern"`

### Code Quality
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues
- `npm run format` - Format code with Prettier

## Architecture Overview

PokaiEngine is a production-ready Texas Hold'em poker engine built with TypeScript and Socket.IO for real-time multiplayer gameplay.

### Directory Structure

```
src/
├── dashboard/          # Web dashboard (HTML/CSS/JS)
├── engine/            # Core game engine
│   ├── game/          # GameController, GameEngine, GameState
│   ├── poker/         # Card game logic (ActionValidator, Card, Deck, HandEvaluator)
│   └── replay/        # Replay functionality
├── services/          # Application services
│   ├── auth/          # Bot authentication
│   ├── logging/       # Winston logger, GameLogger, ReplaySystem
│   ├── replay/        # Replay service and storage
│   └── storage/       # MongoDB database and models
├── socket/            # Socket.IO server and event handlers
├── types/             # TypeScript type definitions
└── index.ts           # Main entry point with PokaiExpressServer
```

### Key Components

- **PokaiExpressServer**: Main server combining Express REST API and Socket.IO WebSocket support
- **GameEngine**: Manages poker game state and logic
- **GameController**: Orchestrates game flow and player actions
- **Socket Server**: Handles real-time communication for game events
- **Bot Authentication**: Token-based system for bot integration

### Path Aliases

The project uses TypeScript path aliases (configured in tsconfig.json):

- `@/*` - src/*
- `@engine/*` - src/engine/*
- `@socket/*` - src/socket/*
- `@services/*` - src/services/*
- `@types/*` - src/types/*
- `@dashboard/*` - src/dashboard/*
- `@utils/*` - src/utils/*
- `@tests/*` - tests/*

## Integration Points

- **WebSocket**: Connect via Socket.IO to the server port (default 3001)
- **REST API Endpoints**:
  - `/api/games` - Game management
  - `/api/bots` - Bot registration and authentication
  - `/api/replays` - Replay functionality
  - `/dashboard` - Web dashboard interface
- **Authentication**: Token-based system, see `docs/BOT_AUTHENTICATION.md`
- **SDK**: TypeScript/JavaScript SDK available in `sdk/` directory

## Database

- MongoDB with Mongoose ODM
- MongoDB Memory Server for testing (automatically handled)
- Models: Bot, Replay
- Connection managed in `src/services/storage/database.ts`

## Testing Strategy

- Jest testing framework with TypeScript support
- MongoDB Memory Server for database testing
- Test utilities in `tests/utils/`
- 10-second default timeout for async operations
- Mock factories for creating test data

## Important Notes

- Socket event naming follows conventions in `docs/SOCKET_EVENT_NAMING_CONVENTION.md`
- Replay files are stored as JSON in `replays/` directory
- Environment variables loaded from `.env` file
- Winston logger outputs to both console and log files
- Strict TypeScript configuration with ESLint and Prettier