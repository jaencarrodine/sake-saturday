type BlockGaugeProps = {
  value: number; // 0-1 normalized value
  blockLength?: number;
  startColor?: string;
  midColor?: string;
  endColor?: string;
  className?: string;
};

export default function BlockGauge({ 
  value, 
  blockLength = 10,
  startColor = "#E84545", // Red for low scores
  midColor = "#C4A35A", // Gold for mid scores
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
  const midRGB = hexToRGB(midColor);
  const endRGB = hexToRGB(endColor);
  
  const blocks = Array.from({ length: blockLength }, (_, i) => {
    const p = i / (blockLength - 1);
    let color: string;
    
    // Three-color gradient: red → gold (0-0.5) → green (0.5-1)
    if (p < 0.5) {
      const localP = p * 2; // 0 to 1 in first half
      color = rgbToHex(
        Math.round(startRGB.r + (midRGB.r - startRGB.r) * localP),
        Math.round(startRGB.g + (midRGB.g - startRGB.g) * localP),
        Math.round(startRGB.b + (midRGB.b - startRGB.b) * localP)
      );
    } else {
      const localP = (p - 0.5) * 2; // 0 to 1 in second half
      color = rgbToHex(
        Math.round(midRGB.r + (endRGB.r - midRGB.r) * localP),
        Math.round(midRGB.g + (endRGB.g - midRGB.g) * localP),
        Math.round(midRGB.b + (endRGB.b - midRGB.b) * localP)
      );
    }
    
    return {
      color,
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
