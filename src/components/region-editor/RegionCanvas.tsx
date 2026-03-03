import React, { useRef, useState, useCallback, useEffect, useImperativeHandle } from 'react';
import type { Region } from '../../types/Region';
import type { VideoSegment } from '../../types/VideoSegment';
import type { ErasedStroke } from '../../types/ImageScene';
import {
  createRectRegion,
  createFreehandRegion,
  createPolygonRegion,
  simplifyPoints,
  translatePath,
  pathToBounds,
} from '../../utils/pathUtils';

export type DrawingTool = 'rect' | 'freehand' | 'polygon' | 'select' | 'eraser';

interface RegionCanvasProps {
  /** URL da imagem */
  imageUrl: string;

  /** Largura original da imagem */
  imageWidth: number;

  /** Altura original da imagem */
  imageHeight: number;

  /** Segmentos com suas regiões */
  segments: VideoSegment[];

  /** Índice do segmento atualmente selecionado */
  selectedSegmentIndex: number;

  /** Ferramenta de desenho atual */
  tool: DrawingTool;

  /** Callback quando uma região é criada/atualizada */
  onRegionChange: (segmentId: string, region: Region) => void;

  /** Callback quando um segmento é selecionado */
  onSegmentSelect: (index: number) => void;

  /** Cor de destaque para regiões */
  highlightColor?: string;

  /** Traços apagados da imagem */
  erasedStrokes?: ErasedStroke[];

  /** Callback quando um traço é apagado */
  onAddErasedStroke?: (stroke: ErasedStroke) => void;

  /** Tamanho da borracha em pixels */
  eraserSize?: number;

  /** Callback quando há mudança nos pontos do polígono em progresso */
  onPolygonPointsChange?: (hasPoints: boolean) => void;

  /** Callback para adicionar novo segmento/elemento */
  onAddSegment?: () => void;
}

/**
 * Canvas para desenhar e visualizar regiões em uma imagem.
 * Suporta desenho de retângulo e freehand.
 */
