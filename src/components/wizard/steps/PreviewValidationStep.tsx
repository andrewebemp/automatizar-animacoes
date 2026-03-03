import React, { useState, useRef, useCallback } from 'react';
import type { ImageBlock, ElementRegion, RevealDirection, RevealPercentage, ElementDisplayMode } from '../../../types/ImageBlock';
import { REVEAL_DIRECTION_LABELS, ELEMENT_DISPLAY_MODE_LABELS } from '../../../types/ImageBlock';
import { formatTime } from '../../../utils/promptGenerator';
import { processFreehandPath, calculateBoundingBox } from '../../../utils/pathSmoothing';

interface PreviewValidationStepProps {
  imageBlocks: ImageBlock[];
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
  onContinue: () => void;
}

type DrawingMode = 'none' | 'rect' | 'freehand' | 'polygon';

interface DrawingState {
  isDrawing: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  points: number[]; // For freehand/polygon: [x1, y1, x2, y2, ...]
}

interface DragState {
  isDragging: boolean;
  elementId: string | null;
  startMouseX: number;
  startMouseY: number;
  originalRegion: ElementRegion | null;
}

// Distância em pixels para considerar que o usuário clicou no primeiro ponto (fechar polígono)
const POLYGON_CLOSE_THRESHOLD = 15;

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
  blockNav: {
    display: 'flex',
    gap: '8px',
    marginBottom: '24px',
    flexWrap: 'wrap' as const,
  },
  blockNavButton: {
    padding: '8px 16px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    background: 'rgba(255, 255, 255, 0.05)',
    color: '#94a3b8',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  blockNavButtonActive: {
    background: 'linear-gradient(135deg, #7c3aed, #00d4ff)',
    color: '#fff',
    border: '1px solid transparent',
  },
  previewContainer: {
    display: 'grid',
    gridTemplateColumns: '1fr 350px',
    gap: '24px',
  },
  imageContainer: {
    position: 'relative' as const,
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '12px',
    overflow: 'auto',
    maxHeight: 'calc(100vh - 400px)',
    minHeight: '300px',
  },
  imageWrapper: {
    position: 'relative' as const,
    display: 'inline-block',
    minWidth: '100%',
  },
  image: {
    display: 'block',
    maxWidth: 'none',
    userSelect: 'none' as const,
  },
  controlsBar: {
    position: 'absolute' as const,
    top: '12px',
    right: '12px',
    display: 'flex',
    gap: '8px',
    zIndex: 10,
    flexWrap: 'wrap' as const,
  },
  zoomControls: {
    display: 'flex',
    gap: '4px',
    background: 'rgba(0, 0, 0, 0.7)',
    borderRadius: '6px',
    padding: '4px',
  },
  drawingControls: {
    display: 'flex',
    gap: '4px',
    background: 'rgba(0, 0, 0, 0.7)',
    borderRadius: '6px',
    padding: '4px',
  },
  controlButton: {
    minWidth: '32px',
    height: '28px',
    borderRadius: '4px',
    border: 'none',
    background: 'transparent',
    color: '#fff',
    fontSize: '12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 8px',
    transition: 'all 0.2s',
  },
  controlButtonActive: {
    background: 'rgba(124, 58, 237, 0.8)',
  },
  zoomLabel: {
    padding: '0 8px',
    color: '#fff',
    fontSize: '11px',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
  },
  elementOverlay: {
    position: 'absolute' as const,
    border: '2px solid',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    padding: '4px',
    transition: 'all 0.2s',
    cursor: 'pointer',
  },
  elementNumber: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 600,
    color: '#fff',
  },
  drawingPreview: {
    position: 'absolute' as const,
    border: '2px dashed #7c3aed',
    background: 'rgba(124, 58, 237, 0.2)',
    pointerEvents: 'none' as const,
  },
  sidebar: {
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  sidebarHeader: {
    padding: '16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },
  sidebarTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#fff',
    marginBottom: '4px',
  },
  sidebarSubtitle: {
    fontSize: '12px',
    color: '#94a3b8',
  },
  drawingInstructions: {
    padding: '12px 16px',
    background: 'rgba(124, 58, 237, 0.1)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    fontSize: '12px',
    color: '#a78bfa',
  },
  timelineList: {
    flex: 1,
    maxHeight: '400px',
    overflowY: 'auto' as const,
  },
  timelineItem: {
    display: 'flex',
    gap: '12px',
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  timelineItemHover: {
    background: 'rgba(124, 58, 237, 0.1)',
  },
  timelineItemActive: {
    background: 'rgba(124, 58, 237, 0.2)',
  },
  timelineItemDrawing: {
    background: 'rgba(124, 58, 237, 0.3)',
    border: '1px solid rgba(124, 58, 237, 0.5)',
  },
  timelineNumber: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 600,
    color: '#fff',
    flexShrink: 0,
  },
  timelineContent: {
    flex: 1,
    minWidth: 0,
  },
  timelineTime: {
    fontSize: '11px',
    color: '#64748b',
    marginBottom: '4px',
  },
  timelineText: {
    fontSize: '12px',
    color: '#94a3b8',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  timelineVisual: {
    fontSize: '11px',
    color: '#a78bfa',
    marginTop: '4px',
    fontStyle: 'italic' as const,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  timelineStatus: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    marginTop: '4px',
    display: 'inline-block',
  },
  timelineActions: {
    display: 'flex',
    gap: '4px',
    marginTop: '6px',
  },
  actionButton: {
    padding: '4px 8px',
    borderRadius: '4px',
    border: 'none',
    fontSize: '10px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  drawButton: {
    background: 'rgba(124, 58, 237, 0.3)',
    color: '#a78bfa',
  },
  clearButton: {
    background: 'rgba(239, 68, 68, 0.3)',
    color: '#ef4444',
  },
  statusDetected: {
    background: 'rgba(34, 197, 94, 0.2)',
    color: '#22c55e',
  },
  statusManual: {
    background: 'rgba(251, 191, 36, 0.2)',
    color: '#fbbf24',
  },
  statusMissing: {
    background: 'rgba(239, 68, 68, 0.2)',
    color: '#ef4444',
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
  legend: {
    display: 'flex',
    gap: '16px',
    padding: '12px 16px',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    fontSize: '11px',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    color: '#94a3b8',
  },
  legendDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  globalToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    background: 'rgba(251, 191, 36, 0.1)',
    borderRadius: '8px',
    marginBottom: '16px',
    cursor: 'pointer',
    border: '1px solid rgba(251, 191, 36, 0.2)',
    transition: 'all 0.2s',
  },
  globalToggleActive: {
    background: 'rgba(124, 58, 237, 0.15)',
    borderColor: 'rgba(124, 58, 237, 0.4)',
  },
  globalToggleCheckbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
    accentColor: '#7c3aed',
  },
  globalToggleLabel: {
    flex: 1,
  },
  globalToggleTitle: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#fff',
    marginBottom: '2px',
  },
  globalToggleTitleActive: {
    color: '#a78bfa',
  },
  globalToggleDescription: {
    fontSize: '11px',
    color: '#94a3b8',
  },
  animationConfig: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    marginTop: '8px',
    padding: '8px',
    background: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '6px',
  },
  animationRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  animationLabel: {
    fontSize: '10px',
    color: '#94a3b8',
    minWidth: '60px',
  },
  animationSelect: {
    flex: 1,
    padding: '4px 6px',
    borderRadius: '4px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(0, 0, 0, 0.3)',
    color: '#fff',
    fontSize: '10px',
    cursor: 'pointer',
    outline: 'none',
  },
};

