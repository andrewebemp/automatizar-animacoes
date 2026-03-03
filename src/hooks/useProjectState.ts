import { useReducer, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  ProjectData,
  Scene,
  Element,
  Subtitle,
  VideoConfig,
  RevealStyle,
  ProjectMode,
  WizardStep,
  VideoResolution,
  ImageBlock,
  TimelineElement,
  ElementRegion,
} from '../types';
import { createEmptyProject } from '../types/ProjectData';
import { AspectRatio } from '../types/VideoConfig';

// Tipos de ações
type ProjectAction =
  // Ações existentes (legacy)
  | { type: 'SET_IMAGE'; payload: { url: string; width: number; height: number } }
  | { type: 'SET_SUBTITLES'; payload: Subtitle[] }
  | { type: 'SET_VIDEO_CONFIG'; payload: Partial<VideoConfig> }
  | { type: 'SET_REVEAL_STYLE'; payload: Partial<RevealStyle> }
  | { type: 'ADD_SCENE'; payload: Omit<Scene, 'id' | 'elements'> }
  | { type: 'ADD_SCENE_WITH_IMAGE'; payload: { url: string; width: number; height: number } }
  | { type: 'UPDATE_SCENE'; payload: { id: string; updates: Partial<Scene> } }
  | { type: 'DELETE_SCENE'; payload: string }
  | { type: 'REORDER_SCENES'; payload: string[] }
  | { type: 'SET_SCENE_IMAGE'; payload: { sceneId: string; url: string; width: number; height: number } }
  | { type: 'CLEAR_SCENE_IMAGE'; payload: string }
  | { type: 'ADD_ELEMENT'; payload: { sceneId: string; element: Omit<Element, 'id'> } }
  | { type: 'UPDATE_ELEMENT'; payload: { sceneId: string; elementId: string; updates: Partial<Element> } }
  | { type: 'DELETE_ELEMENT'; payload: { sceneId: string; elementId: string } }
  | { type: 'MAP_ELEMENT_TO_SUBTITLE'; payload: { sceneId: string; elementId: string; subtitleIndex: number } }
  | { type: 'AUTO_MAP_SUBTITLES' }
  | { type: 'LOAD_PROJECT'; payload: ProjectData }
  | { type: 'RESET_PROJECT' }
  // Novas ações para o novo fluxo
  | { type: 'SET_MODE'; payload: ProjectMode }
  | { type: 'SET_WIZARD_STEP'; payload: WizardStep }
  | { type: 'SET_SRT_CONTENT'; payload: string }
  | { type: 'SET_IMAGE_BLOCKS'; payload: ImageBlock[] }
  | { type: 'UPDATE_IMAGE_BLOCK'; payload: { id: string; updates: Partial<ImageBlock> } }
  | { type: 'SET_IMAGE_BLOCK_IMAGE'; payload: { blockId: string; url: string; width: number; height: number } }
  | { type: 'UPDATE_TIMELINE_ELEMENT'; payload: { blockId: string; elementId: string; updates: Partial<TimelineElement> } }
  | { type: 'SET_ELEMENT_REGION'; payload: { blockId: string; elementId: string; region: ElementRegion; source: 'auto' | 'manual' } }
  | { type: 'CLEAR_ELEMENT_REGION'; payload: { blockId: string; elementId: string } }
  | { type: 'SET_SELECTED_RESOLUTION'; payload: VideoResolution }
  | { type: 'SET_SHOW_SUBTITLES_IN_VIDEO'; payload: boolean }
  | { type: 'SET_BLOCK_DETECTION_STATUS'; payload: { blockId: string; status: ImageBlock['detectionStatus']; error?: string } }
  | { type: 'SET_AUDIO_URL'; payload: string | undefined };

