type GridAreaProps = {
  children: React.ReactNode;
  title: string;
  titleJa?: string;
  className?: string;
  highlight?: string;
};

export default function GridArea({ children, title, titleJa, className = "" }: GridAreaProps) {
  return (
    <div className={`panel ${className}`}>
      {/* Panel title */}
      <div className="px-4 pt-4 pb-2 flex items-center gap-3 flex-wrap">
        <span className="panel-title neon-cyan">
          [ {title.toUpperCase()} ]
        </span>
        {titleJa && (
          <span className="text-neon-pink text-sm font-noto" style={{ opacity: 0.8 }}>
            {titleJa}
          </span>
        )}
      </div>
      
      {/* Content */}
      <div className="px-4 pb-4">
        {children}
      </div>
    </div>
  );
}