const ELEMENT_COLORS = [
  '#7c3aed', // purple
  '#00d4ff', // cyan
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
  '#06b6d4', // teal
  '#8b5cf6', // violet
];

const ZOOM_LEVELS = [10, 15, 25, 50, 75, 100, 150, 200];

// Opções de porcentagem para o dropdown
const REVEAL_PERCENTAGE_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: '0% (instantâneo)' },
  { value: 10, label: '10%' },
  { value: 20, label: '20%' },
  { value: 30, label: '30%' },
  { value: 40, label: '40%' },
  { value: 50, label: '50%' },
  { value: 60, label: '60% (padrão)' },
  { value: 70, label: '70%' },
  { value: 80, label: '80%' },
  { value: 90, label: '90%' },
  { value: 100, label: '100%' },
];

export const PreviewValidationStep: React.FC<PreviewValidationStepProps> = ({
  imageBlocks,
  onSetElementRegion,
  onClearElementRegion,
  onUpdateElementAnimation,
  onContinue,
}) => {
  const [activeBlockIndex, setActiveBlockIndex] = useState(0);
  const [hoveredElement, setHoveredElement] = useState<string | null>(null);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [ignoreAutoDetections, setIgnoreAutoDetections] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(25); // Start at 25% for large images
  const [drawingMode, setDrawingMode] = useState<DrawingMode>('none');
  const [drawingForElement, setDrawingForElement] = useState<string | null>(null);
  const [drawing, setDrawing] = useState<DrawingState>({
    isDrawing: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    points: [],
  });
  const [drag, setDrag] = useState<DragState>({
    isDragging: false,
    elementId: null,
    startMouseX: 0,
    startMouseY: 0,
    originalRegion: null,
  });

  const imageWrapperRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const activeBlock = imageBlocks[activeBlockIndex];

  // Zoom controls
  const handleZoomIn = () => {
    const currentIndex = ZOOM_LEVELS.indexOf(zoomLevel);
    if (currentIndex < ZOOM_LEVELS.length - 1) {
      setZoomLevel(ZOOM_LEVELS[currentIndex + 1]);
    } else if (zoomLevel < 200) {
      setZoomLevel(Math.min(zoomLevel + 25, 200));
    }
  };

  const handleZoomOut = () => {
    const currentIndex = ZOOM_LEVELS.indexOf(zoomLevel);
    if (currentIndex > 0) {
      setZoomLevel(ZOOM_LEVELS[currentIndex - 1]);
    } else if (zoomLevel > 10) {
      setZoomLevel(Math.max(zoomLevel - 5, 10));
    }
  };

  const handleZoomFit = () => {
    setZoomLevel(25);
  };

  const handleZoom100 = () => {
    setZoomLevel(100);
  };

  // Get mouse position relative to image (in image pixels)
  const getMousePosition = useCallback((e: React.MouseEvent): { x: number; y: number } | null => {
    if (!imageRef.current || !activeBlock?.image || !imageWrapperRef.current) return null;

    // Check if image is loaded
    if (!imageRef.current.complete || imageRef.current.naturalWidth === 0) {
      console.warn('[getMousePosition] Image not fully loaded');
      return null;
    }

    // Use actual natural dimensions from the img element (most reliable)
    const naturalWidth = imageRef.current.naturalWidth;
    const naturalHeight = imageRef.current.naturalHeight;

    // Calculate the zoom scale
    const zoomScale = zoomLevel / 100;

    // Get the wrapper's bounding rect - this is the transformed container
    // IMPORTANT: getBoundingClientRect() returns coordinates AFTER CSS transforms
    // So the rect already reflects the scaled size
    const wrapperRect = imageWrapperRef.current.getBoundingClientRect();

    // Get mouse position relative to the wrapper's top-left corner
    // These are in screen coordinates (post-transform)
    const screenX = e.clientX - wrapperRect.left;
    const screenY = e.clientY - wrapperRect.top;

    // Convert screen coordinates to image pixel coordinates
    // Since the wrapper is scaled by zoomScale, we need to divide by zoomScale
    // to get the actual image pixel position
    const x = screenX / zoomScale;
    const y = screenY / zoomScale;

    // Clamp to natural image bounds
    return {
      x: Math.max(0, Math.min(x, naturalWidth)),
      y: Math.max(0, Math.min(y, naturalHeight)),
    };
  }, [activeBlock?.image, zoomLevel]);

  // Start drawing for a specific element
  const startDrawingForElement = (elementId: string, mode: DrawingMode) => {
    setDrawingForElement(elementId);
    setDrawingMode(mode);
    setSelectedElement(elementId);
  };

  // Cancel drawing
  const cancelDrawing = () => {
    setDrawingMode('none');
    setDrawingForElement(null);
    setDrawing({
      isDrawing: false,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      points: [],
    });
  };

  // Start dragging an existing region
  const startDrag = useCallback((elementId: string, mouseX: number, mouseY: number, region: ElementRegion) => {
    setDrag({
      isDragging: true,
      elementId,
      startMouseX: mouseX,
      startMouseY: mouseY,
      originalRegion: { ...region, points: region.points ? [...region.points] : undefined },
    });
    setSelectedElement(elementId);
  }, []);

  // Cancel dragging
  const cancelDrag = useCallback(() => {
    setDrag({
      isDragging: false,
      elementId: null,
      startMouseX: 0,
      startMouseY: 0,
      originalRegion: null,
    });
  }, []);

  // Handle drag move
  const handleDragMove = useCallback((mouseX: number, mouseY: number) => {
    if (!drag.isDragging || !drag.originalRegion || !drag.elementId || !activeBlock?.image || !imageRef.current) return;

    const deltaX = mouseX - drag.startMouseX;
    const deltaY = mouseY - drag.startMouseY;

    const imgWidth = imageRef.current.naturalWidth || activeBlock.image.width;
    const imgHeight = imageRef.current.naturalHeight || activeBlock.image.height;

    // Calculate new position, clamping to image bounds
    let newX = drag.originalRegion.x + deltaX;
    let newY = drag.originalRegion.y + deltaY;

    // Clamp to bounds
    newX = Math.max(0, Math.min(newX, imgWidth - drag.originalRegion.width));
    newY = Math.max(0, Math.min(newY, imgHeight - drag.originalRegion.height));

    // Find the element to get its current region for preview
    const element = activeBlock.timeline.find(el => el.id === drag.elementId);
    if (!element) return;

    // Update region with new position (preview - actual save happens on mouseUp)
    const newRegion: ElementRegion = {
      ...drag.originalRegion,
      x: Math.round(newX),
      y: Math.round(newY),
    };

    // For polygon/freehand, also move all points
    if (drag.originalRegion.points && drag.originalRegion.points.length >= 4) {
      newRegion.points = drag.originalRegion.points.map((val, idx) => {
        if (idx % 2 === 0) {
          // X coordinate
          return Math.round(val + deltaX);
        } else {
          // Y coordinate
          return Math.round(val + deltaY);
        }
      });
    }

    // Save the updated region
    onSetElementRegion(activeBlock.id, drag.elementId, newRegion);
  }, [drag, activeBlock, onSetElementRegion]);

  // Finish drag
  const finishDrag = useCallback(() => {
    if (drag.isDragging) {
      console.log('[PreviewValidation] Drag finished');
    }
    cancelDrag();
  }, [drag.isDragging, cancelDrag]);

  // Helper: finaliza o polígono e salva a região
  const finalizePolygon = useCallback(() => {
    if (!drawingForElement || !activeBlock || drawing.points.length < 6) {
      cancelDrawing();
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < drawing.points.length; i += 2) {
      minX = Math.min(minX, drawing.points[i]);
      maxX = Math.max(maxX, drawing.points[i]);
      minY = Math.min(minY, drawing.points[i + 1]);
      maxY = Math.max(maxY, drawing.points[i + 1]);
    }

    const region: ElementRegion = {
      x: Math.round(minX),
      y: Math.round(minY),
      width: Math.round(maxX - minX),
      height: Math.round(maxY - minY),
      shape: 'polygon',
      points: drawing.points.map(p => Math.round(p)),
    };

    console.log('[PreviewValidation] Saving polygon region:', { region, pointCount: drawing.points.length / 2 });
    onSetElementRegion(activeBlock.id, drawingForElement, region);
    cancelDrawing();
  }, [drawing.points, drawingForElement, activeBlock, onSetElementRegion]);

  // Mouse handlers for drawing
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (drawingMode === 'none' || !drawingForElement) return;

    const pos = getMousePosition(e);
    if (!pos) return;

    e.preventDefault();

    // Modo polígono: clique-por-clique para adicionar pontos
    if (drawingMode === 'polygon') {
      // Se já está desenhando, verifica se clicou perto do primeiro ponto para fechar
      if (drawing.isDrawing && drawing.points.length >= 6) {
        const firstX = drawing.points[0];
        const firstY = drawing.points[1];
        const distance = Math.sqrt(Math.pow(pos.x - firstX, 2) + Math.pow(pos.y - firstY, 2));

        // Ajusta o threshold baseado no zoom
        const adjustedThreshold = POLYGON_CLOSE_THRESHOLD / (zoomLevel / 100);

        if (distance < adjustedThreshold) {
          // Fechar polígono
          finalizePolygon();
          return;
        }
      }

      // Adiciona novo ponto ao polígono
      if (drawing.isDrawing) {
        setDrawing(prev => ({
          ...prev,
          currentX: pos.x,
          currentY: pos.y,
          points: [...prev.points, pos.x, pos.y],
        }));
      } else {
        // Primeiro ponto - inicia o polígono
        setDrawing({
          isDrawing: true,
          startX: pos.x,
          startY: pos.y,
          currentX: pos.x,
          currentY: pos.y,
          points: [pos.x, pos.y],
        });
      }
      return;
    }

    // Outros modos (rect, freehand)
    setDrawing({
      isDrawing: true,
      startX: pos.x,
      startY: pos.y,
      currentX: pos.x,
      currentY: pos.y,
      points: drawingMode === 'freehand' ? [pos.x, pos.y] : [],
    });
  }, [drawingMode, drawingForElement, getMousePosition, drawing.isDrawing, drawing.points, zoomLevel, finalizePolygon]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Handle drag movement
    if (drag.isDragging) {
      const pos = getMousePosition(e);
      if (!pos) return;
      handleDragMove(pos.x, pos.y);
      return;
    }

    // Para polígono, apenas atualiza a posição atual para preview da linha
    if (drawingMode === 'polygon' && drawing.isDrawing) {
      const pos = getMousePosition(e);
      if (!pos) return;
      setDrawing(prev => ({
        ...prev,
        currentX: pos.x,
        currentY: pos.y,
      }));
      return;
    }

    if (!drawing.isDrawing || drawingMode === 'none') return;

    const pos = getMousePosition(e);
    if (!pos) return;

    if (drawingMode === 'freehand') {
      setDrawing(prev => ({
        ...prev,
        currentX: pos.x,
        currentY: pos.y,
        points: [...prev.points, pos.x, pos.y],
      }));
    } else {
      setDrawing(prev => ({
        ...prev,
        currentX: pos.x,
        currentY: pos.y,
      }));
    }
  }, [drawing.isDrawing, drawingMode, getMousePosition, drag.isDragging, handleDragMove]);

  const handleMouseUp = useCallback(() => {
    // Handle drag finish
    if (drag.isDragging) {
      finishDrag();
      return;
    }

    // Polígono não finaliza no mouseUp - apenas no clique do primeiro ponto
    if (drawingMode === 'polygon') return;

    if (!drawing.isDrawing || drawingMode === 'none' || !drawingForElement || !activeBlock) return;

    let region: ElementRegion;

    if (drawingMode === 'rect') {
      const x = Math.min(drawing.startX, drawing.currentX);
      const y = Math.min(drawing.startY, drawing.currentY);
      const width = Math.abs(drawing.currentX - drawing.startX);
      const height = Math.abs(drawing.currentY - drawing.startY);

      // Minimum size check
      if (width < 10 || height < 10) {
        cancelDrawing();
        return;
      }

      region = {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
        shape: 'rect',
      };
    } else {
      // Freehand - apply smoothing and calculate bounding box
      if (drawing.points.length < 6) {
        cancelDrawing();
        return;
      }

      // Apply path smoothing for better curves
      const smoothedPoints = processFreehandPath(drawing.points, 3, 0.5);
      const bbox = calculateBoundingBox(smoothedPoints);

      // Minimum size check
      if (bbox.width < 10 || bbox.height < 10) {
        cancelDrawing();
        return;
      }

      region = {
        x: Math.round(bbox.x),
        y: Math.round(bbox.y),
        width: Math.round(bbox.width),
        height: Math.round(bbox.height),
        shape: 'freehand',
        points: smoothedPoints.map(p => Math.round(p)),
      };
    }

    // Debug: log saved region with comprehensive dimension info
    const imgRect = imageRef.current?.getBoundingClientRect();
    const naturalWidth = imageRef.current?.naturalWidth;
    const naturalHeight = imageRef.current?.naturalHeight;
    console.log('[PreviewValidation] Saving region:', {
      region,
      storedImageDimensions: {
        width: activeBlock.image?.width,
        height: activeBlock.image?.height,
      },
      naturalImageDimensions: {
        width: naturalWidth,
        height: naturalHeight,
      },
      renderedDimensions: {
        width: imgRect?.width,
        height: imgRect?.height,
      },
      zoomLevel,
      expectedRenderedWidth: activeBlock.image ? activeBlock.image.width * (zoomLevel / 100) : 0,
      scaleUsedForConversion: imgRect ? imgRect.width / (activeBlock.image?.width || 1) : 0,
      dimensionMismatch: naturalWidth !== activeBlock.image?.width || naturalHeight !== activeBlock.image?.height,
    });

    // WARN if there's a dimension mismatch - this would cause coordinate errors!
    if (naturalWidth && activeBlock.image && (naturalWidth !== activeBlock.image.width || naturalHeight !== activeBlock.image.height)) {
      console.error('[PreviewValidation] DIMENSION MISMATCH! Stored dimensions do not match actual image!', {
        stored: { width: activeBlock.image.width, height: activeBlock.image.height },
        actual: { width: naturalWidth, height: naturalHeight },
      });
    }

    // Save the region
    onSetElementRegion(activeBlock.id, drawingForElement, region);

    // Reset drawing state
    cancelDrawing();
  }, [drawing, drawingMode, drawingForElement, activeBlock, onSetElementRegion, drag.isDragging, finishDrag]);

  // Helper to check if element has a valid region (respecting ignore toggle)
  const hasValidRegion = (element: ImageBlock['timeline'][0]) => {
    if (!element.region) return false;
    if (ignoreAutoDetections && element.regionSource === 'auto') return false;
    return true;
  };

  const getElementColor = (index: number) => {
    return ELEMENT_COLORS[index % ELEMENT_COLORS.length];
  };

  const getElementStatus = (element: ImageBlock['timeline'][0]) => {
    if (!element.region) {
      return { label: 'Não detectado', style: styles.statusMissing };
    }
    if (ignoreAutoDetections && element.regionSource === 'auto') {
      return { label: 'Ignorado (auto)', style: styles.statusMissing };
    }
    if (element.regionSource === 'auto') {
      return { label: 'Auto-detectado', style: styles.statusDetected };
    }
    return { label: 'Manual', style: styles.statusManual };
  };

  const allElementsHaveRegions = imageBlocks.every((block) =>
    block.timeline.every((el) => hasValidRegion(el))
  );

  const missingCount = imageBlocks.reduce(
    (acc, block) => acc + block.timeline.filter((el) => !hasValidRegion(el)).length,
    0
  );

  // Render drawing preview
  const renderDrawingPreview = () => {
    if (!drawing.isDrawing || drawingMode === 'none' || !activeBlock?.image || !imageRef.current) return null;

    // Use natural dimensions from the actual image element for consistency
    // This ensures the preview matches exactly what will be saved
    const imgWidth = imageRef.current.naturalWidth || activeBlock.image.width;
    const imgHeight = imageRef.current.naturalHeight || activeBlock.image.height;
    const scaleX = 100 / imgWidth;
    const scaleY = 100 / imgHeight;

    if (drawingMode === 'rect') {
      const x = Math.min(drawing.startX, drawing.currentX);
      const y = Math.min(drawing.startY, drawing.currentY);
      const width = Math.abs(drawing.currentX - drawing.startX);
      const height = Math.abs(drawing.currentY - drawing.startY);

      return (
        <div
          style={{
            ...styles.drawingPreview,
            left: `${x * scaleX}%`,
            top: `${y * scaleY}%`,
            width: `${width * scaleX}%`,
            height: `${height * scaleY}%`,
          }}
        />
      );
    }

    if (drawingMode === 'freehand' && drawing.points.length >= 4) {
      // Create SVG path for freehand
      let pathD = `M ${drawing.points[0] * scaleX} ${drawing.points[1] * scaleY}`;
      for (let i = 2; i < drawing.points.length; i += 2) {
        pathD += ` L ${drawing.points[i] * scaleX} ${drawing.points[i + 1] * scaleY}`;
      }

      return (
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
          viewBox={`0 0 100 ${(imgHeight / imgWidth) * 100}`}
          preserveAspectRatio="none"
        >
          <path
            d={pathD}
            fill="rgba(124, 58, 237, 0.2)"
            stroke="#7c3aed"
            strokeWidth="0.5"
            strokeDasharray="2,2"
          />
        </svg>
      );
    }

    // Modo polígono: mostra pontos conectados + linha para o cursor
    if (drawingMode === 'polygon' && drawing.points.length >= 2) {
      const viewBoxHeight = (imgHeight / imgWidth) * 100;

      // Pontos já adicionados
      let pathD = `M ${drawing.points[0] * scaleX} ${drawing.points[1] * scaleY}`;
      for (let i = 2; i < drawing.points.length; i += 2) {
        pathD += ` L ${drawing.points[i] * scaleX} ${drawing.points[i + 1] * scaleY}`;
      }
      // Linha do último ponto ao cursor atual
      pathD += ` L ${drawing.currentX * scaleX} ${drawing.currentY * scaleY}`;

      // Verifica se o cursor está perto do primeiro ponto (para mostrar indicador de fechar)
      const firstX = drawing.points[0];
      const firstY = drawing.points[1];
      const distanceToFirst = Math.sqrt(
        Math.pow(drawing.currentX - firstX, 2) + Math.pow(drawing.currentY - firstY, 2)
      );
      const adjustedThreshold = POLYGON_CLOSE_THRESHOLD / (zoomLevel / 100);
      const canClose = drawing.points.length >= 6 && distanceToFirst < adjustedThreshold;

      return (
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
          viewBox={`0 0 100 ${viewBoxHeight}`}
          preserveAspectRatio="none"
        >
          {/* Área preenchida (se tiver 3+ pontos) */}
          {drawing.points.length >= 6 && (
            <path
              d={pathD + ' Z'}
              fill="rgba(124, 58, 237, 0.15)"
              stroke="none"
            />
          )}
          {/* Linhas do polígono */}
          <path
            d={pathD}
            fill="none"
            stroke="#7c3aed"
            strokeWidth="0.3"
            strokeDasharray={canClose ? 'none' : '1,1'}
          />
          {/* Pontos/vértices */}
          {(() => {
            const vertices = [];
            for (let i = 0; i < drawing.points.length; i += 2) {
              const isFirst = i === 0;
              vertices.push(
                <circle
                  key={i}
                  cx={drawing.points[i] * scaleX}
                  cy={drawing.points[i + 1] * scaleY}
                  r={isFirst && canClose ? '1.5' : '0.8'}
                  fill={isFirst ? (canClose ? '#22c55e' : '#7c3aed') : '#7c3aed'}
                  stroke={isFirst && canClose ? '#22c55e' : 'white'}
                  strokeWidth="0.2"
                />
              );
            }
            return vertices;
          })()}
          {/* Indicador de fechar polígono */}
          {canClose && (
            <text
              x={firstX * scaleX}
              y={firstY * scaleY - 2}
              textAnchor="middle"
              fill="#22c55e"
              fontSize="2"
              fontWeight="600"
            >
              Clique para fechar
            </text>
          )}
        </svg>
      );
    }

    return null;
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.title}>Validação do Preview</div>
        <div style={styles.subtitle}>
          Verifique se os elementos foram detectados corretamente. Clique em "Desenhar" para ajustar manualmente.
          {missingCount > 0 && (
            <span style={{ color: '#ef4444' }}>
              {' '}
              ({missingCount} elemento(s) sem região definida)
            </span>
          )}
        </div>
      </div>

      {/* Global toggle to ignore auto-detections */}
      <div
        style={{
          ...styles.globalToggle,
          ...(ignoreAutoDetections ? styles.globalToggleActive : {}),
        }}
        onClick={() => setIgnoreAutoDetections(!ignoreAutoDetections)}
      >
        <input
          type="checkbox"
          style={styles.globalToggleCheckbox}
          checked={ignoreAutoDetections}
          onChange={(e) => setIgnoreAutoDetections(e.target.checked)}
          onClick={(e) => e.stopPropagation()}
        />
        <div style={styles.globalToggleLabel}>
          <div
            style={{
              ...styles.globalToggleTitle,
              ...(ignoreAutoDetections ? styles.globalToggleTitleActive : {}),
            }}
          >
            ✏️ Ignorar detecções automáticas
          </div>
          <div style={styles.globalToggleDescription}>
            Trata todas as regiões auto-detectadas como não detectadas, forçando marcação manual
          </div>
        </div>
      </div>

      <div style={styles.blockNav}>
        {imageBlocks.map((block, idx) => (
          <button
            key={block.id}
            style={{
              ...styles.blockNavButton,
              ...(idx === activeBlockIndex ? styles.blockNavButtonActive : {}),
            }}
            onClick={() => {
              setActiveBlockIndex(idx);
              cancelDrawing();
            }}
          >
            Imagem {idx + 1}
            {block.timeline.some((el) => !hasValidRegion(el)) && (
              <span style={{ color: '#ef4444', marginLeft: '4px' }}>●</span>
            )}
          </button>
        ))}
      </div>

      {activeBlock && (
        <div style={styles.previewContainer}>
          <div style={styles.imageContainer}>
            {/* Controls bar */}
            <div style={styles.controlsBar}>
              {/* Zoom controls */}
              <div style={styles.zoomControls}>
                <button
                  style={styles.controlButton}
                  onClick={handleZoomOut}
                  title="Diminuir zoom"
                >
                  −
                </button>
                <div style={styles.zoomLabel}>{zoomLevel}%</div>
                <button
                  style={styles.controlButton}
                  onClick={handleZoomIn}
                  title="Aumentar zoom"
                >
                  +
                </button>
                <button
                  style={styles.controlButton}
                  onClick={handleZoomFit}
                  title="Ajustar na tela"
                >
                  Fit
                </button>
                <button
                  style={styles.controlButton}
                  onClick={handleZoom100}
                  title="Tamanho real"
                >
                  100%
                </button>
              </div>

              {/* Drawing controls (shown when drawing mode is active) */}
              {drawingMode !== 'none' && (
                <div style={styles.drawingControls}>
                  <button
                    style={{
                      ...styles.controlButton,
                      ...(drawingMode === 'rect' ? styles.controlButtonActive : {}),
                    }}
                    onClick={() => setDrawingMode('rect')}
                    title="Desenhar retângulo"
                  >
                    ▢ Rect
                  </button>
                  <button
                    style={{
                      ...styles.controlButton,
                      ...(drawingMode === 'freehand' ? styles.controlButtonActive : {}),
                    }}
                    onClick={() => setDrawingMode('freehand')}
                    title="Desenhar livre"
                  >
                    ✎ Livre
                  </button>
                  <button
                    style={{
                      ...styles.controlButton,
                      background: 'rgba(239, 68, 68, 0.5)',
                    }}
                    onClick={cancelDrawing}
                    title="Cancelar desenho"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {activeBlock.image && (
              <div
                ref={imageWrapperRef}
                style={{
                  ...styles.imageWrapper,
                  transform: `scale(${zoomLevel / 100})`,
                  transformOrigin: 'top left',
                  cursor: drag.isDragging ? 'grabbing' : drawingMode !== 'none' ? 'crosshair' : 'default',
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <img
                  ref={imageRef}
                  src={activeBlock.image.url}
                  alt={`Imagem ${activeBlockIndex + 1}`}
                  style={styles.image}
                  draggable={false}
                />

                {/* Render existing regions */}
                {activeBlock.timeline.map((element, idx) => {
                  // Skip if no valid region (respecting ignore toggle)
                  if (!hasValidRegion(element) || !element.region) return null;

                  const color = getElementColor(idx);
                  const isHovered = hoveredElement === element.id;
                  const isSelected = selectedElement === element.id;
                  const isBeingRedrawn = drawingForElement === element.id;

                  // Don't show region if being redrawn
                  if (isBeingRedrawn && drawing.isDrawing) return null;

                  // Use natural dimensions from the actual image element for consistency
                  // This ensures regions display in the same coordinate system they were saved in
                  const imgWidth = imageRef.current?.naturalWidth || activeBlock.image!.width;
                  const imgHeight = imageRef.current?.naturalHeight || activeBlock.image!.height;
                  const scaleX = 100 / imgWidth;
                  const scaleY = 100 / imgHeight;

                  const region = element.region;
                  const isDraggingThis = drag.isDragging && drag.elementId === element.id;

                  // Handler para iniciar drag
                  const handleRegionMouseDown = (e: React.MouseEvent) => {
                    if (drawingMode !== 'none') return; // Não arrasta se estiver no modo desenho
                    e.preventDefault();
                    e.stopPropagation();
                    const pos = getMousePosition(e);
                    if (pos) {
                      startDrag(element.id, pos.x, pos.y, region);
                    }
                  };

                  // For freehand/polygon, render SVG shape
                  if ((region.shape === 'freehand' || region.shape === 'polygon') && region.points && region.points.length >= 6) {
                    // Build SVG polygon points
                    const svgPoints: string[] = [];
                    for (let i = 0; i < region.points.length; i += 2) {
                      const px = region.points[i] * scaleX;
                      const py = region.points[i + 1] * scaleY;
                      svgPoints.push(`${px},${py}`);
                    }

                    return (
                      <svg
                        key={element.id}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          pointerEvents: drawingMode !== 'none' ? 'none' : 'auto',
                          cursor: isDraggingThis ? 'grabbing' : 'grab',
                        }}
                        viewBox={`0 0 100 ${(imgHeight / imgWidth) * 100}`}
                        preserveAspectRatio="none"
                        onMouseEnter={() => setHoveredElement(element.id)}
                        onMouseLeave={() => !drag.isDragging && setHoveredElement(null)}
                        onMouseDown={handleRegionMouseDown}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!drag.isDragging) {
                            setSelectedElement(
                              selectedElement === element.id ? null : element.id
                            );
                          }
                        }}
                      >
                        <polygon
                          points={svgPoints.join(' ')}
                          fill={isHovered || isSelected || isDraggingThis ? `${color}33` : 'transparent'}
                          stroke={color}
                          strokeWidth="0.3"
                          style={{ cursor: isDraggingThis ? 'grabbing' : 'grab' }}
                        />
                        {/* Number badge */}
                        <circle
                          cx={region.x * scaleX + 2}
                          cy={region.y * scaleY + 2}
                          r="2"
                          fill={color}
                        />
                        <text
                          x={region.x * scaleX + 2}
                          y={region.y * scaleY + 2.8}
                          textAnchor="middle"
                          fill="white"
                          fontSize="2"
                          fontWeight="600"
                        >
                          {idx + 1}
                        </text>
                      </svg>
                    );
                  }

                  // For rect/ellipse, use div overlay
                  return (
                    <div
                      key={element.id}
                      style={{
                        ...styles.elementOverlay,
                        left: `${region.x * scaleX}%`,
                        top: `${region.y * scaleY}%`,
                        width: `${region.width * scaleX}%`,
                        height: `${region.height * scaleY}%`,
                        borderColor: color,
                        borderRadius: region.shape === 'ellipse' ? '50%' : '4px',
                        background:
                          isHovered || isSelected || isDraggingThis
                            ? `${color}33`
                            : 'transparent',
                        pointerEvents: drawingMode !== 'none' ? 'none' : 'auto',
                        cursor: isDraggingThis ? 'grabbing' : 'grab',
                      }}
                      onMouseEnter={() => setHoveredElement(element.id)}
                      onMouseLeave={() => !drag.isDragging && setHoveredElement(null)}
                      onMouseDown={handleRegionMouseDown}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!drag.isDragging) {
                          setSelectedElement(
                            selectedElement === element.id ? null : element.id
                          );
                        }
                      }}
                    >
                      <div
                        style={{
                          ...styles.elementNumber,
                          background: color,
                        }}
                      >
                        {idx + 1}
                      </div>
                    </div>
                  );
                })}

                {/* Render drawing preview */}
                {renderDrawingPreview()}
              </div>
            )}
          </div>

          <div style={styles.sidebar}>
            <div style={styles.sidebarHeader}>
              <div style={styles.sidebarTitle}>
                Timeline - Imagem {activeBlockIndex + 1}
              </div>
              <div style={styles.sidebarSubtitle}>
                {formatTime(activeBlock.startTime)} →{' '}
                {formatTime(activeBlock.endTime)}
              </div>
            </div>

            {/* Drawing/Drag instructions */}
            {drawingMode !== 'none' && drawingForElement ? (
              <div style={styles.drawingInstructions}>
                {drawingMode === 'rect'
                  ? '🖱️ Clique e arraste para desenhar um retângulo'
                  : drawingMode === 'polygon'
                  ? '📍 Clique para adicionar pontos. Clique no primeiro ponto para fechar.'
                  : '✎ Clique e arraste para desenhar à mão livre'}
              </div>
            ) : drag.isDragging ? (
              <div style={styles.drawingInstructions}>
                ✋ Arrastando elemento... Solte para posicionar.
              </div>
            ) : (
              <div style={{...styles.drawingInstructions, background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e'}}>
                💡 Dica: Arraste as marcações para reposicioná-las, ou use os botões para redesenhar.
              </div>
            )}

            <div style={styles.timelineList}>
              {activeBlock.timeline.map((element, idx) => {
                const color = getElementColor(idx);
                const status = getElementStatus(element);
                const isHovered = hoveredElement === element.id;
                const isSelected = selectedElement === element.id;
                const isDrawingThis = drawingForElement === element.id;

                return (
                  <div
                    key={element.id}
                    style={{
                      ...styles.timelineItem,
                      ...(isHovered ? styles.timelineItemHover : {}),
                      ...(isSelected ? styles.timelineItemActive : {}),
                      ...(isDrawingThis ? styles.timelineItemDrawing : {}),
                    }}
                    onMouseEnter={() => setHoveredElement(element.id)}
                    onMouseLeave={() => setHoveredElement(null)}
                    onClick={() =>
                      setSelectedElement(
                        selectedElement === element.id ? null : element.id
                      )
                    }
                  >
                    <div
                      style={{
                        ...styles.timelineNumber,
                        background: color,
                      }}
                    >
                      {idx + 1}
                    </div>
                    <div style={styles.timelineContent}>
                      <div style={styles.timelineTime}>
                        {formatTime(element.startTime)} →{' '}
                        {formatTime(element.endTime)}
                      </div>
                      <div style={styles.timelineText} title={element.narrationText}>
                        {element.narrationText}
                      </div>
                      <div style={styles.timelineVisual} title={element.elementDescription}>
                        → {element.elementDescription}
                      </div>
                      <span style={{ ...styles.timelineStatus, ...status.style }}>
                        {status.label}
                      </span>

                      {/* Action buttons */}
                      <div style={styles.timelineActions}>
                        {/* Botão Retângulo */}
                        <button
                          style={{
                            ...styles.actionButton,
                            ...styles.drawButton,
                            ...(isDrawingThis && drawingMode === 'rect' ? { background: 'rgba(124, 58, 237, 0.6)' } : {}),
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isDrawingThis && drawingMode === 'rect') {
                              cancelDrawing();
                            } else {
                              startDrawingForElement(element.id, 'rect');
                            }
                          }}
                          title="Desenhar retângulo"
                        >
                          {isDrawingThis && drawingMode === 'rect' ? '✕' : '▭'}
                        </button>
                        {/* Botão Polígono */}
                        <button
                          style={{
                            ...styles.actionButton,
                            ...styles.drawButton,
                            ...(isDrawingThis && drawingMode === 'polygon' ? { background: 'rgba(124, 58, 237, 0.6)' } : {}),
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isDrawingThis && drawingMode === 'polygon') {
                              cancelDrawing();
                            } else {
                              startDrawingForElement(element.id, 'polygon');
                            }
                          }}
                          title="Desenhar polígono (clique para adicionar pontos)"
                        >
                          {isDrawingThis && drawingMode === 'polygon' ? '✕' : '⬡'}
                        </button>
                        {/* Botão Limpar */}
                        {element.region && (
                          <button
                            style={{
                              ...styles.actionButton,
                              ...styles.clearButton,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onClearElementRegion(activeBlock.id, element.id);
                            }}
                            title="Limpar região"
                          >
                            🗑️
                          </button>
                        )}
                      </div>

                      {/* Animation configuration */}
                      <div style={styles.animationConfig}>
                        <div style={styles.animationRow}>
                          <span style={styles.animationLabel}>Exibição:</span>
                          <select
                            style={styles.animationSelect}
                            value={element.displayMode || 'normal'}
                            onChange={(e) => {
                              e.stopPropagation();
                              const newDisplayMode = e.target.value as ElementDisplayMode;
                              // Padrão sempre é 'top' (de cima para baixo)
                              const newDirection = element.revealDirection ?? 'top';
                              onUpdateElementAnimation(
                                activeBlock.id,
                                element.id,
                                newDirection,
                                element.revealPercentage ?? 60,
                                newDisplayMode,
                                element.drawingMode
                              );
                            }}
                            onClick={(e) => e.stopPropagation()}
                            disabled={!element.region}
                            title={!element.region ? 'Defina uma região primeiro para usar modo zoom' : 'Modo de exibição do elemento'}
                          >
                            {(Object.keys(ELEMENT_DISPLAY_MODE_LABELS) as ElementDisplayMode[]).map((mode) => (
                              <option key={mode} value={mode}>
                                {ELEMENT_DISPLAY_MODE_LABELS[mode]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div style={styles.animationRow}>
                          <span style={styles.animationLabel}>Animação:</span>
                          <select
                            style={styles.animationSelect}
                            value={element.revealDirection || 'top'}
                            onChange={(e) => {
                              e.stopPropagation();
                              onUpdateElementAnimation(
                                activeBlock.id,
                                element.id,
                                e.target.value as RevealDirection,
                                element.revealPercentage ?? 60,
                                element.displayMode ?? 'normal',
                                element.drawingMode
                              );
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {(Object.keys(REVEAL_DIRECTION_LABELS) as RevealDirection[]).map((dir) => (
                              <option key={dir} value={dir}>
                                {REVEAL_DIRECTION_LABELS[dir]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div style={styles.animationRow}>
                          <span style={styles.animationLabel}>Reveal %:</span>
                          <select
                            style={styles.animationSelect}
                            value={element.revealPercentage ?? 60}
                            onChange={(e) => {
                              e.stopPropagation();
                              onUpdateElementAnimation(
                                activeBlock.id,
                                element.id,
                                element.revealDirection ?? 'top',
                                parseInt(e.target.value, 10) as RevealPercentage,
                                element.displayMode ?? 'normal',
                                element.drawingMode
                              );
                            }}
                            onClick={(e) => e.stopPropagation()}
                            title="Porcentagem do tempo em que o elemento aparece completamente"
                          >
                            {REVEAL_PERCENTAGE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={styles.legend}>
              <div style={styles.legendItem}>
                <div
                  style={{ ...styles.legendDot, background: '#22c55e' }}
                />
                Auto-detectado
              </div>
              <div style={styles.legendItem}>
                <div
                  style={{ ...styles.legendDot, background: '#fbbf24' }}
                />
                Manual
              </div>
              <div style={styles.legendItem}>
                <div
                  style={{ ...styles.legendDot, background: '#ef4444' }}
                />
                Não detectado
              </div>
            </div>
          </div>
        </div>
      )}

      <button
        style={styles.continueButton}
        onClick={onContinue}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.02)';
          e.currentTarget.style.boxShadow = '0 4px 20px rgba(124, 58, 237, 0.4)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        {allElementsHaveRegions
          ? 'Continuar para Exportação →'
          : `Continuar mesmo assim (${missingCount} elemento(s) sem região) →`}
      </button>
    </div>
  );
};

export default PreviewValidationStep;
