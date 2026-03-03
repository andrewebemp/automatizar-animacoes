import { useReducer, useCallback } from 'react';
import type { Region } from '../types/Region';
import type { VideoConfig } from '../types/VideoConfig';
import type { RevealDirection, DisplayMode } from '../types/VideoSegment';
import type {
  TimelineProject,
  TimelineScene,
  SceneElement,
  ErasedStroke,
} from '../types/TimelineProject';
import {
  createEmptyTimelineProject,
  createTimelineScene,
  createSceneElement,
} from '../types/TimelineProject';

/**
 * Ações do reducer para TimelineProject
 */
type TimelineAction =
  // Audio
  | { type: 'SET_AUDIO'; payload: { url: string; duration: number } }
  // Scenes
  | { type: 'ADD_SCENE'; payload: TimelineScene }
  | { type: 'SET_SCENES'; payload: TimelineScene[] }
  | { type: 'REMOVE_SCENE'; payload: string }
  | { type: 'UPDATE_SCENE'; payload: { sceneId: string; updates: Partial<TimelineScene> } }
  | { type: 'REORDER_SCENES'; payload: TimelineScene[] }
  | { type: 'SET_SCENE_TIMES'; payload: { sceneId: string; startTime: number; endTime: number } }
  // Elements
  | { type: 'ADD_ELEMENT'; payload: { sceneId: string; element: SceneElement } }
  | { type: 'REMOVE_ELEMENT'; payload: { sceneId: string; elementId: string } }
  | { type: 'UPDATE_ELEMENT'; payload: { sceneId: string; elementId: string; updates: Partial<SceneElement> } }
  | { type: 'SET_ELEMENT_REGION'; payload: { sceneId: string; elementId: string; region: Region } }
  | { type: 'SET_ELEMENT_TIMES'; payload: { sceneId: string; elementId: string; startTime: number; endTime: number } }
  // Erased strokes
  | { type: 'ADD_ERASED_STROKE'; payload: { sceneId: string; stroke: ErasedStroke } }
  | { type: 'REMOVE_ERASED_STROKE'; payload: { sceneId: string; strokeId: string } }
  | { type: 'CLEAR_ERASED_STROKES'; payload: { sceneId: string } }
  // Project settings
  | { type: 'SET_VIDEO_CONFIG'; payload: Partial<VideoConfig> }
  | { type: 'SET_BACKGROUND_COLOR'; payload: string }
  | { type: 'SET_SHOW_SUBTITLES'; payload: boolean }
  | { type: 'SET_PROJECT_NAME'; payload: string }
  // Project management
  | { type: 'LOAD_PROJECT'; payload: TimelineProject }
  | { type: 'RESET' };

/**
 * Reducer do projeto Timeline
 */
