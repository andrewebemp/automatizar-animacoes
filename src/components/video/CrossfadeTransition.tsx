import React from 'react';
import { AbsoluteFill, interpolate, Sequence } from 'remotion';

interface CrossfadeTransitionProps {
  children: React.ReactNode;
  startFrame: number;
  durationInFrames: number;
  direction: 'in' | 'out';
}

/**
 * Aplica um efeito de fade in ou fade out em um componente.
 */
export const CrossfadeTransition: React.FC<CrossfadeTransitionProps> = ({
  children,
  startFrame,
  durationInFrames,
  direction,
}) => {
  return (
    <Sequence from={startFrame} durationInFrames={durationInFrames}>
      <FadeWrapper direction={direction} durationInFrames={durationInFrames}>
        {children}
      </FadeWrapper>
    </Sequence>
  );
};

interface FadeWrapperProps {
  children: React.ReactNode;
  direction: 'in' | 'out';
  durationInFrames: number;
}

/**
 * Wrapper que aplica a animação de fade.
 */
const FadeWrapper: React.FC<FadeWrapperProps> = ({
  children,
  direction,
  durationInFrames,
}) => {
  const { useCurrentFrame } = require('remotion');
  const frame = useCurrentFrame();

  const opacity = interpolate(
    frame,
    [0, durationInFrames],
    direction === 'in' ? [0, 1] : [1, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );

  return (
    <AbsoluteFill style={{ opacity }}>
      {children}
    </AbsoluteFill>
  );
};

/**
 * Calcula os frames de transição entre duas cenas.
 *
 * @param scene1EndFrame - Frame final da cena 1
 * @param scene2StartFrame - Frame inicial da cena 2
 * @param crossfadeDuration - Duração do crossfade em frames
 * @returns Objeto com informações de transição
 */
export function calculateCrossfadeFrames(
  scene1EndFrame: number,
  scene2StartFrame: number,
  crossfadeDuration: number
): {
  fadeOutStart: number;
  fadeInStart: number;
  overlapFrames: number;
} {
  // O crossfade começa um pouco antes do fim da cena 1
  const halfDuration = Math.floor(crossfadeDuration / 2);
  const fadeOutStart = scene1EndFrame - halfDuration;
  const fadeInStart = scene2StartFrame - halfDuration;
  const overlapFrames = crossfadeDuration;

  return {
    fadeOutStart,
    fadeInStart,
    overlapFrames,
  };
}
