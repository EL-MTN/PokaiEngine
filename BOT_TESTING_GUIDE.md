# Bot vs Bot Testing Guide

This guide shows you how to test two bots playing against each other using the Pokai Poker Engine.

## Prerequisites

1. **Start the Express server:**
   ```bash
   npm run dev:express
   ```

2. **Verify server is running:**
   ```bash
   curl http://localhost:3000/health
   ```

## Testing Methods

### 1. Quick Test (Recommended)

The simplest way to test two bots playing each other:

```bash
node examples/quick-bot-test.js
```

**What it does:**
- Creates a game via REST API
- Connects two bots with different strategies (aggressive vs conservative)
- Runs for 30 seconds showing real-time gameplay
- Logs all actions and game events

**Sample output:**
```
🚀 Quick Bot vs Bot Test
========================

✅ AggressiveBot connected
✅ ConservativeBot connected
🎉 AggressiveBot joined game successfully
🎉 ConservativeBot joined game successfully
🚀 Starting game...

🎮 Bots are playing...
========================

📊 AggressiveBot - Phase: preflop, Pot: $30, Chips: $980
🎯 AggressiveBot's turn
🤖 AggressiveBot chooses: raise $20
✅ AggressiveBot - raise successful
📢 Opponent: raise $20
📊 ConservativeBot - Phase: preflop, Pot: $50, Chips: $960
🎯 ConservativeBot's turn
🤖 ConservativeBot chooses: call
✅ ConservativeBot - call successful
```

### 2. Comprehensive Test

For detailed testing with multiple strategies and logging:

```bash
node examples/bot-vs-bot-example.js
```

**Features:**
- **Multiple bot strategies:** aggressive, conservative, random
- **Detailed logging:** game events, actions, statistics
- **Configurable game duration:** 60 seconds by default
- **Final statistics:** chips, actions taken, events processed

### 3. REST API Testing

Test the REST API endpoints without bots:

```bash
./examples/test-bots-curl.sh
```

**What it tests:**
- Game creation
- Game info retrieval
- Player eligibility checking
- Available games listing
- Server statistics
- API documentation

## Bot Strategies

### Aggressive Bot
- **Behavior:** Always tries to raise/bet when possible
- **Fallback:** Call → Check → Fold
- **Use case:** Testing against passive opponents

### Conservative Bot
- **Behavior:** Prefers to check/call
- **Fallback:** Check → Call → Fold
- **Use case:** Testing against aggressive opponents

### Random Bot
- **Behavior:** Randomly selects from available actions
- **Use case:** Unpredictable testing scenarios

## Custom Bot Creation

Create your own bot by implementing the `PokerBot` class:

```javascript
class CustomBot extends PokerBot {
    constructor(name) {
        super(name, 'custom');
    }

    chooseAction(possibleActions) {
        // Your custom strategy here
        // Return: { type: 'call' } or { type: 'bet', amount: 50 }
    }
}
```

## Game Configuration

Customize the game settings when creating:

```javascript
const gameConfig = {
    gameId: 'my-test-game',
    maxPlayers: 2,           // Number of players
    smallBlindAmount: 10,    // Small blind
    bigBlindAmount: 20,      // Big blind
    turnTimeLimit: 15,       // Seconds per turn
    isTournament: false      // Cash game vs tournament
};
```

## Monitoring and Debugging

### 1. Real-time Monitoring

Watch the console output to see:
- ✅ Connection status
- 🎯 Turn notifications
- 🤖 Bot decisions
- 📊 Game state updates
- 🏆 Hand results

### 2. Server Statistics

Check server health and statistics:
```bash
curl http://localhost:3000/stats
```

### 3. Game Information

Get detailed game info:
```bash
curl http://localhost:3000/api/games/YOUR_GAME_ID
```

## Common Issues and Solutions

### Issue: "Connection refused"
**Solution:** Make sure the server is running with `npm run dev:express`

### Issue: "Game not found"
**Solution:** Check that the game ID is correct and the game was created successfully

### Issue: "Bot not responding"
**Solution:** Check WebSocket connection and make sure the bot is receiving `turnStart` events

### Issue: "Invalid action"
**Solution:** Verify the action is in the `possibleActions` array and has required parameters

## Advanced Testing Scenarios

### 1. Stress Testing
Run multiple bot battles simultaneously:

```bash
# Terminal 1
node examples/bot-vs-bot-example.js

# Terminal 2 (after changing game ID)
node examples/bot-vs-bot-example.js
```

### 2. Tournament Testing
Create a tournament game:

```javascript
const tournamentConfig = {
    gameId: 'tournament-test',
    maxPlayers: 4,
    smallBlindAmount: 5,
    bigBlindAmount: 10,
    turnTimeLimit: 20,
    isTournament: true
};
```

### 3. Edge Case Testing
Test specific scenarios:
- All-in situations
- Side pot distribution
- Timeout handling
- Disconnection/reconnection

## Performance Testing

### Metrics to Monitor
- **Actions per second:** How fast bots can make decisions
- **Memory usage:** Server resource consumption
- **Connection stability:** WebSocket connection reliability
- **Game completion time:** How long games take to finish

### Load Testing
Test with multiple concurrent games:

```bash
# Create multiple games with different IDs
for i in {1..5}; do
    node -e "
        const gameId = 'load-test-$i';
        // Create game and bots
    " &
done
```

## Integration with Testing Frameworks

### Jest Integration
```javascript
describe('Bot vs Bot Tests', () => {
    it('should complete a game between two bots', async () => {
        const gameManager = new GameManager();
        await gameManager.createGame();
        await gameManager.addBot('Bot1', 'aggressive');
        await gameManager.addBot('Bot2', 'conservative');
        
        const result = await gameManager.playGame();
        expect(result.winner).toBeDefined();
    });
});
```

## Next Steps

1. **Run the quick test** to see basic functionality
2. **Customize bot strategies** for your specific use case
3. **Monitor performance** under different loads
4. **Integrate with CI/CD** for automated testing
5. **Create tournament brackets** for multiple bots

For more advanced usage, see the full API documentation at `http://localhost:3000/docs` when the server is running.