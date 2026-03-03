/**
 * Representa uma legenda parseada de um arquivo SRT.
 */
export interface Subtitle {
  /** Número sequencial da legenda (1-based) */
  id: number;

  /** Tempo de início em milissegundos */
  startTime: number;

  /** Tempo de fim em milissegundos */
  endTime: number;

  /** Texto da legenda */
  text: string;

  /** Frame de início (calculado com base no FPS) */
  startFrame: number;

  /** Frame de fim (calculado com base no FPS) */
  endFrame: number;
}