// Reducer
function projectReducer(state: ProjectData, action: ProjectAction): ProjectData {
  switch (action.type) {
    case 'SET_IMAGE':
      return {
        ...state,
        imageUrl: action.payload.url,
        imageDimensions: {
          width: action.payload.width,
          height: action.payload.height,
        },
      };

    case 'SET_SUBTITLES':
      return {
        ...state,
        subtitles: action.payload,
      };

    case 'SET_VIDEO_CONFIG':
      return {
        ...state,
        videoConfig: {
          ...state.videoConfig,
          ...action.payload,
        },
      };

    case 'SET_REVEAL_STYLE':
      return {
        ...state,
        revealStyle: {
          ...state.revealStyle,
          ...action.payload,
        },
      };

    case 'ADD_SCENE':
      return {
        ...state,
        scenes: [
          ...state.scenes,
          {
            ...action.payload,
            id: uuidv4(),
            elements: [],
          },
        ],
      };

    case 'ADD_SCENE_WITH_IMAGE': {
      const { url, width, height } = action.payload;
      return {
        ...state,
        scenes: [
          ...state.scenes,
          {
            id: uuidv4(),
            label: `Cena ${state.scenes.length + 1}`,
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            elements: [],
            imageUrl: url,
            imageDimensions: { width, height },
          },
        ],
      };
    }

    case 'UPDATE_SCENE':
      return {
        ...state,
        scenes: state.scenes.map((scene) =>
          scene.id === action.payload.id
            ? { ...scene, ...action.payload.updates }
            : scene
        ),
      };

    case 'DELETE_SCENE':
      return {
        ...state,
        scenes: state.scenes.filter((scene) => scene.id !== action.payload),
      };

    case 'REORDER_SCENES': {
      const orderedScenes = action.payload
        .map((id) => state.scenes.find((s) => s.id === id))
        .filter((s): s is Scene => s !== undefined);
      return {
        ...state,
        scenes: orderedScenes,
      };
    }

    case 'SET_SCENE_IMAGE': {
      const { sceneId, url, width, height } = action.payload;
      return {
        ...state,
        scenes: state.scenes.map((scene) =>
          scene.id === sceneId
            ? {
                ...scene,
                imageUrl: url,
                imageDimensions: { width, height },
              }
            : scene
        ),
      };
    }

    case 'CLEAR_SCENE_IMAGE': {
      return {
        ...state,
        scenes: state.scenes.map((scene) =>
          scene.id === action.payload
            ? {
                ...scene,
                imageUrl: undefined,
                imageDimensions: undefined,
              }
            : scene
        ),
      };
    }

    case 'ADD_ELEMENT': {
      const { sceneId, element } = action.payload;
      return {
        ...state,
        scenes: state.scenes.map((scene) =>
          scene.id === sceneId
            ? {
                ...scene,
                elements: [
                  ...scene.elements,
                  { ...element, id: uuidv4() },
                ],
              }
            : scene
        ),
      };
    }

    case 'UPDATE_ELEMENT': {
      const { sceneId, elementId, updates } = action.payload;
      return {
        ...state,
        scenes: state.scenes.map((scene) =>
          scene.id === sceneId
            ? {
                ...scene,
                elements: scene.elements.map((elem) =>
                  elem.id === elementId ? { ...elem, ...updates } : elem
                ),
              }
            : scene
        ),
      };
    }

    case 'DELETE_ELEMENT': {
      const { sceneId, elementId } = action.payload;
      return {
        ...state,
        scenes: state.scenes.map((scene) =>
          scene.id === sceneId
            ? {
                ...scene,
                elements: scene.elements.filter((elem) => elem.id !== elementId),
              }
            : scene
        ),
      };
    }

    case 'MAP_ELEMENT_TO_SUBTITLE': {
      const { sceneId, elementId, subtitleIndex } = action.payload;
      return {
        ...state,
        scenes: state.scenes.map((scene) =>
          scene.id === sceneId
            ? {
                ...scene,
                elements: scene.elements.map((elem) =>
                  elem.id === elementId
                    ? { ...elem, subtitleIndex }
                    : elem
                ),
              }
            : scene
        ),
      };
    }

    case 'AUTO_MAP_SUBTITLES': {
      // Distribui legendas sequencialmente entre todos os elementos de todas as cenas
      let subtitleIndex = 0;
      const updatedScenes = state.scenes.map((scene) => ({
        ...scene,
        elements: scene.elements.map((elem) => {
          const mappedIndex = subtitleIndex < state.subtitles.length ? subtitleIndex : -1;
          subtitleIndex++;
          return { ...elem, subtitleIndex: mappedIndex };
        }),
      }));
      return {
        ...state,
        scenes: updatedScenes,
      };
    }

    case 'LOAD_PROJECT':
      return action.payload;

    case 'RESET_PROJECT':
      return createEmptyProject();

    // ========== Novas ações para novo fluxo ==========

    case 'SET_MODE':
      return {
        ...state,
        mode: action.payload,
      };

    case 'SET_WIZARD_STEP':
      return {
        ...state,
        currentStep: action.payload,
      };

    case 'SET_SRT_CONTENT':
      return {
        ...state,
        srtContent: action.payload,
      };

    case 'SET_IMAGE_BLOCKS':
      return {
        ...state,
        imageBlocks: action.payload,
      };

    case 'UPDATE_IMAGE_BLOCK':
      return {
        ...state,
        imageBlocks: state.imageBlocks.map((block) =>
          block.id === action.payload.id
            ? { ...block, ...action.payload.updates }
            : block
        ),
      };

    case 'SET_IMAGE_BLOCK_IMAGE': {
      const { blockId, url, width, height } = action.payload;
      return {
        ...state,
        imageBlocks: state.imageBlocks.map((block) =>
          block.id === blockId
            ? {
                ...block,
                image: { url, width, height },
              }
            : block
        ),
      };
    }

    case 'UPDATE_TIMELINE_ELEMENT': {
      const { blockId, elementId, updates } = action.payload;
      return {
        ...state,
        imageBlocks: state.imageBlocks.map((block) =>
          block.id === blockId
            ? {
                ...block,
                timeline: block.timeline.map((el) =>
                  el.id === elementId ? { ...el, ...updates } : el
                ),
              }
            : block
        ),
      };
    }

    case 'SET_ELEMENT_REGION': {
      const { blockId, elementId, region, source } = action.payload;
      return {
        ...state,
        imageBlocks: state.imageBlocks.map((block) =>
          block.id === blockId
            ? {
                ...block,
                timeline: block.timeline.map((el) =>
                  el.id === elementId
                    ? { ...el, region, regionSource: source }
                    : el
                ),
              }
            : block
        ),
      };
    }

    case 'CLEAR_ELEMENT_REGION': {
      const { blockId, elementId } = action.payload;
      return {
        ...state,
        imageBlocks: state.imageBlocks.map((block) =>
          block.id === blockId
            ? {
                ...block,
                timeline: block.timeline.map((el) =>
                  el.id === elementId
                    ? { ...el, region: undefined, regionSource: undefined }
                    : el
                ),
              }
            : block
        ),
      };
    }

    case 'SET_SELECTED_RESOLUTION':
      return {
        ...state,
        selectedResolution: action.payload,
      };

    case 'SET_SHOW_SUBTITLES_IN_VIDEO':
      return {
        ...state,
        showSubtitlesInVideo: action.payload,
      };

    case 'SET_BLOCK_DETECTION_STATUS': {
      const { blockId, status, error } = action.payload;
      return {
        ...state,
        imageBlocks: state.imageBlocks.map((block) =>
          block.id === blockId
            ? {
                ...block,
                detectionStatus: status,
                detectionError: error,
              }
            : block
        ),
      };
    }

    case 'SET_AUDIO_URL':
      return {
        ...state,
        audioUrl: action.payload,
      };

    default:
      return state;
  }
}

