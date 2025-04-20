// server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Game state
let gameState = {
  players: {},
  holes: Array(9).fill(false),
  gameStarted: false,
  countdown: 3,
  timeLeft: 60,
  molePlayerId: null,
  currentMolePosition: -1,
  lastMoveTime: 0,
  consecutiveEscapes: 0
};

let gameInterval = null;
let moleScoreInterval = null;

// Constants for mole scoring
const MOLE_SURVIVAL_POINTS = 1;  // Points per survival interval
const MOLE_SURVIVAL_INTERVAL = 3; // Seconds between survival points
const MOLE_ESCAPE_POINTS = 2;    // Points for a successful escape
const CONSECUTIVE_ESCAPE_BONUS = 1; // Additional points for consecutive escapes

// Function to reset the game
function resetGame() {
  clearInterval(gameInterval);
  clearInterval(moleScoreInterval);

  // Preserve players but reset scores and roles
  const players = { ...gameState.players };
  Object.keys(players).forEach(id => {
    players[id].score = 0;
    players[id].isMole = false;
  });

  gameState = {
    players: players,
    holes: Array(9).fill(false),
    gameStarted: false,
    countdown: 3,
    timeLeft: 60,
    molePlayerId: null,
    currentMolePosition: -1,
    lastMoveTime: 0,
    consecutiveEscapes: 0
  };

  io.emit('gameState', gameState);
}

// Select a random player to be the mole
function selectMolePlayer() {
  const playerIds = Object.keys(gameState.players);
  if (playerIds.length === 0) return null;

  const randomIndex = Math.floor(Math.random() * playerIds.length);
  const molePlayerId = playerIds[randomIndex];

  // Set the player as the mole
  gameState.molePlayerId = molePlayerId;
  gameState.players[molePlayerId].isMole = true;

  return molePlayerId;
}

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Player joins the game
  socket.on('playerJoin', (playerName) => {
    gameState.players[socket.id] = {
      name: playerName,
      score: 0,
      isMole: false
    };

    console.log(`Player joined: ${playerName} (${socket.id})`);
    io.emit('gameState', gameState);
  });

  // Player starts the game
  socket.on('startGame', () => {
    if (!gameState.gameStarted && Object.keys(gameState.players).length >= 2) {
      // Select a mole player
      const molePlayerId = selectMolePlayer();
      if (!molePlayerId) return; // No players available

      gameState.gameStarted = true;
      io.emit('gameState', gameState);

      // Inform the mole player of their role
      io.to(molePlayerId).emit('youAreMole', true);

      // Start countdown
      let countdown = 3;
      const countdownTimer = setInterval(() => {
        countdown--;
        gameState.countdown = countdown;
        io.emit('gameState', gameState);

        if (countdown <= 0) {
          clearInterval(countdownTimer);
          startGameplay();
        }
      }, 1000);
    } else if (Object.keys(gameState.players).length < 2) {
      // Not enough players
      socket.emit('errorMessage', 'Need at least 2 players to start');
    }
  });

  // Mole player moves to a hole
  socket.on('moveMole', (holeIndex) => {
    if (gameState.gameStarted &&
      gameState.countdown === 0 &&
      socket.id === gameState.molePlayerId) {

      const now = Date.now();

      // Check if this is an "escape" (moving from one hole to another)
      if (gameState.currentMolePosition !== -1) {
        gameState.lastMoveTime = now;

        // Award escape points only if the mole was visible for at least 1 second
        if (now - gameState.lastMoveTime >= 1000) {
          gameState.consecutiveEscapes++;
          // Calculate bonus based on consecutive escapes
          const escapePoints = MOLE_ESCAPE_POINTS +
            (gameState.consecutiveEscapes - 1) * CONSECUTIVE_ESCAPE_BONUS;

          // Add escape points to mole player's score
          gameState.players[socket.id].score += escapePoints;

          // Inform mole player of escape points
          socket.emit('escapePoints', {
            points: escapePoints,
            consecutive: gameState.consecutiveEscapes
          });
        }
      } else {
        // First movement, just record the time
        gameState.lastMoveTime = now;
      }

      // Update mole position
      gameState.holes = Array(9).fill(false);
      gameState.holes[holeIndex] = true;
      gameState.currentMolePosition = holeIndex;

      // Update all clients
      io.emit('gameState', gameState);
    }
  });

  // Player whacks a mole
  socket.on('whackMole', (holeIndex) => {
    if (gameState.gameStarted &&
      gameState.countdown === 0 &&
      socket.id !== gameState.molePlayerId &&
      gameState.holes[holeIndex]) {

      // Increase whacker's score
      gameState.players[socket.id].score += 1;

      // Reset consecutive escapes
      gameState.consecutiveEscapes = 0;

      // Hide the mole that was whacked
      gameState.holes[holeIndex] = false;
      gameState.currentMolePosition = -1;

      // Update all clients
      io.emit('gameState', gameState);

      // Tell the mole player they've been whacked
      io.to(gameState.molePlayerId).emit('youGotWhacked');
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);

    // If mole player disconnected, end the game
    if (socket.id === gameState.molePlayerId && gameState.gameStarted) {
      io.emit('errorMessage', 'Mole player disconnected. Game will reset.');
      setTimeout(resetGame, 3000);
    }

    // Remove player from the game
    if (gameState.players[socket.id]) {
      delete gameState.players[socket.id];
      io.emit('gameState', gameState);

      // If no players left or less than 2, reset the game
      if (Object.keys(gameState.players).length < 2 && gameState.gameStarted) {
        io.emit('errorMessage', 'Not enough players to continue.');
        setTimeout(resetGame, 3000);
      }
    }
  });
});

