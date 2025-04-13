import React from 'react';
import Hole from './Mole';

function GameBoard({ holes, onHoleClick, gameActive, isMole }) {
  return (
    <div className="game-board">
      {holes.map((hasMole, index) => (
        <Hole 
          key={index} 
          hasMole={hasMole} 
          onClick={() => onHoleClick(index)} 
          disabled={!gameActive}
          isMolePlayer={isMole}
        />
      ))}
    </div>
  );
}

export default GameBoard;