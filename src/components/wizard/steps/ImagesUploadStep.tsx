import React, { useState, useCallback, useRef } from 'react';
import type { ImageBlock } from '../../../types/ImageBlock';
import type { VisionApiConfig } from '../../../types/ApiConfig';
import { loadApiConfig, isVisionConfigValid } from '../../../types/ApiConfig';
import { detectElements } from '../../../utils/visionApi';
import { formatTime } from '../../../utils/promptGenerator';

interface ImagesUploadStepProps {
  imageBlocks: ImageBlock[];
  onSetImage: (
    blockId: string,
    image: { url: string; width: number; height: number }
  ) => void;
  onSetDetectionStatus: (
    blockId: string,
    status: ImageBlock['detectionStatus'],
    error?: string
  ) => void;
  onSetElementRegion: (
    blockId: string,
    elementId: string,
    region: NonNullable<ImageBlock['timeline'][0]['region']>
  ) => void;
  onUpdateBlock: (blockId: string, updates: Partial<ImageBlock>) => void;
  onContinue: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '24px',
  },
  header: {
    marginBottom: '24px',
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
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '16px',
  },
  card: {
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: 'rgba(124, 58, 237, 0.1)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },
  cardTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
  },
  cardTime: {
    fontSize: '12px',
    color: '#94a3b8',
  },
  cardContent: {
    padding: '16px',
  },
  dropzone: {
    aspectRatio: '16/9',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    border: '2px dashed rgba(124, 58, 237, 0.4)',
    borderRadius: '8px',
    background: 'rgba(124, 58, 237, 0.05)',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
  },
  dropzoneActive: {
    border: '2px dashed #7c3aed',
    background: 'rgba(124, 58, 237, 0.1)',
  },
  dropzoneIcon: {
    fontSize: '32px',
    marginBottom: '8px',
  },
  dropzoneText: {
    fontSize: '13px',
    color: '#94a3b8',
  },
  imagePreview: {
    width: '100%',
    aspectRatio: '16/9',
    objectFit: 'cover' as const,
    borderRadius: '8px',
  },
  imageContainer: {
    position: 'relative' as const,
    width: '100%',
  },
  imageOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0,
    transition: 'opacity 0.2s ease',
    cursor: 'pointer',
  },
  imageOverlayVisible: {
    opacity: 1,
  },
  replaceButton: {
    padding: '10px 20px',
    borderRadius: '6px',
    border: '2px solid rgba(255, 255, 255, 0.8)',
    background: 'transparent',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    transition: 'all 0.2s ease',
  },
  replaceButtonHover: {
    background: 'rgba(124, 58, 237, 0.8)',
    borderColor: '#7c3aed',
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 500,
    marginTop: '12px',
  },
  statusPending: {
    background: 'rgba(251, 191, 36, 0.2)',
    color: '#fbbf24',
  },
  statusProcessing: {
    background: 'rgba(59, 130, 246, 0.2)',
    color: '#3b82f6',
  },
  statusCompleted: {
    background: 'rgba(34, 197, 94, 0.2)',
    color: '#22c55e',
  },
  statusFailed: {
    background: 'rgba(239, 68, 68, 0.2)',
    color: '#ef4444',
  },
  detectButton: {
    padding: '8px 16px',
    borderRadius: '6px',
    border: 'none',
    background: 'linear-gradient(135deg, #7c3aed, #00d4ff)',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '12px',
    width: '100%',
  },
  detectButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  apiWarning: {
    padding: '12px 16px',
    background: 'rgba(251, 191, 36, 0.1)',
    borderRadius: '8px',
    border: '1px solid rgba(251, 191, 36, 0.3)',
    marginBottom: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  apiWarningText: {
    fontSize: '13px',
    color: '#fbbf24',
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
  },
  continueButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  elementList: {
    marginTop: '12px',
    fontSize: '11px',
    color: '#64748b',
  },
  manualToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    background: 'rgba(251, 191, 36, 0.1)',
    borderRadius: '6px',
    marginTop: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  manualToggleActive: {
    background: 'rgba(124, 58, 237, 0.2)',
    border: '1px solid rgba(124, 58, 237, 0.3)',
  },
  manualToggleCheckbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
    accentColor: '#7c3aed',
  },
  manualToggleLabel: {
    fontSize: '12px',
    color: '#94a3b8',
    flex: 1,
  },
  manualToggleLabelActive: {
    color: '#a78bfa',
  },
};

