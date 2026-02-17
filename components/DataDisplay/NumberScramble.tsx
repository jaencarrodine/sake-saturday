"use client";

import { useEffect, useState } from "react";

type NumberScrambleProps = {
  value: number;
  isLoading?: boolean;
  decimals?: number;
  className?: string;
};

export default function NumberScramble({ 
  value, 
  isLoading = false,
  decimals = 0,
  className = ""
}: NumberScrambleProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isScrambling, setIsScrambling] = useState(false);
  
  useEffect(() => {
    if (isLoading) {
      setIsScrambling(true);
      // Scramble effect
      const interval = setInterval(() => {
        setDisplayValue(Math.random() * 100);
      }, 50);
      
      return () => clearInterval(interval);
    } else {
      if (isScrambling) {
        // Resolve animation - numbers lock in left to right
        const valueStr = value.toFixed(decimals);
        const chars = valueStr.split("");
        let currentIndex = 0;
        
        const resolveInterval = setInterval(() => {
          if (currentIndex >= chars.length) {
            clearInterval(resolveInterval);
            setDisplayValue(value);
            setIsScrambling(false);
            return;
          }
          
          // Show partial resolved value with scrambled rest
          const resolved = chars.slice(0, currentIndex + 1).join("");
          const scrambled = chars.slice(currentIndex + 1)
            .map(() => Math.floor(Math.random() * 10))
            .join("");
          
          setDisplayValue(parseFloat(resolved + scrambled) || 0);
          currentIndex++;
        }, 30);
        
        return () => clearInterval(resolveInterval);
      } else {
        setDisplayValue(value);
      }
    }
  }, [value, isLoading, decimals, isScrambling]);
  
  return (
    <span className={`tabular-nums ${className}`}>
      {displayValue.toFixed(decimals)}
    </span>
  );
}
