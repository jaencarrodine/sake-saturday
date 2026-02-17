type BlockGaugeProps = {
  value: number; // 0-1 normalized value
  blockLength?: number;
  startColor?: string;
  endColor?: string;
  className?: string;
};

export default function BlockGauge({ 
  value, 
  blockLength = 10,
  startColor = "#E84545", // Red for low scores
  endColor = "#79C39A", // Green for high scores
  className = ""
}: BlockGaugeProps) {
  const normalizedValue = Math.max(0, Math.min(1, value));
  const filledBlocks = Math.round(normalizedValue * blockLength);
  
  const hexToRGB = (hex: string) => {
    const h = hex.replace("#", "");
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16)
    };
  };
  
  const rgbToHex = (r: number, g: number, b: number) =>
    `#${[r, g, b].map(c => c.toString(16).padStart(2, "0")).join("")}`;
  
  const startRGB = hexToRGB(startColor);
  const endRGB = hexToRGB(endColor);
  
  const blocks = Array.from({ length: blockLength }, (_, i) => {
    const p = i / (blockLength - 1);
    return {
      color: rgbToHex(
        Math.round(startRGB.r + (endRGB.r - startRGB.r) * p),
        Math.round(startRGB.g + (endRGB.g - startRGB.g) * p),
        Math.round(startRGB.b + (endRGB.b - startRGB.b) * p)
      ),
      isFilled: i < filledBlocks
    };
  });
  
  return (
    <div className={`flex items-center ${className}`}>
      {blocks.map((b, i) => (
        <div
          key={i}
          className="-mx-[1.2px] -mt-0.5 leading-none text-xl"
          style={{ color: b.isFilled ? b.color : "#2A2A2A" }}
        >
          ■
        </div>
      ))}
    </div>
  );
}
