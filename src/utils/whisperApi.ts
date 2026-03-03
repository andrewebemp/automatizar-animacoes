/**
 * Utilitário para transcrição de áudio via OpenAI Whisper API ou Groq API
 */

import { TRANSCRIPTION_ENDPOINTS } from '../types/ApiConfig';
import type { TranscriptionProvider } from '../types/ApiConfig';

/**
 * Configuração para agrupamento de segmentos em legendas
 */
export interface SegmentGroupingConfig {
  /** Duração alvo de cada segmento em segundos (padrão: 10) */
  targetDuration: number;
  /** Duração mínima de um segmento em segundos (padrão: 5) */
  minDuration: number;
  /** Duração máxima de um segmento em segundos (padrão: 15) */
  maxDuration: number;
}

export const DEFAULT_GROUPING_CONFIG: SegmentGroupingConfig = {
  targetDuration: 7,
  minDuration: 5,
  maxDuration: 10,
};

export interface WhisperConfig {
  apiKey: string;
  /** Provedor de transcrição: 'openai' ou 'groq' */
  provider?: TranscriptionProvider;
  model?: string;
  language?: string; // ISO-639-1 code, ex: 'pt' para português
  responseFormat?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';
  /** Configuração de agrupamento de segmentos em legendas */
  segmentGrouping?: Partial<SegmentGroupingConfig>;
}

export interface TranscriptionResult {
  success: boolean;
  text?: string;
  srt?: string;
  error?: string;
  duration?: number; // duração do áudio em segundos
}

export interface TranscriptionSegment {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
}

export interface VerboseTranscription {
  task: string;
  language: string;
  duration: number;
  text: string;
  segments: TranscriptionSegment[];
}

/**
 * Retorna a URL do endpoint de transcrição baseado no provedor
 */
function getTranscriptionEndpoint(provider: TranscriptionProvider = 'openai'): string {
  return TRANSCRIPTION_ENDPOINTS[provider] || TRANSCRIPTION_ENDPOINTS.openai;
}

/**
 * Retorna o modelo padrão baseado no provedor
 */
function getDefaultModel(provider: TranscriptionProvider = 'openai'): string {
  return provider === 'groq' ? 'whisper-large-v3-turbo' : 'whisper-1';
}

/**
 * Transcreve um arquivo de áudio usando a API Whisper (OpenAI ou Groq)
 */
export async function transcribeAudio(
  audioFile: File,
  config: WhisperConfig
): Promise<TranscriptionResult> {
  const provider = config.provider || 'openai';
  const apiUrl = getTranscriptionEndpoint(provider);
  const model = config.model || getDefaultModel(provider);
  const providerName = provider === 'groq' ? 'Groq' : 'OpenAI';

  console.log('[TranscriptionAPI] Iniciando transcribeAudio', {
    provider,
    apiUrl,
    model,
    fileName: audioFile.name,
    fileSize: audioFile.size,
    fileType: audioFile.type,
    hasApiKey: !!config.apiKey,
    apiKeyLength: config.apiKey?.length || 0,
    language: config.language,
  });

  if (!config.apiKey) {
    console.error('[TranscriptionAPI] API key não configurada');
    return {
      success: false,
      error: `API key do ${providerName} não configurada. Configure nas Configurações.`,
    };
  }

  try {
    const formData = new FormData();
    formData.append('file', audioFile);
    formData.append('model', model);

    if (config.language) {
      formData.append('language', config.language);
    }

    // Obtemos a transcrição detalhada para ter os timestamps
    formData.append('response_format', 'verbose_json');

    // Groq suporta timestamp_granularities para segmentos
    if (provider === 'groq') {
      formData.append('timestamp_granularities[]', 'segment');
    }

    console.log('[TranscriptionAPI] Enviando requisição para:', apiUrl, `(${providerName})`);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: formData,
    });

    console.log('[TranscriptionAPI] Resposta recebida:', response.status, response.statusText);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `Erro HTTP ${response.status}: ${response.statusText}`;
      console.error('[TranscriptionAPI] Erro na resposta:', errorData);
      return {
        success: false,
        error: `Erro na API ${providerName}: ${errorMessage}`,
      };
    }

    const data: VerboseTranscription = await response.json();

    // Mescla configuração de agrupamento com defaults
    const groupingConfig: SegmentGroupingConfig = {
      ...DEFAULT_GROUPING_CONFIG,
      ...config.segmentGrouping,
    };

    // Converte os segmentos para formato SRT
    const srt = segmentsToSrt(data.segments, groupingConfig);

    return {
      success: true,
      text: data.text,
      srt,
      duration: data.duration,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido na transcrição',
    };
  }
}


