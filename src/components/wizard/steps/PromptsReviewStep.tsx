import React, { useState, useCallback, useMemo } from 'react';
import type { ImageBlock } from '../../../types/ImageBlock';
import type { Subtitle } from '../../../types/Subtitle';
import {
  formatTime,
  generateTimelineText,
  subtitlesToSegments,
  regenerateBlocksWithAspectRatio,
  redistributeElementsAcrossBlocks,
  type AspectRatioType,
} from '../../../utils/promptGenerator';

interface PromptsReviewStepProps {
  imageBlocks: ImageBlock[];
  subtitles: Subtitle[];
  fps?: number;
  onUpdateBlock: (blockId: string, updates: Partial<ImageBlock>) => void;
  onSetImageBlocks: (blocks: ImageBlock[]) => void;
  onContinue: () => void;
}

const ASPECT_RATIO_OPTIONS: { value: AspectRatioType; label: string }[] = [
  { value: '16:9', label: '16:9 (YouTube/TV)' },
  { value: '9:16', label: '9:16 (Reels/TikTok/Shorts)' },
  { value: '1:1', label: '1:1 (Instagram)' },
];

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '24px',
    paddingBottom: '48px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
    flexWrap: 'wrap' as const,
    gap: '16px',
  },
  headerLeft: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap' as const,
  },
  aspectRatioContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  aspectRatioLabel: {
    fontSize: '13px',
    color: '#94a3b8',
    fontWeight: 500,
  },
  aspectRatioSelect: {
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(124, 58, 237, 0.4)',
    background: 'rgba(124, 58, 237, 0.1)',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    outline: 'none',
    minWidth: '180px',
  },
  title: {
    fontSize: '20px',
    fontWeight: 600,
    color: '#fff',
  },
  subtitle: {
    fontSize: '14px',
    color: '#94a3b8',
    marginTop: '4px',
  },
  actions: {
    display: 'flex',
    gap: '12px',
  },
  actionButton: {
    padding: '10px 16px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    background: 'rgba(255, 255, 255, 0.05)',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'all 0.2s',
  },
  // Navegação entre imagens
  navigationContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    marginBottom: '20px',
    padding: '16px',
    background: 'rgba(124, 58, 237, 0.1)',
    borderRadius: '12px',
    border: '1px solid rgba(124, 58, 237, 0.2)',
  },
  navButton: {
    padding: '12px 20px',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(135deg, #7c3aed, #00d4ff)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    transition: 'all 0.2s',
  },
  navButtonDisabled: {
    padding: '12px 20px',
    borderRadius: '8px',
    border: 'none',
    background: 'rgba(255, 255, 255, 0.1)',
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'not-allowed',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  navInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '4px',
  },
  navCurrent: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#fff',
  },
  navTotal: {
    fontSize: '12px',
    color: '#94a3b8',
  },
  navDots: {
    display: 'flex',
    gap: '6px',
    marginTop: '4px',
  },
  navDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  navDotActive: {
    background: 'linear-gradient(135deg, #7c3aed, #00d4ff)',
    transform: 'scale(1.2)',
  },
  navDotInactive: {
    background: 'rgba(255, 255, 255, 0.2)',
  },
  // Bloco atual
  block: {
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  blockHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px',
    background: 'rgba(124, 58, 237, 0.1)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },
  blockTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#fff',
  },
  blockTime: {
    fontSize: '13px',
    color: '#94a3b8',
  },
  blockContent: {
    padding: '16px',
  },
  promptLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#7c3aed',
    marginBottom: '8px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  promptText: {
    width: '100%',
    minHeight: '200px',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(0, 0, 0, 0.3)',
    color: '#fff',
    fontSize: '13px',
    fontFamily: 'monospace',
    resize: 'vertical' as const,
    lineHeight: 1.5,
    boxSizing: 'border-box' as const,
  },
  copyButton: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: 'none',
    background: 'rgba(124, 58, 237, 0.2)',
    color: '#a78bfa',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  timelineSection: {
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
  },
  timelineLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#00d4ff',
    marginBottom: '12px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  timelineList: {
    maxHeight: '400px',
    overflowY: 'auto' as const,
    paddingRight: '8px',
  },
  timelineItem: {
    display: 'flex',
    gap: '12px',
    padding: '10px 12px',
    background: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '6px',
    marginBottom: '8px',
  },
  timelineNumber: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #7c3aed, #00d4ff)',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  timelineContent: {
    flex: 1,
  },
  timelineTime: {
    fontSize: '11px',
    color: '#64748b',
    marginBottom: '4px',
  },
  timelineText: {
    fontSize: '13px',
    color: '#94a3b8',
  },
  continueButton: {
    padding: '14px 28px',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(135deg, #7c3aed, #00d4ff)',
    color: '#fff',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '24px',
    width: '100%',
    transition: 'all 0.2s',
  },
  // Seção de distribuição de elementos
  distributionSection: {
    background: 'rgba(0, 212, 255, 0.1)',
    borderRadius: '12px',
    border: '1px solid rgba(0, 212, 255, 0.3)',
    padding: '20px',
    marginBottom: '24px',
  },
  distributionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  distributionTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#00d4ff',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  distributionSubtitle: {
    fontSize: '13px',
    color: '#94a3b8',
    marginTop: '4px',
  },
  distributionGrid: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '12px',
    marginBottom: '16px',
  },
  distributionItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '8px',
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '8px',
    padding: '12px 16px',
    minWidth: '100px',
  },
  distributionLabel: {
    fontSize: '12px',
    color: '#94a3b8',
    fontWeight: 500,
  },
  distributionInputContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  distributionInput: {
    width: '50px',
    padding: '8px',
    borderRadius: '6px',
    border: '1px solid rgba(0, 212, 255, 0.4)',
    background: 'rgba(0, 0, 0, 0.3)',
    color: '#fff',
    fontSize: '16px',
    fontWeight: 600,
    textAlign: 'center' as const,
    outline: 'none',
  },
  distributionButton: {
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    border: 'none',
    background: 'rgba(124, 58, 237, 0.3)',
    color: '#a78bfa',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
  },
  distributionTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '8px',
    marginBottom: '12px',
  },
  distributionTotalLabel: {
    fontSize: '14px',
    color: '#94a3b8',
  },
  distributionTotalValue: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#fff',
  },
  distributionTotalError: {
    color: '#ef4444',
  },
  distributionTotalSuccess: {
    color: '#22c55e',
  },
  applyButton: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(135deg, #00d4ff, #7c3aed)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  applyButtonDisabled: {
    background: 'rgba(255, 255, 255, 0.1)',
    color: 'rgba(255, 255, 255, 0.3)',
    cursor: 'not-allowed',
  },
  addRemoveBlockButtons: {
    display: 'flex',
    gap: '8px',
    marginLeft: 'auto',
  },
  blockControlButton: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid rgba(124, 58, 237, 0.4)',
    background: 'rgba(124, 58, 237, 0.1)',
    color: '#a78bfa',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    transition: 'all 0.2s',
  },
};

