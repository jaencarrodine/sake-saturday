type GridAreaProps = {
  children: React.ReactNode;
  title: string;
  titleJa?: string;
  className?: string;
  highlight?: string; // First letter to highlight in different color
};

export default function GridArea({ children, title, titleJa, className = "", highlight }: GridAreaProps) {
  // Find the first letter to highlight (if highlight prop not provided, use first letter)
  const firstLetter = highlight || title.charAt(0);
  const restOfTitle = highlight ? title : title.slice(1);
  
  return (
    <div className={`relative border border-primary ${className}`}>
      {/* Title overlapping top border */}
      <div className="absolute top-0 left-4 -translate-y-1/2 bg-black px-2 flex items-center gap-2">
        <span className="text-lg md:text-xl">
          <span className="text-sake-gold">「{firstLetter}」</span>
          <span className="text-white">{restOfTitle}</span>
        </span>
        {titleJa && (
          <span className="text-sm md:text-base text-muted font-noto">
            {titleJa}
          </span>
        )}
      </div>
      
      {/* Content */}
      <div className="p-4 md:p-6">
        {children}
      </div>
    </div>
  );
}