export const RegionCanvas: React.FC<RegionCanvasProps & {
  /** Ref para expor métodos do canvas */
  canvasRef?: React.RefObject<{ clearPolygonPoints: () => void } | null>;
}> = ({
  imageUrl,
  imageWidth,
  imageHeight,
  segments,
  selectedSegmentIndex,
  tool,
  onRegionChange,
  onSegmentSelect,
  highlightColor = '#00ff00',
  erasedStrokes = [],
  onAddErasedStroke,
  eraserSize = 30,
  canvasRef,
  onPolygonPointsChange,
  onAddSegment,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState<number[]>([]);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [eraserPoints, setEraserPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [currentPoint, setCurrentPoint] = useState<{ x: number; y: number } | null>(null);
  const [baseScale, setBaseScale] = useState(1); // Escala calculada para caber no container
  const [userZoom, setUserZoom] = useState(1); // Zoom do usuário (multiplicador)
  const scale = baseScale * userZoom; // Escala final = base * zoom do usuário
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  // Estado para ferramenta de polígono (pontos)
  const [polygonPoints, setPolygonPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [isDrawingPolygon, setIsDrawingPolygon] = useState(false);
  // Estado para arrastar região (mover)
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragSegmentId, setDragSegmentId] = useState<string | null>(null);
  // Estado para pan (arrastar a visualização)
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);

  // Distância para considerar que o polígono foi fechado (clicou perto do primeiro ponto)
  const CLOSE_DISTANCE = 15;

  // Expõe métodos para o componente pai
  useImperativeHandle(canvasRef, () => ({
    clearPolygonPoints: () => {
      setPolygonPoints([]);
      setIsDrawingPolygon(false);
    },
  }), []);

  // Notifica o pai quando há mudança nos pontos do polígono
  useEffect(() => {
    onPolygonPointsChange?.(polygonPoints.length > 0);
  }, [polygonPoints.length, onPolygonPointsChange]);

  // Calcula escala base para caber no container
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    const scaleX = containerWidth / imageWidth;
    const scaleY = containerHeight / imageHeight;
    const newBaseScale = Math.min(scaleX, scaleY, 1); // Não amplia além do tamanho original

    setBaseScale(newBaseScale);

    // Centraliza a imagem (usando escala base, sem zoom do usuário)
    const scaledWidth = imageWidth * newBaseScale;
    const scaledHeight = imageHeight * newBaseScale;
    setOffset({
      x: (containerWidth - scaledWidth) / 2,
      y: (containerHeight - scaledHeight) / 2,
    });
  }, [imageWidth, imageHeight]);

  // Recalcula offset quando o zoom do usuário muda (para manter centralizado)
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    const scaledWidth = imageWidth * baseScale * userZoom;
    const scaledHeight = imageHeight * baseScale * userZoom;
    setOffset({
      x: (containerWidth - scaledWidth) / 2,
      y: (containerHeight - scaledHeight) / 2,
    });
  }, [userZoom, baseScale, imageWidth, imageHeight]);

  // Handlers de zoom
  const handleZoomIn = useCallback(() => {
    setUserZoom(prev => Math.min(prev * 1.25, 5)); // Máximo 5x
  }, []);

  const handleZoomOut = useCallback(() => {
    setUserZoom(prev => Math.max(prev / 1.25, 0.25)); // Mínimo 0.25x
  }, []);

  const handleZoomReset = useCallback(() => {
    setUserZoom(1);
  }, []);

  // Converte coordenadas do mouse para coordenadas da imagem
  // Permite desenhar além dos limites da imagem para facilitar a seleção
  const screenToImage = useCallback(
    (screenX: number, screenY: number): { x: number; y: number } => {
      if (!containerRef.current) return { x: 0, y: 0 };

      const rect = containerRef.current.getBoundingClientRect();
      const x = (screenX - rect.left - offset.x) / scale;
      const y = (screenY - rect.top - offset.y) / scale;

      // Não limita às dimensões da imagem - permite desenhar além dos limites
      return { x, y };
    },
    [offset, scale]
  );

  // Verifica se um ponto está próximo de outro (para fechar polígono)
  const isNearPoint = useCallback(
    (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
      const dx = (p1.x - p2.x) * scale;
      const dy = (p1.y - p2.y) * scale;
      return Math.sqrt(dx * dx + dy * dy) < CLOSE_DISTANCE;
    },
    [scale, CLOSE_DISTANCE]
  );

  // Verifica se um ponto está dentro do bounding box de uma região
  const isPointInRegion = useCallback(
    (point: { x: number; y: number }, region: Region): boolean => {
      const { bounds } = region;
      return (
        point.x >= bounds.x &&
        point.x <= bounds.x + bounds.width &&
        point.y >= bounds.y &&
        point.y <= bounds.y + bounds.height
      );
    },
    []
  );

  // Encontra qual segmento (região) foi clicado
  const findSegmentAtPoint = useCallback(
    (point: { x: number; y: number }): { segment: VideoSegment; index: number } | null => {
      // Procura de trás para frente (regiões na frente primeiro)
      for (let i = segments.length - 1; i >= 0; i--) {
        const segment = segments[i];
        if (segment.region && isPointInRegion(point, segment.region)) {
          return { segment, index: i };
        }
      }
      return null;
    },
    [segments, isPointInRegion]
  );

  // Finaliza o polígono e cria a região
  const finishPolygon = useCallback(() => {
    if (polygonPoints.length < 3) {
      setPolygonPoints([]);
      setIsDrawingPolygon(false);
      return;
    }

    const selectedSegment = segments[selectedSegmentIndex];
    if (!selectedSegment) {
      setPolygonPoints([]);
      setIsDrawingPolygon(false);
      return;
    }

    // Converte para array flat [x1, y1, x2, y2, ...]
    const flatPoints: number[] = [];
    for (const p of polygonPoints) {
      flatPoints.push(p.x, p.y);
    }

    const region = createPolygonRegion(flatPoints);
    onRegionChange(selectedSegment.id, region);

    setPolygonPoints([]);
    setIsDrawingPolygon(false);
  }, [polygonPoints, segments, selectedSegmentIndex, onRegionChange]);

  // Handlers de mouse
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const point = screenToImage(e.clientX, e.clientY);

      // Ferramenta select - permite arrastar regiões
      if (tool === 'select') {
        const found = findSegmentAtPoint(point);
        if (found) {
          // Seleciona o segmento e inicia drag
          onSegmentSelect(found.index);
          setIsDragging(true);
          setDragStart(point);
          setDragSegmentId(found.segment.id);
        }
        return;
      }

      // Ferramenta de polígono - clique adiciona ponto
      if (tool === 'polygon') {
        if (!isDrawingPolygon) {
          // Primeiro ponto - inicia o polígono
          setPolygonPoints([point]);
          setIsDrawingPolygon(true);
        } else {
          // Verifica se clicou perto do primeiro ponto para fechar
          if (polygonPoints.length >= 3 && isNearPoint(point, polygonPoints[0])) {
            finishPolygon();
          } else {
            // Adiciona novo ponto
            setPolygonPoints((prev) => [...prev, point]);
          }
        }
        setCurrentPoint(point);
        return;
      }

      setIsDrawing(true);
      setStartPoint(point);
      setCurrentPoint(point);

      if (tool === 'freehand') {
        setDrawingPoints([point.x, point.y]);
      } else if (tool === 'eraser') {
        setEraserPoints([point]);
      }
    },
    [tool, screenToImage, isDrawingPolygon, polygonPoints, isNearPoint, finishPolygon, findSegmentAtPoint, onSegmentSelect]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const point = screenToImage(e.clientX, e.clientY);

      // Drag de região (mover)
      if (isDragging && dragStart && dragSegmentId) {
        const segment = segments.find(s => s.id === dragSegmentId);
        if (segment && segment.region) {
          const deltaX = point.x - dragStart.x;
          const deltaY = point.y - dragStart.y;

          // Atualiza o path transladado
          const newPathData = translatePath(segment.region.pathData, deltaX, deltaY);
          const newBounds = pathToBounds(newPathData);

          const newRegion: Region = {
            ...segment.region,
            pathData: newPathData,
            bounds: newBounds,
          };

          onRegionChange(segment.id, newRegion);
          setDragStart(point);
        }
        return;
      }

      // Para polígono, sempre atualiza currentPoint para mostrar preview da linha
      if (tool === 'polygon' && isDrawingPolygon) {
        setCurrentPoint(point);
        return;
      }

      if (!isDrawing) return;

      setCurrentPoint(point);

      if (tool === 'freehand') {
        setDrawingPoints((prev) => [...prev, point.x, point.y]);
      } else if (tool === 'eraser') {
        setEraserPoints((prev) => [...prev, point]);
      }
    },
    [isDrawing, isDrawingPolygon, isDragging, dragStart, dragSegmentId, tool, screenToImage, segments, onRegionChange]
  );

  const handleMouseUp = useCallback(() => {
    // Finaliza drag
    if (isDragging) {
      setIsDragging(false);
      setDragStart(null);
      setDragSegmentId(null);
      return;
    }

    if (!isDrawing) return;

    // Handle eraser tool separately
    if (tool === 'eraser') {
      if (eraserPoints.length >= 2 && onAddErasedStroke) {
        const stroke: ErasedStroke = {
          id: `eraser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          points: eraserPoints,
          strokeWidth: eraserSize,
        };
        onAddErasedStroke(stroke);
      }
      setIsDrawing(false);
      setEraserPoints([]);
      setStartPoint(null);
      setCurrentPoint(null);
      return;
    }

    const selectedSegment = segments[selectedSegmentIndex];
    if (!selectedSegment) {
      setIsDrawing(false);
      setDrawingPoints([]);
      setStartPoint(null);
      setCurrentPoint(null);
      return;
    }

    let region: Region | null = null;

    if (tool === 'rect' && startPoint && currentPoint) {
      const x = Math.min(startPoint.x, currentPoint.x);
      const y = Math.min(startPoint.y, currentPoint.y);
      const width = Math.abs(currentPoint.x - startPoint.x);
      const height = Math.abs(currentPoint.y - startPoint.y);

      if (width > 5 && height > 5) {
        region = createRectRegion(x, y, width, height);
      }
    } else if (tool === 'freehand' && drawingPoints.length >= 6) {
      // Simplifica os pontos antes de criar a região
      const simplified = simplifyPoints(drawingPoints, 3);
      region = createFreehandRegion(simplified);
    }

    if (region) {
      onRegionChange(selectedSegment.id, region);
    }

    setIsDrawing(false);
    setDrawingPoints([]);
    setStartPoint(null);
    setCurrentPoint(null);
  }, [
    isDrawing,
    isDragging,
    tool,
    startPoint,
    currentPoint,
    drawingPoints,
    eraserPoints,
    eraserSize,
    segments,
    selectedSegmentIndex,
    onRegionChange,
    onAddErasedStroke,
  ]);

  // Renderiza preview do polígono sendo desenhado
  const renderPolygonPreview = () => {
    if (!isDrawingPolygon || polygonPoints.length === 0) return null;

    // Pontos já adicionados
    const pointsStr = polygonPoints
      .map((p) => `${p.x * scale + offset.x},${p.y * scale + offset.y}`)
      .join(' ');

    // Linha do último ponto até o mouse atual
    const lastPoint = polygonPoints[polygonPoints.length - 1];
    const lineToMouse = currentPoint
      ? `M ${lastPoint.x * scale + offset.x} ${lastPoint.y * scale + offset.y} L ${currentPoint.x * scale + offset.x} ${currentPoint.y * scale + offset.y}`
      : '';

    // Verifica se o mouse está perto do primeiro ponto (para mostrar indicação de fechamento)
    const isNearStart = currentPoint && polygonPoints.length >= 3 && isNearPoint(currentPoint, polygonPoints[0]);

    return (
      <g>
        {/* Linhas entre os pontos */}
        {polygonPoints.length >= 2 && (
          <polyline
            points={pointsStr}
            fill="none"
            stroke={highlightColor}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Linha do último ponto até o mouse */}
        {lineToMouse && (
          <path
            d={lineToMouse}
            fill="none"
            stroke={highlightColor}
            strokeWidth={2}
            strokeDasharray="5,5"
            strokeLinecap="round"
          />
        )}

        {/* Pontos como círculos */}
        {polygonPoints.map((p, i) => (
          <circle
            key={i}
            cx={p.x * scale + offset.x}
            cy={p.y * scale + offset.y}
            r={i === 0 && isNearStart ? 10 : 6}
            fill={i === 0 ? (isNearStart ? '#22c55e' : '#ff6b6b') : highlightColor}
            stroke="white"
            strokeWidth={2}
          />
        ))}

        {/* Indicador de fechamento */}
        {isNearStart && (
          <text
            x={polygonPoints[0].x * scale + offset.x + 15}
            y={polygonPoints[0].y * scale + offset.y - 10}
            fill="#22c55e"
            fontSize={12}
            fontWeight="bold"
          >
            Clique para fechar
          </text>
        )}
      </g>
    );
  };

  // Renderiza preview do desenho atual
  const renderDrawingPreview = () => {
    if (!isDrawing) return null;

    if (tool === 'rect' && startPoint && currentPoint) {
      const x = Math.min(startPoint.x, currentPoint.x) * scale + offset.x;
      const y = Math.min(startPoint.y, currentPoint.y) * scale + offset.y;
      const width = Math.abs(currentPoint.x - startPoint.x) * scale;
      const height = Math.abs(currentPoint.y - startPoint.y) * scale;

      return (
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill="rgba(0, 255, 0, 0.2)"
          stroke={highlightColor}
          strokeWidth={2}
          strokeDasharray="5,5"
        />
      );
    }

    if (tool === 'freehand' && drawingPoints.length >= 4) {
      const points = drawingPoints
        .map((val, i) => {
          if (i % 2 === 0) {
            return `${val * scale + offset.x},${drawingPoints[i + 1] * scale + offset.y}`;
          }
          return null;
        })
        .filter(Boolean)
        .join(' ');

      return (
        <polyline
          points={points}
          fill="none"
          stroke={highlightColor}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    }

    // Preview da borracha enquanto desenha
    if (tool === 'eraser' && eraserPoints.length >= 1) {
      const pathData = eraserPoints
        .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x * scale + offset.x} ${pt.y * scale + offset.y}`)
        .join(' ');

      return (
        <path
          d={pathData}
          fill="none"
          stroke="rgba(255, 255, 255, 0.8)"
          strokeWidth={eraserSize * scale}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    }

    return null;
  };

  // Renderiza traços já apagados
  const renderErasedStrokes = () => {
    if (erasedStrokes.length === 0) return null;

    return erasedStrokes.map((stroke) => {
      if (stroke.points.length < 2) return null;

      const pathData = stroke.points
        .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x * scale + offset.x} ${pt.y * scale + offset.y}`)
        .join(' ');

      return (
        <path
          key={stroke.id}
          d={pathData}
          fill="none"
          stroke="#ffffff"
          strokeWidth={stroke.strokeWidth * scale}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    });
  };

  // Renderiza regiões existentes
  const renderRegions = () => {
    return segments.map((segment, index) => {
      if (!segment.region || !segment.region.pathData) return null;

      const isSelected = index === selectedSegmentIndex;
      const color = isSelected ? highlightColor : 'rgba(255, 255, 255, 0.5)';

      // Transforma o path para coordenadas da tela
      const transformedPath = segment.region.pathData.replace(
        /-?\d+\.?\d*/g,
        (match, offset) => {
          const num = parseFloat(match);
          if (isNaN(num)) return match;

          // Determina se é X ou Y baseado na posição
          // Isso é uma simplificação - funciona para paths simples
          return String(num * scale);
        }
      );

      return (
        <g
          key={segment.id}
          transform={`translate(${offset.x}, ${offset.y})`}
          onClick={() => onSegmentSelect(index)}
          style={{ cursor: tool === 'select' ? 'grab' : 'pointer' }}
        >
          <path
            d={segment.region.pathData}
            fill="rgba(0, 255, 0, 0.15)"
            stroke={color}
            strokeWidth={isSelected ? 3 : 1}
            transform={`scale(${scale})`}
          />
          {/* Número do segmento */}
          <text
            x={segment.region.bounds.x * scale + 10}
            y={segment.region.bounds.y * scale + 25}
            fill={color}
            fontSize={18}
            fontWeight="bold"
            style={{ pointerEvents: 'none' }}
          >
            {index + 1}
          </text>
        </g>
      );
    });
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        backgroundColor: '#1a1a1a',
      }}
    >
      {/* Área de scroll do canvas */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          overflow: 'auto',
          cursor: isDragging ? 'grabbing' : tool === 'select' ? 'default' : tool === 'eraser' ? 'cell' : 'crosshair',
        }}
      >
        {/* Container interno para scroll - tem o tamanho da imagem escalada */}
        <div
          style={{
            position: 'relative',
            minWidth: Math.max(imageWidth * scale + Math.abs(offset.x) * 2, '100%' as any),
            minHeight: Math.max(imageHeight * scale + Math.abs(offset.y) * 2, '100%' as any),
            width: imageWidth * scale + offset.x * 2,
            height: imageHeight * scale + offset.y * 2,
          }}
        >
          {/* Imagem de fundo */}
          <img
            src={imageUrl}
            alt="Canvas"
            style={{
              position: 'absolute',
              left: offset.x,
              top: offset.y,
              width: imageWidth * scale,
              height: imageHeight * scale,
              pointerEvents: 'none',
              userSelect: 'none',
            }}
            draggable={false}
          />

          {/* SVG overlay para desenho */}
          <svg
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
              // Não cancela polígono ao sair do canvas, mas cancela drag
              if (isDragging) {
                setIsDragging(false);
                setDragStart(null);
                setDragSegmentId(null);
              } else if (tool !== 'polygon') {
                handleMouseUp();
              }
            }}
          >
            {/* Traços apagados (aparecem como branco sobre a imagem) */}
            {renderErasedStrokes()}
            {renderRegions()}
            {renderDrawingPreview()}
            {renderPolygonPreview()}
          </svg>
        </div>
      </div>

      {/* Controles de zoom - fixos no canto (fora do scroll) */}
      <div
        style={{
          position: 'absolute',
          bottom: 10,
          right: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          borderRadius: 6,
          padding: 4,
          zIndex: 10,
        }}
      >
        <button
          onClick={handleZoomOut}
          style={{
            width: 32,
            height: 32,
            backgroundColor: '#4a4a6e',
            border: 'none',
            borderRadius: 4,
            color: 'white',
            cursor: 'pointer',
            fontSize: 18,
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Diminuir zoom"
        >
          −
        </button>
        <button
          onClick={handleZoomReset}
          style={{
            minWidth: 50,
            height: 32,
            backgroundColor: userZoom !== 1 ? '#6366f1' : '#3a3a5e',
            border: 'none',
            borderRadius: 4,
            color: 'white',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 'bold',
            padding: '0 8px',
          }}
          title="Resetar zoom"
        >
          {Math.round(userZoom * 100)}%
        </button>
        <button
          onClick={handleZoomIn}
          style={{
            width: 32,
            height: 32,
            backgroundColor: '#4a4a6e',
            border: 'none',
            borderRadius: 4,
            color: 'white',
            cursor: 'pointer',
            fontSize: 18,
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Aumentar zoom"
        >
          +
        </button>
      </div>

      {/* Indicador de segmento selecionado - fixo no canto (fora do scroll) */}
      {segments[selectedSegmentIndex] && (
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            left: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            zIndex: 10,
          }}
        >
          <div
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              color: 'white',
              padding: '8px 16px',
              borderRadius: 4,
              fontSize: 14,
            }}
          >
            Segmento {selectedSegmentIndex + 1} de {segments.length}
            {segments[selectedSegmentIndex].region && ' ✓'}
          </div>
          {onAddSegment && (
            <button
              onClick={onAddSegment}
              style={{
                backgroundColor: '#22c55e',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                padding: '8px 12px',
                fontSize: 16,
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Adicionar novo elemento"
            >
              +
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default RegionCanvas;
