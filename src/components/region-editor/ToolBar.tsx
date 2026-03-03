import React from 'react';
import type { DrawingTool } from './RegionCanvas';

interface ToolBarProps {
  /** Ferramenta atualmente selecionada */
  currentTool: DrawingTool;

  /** Callback quando a ferramenta muda */
  onToolChange: (tool: DrawingTool) => void;

  /** Callback para limpar a região do segmento atual */
  onClearRegion?: () => void;

  /** Callback para selecionar toda a imagem como região */
  onSelectAll?: () => void;

  /** Callback para detectar regiões com IA */
  onAIDetect?: () => void;

  /** Se a detecção por IA está em progresso */
  isAIDetecting?: boolean;

  /** Se há uma região para limpar */
  hasRegion?: boolean;

  /** Se há pontos de polígono em progresso */
  hasPolygonPoints?: boolean;

  /** Se há traços de borracha para desfazer */
  hasErasedStrokes?: boolean;

  /** Callback para limpar todos os traços de borracha */
  onClearErasedStrokes?: () => void;

  /** Callback para aumentar a região selecionada */
  onScaleUp?: () => void;

  /** Callback para reduzir a região selecionada */
  onScaleDown?: () => void;

  /** Callback para desfazer última ação */
  onUndo?: () => void;

  /** Se há ações no histórico para desfazer */
  canUndo?: boolean;

  /** Callback para refazer última ação desfeita */
  onRedo?: () => void;

  /** Se há ações no histórico para refazer */
  canRedo?: boolean;

  /** Callback para mover marcação para o segmento anterior */
  onMoveRegionToPrevious?: () => void;

  /** Callback para mover marcação para o próximo segmento */
  onMoveRegionToNext?: () => void;

  /** Se pode mover para o segmento anterior */
  canMoveRegionToPrevious?: boolean;

  /** Se pode mover para o próximo segmento */
  canMoveRegionToNext?: boolean;

  /** Callback para mover a posição do elemento na cena */
  onMovePosition?: (direction: 'up' | 'down' | 'left' | 'right') => void;

  /** Callback para resetar a posição do elemento */
  onResetPosition?: () => void;

  /** Se o elemento tem offset aplicado */
  hasOffset?: boolean;
}

/**
 * Barra de ferramentas para o editor de regiões.
 */
