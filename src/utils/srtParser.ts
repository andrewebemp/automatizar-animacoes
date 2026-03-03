import { parse } from '@plussub/srt-vtt-parser';
import type { Subtitle } from '../types';

/**
 * Parseia um arquivo SRT e retorna as legendas com frames calculados.
 *
 * @param content - Conteúdo do arquivo SRT
 * @param fps - Frames por segundo do vídeo
 * @returns Array de legendas parseadas
 */
export function parseSRT(content: string, fps: number): Subtitle[] {
  const parsed = parse(content);

  return parsed.entries.map((entry, index) => ({
    id: index + 1,
    startTime: entry.from,
    endTime: entry.to,
    text: entry.text,
    startFrame: Math.floor((entry.from / 1000) * fps),
    endFrame: Math.floor((entry.to / 1000) * fps),
  }));
}

/**
 * Calcula a duração total em frames baseado nas legendas.
 *
 * @param subtitles - Array de legendas
 * @returns Duração total em frames
 */
export function calculateTotalDuration(subtitles: Subtitle[]): number {
  if (subtitles.length === 0) return 0;

  const lastSubtitle = subtitles[subtitles.length - 1];
  return lastSubtitle.endFrame;
}

/**
 * Encontra a legenda ativa em um determinado frame.
 *
 * @param subtitles - Array de legendas
 * @param frame - Frame atual
 * @returns Índice da legenda ativa ou -1 se nenhuma
 */
export function findActiveSubtitle(subtitles: Subtitle[], frame: number): number {
  return subtitles.findIndex(
    (sub) => frame >= sub.startFrame && frame < sub.endFrame
  );
}

/**
 * Formata milissegundos para o formato SRT (HH:MM:SS,mmm).
 *
 * @param ms - Tempo em milissegundos
 * @returns String formatada
 */
export function formatSRTTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${milliseconds
    .toString()
    .padStart(3, '0')}`;
}
