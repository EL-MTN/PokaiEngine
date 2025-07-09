#!/bin/bash

# Bot vs Bot Testing with curl commands
# This shows how to test bots using the REST API

echo "🚀 Bot vs Bot Testing with curl"
echo "==============================="

SERVER="http://localhost:3000"
GAME_ID="curl-test-$(date +%s)"

echo "🎮 Creating game: $GAME_ID"
curl -X POST "$SERVER/api/games" \
  -H "Content-Type: application/json" \
  -d "{
    \"gameId\": \"$GAME_ID\",
    \"maxPlayers\": 2,
    \"smallBlindAmount\": 10,
    \"bigBlindAmount\": 20,
    \"turnTimeLimit\": 15,
    \"isTournament\": false
  }" | jq .

echo -e "\n📊 Checking game info:"
curl -s "$SERVER/api/games/$GAME_ID" | jq .

echo -e "\n🎯 Available games:"
curl -s "$SERVER/api/games/available" | jq .

echo -e "\n🤖 Bot1 - Checking if can join:"
curl -s "$SERVER/api/games/$GAME_ID/can-join/bot1" | jq .

echo -e "\n🤖 Bot2 - Checking if can join:"
curl -s "$SERVER/api/games/$GAME_ID/can-join/bot2" | jq .

echo -e "\n📈 Server stats:"
curl -s "$SERVER/stats" | jq .

echo -e "\n📚 API documentation:"
curl -s "$SERVER/docs" | jq .

echo -e "\n✅ curl test completed!"
echo "Note: To test actual bot gameplay, use the JavaScript examples:"
echo "  node examples/quick-bot-test.js"
echo "  node examples/bot-vs-bot-example.js"