export const ToolBar: React.FC<ToolBarProps> = ({
  currentTool,
  onToolChange,
  onClearRegion,
  onSelectAll,
  onAIDetect,
  isAIDetecting = false,
  hasRegion = false,
  hasPolygonPoints = false,
  hasErasedStrokes = false,
  onClearErasedStrokes,
  onScaleUp,
  onScaleDown,
  onUndo,
  canUndo = false,
  onRedo,
  canRedo = false,
  onMoveRegionToPrevious,
  onMoveRegionToNext,
  canMoveRegionToPrevious = false,
  canMoveRegionToNext = false,
  onMovePosition,
  onResetPosition,
  hasOffset = false,
}) => {
  // Estado para mostrar/ocultar o popover de posição
  const [showPositionPopover, setShowPositionPopover] = React.useState(false);
  // Botão Limpar fica ativo se tem região OU pontos de polígono em progresso
  const canClear = hasRegion || hasPolygonPoints;
  // Handler para toggle de ferramenta (clicar na mesma ferramenta volta para 'select')
  const handleToolClick = (toolId: DrawingTool) => {
    if (currentTool === toolId) {
      onToolChange('select');
    } else {
      onToolChange(toolId);
    }
  };
  const tools: Array<{ id: DrawingTool; label: string; icon: string }> = [
    { id: 'select', label: 'Selecionar', icon: '👆' },
    { id: 'rect', label: 'Retângulo', icon: '⬜' },
    { id: 'freehand', label: 'Freehand', icon: '✏️' },
    { id: 'polygon', label: 'Pontos', icon: '📍' },
    { id: 'eraser', label: 'Borracha', icon: '🧽' },
  ];

  // Ação para selecionar toda a imagem
  const handleSelectAll = () => {
    if (onSelectAll) {
      onSelectAll();
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        padding: '8px 12px',
        backgroundColor: '#2a2a3e',
        borderRadius: 8,
        alignItems: 'center',
        minWidth: 'fit-content',
        whiteSpace: 'nowrap',
      }}
    >
      {/* Ferramentas de desenho */}
      <div style={{ display: 'flex', gap: 4 }}>
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => handleToolClick(tool.id)}
            style={{
              padding: '6px 10px',
              backgroundColor: currentTool === tool.id ? '#4a4a6e' : 'transparent',
              border: currentTool === tool.id ? '2px solid #6366f1' : '2px solid transparent',
              borderRadius: 6,
              color: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 13,
              transition: 'all 0.2s',
            }}
            title={tool.label}
          >
            <span>{tool.icon}</span>
            <span>{tool.label}</span>
          </button>
        ))}

        {/* Botão Tudo - seleciona toda a imagem */}
        {onSelectAll && (
          <button
            onClick={handleSelectAll}
            style={{
              padding: '6px 10px',
              backgroundColor: '#22c55e',
              border: '2px solid transparent',
              borderRadius: 6,
              color: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 13,
              transition: 'all 0.2s',
            }}
            title="Selecionar toda a imagem"
          >
            <span>🖼️</span>
            <span>Todo</span>
          </button>
        )}
      </div>

      {/* Separador */}
      <div
        style={{
          width: 1,
          height: 24,
          backgroundColor: '#4a4a6e',
          margin: '0 8px',
        }}
      />

      {/* Botões de escala (aumentar/reduzir) */}
      <div style={{ display: 'flex', gap: 4 }}>
        {onScaleDown && (
          <button
            onClick={onScaleDown}
            disabled={!hasRegion}
            style={{
              padding: '6px 10px',
              backgroundColor: hasRegion ? '#3b82f6' : '#4a4a6e',
              border: 'none',
              borderRadius: 6,
              color: 'white',
              cursor: hasRegion ? 'pointer' : 'not-allowed',
              opacity: hasRegion ? 1 : 0.5,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 13,
            }}
            title="Reduzir região (10%)"
          >
            <span>➖</span>
            <span>Reduzir</span>
          </button>
        )}
        {onScaleUp && (
          <button
            onClick={onScaleUp}
            disabled={!hasRegion}
            style={{
              padding: '6px 10px',
              backgroundColor: hasRegion ? '#3b82f6' : '#4a4a6e',
              border: 'none',
              borderRadius: 6,
              color: 'white',
              cursor: hasRegion ? 'pointer' : 'not-allowed',
              opacity: hasRegion ? 1 : 0.5,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 13,
            }}
            title="Aumentar região (10%)"
          >
            <span>➕</span>
            <span>Aumentar</span>
          </button>
        )}

        {/* Botão Local - mover posição do elemento */}
        {onMovePosition && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowPositionPopover(!showPositionPopover)}
              disabled={!hasRegion}
              style={{
                padding: '6px 10px',
                backgroundColor: hasRegion ? (hasOffset ? '#22c55e' : '#8b5cf6') : '#4a4a6e',
                border: 'none',
                borderRadius: 6,
                color: 'white',
                cursor: hasRegion ? 'pointer' : 'not-allowed',
                opacity: hasRegion ? 1 : 0.5,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 13,
              }}
              title="Mover posição do elemento na cena"
            >
              <span>📍</span>
              <span>Local</span>
            </button>

            {/* Popover com controles direcionais */}
            {showPositionPopover && hasRegion && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginTop: 8,
                  backgroundColor: '#2a2a4e',
                  borderRadius: 8,
                  padding: 12,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                  zIndex: 1000,
                  minWidth: 140,
                }}
              >
                {/* Título */}
                <div
                  style={{
                    fontSize: 11,
                    color: '#888',
                    textAlign: 'center',
                    marginBottom: 8,
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  Mover Elemento
                </div>

                {/* Grid de setas */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 4,
                    marginBottom: 8,
                  }}
                >
                  {/* Linha 1: vazio, cima, vazio */}
                  <div />
                  <button
                    onClick={() => onMovePosition('up')}
                    style={{
                      padding: 8,
                      backgroundColor: '#4a4a6e',
                      border: 'none',
                      borderRadius: 4,
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: 16,
                    }}
                    title="Mover para cima"
                  >
                    ⬆️
                  </button>
                  <div />

                  {/* Linha 2: esquerda, centro, direita */}
                  <button
                    onClick={() => onMovePosition('left')}
                    style={{
                      padding: 8,
                      backgroundColor: '#4a4a6e',
                      border: 'none',
                      borderRadius: 4,
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: 16,
                    }}
                    title="Mover para esquerda"
                  >
                    ⬅️
                  </button>
                  {onResetPosition && (
                    <button
                      onClick={onResetPosition}
                      disabled={!hasOffset}
                      style={{
                        padding: 8,
                        backgroundColor: hasOffset ? '#ef4444' : '#3a3a5e',
                        border: 'none',
                        borderRadius: 4,
                        color: 'white',
                        cursor: hasOffset ? 'pointer' : 'not-allowed',
                        fontSize: 12,
                        opacity: hasOffset ? 1 : 0.5,
                      }}
                      title="Resetar posição"
                    >
                      ✕
                    </button>
                  )}
                  <button
                    onClick={() => onMovePosition('right')}
                    style={{
                      padding: 8,
                      backgroundColor: '#4a4a6e',
                      border: 'none',
                      borderRadius: 4,
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: 16,
                    }}
                    title="Mover para direita"
                  >
                    ➡️
                  </button>

                  {/* Linha 3: vazio, baixo, vazio */}
                  <div />
                  <button
                    onClick={() => onMovePosition('down')}
                    style={{
                      padding: 8,
                      backgroundColor: '#4a4a6e',
                      border: 'none',
                      borderRadius: 4,
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: 16,
                    }}
                    title="Mover para baixo"
                  >
                    ⬇️
                  </button>
                  <div />
                </div>

                {/* Dica */}
                <div
                  style={{
                    fontSize: 10,
                    color: '#666',
                    textAlign: 'center',
                  }}
                >
                  Move 50px por clique
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Separador */}
      <div
        style={{
          width: 1,
          height: 24,
          backgroundColor: '#4a4a6e',
          margin: '0 8px',
        }}
      />

      {/* Botões para mover marcação entre segmentos */}
      {(onMoveRegionToPrevious || onMoveRegionToNext) && (
        <>
          <div style={{ display: 'flex', gap: 4 }}>
            {onMoveRegionToPrevious && (
              <button
                onClick={onMoveRegionToPrevious}
                disabled={!canMoveRegionToPrevious}
                style={{
                  padding: '6px 10px',
                  backgroundColor: canMoveRegionToPrevious ? '#8b5cf6' : '#4a4a6e',
                  border: 'none',
                  borderRadius: 6,
                  color: 'white',
                  cursor: canMoveRegionToPrevious ? 'pointer' : 'not-allowed',
                  opacity: canMoveRegionToPrevious ? 1 : 0.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 13,
                }}
                title="Mover marcação para o segmento anterior"
              >
                <span>⬆️</span>
                <span>Mover ↑</span>
              </button>
            )}
            {onMoveRegionToNext && (
              <button
                onClick={onMoveRegionToNext}
                disabled={!canMoveRegionToNext}
                style={{
                  padding: '6px 10px',
                  backgroundColor: canMoveRegionToNext ? '#8b5cf6' : '#4a4a6e',
                  border: 'none',
                  borderRadius: 6,
                  color: 'white',
                  cursor: canMoveRegionToNext ? 'pointer' : 'not-allowed',
                  opacity: canMoveRegionToNext ? 1 : 0.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 13,
                }}
                title="Mover marcação para o próximo segmento"
              >
                <span>⬇️</span>
                <span>Mover ↓</span>
              </button>
            )}
          </div>

          {/* Separador */}
          <div
            style={{
              width: 1,
              height: 24,
              backgroundColor: '#4a4a6e',
              margin: '0 8px',
            }}
          />
        </>
      )}

      {/* Botões Desfazer e Refazer */}
      <div style={{ display: 'flex', gap: 4 }}>
        {onUndo && (
          <button
            onClick={onUndo}
            disabled={!canUndo}
            style={{
              padding: '6px 10px',
              backgroundColor: canUndo ? '#f59e0b' : '#4a4a6e',
              border: 'none',
              borderRadius: 6,
              color: 'white',
              cursor: canUndo ? 'pointer' : 'not-allowed',
              opacity: canUndo ? 1 : 0.5,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 13,
            }}
            title="Desfazer (Ctrl+Z)"
          >
            <span>↩️</span>
            <span>Desfazer</span>
          </button>
        )}
        {onRedo && (
          <button
            onClick={onRedo}
            disabled={!canRedo}
            style={{
              padding: '6px 10px',
              backgroundColor: canRedo ? '#f59e0b' : '#4a4a6e',
              border: 'none',
              borderRadius: 6,
              color: 'white',
              cursor: canRedo ? 'pointer' : 'not-allowed',
              opacity: canRedo ? 1 : 0.5,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 13,
            }}
            title="Refazer (Ctrl+Y)"
          >
            <span>↪️</span>
            <span>Refazer</span>
          </button>
        )}
      </div>

      {/* Separador */}
      <div
        style={{
          width: 1,
          height: 24,
          backgroundColor: '#4a4a6e',
          margin: '0 8px',
        }}
      />

      {/* Ações */}
      {onClearRegion && (
        <button
          onClick={onClearRegion}
          disabled={!canClear}
          style={{
            padding: '6px 10px',
            backgroundColor: canClear ? '#ef4444' : '#4a4a6e',
            border: 'none',
            borderRadius: 6,
            color: 'white',
            cursor: canClear ? 'pointer' : 'not-allowed',
            opacity: canClear ? 1 : 0.5,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 13,
          }}
          title="Limpar região"
        >
          <span>🗑️</span>
          <span>Limpar</span>
        </button>
      )}

      {onClearErasedStrokes && (
        <button
          onClick={onClearErasedStrokes}
          disabled={!hasErasedStrokes}
          style={{
            padding: '6px 10px',
            backgroundColor: hasErasedStrokes ? '#f97316' : '#4a4a6e',
            border: 'none',
            borderRadius: 6,
            color: 'white',
            cursor: hasErasedStrokes ? 'pointer' : 'not-allowed',
            opacity: hasErasedStrokes ? 1 : 0.5,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 13,
          }}
          title="Desfazer borracha"
        >
          <span>↩️</span>
          <span>Desfazer Borracha</span>
        </button>
      )}

      {onAIDetect && (
        <button
          onClick={onAIDetect}
          disabled={isAIDetecting}
          style={{
            padding: '6px 10px',
            backgroundColor: isAIDetecting ? '#4a4a6e' : '#8b5cf6',
            border: 'none',
            borderRadius: 6,
            color: 'white',
            cursor: isAIDetecting ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 13,
          }}
          title="Detectar regiões com IA"
        >
          <span>{isAIDetecting ? '⏳' : '🤖'}</span>
          <span>{isAIDetecting ? 'Detectando...' : 'IA Detectar'}</span>
        </button>
      )}
    </div>
  );
};

export default ToolBar;
