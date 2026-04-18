import React from 'react';
import { Score, DimensionScores } from '../../interfaces/ContentTypes';

interface BreakdownPopupProps {
  score: Score;
  position?: { x: number; y: number };
  onClose?: () => void;
}

export const BreakdownPopup: React.FC<BreakdownPopupProps> = ({
  score,
  position,
  onClose
}) => {
  const style: React.CSSProperties = position ? {
    position: 'fixed',
    left: position.x,
    top: position.y,
    zIndex: 10000
  } : {
    position: 'relative'
  };

  return (
    <div style={{
      ...style,
      background: '#fff',
      borderRadius: 12,
      boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
      padding: 20,
      minWidth: 280,
      maxWidth: 320,
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif'
    }}>
      <Header score={score} onClose={onClose} />
      <DimensionBars dimensions={score.dimensions} />
      <Footer score={score} />
    </div>
  );
};

const Header: React.FC<{ score: Score; onClose?: () => void }> = ({ score, onClose }) => (
  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 12 }}>
    <div style={{
      width: 50,
      height: 50,
      borderRadius: '50%',
      background: getScoreGradient(score.overall),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontSize: 18,
      fontWeight: 700
    }}>
      {score.overall.toFixed(1)}
    </div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>Overall Score</div>
      <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
        Confidence: {Math.round(score.confidence * 100)}%
      </div>
    </div>
    {onClose && (
      <button onClick={onClose} style={{
        background: 'none',
        border: 'none',
        fontSize: 20,
        cursor: 'pointer',
        color: '#999',
        padding: 0
      }}>×</button>
    )}
  </div>
);

const DimensionBars: React.FC<{ dimensions: DimensionScores }> = ({ dimensions }) => {
  const items = Object.entries(dimensions).map(([key, value]) => ({
    label: formatLabel(key),
    value,
    color: getDimensionColor(key, value)
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map((item) => (
        <div key={item.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: '#444', fontWeight: 500 }}>{item.label}</span>
            <span style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>{item.value.toFixed(1)}</span>
          </div>
          <div style={{
            height: 6,
            background: '#f0f0f0',
            borderRadius: 3,
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: `${item.value * 10}%`,
              background: item.color,
              borderRadius: 3,
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>
      ))}
    </div>
  );
};

const Footer: React.FC<{ score: Score }> = ({ score }) => (
  <div style={{
    marginTop: 16,
    paddingTop: 12,
    borderTop: '1px solid #eee',
    fontSize: 11,
    color: '#888',
    fontStyle: 'italic'
  }}>
    {score.explanation}
  </div>
);

function formatLabel(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
}

function getScoreGradient(score: number): string {
  if (score >= 8) return 'linear-gradient(135deg, #10b981, #059669)';
  if (score >= 6) return 'linear-gradient(135deg, #3b82f6, #2563eb)';
  if (score >= 4) return 'linear-gradient(135deg, #f59e0b, #d97706)';
  return 'linear-gradient(135deg, #ef4444, #dc2626)';
}

function getDimensionColor(dimension: string, value: number): string {
  const colors: Record<string, string[]> = {
    careerRelevance: ['#ef4444', '#f59e0b', '#3b82f6', '#10b981'],
    quality: ['#f97316', '#f59e0b', '#8b5cf6', '#10b981'],
    engagement: ['#ec4899', '#f59e0b', '#3b82f6', '#10b981'],
    authenticity: ['#ef4444', '#f59e0b', '#06b6d4', '#10b981'],
    growthPotential: ['#f97316', '#f59e0b', '#8b5cf6', '#10b981'],
    recency: ['#ef4444', '#f59e0b', '#3b82f6', '#10b981']
  };
  
  const palette = colors[dimension] ?? colors.careerRelevance;
  const idx = Math.min(Math.floor(value / 2.5), 3);
  return palette[idx];
}