export const ImagesUploadStep: React.FC<ImagesUploadStepProps> = ({
  imageBlocks,
  onSetImage,
  onSetDetectionStatus,
  onSetElementRegion,
  onUpdateBlock,
  onContinue,
}) => {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [hoveringIndex, setHoveringIndex] = useState<number | null>(null);
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const replaceInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const apiConfig = loadApiConfig();
  const isApiConfigured = isVisionConfigValid(apiConfig.vision);

  const allImagesUploaded = imageBlocks.every((block) => block.image);

  const processImage = useCallback(
    async (file: File, blockId: string, blockIndex: number) => {
      if (!file.type.startsWith('image/')) {
        return;
      }

      const reader = new FileReader();
      reader.onload = async (e) => {
        const url = e.target?.result as string;

        const img = new Image();
        img.onload = async () => {
          const imageWidth = img.width;
          const imageHeight = img.height;

          onSetImage(blockId, {
            url,
            width: imageWidth,
            height: imageHeight,
          });

          const block = imageBlocks[blockIndex];
          // Auto-detect elements if API is configured and manual mode is not enabled
          if (isApiConfigured && !block.manualDetectionMode) {
            await detectElementsForBlock(
              blockId,
              url,
              block,
              apiConfig.vision,
              imageWidth,
              imageHeight
            );
          } else if (block.manualDetectionMode) {
            // Set status to manual when in manual mode
            onSetDetectionStatus(blockId, 'manual');
          }
        };
        img.src = url;
      };
      reader.readAsDataURL(file);
    },
    [imageBlocks, apiConfig.vision, isApiConfigured, onSetImage]
  );

  const detectElementsForBlock = async (
    blockId: string,
    imageUrl: string,
    block: ImageBlock,
    visionConfig: VisionApiConfig,
    imageWidth: number,
    imageHeight: number
  ) => {
    console.log('[Detection] Starting for block:', blockId, 'elements:', block.timeline.length);
    console.log('[Detection] Image dimensions:', imageWidth, 'x', imageHeight);
    console.log('[Detection] Vision config:', {
      provider: visionConfig.provider,
      model: visionConfig.model,
      enabled: visionConfig.enabled,
      hasApiKey: !!visionConfig.apiKey
    });

    onSetDetectionStatus(blockId, 'processing');

    try {
      const result = await detectElements(
        visionConfig,
        imageUrl,
        block.timeline,
        imageWidth,
        imageHeight,
        block.gridLayout,
        block.elementPositions
      );

      console.log('[Detection] Result:', result);

      if (!result.success) {
        throw new Error(result.error || 'Falha na detecção');
      }

      // Apply detected regions to timeline elements
      let appliedCount = 0;
      result.elements.forEach((detected) => {
        const element = block.timeline[detected.index - 1];
        if (element && detected.x !== undefined) {
          onSetElementRegion(blockId, element.id, {
            x: detected.x,
            y: detected.y,
            width: detected.width,
            height: detected.height,
            shape: 'rect',
          });
          appliedCount++;
        }
      });

      console.log('[Detection] Applied regions:', appliedCount, 'of', result.elements.length);
      onSetDetectionStatus(blockId, 'completed');
    } catch (error) {
      console.error('[Detection] Failed:', error);
      onSetDetectionStatus(
        blockId,
        'failed',
        error instanceof Error ? error.message : 'Erro na detecção'
      );
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent, blockId: string, blockIndex: number) => {
      e.preventDefault();
      setDraggingIndex(null);

      const file = e.dataTransfer.files[0];
      if (file) {
        processImage(file, blockId, blockIndex);
      }
    },
    [processImage]
  );

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    blockId: string,
    blockIndex: number
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      processImage(file, blockId, blockIndex);
    }
    // Limpa o input para permitir selecionar o mesmo arquivo novamente
    e.target.value = '';
  };

  const handleReplaceImage = (
    e: React.ChangeEvent<HTMLInputElement>,
    blockId: string,
    blockIndex: number
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      // Reseta o status de detecção antes de processar a nova imagem
      onSetDetectionStatus(blockId, 'pending');
      processImage(file, blockId, blockIndex);
    }
    // Limpa o input para permitir selecionar o mesmo arquivo novamente
    e.target.value = '';
  };

  const handleRetryDetection = async (block: ImageBlock) => {
    if (block.image && isApiConfigured) {
      await detectElementsForBlock(
        block.id,
        block.image.url,
        block,
        apiConfig.vision,
        block.image.width,
        block.image.height
      );
    }
  };

  const handleManualModeToggle = (block: ImageBlock) => {
    const newManualMode = !block.manualDetectionMode;
    onUpdateBlock(block.id, { manualDetectionMode: newManualMode });

    if (newManualMode) {
      // Switching to manual mode - set status to manual
      onSetDetectionStatus(block.id, 'manual');
    } else if (block.image && isApiConfigured) {
      // Switching to auto mode - trigger detection if image exists
      onSetDetectionStatus(block.id, 'pending');
    }
  };

  const getStatusBadge = (block: ImageBlock) => {
    if (!block.image) return null;

    const status = block.detectionStatus || 'pending';
    const statusStyles: Record<string, React.CSSProperties> = {
      pending: styles.statusPending,
      processing: styles.statusProcessing,
      completed: styles.statusCompleted,
      failed: styles.statusFailed,
      manual: styles.statusCompleted,
    };

    const statusLabels: Record<string, string> = {
      pending: isApiConfigured ? 'Aguardando detecção' : 'API não configurada',
      processing: 'Detectando elementos...',
      completed: 'Elementos detectados',
      failed: block.detectionError || 'Falha na detecção',
      manual: 'Configurado manualmente',
    };

    return (
      <div style={{ ...styles.statusBadge, ...statusStyles[status] }}>
        {status === 'processing' && <span className="spinner">⟳</span>}
        {statusLabels[status]}
      </div>
    );
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.title}>Upload de Imagens</div>
        <div style={styles.subtitle}>
          Faça upload das imagens geradas para cada bloco.
          {isApiConfigured
            ? ' Os elementos serão detectados automaticamente.'
            : ' Configure a API de visão nas configurações para detecção automática.'}
        </div>
      </div>

      {!isApiConfigured && (
        <div style={styles.apiWarning}>
          <span>⚠️</span>
          <span style={styles.apiWarningText}>
            API de visão não configurada. Os elementos precisarão ser marcados manualmente
            no próximo passo. Configure nas Configurações para detecção automática.
          </span>
        </div>
      )}

      <div style={styles.grid}>
        {imageBlocks.map((block, idx) => (
          <div key={block.id} style={styles.card}>
            <div style={styles.cardHeader}>
              <span style={styles.cardTitle}>Imagem {idx + 1}</span>
              <span style={styles.cardTime}>
                {formatTime(block.startTime)} - {formatTime(block.endTime)}
              </span>
            </div>
            <div style={styles.cardContent}>
              {block.image ? (
                <>
                  <div
                    style={styles.imageContainer}
                    onMouseEnter={() => setHoveringIndex(idx)}
                    onMouseLeave={() => setHoveringIndex(null)}
                  >
                    <img
                      src={block.image.url}
                      alt={`Imagem ${idx + 1}`}
                      style={styles.imagePreview}
                    />
                    <div
                      style={{
                        ...styles.imageOverlay,
                        ...(hoveringIndex === idx ? styles.imageOverlayVisible : {}),
                      }}
                      onClick={() => replaceInputRefs.current[idx]?.click()}
                    >
                      <button
                        style={styles.replaceButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          replaceInputRefs.current[idx]?.click();
                        }}
                      >
                        🔄 Substituir Imagem
                      </button>
                    </div>
                    <input
                      ref={(el) => {
                        replaceInputRefs.current[idx] = el;
                      }}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleReplaceImage(e, block.id, idx)}
                      style={{ display: 'none' }}
                    />
                  </div>
                  {getStatusBadge(block)}
                  {block.detectionStatus === 'failed' && isApiConfigured && (
                    <button
                      style={styles.detectButton}
                      onClick={() => handleRetryDetection(block)}
                    >
                      Tentar Novamente
                    </button>
                  )}
                  {block.detectionStatus === 'pending' && isApiConfigured && (
                    <button
                      style={styles.detectButton}
                      onClick={() => handleRetryDetection(block)}
                    >
                      Detectar Elementos
                    </button>
                  )}
                </>
              ) : (
                <div
                  style={{
                    ...styles.dropzone,
                    ...(draggingIndex === idx ? styles.dropzoneActive : {}),
                  }}
                  onDrop={(e) => handleDrop(e, block.id, idx)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDraggingIndex(idx);
                  }}
                  onDragLeave={() => setDraggingIndex(null)}
                  onClick={() => fileInputRefs.current[idx]?.click()}
                >
                  <div style={styles.dropzoneIcon}>🖼️</div>
                  <div style={styles.dropzoneText}>
                    Arraste ou clique para upload
                  </div>
                  <input
                    ref={(el) => {
                      fileInputRefs.current[idx] = el;
                    }}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileChange(e, block.id, idx)}
                    style={{ display: 'none' }}
                  />
                </div>
              )}
              <div style={styles.elementList}>
                {block.timeline.length} elementos para revelar
              </div>

              {/* Manual mode toggle */}
              <div
                style={{
                  ...styles.manualToggle,
                  ...(block.manualDetectionMode ? styles.manualToggleActive : {}),
                }}
                onClick={() => handleManualModeToggle(block)}
              >
                <input
                  type="checkbox"
                  style={styles.manualToggleCheckbox}
                  checked={block.manualDetectionMode || false}
                  onChange={() => handleManualModeToggle(block)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span
                  style={{
                    ...styles.manualToggleLabel,
                    ...(block.manualDetectionMode ? styles.manualToggleLabelActive : {}),
                  }}
                >
                  ✏️ Modo manual (ignorar Vision API)
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        style={{
          ...styles.continueButton,
          ...(!allImagesUploaded ? styles.continueButtonDisabled : {}),
        }}
        onClick={onContinue}
        disabled={!allImagesUploaded}
      >
        {allImagesUploaded
          ? 'Continuar para Validação →'
          : `Aguardando ${imageBlocks.filter((b) => !b.image).length} imagem(ns)`}
      </button>
    </div>
  );
};

export default ImagesUploadStep;
