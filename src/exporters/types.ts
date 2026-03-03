/**
 * Tipos e interfaces para exportadores de projeto para editores de video
 */

import type { ProjectNew } from '../types/ProjectNew';

/**
 * Como tratar as midias (imagens/audio) na exportacao
 * - 'copy': Copia arquivos para pasta media/ com referencias relativas
 * - 'reference': Mantem caminhos absolutos das midias originais
 */
export type MediaHandling = 'copy' | 'reference';

/**
 * Opcoes para exportacao de projeto
 */
export interface ExportOptions {
  /** Caminho do arquivo de projeto a ser criado */
  outputPath: string;

  /** Como tratar as midias */
  mediaHandling: MediaHandling;

  /** Nome do projeto (usado para criar pasta) */
  projectName?: string;
}

/**
 * Resultado da exportacao
 */
export interface ExportResult {
  /** Se a exportacao foi bem sucedida */
  success: boolean;

  /** Caminho do arquivo de projeto criado */
  projectPath: string;

  /** Caminho da pasta de midias (se mediaHandling='copy') */
  mediaFolder?: string;

  /** Lista de erros (se houver) */
  errors?: string[];

  /** Lista de avisos (problemas nao criticos) */
  warnings?: string[];
}

/**
 * Modo de exibição do clip
 */
export type ClipDisplayMode = 'normal' | 'zoom';

/**
 * Direção do reveal
 */
export type ClipRevealDirection = 'auto' | 'center' | 'left' | 'right' | 'top' | 'bottom';

/**
 * Informacoes sobre um clip na timeline
 */
export interface TimelineClip {
  /** ID unico do clip */
  id: string;

  /** Caminho do arquivo de midia */
  mediaPath: string;

  /** Frame inicial na timeline */
  startFrame: number;

  /** Frame final na timeline */
  endFrame: number;

  /** Duracao em frames */
  durationFrames: number;

  /** Largura original da imagem */
  imageWidth: number;

  /** Altura original da imagem */
  imageHeight: number;

  /** Regiao de crop (se houver) */
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  /** Texto da legenda associada */
  subtitleText?: string;

  /** Modo de exibição (normal ou zoom) */
  displayMode?: ClipDisplayMode;

  /** Direção da animação de reveal */
  revealDirection?: ClipRevealDirection;

  /** Fração do tempo para o reveal (0.0 a 1.0) */
  revealFraction?: number;
}

/**
 * Informacoes sobre uma track de audio
 */
export interface AudioTrack {
  /** ID da track */
  id: string;

  /** Caminho do arquivo de audio */
  mediaPath: string;

  /** Frame inicial */
  startFrame: number;

  /** Frame final */
  endFrame: number;
}

/**
 * Dados da timeline do projeto
 */
export interface TimelineData {
  /** Nome do projeto */
  name: string;

  /** Largura do video */
  width: number;

  /** Altura do video */
  height: number;

  /** FPS do video */
  fps: number;

  /** Duracao total em frames */
  totalFrames: number;

  /** Clips de video na timeline */
  clips: TimelineClip[];

  /** Track de audio (opcional) */
  audioTrack?: AudioTrack;

  /** Cor de fundo */
  backgroundColor: string;
}

/**
 * Tipos de editores suportados
 */
export type EditorType = 'kdenlive' | 'shotcut' | 'davinci' | 'fcpxml' | 'openshot';

/**
 * Informacoes sobre um editor
 */
export interface EditorInfo {
  /** Identificador do editor */
  id: EditorType;

  /** Nome do editor para exibicao */
  name: string;

  /** Extensao do arquivo de projeto */
  extension: string;

  /** Formato do arquivo (XML, JSON, etc) */
  format: string;

  /** Descricao curta */
  description: string;
}

/**
 * Lista de editores suportados
 */
export const SUPPORTED_EDITORS: EditorInfo[] = [
  {
    id: 'kdenlive',
    name: 'Kdenlive',
    extension: '.kdenlive',
    format: 'XML (MLT)',
    description: 'Editor gratuito e open source',
  },
  {
    id: 'davinci',
    name: 'DaVinci Resolve',
    extension: '.fcpxml',
    format: 'FCPXML',
    description: 'Importa via File > Import > Timeline',
  },
  {
    id: 'openshot',
    name: 'OpenShot',
    extension: '.osp',
    format: 'JSON',
    description: 'Editor gratuito e open source',
  },
];

/**
 * Interface que todos os exportadores devem implementar
 */
export interface EditorExporter {
  /** Identificador do editor */
  editorId: EditorType;

  /** Nome do editor */
  name: string;

  /** Extensao do arquivo */
  extension: string;

  /** Formato do arquivo */
  format: string;

  /**
   * Exporta o projeto para o formato do editor
   */
  export(project: ProjectNew, options: ExportOptions): Promise<ExportResult>;

  /**
   * Verifica se o projeto pode ser exportado
   */
  canExport(project: ProjectNew): { valid: boolean; issues: string[] };

  /**
   * Converte o projeto para dados de timeline
   */
  projectToTimeline(project: ProjectNew): TimelineData;
}
