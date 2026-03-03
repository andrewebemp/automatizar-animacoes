import type { Region } from './Region';
import type { VideoConfig } from './VideoConfig';
import type { DisplayMode, RevealDirection } from './VideoSegment';
import type { Subtitle } from './Subtitle';

/**
 * Representa um elemento (região com timing) dentro de uma cena no modo Timeline.
 * Cada elemento tem seu próprio tempo de entrada/saída independente.
 */
export interface SceneElement {
  /** Identificador único do elemento */
  id: string;

  /** Região desenhada (SVG path) - a marcação visual */
  region: Region;

  /** Tempo de início em milissegundos (absoluto no áudio) */
  startTime: number;

  /** Tempo de fim em milissegundos (absoluto no áudio) */
  endTime: number;

  /** Direção da animação de revelação */
  revealDirection: RevealDirection;

  /** Duração do reveal como fração (0.0 a 1.0) do tempo do elemento */
  revealFraction: number;

  /** Modo de exibição do elemento */
  displayMode: DisplayMode;

  /** Fator de escala do elemento (1.0 = tamanho original) */
  scale?: number;

  /** Offset de posição do elemento (para mover no canvas) */
  offset?: { x: number; y: number };
}

/**
 * Representa uma cena no modo Timeline.
 * Uma cena = uma imagem com múltiplos elementos que aparecem em tempos diferentes.
 */
export interface TimelineScene {
  /** Identificador único da cena */
  id: string;

  /** URL da imagem (pode ser data URL ou file://) */
  imageUrl: string;

  /** Largura original da imagem em pixels */
  imageWidth: number;

  /** Altura original da imagem em pixels */
  imageHeight: number;

  /** Tempo de início da cena em milissegundos */
  startTime: number;

  /** Tempo de fim da cena em milissegundos */
  endTime: number;

  /** Elementos (regiões com timing) desta cena */
  elements: SceneElement[];

  /** Traços apagados com borracha (para pintar por cima) */
  erasedStrokes?: ErasedStroke[];

  /** Legendas do SRT associadas a esta cena (para referência/criação de elementos) */
  subtitles?: Subtitle[];
}

/**
 * Representa um traço apagado com a borracha.
 */
export interface ErasedStroke {
  /** Identificador único do traço */
  id: string;

  /** Pontos do traço */
  points: Array<{ x: number; y: number }>;

  /** Largura do traço */
  strokeWidth: number;
}

/**
 * Projeto no modo Timeline.
 * Diferente do modo SRT, os tempos são definidos pelo usuário na interface.
 */
export interface TimelineProject {
  /** Identificador único do projeto */
  id: string;

  /** Nome do projeto */
  name: string;

  /** Modo do projeto - sempre 'timeline' para este tipo */
  mode: 'timeline';

  /** URL do arquivo de áudio (obrigatório neste modo) */
  audioUrl: string;

  /** Duração total do áudio em milissegundos */
  audioDuration: number;

  /** Cenas do projeto (ordenadas por startTime) */
  scenes: TimelineScene[];

  /** Configuração de vídeo */
  videoConfig: VideoConfig;

  /** Cor de fundo do vídeo */
  backgroundColor: string;

  /** Mostrar legendas no vídeo exportado */
  showSubtitles: boolean;

  /** Data de criação */
  createdAt: string;

  /** Data da última atualização */
  updatedAt: string;
}

/**
 * Cria um elemento padrão para uma cena
 */
export function createSceneElement(
  region: Region,
  startTime: number,
  endTime: number
): SceneElement {
  return {
    id: `element-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    region,
    startTime,
    endTime,
    revealDirection: 'auto',
    revealFraction: 0.6,
    displayMode: 'normal',
    scale: 1.0,
  };
}

/**
 * Cria uma cena padrão
 */
export function createTimelineScene(
  imageUrl: string,
  imageWidth: number,
  imageHeight: number,
  startTime: number,
  endTime: number
): TimelineScene {
  return {
    id: `scene-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    imageUrl,
    imageWidth,
    imageHeight,
    startTime,
    endTime,
    elements: [],
    erasedStrokes: [],
  };
}

/**
 * Cria um projeto Timeline vazio
 */
export function createEmptyTimelineProject(): TimelineProject {
  return {
    id: `timeline-${Date.now()}`,
    name: 'Novo Projeto Timeline',
    mode: 'timeline',
    audioUrl: '',
    audioDuration: 0,
    scenes: [],
    videoConfig: {
      fps: 30,
      width: 1920,
      height: 1080,
      aspectRatio: '16:9',
    },
    backgroundColor: '#ffffff',
    showSubtitles: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Calcula a duração total do projeto em frames
 */
export function getTimelineProjectDurationFrames(project: TimelineProject): number {
  const { fps } = project.videoConfig;
  return Math.ceil((project.audioDuration / 1000) * fps);
}

/**
 * Converte milissegundos para frames
 */
export function msToFrames(ms: number, fps: number): number {
  return Math.round((ms / 1000) * fps);
}

/**
 * Converte frames para milissegundos
 */
export function framesToMs(frames: number, fps: number): number {
  return Math.round((frames / fps) * 1000);
}

/**
 * Formata tempo em milissegundos para string "MM:SS.mmm"
 */
export function formatTimeMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = ms % 1000;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

/**
 * Formata tempo em milissegundos para string curta "MM:SS"
 */
export function formatTimeMsShort(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Parse string de tempo "MM:SS" ou "MM:SS.mmm" para milissegundos
 */
export function parseTimeToMs(timeStr: string): number {
  const parts = timeStr.split(':');
  if (parts.length !== 2) return 0;

  const minutes = parseInt(parts[0], 10) || 0;
  const secondsParts = parts[1].split('.');
  const seconds = parseInt(secondsParts[0], 10) || 0;
  const ms = secondsParts[1] ? parseInt(secondsParts[1].padEnd(3, '0').slice(0, 3), 10) : 0;

  return (minutes * 60 + seconds) * 1000 + ms;
}
