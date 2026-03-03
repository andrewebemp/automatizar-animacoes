import React, { useState } from 'react';
import type { VideoSegment, DisplayMode, RevealDirection } from '../../types/VideoSegment';
import type { Subtitle } from '../../types/Subtitle';

interface SegmentListProps {
  /** Lista de segmentos */
  segments: VideoSegment[];

  /** Lista de legendas (para exibir texto) */
  subtitles: Subtitle[];

  /** Índice do segmento selecionado */
  selectedIndex: number;

  /** Callback quando um segmento é selecionado */
  onSelect: (index: number) => void;

  /** Callback para atualizar um segmento */
  onUpdateSegment?: (segmentId: string, updates: Partial<VideoSegment>) => void;

  /** Callback para adicionar um segmento */
  onAddSegment?: (subtitleIndex: number) => void;

  /** Callback para remover um segmento */
  onRemoveSegment?: (segmentId: string) => void;

  /** FPS do vídeo (para calcular tempo) */
  fps: number;
}

const DISPLAY_MODE_OPTIONS: Array<{ value: DisplayMode; label: string }> = [
  { value: 'normal', label: 'Normal' },
  { value: 'zoom', label: 'Zoom' },
];

const REVEAL_DIRECTION_OPTIONS: Array<{ value: RevealDirection; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'center', label: 'Centro' },
  { value: 'left', label: 'Esquerda' },
  { value: 'right', label: 'Direita' },
  { value: 'top', label: 'Cima' },
  { value: 'bottom', label: 'Baixo' },
];

const REVEAL_PERCENTAGE_OPTIONS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

/**
 * Lista de segmentos com indicador de status e configurações por elemento.
 */
