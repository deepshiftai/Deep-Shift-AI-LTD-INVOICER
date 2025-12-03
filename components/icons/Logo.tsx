
import React from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 200 50"
    xmlns="http://www.w3.org/2000/svg"
    fill="currentColor"
  >
    <text
      x="10"
      y="35"
      fontFamily="Arial, sans-serif"
      fontSize="30"
      fontWeight="bold"
      className="text-slate-200"
    >
      Deep Shift
      <tspan className="text-cyan-400"> AI</tspan>
    </text>
  </svg>
);