// Function to start the actual gameplay
function startGameplay() {
  // Start giving points to the mole player for surviving
  moleScoreInterval = setInterval(() => {
    // Only give points if the mole is visible somewhere
    if (gameState.currentMolePosition !== -1 && gameState.molePlayerId) {
      // Add survival points to mole player's score
      gameState.players[gameState.molePlayerId].score += MOLE_SURVIVAL_POINTS;

      // Inform mole player of survival points
      io.to(gameState.molePlayerId).emit('survivalPoints', {
        points: MOLE_SURVIVAL_POINTS
      });

      // Update all clients with new score
      io.emit('gameState', gameState);
    }
  }, MOLE_SURVIVAL_INTERVAL * 1000);

  // Game timer
  gameInterval = setInterval(() => {
    gameState.timeLeft--;
    io.emit('gameState', gameState);

    if (gameState.timeLeft <= 0) {
      endGame();
    }
  }, 1000);
}

// Function to end the game
function endGame() {
  clearInterval(gameInterval);
  clearInterval(moleScoreInterval);

  // Find winners in each category
  let highestWhackerScore = -1;
  let whackerWinners = [];

  // Mole already has their final score

  Object.entries(gameState.players).forEach(([id, player]) => {
    // Skip the mole player when determining whacker winners
    if (!player.isMole && player.score > highestWhackerScore) {
      highestWhackerScore = player.score;
      whackerWinners = [player.name];
    } else if (!player.isMole && player.score === highestWhackerScore) {
      whackerWinners.push(player.name);
    }
  });

  // Get mole player name and score
  const molePlayer = gameState.players[gameState.molePlayerId];
  const moleName = molePlayer ? molePlayer.name : "Unknown";
  const moleScore = molePlayer ? molePlayer.score : 0;

  // Prepare results message
  let resultsMessage = `Game over!\n`;

  // Add mole result
  resultsMessage += `Mole (${moleName}): ${moleScore} points\n`;

  // Add whacker results
  if (whackerWinners.length > 0) {
    const whackerMessage = whackerWinners.length === 1
      ? `Top Whacker: ${whackerWinners[0]} with ${highestWhackerScore} points!`
      : `Top Whackers: ${whackerWinners.join(' and ')} with ${highestWhackerScore} points!`;

    resultsMessage += whackerMessage;
  } else {
    resultsMessage += `No successful whackers.`;
  }

  io.emit('gameOver', resultsMessage);

  // Wait 5 seconds then reset the game
  setTimeout(resetGame, 5000);
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});