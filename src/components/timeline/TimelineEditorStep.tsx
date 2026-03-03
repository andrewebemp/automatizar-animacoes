import React, { useState, useCallback, useRef, useMemo, useEffect, Component, ErrorInfo } from 'react';
import type { TimelineProject, TimelineScene, SceneElement, ErasedStroke } from '../../types/TimelineProject';
import type { Region } from '../../types/Region';
import type { RevealDirection, DisplayMode, VideoSegment } from '../../types/VideoSegment';
import { formatTimeMsShort, createSceneElement } from '../../types/TimelineProject';
import { RegionCanvas, type DrawingTool } from '../region-editor/RegionCanvas';
import { ToolBar } from '../region-editor/ToolBar';
// WaveSurfer removido - causava tela branca. Usando HTMLAudioElement diretamente.

// Error Boundary local para capturar erros específicos deste componente
class TimelineEditorErrorBoundary extends Component<
  { children: React.ReactNode; onBack: () => void },
  { hasError: boolean; error: Error | null; errorInfo: ErrorInfo | null }
> {
  constructor(props: { children: React.ReactNode; onBack: () => void }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[TimelineEditorStep] Erro capturado:', error);
    console.error('[TimelineEditorStep] Component stack:', errorInfo.componentStack);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            backgroundColor: '#0f0f1a',
            color: '#a0a0b0',
            padding: 32,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ color: '#ef4444', marginBottom: 16 }}>Erro no Editor</h2>
          <p style={{ marginBottom: 16, maxWidth: 500 }}>
            Ocorreu um erro ao carregar o editor. Detalhes:
          </p>
          <pre
            style={{
              backgroundColor: '#1a1a2e',
              padding: 16,
              borderRadius: 8,
              fontSize: 12,
              color: '#ef4444',
              maxWidth: '100%',
              overflow: 'auto',
              marginBottom: 24,
              textAlign: 'left',
            }}
          >
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack}
          </pre>
          <button
            onClick={this.props.onBack}
            style={{
              padding: '12px 24px',
              backgroundColor: '#6366f1',
              border: 'none',
              borderRadius: 8,
              color: 'white',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Voltar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface TimelineEditorStepProps {
  /** Projeto atual */
  project: TimelineProject;

  /** Callback para atualizar cena */
  onUpdateScene: (sceneId: string, updates: Partial<TimelineScene>) => void;

  /** Callback para definir tempos da cena */
  onSetSceneTimes: (sceneId: string, startTime: number, endTime: number) => void;

  /** Callback para criar elemento */
  onCreateElement: (sceneId: string, region: Region, startTime: number, endTime: number) => string;

  /** Callback para atualizar elemento */
  onUpdateElement: (sceneId: string, elementId: string, updates: Partial<SceneElement>) => void;

  /** Callback para remover elemento */
  onRemoveElement: (sceneId: string, elementId: string) => void;

  /** Callback para definir região do elemento */
  onSetElementRegion: (sceneId: string, elementId: string, region: Region) => void;

  /** Callback para definir tempos do elemento */
  onSetElementTimes: (sceneId: string, elementId: string, startTime: number, endTime: number) => void;

  /** Callback para definir animação do elemento */
  onSetElementAnimation: (
    sceneId: string,
    elementId: string,
    options: { revealDirection?: RevealDirection; revealFraction?: number; displayMode?: DisplayMode }
  ) => void;

  /** Callback para adicionar traço apagado */
  onAddErasedStroke: (sceneId: string, stroke: ErasedStroke) => void;

  /** Callback para limpar traços apagados */
  onClearErasedStrokes: (sceneId: string) => void;

  /** Callback para voltar */
  onBack: () => void;

  /** Callback para avançar */
  onNext: () => void;

  /** Callback para salvar o projeto */
  onSave?: () => void;
}

/**
 * Editor principal do modo Timeline.
 * Permite desenhar elementos nas cenas e definir seus tempos.
 */
const TimelineEditorStepInner: React.FC<TimelineEditorStepProps> = ({
  project,
  onUpdateScene,
  onSetSceneTimes,
  onCreateElement,
  onUpdateElement,
  onRemoveElement,
  onSetElementRegion,
  onSetElementTimes,
  onSetElementAnimation,
  onAddErasedStroke,
  onClearErasedStrokes,
  onBack,
  onNext,
  onSave,
}) => {
  // LOG IMEDIATO ao entrar no componente
  console.log('[TimelineEditorStepInner] ===== COMPONENTE INICIADO =====');
  console.log('[TimelineEditorStepInner] project:', project ? 'existe' : 'NULL');
  console.log('[TimelineEditorStepInner] scenes:', project?.scenes?.length ?? 'N/A');

  // Estado de erro para mostrar visualmente
  const [renderError, setRenderError] = useState<string | null>(null);

  // Effect para logar quando o componente monta/desmonta
  useEffect(() => {
    console.log('[TimelineEditorStepInner] ===== MOUNTED =====');
    return () => {
      console.log('[TimelineEditorStepInner] ===== UNMOUNTED =====');
    };
  }, []);
  // Interface para histórico de ações (Undo)
  interface HistoryAction {
    type: 'region_change' | 'element_create' | 'element_delete' | 'element_times_change' | 'erased_stroke_add';
    sceneId: string;
    elementId?: string;
    previousRegion?: Region | null;
    previousTimes?: { startTime: number; endTime: number };
    deletedElement?: SceneElement;
    erasedStroke?: ErasedStroke;
  }

  // Estado do editor
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);
  const [selectedElementIndex, setSelectedElementIndex] = useState(-1);
  const [currentTool, setCurrentTool] = useState<DrawingTool>('select');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [polygonPoints, setPolygonPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [history, setHistory] = useState<HistoryAction[]>([]);
  const [redoHistory, setRedoHistory] = useState<HistoryAction[]>([]);

  // Estado para drag de bordas das cenas
  const [draggingSceneBorder, setDraggingSceneBorder] = useState<{
    sceneIndex: number;
    side: 'left' | 'right';
  } | null>(null);

  // Estado para drag de elementos na timeline
  const [draggingElement, setDraggingElement] = useState<{
    elementId: string;
    side: 'left' | 'right' | 'move';
    initialTime: number;
  } | null>(null);

  // Estado para zoom e scroll das timelines (unificado)
  const [timelineZoom, setTimelineZoom] = useState(1); // 1 = 100%, 2 = 200%, etc.

  // Refs
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveformContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<{ clearPolygonPoints: () => void } | null>(null);
  const sceneTrackRef = useRef<HTMLDivElement>(null);
  const elementTrackRef = useRef<HTMLDivElement>(null);
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const elementContainerRef = useRef<HTMLDivElement>(null);

  // Cena atual - com verificações de segurança
  const scenes = project?.scenes || [];
  const currentScene = scenes[selectedSceneIndex] || null;
  const currentElements = currentScene?.elements || [];
  const currentElement = currentElements[selectedElementIndex] || null;
  const currentSubtitles = currentScene?.subtitles || [];

  // Log de debug para verificar estado do projeto
  console.log('[TimelineEditorStepInner] Estado:', {
    scenesCount: scenes.length,
    selectedSceneIndex,
    hasCurrentScene: !!currentScene,
    currentSceneId: currentScene?.id,
    elementsCount: currentElements.length,
    audioUrl: project.audioUrl ? 'presente' : 'ausente',
    audioDuration: project.audioDuration,
  });

  // ID temporário para novo elemento
  const newElementId = 'new-element-placeholder';

  // Calcula o próximo tempo de elemento baseado nas legendas do SRT
  // Se há legendas, usa o tempo da próxima legenda não utilizada
  const getNextElementTimes = useCallback((): { startTime: number; endTime: number } => {
    if (!currentScene) {
      return { startTime: 0, endTime: 1000 };
    }

    // Se não há legendas do SRT, usa comportamento padrão
    if (currentSubtitles.length === 0) {
      const startTime = Math.max(currentScene.startTime, currentTime);
      const endTime = currentScene.endTime;
      return { startTime, endTime };
    }

    // Encontra a próxima legenda não utilizada (baseado no número de elementos já criados)
    const nextSubtitleIndex = currentElements.length;

    if (nextSubtitleIndex < currentSubtitles.length) {
      // Usa o tempo da próxima legenda
      const subtitle = currentSubtitles[nextSubtitleIndex];
      return {
        startTime: subtitle.startTime,
        endTime: subtitle.endTime,
      };
    }

    // Se todas as legendas já foram usadas, cria no final da cena
    const lastSubtitle = currentSubtitles[currentSubtitles.length - 1];
    return {
      startTime: lastSubtitle?.endTime || currentScene.startTime,
      endTime: currentScene.endTime,
    };
  }, [currentScene, currentSubtitles, currentElements.length, currentTime]);

  // Converte elementos para o formato VideoSegment para o RegionCanvas
  // Se não houver elementos, cria um placeholder para permitir desenhar
  const elementsAsSegments: VideoSegment[] = useMemo(() => {
    if (!currentScene) return [];

    const segments: VideoSegment[] = (currentScene?.elements || []).map((el, index) => {
      // Se a região tem pathData vazio, considera como null (não definida)
      const hasValidRegion = el.region && el.region.pathData && el.region.pathData.trim() !== '';

      return {
        id: el.id,
        subtitleIndex: index, // Usado como índice do elemento
        region: hasValidRegion ? el.region : null,
        revealDirection: el.revealDirection,
        revealFraction: el.revealFraction,
        displayMode: el.displayMode,
        scale: el.scale,
      };
    });

    // Adiciona um placeholder vazio se não houver elementos ou se o índice selecionado é -1
    // Isso permite que o RegionCanvas tenha um "segmento" para receber a nova região
    if (segments.length === 0 || selectedElementIndex === -1) {
      segments.push({
        id: newElementId,
        subtitleIndex: segments.length,
        region: null,
        revealDirection: 'auto',
        revealFraction: 0.6,
        displayMode: 'normal',
      });
    }

    return segments;
  }, [currentScene, selectedElementIndex]);

  // Configura o elemento de áudio para sincronizar tempo e estado
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime * 1000);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [project.audioUrl]);

  // Play/Pause usando HTMLAudioElement
  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      audio.play().catch(e => console.warn('Erro ao tocar áudio:', e));
    } else {
      audio.pause();
    }
  }, []);

  // Seek usando HTMLAudioElement
  const handleSeek = useCallback((timeMs: number) => {
    const audio = audioRef.current;
    if (!audio || project.audioDuration <= 0) return;

    const timeSec = timeMs / 1000;
    audio.currentTime = Math.max(0, Math.min(audio.duration || timeSec, timeSec));
    setCurrentTime(timeMs);
  }, [project.audioDuration]);

  // Handler quando uma região é desenhada ou atualizada no canvas
  // O RegionCanvas chama com segmentId (que é o element.id) e a nova região
  const handleRegionChange = useCallback(
    (segmentId: string, region: Region) => {
      if (!currentScene) return;

      // Se é o placeholder, cria um novo elemento
      if (segmentId === newElementId) {
        // Usa os tempos da próxima legenda do SRT (se disponível)
        const { startTime, endTime } = getNextElementTimes();

        const newId = onCreateElement(currentScene.id, region, startTime, endTime);

        // Adiciona ao histórico para poder desfazer e limpa redo
        setHistory((prev) => [
          ...prev,
          {
            type: 'element_create',
            sceneId: currentScene.id,
            elementId: newId,
          },
        ]);
        setRedoHistory([]); // Limpa redo quando nova ação é feita

        // Seleciona o novo elemento (será o último na lista)
        setSelectedElementIndex(currentElements.length);
        setCurrentTool('select');
        return;
      }

      // Verifica se é um elemento existente
      const existingElement = currentElements.find((el) => el.id === segmentId);

      if (existingElement) {
        // Salva estado anterior para undo e limpa redo
        setHistory((prev) => [
          ...prev,
          {
            type: 'region_change',
            sceneId: currentScene.id,
            elementId: segmentId,
            previousRegion: existingElement.region,
          },
        ]);
        setRedoHistory([]); // Limpa redo quando nova ação é feita
        // Atualiza região do elemento existente
        onSetElementRegion(currentScene.id, segmentId, region);
      } else {
        // Cria novo elemento com a região - usa tempos da próxima legenda
        const { startTime, endTime } = getNextElementTimes();

        const newId = onCreateElement(currentScene.id, region, startTime, endTime);

        // Adiciona ao histórico para poder desfazer e limpa redo
        setHistory((prev) => [
          ...prev,
          {
            type: 'element_create',
            sceneId: currentScene.id,
            elementId: newId,
          },
        ]);
        setRedoHistory([]); // Limpa redo quando nova ação é feita

        // Seleciona o novo elemento
        setSelectedElementIndex(currentElements.length);
        setCurrentTool('select');
      }
    },
    [currentScene, currentElements, onCreateElement, onSetElementRegion, newElementId, getNextElementTimes]
  );

  // Handler para selecionar elemento quando clicado no canvas
  const handleSegmentSelect = useCallback((index: number) => {
    setSelectedElementIndex(index);
  }, []);

  // Handler para limpar a região do elemento selecionado
  const handleClearRegion = useCallback(() => {
    if (!currentScene || !currentElement) return;
    // Salva estado para poder desfazer e limpa redo
    setHistory((prev) => [
      ...prev,
      {
        type: 'element_delete',
        sceneId: currentScene.id,
        elementId: currentElement.id,
        deletedElement: { ...currentElement },
      },
    ]);
    setRedoHistory([]); // Limpa redo quando nova ação é feita
    onRemoveElement(currentScene.id, currentElement.id);
    setSelectedElementIndex(-1);
  }, [currentScene, currentElement, onRemoveElement]);

  // Handler para selecionar toda a imagem como região
  const handleSelectAll = useCallback(() => {
    if (!currentScene) return;

    const fullRegion: Region = {
      id: `region-full-${Date.now()}`,
      pathData: `M 0 0 L ${currentScene.imageWidth} 0 L ${currentScene.imageWidth} ${currentScene.imageHeight} L 0 ${currentScene.imageHeight} Z`,
      bounds: { x: 0, y: 0, width: currentScene.imageWidth, height: currentScene.imageHeight },
      source: 'manual-rect',
    };

    // Usa os tempos da próxima legenda do SRT (se disponível)
    const { startTime, endTime } = getNextElementTimes();

    onCreateElement(currentScene.id, fullRegion, startTime, endTime);
    setSelectedElementIndex(currentElements.length);
    setCurrentTool('select');
  }, [currentScene, currentElements, onCreateElement, getNextElementTimes]);

  // Handler para traços de borracha
  const handleAddErasedStroke = useCallback(
    (stroke: ErasedStroke) => {
      if (!currentScene) return;
      // Adiciona ao histórico para poder desfazer e limpa redo
      setHistory((prev) => [
        ...prev,
        {
          type: 'erased_stroke_add',
          sceneId: currentScene.id,
          erasedStroke: stroke,
        },
      ]);
      setRedoHistory([]); // Limpa redo quando nova ação é feita
      onAddErasedStroke(currentScene.id, stroke);
    },
    [currentScene, onAddErasedStroke]
  );

  // Handler para desfazer última ação
  const handleUndo = useCallback(() => {
    if (history.length === 0) return;

    const lastAction = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    // Adiciona ao redoHistory para poder refazer
    setRedoHistory((prev) => [...prev, lastAction]);

    switch (lastAction.type) {
      case 'region_change':
        if (lastAction.elementId && lastAction.previousRegion) {
          onSetElementRegion(lastAction.sceneId, lastAction.elementId, lastAction.previousRegion);
        }
        break;
      case 'element_create':
        if (lastAction.elementId) {
          onRemoveElement(lastAction.sceneId, lastAction.elementId);
          setSelectedElementIndex(-1);
        }
        break;
      case 'element_delete':
        if (lastAction.deletedElement) {
          // Re-cria o elemento deletado
          const el = lastAction.deletedElement;
          onCreateElement(lastAction.sceneId, el.region, el.startTime, el.endTime);
        }
        break;
      case 'erased_stroke_add':
        // Para desfazer um traço de borracha, precisamos limpar todos os traços
        // e re-adicionar todos exceto o último
        // Por simplicidade, usamos o onClearErasedStrokes se for o único traço
        // ou deixamos como está (limitação atual)
        if (currentScene && currentScene.erasedStrokes && currentScene.erasedStrokes.length > 0) {
          // Remove o último traço apagado (simplificação: limpa todos se for só um)
          if (currentScene.erasedStrokes.length === 1) {
            onClearErasedStrokes(lastAction.sceneId);
          }
          // Nota: para suportar undo de traços individuais, seria necessário
          // implementar um callback onRemoveErasedStroke no hook
        }
        break;
      default:
        break;
    }
  }, [history, currentScene, onSetElementRegion, onRemoveElement, onCreateElement, onClearErasedStrokes]);

  // Handler para refazer última ação desfeita
  const handleRedo = useCallback(() => {
    if (redoHistory.length === 0) return;

    const lastRedoAction = redoHistory[redoHistory.length - 1];
    setRedoHistory((prev) => prev.slice(0, -1));
    // Adiciona de volta ao history
    setHistory((prev) => [...prev, lastRedoAction]);

    switch (lastRedoAction.type) {
      case 'region_change':
        // Para refazer mudança de região, precisamos aplicar a região atual (não a anterior)
        // Nota: a ação armazena previousRegion, então precisamos aplicar a operação original
        // Isso é uma limitação - para implementar corretamente, seria necessário armazenar também newRegion
        // Por enquanto, apenas ignora
        break;
      case 'element_create':
        // Não conseguimos refazer criação pois o elemento foi deletado e não temos a região
        // Limitação do sistema atual
        break;
      case 'element_delete':
        // Refaz a deleção do elemento
        if (lastRedoAction.deletedElement) {
          onRemoveElement(lastRedoAction.sceneId, lastRedoAction.deletedElement.id);
          setSelectedElementIndex(-1);
        }
        break;
      case 'erased_stroke_add':
        // Refaz o traço de borracha
        if (lastRedoAction.erasedStroke) {
          onAddErasedStroke(lastRedoAction.sceneId, lastRedoAction.erasedStroke);
        }
        break;
      default:
        break;
    }
  }, [redoHistory, onRemoveElement, onAddErasedStroke]);

  // Handler para limpar traços de borracha da cena atual
  const handleClearErasedStrokes = useCallback(() => {
    if (!currentScene) return;
    onClearErasedStrokes(currentScene.id);
  }, [currentScene, onClearErasedStrokes]);

  // Handler para aumentar a escala do elemento (10%)
  // Isso afeta o tamanho do elemento no vídeo final
  const handleScaleUp = useCallback(() => {
    if (!currentScene || !currentElement || !currentElement.region) return;

    const currentScale = currentElement.scale || 1.0;
    const newScale = Math.min(currentScale * 1.1, 3.0); // Máximo 3x

    // Atualiza a escala do elemento via onUpdateElement
    onUpdateElement(currentScene.id, currentElement.id, { scale: newScale });
  }, [currentScene, currentElement, onUpdateElement]);

  // Handler para reduzir a escala do elemento (10%)
  // Isso afeta o tamanho do elemento no vídeo final
  const handleScaleDown = useCallback(() => {
    if (!currentScene || !currentElement || !currentElement.region) return;

    const currentScale = currentElement.scale || 1.0;
    const newScale = Math.max(currentScale * 0.9, 0.1); // Mínimo 0.1x

    // Atualiza a escala do elemento via onUpdateElement
    onUpdateElement(currentScene.id, currentElement.id, { scale: newScale });
  }, [currentScene, currentElement, onUpdateElement]);

  // Keyboard listener para Ctrl+Z (Undo) e Ctrl+Y (Redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Handler para adicionar novo elemento (botão "+")
  const handleAddNewElement = useCallback(() => {
    // Desseleciona elemento atual e prepara para desenhar novo
    setSelectedElementIndex(-1);
    // Muda para ferramenta de retângulo para facilitar o desenho
    setCurrentTool('rect');
  }, []);

  // Handler para mover elemento para a cena anterior
  const handleMoveElementToPreviousScene = useCallback(() => {
    if (!currentScene || !currentElement || selectedSceneIndex <= 0) return;

    const previousScene = scenes[selectedSceneIndex - 1];
    if (!previousScene) return;

    // Remove da cena atual
    onRemoveElement(currentScene.id, currentElement.id);

    // Cria na cena anterior com mesma região mas ajustando tempos para a cena anterior
    const newStartTime = previousScene.startTime;
    const newEndTime = Math.min(previousScene.endTime, newStartTime + (currentElement.endTime - currentElement.startTime));

    onCreateElement(previousScene.id, currentElement.region, newStartTime, newEndTime);

    // Muda para a cena anterior
    setSelectedSceneIndex(selectedSceneIndex - 1);
    setSelectedElementIndex(-1);
  }, [currentScene, currentElement, selectedSceneIndex, scenes, onRemoveElement, onCreateElement]);

  // Handler para mover elemento para a próxima cena
  const handleMoveElementToNextScene = useCallback(() => {
    if (!currentScene || !currentElement || selectedSceneIndex >= scenes.length - 1) return;

    const nextScene = scenes[selectedSceneIndex + 1];
    if (!nextScene) return;

    // Remove da cena atual
    onRemoveElement(currentScene.id, currentElement.id);

    // Cria na próxima cena com mesma região mas ajustando tempos para a próxima cena
    const newStartTime = nextScene.startTime;
    const newEndTime = Math.min(nextScene.endTime, newStartTime + (currentElement.endTime - currentElement.startTime));

    onCreateElement(nextScene.id, currentElement.region, newStartTime, newEndTime);

    // Muda para a próxima cena
    setSelectedSceneIndex(selectedSceneIndex + 1);
    setSelectedElementIndex(-1);
  }, [currentScene, currentElement, selectedSceneIndex, scenes, onRemoveElement, onCreateElement]);

  // Handler para mover posição do elemento na cena (offset)
  const handleMovePosition = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right') => {
      if (!currentScene || !currentElement) return;

      const MOVE_STEP = 50; // 50 pixels por clique
      const currentOffset = currentElement.offset || { x: 0, y: 0 };

      let newOffset = { ...currentOffset };
      switch (direction) {
        case 'up':
          newOffset.y -= MOVE_STEP;
          break;
        case 'down':
          newOffset.y += MOVE_STEP;
          break;
        case 'left':
          newOffset.x -= MOVE_STEP;
          break;
        case 'right':
          newOffset.x += MOVE_STEP;
          break;
      }

      onUpdateElement(currentScene.id, currentElement.id, { offset: newOffset });
    },
    [currentScene, currentElement, onUpdateElement]
  );

  // Handler para resetar posição do elemento
  const handleResetPosition = useCallback(() => {
    if (!currentScene || !currentElement) return;
    onUpdateElement(currentScene.id, currentElement.id, { offset: { x: 0, y: 0 } });
  }, [currentScene, currentElement, onUpdateElement]);

  // Converte posição X do mouse para tempo em ms
  const xToTime = useCallback((clientX: number, trackRef: React.RefObject<HTMLDivElement | null>) => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    return Math.round(percent * project.audioDuration);
  }, [project.audioDuration]);

  // Handler para início do drag da borda de uma cena
  const handleSceneBorderMouseDown = useCallback((
    e: React.MouseEvent,
    sceneIndex: number,
    side: 'left' | 'right'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setDraggingSceneBorder({ sceneIndex, side });
  }, []);

  // Handler para início do drag de um elemento na timeline
  const handleElementMouseDown = useCallback((
    e: React.MouseEvent,
    elementId: string,
    side: 'left' | 'right' | 'move',
    initialTime: number
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setDraggingElement({ elementId, side, initialTime });
  }, []);

  // Handler global de mouse move para drag
  useEffect(() => {
    if (!draggingSceneBorder && !draggingElement) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Drag de borda de cena
      if (draggingSceneBorder) {
        const newTime = xToTime(e.clientX, sceneTrackRef);
        const scene = scenes[draggingSceneBorder.sceneIndex];
        if (!scene) return;

        const minDuration = 1000; // Mínimo 1 segundo

        if (draggingSceneBorder.side === 'left') {
          // Ajusta início da cena
          const prevScene = scenes[draggingSceneBorder.sceneIndex - 1];
          const minStart = prevScene ? prevScene.startTime + minDuration : 0;
          const maxStart = scene.endTime - minDuration;
          const clampedTime = Math.max(minStart, Math.min(maxStart, newTime));

          // Atualiza cena atual
          onSetSceneTimes(scene.id, clampedTime, scene.endTime);

          // Atualiza cena anterior se existir
          if (prevScene) {
            onSetSceneTimes(prevScene.id, prevScene.startTime, clampedTime);
          }
        } else {
          // Ajusta fim da cena
          const nextScene = scenes[draggingSceneBorder.sceneIndex + 1];
          const minEnd = scene.startTime + minDuration;
          const maxEnd = nextScene ? nextScene.endTime - minDuration : project.audioDuration;
          const clampedTime = Math.max(minEnd, Math.min(maxEnd, newTime));

          // Atualiza cena atual
          onSetSceneTimes(scene.id, scene.startTime, clampedTime);

          // Atualiza cena seguinte se existir
          if (nextScene) {
            onSetSceneTimes(nextScene.id, clampedTime, nextScene.endTime);
          }
        }
      }

      // Drag de elemento na timeline
      if (draggingElement && currentScene) {
        const newTime = xToTime(e.clientX, elementTrackRef);
        const element = currentElements.find(el => el.id === draggingElement.elementId);
        if (!element) return;

        const duration = element.endTime - element.startTime;
        const minTime = currentScene.startTime;
        const maxTime = currentScene.endTime;

        if (draggingElement.side === 'left') {
          // Ajusta início do elemento
          const clampedStart = Math.max(minTime, Math.min(element.endTime - 100, newTime));
          onSetElementTimes(currentScene.id, element.id, clampedStart, element.endTime);
        } else if (draggingElement.side === 'right') {
          // Ajusta fim do elemento
          const clampedEnd = Math.max(element.startTime + 100, Math.min(maxTime, newTime));
          onSetElementTimes(currentScene.id, element.id, element.startTime, clampedEnd);
        } else {
          // Move o elemento inteiro
          const delta = newTime - draggingElement.initialTime;
          let newStart = element.startTime + delta;
          let newEnd = element.endTime + delta;

          // Limita aos bounds da cena
          if (newStart < minTime) {
            newStart = minTime;
            newEnd = minTime + duration;
          }
          if (newEnd > maxTime) {
            newEnd = maxTime;
            newStart = maxTime - duration;
          }

          onSetElementTimes(currentScene.id, element.id, newStart, newEnd);
          setDraggingElement({ ...draggingElement, initialTime: newTime });
        }
      }
    };

    const handleMouseUp = () => {
      setDraggingSceneBorder(null);
      setDraggingElement(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingSceneBorder, draggingElement, scenes, project.audioDuration, currentScene, xToTime, onSetSceneTimes, onSetElementTimes]);

  // Handlers de zoom (unificado para todas as tracks, incluindo waveform)
  // O WaveSurfer é sincronizado via useEffect separado que observa timelineZoom
  const handleTimelineZoomIn = useCallback(() => {
    setTimelineZoom((prev) => Math.min(prev * 1.5, 10)); // Máximo 10x
  }, []);

  const handleTimelineZoomOut = useCallback(() => {
    setTimelineZoom((prev) => Math.max(prev / 1.5, 1)); // Mínimo 1x
  }, []);

  // Sincroniza scroll entre waveform, timeline e elementos
  const syncScroll = useCallback((scrollLeft: number, source: 'waveform' | 'timeline' | 'element') => {
    if (source !== 'waveform' && waveformContainerRef.current && waveformContainerRef.current.scrollLeft !== scrollLeft) {
      waveformContainerRef.current.scrollLeft = scrollLeft;
    }
    if (source !== 'timeline' && timelineContainerRef.current && timelineContainerRef.current.scrollLeft !== scrollLeft) {
      timelineContainerRef.current.scrollLeft = scrollLeft;
    }
    if (source !== 'element' && elementContainerRef.current && elementContainerRef.current.scrollLeft !== scrollLeft) {
      elementContainerRef.current.scrollLeft = scrollLeft;
    }
  }, []);

  const handleWaveformScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    syncScroll(e.currentTarget.scrollLeft, 'waveform');
  }, [syncScroll]);

  const handleTimelineScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    syncScroll(e.currentTarget.scrollLeft, 'timeline');
  }, [syncScroll]);

  const handleElementScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    syncScroll(e.currentTarget.scrollLeft, 'element');
  }, [syncScroll]);

  // Pode avançar?
  const canProceed = scenes.some((scene) => scene.elements && scene.elements.length > 0);

  // Se não houver cenas ou projeto inválido, mostra mensagem
  if (scenes.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          backgroundColor: '#0f0f1a',
          color: '#a0a0b0',
          padding: 32,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h2 style={{ color: 'white', marginBottom: 16 }}>Nenhuma cena disponível</h2>
        <p style={{ marginBottom: 24 }}>
          Volte para a etapa anterior e adicione imagens para criar cenas.
        </p>
        {/* Info de debug */}
        <div style={{
          backgroundColor: '#1a1a2e',
          padding: 16,
          borderRadius: 8,
          marginBottom: 24,
          fontSize: 12,
          textAlign: 'left',
          maxWidth: 400,
        }}>
          <div style={{ color: '#fbbf24', marginBottom: 8 }}>Debug Info:</div>
          <div>project.scenes.length: {project?.scenes?.length ?? 'undefined'}</div>
          <div>project.audioUrl: {project?.audioUrl ? 'presente' : 'ausente'}</div>
          <div>project.audioDuration: {project?.audioDuration ?? 'undefined'}</div>
          <div>project.id: {project?.id ?? 'undefined'}</div>
        </div>
        <button
          onClick={onBack}
          style={{
            padding: '12px 24px',
            backgroundColor: '#6366f1',
            border: 'none',
            borderRadius: 8,
            color: 'white',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#0f0f1a',
      }}
    >
      {/* Elemento de áudio oculto para playback */}
      {project.audioUrl && (
        <audio
          ref={audioRef}
          src={project.audioUrl}
          preload="auto"
          style={{ display: 'none' }}
        />
      )}

      {/* Área principal */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Lista de cenas (lateral esquerda) */}
        <div
          style={{
            width: 200,
            borderRight: '1px solid #2a2a4e',
            overflow: 'auto',
            padding: 16,
          }}
        >
          <h3 style={{ color: 'white', marginBottom: 16, fontSize: 14 }}>Cenas</h3>
          {scenes.map((scene, index) => (
            <button
              key={scene.id}
              onClick={() => {
                setSelectedSceneIndex(index);
                setSelectedElementIndex(-1);
              }}
              style={{
                width: '100%',
                padding: 8,
                marginBottom: 8,
                backgroundColor: selectedSceneIndex === index ? '#6366f1' : '#2a2a3e',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  aspectRatio: '16/9',
                  backgroundColor: '#1a1a2e',
                  borderRadius: 4,
                  overflow: 'hidden',
                  marginBottom: 8,
                }}
              >
                <img
                  src={scene.imageUrl}
                  alt={`Cena ${index + 1}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
              <div style={{ color: 'white', fontSize: 12, fontWeight: 600 }}>
                Cena {index + 1}
              </div>
              <div style={{ color: '#a0a0b0', fontSize: 10 }}>
                {scene.elements.length} elemento(s)
              </div>
              {scene.subtitles && scene.subtitles.length > 0 && (
                <div style={{ color: '#6366f1', fontSize: 9, marginTop: 2 }}>
                  {scene.subtitles.length} legenda(s) SRT
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Área central - Canvas e elementos */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {currentScene ? (
            <>
              {/* Toolbar */}
              <div style={{ padding: '8px 16px', borderBottom: '1px solid #2a2a4e' }}>
                <ToolBar
                  currentTool={currentTool}
                  onToolChange={setCurrentTool}
                  onClearRegion={handleClearRegion}
                  onSelectAll={handleSelectAll}
                  hasRegion={currentElement !== null && currentElement.region !== null}
                  hasPolygonPoints={polygonPoints.length > 0}
                  onScaleUp={handleScaleUp}
                  onScaleDown={handleScaleDown}
                  onUndo={handleUndo}
                  canUndo={history.length > 0}
                  onRedo={handleRedo}
                  canRedo={redoHistory.length > 0}
                  onMoveRegionToPrevious={handleMoveElementToPreviousScene}
                  onMoveRegionToNext={handleMoveElementToNextScene}
                  canMoveRegionToPrevious={currentElement !== null && selectedSceneIndex > 0}
                  canMoveRegionToNext={currentElement !== null && selectedSceneIndex < scenes.length - 1}
                  onMovePosition={handleMovePosition}
                  onResetPosition={handleResetPosition}
                  hasOffset={currentElement !== null && currentElement.offset !== undefined && (currentElement.offset.x !== 0 || currentElement.offset.y !== 0)}
                  hasErasedStrokes={(currentScene?.erasedStrokes?.length || 0) > 0}
                  onClearErasedStrokes={handleClearErasedStrokes}
                />
              </div>

              {/* Info de legendas do SRT (se disponível) */}
              {currentSubtitles.length > 0 && (
                <div
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#6366f115',
                    borderBottom: '1px solid #2a2a4e',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                  }}
                >
                  <div style={{ color: '#6366f1', fontSize: 12, fontWeight: 600 }}>
                    Legendas SRT: {currentElements.length} / {currentSubtitles.length}
                  </div>
                  {currentElements.length < currentSubtitles.length && (
                    <div style={{ color: '#a0a0b0', fontSize: 11 }}>
                      Próximo elemento: {formatTimeMsShort(currentSubtitles[currentElements.length].startTime)} - {formatTimeMsShort(currentSubtitles[currentElements.length].endTime)}
                    </div>
                  )}
                  {currentElements.length >= currentSubtitles.length && (
                    <div style={{ color: '#22c55e', fontSize: 11 }}>
                      Todas as legendas foram mapeadas
                    </div>
                  )}
                </div>
              )}

              {/* Canvas */}
              <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                {currentScene ? (
                  (() => {
                    // Wrap em try-catch para diagnóstico
                    try {
                      // Verifica se imageUrl é válido
                      if (!currentScene.imageUrl) {
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#ef4444' }}>
                            Erro: imageUrl ausente na cena
                          </div>
                        );
                      }
                      return (
                        <RegionCanvas
                          imageUrl={currentScene.imageUrl}
                          imageWidth={currentScene.imageWidth}
                          imageHeight={currentScene.imageHeight}
                          segments={elementsAsSegments}
                          selectedSegmentIndex={
                            selectedElementIndex >= 0
                              ? selectedElementIndex
                              : elementsAsSegments.length - 1  // Seleciona o placeholder se nenhum elemento selecionado
                          }
                          tool={currentTool}
                          onRegionChange={handleRegionChange}
                          onSegmentSelect={handleSegmentSelect}
                          erasedStrokes={currentScene.erasedStrokes || []}
                          onAddErasedStroke={handleAddErasedStroke}
                          onPolygonPointsChange={(hasPoints) => {
                            if (!hasPoints) setPolygonPoints([]);
                          }}
                          canvasRef={canvasRef}
                          onAddSegment={handleAddNewElement}
                        />
                      );
                    } catch (canvasError) {
                      console.error('[TimelineEditorStep] Erro ao renderizar RegionCanvas:', canvasError);
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#ef4444', padding: 16 }}>
                          <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
                          <div>Erro ao renderizar canvas</div>
                          <div style={{ fontSize: 11, color: '#a0a0b0', marginTop: 8 }}>
                            {canvasError instanceof Error ? canvasError.message : String(canvasError)}
                          </div>
                        </div>
                      );
                    }
                  })()
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                      color: '#a0a0b0',
                    }}
                  >
                    Selecione uma cena para editar
                  </div>
                )}

                {/* Overlay mostrando elementos existentes */}
                {currentScene && currentElements.length > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      backgroundColor: 'rgba(0,0,0,0.8)',
                      borderRadius: 8,
                      padding: 12,
                      maxWidth: 200,
                    }}
                  >
                    <div style={{ color: 'white', fontSize: 12, marginBottom: 8 }}>
                      Elementos:
                    </div>
                    {currentElements.map((el, idx) => (
                      <button
                        key={el.id}
                        onClick={() => setSelectedElementIndex(idx)}
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: '6px 10px',
                          marginBottom: 4,
                          backgroundColor: selectedElementIndex === idx ? '#6366f1' : '#2a2a3e',
                          border: 'none',
                          borderRadius: 4,
                          color: 'white',
                          fontSize: 11,
                          textAlign: 'left',
                          cursor: 'pointer',
                        }}
                      >
                        #{idx + 1}: {formatTimeMsShort(el.startTime)} - {formatTimeMsShort(el.endTime)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Lista de elementos com timing */}
              {currentScene && currentElements.length > 0 && (
                <div
                  style={{
                    padding: 16,
                    borderTop: '1px solid #2a2a4e',
                    maxHeight: 150,
                    overflow: 'auto',
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {currentElements.map((el, idx) => (
                      <div
                        key={el.id}
                        style={{
                          padding: '8px 12px',
                          backgroundColor: selectedElementIndex === idx ? '#6366f1' : '#2a2a3e',
                          borderRadius: 8,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <span style={{ color: 'white', fontSize: 12 }}>#{idx + 1}</span>
                        <input
                          type="text"
                          value={formatTimeMsShort(el.startTime)}
                          onChange={(e) => {
                            // Parseia tempo no formato MM:SS
                            const parts = e.target.value.split(':');
                            if (parts.length === 2) {
                              const mins = parseInt(parts[0]) || 0;
                              const secs = parseInt(parts[1]) || 0;
                              const newTime = (mins * 60 + secs) * 1000;
                              onSetElementTimes(currentScene.id, el.id, newTime, el.endTime);
                            }
                          }}
                          style={{
                            width: 50,
                            padding: '4px 8px',
                            backgroundColor: '#1a1a2e',
                            border: '1px solid #4a4a6e',
                            borderRadius: 4,
                            color: 'white',
                            fontSize: 11,
                            textAlign: 'center',
                          }}
                        />
                        <span style={{ color: '#a0a0b0' }}>-</span>
                        <input
                          type="text"
                          value={formatTimeMsShort(el.endTime)}
                          onChange={(e) => {
                            const parts = e.target.value.split(':');
                            if (parts.length === 2) {
                              const mins = parseInt(parts[0]) || 0;
                              const secs = parseInt(parts[1]) || 0;
                              const newTime = (mins * 60 + secs) * 1000;
                              onSetElementTimes(currentScene.id, el.id, el.startTime, newTime);
                            }
                          }}
                          style={{
                            width: 50,
                            padding: '4px 8px',
                            backgroundColor: '#1a1a2e',
                            border: '1px solid #4a4a6e',
                            borderRadius: 4,
                            color: 'white',
                            fontSize: 11,
                            textAlign: 'center',
                          }}
                        />
                        {/* Indicador de escala */}
                        {el.scale && el.scale !== 1.0 && (
                          <span
                            style={{
                              padding: '2px 6px',
                              backgroundColor: el.scale > 1.0 ? '#22c55e' : '#f97316',
                              borderRadius: 4,
                              color: 'white',
                              fontSize: 10,
                              fontWeight: 'bold',
                            }}
                            title={`Escala: ${Math.round(el.scale * 100)}%`}
                          >
                            {Math.round(el.scale * 100)}%
                          </span>
                        )}
                        <button
                          onClick={() => {
                            onRemoveElement(currentScene.id, el.id);
                            if (selectedElementIndex === idx) {
                              setSelectedElementIndex(-1);
                            }
                          }}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: '#ef4444',
                            border: 'none',
                            borderRadius: 4,
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: 10,
                          }}
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#a0a0b0',
              }}
            >
              Nenhuma cena selecionada
            </div>
          )}
        </div>
      </div>

      {/* Timeline com waveform na parte inferior */}
      <div
        style={{
          borderTop: '1px solid #2a2a4e',
          backgroundColor: '#1a1a2e',
          padding: 16,
        }}
      >
        {/* Controles de playback */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
          <button
            onClick={togglePlayPause}
            style={{
              padding: '8px 16px',
              backgroundColor: isPlaying ? '#ef4444' : '#22c55e',
              border: 'none',
              borderRadius: 8,
              color: 'white',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {isPlaying ? 'Pausar' : 'Play'}
          </button>

          <span style={{ color: 'white', fontFamily: 'monospace' }}>
            {formatTimeMsShort(currentTime)} / {formatTimeMsShort(project.audioDuration)}
          </span>
        </div>

        {/* Waveform com scroll sincronizado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          {/* Espaço para alinhar com botões de zoom */}
          <div style={{ width: 24, flexShrink: 0 }}>
            <span style={{ color: '#a0a0b0', fontSize: 9, display: 'block', textAlign: 'center' }}>
              W
            </span>
          </div>

          {/* Container scrollável do waveform */}
          <div
            ref={waveformContainerRef}
            onScroll={handleWaveformScroll}
            style={{
              flex: 1,
              overflowX: 'auto',
              overflowY: 'hidden',
              borderRadius: 8,
              backgroundColor: '#2a2a3e',
              minHeight: 80,
            }}
          >
            {/* WaveSurfer desabilitado permanentemente - causa tela branca */}
            <div
              style={{
                height: 80,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6a6a8e',
                fontSize: 12,
                padding: '0 16px',
                textAlign: 'center',
              }}
            >
              <div>
                <div style={{ marginBottom: 4 }}>Use a timeline abaixo para navegar</div>
                <div style={{ fontSize: 10, color: '#4a4a6e' }}>
                  Clique nas cenas ou arraste o cursor de tempo
                </div>
              </div>
            </div>
          </div>

          {/* Espaço para alinhar com indicador de zoom */}
          <span style={{ color: '#6a6a8e', fontSize: 10, minWidth: 40, textAlign: 'right' }}>
            Audio
          </span>
        </div>

        {/* Controles de zoom e Timeline (régua + cenas sincronizados) */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, marginBottom: 8 }}>
          {/* Botões de zoom */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, justifyContent: 'center' }}>
            <button
              onClick={handleTimelineZoomIn}
              style={{
                width: 24,
                height: 24,
                backgroundColor: '#4a4a6e',
                border: 'none',
                borderRadius: '4px 4px 0 0',
                color: 'white',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Zoom in na timeline"
            >
              +
            </button>
            <button
              onClick={handleTimelineZoomOut}
              disabled={timelineZoom <= 1}
              style={{
                width: 24,
                height: 24,
                backgroundColor: timelineZoom <= 1 ? '#2a2a3e' : '#4a4a6e',
                border: 'none',
                borderRadius: '0 0 4px 4px',
                color: timelineZoom <= 1 ? '#6a6a8e' : 'white',
                cursor: timelineZoom <= 1 ? 'not-allowed' : 'pointer',
                fontSize: 14,
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Zoom out na timeline"
            >
              -
            </button>
          </div>

          {/* Container scrollável da timeline (régua + cenas) */}
          <div
            ref={timelineContainerRef}
            onScroll={handleTimelineScroll}
            style={{
              flex: 1,
              overflowX: timelineZoom > 1 ? 'auto' : 'hidden',
              overflowY: 'hidden',
              borderRadius: 8,
              backgroundColor: '#2a2a3e',
            }}
          >
            {/* Time Ruler - Régua de tempo */}
            <div
              style={{
                position: 'relative',
                height: 24,
                backgroundColor: '#1e1e32',
                borderRadius: '8px 8px 0 0',
                width: `${100 * timelineZoom}%`,
                minWidth: '100%',
              }}
            >
              {(() => {
                // Calcula intervalo apropriado baseado na duração e zoom
                const duration = project.audioDuration;
                const effectiveDuration = duration / timelineZoom;
                let interval: number;
                let subInterval: number;

                if (effectiveDuration <= 30000) {
                  interval = 5000; // 5 segundos
                  subInterval = 1000; // 1 segundo
                } else if (effectiveDuration <= 60000) {
                  interval = 10000; // 10 segundos
                  subInterval = 2000; // 2 segundos
                } else if (effectiveDuration <= 180000) {
                  interval = 15000; // 15 segundos
                  subInterval = 5000; // 5 segundos
                } else if (effectiveDuration <= 300000) {
                  interval = 30000; // 30 segundos
                  subInterval = 10000; // 10 segundos
                } else {
                  interval = 60000; // 1 minuto
                  subInterval = 15000; // 15 segundos
                }

                const markers: React.ReactNode[] = [];

                // Marcadores principais (com label)
                for (let t = 0; t <= duration; t += interval) {
                  const percent = (t / duration) * 100;
                  const minutes = Math.floor(t / 60000);
                  const seconds = Math.floor((t % 60000) / 1000);
                  const label = `${minutes}:${seconds.toString().padStart(2, '0')}`;

                  markers.push(
                    <div
                      key={`main-${t}`}
                      style={{
                        position: 'absolute',
                        left: `${percent}%`,
                        top: 0,
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        transform: 'translateX(-50%)',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          color: '#a0a0b0',
                          fontFamily: 'monospace',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {label}
                      </span>
                      <div
                        style={{
                          width: 1,
                          flex: 1,
                          backgroundColor: '#6a6a8e',
                        }}
                      />
                    </div>
                  );
                }

                // Marcadores secundários (sem label)
                for (let t = subInterval; t < duration; t += subInterval) {
                  if (t % interval === 0) continue; // Pula se já tem marcador principal
                  const percent = (t / duration) * 100;

                  markers.push(
                    <div
                      key={`sub-${t}`}
                      style={{
                        position: 'absolute',
                        left: `${percent}%`,
                        bottom: 0,
                        width: 1,
                        height: 8,
                        backgroundColor: '#4a4a6e',
                        transform: 'translateX(-50%)',
                      }}
                    />
                  );
                }

                // Playhead na régua
                markers.push(
                  <div
                    key="playhead-ruler"
                    style={{
                      position: 'absolute',
                      left: `${(currentTime / project.audioDuration) * 100}%`,
                      top: 0,
                      width: 0,
                      height: 0,
                      borderLeft: '6px solid transparent',
                      borderRight: '6px solid transparent',
                      borderTop: '8px solid #fff',
                      transform: 'translateX(-50%)',
                      zIndex: 20,
                    }}
                  />
                );

                return markers;
              })()}
            </div>

            {/* Track de cenas */}
            <div
              ref={sceneTrackRef}
              style={{
                height: 40,
                position: 'relative',
                width: `${100 * timelineZoom}%`,
                minWidth: '100%',
                backgroundColor: '#252540',
                borderRadius: '0 0 8px 8px',
              }}
            >
          {scenes.map((scene, index) => {
            const left = (scene.startTime / project.audioDuration) * 100;
            const width = ((scene.endTime - scene.startTime) / project.audioDuration) * 100;
            const colors = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];
            const color = colors[index % colors.length];
            const isSelected = selectedSceneIndex === index;

            return (
              <div
                key={scene.id}
                style={{
                  position: 'absolute',
                  left: `${left}%`,
                  width: `${width}%`,
                  height: '100%',
                }}
              >
                {/* Corpo da cena */}
                <div
                  onClick={() => {
                    setSelectedSceneIndex(index);
                    handleSeek(scene.startTime);
                  }}
                  style={{
                    position: 'absolute',
                    left: 4,
                    right: 4,
                    top: 0,
                    bottom: 0,
                    backgroundColor: color,
                    opacity: isSelected ? 1 : 0.6,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    color: 'white',
                    fontWeight: 600,
                    borderRadius: 4,
                    border: isSelected ? '2px solid white' : 'none',
                  }}
                >
                  {index + 1}
                </div>

                {/* Handle esquerdo (não mostra para a primeira cena) */}
                {index > 0 && (
                  <div
                    onMouseDown={(e) => handleSceneBorderMouseDown(e, index, 'left')}
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: 8,
                      height: '100%',
                      cursor: 'ew-resize',
                      backgroundColor: draggingSceneBorder?.sceneIndex === index && draggingSceneBorder?.side === 'left'
                        ? 'rgba(255,255,255,0.5)'
                        : 'transparent',
                      borderRadius: '4px 0 0 4px',
                      zIndex: 10,
                    }}
                    title="Arrastar para ajustar início"
                  />
                )}

                {/* Handle direito (não mostra para a última cena) */}
                {index < scenes.length - 1 && (
                  <div
                    onMouseDown={(e) => handleSceneBorderMouseDown(e, index, 'right')}
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      width: 8,
                      height: '100%',
                      cursor: 'ew-resize',
                      backgroundColor: draggingSceneBorder?.sceneIndex === index && draggingSceneBorder?.side === 'right'
                        ? 'rgba(255,255,255,0.5)'
                        : 'transparent',
                      borderRadius: '0 4px 4px 0',
                      zIndex: 10,
                    }}
                    title="Arrastar para ajustar fim"
                  />
                )}
              </div>
            );
          })}

          {/* Playhead */}
          <div
            style={{
              position: 'absolute',
              left: `${(currentTime / project.audioDuration) * 100}%`,
              width: 2,
              height: '100%',
              backgroundColor: '#fff',
              pointerEvents: 'none',
              zIndex: 20,
            }}
          />
            </div>
          </div>
          {/* Indicador de zoom */}
          <span style={{ color: '#6a6a8e', fontSize: 10, minWidth: 40, textAlign: 'right' }}>
            {Math.round(timelineZoom * 100)}%
          </span>
        </div>

        {/* Track de elementos da cena selecionada */}
        {currentScene && currentElements.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Espaço para alinhar com botões de zoom acima */}
              <div style={{ width: 24, flexShrink: 0 }}>
                <span style={{ color: '#a0a0b0', fontSize: 9, display: 'block', textAlign: 'center' }}>
                  E
                </span>
              </div>

              {/* Container scrollável dos elementos (sincronizado com cenas) */}
              <div
                ref={elementContainerRef}
                onScroll={handleElementScroll}
                style={{
                  flex: 1,
                  overflowX: timelineZoom > 1 ? 'auto' : 'hidden',
                  overflowY: 'hidden',
                  borderRadius: 8,
                  backgroundColor: '#2a2a3e',
                }}
              >
                <div
                  ref={elementTrackRef}
                  style={{
                    height: 32,
                    position: 'relative',
                    width: `${100 * timelineZoom}%`,
                    minWidth: '100%',
                  }}
                >
              {currentElements.map((element, idx) => {
                // Calcula posição relativa à duração total do áudio
                const left = (element.startTime / project.audioDuration) * 100;
                const width = ((element.endTime - element.startTime) / project.audioDuration) * 100;
                const isSelected = selectedElementIndex === idx;
                const elementColors = ['#f472b6', '#34d399', '#fbbf24', '#60a5fa', '#a78bfa'];
                const color = elementColors[idx % elementColors.length];

                return (
                  <div
                    key={element.id}
                    style={{
                      position: 'absolute',
                      left: `${left}%`,
                      width: `${width}%`,
                      height: '100%',
                    }}
                  >
                    {/* Corpo do elemento */}
                    <div
                      onMouseDown={(e) => handleElementMouseDown(e, element.id, 'move', (e.clientX / (elementTrackRef.current?.getBoundingClientRect().width || 1)) * project.audioDuration)}
                      onClick={() => setSelectedElementIndex(idx)}
                      style={{
                        position: 'absolute',
                        left: 4,
                        right: 4,
                        top: 2,
                        bottom: 2,
                        backgroundColor: color,
                        opacity: isSelected ? 1 : 0.7,
                        cursor: 'grab',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        color: 'white',
                        fontWeight: 600,
                        borderRadius: 4,
                        border: isSelected ? '2px solid white' : 'none',
                        userSelect: 'none',
                      }}
                      title={`Elemento ${idx + 1}: ${formatTimeMsShort(element.startTime)} - ${formatTimeMsShort(element.endTime)}`}
                    >
                      #{idx + 1}
                    </div>

                    {/* Handle esquerdo */}
                    <div
                      onMouseDown={(e) => handleElementMouseDown(e, element.id, 'left', element.startTime)}
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 2,
                        width: 6,
                        height: 'calc(100% - 4px)',
                        cursor: 'ew-resize',
                        backgroundColor: draggingElement?.elementId === element.id && draggingElement?.side === 'left'
                          ? 'rgba(255,255,255,0.5)'
                          : 'transparent',
                        borderRadius: '4px 0 0 4px',
                        zIndex: 10,
                      }}
                      title="Arrastar para ajustar início"
                    />

                    {/* Handle direito */}
                    <div
                      onMouseDown={(e) => handleElementMouseDown(e, element.id, 'right', element.endTime)}
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 2,
                        width: 6,
                        height: 'calc(100% - 4px)',
                        cursor: 'ew-resize',
                        backgroundColor: draggingElement?.elementId === element.id && draggingElement?.side === 'right'
                          ? 'rgba(255,255,255,0.5)'
                          : 'transparent',
                        borderRadius: '0 4px 4px 0',
                        zIndex: 10,
                      }}
                      title="Arrastar para ajustar fim"
                    />
                  </div>
                );
              })}

              {/* Limites da cena atual (área válida) */}
              <div
                style={{
                  position: 'absolute',
                  left: `${(currentScene.startTime / project.audioDuration) * 100}%`,
                  width: `${((currentScene.endTime - currentScene.startTime) / project.audioDuration) * 100}%`,
                  height: '100%',
                  border: '1px dashed rgba(255,255,255,0.3)',
                  borderRadius: 4,
                  pointerEvents: 'none',
                }}
              />

              {/* Playhead */}
              <div
                style={{
                  position: 'absolute',
                  left: `${(currentTime / project.audioDuration) * 100}%`,
                  width: 2,
                  height: '100%',
                  backgroundColor: '#fff',
                  pointerEvents: 'none',
                  zIndex: 20,
                }}
              />
                </div>
              </div>
              {/* Espaço para alinhar com indicador de zoom acima */}
              <span style={{ color: '#6a6a8e', fontSize: 10, minWidth: 40, textAlign: 'right' }}>
                Elem
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Navegação */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '16px 32px',
          borderTop: '1px solid #2a2a4e',
          backgroundColor: '#1a1a2e',
        }}
      >
        <button
          onClick={onBack}
          style={{
            padding: '12px 24px',
            backgroundColor: '#4a4a6e',
            border: 'none',
            borderRadius: 8,
            color: 'white',
            cursor: 'pointer',
          }}
        >
          Voltar
        </button>

        {/* Botão Salvar no centro */}
        {onSave && (
          <button
            onClick={onSave}
            style={{
              padding: '12px 24px',
              backgroundColor: '#22c55e',
              border: 'none',
              borderRadius: 8,
              color: 'white',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>💾</span>
            <span>Salvar</span>
          </button>
        )}

        <button
          onClick={onNext}
          disabled={!canProceed}
          style={{
            padding: '12px 32px',
            backgroundColor: canProceed ? '#6366f1' : '#4a4a6e',
            border: 'none',
            borderRadius: 8,
            color: 'white',
            cursor: canProceed ? 'pointer' : 'not-allowed',
            fontWeight: 600,
          }}
        >
          Continuar para Exportar
        </button>
      </div>
    </div>
  );
};

/**
 * Componente exportado com Error Boundary
 * Simplificado para evitar qualquer atraso na renderização
 */
export const TimelineEditorStep: React.FC<TimelineEditorStepProps> = (props) => {
  // Log no momento da renderização (síncrono)
  console.log('[TimelineEditorStep] Renderizando wrapper...', {
    hasProps: !!props,
    hasProject: !!props?.project,
    scenesCount: props?.project?.scenes?.length ?? 'N/A',
  });

  // Validação básica - síncrona, sem useState
  if (!props) {
    console.error('[TimelineEditorStep] props é null ou undefined');
    return (
      <div style={{
        padding: 32,
        color: 'white',
        textAlign: 'center',
        backgroundColor: '#0f0f1a',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
        <h2 style={{ color: '#ef4444' }}>Erro: Props não encontradas</h2>
        <p style={{ color: '#a0a0b0' }}>O componente não recebeu props</p>
      </div>
    );
  }

  if (!props.project) {
    console.error('[TimelineEditorStep] props.project é null ou undefined');
    return (
      <div style={{
        padding: 32,
        color: 'white',
        textAlign: 'center',
        backgroundColor: '#0f0f1a',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h2>Erro: Projeto não encontrado</h2>
        <p style={{ color: '#a0a0b0' }}>props.project é null ou undefined</p>
        {props.onBack && (
          <button onClick={props.onBack} style={{ marginTop: 16, padding: '12px 24px', backgroundColor: '#6366f1', border: 'none', borderRadius: 8, color: 'white', cursor: 'pointer' }}>
            Voltar
          </button>
        )}
      </div>
    );
  }

  // Debug info visual na parte superior (sempre visível)
  const debugOverlay = (
    <div style={{
      position: 'fixed',
      top: 30,
      right: 10,
      backgroundColor: 'rgba(0,0,0,0.9)',
      color: '#22c55e',
      padding: 8,
      borderRadius: 4,
      fontSize: 10,
      zIndex: 9999,
      maxWidth: 300,
      pointerEvents: 'none',
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Timeline Editor Debug</div>
      <div>Scenes: {props.project.scenes?.length ?? 0}</div>
      <div>Audio: {props.project.audioUrl ? '✓' : '✗'}</div>
      <div>Duration: {props.project.audioDuration}ms</div>
      <div>ProjectID: {props.project.id?.substring(0, 8) ?? 'N/A'}...</div>
    </div>
  );

  // Renderiza diretamente - sem delay
  return (
    <>
      {debugOverlay}
      <TimelineEditorErrorBoundary onBack={props.onBack}>
        <TimelineEditorStepInner {...props} />
      </TimelineEditorErrorBoundary>
    </>
  );
};

export default TimelineEditorStep;
