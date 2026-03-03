import React, { useState, useCallback, useEffect } from 'react';
import { useProjectState } from '../../hooks/useProjectState';
import { ImageCanvas } from './ImageCanvas';
import { SceneList } from './SceneList';
import { ElementList } from './ElementList';
import { FileUploader } from './FileUploader';
import { VideoPreview } from './VideoPreview';
import { ExportPanel } from './ExportPanel';
import { WizardApp } from '../wizard';
import { WizardAppNew } from '../wizard-new';
import { ErrorBoundary } from '../ErrorBoundary';
import { parseSRT } from '../../utils/srtParser';
import { loadImage, loadSRTFile } from '../../utils/projectSerializer';
import {
  saveProject,
  loadProject,
  clearSavedProject,
  hasSavedProject,
} from '../../utils/projectPersistence';
import type { AspectRatio } from '../../types/VideoConfig';
import type { ElementShape } from '../../types';
import type { ImageBlock, ElementRegion } from '../../types/ImageBlock';
import type { Subtitle } from '../../types/Subtitle';
import type { WizardStep, VideoResolution, ProjectData } from '../../types/ProjectData';

// Tipagem para a API do Electron
declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      platform: string;
      saveFileDialog: (options: {
        defaultPath?: string;
        filters?: { name: string; extensions: string[] }[];
      }) => Promise<{ canceled: boolean; filePath?: string }>;
      renderVideo: (
        projectData: ProjectData,
        outputPath: string
      ) => Promise<{ success: boolean; outputPath?: string; error?: string }>;
      onRenderProgress: (callback: (progress: { progress: number; status: string }) => void) => void;
      removeRenderProgressListener: () => void;
    };
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    height: '100vh',
    backgroundColor: '#1a1a2e',
  },
  sidebar: {
    width: 300,
    backgroundColor: '#16213e',
    borderRight: '1px solid #0f3460',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  toolbar: {
    padding: 16,
    backgroundColor: '#0f3460',
    borderBottom: '1px solid #1a1a2e',
    display: 'flex',
    gap: 16,
    alignItems: 'center',
  },
  canvasContainer: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    overflow: 'hidden',
  },
  rightPanel: {
    width: 350,
    backgroundColor: '#16213e',
    borderLeft: '1px solid #0f3460',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  sectionTitle: {
    padding: '12px 16px',
    backgroundColor: '#0f3460',
    fontSize: 14,
    fontWeight: 600,
    color: '#e94560',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  scrollable: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: 16,
  },
  formatSelector: {
    display: 'flex',
    gap: 8,
  },
  formatButton: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    transition: 'all 0.2s',
  },
  formatButtonActive: {
    backgroundColor: '#e94560',
    color: '#fff',
  },
  formatButtonInactive: {
    backgroundColor: '#0f3460',
    color: '#aaa',
  },
  modeSelector: {
    display: 'flex',
    gap: 4,
    backgroundColor: '#0f3460',
    padding: 4,
    borderRadius: 6,
  },
  modeButton: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    transition: 'all 0.2s',
  },
  modeButtonActive: {
    backgroundColor: '#e94560',
    color: '#fff',
  },
  modeButtonInactive: {
    backgroundColor: 'transparent',
    color: '#aaa',
  },
  toolsContainer: {
    display: 'flex',
    gap: 4,
    backgroundColor: '#16213e',
    padding: 4,
    borderRadius: 6,
  },
  toolButton: {
    padding: '6px 10px',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 14,
    transition: 'all 0.2s',
    minWidth: 36,
  },
  toolButtonActive: {
    backgroundColor: '#4ecdc4',
    color: '#1a1a2e',
  },
  toolButtonInactive: {
    backgroundColor: 'transparent',
    color: '#888',
  },
};

type EditorMode = 'scenes' | 'elements';

