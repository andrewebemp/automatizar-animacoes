import { useReducer, useCallback } from 'react';
import type { Subtitle } from '../types/Subtitle';
import type { Region } from '../types/Region';
import type { VideoSegment, RevealDirection, DisplayMode } from '../types/VideoSegment';
import type { ImageScene, ErasedStroke } from '../types/ImageScene';
import type { ProjectNew, VideoConfig } from '../types/ProjectNew';
import { createEmptyProjectNew } from '../types/ProjectNew';
import { createVideoSegment } from '../types/VideoSegment';
import { updateSceneFrames } from '../types/ImageScene';

/**
 * Ações do reducer
 */
type ProjectAction =
  | { type: 'SET_SUBTITLES'; payload: Subtitle[] }
  | { type: 'SET_AUDIO'; payload: string | undefined }
  | { type: 'ADD_SCENE'; payload: ImageScene }
  | { type: 'REMOVE_SCENE'; payload: string }
  | { type: 'UPDATE_SCENE'; payload: { id: string; updates: Partial<ImageScene> } }
  | { type: 'SET_REGION'; payload: { sceneId: string; segmentId: string; region: Region } }
  | { type: 'CLEAR_REGION'; payload: { sceneId: string; segmentId: string } }
  | { type: 'SET_ALL_REGIONS_IN_SCENE'; payload: { sceneId: string; region: Region } }
  | { type: 'CLEAR_ALL_REGIONS_IN_SCENE'; payload: { sceneId: string } }
  | { type: 'SET_ALL_REGIONS_GLOBALLY' }
  | { type: 'CLEAR_ALL_REGIONS_GLOBALLY' }
  | { type: 'UPDATE_SEGMENT'; payload: { sceneId: string; segmentId: string; updates: Partial<VideoSegment> } }
  | { type: 'ADD_SEGMENT'; payload: { sceneId: string; subtitleIndex: number } }
  | { type: 'REMOVE_SEGMENT'; payload: { sceneId: string; segmentId: string } }
  | { type: 'UPDATE_ALL_SEGMENTS'; payload: { displayMode: DisplayMode; revealDirection: RevealDirection; revealFraction: number } }
  | { type: 'ADD_ERASED_STROKE'; payload: { sceneId: string; stroke: ErasedStroke } }
  | { type: 'REMOVE_ERASED_STROKE'; payload: { sceneId: string; strokeId: string } }
  | { type: 'CLEAR_ERASED_STROKES'; payload: { sceneId: string } }
  | { type: 'SET_VIDEO_CONFIG'; payload: Partial<VideoConfig> }
  | { type: 'SET_BACKGROUND_COLOR'; payload: string }
  | { type: 'SET_SHOW_SUBTITLES'; payload: boolean }
  | { type: 'LOAD_PROJECT'; payload: ProjectNew }
  | { type: 'RESET' };

/**
 * Reducer do projeto
 */
