type FrameProps = {
  children: React.ReactNode;
  title?: string;
  className?: string;
};

export default function Frame({ children, title = "SAKE SATURDAY", className = "" }: FrameProps) {
  return (
    <div className={`min-h-screen w-full ${className}`}>
      {/* Header */}
      <header className="border-b-2 border-neon-pink py-6 text-center" style={{
        boxShadow: '0 2px 10px rgba(255, 0, 128, 0.5)'
      }}>
        <h1 className="font-pixel text-neon-cyan text-xl md:text-2xl mb-2" style={{
          textShadow: '2px 2px 0 #FF0080, 0 0 10px #00ffcc'
        }}>
          {title}
        </h1>
        <div className="font-noto text-neon-pink text-sm md:text-base" style={{
          opacity: 0.5,
          letterSpacing: '0.5em'
        }}>
          酒 の 土 曜 日
        </div>
      </header>
      
      {/* Content */}
      <div className="p-4 md:p-8">
        {children}
      </div>
    </div>
  );
}
