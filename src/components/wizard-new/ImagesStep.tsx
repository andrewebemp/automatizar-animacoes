import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { Subtitle } from '../../types/Subtitle';
import type { ImageScene } from '../../types/ImageScene';
import type { VideoSegment } from '../../types/VideoSegment';
import { createVideoSegment } from '../../types/VideoSegment';
import type { ProjectConfig } from '../../utils/projectConfigParser';
import { loadApiConfig, isVisionConfigValid } from '../../types/ApiConfig';

interface ImagesStepProps {
  /** Legendas do projeto */
  subtitles: Subtitle[];

  /** Cenas do projeto */
  scenes: ImageScene[];

  /** Configuração do projeto (opcional, vem do arquivo TXT) */
  projectConfig?: ProjectConfig | null;

  /** Callback quando uma cena é adicionada */
  onAddScene: (scene: ImageScene) => void;

  /** Callback quando uma cena é removida */
  onRemoveScene: (sceneId: string) => void;

  /** Callback para voltar */
  onBack: () => void;

  /** Callback para avançar */
  onNext: () => void;

  /** Callback para salvar o projeto */
  onSave?: () => void;
}

interface ImageDistribution {
  id: string;
  elementsCount: number;
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
}

// Chave para salvar preferência de legendas por cena
const SUBTITLES_PER_SCENE_KEY = 'automatizar-animacoes-subtitles-per-scene';
const DEFAULT_SUBTITLES_PER_SCENE = 3;

/**
 * Formata tempo em milissegundos para HH:MM:SS.mmm
 */
