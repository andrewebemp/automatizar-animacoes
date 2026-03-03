import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Ellipse, Line, Transformer } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type Konva from 'konva';
import type { Scene, Element, ElementShape } from '../../types';
import type { AspectRatio } from '../../types/VideoConfig';
import { adjustToAspectRatio, getAspectRatioValue } from '../../utils/calculateTransform';

interface ImageCanvasProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  aspectRatio: AspectRatio;
  scenes: Scene[];
  selectedScene?: Scene;
  mode: 'scenes' | 'elements';
  currentTool: ElementShape;
  onAddScene: (scene: Omit<Scene, 'id' | 'elements'>) => void;
  onUpdateScene: (id: string, updates: Partial<Scene>) => void;
  onAddElement: (element: Omit<Element, 'id'>) => void;
  onUpdateElement: (elementId: string, updates: Partial<Element>) => void;
}

const SCENE_COLORS = [
  '#e94560',
  '#0f3460',
  '#16213e',
  '#ff6b6b',
  '#4ecdc4',
  '#45b7d1',
  '#96ceb4',
  '#ffeaa7',
];

export const ImageCanvas: React.FC<ImageCanvasProps> = ({
  imageUrl,
  imageWidth,
  imageHeight,
  aspectRatio,
  scenes,
  selectedScene,
  mode,
  currentTool,
  onAddScene,
  onUpdateScene,
  onAddElement,
  onUpdateElement,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [sceneImage, setSceneImage] = useState<HTMLImageElement | null>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [scale, setScale] = useState(1);

  // Offset para modo elementos (visualização da cena)
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const [viewScale, setViewScale] = useState(1);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  // Para polygon e freehand
  const [currentPoints, setCurrentPoints] = useState<number[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

  // Carrega a imagem principal
  useEffect(() => {
    if (!imageUrl) {
      setImage(null);
      return;
    }

    const img = new window.Image();
    img.src = imageUrl;
    img.onload = () => setImage(img);
  }, [imageUrl]);

  // Carrega a imagem da cena selecionada (se tiver imagem própria)
  useEffect(() => {
    if (mode === 'elements' && selectedScene?.imageUrl) {
      const img = new window.Image();
      img.src = selectedScene.imageUrl;
      img.onload = () => setSceneImage(img);
    } else {
      setSceneImage(null);
    }
  }, [mode, selectedScene?.imageUrl]);

  // Ajusta o tamanho do stage
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current && imageWidth && imageHeight) {
        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = containerRef.current.clientHeight;

        const scaleX = containerWidth / imageWidth;
        const scaleY = containerHeight / imageHeight;
        const newScale = Math.min(scaleX, scaleY, 1);

        setScale(newScale);
        setStageSize({
          width: imageWidth * newScale,
          height: imageHeight * newScale,
        });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [imageWidth, imageHeight]);

  // Calcula offset e escala para modo elementos (zoom na cena)
  useEffect(() => {
    if (mode === 'elements' && selectedScene && containerRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;

      // Se a cena tem imagem própria, usa as dimensões dela
      // Senão, usa o recorte da imagem principal
      let scenePixelWidth: number;
      let scenePixelHeight: number;

      if (selectedScene.imageUrl && selectedScene.imageDimensions) {
        scenePixelWidth = selectedScene.imageDimensions.width;
        scenePixelHeight = selectedScene.imageDimensions.height;
      } else {
        scenePixelWidth = selectedScene.width * imageWidth;
        scenePixelHeight = selectedScene.height * imageHeight;
      }

      // Escala para caber a cena no container
      const scaleX = containerWidth / scenePixelWidth;
      const scaleY = containerHeight / scenePixelHeight;
      const newViewScale = Math.min(scaleX, scaleY) * 0.9; // 90% para dar margem

      // Calcula o tamanho do stage para mostrar apenas a cena
      const newStageWidth = scenePixelWidth * newViewScale;
      const newStageHeight = scenePixelHeight * newViewScale;

      setViewScale(newViewScale);
      setViewOffset({
        x: selectedScene.x * imageWidth,
        y: selectedScene.y * imageHeight,
      });
      setStageSize({
        width: newStageWidth,
        height: newStageHeight,
      });
    } else if (mode === 'scenes' && containerRef.current && imageWidth && imageHeight) {
      // Reset para modo cenas
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
      const scaleX = containerWidth / imageWidth;
      const scaleY = containerHeight / imageHeight;
      const newScale = Math.min(scaleX, scaleY, 1);

      setViewScale(1);
      setViewOffset({ x: 0, y: 0 });
      setScale(newScale);
      setStageSize({
        width: imageWidth * newScale,
        height: imageHeight * newScale,
      });
    }
  }, [mode, selectedScene, imageWidth, imageHeight, sceneImage]);

  // Atualiza o transformer quando a seleção muda
  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;

    const stage = stageRef.current;
    const selectedNode = selectedId
      ? stage.findOne(`#${selectedId}`)
      : null;

    if (selectedNode) {
      transformerRef.current.nodes([selectedNode]);
      transformerRef.current.getLayer()?.batchDraw();
    } else {
      transformerRef.current.nodes([]);
    }
  }, [selectedId]);

  // Handler de início de desenho
  const handleMouseDown = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      const clickedOnEmpty = e.target === e.target.getStage() ||
                             e.target.name() === 'background-rect';

      // Ignora se clicou em um objeto existente (cena ou elemento)
      if (!clickedOnEmpty) {
        return;
      }

      setSelectedId(null);

      const stage = e.target.getStage();
      if (!stage) return;

      const pos = stage.getPointerPosition();
      if (!pos) return;

      // Converte para coordenadas normalizadas
      const x = pos.x / stageSize.width;
      const y = pos.y / stageSize.height;

      // Para polygon, adiciona ponto ao invés de iniciar desenho contínuo
      if (mode === 'elements' && currentTool === 'polygon') {
        setCurrentPoints((prev) => [...prev, x, y]);
        return;
      }

      setIsDrawing(true);
      setDrawStart({ x, y });

      if (currentTool === 'freehand' && mode === 'elements') {
        setCurrentPoints([x, y]);
      } else {
        setCurrentRect({ x, y, width: 0, height: 0 });
      }
    },
    [stageSize, mode, currentTool]
  );

  // Handler de movimento durante desenho
  const handleMouseMove = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (!isDrawing || !drawStart) return;

      const stage = e.target.getStage();
      if (!stage) return;

      const pos = stage.getPointerPosition();
      if (!pos) return;

      const x = pos.x / stageSize.width;
      const y = pos.y / stageSize.height;

      // Freehand - adiciona pontos continuamente
      if (currentTool === 'freehand' && mode === 'elements') {
        setCurrentPoints((prev) => [...prev, x, y]);
        return;
      }

      // Rect e Ellipse - calcula bounding box
      const rectX = Math.min(drawStart.x, x);
      const rectY = Math.min(drawStart.y, y);
      const width = Math.abs(x - drawStart.x);
      const height = Math.abs(y - drawStart.y);

      setCurrentRect({ x: rectX, y: rectY, width, height });
    },
    [isDrawing, drawStart, stageSize, currentTool, mode]
  );

  // Handler de fim de desenho
  const handleMouseUp = useCallback(() => {
    // Freehand - finaliza com os pontos coletados
    if (currentTool === 'freehand' && mode === 'elements' && currentPoints.length >= 4) {
      if (selectedScene) {
        // Calcula bounding box dos pontos
        const xs = currentPoints.filter((_, i) => i % 2 === 0);
        const ys = currentPoints.filter((_, i) => i % 2 === 1);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        onAddElement({
          label: `Elemento ${selectedScene.elements.length + 1}`,
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
          subtitleIndex: -1,
          shape: 'freehand',
          points: currentPoints,
        });
      }

      setIsDrawing(false);
      setDrawStart(null);
      setCurrentRect(null);
      setCurrentPoints([]);
      return;
    }

    if (!isDrawing || !currentRect) {
      setIsDrawing(false);
      setDrawStart(null);
      setCurrentRect(null);
      return;
    }

    // Verifica se tem tamanho mínimo
    if (currentRect.width < 0.02 || currentRect.height < 0.02) {
      setIsDrawing(false);
      setDrawStart(null);
      setCurrentRect(null);
      return;
    }

    if (mode === 'scenes') {
      onAddScene({
        label: `Cena ${scenes.length + 1}`,
        x: currentRect.x,
        y: currentRect.y,
        width: currentRect.width,
        height: currentRect.height,
      });
    } else if (selectedScene) {
      // Determina o shape baseado na ferramenta atual
      const shape: ElementShape = currentTool === 'ellipse' ? 'ellipse' : 'rect';

      onAddElement({
        label: `Elemento ${selectedScene.elements.length + 1}`,
        x: currentRect.x,
        y: currentRect.y,
        width: currentRect.width,
        height: currentRect.height,
        subtitleIndex: -1,
        shape,
      });
    }

    setIsDrawing(false);
    setDrawStart(null);
    setCurrentRect(null);
  }, [isDrawing, currentRect, currentPoints, mode, scenes.length, selectedScene, currentTool, onAddScene, onAddElement]);

  // Handler para finalizar polígono (duplo clique)
  const handleDoubleClick = useCallback(() => {
    if (currentTool === 'polygon' && mode === 'elements' && currentPoints.length >= 6 && selectedScene) {
      // Calcula bounding box dos pontos
      const xs = currentPoints.filter((_, i) => i % 2 === 0);
      const ys = currentPoints.filter((_, i) => i % 2 === 1);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      onAddElement({
        label: `Elemento ${selectedScene.elements.length + 1}`,
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        subtitleIndex: -1,
        shape: 'polygon',
        points: currentPoints,
      });

      setCurrentPoints([]);
    }
  }, [currentTool, mode, currentPoints, selectedScene, onAddElement]);

  // Handler para cancelar desenho (Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDrawing(false);
        setDrawStart(null);
        setCurrentRect(null);
        setCurrentPoints([]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handler de transformação de cena
  const handleTransformEnd = useCallback(
    (sceneId: string, node: Konva.Node) => {
      const x = node.x() / stageSize.width;
      const y = node.y() / stageSize.height;
      const width = (node.width() * node.scaleX()) / stageSize.width;
      const height = (node.height() * node.scaleY()) / stageSize.height;

      // Reset scale
      node.scaleX(1);
      node.scaleY(1);

      // Ajusta para aspect ratio
      if (imageWidth && imageHeight) {
        const imageAspectRatio = imageWidth / imageHeight;
        const adjusted = adjustToAspectRatio(
          x,
          y,
          width,
          height,
          aspectRatio,
          imageAspectRatio
        );
        onUpdateScene(sceneId, adjusted);
      } else {
        onUpdateScene(sceneId, { x, y, width, height });
      }
    },
    [stageSize, aspectRatio, imageWidth, imageHeight, onUpdateScene]
  );

  if (!imageUrl) {
    return (
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#666',
          fontSize: 18,
          border: '2px dashed #333',
          borderRadius: 8,
        }}
      >
        Carregue uma imagem para começar
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDblClick={handleDoubleClick}
        style={{ cursor: currentTool === 'polygon' ? 'crosshair' : (currentTool === 'freehand' ? 'default' : 'crosshair') }}
      >
        <Layer>
          {/* Retângulo invisível para capturar eventos */}
          <Rect
            name="background-rect"
            x={0}
            y={0}
            width={stageSize.width}
            height={stageSize.height}
            fill="transparent"
          />

          {/* MODO CENAS - Mostra imagem completa */}
          {mode === 'scenes' && (
            <>
              {/* Imagem de fundo completa */}
              {image && (
                <KonvaImage
                  image={image}
                  width={stageSize.width}
                  height={stageSize.height}
                  listening={false}
                />
              )}

              {/* Cenas existentes */}
              {scenes.map((scene, index) => (
                <Rect
                  key={scene.id}
                  id={scene.id}
                  x={scene.x * stageSize.width}
                  y={scene.y * stageSize.height}
                  width={scene.width * stageSize.width}
                  height={scene.height * stageSize.height}
                  stroke={SCENE_COLORS[index % SCENE_COLORS.length]}
                  strokeWidth={selectedScene?.id === scene.id ? 3 : 2}
                  fill={`${SCENE_COLORS[index % SCENE_COLORS.length]}20`}
                  draggable
                  onClick={() => setSelectedId(scene.id)}
                  onTap={() => setSelectedId(scene.id)}
                  onDragEnd={(e) => {
                    const x = e.target.x() / stageSize.width;
                    const y = e.target.y() / stageSize.height;
                    onUpdateScene(scene.id, { x, y });
                  }}
                  onTransformEnd={(e) => handleTransformEnd(scene.id, e.target)}
                />
              ))}

              {/* Retângulo sendo desenhado no modo cenas */}
              {currentRect && (
                <Rect
                  x={currentRect.x * stageSize.width}
                  y={currentRect.y * stageSize.height}
                  width={currentRect.width * stageSize.width}
                  height={currentRect.height * stageSize.height}
                  stroke="#e94560"
                  strokeWidth={2}
                  dash={[5, 5]}
                  fill="#e9456040"
                />
              )}
            </>
          )}

          {/* MODO ELEMENTOS - Mostra apenas a cena selecionada (zoom) */}
          {mode === 'elements' && selectedScene && (
            <>
              {/* Se a cena tem imagem própria, usa ela. Senão, recorta da imagem principal */}
              {sceneImage ? (
                <KonvaImage
                  image={sceneImage}
                  x={0}
                  y={0}
                  width={stageSize.width}
                  height={stageSize.height}
                  listening={false}
                />
              ) : (
                image && (
                  <KonvaImage
                    image={image}
                    x={0}
                    y={0}
                    width={stageSize.width}
                    height={stageSize.height}
                    crop={{
                      x: selectedScene.x * imageWidth,
                      y: selectedScene.y * imageHeight,
                      width: selectedScene.width * imageWidth,
                      height: selectedScene.height * imageHeight,
                    }}
                    listening={false}
                  />
                )
              )}

              {/* Borda da cena */}
              <Rect
                x={0}
                y={0}
                width={stageSize.width}
                height={stageSize.height}
                stroke="#e94560"
                strokeWidth={3}
                listening={false}
              />

              {/* Elementos da cena - renderiza de acordo com o shape */}
              {selectedScene.elements.map((element) => {
                // Coordenadas do elemento (relativas à cena, 0-1)
                const elemX = element.x * stageSize.width;
                const elemY = element.y * stageSize.height;
                const elemWidth = element.width * stageSize.width;
                const elemHeight = element.height * stageSize.height;

                const commonProps = {
                  key: element.id,
                  id: element.id,
                  stroke: '#4ecdc4',
                  strokeWidth: 2,
                  fill: '#4ecdc420',
                  draggable: true,
                  onClick: () => setSelectedId(element.id),
                  onTap: () => setSelectedId(element.id),
                };

                // Renderiza baseado no tipo de forma
                switch (element.shape) {
                  case 'ellipse':
                    return (
                      <Ellipse
                        {...commonProps}
                        x={elemX + elemWidth / 2}
                        y={elemY + elemHeight / 2}
                        radiusX={elemWidth / 2}
                        radiusY={elemHeight / 2}
                        onDragEnd={(e) => {
                          const x = (e.target.x() - elemWidth / 2) / stageSize.width;
                          const y = (e.target.y() - elemHeight / 2) / stageSize.height;
                          onUpdateElement(element.id, { x, y });
                        }}
                      />
                    );

                  case 'polygon':
                  case 'freehand':
                    if (element.points && element.points.length >= 4) {
                      // Converte pontos normalizados para pixels
                      const pixelPoints = element.points.map((p, i) =>
                        i % 2 === 0 ? p * stageSize.width : p * stageSize.height
                      );
                      return (
                        <Line
                          {...commonProps}
                          x={0}
                          y={0}
                          points={pixelPoints}
                          closed={element.shape === 'polygon'}
                          tension={element.shape === 'freehand' ? 0.5 : 0}
                          onDragEnd={(e) => {
                            // Calcula o deslocamento
                            const dx = e.target.x() / stageSize.width;
                            const dy = e.target.y() / stageSize.height;
                            // Move todos os pontos
                            const newPoints = element.points!.map((p, i) =>
                              i % 2 === 0 ? p + dx : p + dy
                            );
                            // Recalcula bounding box
                            const xs = newPoints.filter((_, i) => i % 2 === 0);
                            const ys = newPoints.filter((_, i) => i % 2 === 1);
                            const minX = Math.min(...xs);
                            const maxX = Math.max(...xs);
                            const minY = Math.min(...ys);
                            const maxY = Math.max(...ys);
                            onUpdateElement(element.id, {
                              x: minX,
                              y: minY,
                              width: maxX - minX,
                              height: maxY - minY,
                              points: newPoints,
                            });
                            // Reset position
                            e.target.position({ x: 0, y: 0 });
                          }}
                        />
                      );
                    }
                    // Fallback para rect se não tiver pontos
                    return (
                      <Rect
                        {...commonProps}
                        x={elemX}
                        y={elemY}
                        width={elemWidth}
                        height={elemHeight}
                        onDragEnd={(e) => {
                          const x = e.target.x() / stageSize.width;
                          const y = e.target.y() / stageSize.height;
                          onUpdateElement(element.id, { x, y });
                        }}
                      />
                    );

                  case 'rect':
                  default:
                    return (
                      <Rect
                        {...commonProps}
                        x={elemX}
                        y={elemY}
                        width={elemWidth}
                        height={elemHeight}
                        onDragEnd={(e) => {
                          const x = e.target.x() / stageSize.width;
                          const y = e.target.y() / stageSize.height;
                          onUpdateElement(element.id, { x, y });
                        }}
                      />
                    );
                }
              })}

              {/* Preview do desenho atual - varia conforme a ferramenta */}
              {/* Rect preview */}
              {currentRect && currentTool === 'rect' && (
                <Rect
                  x={currentRect.x * stageSize.width}
                  y={currentRect.y * stageSize.height}
                  width={currentRect.width * stageSize.width}
                  height={currentRect.height * stageSize.height}
                  stroke="#4ecdc4"
                  strokeWidth={2}
                  dash={[5, 5]}
                  fill="#4ecdc440"
                />
              )}

              {/* Ellipse preview */}
              {currentRect && currentTool === 'ellipse' && (
                <Ellipse
                  x={(currentRect.x + currentRect.width / 2) * stageSize.width}
                  y={(currentRect.y + currentRect.height / 2) * stageSize.height}
                  radiusX={(currentRect.width / 2) * stageSize.width}
                  radiusY={(currentRect.height / 2) * stageSize.height}
                  stroke="#4ecdc4"
                  strokeWidth={2}
                  dash={[5, 5]}
                  fill="#4ecdc440"
                />
              )}

              {/* Polygon preview */}
              {currentPoints.length >= 2 && currentTool === 'polygon' && (
                <>
                  <Line
                    points={currentPoints.map((p, i) =>
                      i % 2 === 0 ? p * stageSize.width : p * stageSize.height
                    )}
                    stroke="#4ecdc4"
                    strokeWidth={2}
                    dash={[5, 5]}
                    fill="#4ecdc440"
                    closed={false}
                  />
                  {/* Pontos do polígono */}
                  {currentPoints.filter((_, i) => i % 2 === 0).map((x, idx) => (
                    <Rect
                      key={idx}
                      x={x * stageSize.width - 4}
                      y={currentPoints[idx * 2 + 1] * stageSize.height - 4}
                      width={8}
                      height={8}
                      fill="#4ecdc4"
                    />
                  ))}
                </>
              )}

              {/* Freehand preview */}
              {currentPoints.length >= 4 && currentTool === 'freehand' && isDrawing && (
                <Line
                  points={currentPoints.map((p, i) =>
                    i % 2 === 0 ? p * stageSize.width : p * stageSize.height
                  )}
                  stroke="#4ecdc4"
                  strokeWidth={2}
                  tension={0.5}
                  lineCap="round"
                  lineJoin="round"
                />
              )}
            </>
          )}

          {/* Transformer */}
          <Transformer
            ref={transformerRef}
            boundBoxFunc={(oldBox, newBox) => {
              // Limita tamanho mínimo
              if (newBox.width < 20 || newBox.height < 20) {
                return oldBox;
              }
              return newBox;
            }}
          />
        </Layer>
      </Stage>
    </div>
  );
};
