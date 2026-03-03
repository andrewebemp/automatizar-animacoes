import React, { useMemo } from 'react';
import {
  AbsoluteFill,
  Img,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from 'remotion';
import type { ImageBlock, RevealDirection, TimelineElement, ElementRegion } from '../../types/ImageBlock';

interface ImageBlockRendererProps {
  block: ImageBlock;
  /** Fraction of element duration for reveal (0.6 = 60%) */
  revealFraction?: number;
  /** Background color */
  backgroundColor?: string;
  /** Whether to show subtitle text */
  showSubtitles?: boolean;
}

interface ElementState {
  element: TimelineElement;
  opacity: number;
  maskProgress: number;
  isVisible: boolean;
  isRevealing: boolean;
  revealDirection: Exclude<RevealDirection, 'auto'>;
}

/**
 * Renders a single image block with progressive element reveal.
 *
 * NEW ARCHITECTURE: Accumulated Mask System
 * - All visible regions are combined into a SINGLE accumulated mask
 * - This ensures overlapping elements show the image (not background)
 * - Each element's region is added to the mask as it becomes visible
 */
export const ImageBlockRenderer: React.FC<ImageBlockRendererProps> = ({
  block,
  revealFraction = 0.6,
  backgroundColor = '#FFFFFF',
  showSubtitles = false,
}) => {
  const frame = useCurrentFrame();
  const { width: videoWidth, height: videoHeight } = useVideoConfig();

  const { image, timeline } = block;

  // Calculate which elements are visible and their reveal progress
  const elementStates = useMemo((): ElementState[] => {
    return timeline.map((element) => {
      const duration = element.endFrame - element.startFrame;
      const elementRevealFraction = element.revealPercentage !== undefined
        ? element.revealPercentage / 100
        : revealFraction;
      const revealDuration = Math.floor(duration * elementRevealFraction);
      const revealEndFrame = element.startFrame + revealDuration;

      let opacity = 0;
      let maskProgress = 0;

      if (frame >= element.startFrame) {
        if (frame < revealEndFrame && revealDuration > 0) {
          const progress = interpolate(
            frame,
            [element.startFrame, revealEndFrame],
            [0, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
          );
          opacity = progress;
          maskProgress = progress;
        } else {
          opacity = 1;
          maskProgress = 1;
        }
      }

      let direction: Exclude<RevealDirection, 'auto'> = 'top';
      if (element.region && image) {
        if (element.revealDirection && element.revealDirection !== 'auto') {
          direction = element.revealDirection;
        }
      }

      return {
        element,
        opacity,
        maskProgress,
        isVisible: frame >= element.startFrame,
        isRevealing: frame >= element.startFrame && frame < revealEndFrame,
        revealDirection: direction,
      };
    });
  }, [frame, timeline, revealFraction, image]);

  // Get current subtitle text
  const currentSubtitle = useMemo(() => {
    const active = timeline.find(
      (el) => frame >= el.startFrame && frame < el.endFrame
    );
    return active?.narrationText || '';
  }, [frame, timeline]);

  // Check if there's a zoom element currently active
  const currentZoomElement = useMemo(() => {
    return timeline.find(
      (el) => el.displayMode === 'zoom' &&
              el.region &&
              frame >= el.startFrame &&
              frame < el.endFrame
    );
  }, [frame, timeline]);

  const currentZoomState = useMemo(() => {
    if (!currentZoomElement) return null;
    return elementStates.find(s => s.element.id === currentZoomElement.id);
  }, [currentZoomElement, elementStates]);

  const hasRegions = timeline.some((el) => el.region);

  const overallOpacity = useMemo(() => {
    if (hasRegions) return 1;
    const firstVisible = elementStates.find((s) => s.isVisible);
    return firstVisible?.opacity || 0;
  }, [elementStates, hasRegions]);

  // CORREÇÃO DEFINITIVA: Garante que image e suas propriedades existem
  // Usa valores de fallback se necessário para evitar crash
  const safeImage = {
    url: image?.url || '',
    width: (typeof image?.width === 'number' && image.width > 0) ? image.width : 1920,
    height: (typeof image?.height === 'number' && image.height > 0) ? image.height : 1080,
  };

  // Log se houve correção
  if (!image || image.width !== safeImage.width || image.height !== safeImage.height) {
    console.warn('[ImageBlockRenderer] Usando valores de fallback para imagem:', {
      blockId: block.id,
      original: { url: image?.url?.substring(0, 30), width: image?.width, height: image?.height },
      safe: { url: safeImage.url.substring(0, 30), width: safeImage.width, height: safeImage.height },
    });
  }

  // Se não tem URL de imagem, mostra placeholder
  if (!safeImage.url) {
    return (
      <AbsoluteFill style={{ backgroundColor }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#999',
            fontSize: 24,
          }}
        >
          Imagem não carregada
        </div>
      </AbsoluteFill>
    );
  }

  // Calculate image scaling to fit video - AGORA USA safeImage
  const imageAspect = safeImage.width / safeImage.height;
  const videoAspect = videoWidth / videoHeight;

  let displayWidth: number;
  let displayHeight: number;
  let offsetX = 0;
  let offsetY = 0;

  if (imageAspect > videoAspect) {
    displayWidth = videoWidth;
    displayHeight = videoWidth / imageAspect;
    offsetY = (videoHeight - displayHeight) / 2;
  } else {
    displayHeight = videoHeight;
    displayWidth = videoHeight * imageAspect;
    offsetX = (videoWidth - displayWidth) / 2;
  }

  const scaleX = displayWidth / safeImage.width;
  const scaleY = displayHeight / safeImage.height;

  // If there's a zoom element active, render zoomed view
  if (currentZoomElement && currentZoomElement.region && currentZoomState) {
    const region = currentZoomElement.region;
    const progress = currentZoomState.maskProgress;
    const direction = currentZoomState.revealDirection;

    const targetAspect = videoWidth / videoHeight;
    const regionAspect = region.width / region.height;

    let cropX: number, cropY: number, cropWidth: number, cropHeight: number;

    if (regionAspect > targetAspect) {
      cropWidth = region.width;
      cropHeight = region.width / targetAspect;
      cropX = region.x;
      cropY = region.y - (cropHeight - region.height) / 2;
    } else {
      cropHeight = region.height;
      cropWidth = region.height * targetAspect;
      cropX = region.x - (cropWidth - region.width) / 2;
      cropY = region.y;
    }

    cropX = Math.max(0, Math.min(cropX, safeImage.width - cropWidth));
    cropY = Math.max(0, Math.min(cropY, safeImage.height - cropHeight));

    if (cropX + cropWidth > safeImage.width) {
      cropWidth = safeImage.width - cropX;
    }
    if (cropY + cropHeight > safeImage.height) {
      cropHeight = safeImage.height - cropY;
    }

    const scaleToFill = videoWidth / cropWidth;
    const imgX = -cropX * scaleToFill;
    const imgY = -cropY * scaleToFill;
    const imgWidth = safeImage.width * scaleToFill;
    const imgHeight = safeImage.height * scaleToFill;

    const getMaskRect = () => {
      switch (direction) {
        case 'top':
          return { x: 0, y: 0, width: videoWidth, height: videoHeight * progress };
        case 'bottom':
          return { x: 0, y: videoHeight * (1 - progress), width: videoWidth, height: videoHeight * progress };
        case 'left':
          return { x: 0, y: 0, width: videoWidth * progress, height: videoHeight };
        case 'right':
          return { x: videoWidth * (1 - progress), y: 0, width: videoWidth * progress, height: videoHeight };
        case 'center':
        default:
          const centerX = videoWidth / 2;
          const centerY = videoHeight / 2;
          const revealW = videoWidth * progress;
          const revealH = videoHeight * progress;
          return { x: centerX - revealW / 2, y: centerY - revealH / 2, width: revealW, height: revealH };
      }
    };

    const maskRect = getMaskRect();

    return (
      <AbsoluteFill style={{ backgroundColor }}>
        <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
          <defs>
            <mask id={`zoom-mask-${block.id}-${currentZoomElement.id}`}>
              <rect width="100%" height="100%" fill="black" />
              <rect x={maskRect.x} y={maskRect.y} width={maskRect.width} height={maskRect.height} fill="white" />
            </mask>
          </defs>
          <image
            href={safeImage.url}
            x={imgX}
            y={imgY}
            width={imgWidth}
            height={imgHeight}
            mask={`url(#zoom-mask-${block.id}-${currentZoomElement.id})`}
            preserveAspectRatio="none"
          />
        </svg>
        {showSubtitles && currentSubtitle && (
          <div style={{ position: 'absolute', bottom: 60, left: 0, right: 0, display: 'flex', justifyContent: 'center', padding: '0 40px' }}>
            <div style={{ background: 'rgba(0, 0, 0, 0.75)', color: '#fff', padding: '12px 24px', borderRadius: 8, fontSize: Math.max(18, videoWidth * 0.02), fontFamily: 'Arial, sans-serif', textAlign: 'center', maxWidth: '80%', lineHeight: 1.4 }}>
              {currentSubtitle}
            </div>
          </div>
        )}
      </AbsoluteFill>
    );
  }

  /**
   * Scale region to video coordinates
   */
  const scaleRegion = (region: ElementRegion) => ({
    x: offsetX + region.x * scaleX,
    y: offsetY + region.y * scaleY,
    width: region.width * scaleX,
    height: region.height * scaleY,
  });

  /**
   * Scale points array to video coordinates
   */
  const scalePoints = (points: number[]): string => {
    const scaled: string[] = [];
    for (let i = 0; i < points.length; i += 2) {
      const px = offsetX + points[i] * scaleX;
      const py = offsetY + points[i + 1] * scaleY;
      scaled.push(`${px},${py}`);
    }
    return scaled.join(' ');
  };

  /**
   * Calculate directional reveal clip rectangle based on bounding box
   */
  const getRevealClipRect = (scaledRegion: ReturnType<typeof scaleRegion>, progress: number, direction: Exclude<RevealDirection, 'auto'>) => {
    switch (direction) {
      case 'left':
        return { x: scaledRegion.x, y: scaledRegion.y, width: scaledRegion.width * progress, height: scaledRegion.height };
      case 'right':
        return { x: scaledRegion.x + scaledRegion.width * (1 - progress), y: scaledRegion.y, width: scaledRegion.width * progress, height: scaledRegion.height };
      case 'top':
        return { x: scaledRegion.x, y: scaledRegion.y, width: scaledRegion.width, height: scaledRegion.height * progress };
      case 'bottom':
        return { x: scaledRegion.x, y: scaledRegion.y + scaledRegion.height * (1 - progress), width: scaledRegion.width, height: scaledRegion.height * progress };
      case 'center':
      default:
        const cX = scaledRegion.x + scaledRegion.width / 2;
        const cY = scaledRegion.y + scaledRegion.height / 2;
        const w = scaledRegion.width * progress;
        const h = scaledRegion.height * progress;
        return { x: cX - w / 2, y: cY - h / 2, width: w, height: h };
    }
  };

  /**
   * Calculate scaled points for a polygon, applying directional reveal clipping.
   * Returns points clipped to the reveal progress area.
   */
  const getClippedPolygonPoints = (
    points: number[],
    scaledRegion: ReturnType<typeof scaleRegion>,
    progress: number,
    direction: Exclude<RevealDirection, 'auto'>
  ): string => {
    // Scale all points to video coordinates
    const scaledPoints: Array<{x: number, y: number}> = [];
    for (let i = 0; i < points.length; i += 2) {
      scaledPoints.push({
        x: offsetX + points[i] * scaleX,
        y: offsetY + points[i + 1] * scaleY,
      });
    }

    // Calculate the clip boundary based on direction and progress
    let clipMinX = scaledRegion.x;
    let clipMaxX = scaledRegion.x + scaledRegion.width;
    let clipMinY = scaledRegion.y;
    let clipMaxY = scaledRegion.y + scaledRegion.height;

    switch (direction) {
      case 'left':
        clipMaxX = scaledRegion.x + scaledRegion.width * progress;
        break;
      case 'right':
        clipMinX = scaledRegion.x + scaledRegion.width * (1 - progress);
        break;
      case 'top':
        clipMaxY = scaledRegion.y + scaledRegion.height * progress;
        break;
      case 'bottom':
        clipMinY = scaledRegion.y + scaledRegion.height * (1 - progress);
        break;
      case 'center':
      default:
        const cX = scaledRegion.x + scaledRegion.width / 2;
        const cY = scaledRegion.y + scaledRegion.height / 2;
        const halfW = (scaledRegion.width * progress) / 2;
        const halfH = (scaledRegion.height * progress) / 2;
        clipMinX = cX - halfW;
        clipMaxX = cX + halfW;
        clipMinY = cY - halfH;
        clipMaxY = cY + halfH;
        break;
    }

    // Clip each point to the boundary (Sutherland-Hodgman style clipping)
    // For simplicity, we'll use a rect clip on the polygon
    const clippedPoints = clipPolygonToRect(scaledPoints, clipMinX, clipMinY, clipMaxX, clipMaxY);

    if (clippedPoints.length < 3) {
      return ''; // Not enough points for a polygon
    }

    return clippedPoints.map(p => `${p.x},${p.y}`).join(' ');
  };

  /**
   * Sutherland-Hodgman polygon clipping algorithm
   * Clips a polygon to a rectangular boundary
   */
  const clipPolygonToRect = (
    polygon: Array<{x: number, y: number}>,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number
  ): Array<{x: number, y: number}> => {
    if (polygon.length < 3) return [];

    let output = [...polygon];

    // Clip against each edge of the rectangle
    // Left edge
    output = clipPolygonToEdge(output, (p) => p.x >= minX, (p1, p2) => {
      const t = (minX - p1.x) / (p2.x - p1.x);
      return { x: minX, y: p1.y + t * (p2.y - p1.y) };
    });

    // Right edge
    output = clipPolygonToEdge(output, (p) => p.x <= maxX, (p1, p2) => {
      const t = (maxX - p1.x) / (p2.x - p1.x);
      return { x: maxX, y: p1.y + t * (p2.y - p1.y) };
    });

    // Top edge
    output = clipPolygonToEdge(output, (p) => p.y >= minY, (p1, p2) => {
      const t = (minY - p1.y) / (p2.y - p1.y);
      return { x: p1.x + t * (p2.x - p1.x), y: minY };
    });

    // Bottom edge
    output = clipPolygonToEdge(output, (p) => p.y <= maxY, (p1, p2) => {
      const t = (maxY - p1.y) / (p2.y - p1.y);
      return { x: p1.x + t * (p2.x - p1.x), y: maxY };
    });

    return output;
  };

  /**
   * Helper for Sutherland-Hodgman: clip polygon against one edge
   */
  const clipPolygonToEdge = (
    polygon: Array<{x: number, y: number}>,
    isInside: (p: {x: number, y: number}) => boolean,
    intersect: (p1: {x: number, y: number}, p2: {x: number, y: number}) => {x: number, y: number}
  ): Array<{x: number, y: number}> => {
    if (polygon.length < 3) return [];

    const output: Array<{x: number, y: number}> = [];

    for (let i = 0; i < polygon.length; i++) {
      const current = polygon[i];
      const next = polygon[(i + 1) % polygon.length];
      const currentInside = isInside(current);
      const nextInside = isInside(next);

      if (currentInside) {
        output.push(current);
        if (!nextInside) {
          output.push(intersect(current, next));
        }
      } else if (nextInside) {
        output.push(intersect(current, next));
      }
    }

    return output;
  };

  /**
   * Render the full shape (for fully revealed elements or inside clip)
   */
  const renderFullShape = (region: ElementRegion, scaledRegion: ReturnType<typeof scaleRegion>): React.ReactNode => {
    if (region.shape === 'ellipse') {
      return (
        <ellipse
          cx={scaledRegion.x + scaledRegion.width / 2}
          cy={scaledRegion.y + scaledRegion.height / 2}
          rx={scaledRegion.width / 2}
          ry={scaledRegion.height / 2}
          fill="white"
        />
      );
    }

    if ((region.shape === 'freehand' || region.shape === 'polygon') && region.points && region.points.length >= 6) {
      const pts = scalePoints(region.points);
      console.log(`[ImageBlockRenderer] renderFullShape POLYGON:`, pts.substring(0, 80) + '...');
      return <polygon points={pts} fill="white" />;
    }

    // Default: rectangle - this means the region was NOT a freehand/polygon OR had no points
    console.log(`[ImageBlockRenderer] renderFullShape RECT FALLBACK:`, {
      shape: region.shape,
      hasPoints: !!region.points,
      pointCount: region.points?.length,
    });
    return (
      <rect
        x={scaledRegion.x}
        y={scaledRegion.y}
        width={scaledRegion.width}
        height={scaledRegion.height}
        fill="white"
      />
    );
  };

  /**
   * Render a single element's mask contribution
   */
  const renderElementMask = (state: ElementState, index: number): React.ReactNode => {
    const { element, maskProgress, revealDirection } = state;
    const region = element.region!;
    const scaledRegion = scaleRegion(region);

    // Debug: Log region details to identify rendering issues
    if (frame === element.startFrame) {
      const isFreehandOrPolygon = (region.shape === 'freehand' || region.shape === 'polygon') && region.points && region.points.length >= 6;
      console.log(`[ImageBlockRenderer] ======= Element ${element.id} Start =======`);
      console.log(`[ImageBlockRenderer] Shape: "${region.shape}", isFreehandOrPolygon: ${isFreehandOrPolygon}`);
      console.log(`[ImageBlockRenderer] Region points: ${region.points ? region.points.length + ' values' : 'NONE'}`);
      if (region.points && region.points.length >= 6) {
        console.log(`[ImageBlockRenderer] First 3 points:`, [
          { x: region.points[0], y: region.points[1] },
          { x: region.points[2], y: region.points[3] },
          { x: region.points[4], y: region.points[5] },
        ]);
      }
      console.log(`[ImageBlockRenderer] Bounding box:`, { x: region.x, y: region.y, width: region.width, height: region.height });
      console.log(`[ImageBlockRenderer] Element regionSource:`, element.regionSource);
      console.log(`[ImageBlockRenderer] =======================================`);
    }

    // Fully revealed - render the full shape
    if (maskProgress >= 1) {
      return (
        <g key={element.id}>
          {renderFullShape(region, scaledRegion)}
        </g>
      );
    }

    // For freehand/polygon shapes, use the polygon with a clip-path for reveal animation
    if ((region.shape === 'freehand' || region.shape === 'polygon') && region.points && region.points.length >= 6) {
      const polygonPoints = scalePoints(region.points);

      // Log polygon rendering for debugging
      console.log(`[ImageBlockRenderer] Rendering POLYGON for element ${element.id}:`, {
        originalPoints: region.points.length,
        scaledPoints: polygonPoints.substring(0, 100) + '...',
        progress: maskProgress,
      });

      // Calculate clip rect that covers the full scaled polygon bounding box
      // We need to expand the clip area to ensure the polygon is fully visible
      const clipRect = getRevealClipRect(scaledRegion, maskProgress, revealDirection);
      const clipId = `reveal-clip-${block.id}-${element.id}-poly`;

      return (
        <g key={element.id}>
          <defs>
            <clipPath id={clipId}>
              <rect x={clipRect.x} y={clipRect.y} width={clipRect.width} height={clipRect.height} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            <polygon points={polygonPoints} fill="white" />
          </g>
        </g>
      );
    }

    // For ellipse, use rect clip-path approach
    if (region.shape === 'ellipse') {
      const clipRect = getRevealClipRect(scaledRegion, maskProgress, revealDirection);
      const clipId = `reveal-clip-${block.id}-${element.id}`;

      return (
        <g key={element.id}>
          <defs>
            <clipPath id={clipId}>
              <rect x={clipRect.x} y={clipRect.y} width={clipRect.width} height={clipRect.height} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            <ellipse
              cx={scaledRegion.x + scaledRegion.width / 2}
              cy={scaledRegion.y + scaledRegion.height / 2}
              rx={scaledRegion.width / 2}
              ry={scaledRegion.height / 2}
              fill="white"
            />
          </g>
        </g>
      );
    }

    // Default: rectangle with rect clip-path
    // This is the FALLBACK case - should only be used for actual rectangles
    console.log(`[ImageBlockRenderer] USING RECTANGLE FALLBACK for element ${element.id}:`, {
      shape: region.shape,
      hasPoints: !!region.points,
      pointCount: region.points?.length,
      reason: region.shape === 'freehand' || region.shape === 'polygon'
        ? `Points too few: ${region.points?.length || 0}`
        : `Shape is ${region.shape}`,
    });

    const clipRect = getRevealClipRect(scaledRegion, maskProgress, revealDirection);
    const clipId = `reveal-clip-${block.id}-${element.id}`;

    return (
      <g key={element.id}>
        <defs>
          <clipPath id={clipId}>
            <rect x={clipRect.x} y={clipRect.y} width={clipRect.width} height={clipRect.height} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <rect
            x={scaledRegion.x}
            y={scaledRegion.y}
            width={scaledRegion.width}
            height={scaledRegion.height}
            fill="white"
          />
        </g>
      </g>
    );
  };

  /**
   * NEW ARCHITECTURE: Accumulated Mask System
   *
   * All visible elements are combined into a SINGLE SVG mask.
   * This ensures that when element 2 overlaps element 1,
   * the overlapping area shows the image (not white background).
   *
   * How it works:
   * 1. Create one <mask> with all visible regions
   * 2. Each region is added as white shapes (fully revealed) or clipped shapes (animating)
   * 3. Apply this single mask to one <image>
   *
   * Benefits:
   * - Overlapping regions show the image correctly
   * - Simpler SVG structure (one image, one mask)
   * - Better performance
   */
  const renderAccumulatedMask = () => {
    // Collect all visible elements with regions
    const visibleStates = elementStates.filter(s => s.isVisible && s.element.region);

    if (visibleStates.length === 0) {
      return null;
    }

    const maskId = `accumulated-mask-${block.id}`;

    return (
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
        }}
      >
        <defs>
          <mask id={maskId}>
            {/* All visible regions are combined here */}
            {visibleStates.map((state, index) => renderElementMask(state, index))}
          </mask>
        </defs>
        <image
          href={safeImage.url}
          x={offsetX}
          y={offsetY}
          width={displayWidth}
          height={displayHeight}
          mask={`url(#${maskId})`}
          preserveAspectRatio="xMidYMid slice"
        />
      </svg>
    );
  };

  return (
    <AbsoluteFill style={{ backgroundColor }}>
      {hasRegions ? (
        renderAccumulatedMask()
      ) : (
        <AbsoluteFill style={{ opacity: overallOpacity }}>
          <Img
            src={safeImage.url}
            style={{
              position: 'absolute',
              left: offsetX,
              top: offsetY,
              width: displayWidth,
              height: displayHeight,
              objectFit: 'cover',
            }}
          />
        </AbsoluteFill>
      )}

      {/* Subtitle overlay */}
      {showSubtitles && currentSubtitle && (
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            padding: '0 40px',
            zIndex: 10,
          }}
        >
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.75)',
              color: '#fff',
              padding: '12px 24px',
              borderRadius: 8,
              fontSize: Math.max(18, videoWidth * 0.02),
              fontFamily: 'Arial, sans-serif',
              textAlign: 'center',
              maxWidth: '80%',
              lineHeight: 1.4,
            }}
          >
            {currentSubtitle}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

export default ImageBlockRenderer;
