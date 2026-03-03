/**
 * Utilitário para converter roteiro em texto (.txt) para formato SRT
 *
 * O algoritmo divide o texto em segmentos de legenda baseado em:
 * - Pontuação (., !, ?)
 * - Vírgulas em frases longas
 * - Tamanho máximo de caracteres por legenda
 * - Duração estimada baseada na velocidade de fala
 */

export interface SrtGenerationConfig {
  /** Caracteres por segundo na fala (padrão: 15 - velocidade moderada) */
  charsPerSecond: number;
  /** Máximo de caracteres por legenda (padrão: 80) */
  maxCharsPerSubtitle: number;
  /** Duração mínima de uma legenda em ms (padrão: 1000) */
  minDurationMs: number;
  /** Duração máxima de uma legenda em ms (padrão: 6000) */
  maxDurationMs: number;
  /** Gap entre legendas em ms (padrão: 40) */
  gapMs: number;
}

export interface GeneratedSubtitle {
  index: number;
  startTime: number; // ms
  endTime: number; // ms
  text: string;
}

const DEFAULT_CONFIG: SrtGenerationConfig = {
  charsPerSecond: 15,
  maxCharsPerSubtitle: 80,
  minDurationMs: 1000,
  maxDurationMs: 6000,
  gapMs: 40,
};

/**
 * Formata tempo em milissegundos para formato SRT (HH:MM:SS,mmm)
 */
function formatSrtTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = ms % 1000;

  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${milliseconds
    .toString()
    .padStart(3, '0')}`;
}

/**
 * Divide texto em sentenças baseado em pontuação
 */
function splitIntoSentences(text: string): string[] {
  // Normaliza espaços e quebras de linha
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Divide por pontuação final mantendo a pontuação
  const sentences: string[] = [];
  let current = '';

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    current += char;

    // Verifica se é fim de sentença
    if ('.!?'.includes(char)) {
      // Verifica se não é abreviação comum
      const beforePunct = current.slice(0, -1).trim();
      const isAbbreviation = /\b(Dr|Sr|Sra|Prof|etc|ex|vs|vol|cap|pág|fig|nº)\s*$/i.test(beforePunct);

      if (!isAbbreviation) {
        sentences.push(current.trim());
        current = '';
      }
    }
  }

  // Adiciona resto se houver
  if (current.trim()) {
    sentences.push(current.trim());
  }

  return sentences.filter(s => s.length > 0);
}

/**
 * Divide uma sentença longa em partes menores
 */
function splitLongSentence(sentence: string, maxChars: number): string[] {
  if (sentence.length <= maxChars) {
    return [sentence];
  }

  const parts: string[] = [];
  let remaining = sentence;

  while (remaining.length > maxChars) {
    // Tenta dividir por vírgula, ponto e vírgula, ou dois pontos
    let splitIndex = -1;
    const punctMarks = [',', ';', ':'];

    for (const punct of punctMarks) {
      // Procura a última ocorrência antes do limite
      const lastIndex = remaining.lastIndexOf(punct, maxChars);
      if (lastIndex > maxChars * 0.3) { // Pelo menos 30% do texto
        splitIndex = lastIndex + 1;
        break;
      }
    }

    // Se não encontrou pontuação, divide por espaço
    if (splitIndex === -1) {
      splitIndex = remaining.lastIndexOf(' ', maxChars);
      if (splitIndex === -1 || splitIndex < maxChars * 0.3) {
        splitIndex = maxChars;
      }
    }

    parts.push(remaining.slice(0, splitIndex).trim());
    remaining = remaining.slice(splitIndex).trim();
  }

  if (remaining) {
    parts.push(remaining);
  }

  return parts;
}

/**
 * Calcula a duração estimada para um texto baseado na velocidade de fala
 */
function calculateDuration(text: string, config: SrtGenerationConfig): number {
  const charCount = text.length;
  const estimatedMs = (charCount / config.charsPerSecond) * 1000;

  // Aplica limites min/max
  return Math.max(
    config.minDurationMs,
    Math.min(config.maxDurationMs, estimatedMs)
  );
}

/**
 * Converte texto de roteiro para array de legendas
 */
export function scriptToSubtitles(
  scriptText: string,
  config: Partial<SrtGenerationConfig> = {}
): GeneratedSubtitle[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const subtitles: GeneratedSubtitle[] = [];

  // Divide em sentenças
  const sentences = splitIntoSentences(scriptText);

  // Processa cada sentença
  const segments: string[] = [];
  for (const sentence of sentences) {
    const parts = splitLongSentence(sentence, cfg.maxCharsPerSubtitle);
    segments.push(...parts);
  }

  // Gera legendas com timing
  let currentTime = 0;
  let index = 1;

  for (const segment of segments) {
    const duration = calculateDuration(segment, cfg);

    subtitles.push({
      index,
      startTime: currentTime,
      endTime: currentTime + duration,
      text: segment,
    });

    currentTime += duration + cfg.gapMs;
    index++;
  }

  return subtitles;
}

/**
 * Converte array de legendas para string no formato SRT
 */
export function subtitlesToSrtString(subtitles: GeneratedSubtitle[]): string {
  return subtitles
    .map((sub) => {
      const startTime = formatSrtTime(sub.startTime);
      const endTime = formatSrtTime(sub.endTime);

      // Quebra texto longo em duas linhas se necessário
      let text = sub.text;
      if (text.length > 42) {
        const midPoint = Math.floor(text.length / 2);
        const spaceIndex = text.indexOf(' ', midPoint);
        if (spaceIndex !== -1 && spaceIndex < text.length - 10) {
          text = text.slice(0, spaceIndex) + '\n' + text.slice(spaceIndex + 1);
        }
      }

      return `${sub.index}\n${startTime} --> ${endTime}\n${text}`;
    })
    .join('\n\n') + '\n';
}

/**
 * Converte texto de roteiro diretamente para string SRT
 */
export function convertScriptToSrt(
  scriptText: string,
  config: Partial<SrtGenerationConfig> = {}
): string {
  const subtitles = scriptToSubtitles(scriptText, config);
  return subtitlesToSrtString(subtitles);
}

/**
 * Estima a duração total do vídeo baseado no roteiro
 */
export function estimateTotalDuration(
  scriptText: string,
  config: Partial<SrtGenerationConfig> = {}
): number {
  const subtitles = scriptToSubtitles(scriptText, config);
  if (subtitles.length === 0) return 0;
  return subtitles[subtitles.length - 1].endTime;
}

/**
 * Formata duração em ms para string legível
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}
