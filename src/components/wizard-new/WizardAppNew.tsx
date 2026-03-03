import React, { useState, useCallback, useEffect, useRef, Component, ErrorInfo } from 'react';
import type { Region } from '../../types/Region';
import type { ImageScene } from '../../types/ImageScene';
import { createVideoSegment } from '../../types/VideoSegment';
import type { ProjectNew } from '../../types/ProjectNew';
import type { TimelineProject } from '../../types/TimelineProject';
import { useProjectNew } from '../../hooks/useProjectNew';
import { useTimelineProject } from '../../hooks/useTimelineProject';
import { ImportStep } from './ImportStep';
import { PromptsStep } from './PromptsStep';
import { GensparkStep, type GeneratedImage } from './GensparkStep';
import { ImagesStep } from './ImagesStep';
import { RegionsStep } from './RegionsStep';
import { ExportStep } from './ExportStep';
import { ModeSelector, type ProjectMode } from '../mode-selector';
import { TimelineImportStep } from '../timeline/TimelineImportStep';
import { TimelineEditorStep } from '../timeline/TimelineEditorStep';
import { TimelineExportStep } from '../timeline/TimelineExportStep';
import { SettingsModal } from '../settings/SettingsModal';
import { regionToElementRegion } from '../../utils/pathUtils';
import type { ProjectConfig } from '../../utils/projectConfigParser';
import type { GeneratedScenePrompt } from '../../utils/aiPromptGenerator';
import { getExporter, type EditorType, type MediaHandling, SUPPORTED_EDITORS } from '../../exporters';
import {
  saveSrtProject,
  loadSrtProject,
  clearSrtProject,
  hasSrtProject,
  saveTimelineProject as saveTimelineProjectToDB,
  loadTimelineProject as loadTimelineProjectFromDB,
  clearTimelineProject,
  hasTimelineProject,
  clearAllProjects,
} from '../../utils/wizardStorage';

