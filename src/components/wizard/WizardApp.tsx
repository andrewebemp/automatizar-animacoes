import React, { useCallback, useEffect, useState, useRef } from 'react';
import { WizardStepper } from './WizardStepper';
import {
  ScriptUploadStep,
  SrtUploadStep,
  PromptsReviewStep,
  ImagesUploadStep,
  PreviewValidationStep,
  ExportStep,
} from './steps';
import { SettingsModal } from '../settings';
import type { WizardStep, VideoResolution } from '../../types/ProjectData';
import type { ImageBlock, ElementRegion, RevealDirection, RevealPercentage, ElementDisplayMode } from '../../types/ImageBlock';
import type { Subtitle } from '../../types/Subtitle';
import {
  saveProject,
  loadProject,
  hasSavedProject,
  getSavedProjectInfo,
  autoSaveProject,
  formatSavedDate,
  clearSavedProject,
} from '../../utils/projectStorage';

interface WizardAppProps {
  currentStep: WizardStep;
  srtContent?: string;
  audioUrl?: string;
  subtitles: Subtitle[];
  imageBlocks: ImageBlock[];
  selectedResolution: VideoResolution;
  showSubtitlesInVideo: boolean;
  fps: number;
  exportProgress?: number;
  exportStatus?: string;
  isExporting?: boolean;
  onSetWizardStep: (step: WizardStep) => void;
  onSetSrtContent: (content: string) => void;
  onSetAudioUrl: (url: string | undefined) => void;
  onSetSubtitles: (subtitles: Subtitle[]) => void;
  onSetImageBlocks: (blocks: ImageBlock[]) => void;
  onUpdateImageBlock: (blockId: string, updates: Partial<ImageBlock>) => void;
  onSetImageBlockImage: (
    blockId: string,
    image: { url: string; width: number; height: number }
  ) => void;
  onSetElementRegion: (
    blockId: string,
    elementId: string,
    region: ElementRegion
  ) => void;
  onClearElementRegion: (blockId: string, elementId: string) => void;
  onUpdateElementAnimation: (
    blockId: string,
    elementId: string,
    revealDirection: RevealDirection,
    revealPercentage: RevealPercentage,
    displayMode: ElementDisplayMode,
    drawingMode?: boolean
  ) => void;
  onSetBlockDetectionStatus: (
    blockId: string,
    status: ImageBlock['detectionStatus'],
    error?: string
  ) => void;
  onSetSelectedResolution: (resolution: VideoResolution) => void;
  onSetShowSubtitlesInVideo: (show: boolean) => void;
  onExport: () => void;
  onSwitchToLegacy: () => void;
  onNewProject?: () => void;
  /** Called when user clicks "New Project" from the saved project modal (no confirmation needed) */
  onStartNewProject?: () => void;
  onLoadSavedProject?: (data: {
    currentStep: WizardStep;
    srtContent?: string;
    subtitles: Subtitle[];
    imageBlocks: ImageBlock[];
    selectedResolution: VideoResolution;
    showSubtitlesInVideo: boolean;
  }) => void;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    flexShrink: 0,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  logoIcon: {
    fontSize: '24px',
  },
  logoText: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#fff',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  headerButton: {
    padding: '8px 16px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    background: 'transparent',
    color: '#94a3b8',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'all 0.2s',
  },
  saveButton: {
    padding: '8px 16px',
    borderRadius: '8px',
    border: '1px solid rgba(34, 197, 94, 0.5)',
    background: 'rgba(34, 197, 94, 0.1)',
    color: '#22c55e',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'all 0.2s',
  },
  saveButtonSaved: {
    border: '1px solid rgba(34, 197, 94, 0.3)',
    background: 'transparent',
    color: '#94a3b8',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  loadModal: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  loadModalContent: {
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    borderRadius: '16px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    padding: '32px',
    maxWidth: '480px',
    width: '90%',
  },
  loadModalTitle: {
    fontSize: '20px',
    fontWeight: 600,
    color: '#fff',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  loadModalText: {
    fontSize: '14px',
    color: '#94a3b8',
    marginBottom: '24px',
    lineHeight: 1.6,
  },
  loadModalInfo: {
    background: 'rgba(124, 58, 237, 0.1)',
    borderRadius: '8px',
    padding: '12px 16px',
    marginBottom: '24px',
  },
  loadModalInfoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
    color: '#a78bfa',
    marginBottom: '4px',
  },
  loadModalButtons: {
    display: 'flex',
    gap: '12px',
  },
  loadModalButtonPrimary: {
    flex: 1,
    padding: '12px 20px',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(135deg, #7c3aed, #00d4ff)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  loadModalButtonSecondary: {
    flex: 1,
    padding: '12px 20px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    background: 'transparent',
    color: '#94a3b8',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  saveNotification: {
    position: 'fixed' as const,
    bottom: '24px',
    right: '24px',
    background: 'rgba(34, 197, 94, 0.9)',
    color: '#fff',
    padding: '12px 20px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    zIndex: 1000,
  },
};

export const WizardApp: React.FC<WizardAppProps> = ({
  currentStep,
  srtContent,
  audioUrl,
  subtitles,
  imageBlocks,
  selectedResolution,
  showSubtitlesInVideo,
  fps,
  exportProgress,
  exportStatus,
  isExporting,
  onSetWizardStep,
  onSetSrtContent,
  onSetAudioUrl,
  onSetSubtitles,
  onSetImageBlocks,
  onUpdateImageBlock,
  onSetImageBlockImage,
  onSetElementRegion,
  onClearElementRegion,
  onUpdateElementAnimation,
  onSetBlockDetectionStatus,
  onSetSelectedResolution,
  onSetShowSubtitlesInVideo,
  onExport,
  onSwitchToLegacy,
  onNewProject,
  onStartNewProject,
  onLoadSavedProject,
}) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [savedProjectInfo, setSavedProjectInfo] = useState<{
    savedAt: string;
    step: WizardStep;
    imageCount: number;
  } | null>(null);
  const [saveNotification, setSaveNotification] = useState<string | null>(null);
  const [lastSaveTime, setLastSaveTime] = useState<string | null>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasCheckedSavedProject = useRef(false);

  // Check for saved project on mount
  useEffect(() => {
    if (hasCheckedSavedProject.current) return;
    hasCheckedSavedProject.current = true;

    if (hasSavedProject()) {
      const info = getSavedProjectInfo();
      if (info) {
        setSavedProjectInfo(info);
        setShowLoadModal(true);
      }
    }
  }, []);

  // Auto-save when important data changes
  useEffect(() => {
    // Don't auto-save if no meaningful data
    if (!srtContent && imageBlocks.length === 0) return;

    // Debounce auto-save
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      autoSaveProject({
        currentStep,
        srtContent,
        audioUrl,
        subtitles,
        imageBlocks,
        selectedResolution,
        showSubtitlesInVideo,
        fps,
      });
    }, 2000); // Auto-save after 2 seconds of inactivity

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [currentStep, srtContent, audioUrl, subtitles, imageBlocks, selectedResolution, showSubtitlesInVideo, fps]);

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      const success = await saveProject({
        currentStep,
        srtContent,
        audioUrl,
        subtitles,
        imageBlocks,
        selectedResolution,
        showSubtitlesInVideo,
        fps,
      });

      if (success) {
        const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        setLastSaveTime(now);
        setSaveNotification('Projeto salvo com sucesso!');
        setTimeout(() => setSaveNotification(null), 3000);
      } else {
        setSaveNotification('Erro ao salvar projeto');
        setTimeout(() => setSaveNotification(null), 3000);
      }
    } catch (error) {
      console.error('[WizardApp] Erro ao salvar:', error);
      setSaveNotification('Erro ao salvar projeto');
      setTimeout(() => setSaveNotification(null), 3000);
    } finally {
      setIsSaving(false);
    }
  }, [currentStep, srtContent, audioUrl, subtitles, imageBlocks, selectedResolution, showSubtitlesInVideo, fps, isSaving]);

  const handleLoadSavedProject = useCallback(async () => {
    try {
      const saved = await loadProject();
      if (saved && onLoadSavedProject) {
        onLoadSavedProject({
          currentStep: saved.currentStep,
          srtContent: saved.srtContent,
          subtitles: saved.subtitles,
          imageBlocks: saved.imageBlocks,
          selectedResolution: saved.selectedResolution,
          showSubtitlesInVideo: saved.showSubtitlesInVideo,
        });
        setLastSaveTime(formatSavedDate(saved.savedAt));
      }
    } catch (error) {
      console.error('[WizardApp] Erro ao carregar:', error);
    }
    setShowLoadModal(false);
  }, [onLoadSavedProject]);

  const handleStartNew = useCallback(async () => {
    await clearSavedProject();
    setShowLoadModal(false);
    setSavedProjectInfo(null);
    // Reset the project state (no confirmation needed since user chose "New Project" from modal)
    if (onStartNewProject) {
      onStartNewProject();
    }
  }, [onStartNewProject]);

  const handleNewProjectWithClear = useCallback(async () => {
    await clearSavedProject();
    setLastSaveTime(null);
    if (onNewProject) {
      onNewProject();
    }
  }, [onNewProject]);

  const getStepLabel = useCallback((step: WizardStep): string => {
    const labels: Record<WizardStep, string> = {
      'upload-script': 'Roteiro',
      'upload-srt': 'Upload SRT',
      'review-prompts': 'Revisar Prompts',
      'upload-images': 'Upload Imagens',
      'preview-validation': 'Validação',
      'export': 'Exportar',
    };
    return labels[step] || step;
  }, []);

  const handleScriptConverted = useCallback(
    (srtContent: string, audioUrlParam?: string) => {
      onSetSrtContent(srtContent);
      if (audioUrlParam) {
        onSetAudioUrl(audioUrlParam);
      }
      onSetWizardStep('upload-srt');
    },
    [onSetSrtContent, onSetAudioUrl, onSetWizardStep]
  );

  const handleSrtParsed = useCallback(
    (content: string, subs: Subtitle[], blocks: ImageBlock[]) => {
      onSetSrtContent(content);
      onSetSubtitles(subs);
      onSetImageBlocks(blocks);
      onSetWizardStep('review-prompts');
    },
    [onSetSrtContent, onSetSubtitles, onSetImageBlocks, onSetWizardStep]
  );

  const handleStepClick = useCallback(
    (step: WizardStep) => {
      // Allow navigating back to completed steps
      onSetWizardStep(step);
    },
    [onSetWizardStep]
  );

  const renderStep = () => {
    switch (currentStep) {
      case 'upload-script':
        return (
          <ScriptUploadStep
            onScriptConverted={handleScriptConverted}
            onSkipToSrt={() => onSetWizardStep('upload-srt')}
          />
        );
      case 'upload-srt':
        return (
          <SrtUploadStep
            srtContent={srtContent}
            fps={fps}
            subtitles={subtitles}
            imageBlocks={imageBlocks}
            onSrtParsed={handleSrtParsed}
            onContinue={() => onSetWizardStep('review-prompts')}
          />
        );
      case 'review-prompts':
        return (
          <PromptsReviewStep
            imageBlocks={imageBlocks}
            subtitles={subtitles}
            fps={fps}
            onUpdateBlock={onUpdateImageBlock}
            onSetImageBlocks={onSetImageBlocks}
            onContinue={() => onSetWizardStep('upload-images')}
          />
        );
      case 'upload-images':
        return (
          <ImagesUploadStep
            imageBlocks={imageBlocks}
            onSetImage={onSetImageBlockImage}
            onSetDetectionStatus={onSetBlockDetectionStatus}
            onSetElementRegion={onSetElementRegion}
            onUpdateBlock={onUpdateImageBlock}
            onContinue={() => onSetWizardStep('preview-validation')}
          />
        );
      case 'preview-validation':
        return (
          <PreviewValidationStep
            imageBlocks={imageBlocks}
            onSetElementRegion={onSetElementRegion}
            onClearElementRegion={onClearElementRegion}
            onUpdateElementAnimation={onUpdateElementAnimation}
            onContinue={() => onSetWizardStep('export')}
          />
        );
      case 'export':
        return (
          <ExportStep
            imageBlocks={imageBlocks}
            selectedResolution={selectedResolution}
            onResolutionChange={onSetSelectedResolution}
            showSubtitlesInVideo={showSubtitlesInVideo}
            onShowSubtitlesChange={onSetShowSubtitlesInVideo}
            onExport={onExport}
            exportProgress={exportProgress}
            exportStatus={exportStatus}
            isExporting={isExporting}
            audioUrl={audioUrl}
            onAudioChange={onSetAudioUrl}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>🎬</span>
          <span style={styles.logoText}>Automatizar Animações</span>
        </div>
        <div style={styles.headerActions}>
          {/* Save Button */}
          <button
            style={{
              ...styles.saveButton,
              ...(lastSaveTime ? styles.saveButtonSaved : {}),
            }}
            onClick={handleSave}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(34, 197, 94, 0.2)';
              e.currentTarget.style.color = '#22c55e';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = lastSaveTime ? 'transparent' : 'rgba(34, 197, 94, 0.1)';
              e.currentTarget.style.color = lastSaveTime ? '#94a3b8' : '#22c55e';
            }}
            title={lastSaveTime ? `Último save: ${lastSaveTime}` : 'Salvar projeto'}
          >
            💾 {lastSaveTime ? `Salvo ${lastSaveTime}` : 'Salvar'}
          </button>

          {onNewProject && (
            <button
              style={{
                ...styles.headerButton,
                borderColor: 'rgba(239, 68, 68, 0.5)',
              }}
              onClick={handleNewProjectWithClear}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                e.currentTarget.style.color = '#ef4444';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#94a3b8';
              }}
            >
              🗑️ Novo Projeto
            </button>
          )}
          <button
            style={styles.headerButton}
            onClick={() => setSettingsOpen(true)}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#94a3b8';
            }}
          >
            ⚙️ Configurações
          </button>
          <button
            style={styles.headerButton}
            onClick={onSwitchToLegacy}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#94a3b8';
            }}
          >
            📐 Modo Manual
          </button>
        </div>
      </div>

      <WizardStepper currentStep={currentStep} onStepClick={handleStepClick} />

      <div style={styles.content}>{renderStep()}</div>

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Load Saved Project Modal */}
      {showLoadModal && savedProjectInfo && (
        <div style={styles.loadModal}>
          <div style={styles.loadModalContent}>
            <div style={styles.loadModalTitle}>
              <span>📂</span>
              <span>Projeto Salvo Encontrado</span>
            </div>
            <div style={styles.loadModalText}>
              Foi encontrado um projeto salvo anteriormente. Deseja continuar de onde parou ou iniciar um novo projeto?
            </div>
            <div style={styles.loadModalInfo}>
              <div style={styles.loadModalInfoRow}>
                <span>Salvo em:</span>
                <span>{formatSavedDate(savedProjectInfo.savedAt)}</span>
              </div>
              <div style={styles.loadModalInfoRow}>
                <span>Etapa:</span>
                <span>{getStepLabel(savedProjectInfo.step)}</span>
              </div>
              <div style={styles.loadModalInfoRow}>
                <span>Imagens:</span>
                <span>{savedProjectInfo.imageCount} carregada(s)</span>
              </div>
            </div>
            <div style={styles.loadModalButtons}>
              <button
                style={styles.loadModalButtonSecondary}
                onClick={handleStartNew}
              >
                Novo Projeto
              </button>
              <button
                style={styles.loadModalButtonPrimary}
                onClick={handleLoadSavedProject}
              >
                Continuar Projeto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Notification */}
      {saveNotification && (
        <div style={styles.saveNotification}>
          <span>✓</span>
          <span>{saveNotification}</span>
        </div>
      )}
    </div>
  );
};

export default WizardApp;
