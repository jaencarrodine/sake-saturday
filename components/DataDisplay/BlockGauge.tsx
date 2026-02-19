type BlockGaugeProps = {
  value: number;
  blockLength?: number;
  startColor?: string;
  midColor?: string;
  endColor?: string;
  className?: string;
};

export default function BlockGauge({ 
  value, 
  blockLength = 10,
  startColor = "#FF0080",
  className = ""
}: BlockGaugeProps) {
  const normalizedValue = Math.max(0, Math.min(1, value));
  const filledBlocks = Math.round(normalizedValue * blockLength);
  
  const blocks = Array.from({ length: blockLength }, (_, i) => ({
    isFilled: i < filledBlocks
  }));
  
  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      {blocks.map((b, i) => (
        <div
          key={i}
          className="w-2 h-4"
          style={{ 
            backgroundColor: b.isFilled ? startColor : "#2A2A2A",
            boxShadow: b.isFilled ? `0 0 3px ${startColor}` : 'none'
          }}
        />
      ))}
    </div>
  );
}
