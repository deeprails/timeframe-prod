export default function Text({ mode, transcription }: { mode: Modes, transcription: string | null }) {
  console.log('transcription: ', transcription)

  const getContainerClasses = () => {
    const baseClasses = "bg-white/10 backdrop-blur-md rounded-xl px-4 py-2 border border-white/20 shadow-xl";

    if (mode === 'idle') {
      return `${baseClasses} cursor-pointer hover:bg-white/20 hover:border-white/30 transition-all duration-200 active:scale-95`;
    }

    return baseClasses;
  };

  const getTextClasses = () => {
    const baseClasses = "text-white text-wrap transition-all duration-300 drop-shadow-lg";

    // Use smaller uniform text-sm size for all modes
    switch (mode) {
      case 'idle':
        return `${baseClasses} text-sm font-medium`;
      case 'listening':
        return `${baseClasses} ${!transcription ? 'animate-pulse' : ''} text-sm font-normal`;
      case 'thinking':
        return `${baseClasses} text-sm font-medium animate-pulse`;
      case 'speaking':
        return `${baseClasses} text-sm font-normal leading-relaxed`;
      default:
        return `${baseClasses} text-sm font-medium`;
    }
  };

  return (
    <div className={`${getContainerClasses()}`}>
      <p
        className={`${getTextClasses()}`}>
        {mode == "idle" ? 'Ask me a question' :
          mode == "listening" ? (transcription || "I'm listening....") :
            mode == "thinking" ? "I'm thinking...." :
              mode == "speaking" ? (transcription) :
              mode == "away" ? "Lincoln is away" : "Ask me a question"}
      </p>
    </div>
  )
}