function projectReducer(state: ProjectNew, action: ProjectAction): ProjectNew {
  const now = new Date().toISOString();

  switch (action.type) {
    case 'SET_SUBTITLES': {
      return {
        ...state,
        subtitles: action.payload,
        updatedAt: now,
      };
    }

    case 'SET_AUDIO': {
      return {
        ...state,
        audioUrl: action.payload,
        updatedAt: now,
      };
    }

    case 'ADD_SCENE': {
      // Atualiza frames da cena baseado nas legendas
      const sceneWithFrames = updateSceneFrames(action.payload, state.subtitles);

      return {
        ...state,
        scenes: [...state.scenes, sceneWithFrames],
        updatedAt: now,
      };
    }

    case 'REMOVE_SCENE': {
      return {
        ...state,
        scenes: state.scenes.filter((s) => s.id !== action.payload),
        updatedAt: now,
      };
    }

    case 'UPDATE_SCENE': {
      const { id, updates } = action.payload;
      return {
        ...state,
        scenes: state.scenes.map((scene) =>
          scene.id === id ? { ...scene, ...updates } : scene
        ),
        updatedAt: now,
      };
    }

    case 'SET_REGION': {
      const { sceneId, segmentId, region } = action.payload;
      return {
        ...state,
        scenes: state.scenes.map((scene) => {
          if (scene.id !== sceneId) return scene;

          return {
            ...scene,
            segments: scene.segments.map((segment) =>
              segment.id === segmentId ? { ...segment, region } : segment
            ),
          };
        }),
        updatedAt: now,
      };
    }

    case 'CLEAR_REGION': {
      const { sceneId, segmentId } = action.payload;
      return {
        ...state,
        scenes: state.scenes.map((scene) => {
          if (scene.id !== sceneId) return scene;

          return {
            ...scene,
            segments: scene.segments.map((segment) =>
              segment.id === segmentId ? { ...segment, region: null } : segment
            ),
          };
        }),
        updatedAt: now,
      };
    }

    case 'SET_ALL_REGIONS_IN_SCENE': {
      const { sceneId, region } = action.payload;
      return {
        ...state,
        scenes: state.scenes.map((scene) => {
          if (scene.id !== sceneId) return scene;

          return {
            ...scene,
            segments: scene.segments.map((segment) => ({
              ...segment,
              region: {
                ...region,
                id: `region-full-${Date.now()}-${segment.id}`,
              },
            })),
          };
        }),
        updatedAt: now,
      };
    }

    case 'CLEAR_ALL_REGIONS_IN_SCENE': {
      const { sceneId } = action.payload;
      return {
        ...state,
        scenes: state.scenes.map((scene) => {
          if (scene.id !== sceneId) return scene;

          return {
            ...scene,
            segments: scene.segments.map((segment) => ({
              ...segment,
              region: null,
            })),
          };
        }),
        updatedAt: now,
      };
    }

    case 'SET_ALL_REGIONS_GLOBALLY': {
      // Aplica região de imagem inteira a TODOS os segmentos de TODAS as cenas
      return {
        ...state,
        scenes: state.scenes.map((scene) => ({
          ...scene,
          segments: scene.segments.map((segment) => ({
            ...segment,
            region: {
              id: `region-full-${Date.now()}-${segment.id}`,
              pathData: `M 0 0 L ${scene.imageWidth} 0 L ${scene.imageWidth} ${scene.imageHeight} L 0 ${scene.imageHeight} Z`,
              bounds: { x: 0, y: 0, width: scene.imageWidth, height: scene.imageHeight },
              source: 'manual-rect' as const,
            },
          })),
        })),
        updatedAt: now,
      };
    }

    case 'CLEAR_ALL_REGIONS_GLOBALLY': {
      // Remove região de TODOS os segmentos de TODAS as cenas
      return {
        ...state,
        scenes: state.scenes.map((scene) => ({
          ...scene,
          segments: scene.segments.map((segment) => ({
            ...segment,
            region: null,
          })),
        })),
        updatedAt: now,
      };
    }

    case 'UPDATE_SEGMENT': {
      const { sceneId, segmentId, updates } = action.payload;
      console.log('[DEBUG UPDATE_SEGMENT] updates:', updates);
      console.log('[DEBUG UPDATE_SEGMENT] updates tem region?', 'region' in updates);
      return {
        ...state,
        scenes: state.scenes.map((scene) => {
          if (scene.id !== sceneId) return scene;

          return {
            ...scene,
            segments: scene.segments.map((segment) =>
              segment.id === segmentId ? { ...segment, ...updates } : segment
            ),
          };
        }),
        updatedAt: now,
      };
    }

    case 'ADD_SEGMENT': {
      const { sceneId, subtitleIndex } = action.payload;
      const newSegment = createVideoSegment(subtitleIndex);

      return {
        ...state,
        scenes: state.scenes.map((scene) => {
          if (scene.id !== sceneId) return scene;

          // Insere o segmento na posição correta (ordenado por subtitleIndex)
          const newSegments = [...scene.segments, newSegment].sort(
            (a, b) => a.subtitleIndex - b.subtitleIndex
          );

          return {
            ...scene,
            segments: newSegments,
          };
        }),
        updatedAt: now,
      };
    }

    case 'REMOVE_SEGMENT': {
      const { sceneId, segmentId } = action.payload;
      return {
        ...state,
        scenes: state.scenes.map((scene) => {
          if (scene.id !== sceneId) return scene;

          return {
            ...scene,
            segments: scene.segments.filter((s) => s.id !== segmentId),
          };
        }),
        updatedAt: now,
      };
    }

    case 'UPDATE_ALL_SEGMENTS': {
      const { displayMode, revealDirection, revealFraction } = action.payload;
      return {
        ...state,
        scenes: state.scenes.map((scene) => ({
          ...scene,
          segments: scene.segments.map((segment) => ({
            ...segment,
            displayMode,
            revealDirection,
            revealFraction,
          })),
        })),
        updatedAt: now,
      };
    }

    case 'ADD_ERASED_STROKE': {
      const { sceneId, stroke } = action.payload;
      return {
        ...state,
        scenes: state.scenes.map((scene) => {
          if (scene.id !== sceneId) return scene;
          return {
            ...scene,
            erasedStrokes: [...(scene.erasedStrokes || []), stroke],
          };
        }),
        updatedAt: now,
      };
    }

    case 'REMOVE_ERASED_STROKE': {
      const { sceneId, strokeId } = action.payload;
      return {
        ...state,
        scenes: state.scenes.map((scene) => {
          if (scene.id !== sceneId) return scene;
          return {
            ...scene,
            erasedStrokes: (scene.erasedStrokes || []).filter((s) => s.id !== strokeId),
          };
        }),
        updatedAt: now,
      };
    }

    case 'CLEAR_ERASED_STROKES': {
      const { sceneId } = action.payload;
      return {
        ...state,
        scenes: state.scenes.map((scene) => {
          if (scene.id !== sceneId) return scene;
          return {
            ...scene,
            erasedStrokes: [],
          };
        }),
        updatedAt: now,
      };
    }

    case 'SET_VIDEO_CONFIG': {
      return {
        ...state,
        videoConfig: { ...state.videoConfig, ...action.payload },
        updatedAt: now,
      };
    }

    case 'SET_BACKGROUND_COLOR': {
      return {
        ...state,
        backgroundColor: action.payload,
        updatedAt: now,
      };
    }

    case 'SET_SHOW_SUBTITLES': {
      return {
        ...state,
        showSubtitles: action.payload,
        updatedAt: now,
      };
    }

    case 'LOAD_PROJECT': {
      return action.payload;
    }

    case 'RESET': {
      return createEmptyProjectNew();
    }

    default:
      return state;
  }
}