/**
 * Palavras/padrões que indicam fim de frase ou mudança de contexto
 * Usado para decidir onde quebrar segmentos de forma natural
 */
const SENTENCE_ENDINGS = /[.!?:;]$/;
const CONTEXT_BREAK_PATTERNS = [
  /^(então|mas|porém|entretanto|contudo|todavia|agora|primeiro|segundo|terceiro|por outro lado|além disso|finalmente|em conclusão|portanto|assim|dessa forma)/i,
];

/**
 * Verifica se o texto termina com pontuação de fim de frase
 */
function endsWithSentence(text: string): boolean {
  return SENTENCE_ENDINGS.test(text.trim());
}

/**
 * Verifica se o texto começa com palavra de transição/mudança de contexto
 */
function startsWithContextBreak(text: string): boolean {
  const trimmed = text.trim();
  return CONTEXT_BREAK_PATTERNS.some(pattern => pattern.test(trimmed));
}

/**
 * Agrupa segmentos curtos do Whisper em segmentos maiores (~10 segundos)
 * considerando o contexto para fazer quebras naturais
 */
function groupSegments(
  segments: TranscriptionSegment[],
  config: SegmentGroupingConfig = DEFAULT_GROUPING_CONFIG
): TranscriptionSegment[] {
  if (segments.length === 0) return [];

  const grouped: TranscriptionSegment[] = [];
  let currentGroup: TranscriptionSegment | null = null;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const nextSegment = segments[i + 1];

    if (!currentGroup) {
      // Inicia novo grupo
      currentGroup = {
        id: grouped.length + 1,
        seek: segment.seek,
        start: segment.start,
        end: segment.end,
        text: segment.text.trim(),
      };
    } else {
      // Adiciona ao grupo atual
      currentGroup.end = segment.end;
      currentGroup.text += ' ' + segment.text.trim();
    }

    const currentDuration = currentGroup.end - currentGroup.start;
    const wouldExceedMax = nextSegment &&
      (currentGroup.end + (nextSegment.end - nextSegment.start) - currentGroup.start > config.maxDuration);

    // Decide se deve finalizar o grupo atual
    const shouldFinalize =
      // Atingiu duração máxima
      currentDuration >= config.maxDuration ||
      // Próximo segmento excederia o máximo
      wouldExceedMax ||
      // Atingiu duração alvo E termina com pontuação
      (currentDuration >= config.targetDuration && endsWithSentence(currentGroup.text)) ||
      // Atingiu duração mínima E próximo segmento começa novo contexto
      (currentDuration >= config.minDuration && nextSegment && startsWithContextBreak(nextSegment.text)) ||
      // É o último segmento
      !nextSegment;

    if (shouldFinalize) {
      grouped.push(currentGroup);
      currentGroup = null;
    }
  }

  // Caso tenha sobrado algum grupo não finalizado
  if (currentGroup) {
    grouped.push(currentGroup);
  }

  // Renumera os IDs
  return grouped.map((seg, idx) => ({ ...seg, id: idx + 1 }));
}

/**
 * Converte segmentos do Whisper para formato SRT
 * Agrupa segmentos curtos em intervalos configuráveis para melhor visualização
 */
