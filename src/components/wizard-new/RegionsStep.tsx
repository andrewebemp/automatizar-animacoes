import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { Subtitle } from '../../types/Subtitle';
import type { Region } from '../../types/Region';
import type { ImageScene, ErasedStroke } from '../../types/ImageScene';
import type { VideoSegment } from '../../types/VideoSegment';
import { RegionCanvas, ToolBar, SegmentList, SegmentPreview } from '../region-editor';
import type { DrawingTool } from '../region-editor';
import { detectElementsPolygon, detectedPolygonToRegion } from '../../utils/visionApi';
import { loadApiConfig, isVisionConfigValid } from '../../types/ApiConfig';

// LOG DE VERIFICAÇÃO - remover após debug
console.log('[RegionsStep] Código atualizado v2 carregado!');

/** Tipo para uma ação no histórico */
interface HistoryAction {
  type: 'region' | 'scale';
  sceneId: string;
  segmentId: string;
  previousRegion: Region | null;
  previousScale: number | undefined;
}

interface RegionsStepProps {
  /** Legendas do projeto */
  subtitles: Subtitle[];

  /** Cenas do projeto */
  scenes: ImageScene[];

  /** FPS do vídeo */
  fps: number;

  /** Largura do vídeo */
  videoWidth?: number;

  /** Altura do vídeo */
  videoHeight?: number;

  /** Callback quando uma cena é adicionada */
  onAddScene: (scene: ImageScene) => void;

  /** Callback quando uma cena é removida */
  onRemoveScene: (sceneId: string) => void;

  /** Callback quando uma região é definida */
  onSetRegion: (sceneId: string, segmentId: string, region: Region) => void;

  /** Callback quando uma região é limpa */
  onClearRegion: (sceneId: string, segmentId: string) => void;

  /** Callback para definir região em todos os segmentos de uma cena */
  onSetAllRegionsInScene?: (sceneId: string, region: Region) => void;

  /** Callback para limpar região de todos os segmentos de uma cena */
  onClearAllRegionsInScene?: (sceneId: string) => void;

  /** Callback para definir região em TODOS os segmentos de TODAS as cenas */
  onSetAllRegionsGlobally?: () => void;

  /** Callback para limpar região de TODOS os segmentos de TODAS as cenas */
  onClearAllRegionsGlobally?: () => void;

  /** Callback para atualizar um segmento (configurações de animação) */
  onUpdateSegment?: (sceneId: string, segmentId: string, updates: Partial<VideoSegment>) => void;

  /** Callback para adicionar um segmento */
  onAddSegment?: (sceneId: string, subtitleIndex: number) => void;

  /** Callback para remover um segmento */
  onRemoveSegment?: (sceneId: string, segmentId: string) => void;

  /** Callback para adicionar um traço de borracha */
  onAddErasedStroke?: (sceneId: string, stroke: ErasedStroke) => void;

  /** Callback para limpar todos os traços de borracha */
  onClearErasedStrokes?: (sceneId: string) => void;

  /** Callback para voltar */
  onBack: () => void;

  /** Callback para avançar */
  onNext: () => void;

  /** Callback para salvar o projeto */
  onSave?: () => void;
}

/**
 * Passo 3: Definir regiões para cada segmento
 */