export const PromptsReviewStep: React.FC<PromptsReviewStepProps> = ({
  imageBlocks,
  subtitles,
  fps = 30,
  onUpdateBlock,
  onSetImageBlocks,
  onContinue,
}) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioType>('16:9');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showDistribution, setShowDistribution] = useState(false);

  // Estado para a distribuição manual de elementos
  const [elementDistribution, setElementDistribution] = useState<number[]>(() =>
    imageBlocks.map(block => block.timeline.length)
  );

  // Calcula o total de elementos
  const totalElements = useMemo(() =>
    imageBlocks.reduce((sum, block) => sum + block.timeline.length, 0),
    [imageBlocks]
  );

  // Calcula a soma atual da distribuição
  const currentDistributionSum = useMemo(() =>
    elementDistribution.reduce((sum, count) => sum + count, 0),
    [elementDistribution]
  );

  // Verifica se a distribuição é válida
  const isDistributionValid = currentDistributionSum === totalElements &&
    elementDistribution.every(count => count >= 1);

  const handleAspectRatioChange = useCallback(
    (newRatio: AspectRatioType) => {
      setAspectRatio(newRatio);
      // Regenerar os blocos com o novo aspect ratio
      const segments = subtitlesToSegments(subtitles);
      const newBlocks = regenerateBlocksWithAspectRatio(
        imageBlocks,
        segments,
        newRatio
      );
      onSetImageBlocks(newBlocks);
    },
    [imageBlocks, subtitles, onSetImageBlocks]
  );

  // Atualiza a distribuição quando os imageBlocks mudam
  React.useEffect(() => {
    setElementDistribution(imageBlocks.map(block => block.timeline.length));
  }, [imageBlocks.length]);

  // Handlers para a distribuição de elementos
  const handleDistributionChange = useCallback((index: number, value: number) => {
    setElementDistribution(prev => {
      const newDistribution = [...prev];
      newDistribution[index] = Math.max(1, value); // Mínimo de 1 elemento
      return newDistribution;
    });
  }, []);

  const handleIncrementElement = useCallback((index: number) => {
    setElementDistribution(prev => {
      const newDistribution = [...prev];
      newDistribution[index] = (newDistribution[index] || 0) + 1;
      return newDistribution;
    });
  }, []);

  const handleDecrementElement = useCallback((index: number) => {
    setElementDistribution(prev => {
      const newDistribution = [...prev];
      if (newDistribution[index] > 1) {
        newDistribution[index] = newDistribution[index] - 1;
      }
      return newDistribution;
    });
  }, []);

  const handleAddBlock = useCallback(() => {
    setElementDistribution(prev => {
      // Tenta pegar 1 elemento do último bloco que tem mais de 1
      const newDistribution = [...prev];
      for (let i = newDistribution.length - 1; i >= 0; i--) {
        if (newDistribution[i] > 1) {
          newDistribution[i] -= 1;
          break;
        }
      }
      newDistribution.push(1);
      return newDistribution;
    });
  }, []);

  const handleRemoveBlock = useCallback((index: number) => {
    setElementDistribution(prev => {
      if (prev.length <= 1) return prev;
      const newDistribution = [...prev];
      const removedCount = newDistribution[index];
      newDistribution.splice(index, 1);
      // Adiciona os elementos removidos ao bloco anterior ou próximo
      if (index > 0) {
        newDistribution[index - 1] += removedCount;
      } else if (newDistribution.length > 0) {
        newDistribution[0] += removedCount;
      }
      return newDistribution;
    });
  }, []);

  const handleApplyDistribution = useCallback(() => {
    if (!isDistributionValid) return;

    const newBlocks = redistributeElementsAcrossBlocks(
      imageBlocks,
      elementDistribution,
      subtitles,
      fps,
      aspectRatio
    );

    onSetImageBlocks(newBlocks);
    setShowDistribution(false);
    setCurrentIndex(0);
  }, [imageBlocks, elementDistribution, subtitles, fps, aspectRatio, isDistributionValid, onSetImageBlocks]);

  const handleResetDistribution = useCallback(() => {
    setElementDistribution(imageBlocks.map(block => block.timeline.length));
  }, [imageBlocks]);

  const handleCopyPrompt = async (prompt: string, index: number) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleCopyAll = async () => {
    const allPrompts = imageBlocks
      .map(
        (block, idx) =>
          `=== IMAGEM ${idx + 1} ===\n\n${block.prompt}\n\n`
      )
      .join('\n');
    try {
      await navigator.clipboard.writeText(allPrompts);
      setCopiedIndex(-1);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDownloadTimeline = () => {
    const text = generateTimelineText(imageBlocks, aspectRatio);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cronograma_animacao.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPrompt = (prompt: string, index: number) => {
    const blob = new Blob([prompt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Formata o número com zero à esquerda (01, 02, ..., 10, 11, etc.)
    const paddedIndex = String(index + 1).padStart(2, '0');
    a.download = `prompt-${paddedIndex}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePromptChange = (blockId: string, newPrompt: string) => {
    onUpdateBlock(blockId, { prompt: newPrompt });
  };

  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const goToNext = () => {
    if (currentIndex < imageBlocks.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const currentBlock = imageBlocks[currentIndex];

  if (!currentBlock) {
    return (
      <div style={styles.container}>
        <div style={styles.title}>Nenhum bloco de imagem encontrado</div>
        <div style={styles.subtitle}>
          Volte ao passo anterior e faça o upload do SRT.
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.title}>Revisar Prompts</div>
          <div style={styles.subtitle}>
            {imageBlocks.length} imagens serão geradas. Edite os prompts se necessário.
          </div>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.aspectRatioContainer}>
            <span style={styles.aspectRatioLabel}>Aspect Ratio:</span>
            <select
              style={styles.aspectRatioSelect}
              value={aspectRatio}
              onChange={(e) =>
                handleAspectRatioChange(e.target.value as AspectRatioType)
              }
            >
              {ASPECT_RATIO_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div style={styles.actions}>
            <button
              style={styles.actionButton}
              onClick={handleCopyAll}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              }}
            >
              {copiedIndex === -1 ? '✓ Copiado!' : '📋 Copiar Todos'}
            </button>
            <button
              style={styles.actionButton}
              onClick={handleDownloadTimeline}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              }}
            >
              📥 Baixar Timeline
            </button>
          </div>
        </div>
      </div>

      {/* Seção de Distribuição de Elementos */}
      <div style={styles.distributionSection}>
        <div style={styles.distributionHeader}>
          <div>
            <div style={styles.distributionTitle}>
              <span>📊</span>
              <span>Distribuição de Elementos por Imagem</span>
            </div>
            <div style={styles.distributionSubtitle}>
              Defina quantos elementos cada imagem terá. Total de {totalElements} elementos.
            </div>
          </div>
          <div style={styles.addRemoveBlockButtons}>
            <button
              style={styles.blockControlButton}
              onClick={handleAddBlock}
              disabled={totalElements <= elementDistribution.length}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(124, 58, 237, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(124, 58, 237, 0.1)';
              }}
            >
              + Adicionar Imagem
            </button>
          </div>
        </div>

        <div style={styles.distributionGrid}>
          {elementDistribution.map((count, idx) => (
            <div key={idx} style={styles.distributionItem}>
              <div style={styles.distributionLabel}>Imagem {idx + 1}</div>
              <div style={styles.distributionInputContainer}>
                <button
                  style={styles.distributionButton}
                  onClick={() => handleDecrementElement(idx)}
                  disabled={count <= 1}
                  onMouseEnter={(e) => {
                    if (count > 1) {
                      e.currentTarget.style.background = 'rgba(124, 58, 237, 0.5)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(124, 58, 237, 0.3)';
                  }}
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  value={count}
                  onChange={(e) => handleDistributionChange(idx, parseInt(e.target.value) || 1)}
                  style={styles.distributionInput}
                />
                <button
                  style={styles.distributionButton}
                  onClick={() => handleIncrementElement(idx)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(124, 58, 237, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(124, 58, 237, 0.3)';
                  }}
                >
                  +
                </button>
              </div>
              {elementDistribution.length > 1 && (
                <button
                  style={{
                    ...styles.copyButton,
                    fontSize: '11px',
                    padding: '4px 8px',
                    marginTop: '4px',
                    color: '#ef4444',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                  }}
                  onClick={() => handleRemoveBlock(idx)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                  }}
                >
                  Remover
                </button>
              )}
            </div>
          ))}
        </div>

        <div style={styles.distributionTotal}>
          <span style={styles.distributionTotalLabel}>
            Total de elementos alocados:
          </span>
          <span
            style={{
              ...styles.distributionTotalValue,
              ...(currentDistributionSum === totalElements
                ? styles.distributionTotalSuccess
                : styles.distributionTotalError),
            }}
          >
            {currentDistributionSum} / {totalElements}
            {currentDistributionSum !== totalElements && (
              <span style={{ fontSize: '12px', marginLeft: '8px' }}>
                ({currentDistributionSum > totalElements ? '+' : ''}{currentDistributionSum - totalElements})
              </span>
            )}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            style={styles.actionButton}
            onClick={handleResetDistribution}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            }}
          >
            🔄 Resetar
          </button>
          <button
            style={{
              ...styles.applyButton,
              ...(isDistributionValid ? {} : styles.applyButtonDisabled),
            }}
            onClick={handleApplyDistribution}
            disabled={!isDistributionValid}
            onMouseEnter={(e) => {
              if (isDistributionValid) {
                e.currentTarget.style.transform = 'scale(1.02)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            ✓ Aplicar Distribuição
          </button>
        </div>
      </div>

      {/* Navegação entre imagens */}
      <div style={styles.navigationContainer}>
        <button
          style={currentIndex > 0 ? styles.navButton : styles.navButtonDisabled}
          onClick={goToPrevious}
          disabled={currentIndex === 0}
          onMouseEnter={(e) => {
            if (currentIndex > 0) {
              e.currentTarget.style.transform = 'scale(1.05)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          ← Anterior
        </button>

        <div style={styles.navInfo}>
          <div style={styles.navCurrent}>
            Imagem {currentIndex + 1} de {imageBlocks.length}
          </div>
          <div style={styles.navTotal}>
            {formatTime(currentBlock.startTime)} → {formatTime(currentBlock.endTime)}
          </div>
          {/* Indicadores de dot */}
          {imageBlocks.length <= 10 && (
            <div style={styles.navDots}>
              {imageBlocks.map((_, idx) => (
                <div
                  key={idx}
                  style={{
                    ...styles.navDot,
                    ...(idx === currentIndex ? styles.navDotActive : styles.navDotInactive),
                  }}
                  onClick={() => setCurrentIndex(idx)}
                  title={`Ir para Imagem ${idx + 1}`}
                />
              ))}
            </div>
          )}
        </div>

        <button
          style={currentIndex < imageBlocks.length - 1 ? styles.navButton : styles.navButtonDisabled}
          onClick={goToNext}
          disabled={currentIndex === imageBlocks.length - 1}
          onMouseEnter={(e) => {
            if (currentIndex < imageBlocks.length - 1) {
              e.currentTarget.style.transform = 'scale(1.05)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          Próxima →
        </button>
      </div>

      {/* Bloco atual */}
      <div style={styles.block}>
        <div style={styles.blockHeader}>
          <span style={styles.blockTitle}>Imagem {currentIndex + 1}</span>
          <span style={styles.blockTime}>
            {formatTime(currentBlock.startTime)} → {formatTime(currentBlock.endTime)} (
            {((currentBlock.endTime - currentBlock.startTime) / 1000).toFixed(1)}s)
          </span>
        </div>
        <div style={styles.blockContent}>
          <div style={styles.promptLabel}>Prompt para geração</div>
          <textarea
            style={styles.promptText}
            value={currentBlock.prompt}
            onChange={(e) => handlePromptChange(currentBlock.id, e.target.value)}
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button
              style={styles.copyButton}
              onClick={() => handleCopyPrompt(currentBlock.prompt, currentIndex)}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(124, 58, 237, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(124, 58, 237, 0.2)';
              }}
            >
              {copiedIndex === currentIndex ? '✓ Copiado!' : '📋 Copiar Prompt'}
            </button>
            <button
              style={styles.copyButton}
              onClick={() => handleDownloadPrompt(currentBlock.prompt, currentIndex)}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(124, 58, 237, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(124, 58, 237, 0.2)';
              }}
            >
              📥 Baixar Prompt
            </button>
          </div>

          <div style={styles.timelineSection}>
            <div style={styles.timelineLabel}>
              Timeline de Elementos ({currentBlock.timeline.length} elementos)
            </div>
            <div style={styles.timelineList}>
              {currentBlock.timeline.map((el, elIdx) => (
                <div key={el.id} style={styles.timelineItem}>
                  <div style={styles.timelineNumber}>{elIdx + 1}</div>
                  <div style={styles.timelineContent}>
                    <div style={styles.timelineTime}>
                      {formatTime(el.startTime)} → {formatTime(el.endTime)}
                    </div>
                    <div style={styles.timelineText}>
                      "{el.narrationText}"
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <button
        style={styles.continueButton}
        onClick={onContinue}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.02)';
          e.currentTarget.style.boxShadow = '0 4px 20px rgba(124, 58, 237, 0.4)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        Continuar para Upload de Imagens →
      </button>
    </div>
  );
};

export default PromptsReviewStep;
