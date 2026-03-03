import React from 'react';

export type ProjectMode = 'srt' | 'timeline';

interface ModeSelectorProps {
  /** Callback quando um modo é selecionado */
  onSelectMode: (mode: ProjectMode) => void;

  /** Callback para carregar projeto existente (opcional) */
  onLoadProject?: () => void;
}

/**
 * Tela inicial de seleção de modo de trabalho.
 * Permite escolher entre Modo SRT (importar arquivo) ou Modo Timeline (criar cortes no áudio).
 */
export const ModeSelector: React.FC<ModeSelectorProps> = ({
  onSelectMode,
  onLoadProject,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#1a1a2e',
        padding: 40,
      }}
    >
      {/* Título */}
      <h1
        style={{
          color: '#fff',
          fontSize: 36,
          fontWeight: 700,
          marginBottom: 16,
          textAlign: 'center',
        }}
      >
        Automatizar Animacoes
      </h1>

      <p
        style={{
          color: '#a0a0b0',
          fontSize: 18,
          marginBottom: 48,
          textAlign: 'center',
        }}
      >
        Escolha o modo de trabalho:
      </p>

      {/* Cards de seleção */}
      <div
        style={{
          display: 'flex',
          gap: 32,
          flexWrap: 'wrap',
          justifyContent: 'center',
          marginBottom: 48,
        }}
      >
        {/* Card Modo SRT */}
        <button
          onClick={() => onSelectMode('srt')}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: 32,
            width: 280,
            backgroundColor: '#2a2a3e',
            border: '2px solid #4a4a6e',
            borderRadius: 16,
            cursor: 'pointer',
            transition: 'all 0.3s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#6366f1';
            e.currentTarget.style.transform = 'translateY(-4px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#4a4a6e';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          {/* Ícone */}
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 16,
              backgroundColor: '#6366f1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 20,
            }}
          >
            <span style={{ fontSize: 40 }}>SRT</span>
          </div>

          {/* Título do modo */}
          <h2
            style={{
              color: '#fff',
              fontSize: 24,
              fontWeight: 600,
              marginBottom: 12,
            }}
          >
            Modo SRT
          </h2>

          {/* Descrição */}
          <p
            style={{
              color: '#a0a0b0',
              fontSize: 14,
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            Importar arquivo SRT com tempos já definidos.
            As legendas determinam quando cada elemento aparece.
          </p>
        </button>

        {/* Card Modo Timeline */}
        <button
          onClick={() => onSelectMode('timeline')}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: 32,
            width: 280,
            backgroundColor: '#2a2a3e',
            border: '2px solid #4a4a6e',
            borderRadius: 16,
            cursor: 'pointer',
            transition: 'all 0.3s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#22c55e';
            e.currentTarget.style.transform = 'translateY(-4px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#4a4a6e';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          {/* Ícone */}
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 16,
              backgroundColor: '#22c55e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 20,
            }}
          >
            <span style={{ fontSize: 36 }}>TL</span>
          </div>

          {/* Título do modo */}
          <h2
            style={{
              color: '#fff',
              fontSize: 24,
              fontWeight: 600,
              marginBottom: 12,
            }}
          >
            Modo Timeline
          </h2>

          {/* Descrição */}
          <p
            style={{
              color: '#a0a0b0',
              fontSize: 14,
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            Criar timeline visual com áudio.
            Defina os cortes e elementos diretamente na interface.
          </p>
        </button>
      </div>

      {/* Botão para carregar projeto */}
      {onLoadProject && (
        <button
          onClick={onLoadProject}
          style={{
            padding: '12px 32px',
            backgroundColor: 'transparent',
            border: '1px solid #4a4a6e',
            borderRadius: 8,
            color: '#a0a0b0',
            fontSize: 16,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#6366f1';
            e.currentTarget.style.color = '#fff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#4a4a6e';
            e.currentTarget.style.color = '#a0a0b0';
          }}
        >
          Carregar Projeto Existente
        </button>
      )}
    </div>
  );
};

export default ModeSelector;