function segmentsToSrt(
  segments: TranscriptionSegment[],
  groupingConfig: SegmentGroupingConfig = DEFAULT_GROUPING_CONFIG
): string {
  // Agrupa segmentos curtos em intervalos maiores
  const groupedSegments = groupSegments(segments, groupingConfig);

  return groupedSegments
    .map((segment, index) => {
      const startTime = formatSrtTimestamp(segment.start);
      const endTime = formatSrtTimestamp(segment.end);
      const text = segment.text.trim();

      return `${index + 1}\n${startTime} --> ${endTime}\n${text}`;
    })
    .join('\n\n') + '\n';
}

/**
 * Formata timestamp em segundos para formato SRT (HH:MM:SS,mmm)
 */
function formatSrtTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.round((seconds % 1) * 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${secs.toString().padStart(2, '0')},${milliseconds
    .toString()
    .padStart(3, '0')}`;
}

/**
 * Verifica se um arquivo é um formato de áudio suportado
 */
export function isAudioFile(file: File): boolean {
  const supportedFormats = [
    'audio/mpeg',      // .mp3
    'audio/mp4',       // .m4a
    'audio/wav',       // .wav
    'audio/webm',      // .webm
    'audio/ogg',       // .ogg
    'audio/flac',      // .flac
  ];

  // Também verifica pela extensão
  const supportedExtensions = ['.mp3', '.mp4', '.m4a', '.wav', '.webm', '.ogg', '.flac'];
  const fileName = file.name.toLowerCase();

  return (
    supportedFormats.includes(file.type) ||
    supportedExtensions.some((ext) => fileName.endsWith(ext))
  );
}

/**
 * Verifica o tamanho máximo do arquivo
 * OpenAI Whisper: 25MB | Groq Free: 25MB | Groq Dev: 100MB
 */
export function isFileSizeValid(file: File, provider: TranscriptionProvider = 'openai'): boolean {
  const maxSize = provider === 'groq' ? 100 * 1024 * 1024 : 25 * 1024 * 1024;
  return file.size <= maxSize;
}

/**
 * Retorna o tamanho máximo do arquivo em MB para o provedor
 */
export function getMaxFileSize(provider: TranscriptionProvider = 'openai'): number {
  return provider === 'groq' ? 100 : 25;
}

/**
 * Formata o tamanho do arquivo para exibição
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Formata duração em segundos para exibição
 */
export function formatAudioDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Transcreve áudio usando Whisper e alinha com o texto de narração fornecido.
 * Usa os timestamps do Whisper mas substitui o texto pelo da narração,
 * respeitando pontuação e contexto para quebras naturais.
 */
export async function transcribeWithNarration(
  audioFile: File,
  narrationText: string,
  config: WhisperConfig
): Promise<TranscriptionResult> {
  const provider = config.provider || 'openai';
  const apiUrl = getTranscriptionEndpoint(provider);
  const model = config.model || getDefaultModel(provider);
  const providerName = provider === 'groq' ? 'Groq' : 'OpenAI';

  if (!config.apiKey) {
    return {
      success: false,
      error: `API key do ${providerName} não configurada. Configure nas Configurações.`,
    };
  }

  try {
    const formData = new FormData();
    formData.append('file', audioFile);
    formData.append('model', model);

    if (config.language) {
      formData.append('language', config.language);
    }

    // Obtemos a transcrição detalhada para ter os timestamps e duração
    formData.append('response_format', 'verbose_json');

    if (provider === 'groq') {
      formData.append('timestamp_granularities[]', 'segment');
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `Erro HTTP ${response.status}`;
      return {
        success: false,
        error: `Erro na API ${providerName}: ${errorMessage}`,
      };
    }

    const data: VerboseTranscription = await response.json();
    const audioDuration = data.duration;

    // Mescla configuração de agrupamento com defaults
    const groupingConfig: SegmentGroupingConfig = {
      ...DEFAULT_GROUPING_CONFIG,
      ...config.segmentGrouping,
    };

    // Divide o texto da narração em segmentos usando a duração do áudio e config
    const srt = alignNarrationWithTimestamps(
      narrationText,
      audioDuration,
      groupingConfig
    );

    return {
      success: true,
      text: narrationText,
      srt,
      duration: audioDuration,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido na transcrição',
    };
  }
}

/**
 * Divide texto em sentenças baseado em pontuação final
 */
function splitIntoSentences(text: string): string[] {
  // Normaliza espaços e quebras de linha
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

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
 * Estima a duração de leitura de um texto em segundos
 * Baseado em velocidade média de fala (~150 palavras/minuto em português)
 */
function estimateReadingDuration(text: string): number {
  const words = text.split(/\s+/).length;
  const wordsPerSecond = 2.5; // ~150 palavras por minuto
  return words / wordsPerSecond;
}

/**
 * Alinha o texto de narração com timestamps baseado na duração do áudio
 * Respeita pontuação e contexto para quebras naturais
 */
function alignNarrationWithTimestamps(
  narrationText: string,
  audioDuration: number,
  config: SegmentGroupingConfig
): string {
  // Divide em sentenças
  const sentences = splitIntoSentences(narrationText);
  
  if (sentences.length === 0) {
    return '';
  }

  // Estima duração total de leitura do texto
  const totalReadingDuration = sentences.reduce(
    (sum, s) => sum + estimateReadingDuration(s),
    0
  );

  // Fator de escala para ajustar ao tempo real do áudio
  const scaleFactor = audioDuration / totalReadingDuration;

  // Agrupa sentenças em segmentos respeitando min/max duration
  const segments: { start: number; end: number; text: string }[] = [];
  let currentTime = 0;
  let currentText = '';
  let currentStart = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const sentenceDuration = estimateReadingDuration(sentence) * scaleFactor;
    const nextSentence = sentences[i + 1];
    const nextDuration = nextSentence
      ? estimateReadingDuration(nextSentence) * scaleFactor
      : 0;

    // Adiciona sentença ao grupo atual
    if (currentText) {
      currentText += ' ' + sentence;
    } else {
      currentText = sentence;
      currentStart = currentTime;
    }

    const currentDuration = currentTime + sentenceDuration - currentStart;
    const wouldExceedMax = currentDuration + nextDuration > config.maxDuration;

    // Decide se deve finalizar o segmento atual
    const shouldFinalize =
      // Atingiu duração máxima
      currentDuration >= config.maxDuration ||
      // Próxima sentença excederia o máximo
      wouldExceedMax ||
      // Atingiu duração alvo e termina com pontuação forte
      (currentDuration >= config.targetDuration && /[.!?]$/.test(currentText)) ||
      // Atingiu duração mínima e próxima sentença começa novo contexto
      (currentDuration >= config.minDuration && nextSentence && startsWithContextBreak(nextSentence)) ||
      // É a última sentença
      !nextSentence;

    currentTime += sentenceDuration;

    if (shouldFinalize) {
      segments.push({
        start: currentStart,
        end: Math.min(currentTime, audioDuration),
        text: currentText.trim(),
      });
      currentText = '';
    }
  }

  // Adiciona último segmento se sobrou
  if (currentText) {
    segments.push({
      start: currentStart,
      end: Math.min(currentTime, audioDuration),
      text: currentText.trim(),
    });
  }

  // Ajusta o último segmento para terminar exatamente na duração do áudio
  if (segments.length > 0) {
    segments[segments.length - 1].end = audioDuration;
  }

  // Converte para formato SRT
  return segments
    .map((segment, index) => {
      const startTime = formatSrtTimestamp(segment.start);
      const endTime = formatSrtTimestamp(segment.end);
      return `${index + 1}\n${startTime} --> ${endTime}\n${segment.text}`;
    })
    .join('\n\n') + '\n';
}
