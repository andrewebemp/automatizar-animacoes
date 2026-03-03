import React, { useRef, useCallback } from 'react';
import type { ImageBlock } from '../../../types/ImageBlock';
import type { VideoResolution } from '../../../types/ProjectData';
import {
  VIDEO_RESOLUTIONS,
  detectAspectRatio,
  getVideoDimensions,
} from '../../../types/ProjectData';
import { formatTime } from '../../../utils/promptGenerator';

interface ExportStepProps {
  imageBlocks: ImageBlock[];
  selectedResolution: VideoResolution;
  onResolutionChange: (resolution: VideoResolution) => void;
  showSubtitlesInVideo: boolean;
  onShowSubtitlesChange: (show: boolean) => void;
  onExport: () => void;
  exportProgress?: number; // 0-100
  exportStatus?: string; // Status message
  isExporting?: boolean;
  audioUrl?: string;
  onAudioChange?: (audioUrl: string | undefined) => void;
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
  content: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
  },
  section: {
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    padding: '20px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#fff',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  resolutionGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '12px',
  },
  resolutionCard: {
    padding: '16px',
    borderRadius: '8px',
    border: '2px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(255, 255, 255, 0.02)',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  resolutionCardActive: {
    border: '2px solid #7c3aed',
    background: 'rgba(124, 58, 237, 0.1)',
  },
  resolutionName: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#fff',
    marginBottom: '4px',
  },
  resolutionDimensions: {
    fontSize: '12px',
    color: '#94a3b8',
  },
  summaryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px 0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  },
  summaryLabel: {
    fontSize: '14px',
    color: '#94a3b8',
  },
  summaryValue: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#fff',
  },
  previewList: {
    marginTop: '16px',
    maxHeight: '200px',
    overflowY: 'auto' as const,
  },
  previewItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 0',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  },
  previewThumb: {
    width: '48px',
    height: '27px',
    borderRadius: '4px',
    objectFit: 'cover' as const,
  },
  previewInfo: {
    flex: 1,
  },
  previewName: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#fff',
  },
  previewDuration: {
    fontSize: '11px',
    color: '#64748b',
  },
  exportButton: {
    padding: '16px 32px',
    borderRadius: '12px',
    border: 'none',
    background: 'linear-gradient(135deg, #7c3aed, #00d4ff)',
    color: '#fff',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '24px',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  warningBox: {
    padding: '12px 16px',
    background: 'rgba(251, 191, 36, 0.1)',
    borderRadius: '8px',
    border: '1px solid rgba(251, 191, 36, 0.3)',
    marginTop: '16px',
  },
  warningText: {
    fontSize: '13px',
    color: '#fbbf24',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  aspectRatioBadge: {
    display: 'inline-block',
    padding: '4px 8px',
    background: 'rgba(124, 58, 237, 0.2)',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 500,
    color: '#a78bfa',
  },
  progressContainer: {
    marginTop: '16px',
    padding: '16px',
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  progressHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  progressLabel: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#fff',
  },
  progressPercent: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#7c3aed',
  },
  progressBarOuter: {
    width: '100%',
    height: '12px',
    background: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  progressBarInner: {
    height: '100%',
    background: 'linear-gradient(90deg, #7c3aed, #00d4ff)',
    borderRadius: '6px',
    transition: 'width 0.3s ease',
  },
  progressStatus: {
    marginTop: '8px',
    fontSize: '12px',
    color: '#94a3b8',
    textAlign: 'center' as const,
  },
  optionsSection: {
    marginTop: '24px',
  },
  optionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 20px',
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  checkbox: {
    width: '20px',
    height: '20px',
    cursor: 'pointer',
    accentColor: '#7c3aed',
  },
  optionLabel: {
    flex: 1,
  },
  optionTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#fff',
    marginBottom: '2px',
  },
  optionDescription: {
    fontSize: '12px',
    color: '#94a3b8',
  },
  audioSection: {
    marginTop: '16px',
  },
  audioUploadBox: {
    padding: '16px 20px',
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  audioInfo: {
    flex: 1,
  },
  audioTitle: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#fff',
    marginBottom: '2px',
  },
  audioDescription: {
    fontSize: '12px',
    color: '#94a3b8',
  },
  audioFileName: {
    fontSize: '12px',
    color: '#22c55e',
    marginTop: '4px',
  },
  audioButtons: {
    display: 'flex',
    gap: '8px',
  },
  uploadButton: {
    padding: '8px 16px',
    borderRadius: '6px',
    border: '1px solid rgba(124, 58, 237, 0.5)',
    background: 'rgba(124, 58, 237, 0.1)',
    color: '#a78bfa',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  removeButton: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid rgba(239, 68, 68, 0.5)',
    background: 'rgba(239, 68, 68, 0.1)',
    color: '#f87171',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
};

const RESOLUTION_OPTIONS: { key: VideoResolution; label: string }[] = [
  { key: '360p', label: '360p' },
  { key: '480p', label: '480p' },
  { key: '720p', label: '720p' },
  { key: '1080p', label: '1080p' },
  { key: '2k', label: '2K' },
  { key: '4k', label: '4K' },
];

export const ExportStep: React.FC<ExportStepProps> = ({
  imageBlocks,
  selectedResolution,
  onResolutionChange,
  showSubtitlesInVideo,
  onShowSubtitlesChange,
  onExport,
  exportProgress = 0,
  exportStatus = '',
  isExporting = false,
  audioUrl,
  onAudioChange,
}) => {
  const showProgress = exportProgress > 0 || isExporting;
  const audioInputRef = useRef<HTMLInputElement>(null);

  const handleAudioUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onAudioChange) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      onAudioChange(dataUrl);
    };
    reader.readAsDataURL(file);

    // Reset input
    if (audioInputRef.current) {
      audioInputRef.current.value = '';
    }
  }, [onAudioChange]);

  const handleRemoveAudio = useCallback(() => {
    if (onAudioChange) {
      onAudioChange(undefined);
    }
  }, [onAudioChange]);

  // Detect aspect ratio from first image
  const firstImage = imageBlocks[0]?.image;
  const aspectRatio = firstImage
    ? detectAspectRatio(firstImage.width, firstImage.height)
    : '16:9';

  const dimensions = getVideoDimensions(selectedResolution, aspectRatio);

  // Calculate total duration
  const totalDuration =
    imageBlocks.length > 0
      ? imageBlocks[imageBlocks.length - 1].endTime - imageBlocks[0].startTime
      : 0;

  // Count elements without regions
  const missingRegions = imageBlocks.reduce(
    (acc, block) => acc + block.timeline.filter((el) => !el.region).length,
    0
  );

  const handleExport = () => {
    onExport();
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.title}>Exportar Vídeo</div>
        <div style={styles.subtitle}>
          Configure a resolução e exporte o vídeo final
        </div>
      </div>

      <div style={styles.content}>
        <div style={styles.section}>
          <div style={styles.sectionTitle}>
            📐 Resolução
            <span style={styles.aspectRatioBadge}>{aspectRatio}</span>
          </div>
          <div style={styles.resolutionGrid}>
            {RESOLUTION_OPTIONS.map((option) => {
              const dims = VIDEO_RESOLUTIONS[option.key][aspectRatio];
              return (
                <div
                  key={option.key}
                  style={{
                    ...styles.resolutionCard,
                    ...(selectedResolution === option.key
                      ? styles.resolutionCardActive
                      : {}),
                  }}
                  onClick={() => onResolutionChange(option.key)}
                >
                  <div style={styles.resolutionName}>{option.label}</div>
                  <div style={styles.resolutionDimensions}>
                    {dims.width} × {dims.height}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={styles.section}>
          <div style={styles.sectionTitle}>📊 Resumo do Projeto</div>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>Total de imagens</span>
            <span style={styles.summaryValue}>{imageBlocks.length}</span>
          </div>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>Duração total</span>
            <span style={styles.summaryValue}>
              {formatTime(totalDuration)}
            </span>
          </div>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>Resolução final</span>
            <span style={styles.summaryValue}>
              {dimensions.width} × {dimensions.height}
            </span>
          </div>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>Aspect ratio</span>
            <span style={styles.summaryValue}>{aspectRatio}</span>
          </div>
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>Elementos a revelar</span>
            <span style={styles.summaryValue}>
              {imageBlocks.reduce((acc, b) => acc + b.timeline.length, 0)}
            </span>
          </div>

          <div style={styles.previewList}>
            {imageBlocks.map((block, idx) => (
              <div key={block.id} style={styles.previewItem}>
                {block.image && (
                  <img
                    src={block.image.url}
                    alt={`Thumb ${idx + 1}`}
                    style={styles.previewThumb}
                  />
                )}
                <div style={styles.previewInfo}>
                  <div style={styles.previewName}>Imagem {idx + 1}</div>
                  <div style={styles.previewDuration}>
                    {formatTime(block.startTime)} → {formatTime(block.endTime)} |{' '}
                    {block.timeline.length} elementos
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Options section */}
      <div style={styles.optionsSection}>
        <div
          style={styles.optionRow}
          onClick={() => onShowSubtitlesChange(!showSubtitlesInVideo)}
        >
          <input
            type="checkbox"
            style={styles.checkbox}
            checked={showSubtitlesInVideo}
            onChange={(e) => onShowSubtitlesChange(e.target.checked)}
            onClick={(e) => e.stopPropagation()}
          />
          <div style={styles.optionLabel}>
            <div style={styles.optionTitle}>Incluir legendas no vídeo</div>
            <div style={styles.optionDescription}>
              Exibe o texto da narração na parte inferior do vídeo
            </div>
          </div>
        </div>

        {/* Audio upload section */}
        <div style={styles.audioSection}>
          <div style={styles.audioUploadBox}>
            <span style={{ fontSize: '24px' }}>🔊</span>
            <div style={styles.audioInfo}>
              <div style={styles.audioTitle}>Áudio de narração</div>
              <div style={styles.audioDescription}>
                Adicione um arquivo de áudio (MP3, WAV, M4A) para incluir no vídeo
              </div>
              {audioUrl && (
                <div style={styles.audioFileName}>
                  ✓ Áudio carregado
                </div>
              )}
            </div>
            <div style={styles.audioButtons}>
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*"
                style={{ display: 'none' }}
                onChange={handleAudioUpload}
              />
              <button
                style={styles.uploadButton}
                onClick={() => audioInputRef.current?.click()}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(124, 58, 237, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(124, 58, 237, 0.1)';
                }}
              >
                {audioUrl ? 'Trocar' : 'Upload'}
              </button>
              {audioUrl && (
                <button
                  style={styles.removeButton}
                  onClick={handleRemoveAudio}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {missingRegions > 0 && (
        <div style={styles.warningBox}>
          <div style={styles.warningText}>
            <span>⚠️</span>
            <span>
              {missingRegions} elemento(s) sem região definida. Esses elementos
              aparecerão com fade-in em vez de revelação por área.
            </span>
          </div>
        </div>
      )}

      {showProgress && (
        <div style={styles.progressContainer}>
          <div style={styles.progressHeader}>
            <span style={styles.progressLabel}>Exportando vídeo...</span>
            <span style={styles.progressPercent}>{Math.round(exportProgress)}%</span>
          </div>
          <div style={styles.progressBarOuter}>
            <div
              style={{
                ...styles.progressBarInner,
                width: `${exportProgress}%`,
              }}
            />
          </div>
          {exportStatus && (
            <div style={styles.progressStatus}>{exportStatus}</div>
          )}
        </div>
      )}

      <button
        style={{
          ...styles.exportButton,
          opacity: isExporting ? 0.7 : 1,
          cursor: isExporting ? 'not-allowed' : 'pointer',
        }}
        onClick={handleExport}
        disabled={isExporting}
        onMouseEnter={(e) => {
          if (!isExporting) {
            e.currentTarget.style.transform = 'scale(1.02)';
            e.currentTarget.style.boxShadow =
              '0 8px 30px rgba(124, 58, 237, 0.4)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        {isExporting ? (
          <>
            <span className="spinner">⟳</span>
            Exportando...
          </>
        ) : (
          <>
            🎬 Exportar Vídeo ({selectedResolution})
          </>
        )}
      </button>
    </div>
  );
};

export default ExportStep;
