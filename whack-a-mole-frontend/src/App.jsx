// src/App.jsx

import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import './App.css';
import GameBoard from './components/GameBoard';
import ScoreBoard from './components/ScoreBoard';

function App() {
  const [socket, setSocket] = useState(null);
  const [gameState, setGameState] = useState({
    players: {},
    holes: Array(9).fill(false),
    gameStarted: false,
    countdown: 3,
    timeLeft: 60,
    molePlayerId: null,
    currentMolePosition: -1
  });
  const [playerId, setPlayerId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [isNameSubmitted, setIsNameSubmitted] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isMole, setIsMole] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Connect to the socket server
    const newSocket = io('http://localhost:3001');
    setSocket(newSocket);

    // Setup event listeners
    newSocket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
      setPlayerId(newSocket.id);
    });

    newSocket.on('gameState', (state) => {
      setGameState(state);
      // Check if this player is the mole based on the updated game state
      if (state.molePlayerId === newSocket.id) {
        setIsMole(true);
      }
    });

    newSocket.on('youAreMole', (status) => {
      setIsMole(status);
      setMessage('You are the MOLE! Click on holes to move around and avoid being whacked!');
      setTimeout(() => setMessage(''), 5000);
    });

    newSocket.on('youGotWhacked', () => {
      setMessage('You got WHACKED! Quick, move to another hole!');
      setTimeout(() => setMessage(''), 2000);
    });

    newSocket.on('errorMessage', (msg) => {
      setMessage(msg);
      setTimeout(() => setMessage(''), 3000);
    });

    newSocket.on('gameOver', (msg) => {
      setMessage(msg);
      setTimeout(() => setMessage(''), 5000);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
      setIsMole(false);
    });

    // Clean up the socket connection when the component unmounts
    return () => {
      newSocket.disconnect();
    };
  }, []);

  const handleNameSubmit = (e) => {
    e.preventDefault();
    if (playerName.trim() && socket) {
      socket.emit('playerJoin', playerName);
      setIsNameSubmitted(true);
    }
  };

  const handleStartGame = () => {
    if (socket) {
      socket.emit('startGame');
    }
  };

  const handleHoleClick = (index) => {
    if (!socket || !gameState.gameStarted || gameState.countdown > 0) {
      return;
    }
    
    if (isMole) {
      // If player is mole, move to the clicked hole
      socket.emit('moveMole', index);
    } else {
      // If player is a whacker, try to whack the mole
      socket.emit('whackMole', index);
    }
  };

  return (
    <div className="app">
      <h1>Multiplayer Whack-A-Mole</h1>
      
      {message && (
        <div className="message-banner">
          {message}
        </div>
      )}

      {!isConnected && (
        <div className="connection-status">
          Connecting to server...
        </div>
      )}

      {isConnected && !isNameSubmitted && (
        <div className="name-form">
          <form onSubmit={handleNameSubmit}>
            <input
              type="text"
              placeholder="Enter your name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              required
            />
            <button type="submit">Join Game</button>
          </form>
        </div>
      )}

      {isNameSubmitted && (
        <>
          <div className="role-indicator">
            {gameState.gameStarted ? (
              isMole ? (
                <div className="mole-role">You are the MOLE!</div>
              ) : (
                <div className="whacker-role">You are a WHACKER!</div>
              )
            ) : (
              <div>Waiting for game to start...</div>
            )}
          </div>

          <ScoreBoard 
            players={gameState.players} 
            currentPlayerId={playerId} 
            molePlayerId={gameState.molePlayerId} 
          />
          
          {!gameState.gameStarted && Object.keys(gameState.players).length >= 2 && (
            <div className="start-game">
              <p>Waiting for players... ({Object.keys(gameState.players).length} joined, need at least 2)</p>
              <button onClick={handleStartGame}>Start Game</button>
            </div>
          )}

          {!gameState.gameStarted && Object.keys(gameState.players).length < 2 && (
            <div className="waiting-players">
              <p>Waiting for more players to join... ({Object.keys(gameState.players).length}/2)</p>
            </div>
          )}

          {gameState.gameStarted && gameState.countdown > 0 && (
            <div className="countdown">
              <h2>Game starting in: {gameState.countdown}</h2>
            </div>
          )}

          {gameState.gameStarted && gameState.countdown === 0 && (
            <div className="game-info">
              <h2>Time left: {gameState.timeLeft}s</h2>
            </div>
          )}

          <GameBoard 
            holes={gameState.holes} 
            onHoleClick={handleHoleClick}
            gameActive={gameState.gameStarted && gameState.countdown === 0}
            isMole={isMole}
          />
        </>
      )}
    </div>
  );
}

export default App;