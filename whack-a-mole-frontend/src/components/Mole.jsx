import React from 'react';

function Hole({ hasMole, onClick, disabled, isMolePlayer }) {
  return (
    <div 
      className={`hole ${hasMole ? 'has-mole' : ''} ${isMolePlayer ? 'mole-player' : 'whacker-player'}`} 
      onClick={disabled ? null : onClick}
    >
      <div className="mole"></div>
    </div>
  );
}

export default Hole;
