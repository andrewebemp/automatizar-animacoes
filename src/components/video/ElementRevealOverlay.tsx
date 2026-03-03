import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import type { TimelineElement } from '../../types/ImageBlock';

interface ElementRevealOverlayProps {
  element: TimelineElement;
  imageWidth: number;
  imageHeight: number;
  videoWidth: number;
  videoHeight: number;
  /** Reveal duration as fraction (0.6 = 60% of element duration) */
  revealFraction?: number;
}

/**
 * Overlay component that progressively reveals an element region.
 * Uses SVG mask for smooth reveal animation.
 *
 * Reveal logic:
 * - 60% of element duration: reveal animation (opacity 0 -> 1)
 * - 40% remaining: element fully visible
 */
export const ElementRevealOverlay: React.FC<ElementRevealOverlayProps> = ({
  element,
  imageWidth,
  imageHeight,
  videoWidth,
  videoHeight,
  revealFraction = 0.6,
}) => {
  const frame = useCurrentFrame();

  const { region, startFrame, endFrame } = element;

  // If no region defined, use fade-in for entire element
  if (!region) {
    const duration = endFrame - startFrame;
    const revealDuration = Math.floor(duration * revealFraction);
    const revealEndFrame = startFrame + revealDuration;

    const opacity = interpolate(
      frame,
      [startFrame, revealEndFrame],
      [0, 1],
      { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
    );

    return (
      <AbsoluteFill
        style={{
          opacity,
          pointerEvents: 'none',
        }}
      />
    );
  }

  // Calculate reveal progress
  const duration = endFrame - startFrame;
  const revealDuration = Math.floor(duration * revealFraction);
  const revealEndFrame = startFrame + revealDuration;

  const progress = interpolate(
    frame,
    [startFrame, revealEndFrame],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Scale region coordinates to video dimensions
  const scaleX = videoWidth / imageWidth;
  const scaleY = videoHeight / imageHeight;

  const scaledRegion = {
    x: region.x * scaleX,
    y: region.y * scaleY,
    width: region.width * scaleX,
    height: region.height * scaleY,
  };

  // Create reveal mask based on shape
  const renderMask = () => {
    const maskId = `reveal-mask-${element.id}`;

    if (region.shape === 'ellipse') {
      const cx = scaledRegion.x + scaledRegion.width / 2;
      const cy = scaledRegion.y + scaledRegion.height / 2;
      const rx = (scaledRegion.width / 2) * progress;
      const ry = (scaledRegion.height / 2) * progress;

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
        >
          <defs>
            <mask id={maskId}>
              <rect width="100%" height="100%" fill="black" />
              <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="white" />
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="white"
            mask={`url(#${maskId})`}
            opacity={progress}
          />
        </svg>
      );
    }

    // Default: rectangular reveal from left to right
    const revealWidth = scaledRegion.width * progress;

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
      >
        <defs>
          <clipPath id={maskId}>
            <rect
              x={scaledRegion.x}
              y={scaledRegion.y}
              width={revealWidth}
              height={scaledRegion.height}
            />
          </clipPath>
        </defs>
      </svg>
    );
  };

  // Before reveal starts, element is hidden
  if (frame < startFrame) {
    return null;
  }

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {renderMask()}
    </AbsoluteFill>
  );
};

export default ElementRevealOverlay;