function timelineReducer(state: TimelineProject, action: TimelineAction): TimelineProject {
  const now = new Date().toISOString();

  switch (action.type) {
    case 'SET_AUDIO': {
      return {
        ...state,
        audioUrl: action.payload.url,
        audioDuration: action.payload.duration,
        updatedAt: now,
      };
    }

    case 'ADD_SCENE': {
      return {
        ...state,
        scenes: [...state.scenes, action.payload],
        updatedAt: now,
      };
    }

    case 'SET_SCENES': {
      return {
        ...state,
        scenes: action.payload,
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
      const { sceneId, updates } = action.payload;
      return {
        ...state,
        scenes: state.scenes.map((scene) =>
          scene.id === sceneId ? { ...scene, ...updates } : scene
        ),
        updatedAt: now,
      };
    }

    case 'REORDER_SCENES': {
      return {
        ...state,
        scenes: action.payload,
        updatedAt: now,
      };
    }

    case 'SET_SCENE_TIMES': {
      const { sceneId, startTime, endTime } = action.payload;
      return {
        ...state,
        scenes: state.scenes.map((scene) =>
          scene.id === sceneId ? { ...scene, startTime, endTime } : scene
        ),
        updatedAt: now,
      };
    }

    case 'ADD_ELEMENT': {
      const { sceneId, element } = action.payload;
      return {
        ...state,
        scenes: state.scenes.map((scene) => {
          if (scene.id !== sceneId) return scene;
          return {
            ...scene,
            elements: [...scene.elements, element],
          };
        }),
        updatedAt: now,
      };
    }

    case 'REMOVE_ELEMENT': {
      const { sceneId, elementId } = action.payload;
      return {
        ...state,
        scenes: state.scenes.map((scene) => {
          if (scene.id !== sceneId) return scene;
          return {
            ...scene,
            elements: scene.elements.filter((e) => e.id !== elementId),
          };
        }),
        updatedAt: now,
      };
    }

    case 'UPDATE_ELEMENT': {
      const { sceneId, elementId, updates } = action.payload;
      return {
        ...state,
        scenes: state.scenes.map((scene) => {
          if (scene.id !== sceneId) return scene;
          return {
            ...scene,
            elements: scene.elements.map((element) =>
              element.id === elementId ? { ...element, ...updates } : element
            ),
          };
        }),
        updatedAt: now,
      };
    }

    case 'SET_ELEMENT_REGION': {
      const { sceneId, elementId, region } = action.payload;
      return {
        ...state,
        scenes: state.scenes.map((scene) => {
          if (scene.id !== sceneId) return scene;
          return {
            ...scene,
            elements: scene.elements.map((element) =>
              element.id === elementId ? { ...element, region } : element
            ),
          };
        }),
        updatedAt: now,
      };
    }

    case 'SET_ELEMENT_TIMES': {
      const { sceneId, elementId, startTime, endTime } = action.payload;
      return {
        ...state,
        scenes: state.scenes.map((scene) => {
          if (scene.id !== sceneId) return scene;
          return {
            ...scene,
            elements: scene.elements.map((element) =>
              element.id === elementId ? { ...element, startTime, endTime } : element
            ),
          };
        }),
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

    case 'SET_PROJECT_NAME': {
      return {
        ...state,
        name: action.payload,
        updatedAt: now,
      };
    }

    case 'LOAD_PROJECT': {
      return action.payload;
    }

    case 'RESET': {
      return createEmptyTimelineProject();
    }

    default:
      return state;
  }
}

/**
 * Hook para gerenciar o estado do projeto Timeline
 */
export function useTimelineProject(initialProject?: TimelineProject) {
  const [project, dispatch] = useReducer(
    timelineReducer,
    initialProject ?? createEmptyTimelineProject()
  );

  // === AUDIO ===
  const setAudio = useCallback((url: string, duration: number) => {
    dispatch({ type: 'SET_AUDIO', payload: { url, duration } });
  }, []);

  // === SCENES ===
  const addScene = useCallback((scene: TimelineScene) => {
    dispatch({ type: 'ADD_SCENE', payload: scene });
  }, []);

  const setScenes = useCallback((scenes: TimelineScene[]) => {
    dispatch({ type: 'SET_SCENES', payload: scenes });
  }, []);

  const removeScene = useCallback((sceneId: string) => {
    dispatch({ type: 'REMOVE_SCENE', payload: sceneId });
  }, []);

  const updateScene = useCallback((sceneId: string, updates: Partial<TimelineScene>) => {
    dispatch({ type: 'UPDATE_SCENE', payload: { sceneId, updates } });
  }, []);

  const reorderScenes = useCallback((scenes: TimelineScene[]) => {
    dispatch({ type: 'REORDER_SCENES', payload: scenes });
  }, []);

  const setSceneTimes = useCallback((sceneId: string, startTime: number, endTime: number) => {
    dispatch({ type: 'SET_SCENE_TIMES', payload: { sceneId, startTime, endTime } });
  }, []);

  /**
   * Cria uma nova cena a partir de uma imagem
   */
  const createScene = useCallback(
    (
      imageUrl: string,
      imageWidth: number,
      imageHeight: number,
      startTime: number,
      endTime: number
    ) => {
      const scene = createTimelineScene(imageUrl, imageWidth, imageHeight, startTime, endTime);
      addScene(scene);
      return scene.id;
    },
    [addScene]
  );

  // === ELEMENTS ===
  const addElement = useCallback((sceneId: string, element: SceneElement) => {
    dispatch({ type: 'ADD_ELEMENT', payload: { sceneId, element } });
  }, []);

  const removeElement = useCallback((sceneId: string, elementId: string) => {
    dispatch({ type: 'REMOVE_ELEMENT', payload: { sceneId, elementId } });
  }, []);

  const updateElement = useCallback(
    (sceneId: string, elementId: string, updates: Partial<SceneElement>) => {
      dispatch({ type: 'UPDATE_ELEMENT', payload: { sceneId, elementId, updates } });
    },
    []
  );

  const setElementRegion = useCallback(
    (sceneId: string, elementId: string, region: Region) => {
      dispatch({ type: 'SET_ELEMENT_REGION', payload: { sceneId, elementId, region } });
    },
    []
  );

  const setElementTimes = useCallback(
    (sceneId: string, elementId: string, startTime: number, endTime: number) => {
      dispatch({ type: 'SET_ELEMENT_TIMES', payload: { sceneId, elementId, startTime, endTime } });
    },
    []
  );

  /**
   * Cria um novo elemento em uma cena
   */
  const createElement = useCallback(
    (sceneId: string, region: Region, startTime: number, endTime: number) => {
      const element = createSceneElement(region, startTime, endTime);
      addElement(sceneId, element);
      return element.id;
    },
    [addElement]
  );

  /**
   * Atualiza configurações de animação de um elemento
   */
  const setElementAnimation = useCallback(
    (
      sceneId: string,
      elementId: string,
      options: {
        revealDirection?: RevealDirection;
        revealFraction?: number;
        displayMode?: DisplayMode;
      }
    ) => {
      updateElement(sceneId, elementId, options);
    },
    [updateElement]
  );

  // === ERASED STROKES ===
  const addErasedStroke = useCallback((sceneId: string, stroke: ErasedStroke) => {
    dispatch({ type: 'ADD_ERASED_STROKE', payload: { sceneId, stroke } });
  }, []);

  const removeErasedStroke = useCallback((sceneId: string, strokeId: string) => {
    dispatch({ type: 'REMOVE_ERASED_STROKE', payload: { sceneId, strokeId } });
  }, []);

  const clearErasedStrokes = useCallback((sceneId: string) => {
    dispatch({ type: 'CLEAR_ERASED_STROKES', payload: { sceneId } });
  }, []);

  // === PROJECT SETTINGS ===
  const setVideoConfig = useCallback((config: Partial<VideoConfig>) => {
    dispatch({ type: 'SET_VIDEO_CONFIG', payload: config });
  }, []);

  const setBackgroundColor = useCallback((color: string) => {
    dispatch({ type: 'SET_BACKGROUND_COLOR', payload: color });
  }, []);

  const setShowSubtitles = useCallback((show: boolean) => {
    dispatch({ type: 'SET_SHOW_SUBTITLES', payload: show });
  }, []);

  const setProjectName = useCallback((name: string) => {
    dispatch({ type: 'SET_PROJECT_NAME', payload: name });
  }, []);

  // === PROJECT MANAGEMENT ===
  const loadProject = useCallback((projectData: TimelineProject) => {
    dispatch({ type: 'LOAD_PROJECT', payload: projectData });
  }, []);

  const resetProject = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  // === HELPERS ===
  const getScene = useCallback(
    (sceneId: string): TimelineScene | undefined => {
      return project.scenes.find((s) => s.id === sceneId);
    },
    [project.scenes]
  );

  const getElement = useCallback(
    (sceneId: string, elementId: string): SceneElement | undefined => {
      const scene = getScene(sceneId);
      return scene?.elements.find((e) => e.id === elementId);
    },
    [getScene]
  );

  /**
   * Retorna a cena ativa para um determinado tempo (em ms)
   */
  const getActiveScene = useCallback(
    (timeMs: number): TimelineScene | undefined => {
      return project.scenes.find(
        (scene) => timeMs >= scene.startTime && timeMs < scene.endTime
      );
    },
    [project.scenes]
  );

  /**
   * Retorna os elementos ativos para um determinado tempo (em ms)
   */
  const getActiveElements = useCallback(
    (timeMs: number): SceneElement[] => {
      const scene = getActiveScene(timeMs);
      if (!scene) return [];

      return scene.elements.filter(
        (element) => timeMs >= element.startTime && timeMs < element.endTime
      );
    },
    [getActiveScene]
  );

  /**
   * Distribui as cenas igualmente pelo áudio
   */
  const distributeSceneTimesEvenly = useCallback(() => {
    if (project.scenes.length === 0 || project.audioDuration === 0) return;

    const duration = project.audioDuration;
    const sceneCount = project.scenes.length;
    const sceneDuration = duration / sceneCount;

    const updatedScenes = project.scenes.map((scene, index) => ({
      ...scene,
      startTime: Math.round(index * sceneDuration),
      endTime: Math.round((index + 1) * sceneDuration),
    }));

    reorderScenes(updatedScenes);
  }, [project.scenes, project.audioDuration, reorderScenes]);

  return {
    // Estado
    project,

    // Audio
    setAudio,

    // Scenes
    addScene,
    setScenes,
    removeScene,
    updateScene,
    reorderScenes,
    setSceneTimes,
    createScene,

    // Elements
    addElement,
    removeElement,
    updateElement,
    setElementRegion,
    setElementTimes,
    createElement,
    setElementAnimation,

    // Erased strokes
    addErasedStroke,
    removeErasedStroke,
    clearErasedStrokes,

    // Project settings
    setVideoConfig,
    setBackgroundColor,
    setShowSubtitles,
    setProjectName,

    // Project management
    loadProject,
    resetProject,

    // Helpers
    getScene,
    getElement,
    getActiveScene,
    getActiveElements,
    distributeSceneTimesEvenly,
  };
}

export type UseTimelineProjectReturn = ReturnType<typeof useTimelineProject>;