// Ferramentas de desenho disponíveis
const drawingTools: { shape: ElementShape; icon: string; title: string }[] = [
  { shape: 'rect', icon: '▢', title: 'Retângulo' },
  { shape: 'ellipse', icon: '○', title: 'Elipse' },
  { shape: 'polygon', icon: '⬠', title: 'Polígono' },
  { shape: 'freehand', icon: '✎', title: 'Desenho Livre' },
];

export const EditorApp: React.FC = () => {
  // Carrega projeto salvo na inicialização
  const savedProject = loadProject();
  const { state: project, actions } = useProjectState(savedProject || undefined);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>('scenes');
  const [showPreview, setShowPreview] = useState(false);
  const [currentTool, setCurrentTool] = useState<ElementShape>('rect');
  const [isExporting, setIsExporting] = useState(false);
  const [useNewWizard, setUseNewWizard] = useState(true); // Usar novo wizard por padrão

  const selectedScene = project.scenes.find((s) => s.id === selectedSceneId);

  // Export progress state
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState('');

  // Auto-save: salva projeto sempre que o state mudar
  useEffect(() => {
    // Só salva se houver algum dado significativo
    const hasData =
      project.imageBlocks.length > 0 ||
      project.subtitles.length > 0 ||
      project.scenes.length > 0 ||
      project.srtContent;
    if (hasData) {
      saveProject(project);
    }
  }, [project]);

  // Registra listener de progresso do Electron
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onRenderProgress((prog) => {
        setExportProgress(prog.progress);
        setExportStatus(getStatusText(prog.status));
      });

      return () => {
        window.electronAPI?.removeRenderProgressListener();
      };
    }
  }, []);

  const getStatusText = (status: string): string => {
    switch (status) {
      case 'bundling':
        return 'Preparando arquivos...';
      case 'preparing':
        return 'Configurando renderização...';
      case 'rendering':
        return 'Renderizando vídeo...';
      case 'done':
        return 'Concluído!';
      case 'error':
        return 'Erro na renderização';
      default:
        return status;
    }
  };

  // Limpar projeto salvo e reiniciar (com confirmação - usado pelo botão do header)
  const handleNewProject = useCallback(() => {
    if (window.confirm('Tem certeza que deseja iniciar um novo projeto? Todos os dados atuais serão perdidos.')) {
      clearSavedProject();
      actions.resetProject();
    }
  }, [actions]);

  // Iniciar novo projeto sem confirmação (usado pelo modal de projeto salvo)
  const handleStartNewProject = useCallback(() => {
    actions.resetProject();
  }, [actions]);

  // Carregar projeto salvo (do modal de recuperação)
  const handleLoadSavedProject = useCallback((data: {
    currentStep: WizardStep;
    srtContent?: string;
    subtitles: Subtitle[];
    imageBlocks: ImageBlock[];
    selectedResolution: VideoResolution;
    showSubtitlesInVideo: boolean;
  }) => {
    actions.setWizardStep(data.currentStep);
    if (data.srtContent) {
      actions.setSrtContent(data.srtContent);
    }
    actions.setSubtitles(data.subtitles);
    actions.setImageBlocks(data.imageBlocks);
    actions.setSelectedResolution(data.selectedResolution);
    actions.setShowSubtitlesInVideo(data.showSubtitlesInVideo);
  }, [actions]);

  // Novo wizard simplificado (v2) - usando pathData como fonte da verdade
  if (useNewWizard && project.mode === 'new-flow') {
    return (
      <ErrorBoundary>
        <WizardAppNew />
      </ErrorBoundary>
    );
  }

  // Wizard antigo (v1) - render WizardApp instead of legacy editor
  if (project.mode === 'new-flow') {
    const handleExport = async () => {
      console.log('Exporting video with:', project.imageBlocks);

      // Verifica se está no Electron
      if (!window.electronAPI) {
        alert(
          'Para exportar o vídeo, execute o aplicativo desktop.\n\n' +
          'A exportação de vídeo requer o Electron com acesso ao sistema de arquivos.'
        );
        return;
      }

      // Abre diálogo para escolher onde salvar
      const result = await window.electronAPI.saveFileDialog({
        defaultPath: `video-${new Date().toISOString().slice(0, 10)}.mp4`,
        filters: [{ name: 'Vídeo MP4', extensions: ['mp4'] }],
      });

      if (result.canceled || !result.filePath) {
        return;
      }

      setIsExporting(true);
      setExportProgress(0);
      setExportStatus('Iniciando exportação...');

      try {
        const renderResult = await window.electronAPI.renderVideo(
          project,
          result.filePath
        );

        if (renderResult.success) {
          setExportStatus('Exportação concluída!');
          alert(`Vídeo exportado com sucesso!\n\nSalvo em: ${renderResult.outputPath}`);
        } else {
          setExportStatus('Erro na exportação');
          alert(`Erro ao exportar vídeo:\n\n${renderResult.error}`);
        }
      } catch (error) {
        console.error('Erro na exportação:', error);
        setExportStatus('Erro na exportação');
        alert(`Erro ao exportar vídeo:\n\n${error instanceof Error ? error.message : 'Erro desconhecido'}`);
      } finally {
        setIsExporting(false);
        setTimeout(() => {
          setExportProgress(0);
          setExportStatus('');
        }, 2000);
      }
    };

    return (
      <WizardApp
        currentStep={project.currentStep}
        srtContent={project.srtContent}
        audioUrl={project.audioUrl}
        subtitles={project.subtitles}
        imageBlocks={project.imageBlocks}
        selectedResolution={project.selectedResolution}
        showSubtitlesInVideo={project.showSubtitlesInVideo ?? false}
        fps={project.videoConfig.fps}
        exportProgress={exportProgress}
        exportStatus={exportStatus}
        isExporting={isExporting}
        onSetWizardStep={(step: WizardStep) => actions.setWizardStep(step)}
        onSetSrtContent={(content: string) => actions.setSrtContent(content)}
        onSetAudioUrl={(url: string | undefined) => actions.setAudioUrl(url)}
        onSetSubtitles={(subs: Subtitle[]) => actions.setSubtitles(subs)}
        onSetImageBlocks={(blocks: ImageBlock[]) => actions.setImageBlocks(blocks)}
        onUpdateImageBlock={(blockId: string, updates: Partial<ImageBlock>) =>
          actions.updateImageBlock(blockId, updates)
        }
        onSetImageBlockImage={(
          blockId: string,
          image: { url: string; width: number; height: number }
        ) => actions.setImageBlockImage(blockId, image.url, image.width, image.height)}
        onSetElementRegion={(
          blockId: string,
          elementId: string,
          region: ElementRegion
        ) => {
          // Determine source based on shape - freehand/polygon means manual drawing
          const source = (region.shape === 'freehand' || region.shape === 'polygon') ? 'manual' : 'auto';
          actions.setElementRegion(blockId, elementId, region, source);
        }}
        onClearElementRegion={(blockId: string, elementId: string) =>
          actions.clearElementRegion(blockId, elementId)
        }
        onUpdateElementAnimation={(
          blockId: string,
          elementId: string,
          revealDirection: import('../../types/ImageBlock').RevealDirection,
          revealPercentage: import('../../types/ImageBlock').RevealPercentage,
          displayMode: import('../../types/ImageBlock').ElementDisplayMode,
          drawingMode?: boolean
        ) => actions.updateTimelineElement(blockId, elementId, { revealDirection, revealPercentage, displayMode, drawingMode })}
        onSetBlockDetectionStatus={(
          blockId: string,
          status: ImageBlock['detectionStatus'],
          error?: string
        ) => actions.setBlockDetectionStatus(blockId, status, error)}
        onSetSelectedResolution={(resolution: VideoResolution) =>
          actions.setSelectedResolution(resolution)
        }
        onSetShowSubtitlesInVideo={(show: boolean) =>
          actions.setShowSubtitlesInVideo(show)
        }
        onExport={handleExport}
        onSwitchToLegacy={() => actions.setMode('legacy')}
        onNewProject={handleNewProject}
        onStartNewProject={handleStartNewProject}
        onLoadSavedProject={handleLoadSavedProject}
      />
    );
  }

  // Handlers de arquivo
  const handleImageUpload = useCallback(
    async (file: File) => {
      try {
        const { url, width, height } = await loadImage(file);
        actions.setImage(url, width, height);
      } catch (error) {
        console.error('Erro ao carregar imagem:', error);
        alert('Erro ao carregar imagem');
      }
    },
    [actions]
  );

  const handleSRTUpload = useCallback(
    async (file: File) => {
      try {
        const content = await loadSRTFile(file);
        const subtitles = parseSRT(content, project.videoConfig.fps);
        actions.setSubtitles(subtitles);
      } catch (error) {
        console.error('Erro ao carregar SRT:', error);
        alert('Erro ao carregar arquivo SRT');
      }
    },
    [actions, project.videoConfig.fps]
  );

  // Handler de formato
  const handleFormatChange = useCallback(
    (format: AspectRatio) => {
      actions.setAspectRatio(format);
    },
    [actions]
  );

  // Handler de seleção de cena
  const handleSceneSelect = useCallback((sceneId: string) => {
    setSelectedSceneId(sceneId);
    setEditorMode('elements');
  }, []);

  return (
    <div style={styles.container}>
      {/* Sidebar Esquerda - Cenas */}
      <div style={styles.sidebar}>
        <div style={styles.sectionTitle}>Cenas</div>
        <div style={styles.scrollable}>
          <SceneList
            scenes={project.scenes}
            selectedSceneId={selectedSceneId}
            onSelect={handleSceneSelect}
            onDelete={actions.deleteScene}
            onSetImage={actions.setSceneImage}
            onClearImage={actions.clearSceneImage}
            onAddSceneWithImage={actions.addSceneWithImage}
            onReorderScenes={actions.reorderScenes}
          />
        </div>
      </div>

      {/* Área Principal */}
      <div style={styles.main}>
        {/* Toolbar */}
        <div style={styles.toolbar}>
          <FileUploader
            label="Imagem"
            accept="image/*"
            onUpload={handleImageUpload}
            hasFile={!!project.imageUrl}
          />
          <FileUploader
            label="SRT"
            accept=".srt"
            onUpload={handleSRTUpload}
            hasFile={project.subtitles.length > 0}
          />

          {/* Seletor de Modo */}
          <div style={styles.modeSelector}>
            <button
              onClick={() => setEditorMode('scenes')}
              style={{
                ...styles.modeButton,
                ...(editorMode === 'scenes'
                  ? styles.modeButtonActive
                  : styles.modeButtonInactive),
              }}
            >
              Cenas
            </button>
            <button
              onClick={() => {
                if (selectedSceneId) {
                  setEditorMode('elements');
                } else {
                  alert('Selecione uma cena primeiro para editar elementos');
                }
              }}
              style={{
                ...styles.modeButton,
                ...(editorMode === 'elements'
                  ? styles.modeButtonActive
                  : styles.modeButtonInactive),
                opacity: selectedSceneId ? 1 : 0.5,
              }}
            >
              Elementos
            </button>
          </div>

          {/* Ferramentas de desenho (apenas no modo elementos) */}
          {editorMode === 'elements' && (
            <div style={styles.toolsContainer}>
              {drawingTools.map((tool) => (
                <button
                  key={tool.shape}
                  onClick={() => setCurrentTool(tool.shape)}
                  style={{
                    ...styles.toolButton,
                    ...(currentTool === tool.shape
                      ? styles.toolButtonActive
                      : styles.toolButtonInactive),
                  }}
                  title={tool.title}
                >
                  {tool.icon}
                </button>
              ))}
            </div>
          )}

          <div style={{ flex: 1 }} />

          <div style={styles.formatSelector}>
            {(['16:9', '9:16', '1:1'] as AspectRatio[]).map((format) => (
              <button
                key={format}
                onClick={() => handleFormatChange(format)}
                style={{
                  ...styles.formatButton,
                  ...(project.videoConfig.aspectRatio === format
                    ? styles.formatButtonActive
                    : styles.formatButtonInactive),
                }}
              >
                {format}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowPreview(!showPreview)}
            style={{
              ...styles.formatButton,
              backgroundColor: showPreview ? '#e94560' : '#0f3460',
              color: showPreview ? '#fff' : '#aaa',
            }}
          >
            {showPreview ? 'Editor' : 'Preview'}
          </button>

          <button
            onClick={() => actions.setMode('new-flow')}
            style={{
              ...styles.formatButton,
              backgroundColor: '#7c3aed',
              color: '#fff',
            }}
            title="Mudar para novo fluxo SRT-first"
          >
            🚀 Novo Fluxo
          </button>
        </div>

        {/* Canvas ou Preview */}
        <div style={styles.canvasContainer}>
          {showPreview ? (
            <VideoPreview projectData={project} />
          ) : (
            <ImageCanvas
              imageUrl={project.imageUrl}
              imageWidth={project.imageDimensions.width}
              imageHeight={project.imageDimensions.height}
              aspectRatio={project.videoConfig.aspectRatio}
              scenes={project.scenes}
              selectedScene={selectedScene}
              mode={editorMode}
              currentTool={currentTool}
              onAddScene={actions.addScene}
              onUpdateScene={actions.updateScene}
              onAddElement={(element) => {
                if (selectedSceneId) {
                  actions.addElement(selectedSceneId, element);
                }
              }}
              onUpdateElement={(elementId, updates) => {
                if (selectedSceneId) {
                  actions.updateElement(selectedSceneId, elementId, updates);
                }
              }}
            />
          )}
        </div>
      </div>

      {/* Painel Direito - Elementos e Legendas */}
      <div style={styles.rightPanel}>
        <div style={styles.sectionTitle}>
          {selectedScene ? `Elementos: ${selectedScene.label}` : 'Elementos'}
        </div>
        <div style={styles.scrollable}>
          {selectedScene ? (
            <ElementList
              elements={selectedScene.elements}
              subtitles={project.subtitles}
              onDelete={(elementId) => {
                actions.deleteElement(selectedScene.id, elementId);
              }}
              onMapToSubtitle={(elementId, subtitleIndex) => {
                actions.mapElementToSubtitle(
                  selectedScene.id,
                  elementId,
                  subtitleIndex
                );
              }}
            />
          ) : (
            <div style={{ color: '#666', textAlign: 'center', padding: 20 }}>
              Selecione uma cena para ver os elementos
            </div>
          )}
        </div>

        {/* Botão de auto-mapear legendas */}
        {project.subtitles.length > 0 && project.scenes.some(s => s.elements.length > 0) && (
          <div style={{ padding: '8px 16px', borderTop: '1px solid #0f3460' }}>
            <button
              onClick={() => {
                const totalElements = project.scenes.reduce((sum, s) => sum + s.elements.length, 0);
                if (window.confirm(
                  `Auto-mapear ${project.subtitles.length} legendas para ${totalElements} elementos?\n\n` +
                  `As legendas serão distribuídas sequencialmente entre os elementos de todas as cenas na ordem em que foram criados.`
                )) {
                  actions.autoMapSubtitles();
                }
              }}
              style={{
                width: '100%',
                padding: '10px 16px',
                backgroundColor: '#4ecdc4',
                color: '#1a1a2e',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              Auto-mapear Legendas
            </button>
            <div style={{
              marginTop: 8,
              fontSize: 11,
              color: '#888',
              textAlign: 'center'
            }}>
              {project.subtitles.length} legendas • {project.scenes.reduce((sum, s) => sum + s.elements.length, 0)} elementos
            </div>
          </div>
        )}

        <div style={styles.sectionTitle}>Exportar</div>
        <div style={{ padding: 16 }}>
          <ExportPanel projectData={project} />
        </div>
      </div>
    </div>
  );
};