/**
 * Hook para gerenciar o estado do projeto
 */
export function useProjectNew(initialProject?: ProjectNew) {
  const [project, dispatch] = useReducer(
    projectReducer,
    initialProject ?? createEmptyProjectNew()
  );

  // Ações convenientes
  const setSubtitles = useCallback((subtitles: Subtitle[]) => {
    dispatch({ type: 'SET_SUBTITLES', payload: subtitles });
  }, []);

  const setAudio = useCallback((audioUrl: string | undefined) => {
    dispatch({ type: 'SET_AUDIO', payload: audioUrl });
  }, []);

  const addScene = useCallback((scene: ImageScene) => {
    dispatch({ type: 'ADD_SCENE', payload: scene });
  }, []);

  const removeScene = useCallback((sceneId: string) => {
    dispatch({ type: 'REMOVE_SCENE', payload: sceneId });
  }, []);

  const updateScene = useCallback((id: string, updates: Partial<ImageScene>) => {
    dispatch({ type: 'UPDATE_SCENE', payload: { id, updates } });
  }, []);

  const setRegion = useCallback(
    (sceneId: string, segmentId: string, region: Region) => {
      dispatch({ type: 'SET_REGION', payload: { sceneId, segmentId, region } });
    },
    []
  );

  const clearRegion = useCallback((sceneId: string, segmentId: string) => {
    dispatch({ type: 'CLEAR_REGION', payload: { sceneId, segmentId } });
  }, []);

  const setAllRegionsInScene = useCallback(
    (sceneId: string, region: Region) => {
      dispatch({ type: 'SET_ALL_REGIONS_IN_SCENE', payload: { sceneId, region } });
    },
    []
  );

  const clearAllRegionsInScene = useCallback(
    (sceneId: string) => {
      dispatch({ type: 'CLEAR_ALL_REGIONS_IN_SCENE', payload: { sceneId } });
    },
    []
  );

  const setAllRegionsGlobally = useCallback(() => {
    dispatch({ type: 'SET_ALL_REGIONS_GLOBALLY' });
  }, []);

  const clearAllRegionsGlobally = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL_REGIONS_GLOBALLY' });
  }, []);

  const updateSegment = useCallback(
    (sceneId: string, segmentId: string, updates: Partial<VideoSegment>) => {
      console.log('[useProjectNew updateSegment] CHAMADO com updates:', updates);
      console.log('[useProjectNew updateSegment] updates.region?', 'region' in updates, updates.region);
      dispatch({ type: 'UPDATE_SEGMENT', payload: { sceneId, segmentId, updates } });
    },
    []
  );

  const addSegment = useCallback(
    (sceneId: string, subtitleIndex: number) => {
      dispatch({ type: 'ADD_SEGMENT', payload: { sceneId, subtitleIndex } });
    },
    []
  );

  const removeSegment = useCallback(
    (sceneId: string, segmentId: string) => {
      dispatch({ type: 'REMOVE_SEGMENT', payload: { sceneId, segmentId } });
    },
    []
  );

  const setRevealDirection = useCallback(
    (sceneId: string, segmentId: string, direction: RevealDirection) => {
      dispatch({
        type: 'UPDATE_SEGMENT',
        payload: { sceneId, segmentId, updates: { revealDirection: direction } },
      });
    },
    []
  );

  const updateAllSegments = useCallback(
    (settings: { displayMode: DisplayMode; revealDirection: RevealDirection; revealFraction: number }) => {
      dispatch({ type: 'UPDATE_ALL_SEGMENTS', payload: settings });
    },
    []
  );

  const addErasedStroke = useCallback(
    (sceneId: string, stroke: ErasedStroke) => {
      dispatch({ type: 'ADD_ERASED_STROKE', payload: { sceneId, stroke } });
    },
    []
  );

  const removeErasedStroke = useCallback(
    (sceneId: string, strokeId: string) => {
      dispatch({ type: 'REMOVE_ERASED_STROKE', payload: { sceneId, strokeId } });
    },
    []
  );

  const clearErasedStrokes = useCallback(
    (sceneId: string) => {
      dispatch({ type: 'CLEAR_ERASED_STROKES', payload: { sceneId } });
    },
    []
  );

  const setVideoConfig = useCallback((config: Partial<VideoConfig>) => {
    dispatch({ type: 'SET_VIDEO_CONFIG', payload: config });
  }, []);

  const setBackgroundColor = useCallback((color: string) => {
    dispatch({ type: 'SET_BACKGROUND_COLOR', payload: color });
  }, []);

  const setShowSubtitles = useCallback((show: boolean) => {
    dispatch({ type: 'SET_SHOW_SUBTITLES', payload: show });
  }, []);

  const loadProject = useCallback((projectData: ProjectNew) => {
    dispatch({ type: 'LOAD_PROJECT', payload: projectData });
  }, []);

  const resetProject = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  // Helpers
  const getSegmentSubtitle = useCallback(
    (segment: VideoSegment): Subtitle | undefined => {
      return project.subtitles[segment.subtitleIndex];
    },
    [project.subtitles]
  );

  const getSceneSegments = useCallback(
    (sceneId: string): VideoSegment[] => {
      const scene = project.scenes.find((s) => s.id === sceneId);
      return scene?.segments ?? [];
    },
    [project.scenes]
  );

  /**
   * Cria uma nova cena a partir de uma imagem
   * Automaticamente cria segmentos para as legendas especificadas
   */
  const createSceneFromImage = useCallback(
    (
      imageUrl: string,
      imageWidth: number,
      imageHeight: number,
      subtitleIndices: number[]
    ) => {
      const segments: VideoSegment[] = subtitleIndices.map((index) =>
        createVideoSegment(index)
      );

      const scene: ImageScene = {
        id: `scene-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        imageUrl,
        imageWidth,
        imageHeight,
        segments,
        startFrame: 0,
        endFrame: 0,
      };

      addScene(scene);
      return scene.id;
    },
    [addScene]
  );

  return {
    // Estado
    project,

    // Ações principais
    setSubtitles,
    setAudio,
    addScene,
    removeScene,
    updateScene,
    setRegion,
    clearRegion,
    setAllRegionsInScene,
    clearAllRegionsInScene,
    setAllRegionsGlobally,
    clearAllRegionsGlobally,
    updateSegment,
    addSegment,
    removeSegment,
    setRevealDirection,
    updateAllSegments,
    addErasedStroke,
    removeErasedStroke,
    clearErasedStrokes,
    setVideoConfig,
    setBackgroundColor,
    setShowSubtitles,
    loadProject,
    resetProject,

    // Helpers
    getSegmentSubtitle,
    getSceneSegments,
    createSceneFromImage,
  };
}

export type UseProjectNewReturn = ReturnType<typeof useProjectNew>;
