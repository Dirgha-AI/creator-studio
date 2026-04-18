import React, { useState, useCallback } from 'react';
import { Score, Content } from '../../interfaces/ContentTypes';

interface ScoreBadgeProps {
  score: Score;
  content: Content;
  platform: string;
  size?: 'sm' | 'md' | 'lg';
  onClick?: (score: Score, content: Content) => void;
}

export const ScoreBadge: React.FC<ScoreBadgeProps> = ({
  score,
  content,
  platform,
  size = 'md',
  onClick
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const color = getScoreColor(score.overall);
  const dimensions = getSizeDimensions(size);

  const handleClick = useCallback(() => {
    onClick?.(score, content);
  }, [onClick, score, content]);

  const containerStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: dimensions.padding,
    background: color + '15',
    border: `1px solid ${color}`,
    borderRadius: dimensions.borderRadius,
    cursor: onClick ? 'pointer' : 'default',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    fontSize: dimensions.fontSize,
    fontWeight: 600,
    color: color,
    transition: 'all 0.2s ease',
    transform: isHovered ? 'scale(1.05)' : 'scale(1)',
    boxShadow: isHovered ? `0 2px 8px ${color}40` : 'none'
  };

  return (
    <div
      style={containerStyle}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-score={score.overall}
      data-platform={platform}
      data-testid="score-badge"
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <SparkleIcon size={dimensions.iconSize} color={color} />
        {score.overall.toFixed(1)}
      </span>
      
      {isHovered && size !== 'sm' && (
        <span style={{
          fontSize: dimensions.fontSize * 0.75,
          fontWeight: 400,
          opacity: 0.8,
          marginLeft: 4
        }}>
          ({getTierLabel(score.overall)})
        </span>
      )}
    </div>
  );
};

function getScoreColor(score: number): string {
  if (score >= 8.5) return '#10b981';
  if (score >= 7) return '#3b82f6';
  if (score >= 5) return '#f59e0b';
  if (score >= 3) return '#f97316';
  return '#ef4444';
}

function getTierLabel(score: number): string {
  if (score >= 9) return 'Must Save';
  if (score >= 8) return 'Excellent';
  if (score >= 7) return 'Very Good';
  if (score >= 6) return 'Good';
  if (score >= 5) return 'Average';
  if (score >= 4) return 'Below Avg';
  return 'Skip';
}

function getSizeDimensions(size: string) {
  const dims = {
    sm: { padding: '2px 6px', fontSize: 10, iconSize: 10, borderRadius: 4 },
    md: { padding: '4px 10px', fontSize: 12, iconSize: 12, borderRadius: 6 },
    lg: { padding: '6px 14px', fontSize: 14, iconSize: 14, borderRadius: 8 }
  };
  return dims[size as keyof typeof dims] ?? dims.md;
}

const SparkleIcon: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6-4.8-6 4.8 2.4-7.2-6-4.8h7.6z" />
  </svg>
);

export const MiniScore: React.FC<{ score: number }> = ({ score }) => {
  const color = getScoreColor(score);
  return (
    <span style={{
      display: 'inline-block',
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: color,
      boxShadow: `0 0 4px ${color}`
    }} title={`Score: ${score.toFixed(1)}`} />
  );
};