export const SegmentList: React.FC<SegmentListProps> = ({
  segments,
  subtitles,
  selectedIndex,
  onSelect,
  onUpdateSegment,
  onAddSegment,
  onRemoveSegment,
  fps,
}) => {
  const [expandedSegment, setExpandedSegment] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Formata tempo em segundos para MM:SS.mmm
  const formatTime = (timeMs: number): string => {
    const totalSeconds = timeMs / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const ms = Math.floor((totalSeconds % 1) * 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  };

  // Trunca texto longo
  const truncateText = (text: string, maxLength: number = 50): string => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  };

  const handleToggleExpand = (segmentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedSegment(expandedSegment === segmentId ? null : segmentId);
  };

  const handleRemoveSegment = (segmentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRemoveSegment && window.confirm('Remover este segmento?')) {
      onRemoveSegment(segmentId);
    }
  };

  // Encontra legendas disponíveis para adicionar (que não estão em nenhum segmento)
  const usedSubtitleIndices = new Set(segments.map((s) => s.subtitleIndex));
  const availableSubtitles = subtitles
    .map((sub, index) => ({ subtitle: sub, index }))
    .filter(({ index }) => !usedSubtitleIndices.has(index));

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: 8,
        backgroundColor: '#1a1a2e',
        borderRadius: 8,
        maxHeight: 'none',
        overflowY: 'auto',
      }}
    >
      {/* Header com contador e botão adicionar */}
      <div
        style={{
          padding: '8px 12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            color: '#888',
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          Segmentos ({segments.filter((s) => s.region).length}/{segments.length})
        </span>

        {onAddSegment && availableSubtitles.length > 0 && (
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              padding: '4px 10px',
              backgroundColor: '#22c55e',
              border: 'none',
              borderRadius: 4,
              color: 'white',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
            }}
            title="Adicionar segmento"
          >
            + Adicionar
          </button>
        )}
      </div>

      {/* Modal de adicionar segmento */}
      {showAddModal && onAddSegment && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowAddModal(false)}
        >
          <div
            style={{
              backgroundColor: '#1a1a2e',
              borderRadius: 12,
              padding: 20,
              maxWidth: 500,
              maxHeight: '80vh',
              overflow: 'auto',
              border: '1px solid #4a4a6e',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ color: 'white', margin: '0 0 16px 0' }}>
              Adicionar Segmento
            </h3>
            <p style={{ color: '#888', fontSize: 13, margin: '0 0 16px 0' }}>
              Selecione uma legenda para adicionar como segmento:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {availableSubtitles.map(({ subtitle, index }) => (
                <button
                  key={index}
                  onClick={() => {
                    onAddSegment(index);
                    setShowAddModal(false);
                  }}
                  style={{
                    padding: '12px 16px',
                    backgroundColor: '#2a2a4e',
                    border: '1px solid #4a4a6e',
                    borderRadius: 8,
                    color: 'white',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4, fontFamily: 'monospace' }}>
                    #{index + 1} | {formatTime(subtitle.startTime)} → {formatTime(subtitle.endTime)}
                  </div>
                  <div style={{ fontSize: 13 }}>
                    {truncateText(subtitle.text, 80)}
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowAddModal(false)}
              style={{
                marginTop: 16,
                padding: '10px 20px',
                backgroundColor: 'transparent',
                border: '1px solid #4a4a6e',
                borderRadius: 6,
                color: '#888',
                cursor: 'pointer',
                width: '100%',
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {segments.map((segment, index) => {
        const subtitle = subtitles[segment.subtitleIndex];
        const hasRegion = segment.region !== null && segment.region.pathData.length > 0;
        const isSelected = index === selectedIndex;
        const isExpanded = expandedSegment === segment.id;

        return (
          <div key={segment.id}>
            <button
              onClick={() => onSelect(index)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: '12px 16px',
                backgroundColor: isSelected ? '#2a2a4e' : 'transparent',
                border: isSelected ? '2px solid #6366f1' : '2px solid transparent',
                borderRadius: isExpanded ? '6px 6px 0 0' : 6,
                color: 'white',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                transition: 'all 0.15s',
              }}
            >
              {/* Indicador de status */}
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  backgroundColor: hasRegion ? '#22c55e' : '#ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  flexShrink: 0,
                }}
              >
                {hasRegion ? '✓' : index + 1}
              </div>

              {/* Conteúdo */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Tempo e badge de escala */}
                {subtitle && (
                  <div
                    style={{
                      fontSize: 11,
                      color: '#888',
                      marginBottom: 4,
                      fontFamily: 'monospace',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span>{formatTime(subtitle.startTime)} → {formatTime(subtitle.endTime)}</span>
                    {/* Badge de escala (mostra apenas se diferente de 100%) */}
                    {segment.scale && segment.scale !== 1.0 && (
                      <span
                        style={{
                          padding: '2px 6px',
                          backgroundColor: segment.scale > 1.0 ? '#22c55e' : '#f97316',
                          borderRadius: 4,
                          color: 'white',
                          fontSize: 10,
                          fontWeight: 'bold',
                        }}
                        title={`Escala: ${Math.round(segment.scale * 100)}%`}
                      >
                        {Math.round(segment.scale * 100)}%
                      </span>
                    )}
                  </div>
                )}

                {/* Texto da legenda */}
                <div
                  style={{
                    fontSize: 13,
                    lineHeight: 1.4,
                    color: isSelected ? '#fff' : '#ccc',
                    wordBreak: 'break-word',
                  }}
                >
                  {subtitle ? subtitle.text : 'Legenda não encontrada'}
                </div>

                {/* Info resumida de animação */}
                <div
                  style={{
                    fontSize: 11,
                    color: '#666',
                    marginTop: 4,
                  }}
                >
                  <span>Reveal: {segment.revealDirection}</span>
                </div>
              </div>

              {/* Botões de ação */}
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {/* Botão de expandir configurações */}
                {onUpdateSegment && (
                  <button
                    onClick={(e) => handleToggleExpand(segment.id, e)}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: isExpanded ? '#6366f1' : '#4a4a6e',
                      border: 'none',
                      borderRadius: 4,
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: 10,
                    }}
                    title="Configurações do segmento"
                  >
                    {isExpanded ? '▲' : '⚙'}
                  </button>
                )}

                {/* Botão de remover */}
                {onRemoveSegment && (
                  <button
                    onClick={(e) => handleRemoveSegment(segment.id, e)}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: '#ef4444',
                      border: 'none',
                      borderRadius: 4,
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: 10,
                    }}
                    title="Remover segmento"
                  >
                    ✕
                  </button>
                )}
              </div>
            </button>

            {/* Painel de configurações expandido */}
            {isExpanded && onUpdateSegment && (
              <div
                style={{
                  backgroundColor: '#2a2a4e',
                  borderRadius: '0 0 6px 6px',
                  padding: 12,
                  marginBottom: 4,
                  borderTop: '1px solid #4a4a6e',
                }}
              >
                {/* Exibição (Display Mode) */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ color: '#888', fontSize: 11, display: 'block', marginBottom: 4 }}>
                    Exibição
                  </label>
                  <select
                    value={segment.displayMode}
                    onChange={(e) =>
                      onUpdateSegment(segment.id, { displayMode: e.target.value as DisplayMode })
                    }
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      backgroundColor: '#1a1a2e',
                      border: '1px solid #4a4a6e',
                      borderRadius: 4,
                      color: 'white',
                      fontSize: 12,
                    }}
                  >
                    {DISPLAY_MODE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Animação (Reveal Direction) */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ color: '#888', fontSize: 11, display: 'block', marginBottom: 4 }}>
                    Animação
                  </label>
                  <select
                    value={segment.revealDirection}
                    onChange={(e) =>
                      onUpdateSegment(segment.id, { revealDirection: e.target.value as RevealDirection })
                    }
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      backgroundColor: '#1a1a2e',
                      border: '1px solid #4a4a6e',
                      borderRadius: 4,
                      color: 'white',
                      fontSize: 12,
                    }}
                  >
                    {REVEAL_DIRECTION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Reveal % */}
                <div>
                  <label style={{ color: '#888', fontSize: 11, display: 'block', marginBottom: 4 }}>
                    Reveal %
                  </label>
                  <select
                    value={Math.round(segment.revealFraction * 100)}
                    onChange={(e) =>
                      onUpdateSegment(segment.id, { revealFraction: parseInt(e.target.value) / 100 })
                    }
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      backgroundColor: '#1a1a2e',
                      border: '1px solid #4a4a6e',
                      borderRadius: 4,
                      color: 'white',
                      fontSize: 12,
                    }}
                  >
                    {REVEAL_PERCENTAGE_OPTIONS.map((pct) => (
                      <option key={pct} value={pct}>
                        {pct}%{pct === 60 ? ' (padrão)' : pct === 0 ? ' (instantâneo)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {segments.length === 0 && (
        <div
          style={{
            padding: 20,
            textAlign: 'center',
            color: '#666',
            fontSize: 14,
          }}
        >
          Nenhum segmento disponível
          {onAddSegment && availableSubtitles.length > 0 && (
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                marginTop: 12,
                padding: '8px 16px',
                backgroundColor: '#22c55e',
                border: 'none',
                borderRadius: 6,
                color: 'white',
                cursor: 'pointer',
                display: 'block',
                margin: '12px auto 0',
              }}
            >
              + Adicionar segmento
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default SegmentList;