export const RegionsStep: React.FC<RegionsStepProps> = ({
  subtitles,
  scenes,
  fps,
  videoWidth = 1920,
  videoHeight = 1080,
  onAddScene,
  onRemoveScene,
  onSetRegion,
  onClearRegion,
  onSetAllRegionsInScene,
  onClearAllRegionsInScene,
  onSetAllRegionsGlobally,
  onClearAllRegionsGlobally,
  onUpdateSegment,
  onAddSegment,
  onRemoveSegment,
  onAddErasedStroke,
  onClearErasedStrokes,
  onBack,
  onNext,
  onSave,
}) => {
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState(0);
  const [currentTool, setCurrentTool] = useState<DrawingTool>('rect');
  const [hasPolygonPoints, setHasPolygonPoints] = useState(false);
  const canvasRef = useRef<{ clearPolygonPoints: () => void } | null>(null);

  // Estado da detecção por IA
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionError, setDetectionError] = useState<string | null>(null);
  const [exclusionText, setExclusionText] = useState('');
  const [showDetectionPanel, setShowDetectionPanel] = useState(false);

  // Histórico para undo (máximo 50 ações)
  const [history, setHistory] = useState<HistoryAction[]>([]);
  // Histórico para redo
  const [redoHistory, setRedoHistory] = useState<HistoryAction[]>([]);
  const MAX_HISTORY = 50;

  const currentScene = scenes[selectedSceneIndex];
  const currentSegment = currentScene?.segments[selectedSegmentIndex];

  // Função para adicionar ação ao histórico
  const pushToHistory = useCallback((action: HistoryAction) => {
    setHistory(prev => {
      const newHistory = [...prev, action];
      // Limita o tamanho do histórico
      if (newHistory.length > MAX_HISTORY) {
        return newHistory.slice(-MAX_HISTORY);
      }
      return newHistory;
    });
    // Limpa o histórico de redo quando uma nova ação é feita
    setRedoHistory([]);
  }, []);

  // Handler para desfazer (undo)
  const handleUndo = useCallback(() => {
    if (history.length === 0) return;

    const lastAction = history[history.length - 1];

    // Encontra o estado atual para salvar no redo
    const currentSceneForRedo = scenes.find(s => s.id === lastAction.sceneId);
    const currentSegmentForRedo = currentSceneForRedo?.segments.find(seg => seg.id === lastAction.segmentId);

    // Salva o estado atual no redoHistory antes de desfazer
    if (currentSegmentForRedo) {
      const redoAction: HistoryAction = {
        type: lastAction.type,
        sceneId: lastAction.sceneId,
        segmentId: lastAction.segmentId,
        previousRegion: currentSegmentForRedo.region || null,
        previousScale: currentSegmentForRedo.scale,
      };
      setRedoHistory(prev => [...prev, redoAction]);
    }

    // Remove a última ação do histórico
    setHistory(prev => prev.slice(0, -1));

    // Restaura o estado anterior
    if (lastAction.type === 'region') {
      if (lastAction.previousRegion) {
        onSetRegion(lastAction.sceneId, lastAction.segmentId, lastAction.previousRegion);
      } else {
        onClearRegion(lastAction.sceneId, lastAction.segmentId);
      }
    }

    // Restaura escala se havia
    if (lastAction.previousScale !== undefined && onUpdateSegment) {
      onUpdateSegment(lastAction.sceneId, lastAction.segmentId, { scale: lastAction.previousScale });
    } else if (lastAction.type === 'scale' && onUpdateSegment) {
      // Se não tinha escala antes, remove
      onUpdateSegment(lastAction.sceneId, lastAction.segmentId, { scale: undefined });
    }
  }, [history, scenes, onSetRegion, onClearRegion, onUpdateSegment]);

  // Handler para refazer (redo)
  const handleRedo = useCallback(() => {
    if (redoHistory.length === 0) return;

    const lastRedoAction = redoHistory[redoHistory.length - 1];

    // Encontra o estado atual para salvar no undo
    const currentSceneForUndo = scenes.find(s => s.id === lastRedoAction.sceneId);
    const currentSegmentForUndo = currentSceneForUndo?.segments.find(seg => seg.id === lastRedoAction.segmentId);

    // Salva o estado atual no history antes de refazer
    if (currentSegmentForUndo) {
      const undoAction: HistoryAction = {
        type: lastRedoAction.type,
        sceneId: lastRedoAction.sceneId,
        segmentId: lastRedoAction.segmentId,
        previousRegion: currentSegmentForUndo.region || null,
        previousScale: currentSegmentForUndo.scale,
      };
      setHistory(prev => [...prev, undoAction]);
    }

    // Remove a última ação do redoHistory
    setRedoHistory(prev => prev.slice(0, -1));

    // Aplica o estado do redo
    if (lastRedoAction.type === 'region') {
      if (lastRedoAction.previousRegion) {
        onSetRegion(lastRedoAction.sceneId, lastRedoAction.segmentId, lastRedoAction.previousRegion);
      } else {
        onClearRegion(lastRedoAction.sceneId, lastRedoAction.segmentId);
      }
    }

    // Aplica escala se havia
    if (lastRedoAction.previousScale !== undefined && onUpdateSegment) {
      onUpdateSegment(lastRedoAction.sceneId, lastRedoAction.segmentId, { scale: lastRedoAction.previousScale });
    } else if (lastRedoAction.type === 'scale' && onUpdateSegment) {
      onUpdateSegment(lastRedoAction.sceneId, lastRedoAction.segmentId, { scale: undefined });
    }
  }, [redoHistory, scenes, onSetRegion, onClearRegion, onUpdateSegment]);

  // Listener para Ctrl+Z (undo) e Ctrl+Y (redo)
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

  // Handler para região (com histórico)
  const handleRegionChange = useCallback(
    (segmentId: string, region: Region, skipHistory = false) => {
      if (!currentScene) return;

      // Salva estado anterior no histórico (se não for chamada de undo)
      if (!skipHistory) {
        const segment = currentScene.segments.find(s => s.id === segmentId);
        pushToHistory({
          type: 'region',
          sceneId: currentScene.id,
          segmentId,
          previousRegion: segment?.region || null,
          previousScale: segment?.scale,
        });
      }

      onSetRegion(currentScene.id, segmentId, region);
    },
    [currentScene, onSetRegion, pushToHistory]
  );

  // Handler para limpar região (também limpa pontos do polígono em progresso)
  const handleClearRegion = useCallback(() => {
    // Limpa pontos do polígono em progresso
    canvasRef.current?.clearPolygonPoints();

    if (!currentScene || !currentSegment) return;

    // Salva estado anterior no histórico
    pushToHistory({
      type: 'region',
      sceneId: currentScene.id,
      segmentId: currentSegment.id,
      previousRegion: currentSegment.region,
      previousScale: currentSegment.scale,
    });

    onClearRegion(currentScene.id, currentSegment.id);
  }, [currentScene, currentSegment, onClearRegion, pushToHistory]);

  // Handler para adicionar traço de borracha
  const handleAddErasedStroke = useCallback(
    (stroke: ErasedStroke) => {
      if (!currentScene || !onAddErasedStroke) return;
      onAddErasedStroke(currentScene.id, stroke);
    },
    [currentScene, onAddErasedStroke]
  );

  // Handler para limpar traços de borracha
  const handleClearErasedStrokes = useCallback(() => {
    if (!currentScene || !onClearErasedStrokes) return;
    onClearErasedStrokes(currentScene.id);
  }, [currentScene, onClearErasedStrokes]);

  // Handler para selecionar toda a imagem como região (segmento atual)
  const handleSelectAll = useCallback(() => {
    if (!currentScene || !currentSegment) return;

    // Cria uma região que cobre toda a imagem
    const fullImageRegion: Region = {
      id: `region-full-${Date.now()}`,
      pathData: `M 0 0 L ${currentScene.imageWidth} 0 L ${currentScene.imageWidth} ${currentScene.imageHeight} L 0 ${currentScene.imageHeight} Z`,
      bounds: {
        x: 0,
        y: 0,
        width: currentScene.imageWidth,
        height: currentScene.imageHeight,
      },
      source: 'manual-rect',
    };

    onSetRegion(currentScene.id, currentSegment.id, fullImageRegion);
  }, [currentScene, currentSegment, onSetRegion]);

  // Handler para detecção automática por IA
  const handleAIDetect = useCallback(async () => {
    if (!currentScene) return;

    const apiConfig = loadApiConfig();
    if (!isVisionConfigValid(apiConfig.vision)) {
      setDetectionError('API de visão não configurada. Abra as Configurações para configurar.');
      return;
    }

    setIsDetecting(true);
    setDetectionError(null);

    try {
      // Monta labels a partir do texto das legendas de cada segmento
      const segmentLabels = currentScene.segments.map(seg => {
        const subtitle = subtitles[seg.subtitleIndex];
        return subtitle?.text ?? `Elemento ${seg.subtitleIndex + 1}`;
      });

      const result = await detectElementsPolygon(
        apiConfig.vision,
        currentScene.imageUrl,
        {
          segmentLabels,
          exclusionInstructions: exclusionText || undefined,
          imageWidth: currentScene.imageWidth,
          imageHeight: currentScene.imageHeight,
          expectedCount: currentScene.segments.length,
        }
      );

      if (!result.success) {
        throw new Error(result.error || 'Falha na detecção');
      }

      // Aplica regiões detectadas a cada segmento
      result.elements.forEach(detected => {
        const segmentIndex = detected.index - 1;
        const segment = currentScene.segments[segmentIndex];
        if (segment) {
          const region = detectedPolygonToRegion(detected);
          onSetRegion(currentScene.id, segment.id, region);
        }
      });

      // Verificar qualidade da detecção: elementos com matchedLabel foram detectados pela IA,
      // os sem matchedLabel usaram fallback (posição estimada)
      const detectedByAI = result.elements.filter(e => e.matchedLabel).length;
      const fallbackCount = result.elements.length - detectedByAI;

      if (fallbackCount > 0) {
        console.warn(`[RegionsStep] ${fallbackCount} de ${result.elements.length} regiões usaram fallback (não detectadas pela IA)`);
        setDetectionError(`Atenção: ${detectedByAI} de ${result.elements.length} elementos foram detectados pela IA. Os demais usaram posição estimada. Ajuste manualmente se necessário.`);
        // NÃO fecha o painel — usuário precisa ver o warning
      } else {
        console.log(`[RegionsStep] Detecção concluída: ${result.elements.length} elementos detectados com sucesso`);
        setShowDetectionPanel(false);
      }
    } catch (error) {
      setDetectionError(error instanceof Error ? error.message : 'Erro desconhecido');
    } finally {
      setIsDetecting(false);
    }
  }, [currentScene, subtitles, exclusionText, onSetRegion]);

  // Handler para aumentar a escala do elemento no vídeo renderizado (não altera a marcação verde)
  const handleScaleUp = useCallback(() => {
    if (!currentScene || !currentSegment || !currentSegment.region) return;
    if (!onUpdateSegment) return;

    const currentScale = currentSegment.scale || 1.0;
    const newScale = Math.min(currentScale * 1.1, 3.0); // Máximo 3x

    // Salva estado anterior no histórico
    pushToHistory({
      type: 'scale',
      sceneId: currentScene.id,
      segmentId: currentSegment.id,
      previousRegion: currentSegment.region,
      previousScale: currentSegment.scale,
    });

    onUpdateSegment(currentScene.id, currentSegment.id, { scale: newScale });
  }, [currentScene, currentSegment, onUpdateSegment, pushToHistory]);

  // Handler para reduzir a escala do elemento no vídeo renderizado (não altera a marcação verde)
  const handleScaleDown = useCallback(() => {
    if (!currentScene || !currentSegment || !currentSegment.region) return;
    if (!onUpdateSegment) return;

    const currentScale = currentSegment.scale || 1.0;
    const newScale = Math.max(currentScale * 0.9, 0.1); // Mínimo 10%

    console.log('[DEBUG handleScaleDown] Antes:', {
      segmentId: currentSegment.id,
      currentScale,
      newScale,
      regionPathDataLength: currentSegment.region.pathData.length,
    });

    // Salva estado anterior no histórico
    pushToHistory({
      type: 'scale',
      sceneId: currentScene.id,
      segmentId: currentSegment.id,
      previousRegion: currentSegment.region,
      previousScale: currentSegment.scale,
    });

    // IMPORTANTE: Apenas atualiza scale, NÃO altera a região
    onUpdateSegment(currentScene.id, currentSegment.id, { scale: newScale });

    console.log('[DEBUG handleScaleDown] Chamou onUpdateSegment com scale:', newScale);
  }, [currentScene, currentSegment, onUpdateSegment, pushToHistory]);

  // Handler para mover a posição do elemento no vídeo renderizado
  const handleMovePosition = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    if (!currentScene || !currentSegment || !currentSegment.region) return;
    if (!onUpdateSegment) return;

    const moveAmount = 50; // pixels para mover por clique
    const currentOffsetX = currentSegment.offsetX || 0;
    const currentOffsetY = currentSegment.offsetY || 0;

    let newOffsetX = currentOffsetX;
    let newOffsetY = currentOffsetY;

    switch (direction) {
      case 'up':
        newOffsetY = currentOffsetY - moveAmount;
        break;
      case 'down':
        newOffsetY = currentOffsetY + moveAmount;
        break;
      case 'left':
        newOffsetX = currentOffsetX - moveAmount;
        break;
      case 'right':
        newOffsetX = currentOffsetX + moveAmount;
        break;
    }

    // Salva estado anterior no histórico
    pushToHistory({
      type: 'scale', // Reutiliza o tipo scale pois também salva posição
      sceneId: currentScene.id,
      segmentId: currentSegment.id,
      previousRegion: currentSegment.region,
      previousScale: currentSegment.scale,
    });

    onUpdateSegment(currentScene.id, currentSegment.id, {
      offsetX: newOffsetX,
      offsetY: newOffsetY,
    });
  }, [currentScene, currentSegment, onUpdateSegment, pushToHistory]);

  // Handler para resetar a posição do elemento
  const handleResetPosition = useCallback(() => {
    if (!currentScene || !currentSegment || !currentSegment.region) return;
    if (!onUpdateSegment) return;

    // Salva estado anterior no histórico
    pushToHistory({
      type: 'scale',
      sceneId: currentScene.id,
      segmentId: currentSegment.id,
      previousRegion: currentSegment.region,
      previousScale: currentSegment.scale,
    });

    onUpdateSegment(currentScene.id, currentSegment.id, {
      offsetX: undefined,
      offsetY: undefined,
    });
  }, [currentScene, currentSegment, onUpdateSegment, pushToHistory]);

  // Handler para mover a marcação para o segmento anterior
  const handleMoveRegionToPrevious = useCallback(() => {
    if (!currentScene || !currentSegment || !currentSegment.region) return;
    if (selectedSegmentIndex <= 0) return;

    const previousSegment = currentScene.segments[selectedSegmentIndex - 1];
    if (!previousSegment) return;

    // Salva a região atual
    const regionToMove = currentSegment.region;

    // Salva estado anterior no histórico (ambos os segmentos)
    pushToHistory({
      type: 'region',
      sceneId: currentScene.id,
      segmentId: currentSegment.id,
      previousRegion: currentSegment.region,
      previousScale: currentSegment.scale,
    });

    // Remove a região do segmento atual
    onClearRegion(currentScene.id, currentSegment.id);

    // Define a região no segmento anterior
    onSetRegion(currentScene.id, previousSegment.id, regionToMove);

    // Move a seleção para o segmento anterior
    setSelectedSegmentIndex(selectedSegmentIndex - 1);
  }, [currentScene, currentSegment, selectedSegmentIndex, onClearRegion, onSetRegion, pushToHistory]);

  // Handler para mover a marcação para o próximo segmento
  const handleMoveRegionToNext = useCallback(() => {
    if (!currentScene || !currentSegment || !currentSegment.region) return;
    if (selectedSegmentIndex >= currentScene.segments.length - 1) return;

    const nextSegment = currentScene.segments[selectedSegmentIndex + 1];
    if (!nextSegment) return;

    // Salva a região atual
    const regionToMove = currentSegment.region;

    // Salva estado anterior no histórico
    pushToHistory({
      type: 'region',
      sceneId: currentScene.id,
      segmentId: currentSegment.id,
      previousRegion: currentSegment.region,
      previousScale: currentSegment.scale,
    });

    // Remove a região do segmento atual
    onClearRegion(currentScene.id, currentSegment.id);

    // Define a região no próximo segmento
    onSetRegion(currentScene.id, nextSegment.id, regionToMove);

    // Move a seleção para o próximo segmento
    setSelectedSegmentIndex(selectedSegmentIndex + 1);
  }, [currentScene, currentSegment, selectedSegmentIndex, onClearRegion, onSetRegion, pushToHistory]);

  // Verifica se pode mover a marcação
  const canMoveRegionToPrevious = currentSegment?.region !== null && selectedSegmentIndex > 0;
  const canMoveRegionToNext = currentSegment?.region !== null && currentScene && selectedSegmentIndex < currentScene.segments.length - 1;

  // Verifica se TODOS os segmentos de TODAS as cenas têm região de imagem completa
  const allSegmentsHaveFullRegion = scenes.length > 0 && scenes.every((scene) =>
    scene.segments.every((seg) => {
      if (!seg.region) return false;
      return (
        seg.region.bounds.x === 0 &&
        seg.region.bounds.y === 0 &&
        seg.region.bounds.width === scene.imageWidth &&
        seg.region.bounds.height === scene.imageHeight
      );
    })
  );

  // Handler para aplicar/remover "Tudo" em TODOS os segmentos de TODAS as cenas
  const handleToggleAllSegments = useCallback(() => {
    if (scenes.length === 0) return;

    if (allSegmentsHaveFullRegion) {
      // Remove região de todos os segmentos de todas as cenas
      if (onClearAllRegionsGlobally) {
        onClearAllRegionsGlobally();
      }
    } else {
      // Aplica região completa a todos os segmentos de todas as cenas
      if (onSetAllRegionsGlobally) {
        onSetAllRegionsGlobally();
      }
    }
  }, [scenes.length, allSegmentsHaveFullRegion, onSetAllRegionsGlobally, onClearAllRegionsGlobally]);

  // Calcula progresso
  const totalSegments = scenes.reduce((sum, s) => sum + s.segments.length, 0);
  const segmentsWithRegion = scenes.reduce(
    (sum, s) => sum + s.segments.filter((seg) => seg.region !== null).length,
    0
  );
  const progress = totalSegments > 0 ? (segmentsWithRegion / totalSegments) * 100 : 0;

  // Verifica se pode prosseguir
  const canProceed = scenes.length > 0 && segmentsWithRegion > 0;

  // Se não há cenas, mostra mensagem
  if (scenes.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'white',
          gap: 16,
        }}
      >
        <div style={{ fontSize: 48 }}>📷</div>
        <h2 style={{ margin: 0 }}>Nenhuma imagem adicionada</h2>
        <p style={{ color: '#888', margin: 0 }}>
          Volte para o passo anterior e adicione imagens para definir as regiões.
        </p>
        <button
          onClick={onBack}
          style={{
            padding: '12px 24px',
            backgroundColor: '#6366f1',
            border: 'none',
            color: 'white',
            borderRadius: 8,
            cursor: 'pointer',
            marginTop: 16,
          }}
        >
          ← Voltar para Imagens
        </button>
      </div>
    );
  }

  // UI principal do editor de regiões
  return (
    <div style={{ display: 'flex', height: '100%', maxHeight: '100%', overflow: 'hidden' }}>
      {/* Painel esquerdo - Lista de segmentos */}
      <div
        style={{
          width: 320,
          minWidth: 280,
          maxWidth: 320,
          backgroundColor: '#1a1a2e',
          borderRight: '1px solid #2a2a4e',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        {/* Header com seletor de cena */}
        <div style={{ padding: 16, borderBottom: '1px solid #2a2a4e' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ color: 'white', margin: 0 }}>Cenas</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              {/* Botão Tudo - aplica/remove região completa em todos os segmentos */}
              <button
                onClick={handleToggleAllSegments}
                style={{
                  padding: '6px 12px',
                  backgroundColor: allSegmentsHaveFullRegion ? '#22c55e' : '#4a4a6e',
                  border: 'none',
                  borderRadius: 6,
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
                title={allSegmentsHaveFullRegion ? 'Remover seleção de todos' : 'Selecionar tudo em todos os segmentos'}
              >
                <span>🖼️</span>
                <span>Tudo</span>
              </button>
              <button
                onClick={onBack}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#4a4a6e',
                  border: 'none',
                  borderRadius: 6,
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                + Adicionar
              </button>
            </div>
          </div>

          <select
            value={selectedSceneIndex}
            onChange={(e) => {
              setSelectedSceneIndex(parseInt(e.target.value));
              setSelectedSegmentIndex(0);
            }}
            style={{
              width: '100%',
              padding: '8px 12px',
              backgroundColor: '#2a2a4e',
              border: '1px solid #4a4a6e',
              borderRadius: 6,
              color: 'white',
            }}
          >
            {scenes.map((scene, i) => (
              <option key={scene.id} value={i}>
                Cena {i + 1} ({scene.segments.length} elementos)
              </option>
            ))}
          </select>
        </div>

        {/* Lista de segmentos */}
        <div style={{ flex: 1, overflow: 'auto', padding: 8, minHeight: 0 }}>
          {currentScene && (
            <SegmentList
              segments={currentScene.segments}
              subtitles={subtitles}
              selectedIndex={selectedSegmentIndex}
              onSelect={setSelectedSegmentIndex}
              onUpdateSegment={
                onUpdateSegment
                  ? (segmentId, updates) => onUpdateSegment(currentScene.id, segmentId, updates)
                  : undefined
              }
              onAddSegment={
                onAddSegment
                  ? (subtitleIndex) => onAddSegment(currentScene.id, subtitleIndex)
                  : undefined
              }
              onRemoveSegment={
                onRemoveSegment
                  ? (segmentId) => onRemoveSegment(currentScene.id, segmentId)
                  : undefined
              }
              fps={fps}
            />
          )}
        </div>

        {/* Preview da animação do segmento - no painel esquerdo */}
        {currentScene && currentSegment?.region && (
          <div
            style={{
              padding: 12,
              borderTop: '1px solid #2a2a4e',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: '#888',
                marginBottom: 6,
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}
            >
              Preview
            </div>
            <SegmentPreview
              scene={currentScene}
              segmentIndex={selectedSegmentIndex}
              subtitles={subtitles}
              fps={fps}
              videoWidth={videoWidth}
              videoHeight={videoHeight}
            />
          </div>
        )}

        {/* Progresso */}
        <div style={{ padding: 16, borderTop: '1px solid #2a2a4e' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: '#888' }}>Progresso</span>
            <span style={{ color: 'white' }}>
              {segmentsWithRegion}/{totalSegments}
            </span>
          </div>
          <div
            style={{
              height: 8,
              backgroundColor: '#2a2a4e',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: '100%',
                backgroundColor: progress === 100 ? '#22c55e' : '#6366f1',
                transition: 'width 0.3s',
              }}
            />
          </div>
        </div>
      </div>

      {/* Área principal - Canvas */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #2a2a4e', overflowX: 'auto', overflowY: 'hidden', flexShrink: 0 }}>
          <ToolBar
            currentTool={currentTool}
            onToolChange={setCurrentTool}
            onClearRegion={handleClearRegion}
            onSelectAll={handleSelectAll}
            onAIDetect={() => setShowDetectionPanel(prev => !prev)}
            isAIDetecting={isDetecting}
            hasRegion={currentSegment?.region !== null}
            hasPolygonPoints={hasPolygonPoints}
            hasErasedStrokes={(currentScene?.erasedStrokes?.length ?? 0) > 0}
            onClearErasedStrokes={onClearErasedStrokes ? handleClearErasedStrokes : undefined}
            onScaleUp={handleScaleUp}
            onScaleDown={handleScaleDown}
            onUndo={handleUndo}
            canUndo={history.length > 0}
            onRedo={handleRedo}
            canRedo={redoHistory.length > 0}
            onMoveRegionToPrevious={handleMoveRegionToPrevious}
            onMoveRegionToNext={handleMoveRegionToNext}
            canMoveRegionToPrevious={canMoveRegionToPrevious}
            canMoveRegionToNext={canMoveRegionToNext}
            onMovePosition={handleMovePosition}
            onResetPosition={handleResetPosition}
            hasOffset={currentSegment?.offsetX !== undefined || currentSegment?.offsetY !== undefined}
          />
        </div>

        {/* Painel de detecção por IA */}
        {showDetectionPanel && currentScene && (
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: '#1a1a3e',
              borderBottom: '1px solid #2a2a4e',
              flexShrink: 0,
            }}
          >
            <div style={{ marginBottom: 10 }}>
              <label style={{ color: '#a0a0b0', fontSize: 13, display: 'block', marginBottom: 6 }}>
                Instruções de exclusão (opcional):
              </label>
              <textarea
                value={exclusionText}
                onChange={(e) => setExclusionText(e.target.value)}
                placeholder="Ex: Ignore os números [1], [2], [3]. Não selecione as setas. Exclua o texto do título."
                style={{
                  width: '100%',
                  padding: 8,
                  backgroundColor: '#0f0f1a',
                  border: '1px solid #4a4a6e',
                  borderRadius: 6,
                  color: 'white',
                  resize: 'vertical',
                  minHeight: 48,
                  maxHeight: 120,
                  fontSize: 13,
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button
                onClick={handleAIDetect}
                disabled={isDetecting}
                style={{
                  padding: '8px 16px',
                  backgroundColor: isDetecting ? '#4a4a6e' : '#8b5cf6',
                  border: 'none',
                  borderRadius: 6,
                  color: 'white',
                  cursor: isDetecting ? 'wait' : 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {isDetecting ? (
                  <>
                    <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
                    Detectando...
                  </>
                ) : (
                  <>🔍 Detectar Elementos desta Cena</>
                )}
              </button>

              <span style={{ color: '#888', fontSize: 12 }}>
                Cena {selectedSceneIndex + 1} — {currentScene.segments.length} segmentos
              </span>

              {detectionError && (
                <span style={{ color: '#ef4444', fontSize: 12, flex: 1 }}>
                  {detectionError}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Canvas */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {currentScene && (
            <RegionCanvas
              imageUrl={currentScene.imageUrl}
              imageWidth={currentScene.imageWidth}
              imageHeight={currentScene.imageHeight}
              segments={currentScene.segments}
              selectedSegmentIndex={selectedSegmentIndex}
              tool={currentTool}
              onRegionChange={handleRegionChange}
              onSegmentSelect={setSelectedSegmentIndex}
              erasedStrokes={currentScene.erasedStrokes}
              onAddErasedStroke={onAddErasedStroke ? handleAddErasedStroke : undefined}
              canvasRef={canvasRef}
              onPolygonPointsChange={setHasPolygonPoints}
            />
          )}
        </div>

        {/* Indicador de segmento atual */}
        <div
          style={{
            padding: '8px 16px',
            backgroundColor: '#2a2a4e',
            textAlign: 'center',
            flexShrink: 0,
          }}
        >
          <span style={{ color: '#888' }}>
            Segmento {selectedSegmentIndex + 1} de {currentScene?.segments.length ?? 0}
            {currentSegment?.region ? ' ✓' : ''}
          </span>
        </div>

        {/* Botões de navegação */}
        <div
          style={{
            padding: 16,
            borderTop: '1px solid #2a2a4e',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <button
            onClick={onBack}
            style={{
              padding: '12px 24px',
              backgroundColor: 'transparent',
              border: '2px solid #4a4a6e',
              color: 'white',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            ← Voltar
          </button>

          <div style={{ display: 'flex', gap: 12 }}>
            {/* Botão Salvar */}
            {onSave && (
              <button
                onClick={onSave}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#22c55e',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
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
                padding: '12px 24px',
                backgroundColor: canProceed ? '#6366f1' : '#4a4a6e',
                border: 'none',
                color: 'white',
                borderRadius: 8,
                cursor: canProceed ? 'pointer' : 'not-allowed',
                opacity: canProceed ? 1 : 0.5,
              }}
            >
              Próximo: Exportar →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegionsStep;