// Error Boundary global para capturar qualquer erro de renderização
class GlobalErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null; errorInfo: ErrorInfo | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[GlobalErrorBoundary] Erro capturado:', error);
    console.error('[GlobalErrorBoundary] Component stack:', errorInfo.componentStack);
    this.setState({ errorInfo });
  }

  handleClearAndReload = async () => {
    try {
      await clearAllProjects();
      localStorage.removeItem('automatizar-animacoes-mode');
    } catch (e) {
      console.error('Erro ao limpar dados:', e);
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            backgroundColor: '#0f0f1a',
            color: 'white',
            padding: 32,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 64, marginBottom: 24 }}>💥</div>
          <h1 style={{ color: '#ef4444', marginBottom: 16 }}>Erro Crítico</h1>
          <p style={{ color: '#a0a0b0', marginBottom: 24, maxWidth: 600 }}>
            Ocorreu um erro inesperado na aplicação. Isso pode ter sido causado por dados corrompidos.
          </p>
          <div
            style={{
              backgroundColor: '#1a1a2e',
              padding: 16,
              borderRadius: 8,
              marginBottom: 24,
              maxWidth: '90%',
              maxHeight: 300,
              overflow: 'auto',
              textAlign: 'left',
            }}
          >
            <div style={{ color: '#ef4444', fontWeight: 'bold', marginBottom: 8 }}>Erro:</div>
            <pre style={{ color: '#fbbf24', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {this.state.error?.message}
            </pre>
            <div style={{ color: '#ef4444', fontWeight: 'bold', marginTop: 16, marginBottom: 8 }}>Stack:</div>
            <pre style={{ color: '#6a6a8e', fontSize: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {this.state.error?.stack}
            </pre>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '12px 24px',
                backgroundColor: '#4a4a6e',
                border: 'none',
                borderRadius: 8,
                color: 'white',
                cursor: 'pointer',
              }}
            >
              Recarregar Página
            </button>
            <button
              onClick={this.handleClearAndReload}
              style={{
                padding: '12px 24px',
                backgroundColor: '#ef4444',
                border: 'none',
                borderRadius: 8,
                color: 'white',
                cursor: 'pointer',
              }}
            >
              Limpar Dados e Recomeçar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

type WizardStep = 'import' | 'prompts' | 'imageGen' | 'images' | 'regions' | 'export';
type TimelineStep = 'import' | 'editor' | 'export';

// Chave para salvar modo no localStorage
const STORAGE_KEY_MODE = 'automatizar-animacoes-mode';

// Chaves antigas (para migração/limpeza)
const STORAGE_KEY_OLD = 'automatizar-animacoes-project-v2';
const STORAGE_KEY_TIMELINE_OLD = 'automatizar-animacoes-timeline-v1';

const STEPS: Array<{ id: WizardStep; label: string; number: number }> = [
  { id: 'import', label: 'Importar', number: 1 },
  { id: 'prompts', label: 'Prompts', number: 2 },
  { id: 'imageGen', label: 'Geração Imagens', number: 3 },
  { id: 'images', label: 'Imagens', number: 4 },
  { id: 'regions', label: 'Regiões', number: 5 },
  { id: 'export', label: 'Exportar', number: 6 },
];

const TIMELINE_STEPS: Array<{ id: TimelineStep; label: string; number: number }> = [
  { id: 'import', label: 'Importar', number: 1 },
  { id: 'editor', label: 'Editor', number: 2 },
  { id: 'export', label: 'Exportar', number: 3 },
];

/**
 * Wizard simplificado com suporte a dois modos: SRT e Timeline.
 */
export const WizardAppNew: React.FC = () => {
  // Estado de carregamento inicial
  const [isInitializing, setIsInitializing] = useState(true);

  // Estado do modo (null = tela de seleção)
  const [mode, setMode] = useState<ProjectMode | null>(null);

  // Estados do modo SRT
  const [currentStep, setCurrentStep] = useState<WizardStep>('import');

  // Estados do modo Timeline
  const [timelineStep, setTimelineStep] = useState<TimelineStep>('import');

  // Estados compartilhados
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState<'idle' | 'rendering' | 'done' | 'error'>('idle');
  const [editorExportStatus, setEditorExportStatus] = useState<'idle' | 'exporting' | 'done' | 'error'>('idle');
  const [editorExportMessage, setEditorExportMessage] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [projectConfig, setProjectConfig] = useState<ProjectConfig | null>(null);
  const [generatedPrompts, setGeneratedPrompts] = useState<GeneratedScenePrompt[]>([]);

  const {
    project,
    setSubtitles,
    setAudio,
    addScene,
    removeScene,
    setRegion,
    clearRegion,
    setAllRegionsInScene,
    clearAllRegionsInScene,
    setAllRegionsGlobally,
    clearAllRegionsGlobally,
    updateSegment,
    addSegment,
    removeSegment,
    addErasedStroke,
    clearErasedStrokes,
    setVideoConfig,
    setShowSubtitles,
    updateAllSegments,
    loadProject,
    resetProject,
  } = useProjectNew();

  // Hook para o projeto Timeline
  const {
    project: timelineProject,
    setAudio: setTimelineAudio,
    addScene: addTimelineScene,
    setScenes: setTimelineScenes,
    removeScene: removeTimelineScene,
    updateScene: updateTimelineScene,
    setSceneTimes,
    createElement: createTimelineElement,
    updateElement: updateTimelineElement,
    removeElement: removeTimelineElement,
    setElementRegion: setTimelineElementRegion,
    setElementTimes,
    setElementAnimation,
    addErasedStroke: addTimelineErasedStroke,
    clearErasedStrokes: clearTimelineErasedStrokes,
    setVideoConfig: setTimelineVideoConfig,
    setBackgroundColor: setTimelineBackgroundColor,
    setShowSubtitles: setTimelineShowSubtitles,
    loadProject: loadTimelineProject,
    resetProject: resetTimelineProject,
    distributeSceneTimesEvenly,
  } = useTimelineProject();

  // Escuta evento customizado 'open-settings' disparado pelos componentes filhos
  useEffect(() => {
    const handleOpenSettings = (e: Event) => {
      const customEvent = e as CustomEvent<{ tab?: string }>;
      console.log('[WizardAppNew] Evento open-settings recebido:', customEvent.detail);
      setShowSettings(true);
    };

    window.addEventListener('open-settings', handleOpenSettings);
    return () => window.removeEventListener('open-settings', handleOpenSettings);
  }, []);

  // Carrega projeto salvo ao iniciar
  useEffect(() => {
    const loadSavedProjectData = async () => {
      try {
        // Primeiro verifica se há um modo salvo
        const savedMode = localStorage.getItem(STORAGE_KEY_MODE) as ProjectMode | null;
        console.log('[WizardAppNew] Modo salvo:', savedMode);

        // Limpa dados antigos do localStorage (migração)
        localStorage.removeItem(STORAGE_KEY_OLD);
        localStorage.removeItem(STORAGE_KEY_TIMELINE_OLD);

        if (savedMode === 'srt') {
          // Carrega projeto SRT do IndexedDB
          const savedData = await loadSrtProject();
          if (savedData) {
            const { step, project: savedProject } = savedData;

            // Validação das cenas
            if (savedProject.scenes && savedProject.scenes.length > 0) {
              const validScenes = savedProject.scenes.filter((scene: ImageScene) => {
                const isValid = scene && scene.imageUrl && scene.imageWidth > 0 && scene.imageHeight > 0;
                if (!isValid) {
                  console.warn('[Load] Cena inválida removida:', {
                    id: scene?.id,
                    hasUrl: !!scene?.imageUrl,
                    width: scene?.imageWidth,
                    height: scene?.imageHeight,
                  });
                }
                return isValid;
              });

              if (validScenes.length !== savedProject.scenes.length) {
                console.warn(`[Load] ${savedProject.scenes.length - validScenes.length} cena(s) inválidas foram removidas`);
                savedProject.scenes = validScenes;
              }
            }

            loadProject(savedProject);
            const validStep = ['import', 'prompts', 'imageGen', 'images', 'regions', 'export'].includes(step) ? step : 'import';
            setCurrentStep(validStep as WizardStep);
            setMode('srt');
            console.log('[WizardAppNew] Projeto SRT carregado com step:', validStep);
          } else {
            // Sem dados - limpa modo
            console.warn('[WizardAppNew] Modo SRT salvo mas sem dados de projeto');
            localStorage.removeItem(STORAGE_KEY_MODE);
          }
        } else if (savedMode === 'timeline') {
          // Carrega projeto Timeline do IndexedDB
          const savedData = await loadTimelineProjectFromDB();
          if (savedData) {
            const { step, project: savedProject } = savedData;

            // Garante que as cenas tenham estrutura válida
            const validScenes = (savedProject.scenes || []).filter((scene: any) => {
              const isValid = scene && typeof scene.id === 'string' && Array.isArray(scene.elements);
              if (!isValid) {
                console.warn('[Load Timeline] Cena inválida removida:', scene?.id);
              }
              return isValid;
            });

            // Corrige elementos de cada cena
            const fixedScenes = validScenes.map((scene: any) => {
              const elements = Array.isArray(scene.elements) ? scene.elements : [];
              const validElements = elements.filter((el: any) => {
                const hasValidRegion = el.region && el.region.pathData && el.region.pathData.trim() !== '';
                if (!hasValidRegion) {
                  console.warn(`[Load Timeline] Elemento ${el.id} tem pathData vazio, será removido`);
                }
                return hasValidRegion;
              });
              return {
                ...scene,
                elements: validElements,
                erasedStrokes: Array.isArray(scene.erasedStrokes) ? scene.erasedStrokes : [],
              };
            });

            const fixedProject = {
              ...savedProject,
              scenes: fixedScenes,
              backgroundColor: '#ffffff',
            };

            loadTimelineProject(fixedProject);
            const validStep = ['import', 'editor', 'export'].includes(step) ? step : 'import';
            setTimelineStep(validStep as TimelineStep);
            setMode('timeline');
            console.log('[WizardAppNew] Projeto Timeline carregado com step:', validStep, 'cenas:', fixedScenes.length);
          } else {
            // Sem dados - limpa modo
            console.warn('[WizardAppNew] Modo Timeline salvo mas sem dados de projeto');
            localStorage.removeItem(STORAGE_KEY_MODE);
          }
        }
        // Se não há modo salvo, permanece null (mostra ModeSelector)
      } catch (e) {
        console.error('Erro ao carregar projeto salvo:', e);
        // Em caso de erro, limpa tudo para evitar loops
        await clearAllProjects();
        localStorage.removeItem(STORAGE_KEY_MODE);
      } finally {
        // Finaliza a inicialização
        setIsInitializing(false);
      }
    };

    loadSavedProjectData();
  }, []);

  // Ref para controlar se está salvando (evita salvamentos simultâneos)
  const isSavingRef = useRef(false);

  // Salvar projeto manualmente (usando IndexedDB para imagens grandes)
  const handleSaveProject = useCallback(async (showAlert = true): Promise<boolean> => {
    if (isSavingRef.current) {
      console.log('[WizardAppNew] Salvamento já em andamento, ignorando...');
      return false;
    }

    isSavingRef.current = true;
    try {
      let success = false;

      if (mode === 'srt') {
        localStorage.setItem(STORAGE_KEY_MODE, 'srt');
        success = await saveSrtProject(currentStep, project);
      } else if (mode === 'timeline') {
        localStorage.setItem(STORAGE_KEY_MODE, 'timeline');
        success = await saveTimelineProjectToDB(timelineStep, timelineProject);
      }

      if (showAlert) {
        if (success) {
          alert('Projeto salvo com sucesso!');
        } else {
          alert('Erro ao salvar projeto');
        }
      }

      return success;
    } catch (e) {
      console.error('Erro ao salvar projeto:', e);
      if (showAlert) {
        alert('Erro ao salvar projeto: ' + (e instanceof Error ? e.message : 'Erro desconhecido'));
      }
      return false;
    } finally {
      isSavingRef.current = false;
    }
  }, [project, currentStep, mode, timelineProject, timelineStep]);

  // Wrapper para o menu (fecha o menu após salvar)
  const handleSaveFromMenu = useCallback(async () => {
    await handleSaveProject(true);
    setShowMenu(false);
  }, [handleSaveProject]);

  // Wrapper para os steps (mostra alert)
  const handleSaveFromStep = useCallback(async () => {
    await handleSaveProject(true);
  }, [handleSaveProject]);

  // Começar do zero (novo projeto)
  const handleNewProject = useCallback(async () => {
    if (window.confirm('Tem certeza que deseja começar um novo projeto?\nTodo o progresso atual será perdido.')) {
      // Limpa dados do IndexedDB e localStorage
      await clearAllProjects();
      localStorage.removeItem(STORAGE_KEY_MODE);
      // Limpa dados antigos também (migração)
      localStorage.removeItem(STORAGE_KEY_OLD);
      localStorage.removeItem(STORAGE_KEY_TIMELINE_OLD);
      resetProject();
      resetTimelineProject();
      setCurrentStep('import');
      setTimelineStep('import');
      setMode(null); // Volta para seleção de modo
    }
    setShowMenu(false);
  }, [resetProject, resetTimelineProject]);

  // Callback para seleção de modo
  const handleSelectMode = useCallback((selectedMode: ProjectMode) => {
    setMode(selectedMode);
    localStorage.setItem(STORAGE_KEY_MODE, selectedMode);
  }, []);

  // Alternar entre modos SRT e Timeline mantendo os dados salvos
  const handleSwitchMode = useCallback(async () => {
    // Salva o projeto atual antes de alternar (sem mostrar alerta)
    const saved = await handleSaveProject(false);

    if (!saved) {
      // Se falhou ao salvar, pergunta se quer continuar mesmo assim
      if (!window.confirm('Não foi possível salvar o projeto atual. Deseja alternar mesmo assim?')) {
        setShowMenu(false);
        return;
      }
    }

    // Alterna para o outro modo
    const newMode: ProjectMode = mode === 'srt' ? 'timeline' : 'srt';

    // Tenta carregar projeto existente do novo modo
    if (newMode === 'srt') {
      const savedData = await loadSrtProject();
      if (savedData) {
        loadProject(savedData.project);
        const validStep = ['import', 'prompts', 'imageGen', 'images', 'regions', 'export'].includes(savedData.step) ? savedData.step : 'import';
        setCurrentStep(validStep as WizardStep);
        console.log('[WizardAppNew] Projeto SRT carregado ao alternar modo');
      } else {
        // Sem projeto salvo - reinicia
        resetProject();
        setCurrentStep('import');
      }
    } else {
      const savedData = await loadTimelineProjectFromDB();
      if (savedData) {
        loadTimelineProject(savedData.project);
        const validStep = ['import', 'editor', 'export'].includes(savedData.step) ? savedData.step : 'import';
        setTimelineStep(validStep as TimelineStep);
        console.log('[WizardAppNew] Projeto Timeline carregado ao alternar modo');
      } else {
        // Sem projeto salvo - reinicia
        resetTimelineProject();
        setTimelineStep('import');
      }
    }

    setMode(newMode);
    localStorage.setItem(STORAGE_KEY_MODE, newMode);
    setShowMenu(false);
  }, [mode, handleSaveProject, loadProject, loadTimelineProject, resetProject, resetTimelineProject]);

  // Reiniciar etapa atual
  const handleRestartStep = useCallback(() => {
    if (mode === 'srt') {
      const stepNames: Record<WizardStep, string> = {
        import: 'Importar',
        prompts: 'Prompts',
        imageGen: 'Geração Imagens',
        images: 'Imagens',
        regions: 'Regiões',
        export: 'Exportar',
      };

      if (window.confirm(`Tem certeza que deseja reiniciar a etapa "${stepNames[currentStep]}"?`)) {
        switch (currentStep) {
          case 'import':
            setSubtitles([]);
            setAudio(undefined);
            break;
          case 'prompts':
            // Prompts são regeneráveis, nada a limpar aqui
            setGeneratedPrompts([]);
            break;
          case 'imageGen':
            // Geração de imagens é opcional, limpa prompts gerados
            setGeneratedPrompts([]);
            break;
          case 'images':
            project.scenes.forEach(scene => removeScene(scene.id));
            break;
          case 'regions':
            project.scenes.forEach(scene => {
              scene.segments.forEach(segment => {
                if (segment.region) {
                  clearRegion(scene.id, segment.id);
                }
              });
            });
            break;
          case 'export':
            setCurrentStep('regions');
            break;
        }
      }
    } else if (mode === 'timeline') {
      const stepNames: Record<TimelineStep, string> = {
        import: 'Importar',
        editor: 'Editor',
        export: 'Exportar',
      };

      if (window.confirm(`Tem certeza que deseja reiniciar a etapa "${stepNames[timelineStep]}"?`)) {
        switch (timelineStep) {
          case 'import':
            resetTimelineProject();
            break;
          case 'editor':
            // Limpa elementos de todas as cenas (mantém as cenas)
            timelineProject.scenes.forEach(scene => {
              scene.elements.forEach(element => {
                removeTimelineElement(scene.id, element.id);
              });
            });
            break;
          case 'export':
            setTimelineStep('editor');
            break;
        }
      }
    }
    setShowMenu(false);
  }, [mode, currentStep, timelineStep, project.scenes, timelineProject.scenes, removeScene, clearRegion, setSubtitles, setAudio, resetTimelineProject, removeTimelineElement]);

  // Navegação SRT
  const goToStep = useCallback((step: WizardStep) => {
    setCurrentStep(step);
  }, []);

  // Navegação Timeline
  const goToTimelineStep = useCallback((step: TimelineStep) => {
    setTimelineStep(step);
  }, []);

  // Handler para exportação - NOVA IMPLEMENTAÇÃO SIMPLIFICADA
  // Usa diretamente o formato ProjectNew sem conversões
  const handleExport = useCallback(async () => {
    setExportStatus('rendering');
    setExportProgress(0);

    try {
      // Verifica se estamos no Electron
      const electronAPI = (window as any).electronAPI;

      if (!electronAPI) {
        alert('Exportação disponível apenas no aplicativo desktop');
        setExportStatus('error');
        return;
      }

      // Abre diálogo para salvar
      const result = await electronAPI.saveFileDialog({
        title: 'Salvar Vídeo',
        defaultPath: `video-${Date.now()}.mp4`,
        filters: [{ name: 'Vídeo MP4', extensions: ['mp4'] }],
      });

      if (result.canceled || !result.filePath) {
        setExportStatus('idle');
        return;
      }

      // Valida que todas as cenas têm imagens válidas
      const invalidScenes = project.scenes.filter(
        (scene) => !scene.imageUrl || !scene.imageWidth || !scene.imageHeight || scene.imageWidth <= 0 || scene.imageHeight <= 0
      );

      if (invalidScenes.length > 0) {
        console.error('[Export] Cenas inválidas:', invalidScenes.map(s => ({
          id: s.id,
          imageUrl: s.imageUrl?.substring(0, 50),
          width: s.imageWidth,
          height: s.imageHeight,
        })));
        alert(`Erro: ${invalidScenes.length} cena(s) não têm imagem válida. Volte para o passo "Imagens" e corrija.`);
        setExportStatus('error');
        return;
      }

      // Log de debug
      console.log('[Export] Projeto para renderização:', {
        scenes: project.scenes.length,
        subtitles: project.subtitles.length,
        videoConfig: project.videoConfig,
      });

      // NOVA ABORDAGEM: Envia o projeto diretamente no formato ProjectNew
      // Isso elimina todas as conversões problemáticas
      const projectForRender = {
        // Flag para indicar que é o novo formato
        useVideoNew: true,
        // Projeto no formato nativo
        project: {
          ...project,
          // Garante que as cenas têm valores válidos
          scenes: project.scenes.map((scene) => ({
            ...scene,
            imageWidth: scene.imageWidth > 0 ? scene.imageWidth : 1920,
            imageHeight: scene.imageHeight > 0 ? scene.imageHeight : 1080,
            imageUrl: scene.imageUrl || '',
          })),
        },
        // Configuração de vídeo (para main.js)
        videoConfig: project.videoConfig,
      };

      // Escuta progresso
      const removeListener = electronAPI.onRenderProgress((data: { progress: number; status: string }) => {
        setExportProgress(data.progress);
        if (data.status === 'done') {
          setExportStatus('done');
          removeListener?.();
        } else if (data.status === 'error') {
          setExportStatus('error');
          removeListener?.();
        }
      });

      // Inicia renderização
      const renderResult = await electronAPI.renderVideo({
        projectData: projectForRender,
        outputPath: result.filePath,
      });

      if (!renderResult.success) {
        throw new Error(renderResult.error || 'Erro desconhecido');
      }

      setExportStatus('done');
    } catch (error) {
      console.error('Export error:', error);
      setExportStatus('error');
      alert(`Erro na exportação: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }, [project]);

  // Handler para exportação para editor de vídeo
  const handleExportToEditor = useCallback(async (editorId: EditorType, mediaHandling: MediaHandling) => {
    setEditorExportStatus('exporting');
    setEditorExportMessage('');

    try {
      // Verifica se estamos no Electron
      const electronAPI = (window as any).electronAPI;

      if (!electronAPI) {
        setEditorExportStatus('error');
        setEditorExportMessage('Exportação disponível apenas no aplicativo desktop');
        return;
      }

      // Obtém informações do editor
      const editorInfo = SUPPORTED_EDITORS.find(e => e.id === editorId);
      if (!editorInfo) {
        throw new Error(`Editor não suportado: ${editorId}`);
      }

      // Obtém o exportador
      const exporter = getExporter(editorId);

      // Valida o projeto
      const validation = exporter.canExport(project);
      if (!validation.valid) {
        setEditorExportStatus('error');
        setEditorExportMessage(`Projeto inválido: ${validation.issues.join(', ')}`);
        return;
      }

      // Abre diálogo para salvar
      const result = await electronAPI.saveFileDialog({
        title: `Salvar Projeto ${editorInfo.name}`,
        defaultPath: `${project.name || 'projeto'}${editorInfo.extension}`,
        filters: [{ name: editorInfo.name, extensions: [editorInfo.extension.replace('.', '')] }],
      });

      if (result.canceled || !result.filePath) {
        setEditorExportStatus('idle');
        return;
      }

      // Exporta o projeto
      const exportResult = await exporter.export(project, {
        outputPath: result.filePath,
        mediaHandling,
        projectName: project.name,
      });

      if (!exportResult.success) {
        throw new Error(exportResult.errors?.join(', ') || 'Erro desconhecido');
      }

      // Envia para o Electron salvar os arquivos
      const saveResult = await electronAPI.saveEditorProject({
        projectContent: (exportResult as any).projectContent,
        projectPath: exportResult.projectPath,
        mediaHandling,
        mediaPaths: project.scenes.map(s => s.imageUrl).filter(Boolean),
        audioPath: project.audioUrl,
      });

      if (!saveResult.success) {
        throw new Error(saveResult.error || 'Erro ao salvar arquivos');
      }

      // Sucesso
      let successMessage = `Projeto salvo em: ${exportResult.projectPath}`;
      if (exportResult.warnings && exportResult.warnings.length > 0) {
        successMessage += `\n\nAvisos:\n- ${exportResult.warnings.join('\n- ')}`;
      }

      setEditorExportStatus('done');
      setEditorExportMessage(successMessage);

    } catch (error) {
      console.error('Editor export error:', error);
      setEditorExportStatus('error');
      setEditorExportMessage(error instanceof Error ? error.message : 'Erro desconhecido');
    }
  }, [project]);

  // Handler para exportação de vídeo Timeline
  const handleTimelineExport = useCallback(async () => {
    setExportStatus('rendering');
    setExportProgress(0);

    try {
      // Verifica se estamos no Electron
      const electronAPI = (window as any).electronAPI;

      if (!electronAPI) {
        alert('Exportação disponível apenas no aplicativo desktop');
        setExportStatus('error');
        return;
      }

      // Abre diálogo para salvar
      const result = await electronAPI.saveFileDialog({
        title: 'Salvar Vídeo',
        defaultPath: `video-timeline-${Date.now()}.mp4`,
        filters: [{ name: 'Vídeo MP4', extensions: ['mp4'] }],
      });

      if (result.canceled || !result.filePath) {
        setExportStatus('idle');
        return;
      }

      // Valida que todas as cenas têm imagens válidas
      const invalidScenes = timelineProject.scenes.filter(
        (scene) => !scene.imageUrl || !scene.imageWidth || !scene.imageHeight || scene.imageWidth <= 0 || scene.imageHeight <= 0
      );

      if (invalidScenes.length > 0) {
        console.error('[TimelineExport] Cenas inválidas:', invalidScenes.map(s => ({
          id: s.id,
          imageUrl: s.imageUrl?.substring(0, 50),
          width: s.imageWidth,
          height: s.imageHeight,
        })));
        alert(`Erro: ${invalidScenes.length} cena(s) não têm imagem válida. Volte para o editor e corrija.`);
        setExportStatus('error');
        return;
      }

      // Log de debug
      console.log('[TimelineExport] Projeto para renderização:', {
        scenes: timelineProject.scenes.length,
        audioDuration: timelineProject.audioDuration,
        videoConfig: timelineProject.videoConfig,
      });

      // Prepara o projeto para renderização (formato Timeline)
      const projectForRender = {
        // Flag para indicar que é o formato Timeline
        useTimelineMode: true,
        // Projeto no formato nativo
        project: {
          ...timelineProject,
          // Garante que as cenas têm valores válidos
          scenes: timelineProject.scenes.map((scene) => ({
            ...scene,
            imageWidth: scene.imageWidth > 0 ? scene.imageWidth : 1920,
            imageHeight: scene.imageHeight > 0 ? scene.imageHeight : 1080,
            imageUrl: scene.imageUrl || '',
          })),
        },
        // Configuração de vídeo
        videoConfig: timelineProject.videoConfig,
      };

      // Escuta progresso
      const removeListener = electronAPI.onRenderProgress((data: { progress: number; status: string }) => {
        setExportProgress(data.progress);
        if (data.status === 'done') {
          setExportStatus('done');
          removeListener?.();
        } else if (data.status === 'error') {
          setExportStatus('error');
          removeListener?.();
        }
      });

      // Inicia renderização
      const renderResult = await electronAPI.renderVideo({
        projectData: projectForRender,
        outputPath: result.filePath,
      });

      if (!renderResult.success) {
        throw new Error(renderResult.error || 'Erro desconhecido');
      }

      setExportStatus('done');
    } catch (error) {
      console.error('Timeline export error:', error);
      setExportStatus('error');
      alert(`Erro na exportação: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }, [timelineProject]);

  // Handler para exportação Timeline para editor de vídeo
  const handleTimelineExportToEditor = useCallback(async (editorId: EditorType, mediaHandling: MediaHandling) => {
    setEditorExportStatus('exporting');
    setEditorExportMessage('');

    try {
      // Verifica se estamos no Electron
      const electronAPI = (window as any).electronAPI;

      if (!electronAPI) {
        setEditorExportStatus('error');
        setEditorExportMessage('Exportação disponível apenas no aplicativo desktop');
        return;
      }

      // Obtém informações do editor
      const editorInfo = SUPPORTED_EDITORS.find(e => e.id === editorId);
      if (!editorInfo) {
        throw new Error(`Editor não suportado: ${editorId}`);
      }

      // Abre diálogo para salvar
      const result = await electronAPI.saveFileDialog({
        title: `Salvar Projeto ${editorInfo.name}`,
        defaultPath: `${timelineProject.name || 'projeto-timeline'}${editorInfo.extension}`,
        filters: [{ name: editorInfo.name, extensions: [editorInfo.extension.replace('.', '')] }],
      });

      if (result.canceled || !result.filePath) {
        setEditorExportStatus('idle');
        return;
      }

      // TODO: Implementar exportador Timeline específico
      // Por enquanto, mostra mensagem informativa
      setEditorExportStatus('error');
      setEditorExportMessage('Exportação para editores ainda não implementada para o modo Timeline. Use a exportação de vídeo MP4.');

    } catch (error) {
      console.error('Timeline editor export error:', error);
      setEditorExportStatus('error');
      setEditorExportMessage(error instanceof Error ? error.message : 'Erro desconhecido');
    }
  }, [timelineProject]);

  // Handler para atualizar configurações globais de animação nos elementos Timeline
  const handleTimelineGlobalAnimationChange = useCallback((settings: {
    displayMode: import('../../types/VideoSegment').DisplayMode;
    revealDirection: import('../../types/VideoSegment').RevealDirection;
    revealFraction: number;
  }) => {
    // Atualiza todos os elementos de todas as cenas
    timelineProject.scenes.forEach((scene) => {
      scene.elements.forEach((element) => {
        setElementAnimation(scene.id, element.id, {
          revealDirection: settings.revealDirection,
          revealFraction: settings.revealFraction,
          displayMode: settings.displayMode,
        });
      });
    });
  }, [timelineProject.scenes, setElementAnimation]);

  // Renderiza o passo atual
  const renderStep = () => {
    switch (currentStep) {
      case 'import':
        return (
          <ImportStep
            subtitles={project.subtitles}
            audioUrl={project.audioUrl}
            fps={project.videoConfig.fps}
            onSubtitlesLoaded={setSubtitles}
            onAudioLoaded={setAudio}
            onNext={() => goToStep('prompts')}
            onSave={handleSaveFromStep}
          />
        );

      case 'prompts':
        return (
          <PromptsStep
            subtitles={project.subtitles}
            onBack={() => goToStep('import')}
            onNext={() => goToStep('imageGen')}
            onSkip={() => goToStep('images')}
            onSave={handleSaveFromStep}
            onPromptsGenerated={setGeneratedPrompts}
          />
        );

      case 'imageGen':
        return (
          <GensparkStep
            prompts={generatedPrompts}
            onImagesGenerated={async (images) => {
              console.log('[WizardAppNew] Imagens geradas:', images.length);

              // Remove cenas existentes antes de importar
              project.scenes.forEach(scene => removeScene(scene.id));

              // Distribui legendas entre as imagens
              const totalSubtitles = project.subtitles.length;
              const elementsPerImage = Math.floor(totalSubtitles / images.length);
              const remainder = totalSubtitles % images.length;

              // Cria cenas a partir das imagens geradas
              for (let i = 0; i < images.length; i++) {
                const img = images[i];
                const elementsCount = elementsPerImage + (i < remainder ? 1 : 0);

                let startIndex = 0;
                for (let j = 0; j < i; j++) {
                  startIndex += elementsPerImage + (j < remainder ? 1 : 0);
                }
                const endIndex = startIndex + elementsCount - 1;

                // Cria segmentos para as legendas deste range
                const segments: import('../../types/VideoSegment').VideoSegment[] = [];
                for (let s = startIndex; s <= endIndex; s++) {
                  segments.push(createVideoSegment(s));
                }

                // Carrega dimensões da imagem
                const dimensions = await new Promise<{ width: number; height: number }>((resolve) => {
                  const imgEl = new window.Image();
                  imgEl.onload = () => resolve({ width: imgEl.width, height: imgEl.height });
                  imgEl.onerror = () => resolve({ width: 1920, height: 1080 });
                  imgEl.src = img.dataUrl;
                });

                const scene: ImageScene = {
                  id: `gen-${Date.now()}-${i}`,
                  imageUrl: img.dataUrl,
                  imageWidth: dimensions.width,
                  imageHeight: dimensions.height,
                  segments,
                  startFrame: project.subtitles[startIndex]?.startFrame ?? 0,
                  endFrame: project.subtitles[endIndex]?.endFrame ?? 0,
                };

                addScene(scene);
              }

              goToStep('images');
            }}
            onSkip={() => goToStep('images')}
            onBack={() => goToStep('prompts')}
            onSave={handleSaveFromStep}
            onPromptsUploaded={(prompts) => {
              console.log('[WizardAppNew] Prompts importados via upload:', prompts.length);
              setGeneratedPrompts(prompts);
            }}
          />
        );

      case 'images':
        return (
          <ImagesStep
            subtitles={project.subtitles}
            scenes={project.scenes}
            projectConfig={projectConfig}
            onAddScene={addScene}
            onRemoveScene={removeScene}
            onBack={() => goToStep('imageGen')}
            onNext={() => goToStep('regions')}
            onSave={handleSaveFromStep}
          />
        );

      case 'regions':
        return (
          <RegionsStep
            subtitles={project.subtitles}
            scenes={project.scenes}
            fps={project.videoConfig.fps}
            videoWidth={project.videoConfig.width}
            videoHeight={project.videoConfig.height}
            onAddScene={addScene}
            onRemoveScene={removeScene}
            onSetRegion={setRegion}
            onClearRegion={clearRegion}
            onSetAllRegionsInScene={setAllRegionsInScene}
            onClearAllRegionsInScene={clearAllRegionsInScene}
            onSetAllRegionsGlobally={setAllRegionsGlobally}
            onClearAllRegionsGlobally={clearAllRegionsGlobally}
            onUpdateSegment={updateSegment}
            onAddSegment={addSegment}
            onRemoveSegment={removeSegment}
            onAddErasedStroke={addErasedStroke}
            onClearErasedStrokes={clearErasedStrokes}
            onBack={() => goToStep('images')}
            onNext={() => goToStep('export')}
            onSave={handleSaveFromStep}
          />
        );

      case 'export':
        return (
          <ExportStep
            project={project}
            onVideoConfigChange={setVideoConfig}
            onShowSubtitlesChange={setShowSubtitles}
            onGlobalAnimationChange={updateAllSegments}
            onBack={() => goToStep('regions')}
            onExport={handleExport}
            onExportToEditor={handleExportToEditor}
            exportProgress={exportProgress}
            exportStatus={exportStatus}
            editorExportStatus={editorExportStatus}
            editorExportMessage={editorExportMessage}
            onSave={handleSaveFromStep}
          />
        );

      default:
        return null;
    }
  };

  // Renderiza o passo atual do modo Timeline
  const renderTimelineStep = () => {
    // Debug: mostra info do projeto Timeline antes de tentar renderizar
    console.log('[WizardAppNew] renderTimelineStep chamado:', {
      step: timelineStep,
      projectExists: !!timelineProject,
      scenesCount: timelineProject?.scenes?.length ?? 'N/A',
      audioUrl: timelineProject?.audioUrl ? 'presente' : 'ausente',
      audioDuration: timelineProject?.audioDuration,
    });

    // Verifica se o projeto existe e é válido
    if (!timelineProject) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'white',
          backgroundColor: '#1a1a2e',
          gap: 16,
        }}>
          <div style={{ fontSize: 48 }}>⚠️</div>
          <div style={{ fontSize: 18 }}>Projeto Timeline não encontrado</div>
          <div style={{ color: '#888', fontSize: 14 }}>timelineProject é null ou undefined</div>
          <button
            onClick={() => goToTimelineStep('import')}
            style={{
              padding: '12px 24px',
              backgroundColor: '#6366f1',
              border: 'none',
              borderRadius: 8,
              color: 'white',
              cursor: 'pointer',
              marginTop: 16,
            }}
          >
            Voltar ao Início
          </button>
        </div>
      );
    }

    try {
      switch (timelineStep) {
        case 'import':
          return (
            <TimelineImportStep
              project={timelineProject}
              onAudioLoaded={setTimelineAudio}
              onAddScene={addTimelineScene}
              onAddScenesWithSRT={setTimelineScenes}
              onRemoveScene={removeTimelineScene}
              onDistributeEvenly={distributeSceneTimesEvenly}
              onNext={() => goToTimelineStep('editor')}
              onSave={handleSaveFromStep}
            />
          );

        case 'editor':
          // Debug extra para o editor
          console.log('[WizardAppNew] Renderizando TimelineEditorStep com:', {
            scenes: timelineProject.scenes?.map(s => ({
              id: s.id,
              hasImage: !!s.imageUrl,
              imageWidth: s.imageWidth,
              imageHeight: s.imageHeight,
              elements: s.elements?.length ?? 0,
            })),
          });

          // Verifica se as cenas são válidas antes de renderizar
          if (!timelineProject.scenes || !Array.isArray(timelineProject.scenes)) {
            return (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'white',
                backgroundColor: '#1a1a2e',
                gap: 16,
              }}>
                <div style={{ fontSize: 48 }}>⚠️</div>
                <div style={{ fontSize: 18 }}>Cenas inválidas</div>
                <div style={{ color: '#888', fontSize: 14 }}>
                  scenes é {timelineProject.scenes === null ? 'null' : typeof timelineProject.scenes}
                </div>
                <button
                  onClick={() => goToTimelineStep('import')}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#6366f1',
                    border: 'none',
                    borderRadius: 8,
                    color: 'white',
                    cursor: 'pointer',
                    marginTop: 16,
                  }}
                >
                  Voltar ao Início
                </button>
              </div>
            );
          }

          return (
            <TimelineEditorStep
              project={timelineProject}
              onUpdateScene={updateTimelineScene}
              onSetSceneTimes={setSceneTimes}
              onCreateElement={createTimelineElement}
              onUpdateElement={updateTimelineElement}
              onRemoveElement={removeTimelineElement}
              onSetElementRegion={setTimelineElementRegion}
              onSetElementTimes={setElementTimes}
              onSetElementAnimation={setElementAnimation}
              onAddErasedStroke={addTimelineErasedStroke}
              onClearErasedStrokes={clearTimelineErasedStrokes}
              onBack={() => goToTimelineStep('import')}
              onNext={() => goToTimelineStep('export')}
              onSave={handleSaveFromStep}
            />
          );

        case 'export':
          return (
            <TimelineExportStep
              project={timelineProject}
              onVideoConfigChange={setTimelineVideoConfig}
              onShowSubtitlesChange={setTimelineShowSubtitles}
              onGlobalAnimationChange={handleTimelineGlobalAnimationChange}
              onBack={() => goToTimelineStep('editor')}
              onExport={handleTimelineExport}
              onExportToEditor={handleTimelineExportToEditor}
              exportProgress={exportProgress}
              exportStatus={exportStatus}
              editorExportStatus={editorExportStatus}
              editorExportMessage={editorExportMessage}
              onSave={handleSaveFromStep}
            />
          );

        default:
          return (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'white',
              backgroundColor: '#1a1a2e',
              gap: 16,
            }}>
              <div style={{ fontSize: 48 }}>❓</div>
              <div style={{ fontSize: 18 }}>Passo desconhecido: {timelineStep}</div>
              <button
                onClick={() => goToTimelineStep('import')}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#6366f1',
                  border: 'none',
                  borderRadius: 8,
                  color: 'white',
                  cursor: 'pointer',
                  marginTop: 16,
                }}
              >
                Voltar ao Início
              </button>
            </div>
          );
      }
    } catch (error) {
      console.error('[WizardAppNew] Erro ao renderizar Timeline step:', error);
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'white',
          backgroundColor: '#1a1a2e',
          gap: 16,
          padding: 32,
        }}>
          <div style={{ fontSize: 48 }}>💥</div>
          <div style={{ fontSize: 18 }}>Erro ao renderizar</div>
          <div style={{
            color: '#ef4444',
            fontSize: 14,
            maxWidth: 600,
            textAlign: 'center',
            padding: 16,
            backgroundColor: 'rgba(239,68,68,0.1)',
            borderRadius: 8,
            wordBreak: 'break-word',
          }}>
            {error instanceof Error ? error.message : String(error)}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
            <button
              onClick={() => goToTimelineStep('import')}
              style={{
                padding: '12px 24px',
                backgroundColor: '#6366f1',
                border: 'none',
                borderRadius: 8,
                color: 'white',
                cursor: 'pointer',
              }}
            >
              Voltar ao Início
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '12px 24px',
                backgroundColor: '#4a4a6e',
                border: 'none',
                borderRadius: 8,
                color: 'white',
                cursor: 'pointer',
              }}
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }
  };

  // Encontra índice do passo atual
  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);
  const timelineStepIndex = TIMELINE_STEPS.findIndex((s) => s.id === timelineStep);

  // Função para limpar dados e recomeçar
  const handleClearAndRestart = useCallback(async () => {
    await clearAllProjects();
    localStorage.removeItem(STORAGE_KEY_MODE);
    localStorage.removeItem(STORAGE_KEY_OLD);
    localStorage.removeItem(STORAGE_KEY_TIMELINE_OLD);
    window.location.reload();
  }, []);

  // Se ainda está inicializando, mostra tela de carregamento
  if (isInitializing) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: '#1a1a2e',
          color: '#a0a0b0',
          fontSize: 18,
          gap: 24,
        }}
      >
        <div>Carregando...</div>
        <button
          onClick={handleClearAndRestart}
          style={{
            padding: '8px 16px',
            backgroundColor: 'transparent',
            border: '1px solid #4a4a6e',
            borderRadius: 6,
            color: '#6a6a8e',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Limpar dados e recomeçar
        </button>
      </div>
    );
  }

  // Se nenhum modo selecionado, mostra tela de seleção
  if (mode === null) {
    return <ModeSelector onSelectMode={handleSelectMode} />;
  }

  // Determina quais steps mostrar baseado no modo
  const stepsToShow = mode === 'srt' ? STEPS : TIMELINE_STEPS;
  const activeStepIndex = mode === 'srt' ? currentStepIndex : timelineStepIndex;
  const activeStepId = mode === 'srt' ? currentStep : timelineStep;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        maxHeight: '100vh',
        overflow: 'hidden',
        backgroundColor: '#0f0f1a',
      }}
    >
      {/* Header com stepper */}
      <div
        style={{
          padding: '12px 24px',
          borderBottom: '1px solid #2a2a4e',
          backgroundColor: '#1a1a2e',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Logo/Título + Menu */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <h1 style={{ color: 'white', fontSize: 20, margin: 0 }}>
              🎬 Automatizar Animações
            </h1>

            {/* Badge do modo */}
            <span
              style={{
                padding: '4px 12px',
                backgroundColor: mode === 'srt' ? '#6366f1' : '#22c55e',
                borderRadius: 12,
                fontSize: 12,
                fontWeight: 600,
                color: 'white',
              }}
            >
              {mode === 'srt' ? 'Modo SRT' : 'Modo Timeline'}
            </span>

            {/* Menu Dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowMenu(!showMenu)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: showMenu ? '#2a2a4e' : 'transparent',
                  border: '1px solid #4a4a6e',
                  borderRadius: 6,
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span>☰</span>
                <span>Menu</span>
              </button>

              {showMenu && (
                <>
                  {/* Overlay para fechar menu */}
                  <div
                    onClick={() => setShowMenu(false)}
                    style={{
                      position: 'fixed',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      zIndex: 99,
                    }}
                  />

                  {/* Menu dropdown */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: 8,
                      backgroundColor: '#1a1a2e',
                      border: '1px solid #4a4a6e',
                      borderRadius: 8,
                      padding: 8,
                      minWidth: 200,
                      zIndex: 100,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    }}
                  >
                    <button
                      onClick={handleSaveFromMenu}
                      style={{
                        width: '100%',
                        padding: '10px 16px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        borderRadius: 6,
                        color: 'white',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2a2a4e')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <span>💾</span>
                      <span>Salvar Projeto</span>
                    </button>

                    <button
                      onClick={handleRestartStep}
                      style={{
                        width: '100%',
                        padding: '10px 16px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        borderRadius: 6,
                        color: 'white',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2a2a4e')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <span>🔄</span>
                      <span>Reiniciar Etapa</span>
                    </button>

                    <button
                      onClick={() => {
                        setShowSettings(true);
                        setShowMenu(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 16px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        borderRadius: 6,
                        color: 'white',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2a2a4e')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <span>⚙️</span>
                      <span>Configurações</span>
                    </button>

                    <div style={{ height: 1, backgroundColor: '#4a4a6e', margin: '8px 0' }} />

                    <button
                      onClick={handleSwitchMode}
                      style={{
                        width: '100%',
                        padding: '10px 16px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        borderRadius: 6,
                        color: mode === 'srt' ? '#22c55e' : '#6366f1',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2a2a4e')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <span>🔀</span>
                      <span>Alternar para {mode === 'srt' ? 'Timeline' : 'SRT'}</span>
                    </button>

                    <div style={{ height: 1, backgroundColor: '#4a4a6e', margin: '8px 0' }} />

                    <button
                      onClick={handleNewProject}
                      style={{
                        width: '100%',
                        padding: '10px 16px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        borderRadius: 6,
                        color: '#ef4444',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2a2a4e')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <span>🗑️</span>
                      <span>Novo Projeto</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Stepper dinâmico baseado no modo */}
          <div style={{ display: 'flex', gap: 8 }}>
            {stepsToShow.map((step, index) => {
              const isActive = step.id === activeStepId;
              const isCompleted = index < activeStepIndex;
              const canProceed = mode === 'srt'
                ? canProceedFromStep(currentStep)
                : canProceedFromTimelineStep(timelineStep);
              const isClickable = isCompleted || (index === activeStepIndex + 1 && canProceed);

              return (
                <React.Fragment key={step.id}>
                  {index > 0 && (
                    <div
                      style={{
                        width: 40,
                        height: 2,
                        backgroundColor: isCompleted ? '#6366f1' : '#4a4a6e',
                        alignSelf: 'center',
                      }}
                    />
                  )}
                  <button
                    onClick={() => {
                      if (!isClickable) return;
                      if (mode === 'srt') {
                        goToStep(step.id as WizardStep);
                      } else {
                        goToTimelineStep(step.id as TimelineStep);
                      }
                    }}
                    disabled={!isClickable}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 16px',
                      backgroundColor: isActive ? '#2a2a4e' : 'transparent',
                      border: isActive ? '2px solid #6366f1' : '2px solid transparent',
                      borderRadius: 8,
                      color: isActive || isCompleted ? 'white' : '#666',
                      cursor: isClickable ? 'pointer' : 'default',
                    }}
                  >
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        backgroundColor: isCompleted ? '#22c55e' : isActive ? '#6366f1' : '#4a4a6e',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {isCompleted ? '✓' : step.number}
                    </div>
                    <span>{step.label}</span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>

          {/* Placeholder para manter layout */}
          <div style={{ width: 200 }} />
        </div>
      </div>

      {/* Conteúdo baseado no modo */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Debug overlay permanente para Timeline */}
        {mode === 'timeline' && (
          <div style={{
            position: 'absolute',
            top: 8,
            right: 8,
            backgroundColor: 'rgba(0,0,0,0.95)',
            color: '#22c55e',
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 11,
            zIndex: 99999,
            maxWidth: 350,
            fontFamily: 'monospace',
            border: '1px solid #22c55e',
          }}>
            <div style={{ marginBottom: 4, fontWeight: 'bold', color: '#fbbf24' }}>DEBUG Timeline</div>
            <div>Step: {timelineStep}</div>
            <div>Project: {timelineProject ? '✓' : '✗'}</div>
            <div>Scenes: {timelineProject?.scenes?.length ?? 'N/A'}</div>
            <div>Audio: {timelineProject?.audioUrl ? 'OK' : 'NO'}</div>
            <div>Duration: {timelineProject?.audioDuration ?? 0}ms</div>
            {timelineProject?.scenes?.map((s, i) => (
              <div key={s.id} style={{ fontSize: 10, color: '#a0a0b0' }}>
                Scene {i}: {s.imageUrl ? '✓img' : '✗img'} | {s.elements?.length ?? 0} elem
              </div>
            ))}
          </div>
        )}
        {mode === 'srt' ? renderStep() : renderTimelineStep()}
      </div>

      {/* Modal de Configurações */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );

  // Verifica se pode avançar do passo atual (modo SRT)
  function canProceedFromStep(step: WizardStep): boolean {
    switch (step) {
      case 'import':
        return project.subtitles.length > 0;
      case 'prompts':
        // Prompts são opcionais, sempre pode prosseguir se tiver legendas
        return project.subtitles.length > 0;
      case 'imageGen':
        // Geração de imagens é opcional, sempre pode pular
        return true;
      case 'images':
        return project.scenes.length > 0;
      case 'regions':
        // Verifica se há pelo menos uma região definida
        return project.scenes.some(scene =>
          scene.segments.some(segment => segment.region !== null)
        );
      case 'export':
        return true;
      default:
        return false;
    }
  }

  // Verifica se pode avançar do passo atual (modo Timeline)
  function canProceedFromTimelineStep(step: TimelineStep): boolean {
    switch (step) {
      case 'import':
        // Precisa ter áudio e pelo menos uma cena
        return timelineProject.audioUrl !== '' && timelineProject.scenes.length > 0;
      case 'editor':
        // Precisa ter pelo menos um elemento definido em alguma cena
        return timelineProject.scenes.some(scene => scene.elements.length > 0);
      case 'export':
        return true;
      default:
        return false;
    }
  }
};

// Componente wrapper com Error Boundary global
const WizardAppNewWithErrorBoundary: React.FC = () => {
  return (
    <GlobalErrorBoundary>
      <WizardAppNew />
    </GlobalErrorBoundary>
  );
};

export default WizardAppNewWithErrorBoundary;
