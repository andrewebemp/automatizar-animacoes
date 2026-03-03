import React, { useState } from 'react';
import { ApiSettings } from './ApiSettings';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'api' | 'general';

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: 'linear-gradient(135deg, #1e1e2e 0%, #2d2d44 100%)',
    borderRadius: '16px',
    width: '600px',
    maxHeight: '80vh',
    overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },
  title: {
    fontSize: '20px',
    fontWeight: 600,
    color: '#fff',
    margin: 0,
  },
  closeButton: {
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    fontSize: '24px',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.2s',
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    padding: '0 16px',
  },
  tab: {
    padding: '12px 20px',
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    position: 'relative' as const,
    transition: 'color 0.2s',
  },
  tabActive: {
    color: '#fff',
  },
  tabIndicator: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    height: '2px',
    background: 'linear-gradient(90deg, #7c3aed, #00d4ff)',
    borderRadius: '2px 2px 0 0',
  },
  content: {
    overflowY: 'auto' as const,
    maxHeight: 'calc(80vh - 140px)',
  },
  generalSettings: {
    padding: '16px',
  },
  formGroup: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    marginBottom: '6px',
    color: '#94a3b8',
    fontSize: '13px',
  },
  hint: {
    fontSize: '12px',
    color: '#64748b',
    marginTop: '8px',
  },
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('api');

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div style={styles.overlay} onClick={handleOverlayClick}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>Configurações</h2>
          <button
            style={styles.closeButton}
            onClick={onClose}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          >
            ×
          </button>
        </div>

        <div style={styles.tabs}>
          <button
            style={{
              ...styles.tab,
              ...(activeTab === 'api' ? styles.tabActive : {}),
            }}
            onClick={() => setActiveTab('api')}
          >
            APIs
            {activeTab === 'api' && <div style={styles.tabIndicator} />}
          </button>
          <button
            style={{
              ...styles.tab,
              ...(activeTab === 'general' ? styles.tabActive : {}),
            }}
            onClick={() => setActiveTab('general')}
          >
            Geral
            {activeTab === 'general' && <div style={styles.tabIndicator} />}
          </button>
        </div>

        <div style={styles.content}>
          {activeTab === 'api' && <ApiSettings />}
          {activeTab === 'general' && (
            <div style={styles.generalSettings}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Configurações Gerais</label>
                <p style={styles.hint}>
                  Configurações adicionais serão adicionadas em futuras versões.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