function formatTime(timeMs: number): string {
  const hours = Math.floor(timeMs / 3600000);
  const minutes = Math.floor((timeMs % 3600000) / 60000);
  const seconds = Math.floor((timeMs % 60000) / 1000);
  const ms = timeMs % 1000;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

/**
 * Passo 2: Upload de Imagens
 * Permite fazer upload de imagens e definir a distribuição de legendas por imagem.
 */
export const ImagesStep: React.FC<ImagesStepProps> = ({
  subtitles,
  scenes,
  projectConfig,
  onAddScene,
  onRemoveScene,
  onBack,
  onNext,
  onSave,
}) => {
  // Verifica se a API de visão está configurada
  const isVisionConfigured = useMemo(() => {
    const config = loadApiConfig();
    return isVisionConfigValid(config.vision);
  }, []);

  // Ref para controlar se já aplicamos a configuração do projeto
  const hasAppliedConfigRef = useRef(false);

  // Estado para drag and drop
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Estado para distribuição de múltiplas imagens
  const [distributions, setDistributions] = useState<ImageDistribution[]>(() => {
    // Se já tem cenas, inicializa com os dados existentes
    if (scenes.length > 0) {
      return scenes.map((scene) => ({
        id: scene.id,
        elementsCount: scene.segments.length,
        imageUrl: scene.imageUrl,
        imageWidth: scene.imageWidth,
        imageHeight: scene.imageHeight,
      }));
    }
    // Caso contrário, inicia com uma imagem cobrindo todas as legendas
    return [{ id: '1', elementsCount: subtitles.length }];
  });

  // Aplica configuração do projeto quando disponível (apenas uma vez)
  useEffect(() => {
    // Só aplica se:
    // 1. Há uma configuração do projeto
    // 2. Ainda não foi aplicada
    // 3. Não há cenas carregadas (para não sobrescrever trabalho existente)
    if (projectConfig && !hasAppliedConfigRef.current && scenes.length === 0) {
      hasAppliedConfigRef.current = true;

      // Cria distribuições baseadas na configuração do projeto
      const newDistributions: ImageDistribution[] = projectConfig.scenes.map((sceneConfig, index) => ({
        id: `config-${Date.now()}-${index}`,
        elementsCount: sceneConfig.elementsCount,
      }));

      // Verifica se o total de elementos bate com o número de legendas
      const totalElements = newDistributions.reduce((sum, d) => sum + d.elementsCount, 0);

      if (totalElements !== subtitles.length) {
        console.warn(
          `[ImagesStep] Configuração do projeto tem ${totalElements} elementos, mas há ${subtitles.length} legendas. Ajustando...`
        );

        // Se o total for menor, adiciona a diferença à última cena
        if (totalElements < subtitles.length && newDistributions.length > 0) {
          newDistributions[newDistributions.length - 1].elementsCount += subtitles.length - totalElements;
        }
        // Se for maior, reduz proporcionalmente ou ajusta a última
        else if (totalElements > subtitles.length && newDistributions.length > 0) {
          const excess = totalElements - subtitles.length;
          newDistributions[newDistributions.length - 1].elementsCount = Math.max(
            1,
            newDistributions[newDistributions.length - 1].elementsCount - excess
          );
        }
      }

      setDistributions(newDistributions);
      console.log('[ImagesStep] Configuração do projeto aplicada:', newDistributions);
    }
  }, [projectConfig, scenes.length, subtitles.length]);

  // Total de elementos alocados
  const totalAllocated = useMemo(() => {
    return distributions.reduce((sum, d) => sum + d.elementsCount, 0);
  }, [distributions]);

  // Verifica se distribuição está válida
  const isDistributionValid = totalAllocated === subtitles.length;

  // Verifica se todas as imagens foram adicionadas
  const allImagesAdded = distributions.every((d) => d.imageUrl);

  // Pode prosseguir se distribuição válida e todas as imagens adicionadas
  const canProceed = isDistributionValid && allImagesAdded && distributions.length > 0;

  // Estado para legendas por cena padrão
  const [subtitlesPerScene, setSubtitlesPerScene] = useState<number>(() => {
    // Tenta carregar do localStorage primeiro
    try {
      const saved = localStorage.getItem(SUBTITLES_PER_SCENE_KEY);
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[ImagesStep] Erro ao carregar subtitlesPerScene:', e);
    }
    // Valor padrão
    return DEFAULT_SUBTITLES_PER_SCENE;
  });

  // Redistribui as legendas quando o valor de legendas por cena muda
  const handleSubtitlesPerSceneChange = useCallback((value: number) => {
    const newValue = Math.max(1, value);
    setSubtitlesPerScene(newValue);

    // Salva no localStorage para persistir entre sessões
    try {
      localStorage.setItem(SUBTITLES_PER_SCENE_KEY, newValue.toString());
    } catch (e) {
      console.warn('[ImagesStep] Erro ao salvar subtitlesPerScene:', e);
    }

    // Calcula quantas cenas são necessárias
    const numScenes = Math.ceil(subtitles.length / newValue);

    // Remove todas as cenas existentes
    scenes.forEach((scene) => onRemoveScene(scene.id));

    // Cria nova distribuição
    const newDistributions: ImageDistribution[] = [];
    let remaining = subtitles.length;

    for (let i = 0; i < numScenes; i++) {
      const count = Math.min(newValue, remaining);
      newDistributions.push({
        id: `scene-${Date.now()}-${i}`,
        elementsCount: count,
      });
      remaining -= count;
    }

    setDistributions(newDistributions);
  }, [subtitles.length, scenes, onRemoveScene]);

  // Adiciona uma nova imagem à distribuição
  const handleAddImageToDistribution = useCallback(() => {
    const remaining = subtitles.length - totalAllocated;
    setDistributions((prev) => [
      ...prev,
      { id: Date.now().toString(), elementsCount: Math.max(1, remaining) },
    ]);
  }, [subtitles.length, totalAllocated]);

  // Remove uma imagem da distribuição
  const handleRemoveImageFromDistribution = useCallback(
    (id: string) => {
      setDistributions((prev) => prev.filter((d) => d.id !== id));
      // Remove a cena correspondente se existir
      const scene = scenes.find((s) => s.id === id);
      if (scene) {
        onRemoveScene(id);
      }
    },
    [scenes, onRemoveScene]
  );

  // Atualiza elementos de uma imagem
  const handleUpdateDistribution = useCallback(
    (id: string, count: number) => {
      const newCount = Math.max(1, count);

      setDistributions((prev) => {
        const updatedDistributions = prev.map((d) =>
          d.id === id ? { ...d, elementsCount: newCount } : d
        );

        // Se já tem uma imagem carregada para esta distribuição, recria a cena
        const distIndex = prev.findIndex((d) => d.id === id);
        const dist = prev[distIndex];

        if (dist && dist.imageUrl) {
          // Calcula o novo range de legendas baseado nas distribuições atualizadas
          let startIndex = 0;
          for (let i = 0; i < distIndex; i++) {
            startIndex += updatedDistributions[i].elementsCount;
          }
          const endIndex = Math.min(startIndex + newCount - 1, subtitles.length - 1);

          // Cria novos segmentos para as legendas deste range
          const segments: VideoSegment[] = [];
          for (let i = startIndex; i <= endIndex; i++) {
            segments.push(createVideoSegment(i));
          }

          // Remove cena existente
          const existingScene = scenes.find((s) => s.id === id);
          if (existingScene) {
            onRemoveScene(id);
          }

          // Cria nova cena com os segmentos atualizados
          const newScene: ImageScene = {
            id,
            imageUrl: dist.imageUrl,
            imageWidth: dist.imageWidth ?? 1920,
            imageHeight: dist.imageHeight ?? 1080,
            segments,
            startFrame: subtitles[startIndex]?.startFrame ?? 0,
            endFrame: subtitles[endIndex]?.endFrame ?? 0,
          };

          // Adiciona a nova cena (usando setTimeout para evitar problemas de estado)
          setTimeout(() => onAddScene(newScene), 0);
        }

        return updatedDistributions;
      });
    },
    [subtitles, scenes, onRemoveScene, onAddScene]
  );

  // Move imagem de uma posição para outra
  const handleMoveImage = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex || toIndex < 0 || toIndex >= distributions.length) {
        return;
      }

      setDistributions((prev) => {
        const newDistributions = [...prev];
        const [movedItem] = newDistributions.splice(fromIndex, 1);
        newDistributions.splice(toIndex, 0, movedItem);
        return newDistributions;
      });

      // Recria as cenas na nova ordem para manter consistência
      // Isso é necessário porque os segmentos são baseados na posição
      setTimeout(() => {
        // Para cada distribuição com imagem, recria a cena
        distributions.forEach((dist, idx) => {
          if (dist.imageUrl) {
            const actualIdx = idx === fromIndex ? toIndex :
                              idx === toIndex ? (fromIndex < toIndex ? idx - 1 : idx + 1) :
                              (idx > Math.min(fromIndex, toIndex) && idx <= Math.max(fromIndex, toIndex))
                                ? (fromIndex < toIndex ? idx - 1 : idx + 1)
                                : idx;
            // A cena será recalculada automaticamente pelo useEffect se necessário
          }
        });
      }, 0);
    },
    [distributions]
  );

  // Handlers para drag and drop
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!isNaN(fromIndex)) {
      handleMoveImage(fromIndex, toIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, [handleMoveImage]);

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, []);

  // Reset distribuição para estado inicial
  const handleResetDistribution = useCallback(() => {
    // Remove todas as cenas existentes
    scenes.forEach((scene) => onRemoveScene(scene.id));
    setDistributions([{ id: '1', elementsCount: subtitles.length }]);
  }, [subtitles.length, scenes, onRemoveScene]);

  // Handler para arquivo de imagem
  const handleImageFile = useCallback(
    async (file: File, distributionIndex: number) => {
      if (!file.type.startsWith('image/')) {
        alert('Por favor, selecione um arquivo de imagem');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const imageUrl = e.target?.result as string;
        if (!imageUrl) return;

        const img = new Image();
        img.onload = () => {
          // Calcula o range de legendas para esta imagem
          let startIndex = 0;
          for (let i = 0; i < distributionIndex; i++) {
            startIndex += distributions[i].elementsCount;
          }
          const endIndex = startIndex + distributions[distributionIndex].elementsCount - 1;

          // Cria segmentos para as legendas deste range
          const segments: VideoSegment[] = [];
          for (let i = startIndex; i <= endIndex; i++) {
            segments.push(createVideoSegment(i));
          }

          const sceneId = distributions[distributionIndex].id;

          // Remove cena existente se houver
          const existingScene = scenes.find((s) => s.id === sceneId);
          if (existingScene) {
            onRemoveScene(sceneId);
          }

          const newScene: ImageScene = {
            id: sceneId,
            imageUrl,
            imageWidth: img.width,
            imageHeight: img.height,
            segments,
            startFrame: subtitles[startIndex]?.startFrame ?? 0,
            endFrame: subtitles[endIndex]?.endFrame ?? 0,
          };

          onAddScene(newScene);

          // Atualiza a distribuição com os dados da imagem
          setDistributions((prev) =>
            prev.map((d, i) =>
              i === distributionIndex
                ? { ...d, imageUrl, imageWidth: img.width, imageHeight: img.height }
                : d
            )
          );
        };
        img.src = imageUrl;
      };
      reader.readAsDataURL(file);
    },
    [distributions, subtitles, scenes, onAddScene, onRemoveScene]
  );

  // Handler para bulk upload
  const handleBulkUpload = useCallback(
    async (files: FileList) => {
      const imageFiles = Array.from(files)
        .filter((f) => f.type.startsWith('image/'))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

      if (imageFiles.length === 0) {
        alert('Nenhum arquivo de imagem selecionado');
        return;
      }

      // Remove todas as cenas existentes
      scenes.forEach((scene) => onRemoveScene(scene.id));

      // Cria nova distribuição baseada no número de arquivos
      const elementsPerImage = Math.floor(subtitles.length / imageFiles.length);
      const remainder = subtitles.length % imageFiles.length;

      const newDistributions: ImageDistribution[] = imageFiles.map((_, i) => ({
        id: `bulk-${Date.now()}-${i}`,
        elementsCount: elementsPerImage + (i < remainder ? 1 : 0),
      }));

      setDistributions(newDistributions);

      // Processa cada imagem em sequência
      const processImage = (file: File, index: number): Promise<void> => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const imageUrl = e.target?.result as string;
            if (!imageUrl) {
              resolve();
              return;
            }

            const img = new Image();
            img.onload = () => {
              // Calcula o range de legendas para esta imagem
              let startIndex = 0;
              for (let i = 0; i < index; i++) {
                startIndex += newDistributions[i].elementsCount;
              }
              const endIndex = startIndex + newDistributions[index].elementsCount - 1;

              // Cria segmentos para as legendas deste range
              const segments: VideoSegment[] = [];
              for (let i = startIndex; i <= endIndex; i++) {
                segments.push(createVideoSegment(i));
              }

              const sceneId = newDistributions[index].id;

              const newScene: ImageScene = {
                id: sceneId,
                imageUrl,
                imageWidth: img.width,
                imageHeight: img.height,
                segments,
                startFrame: subtitles[startIndex]?.startFrame ?? 0,
                endFrame: subtitles[endIndex]?.endFrame ?? 0,
              };

              onAddScene(newScene);

              // Atualiza a distribuição com os dados da imagem
              setDistributions((prev) =>
                prev.map((d, i) =>
                  i === index
                    ? { ...d, imageUrl, imageWidth: img.width, imageHeight: img.height }
                    : d
                )
              );

              resolve();
            };
            img.onerror = () => resolve();
            img.src = imageUrl;
          };
          reader.onerror = () => resolve();
          reader.readAsDataURL(file);
        });
      };

      // Processa todas as imagens em sequência para garantir ordem
      for (let i = 0; i < imageFiles.length; i++) {
        await processImage(imageFiles[i], i);
      }
    },
    [subtitles, scenes, onRemoveScene, onAddScene]
  );

  // Calcula ranges de legendas para cada distribuição
  const distributionRanges = useMemo(() => {
    const ranges: Array<{ start: number; end: number; startTime: number; endTime: number }> = [];
    let startIndex = 0;

    for (const dist of distributions) {
      const endIndex = Math.min(startIndex + dist.elementsCount - 1, subtitles.length - 1);
      ranges.push({
        start: startIndex,
        end: endIndex,
        startTime: subtitles[startIndex]?.startTime ?? 0,
        endTime: subtitles[endIndex]?.endTime ?? 0,
      });
      startIndex = endIndex + 1;
    }

    return ranges;
  }, [distributions, subtitles]);

  return (
    <div style={{ padding: 32, height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Cabeçalho */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ color: 'white', marginBottom: 8 }}>Upload de Imagens</h2>
          <p style={{ color: '#888', margin: 0 }}>
            Faça upload das imagens geradas para cada bloco. Configure a API de visão nas configurações para detecção automática.
          </p>
        </div>

        {/* Aviso de API não configurada */}
        {!isVisionConfigured && (
          <div
            style={{
              backgroundColor: '#332700',
              border: '1px solid #665200',
              borderRadius: 8,
              padding: 16,
              marginBottom: 24,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span style={{ fontSize: 20 }}>⚠</span>
            <span style={{ color: '#ffd000' }}>
              API de visão não configurada. Os elementos precisarão ser marcados manualmente no próximo passo. Configure nas Configurações para detecção automática.
            </span>
          </div>
        )}

        {/* Seção de Distribuição */}
        <div
          style={{
            backgroundColor: '#1a1a2e',
            borderRadius: 12,
            padding: 24,
            marginBottom: 24,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ color: '#6366f1', margin: 0 }}>
              📊 Distribuição de Elementos por Imagem
            </h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {/* Campo Legendas por cena */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#888', fontSize: 13 }}>Legendas por cena:</span>
                <button
                  onClick={() => handleSubtitlesPerSceneChange(subtitlesPerScene - 1)}
                  disabled={subtitlesPerScene <= 1}
                  style={{
                    width: 28,
                    height: 28,
                    backgroundColor: '#6366f1',
                    border: 'none',
                    borderRadius: 4,
                    color: 'white',
                    cursor: subtitlesPerScene > 1 ? 'pointer' : 'not-allowed',
                    opacity: subtitlesPerScene > 1 ? 1 : 0.5,
                    fontSize: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  -
                </button>
                <input
                  type="number"
                  value={subtitlesPerScene}
                  onChange={(e) => handleSubtitlesPerSceneChange(parseInt(e.target.value) || 1)}
                  style={{
                    width: 50,
                    padding: '4px',
                    backgroundColor: '#0f0f1a',
                    border: '1px solid #4a4a6e',
                    borderRadius: 4,
                    color: 'white',
                    textAlign: 'center',
                    fontSize: 14,
                  }}
                />
                <button
                  onClick={() => handleSubtitlesPerSceneChange(subtitlesPerScene + 1)}
                  style={{
                    width: 28,
                    height: 28,
                    backgroundColor: '#6366f1',
                    border: 'none',
                    borderRadius: 4,
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  +
                </button>
              </div>
              <button
                onClick={handleResetDistribution}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#4a4a6e',
                  border: 'none',
                  borderRadius: 6,
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                🔄 Resetar
              </button>
              <button
                onClick={handleAddImageToDistribution}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#6366f1',
                  border: 'none',
                  borderRadius: 6,
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                + Adicionar Imagem
              </button>
            </div>
          </div>

          <p style={{ color: '#888', margin: '0 0 16px', fontSize: 14 }}>
            Total de {subtitles.length} legendas. Defina quantas legendas cada imagem cobrirá.
          </p>

          {/* Indicador de configuração pré-carregada */}
          {projectConfig && (
            <div
              style={{
                backgroundColor: 'rgba(99, 102, 241, 0.15)',
                border: '1px solid rgba(99, 102, 241, 0.4)',
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span style={{ fontSize: 16 }}>📄</span>
              <span style={{ color: '#a5b4fc', fontSize: 13 }}>
                Configuração pré-carregada do arquivo TXT: {projectConfig.scenes.length} cenas com{' '}
                {projectConfig.scenes.map((s) => s.elementsCount).join(', ')} elementos.
                Você pode ajustar manualmente se necessário.
              </span>
            </div>
          )}

          {/* Status da distribuição */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              backgroundColor: isDistributionValid ? '#1a3320' : '#331a1a',
              borderRadius: 8,
              marginBottom: 16,
            }}
          >
            <span style={{ color: '#888' }}>Legendas alocadas:</span>
            <span
              style={{
                color: isDistributionValid ? '#22c55e' : '#ef4444',
                fontWeight: 600,
                fontSize: 18,
              }}
            >
              {totalAllocated} / {subtitles.length}
            </span>
          </div>

          {/* Bulk upload */}
          <div
            style={{
              border: '2px dashed #4a4a6e',
              borderRadius: 8,
              padding: 16,
              textAlign: 'center',
              marginBottom: 16,
            }}
          >
            <p style={{ color: '#888', margin: '0 0 8px', fontSize: 13 }}>
              Upload em massa: selecione múltiplas imagens (serão ordenadas pelo nome do arquivo)
            </p>
            <label
              style={{
                display: 'inline-block',
                padding: '8px 16px',
                backgroundColor: '#4a4a6e',
                color: 'white',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              📁 Selecionar Múltiplas Imagens
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleBulkUpload(e.target.files);
                  }
                }}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        </div>

        {/* Grid de imagens */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 16,
            marginBottom: 24,
          }}
        >
          {distributions.map((dist, index) => {
            const range = distributionRanges[index];
            const isDragging = draggedIndex === index;
            const isDragOver = dragOverIndex === index && draggedIndex !== index;

            return (
              <div
                key={dist.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                style={{
                  backgroundColor: '#1a1a2e',
                  borderRadius: 12,
                  overflow: 'hidden',
                  border: isDragOver
                    ? '2px solid #6366f1'
                    : dist.imageUrl
                      ? '2px solid #22c55e'
                      : '2px solid #4a4a6e',
                  opacity: isDragging ? 0.5 : 1,
                  cursor: 'grab',
                  transition: 'border-color 0.2s, opacity 0.2s',
                }}
              >
                {/* Header */}
                <div
                  style={{
                    padding: '12px 16px',
                    backgroundColor: '#2a2a4e',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Drag handle indicator */}
                    <span style={{ color: '#666', cursor: 'grab', fontSize: 14 }} title="Arraste para reordenar">
                      ⋮⋮
                    </span>
                    {/* Position input */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: '#888', fontSize: 11 }}>Pos:</span>
                      <input
                        type="number"
                        min={1}
                        max={distributions.length}
                        value={index + 1}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const newPos = parseInt(e.target.value, 10);
                          if (!isNaN(newPos) && newPos >= 1 && newPos <= distributions.length) {
                            handleMoveImage(index, newPos - 1);
                          }
                        }}
                        style={{
                          width: 40,
                          padding: '2px 4px',
                          backgroundColor: '#0f0f1a',
                          border: '1px solid #4a4a6e',
                          borderRadius: 4,
                          color: 'white',
                          textAlign: 'center',
                          fontSize: 12,
                          cursor: 'text',
                        }}
                        draggable={false}
                      />
                    </div>
                    <span style={{ color: 'white', fontWeight: 600 }}>
                      Imagem {index + 1}
                    </span>
                    {range && (
                      <span style={{ color: '#888', marginLeft: 8, fontSize: 12 }}>
                        {formatTime(range.startTime)} - {formatTime(range.endTime)}
                      </span>
                    )}
                  </div>
                  {distributions.length > 1 && (
                    <button
                      onClick={() => handleRemoveImageFromDistribution(dist.id)}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: '#ef4444',
                        border: 'none',
                        borderRadius: 4,
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: 11,
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Controle de elementos */}
                <div
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #2a2a4e',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span style={{ color: '#888', fontSize: 12 }}>Legendas:</span>
                  <button
                    onClick={() => handleUpdateDistribution(dist.id, dist.elementsCount - 1)}
                    disabled={dist.elementsCount <= 1}
                    style={{
                      width: 28,
                      height: 28,
                      backgroundColor: '#6366f1',
                      border: 'none',
                      borderRadius: 4,
                      color: 'white',
                      cursor: dist.elementsCount > 1 ? 'pointer' : 'not-allowed',
                      opacity: dist.elementsCount > 1 ? 1 : 0.5,
                      fontSize: 16,
                    }}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    value={dist.elementsCount}
                    onChange={(e) => handleUpdateDistribution(dist.id, parseInt(e.target.value) || 1)}
                    style={{
                      width: 50,
                      padding: '4px',
                      backgroundColor: '#0f0f1a',
                      border: '1px solid #4a4a6e',
                      borderRadius: 4,
                      color: 'white',
                      textAlign: 'center',
                      fontSize: 14,
                    }}
                  />
                  <button
                    onClick={() => handleUpdateDistribution(dist.id, dist.elementsCount + 1)}
                    style={{
                      width: 28,
                      height: 28,
                      backgroundColor: '#6366f1',
                      border: 'none',
                      borderRadius: 4,
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: 16,
                    }}
                  >
                    +
                  </button>
                </div>

                {/* Área de imagem */}
                <div style={{ padding: 16 }}>
                  {dist.imageUrl ? (
                    <div style={{ position: 'relative' }}>
                      <img
                        src={dist.imageUrl}
                        alt={`Imagem ${index + 1}`}
                        style={{
                          width: '100%',
                          height: 150,
                          objectFit: 'cover',
                          borderRadius: 8,
                        }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          backgroundColor: '#22c55e',
                          borderRadius: '50%',
                          width: 24,
                          height: 24,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        ✓
                      </div>
                      <label
                        style={{
                          position: 'absolute',
                          bottom: 8,
                          left: 8,
                          padding: '4px 8px',
                          backgroundColor: 'rgba(0,0,0,0.7)',
                          color: 'white',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: 11,
                        }}
                      >
                        Trocar
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleImageFile(file, index);
                          }}
                          style={{ display: 'none' }}
                        />
                      </label>
                    </div>
                  ) : (
                    <label
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: 150,
                        border: '2px dashed #4a4a6e',
                        borderRadius: 8,
                        cursor: 'pointer',
                        backgroundColor: '#0f0f1a',
                      }}
                    >
                      <span style={{ fontSize: 32, marginBottom: 8 }}>📷</span>
                      <span style={{ color: '#888', fontSize: 13 }}>Clique para adicionar</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageFile(file, index);
                        }}
                        style={{ display: 'none' }}
                      />
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Botões de navegação */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 24,
            borderTop: '1px solid #2a2a4e',
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
              Próximo: Regiões →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImagesStep;
