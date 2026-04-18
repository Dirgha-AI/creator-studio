import React, { useState, useCallback } from 'react';
import { SidepanelConfig } from '../../interfaces/ContentTypes';

interface SidepanelShellProps {
  config: SidepanelConfig;
  children: React.ReactNode;
  onClose?: () => void;
}

interface ThemeStyles {
  bg: string;
  text: string;
  border: string;
  accent: string;
}

export const SidepanelShell: React.FC<SidepanelShellProps> = ({
  config,
  children,
  onClose
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState(config.initialTab ?? 'queue');

  const width = config.width ?? 380;
  const position = config.position ?? 'right';
  const theme = useTheme(config.theme ?? 'auto');

  const toggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  const containerStyles: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    [position]: 0,
    width: isCollapsed ? 48 : width,
    height: '100vh',
    background: theme.bg,
    color: theme.text,
    borderLeft: position === 'right' ? `1px solid ${theme.border}` : 'none',
    borderRight: position === 'left' ? `1px solid ${theme.border}` : 'none',
    boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    transition: 'width 0.3s ease',
    overflow: 'hidden'
  };

  return (
    <div style={containerStyles} data-testid="creator-os-sidepanel">
      <Header
        title={config.title}
        theme={theme}
        isCollapsed={isCollapsed}
        onToggle={toggleCollapse}
        onClose={handleClose}
      />
      
      {!isCollapsed && (
        <>
          <TabBar activeTab={activeTab} onChange={setActiveTab} theme={theme} />
          <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
            {children}
          </div>
        </>
      )}
    </div>
  );

  function handleClose() {
    onClose?.();
    config.onClose?.();
  }
};

function useTheme(theme: 'light' | 'dark' | 'auto'): ThemeStyles {
  const isDark = theme === 'dark' || 
    (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  
  return isDark
    ? { bg: '#1a1a1a', text: '#fff', border: '#333', accent: '#3b82f6' }
    : { bg: '#fff', text: '#111', border: '#e5e5e5', accent: '#2563eb' };
}

const Header: React.FC<{
  title: string;
  theme: ThemeStyles;
  isCollapsed: boolean;
  onToggle: () => void;
  onClose: () => void;
}> = ({ title, theme, isCollapsed, onToggle, onClose }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: `1px solid ${theme.border}`,
    gap: 8
  }}>
    <button onClick={onToggle} style={buttonStyle(theme)}>
      {isCollapsed ? '→' : '←'}
    </button>
    {!isCollapsed && (
      <>
        <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{title}</span>
        <button onClick={onClose} style={buttonStyle(theme)}>×</button>
      </>
    )}
  </div>
);

const TabBar: React.FC<{
  activeTab: string;
  onChange: (tab: string) => void;
  theme: ThemeStyles;
}> = ({ activeTab, onChange, theme }) => {
  const tabs = ['queue', 'analytics', 'settings'];
  return (
    <div style={{ display: 'flex', borderBottom: `1px solid ${theme.border}` }}>
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          style={{
            flex: 1,
            padding: '12px 8px',
            border: 'none',
            background: activeTab === tab ? theme.accent + '20' : 'transparent',
            color: activeTab === tab ? theme.accent : theme.text,
            cursor: 'pointer',
            fontSize: 12,
            textTransform: 'capitalize',
            fontWeight: activeTab === tab ? 600 : 400
          }}
        >
          {tab}
        </button>
      ))}
    </div>
  );
};

const buttonStyle = (theme: ThemeStyles): React.CSSProperties => ({
  background: 'transparent',
  border: `1px solid ${theme.border}`,
  color: theme.text,
  width: 28,
  height: 28,
  borderRadius: 4,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 14
});
