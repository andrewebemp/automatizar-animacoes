import React from 'react';
import { AbsoluteFill } from 'remotion';

interface SubtitleOverlayProps {
  text: string;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  backgroundColor?: string;
  bottom?: number;
  padding?: number;
}

/**
 * Exibe a legenda no vídeo.
 */
export const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({
  text,
  fontSize = 48,
  fontFamily = 'Arial, sans-serif',
  color = '#FFFFFF',
  backgroundColor = 'rgba(0, 0, 0, 0.7)',
  bottom = 80,
  padding = 16,
}) => {
  if (!text) return null;

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: bottom,
      }}
    >
      <div
        style={{
          backgroundColor,
          padding: `${padding}px ${padding * 2}px`,
          borderRadius: 8,
          maxWidth: '80%',
          textAlign: 'center',
        }}
      >
        <span
          style={{
            fontSize,
            fontFamily,
            color,
            lineHeight: 1.4,
          }}
        >
          {text}
        </span>
      </div>
    </AbsoluteFill>
  );
};
