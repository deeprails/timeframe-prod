
const ModeIcon = ({ mode, className = '' }: { mode: Modes, className?: string }) => {
  const getIconSrc = () => {
    switch (mode) {
      case 'idle':
        return './Default%20Icon%20Mode.png';
      case 'listening':
        return './Listening%20Icon%20Mode.png';
      case 'thinking':
        return './Thinking%20Icon%20Mode.png';
      case 'speaking':
        return './Speaking%20Icon%20Mode.png';
      default:
        return './Default%20Icon%20Mode.png';
    }
  };

  const getAnimationClass = () => {
    switch (mode) {
      case 'idle':
        return 'animate-breathe-default';
      case 'listening':
        return 'animate-breathe-listening';
      case 'thinking':
        return 'animate-breathe-processing';
      case 'speaking':
        return 'animate-breathe-speaking';
      default:
        return 'animate-breathe-default';
    }
  };

  return (
    <>
      <style>{`
        @keyframes breathe-default {
          0%, 100% { 
            transform: scale(1); 
            opacity: 0.9; 
          }
          50% { 
            transform: scale(1.05); 
            opacity: 1; 
          }
        }
        
        @keyframes breathe-listening {
          0%, 100% { 
            transform: scale(1); 
            opacity: 0.85; 
          }
          50% { 
            transform: scale(1.08); 
            opacity: 1; 
          }
        }
        
        @keyframes breathe-processing {
          0%, 100% { 
            transform: scale(1); 
            opacity: 0.8; 
          }
          50% { 
            transform: scale(1.1); 
            opacity: 1; 
          }
        }
        
        @keyframes breathe-speaking {
          0%, 100% { 
            transform: scale(1); 
            opacity: 0.9; 
          }
          50% { 
            transform: scale(1.03); 
            opacity: 1; 
          }
        }
        
        .animate-breathe-default {
          animation: breathe-default 4s ease-in-out infinite;
        }
        
        .animate-breathe-listening {
          animation: breathe-listening 2.5s ease-in-out infinite;
        }
        
        .animate-breathe-processing {
          animation: breathe-processing 2s ease-in-out infinite;
        }
        
        .animate-breathe-speaking {
          animation: breathe-speaking 3s ease-in-out infinite;
        }
      `}</style>

      <div className={`w-16 aspect-square transition-all duration-700 ease-out ${className}`}>
        {/* Active icon */}
        <img
          src={getIconSrc()}
          alt={`${mode} mode icon`}
          className={`w-full h-full object-contain transition-all duration-500 ease-out ${getAnimationClass()}`}
          loading="eager"
        />
      </div>
    </>
  );
};

export default ModeIcon;
