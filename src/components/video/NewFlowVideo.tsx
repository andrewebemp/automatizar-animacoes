import React, { useMemo } from 'react';
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Audio,
  staticFile,
} from 'remotion';
import type { ImageBlock } from '../../types/ImageBlock';
import { ImageBlockRenderer } from './ImageBlockRenderer';

/**
 * Safe Audio component that only renders when audioUrl is valid
 */
const SafeAudio: React.FC<{ src: string | undefined }> = ({ src }) => {
  // Only render if src is a valid non-empty string that looks like a data URL or file path
  if (!src || typeof src !== 'string' || src.length === 0) {
    return null;
  }

  // Check if it's a valid data URL (base64) or file path
  const isDataUrl = src.startsWith('data:audio/') || src.startsWith('data:application/');
  const isFilePath = src.startsWith('file://') || src.startsWith('/') || src.startsWith('http');

  if (!isDataUrl && !isFilePath) {
    console.warn('[SafeAudio] Invalid audio URL format:', src.substring(0, 50));
    return null;
  }

  try {
    return <Audio src={src} />;
  } catch (error) {
    console.error('[SafeAudio] Error rendering audio:', error);
    return null;
  }
};

interface NewFlowVideoProps {
  imageBlocks: ImageBlock[];
  /** Background color for video */
  backgroundColor?: string;
  /** Crossfade duration in frames */
  crossfadeDuration?: number;
  /** Reveal fraction (0.6 = 60% of element time for reveal) */
  revealFraction?: number;
  /** Whether to show subtitle text */
  showSubtitles?: boolean;
  /** Audio URL (base64 data URL or file path) */
  audioUrl?: string;
}

/**
 * Main video composition for the new SRT-first workflow.
 * Renders multiple image blocks with crossfade transitions and
 * progressive element reveal based on subtitle timing.
 *
 * Flow:
 * 1. Each ImageBlock corresponds to an image with multiple elements
 * 2. Elements are revealed progressively as their subtitle timing arrives
 * 3. Crossfade between image blocks when transitioning
 */
export const NewFlowVideo: React.FC<NewFlowVideoProps> = ({
  imageBlocks,
  backgroundColor = '#FFFFFF',
  crossfadeDuration = 15,
  revealFraction = 0.6,
  showSubtitles = false,
  audioUrl,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Sort blocks by start time
  const sortedBlocks = useMemo(() => {
    return [...imageBlocks].sort((a, b) => a.startFrame - b.startFrame);
  }, [imageBlocks]);

  // Find current and next blocks for transitions
  const currentBlockData = useMemo(() => {
    for (let i = 0; i < sortedBlocks.length; i++) {
      const block = sortedBlocks[i];
      const nextBlock = sortedBlocks[i + 1];

      // Check if we're in the crossfade zone
      if (nextBlock) {
        const crossfadeStart = nextBlock.startFrame - crossfadeDuration;

        if (frame >= block.startFrame && frame < crossfadeStart) {
          return { block, index: i };
        }

        if (frame >= crossfadeStart && frame < nextBlock.startFrame) {
          // In crossfade zone
          const fadeProgress = interpolate(
            frame,
            [crossfadeStart, nextBlock.startFrame],
            [0, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
          );

          return {
            block,
            index: i,
            isTransitioning: true,
            nextBlock,
            fadeProgress,
          };
        }
      } else {
        // Last block
        if (frame >= block.startFrame) {
          return { block, index: i };
        }
      }
    }

    // Default to first block if before any start
    if (sortedBlocks.length > 0 && frame < sortedBlocks[0].startFrame) {
      return { block: sortedBlocks[0], index: 0, preStart: true };
    }

    // Default to last block
    if (sortedBlocks.length > 0) {
      return {
        block: sortedBlocks[sortedBlocks.length - 1],
        index: sortedBlocks.length - 1,
      };
    }

    return null;
  }, [frame, sortedBlocks, crossfadeDuration]);

  // If no blocks, show empty
  if (!sortedBlocks.length || !currentBlockData) {
    return (
      <AbsoluteFill style={{ backgroundColor }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#666',
            fontSize: 24,
          }}
        >
          Nenhum bloco de imagem definido
        </div>
      </AbsoluteFill>
    );
  }

  const { block, isTransitioning, nextBlock, fadeProgress, preStart } = currentBlockData;

  // Before first block starts, show background or first frame
  if (preStart) {
    return (
      <AbsoluteFill style={{ backgroundColor }}>
        {block.image && (
          <AbsoluteFill style={{ opacity: 0 }}>
            <ImageBlockRenderer
              block={block}
              revealFraction={revealFraction}
              backgroundColor={backgroundColor}
              showSubtitles={false}
            />
          </AbsoluteFill>
        )}
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor }}>
      {/* Audio track - using SafeAudio wrapper for better error handling */}
      <SafeAudio src={audioUrl} />

      {/* Current block */}
      <AbsoluteFill
        style={{
          opacity: isTransitioning ? 1 - (fadeProgress || 0) : 1,
        }}
      >
        <ImageBlockRenderer
          block={block}
          revealFraction={revealFraction}
          backgroundColor={backgroundColor}
          showSubtitles={showSubtitles && !isTransitioning}
        />
      </AbsoluteFill>

      {/* Next block (during transition) */}
      {isTransitioning && nextBlock && (
        <AbsoluteFill style={{ opacity: fadeProgress }}>
          <ImageBlockRenderer
            block={nextBlock}
            revealFraction={revealFraction}
            backgroundColor={backgroundColor}
            showSubtitles={showSubtitles}
          />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

export default NewFlowVideo;
