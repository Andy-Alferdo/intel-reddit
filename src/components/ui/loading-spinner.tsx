import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  text?: string;
  size?: 'sm' | 'md' | 'lg';
  showPercentage?: boolean;
  className?: string;
  progress?: number; // Controlled progress (0-100)
  targetProgress?: number; // Target progress to smoothly animate to
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  text = "Loading...", 
  size = 'md',
  showPercentage = true,
  className = "",
  progress,
  targetProgress
}) => {
  const [internalPercentage, setInternalPercentage] = useState(0);
  
  // Use controlled progress if provided, otherwise use auto-progress
  const percentage = progress !== undefined ? progress : internalPercentage;

  useEffect(() => {
    // If targetProgress is provided, smoothly animate to it
    if (targetProgress !== undefined) {
      const interval = setInterval(() => {
        setInternalPercentage((prev) => {
          if (prev >= targetProgress) {
            return targetProgress;
          }
          // Increment by 1% for smooth progress
          return prev + 1;
        });
      }, 50); // Update every 50ms for smooth animation

      return () => clearInterval(interval);
    }
    // Only auto-progress if no controlled progress is provided
    else if (progress === undefined) {
      const interval = setInterval(() => {
        setInternalPercentage((prev) => {
          if (prev >= 95) return prev;
          // Increment by 1% for smooth progress
          return prev + 1;
        });
      }, 200);

      return () => clearInterval(interval);
    }
  }, [progress, targetProgress]);

  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  };

  const circleSize = {
    sm: 'w-12 h-12',
    md: 'w-16 h-16',
    lg: 'w-20 h-20'
  };

  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  };

  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <div className="relative">
        {/* Background circle */}
        <div className={`${circleSize[size]} rounded-full border-4 border-slate-200`}></div>
        
        {/* Progress circle */}
        <svg 
          className={`${circleSize[size]} absolute top-0 left-0 transform -rotate-90`}
          viewBox="0 0 100 100"
        >
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeDasharray={`${2 * Math.PI * 45}`}
            strokeDashoffset={`${2 * Math.PI * 45 * (1 - percentage / 100)}`}
            className="text-blue-600 transition-all duration-300"
            strokeLinecap="round"
          />
        </svg>
        
        {/* Percentage text */}
        {showPercentage && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`${textSizes[size]} font-semibold text-slate-700`}>
              {Math.round(percentage)}%
            </span>
          </div>
        )}
        
        {/* Inner spinner */}
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className={`${sizeClasses[size]} animate-spin text-blue-600 opacity-30`} />
        </div>
      </div>
      
      {text && (
        <p className={`${textSizes[size]} font-medium text-foreground`}>{text}</p>
      )}
    </div>
  );
};
