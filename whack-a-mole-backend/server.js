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
    origin: "http://localhost:5173", // Default Vite development server
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
  currentMolePosition: -1
};

let gameInterval = null;

// Function to reset the game
function resetGame() {
  clearInterval(gameInterval);
  
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
    currentMolePosition: -1
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
      
      // Increase player's score
      gameState.players[socket.id].score += 1;
      
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
  
  // Find the highest scoring player (among non-mole players)
  let highestScore = -1;
  let winners = [];
  
  Object.entries(gameState.players).forEach(([id, player]) => {
    // Skip the mole player when determining winner
    if (!player.isMole && player.score > highestScore) {
      highestScore = player.score;
      winners = [player.name];
    } else if (!player.isMole && player.score === highestScore) {
      winners.push(player.name);
    }
  });
  
  // Announce winners
  if (winners.length > 0) {
    const winnerMessage = winners.length === 1 
      ? `${winners[0]} wins with ${highestScore} points!`
      : `Tie between ${winners.join(' and ')} with ${highestScore} points!`;
      
    io.emit('gameOver', winnerMessage);
  } else {
    io.emit('gameOver', 'Game over! The mole escapes unscathed!');
  }
  
  // Wait 5 seconds then reset the game
  setTimeout(resetGame, 5000);
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});