/**
 * Hook para gerenciar o estado do projeto.
 */
export function useProjectState(initialData?: ProjectData) {
  const [state, dispatch] = useReducer(
    projectReducer,
    initialData || createEmptyProject()
  );

  // Ações
  const setImage = useCallback(
    (url: string, width: number, height: number) => {
      dispatch({ type: 'SET_IMAGE', payload: { url, width, height } });
    },
    []
  );

  const setSubtitles = useCallback((subtitles: Subtitle[]) => {
    dispatch({ type: 'SET_SUBTITLES', payload: subtitles });
  }, []);

  const setVideoConfig = useCallback((config: Partial<VideoConfig>) => {
    dispatch({ type: 'SET_VIDEO_CONFIG', payload: config });
  }, []);

  const setAspectRatio = useCallback((aspectRatio: AspectRatio) => {
    const configs: Record<AspectRatio, { width: number; height: number }> = {
      '16:9': { width: 1920, height: 1080 },
      '9:16': { width: 1080, height: 1920 },
      '1:1': { width: 1080, height: 1080 },
    };
    dispatch({
      type: 'SET_VIDEO_CONFIG',
      payload: { aspectRatio, ...configs[aspectRatio] },
    });
  }, []);

  const setRevealStyle = useCallback((style: Partial<RevealStyle>) => {
    dispatch({ type: 'SET_REVEAL_STYLE', payload: style });
  }, []);

  const addScene = useCallback(
    (scene: Omit<Scene, 'id' | 'elements'>) => {
      dispatch({ type: 'ADD_SCENE', payload: scene });
    },
    []
  );

  const addSceneWithImage = useCallback(
    (url: string, width: number, height: number) => {
      dispatch({ type: 'ADD_SCENE_WITH_IMAGE', payload: { url, width, height } });
    },
    []
  );

  const updateScene = useCallback(
    (id: string, updates: Partial<Scene>) => {
      dispatch({ type: 'UPDATE_SCENE', payload: { id, updates } });
    },
    []
  );

  const deleteScene = useCallback((id: string) => {
    dispatch({ type: 'DELETE_SCENE', payload: id });
  }, []);

  const setSceneImage = useCallback(
    (sceneId: string, url: string, width: number, height: number) => {
      dispatch({ type: 'SET_SCENE_IMAGE', payload: { sceneId, url, width, height } });
    },
    []
  );

  const clearSceneImage = useCallback((sceneId: string) => {
    dispatch({ type: 'CLEAR_SCENE_IMAGE', payload: sceneId });
  }, []);

  const reorderScenes = useCallback((sceneIds: string[]) => {
    dispatch({ type: 'REORDER_SCENES', payload: sceneIds });
  }, []);

  const addElement = useCallback(
    (sceneId: string, element: Omit<Element, 'id'>) => {
      dispatch({ type: 'ADD_ELEMENT', payload: { sceneId, element } });
    },
    []
  );

  const updateElement = useCallback(
    (sceneId: string, elementId: string, updates: Partial<Element>) => {
      dispatch({
        type: 'UPDATE_ELEMENT',
        payload: { sceneId, elementId, updates },
      });
    },
    []
  );

  const deleteElement = useCallback(
    (sceneId: string, elementId: string) => {
      dispatch({ type: 'DELETE_ELEMENT', payload: { sceneId, elementId } });
    },
    []
  );

  const mapElementToSubtitle = useCallback(
    (sceneId: string, elementId: string, subtitleIndex: number) => {
      dispatch({
        type: 'MAP_ELEMENT_TO_SUBTITLE',
        payload: { sceneId, elementId, subtitleIndex },
      });
    },
    []
  );

  const autoMapSubtitles = useCallback(() => {
    dispatch({ type: 'AUTO_MAP_SUBTITLES' });
  }, []);

  const loadProject = useCallback((project: ProjectData) => {
    dispatch({ type: 'LOAD_PROJECT', payload: project });
  }, []);

  const resetProject = useCallback(() => {
    dispatch({ type: 'RESET_PROJECT' });
  }, []);

  // ========== Novas ações para novo fluxo ==========

  const setMode = useCallback((mode: ProjectMode) => {
    dispatch({ type: 'SET_MODE', payload: mode });
  }, []);

  const setWizardStep = useCallback((step: WizardStep) => {
    dispatch({ type: 'SET_WIZARD_STEP', payload: step });
  }, []);

  const setSrtContent = useCallback((content: string) => {
    dispatch({ type: 'SET_SRT_CONTENT', payload: content });
  }, []);

  const setImageBlocks = useCallback((blocks: ImageBlock[]) => {
    dispatch({ type: 'SET_IMAGE_BLOCKS', payload: blocks });
  }, []);

  const updateImageBlock = useCallback(
    (id: string, updates: Partial<ImageBlock>) => {
      dispatch({ type: 'UPDATE_IMAGE_BLOCK', payload: { id, updates } });
    },
    []
  );

  const setImageBlockImage = useCallback(
    (blockId: string, url: string, width: number, height: number) => {
      dispatch({
        type: 'SET_IMAGE_BLOCK_IMAGE',
        payload: { blockId, url, width, height },
      });
    },
    []
  );

  const updateTimelineElement = useCallback(
    (blockId: string, elementId: string, updates: Partial<TimelineElement>) => {
      dispatch({
        type: 'UPDATE_TIMELINE_ELEMENT',
        payload: { blockId, elementId, updates },
      });
    },
    []
  );

  const setElementRegion = useCallback(
    (
      blockId: string,
      elementId: string,
      region: ElementRegion,
      source: 'auto' | 'manual'
    ) => {
      dispatch({
        type: 'SET_ELEMENT_REGION',
        payload: { blockId, elementId, region, source },
      });
    },
    []
  );

  const clearElementRegion = useCallback(
    (blockId: string, elementId: string) => {
      dispatch({
        type: 'CLEAR_ELEMENT_REGION',
        payload: { blockId, elementId },
      });
    },
    []
  );

  const setSelectedResolution = useCallback((resolution: VideoResolution) => {
    dispatch({ type: 'SET_SELECTED_RESOLUTION', payload: resolution });
  }, []);

  const setShowSubtitlesInVideo = useCallback((show: boolean) => {
    dispatch({ type: 'SET_SHOW_SUBTITLES_IN_VIDEO', payload: show });
  }, []);

  const setBlockDetectionStatus = useCallback(
    (
      blockId: string,
      status: ImageBlock['detectionStatus'],
      error?: string
    ) => {
      dispatch({
        type: 'SET_BLOCK_DETECTION_STATUS',
        payload: { blockId, status, error },
      });
    },
    []
  );

  const setAudioUrl = useCallback((url: string | undefined) => {
    dispatch({ type: 'SET_AUDIO_URL', payload: url });
  }, []);

  return {
    state,
    actions: {
      setImage,
      setSubtitles,
      setVideoConfig,
      setAspectRatio,
      setRevealStyle,
      addScene,
      addSceneWithImage,
      updateScene,
      deleteScene,
      reorderScenes,
      setSceneImage,
      clearSceneImage,
      addElement,
      updateElement,
      deleteElement,
      mapElementToSubtitle,
      autoMapSubtitles,
      loadProject,
      resetProject,
      // Novas ações para novo fluxo
      setMode,
      setWizardStep,
      setSrtContent,
      setImageBlocks,
      updateImageBlock,
      setImageBlockImage,
      updateTimelineElement,
      setElementRegion,
      clearElementRegion,
      setSelectedResolution,
      setShowSubtitlesInVideo,
      setBlockDetectionStatus,
      setAudioUrl,
    },
  };
}
