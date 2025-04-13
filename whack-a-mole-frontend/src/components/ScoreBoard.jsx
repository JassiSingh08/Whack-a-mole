import React from 'react';

function ScoreBoard({ players, currentPlayerId, molePlayerId }) {
  const sortedPlayers = Object.entries(players)
    .sort(([, playerA], [, playerB]) => {
      // Mole player goes to the top
      if (playerA.isMole) return -1;
      if (playerB.isMole) return 1;
      // Then sort by score
      return playerB.score - playerA.score;
    })
    .map(([id, player]) => ({ id, ...player }));

  return (
    <div className="score-board">
      <h2>Scoreboard</h2>
      <div className="scores">
        {sortedPlayers.map((player) => (
          <div 
            key={player.id} 
            className={`player-score 
              ${player.id === currentPlayerId ? 'current-player' : ''} 
              ${player.id === molePlayerId ? 'mole-player' : ''}`}
          >
            <span className="player-name">
              {player.name} 
              {player.isMole ? ' (MOLE)' : ''}
            </span>
            <span className="player-score-value">{player.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ScoreBoard;