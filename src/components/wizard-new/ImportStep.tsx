import React, { useCallback, useState, useMemo, useEffect } from 'react';
import type { Subtitle } from '../../types/Subtitle';
import { parseSRT } from '../../utils/srtParser';
import {
  transcribeAudio,
  transcribeWithNarration,
  isFileSizeValid,
  getMaxFileSize,
  formatFileSize,
  formatAudioDuration,
  DEFAULT_GROUPING_CONFIG,
  type WhisperConfig,
} from '../../utils/whisperApi';
import { loadApiConfig, TRANSCRIPTION_PROVIDER_NAMES } from '../../types/ApiConfig';
import type { TranscriptionProvider } from '../../types/ApiConfig';

interface ImportStepProps {
  /** Legendas já carregadas */
  subtitles: Subtitle[];

  /** URL do áudio já carregado */
  audioUrl?: string;

  /** FPS do vídeo */
  fps: number;

  /** Callback quando legendas são carregadas */
  onSubtitlesLoaded: (subtitles: Subtitle[]) => void;

  /** Callback quando áudio é carregado */
  onAudioLoaded: (audioUrl: string) => void;

  /** Callback para avançar para próximo passo */
  onNext: () => void;

  /** Callback para salvar o projeto */
  onSave?: () => void;
}

/**
 * Passo 1: Importar SRT e Áudio
 */
export const ImportStep: React.FC<ImportStepProps> = ({
  subtitles,
  audioUrl,
  fps,
  onSubtitlesLoaded,
  onAudioLoaded,
  onNext,
  onSave,
}) => {
  const [srtError, setSrtError] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [narrationError, setNarrationError] = useState<string | null>(null);
  const [isDraggingSrt, setIsDraggingSrt] = useState(false);
  const [isDraggingAudio, setIsDraggingAudio] = useState(false);
  const [isDraggingNarration, setIsDraggingNarration] = useState(false);
  
  // Estado para texto de narração
  const [narrationText, setNarrationText] = useState<string>('');

  // Estados para transcrição Whisper
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionProgress, setTranscriptionProgress] = useState<string>('');
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [generatedSrtContent, setGeneratedSrtContent] = useState<string | null>(null);
  const [generatedSubtitles, setGeneratedSubtitles] = useState<Subtitle[]>([]);
  
  // Configurações de intervalo de legendas (em segundos)
  const [minDuration, setMinDuration] = useState(DEFAULT_GROUPING_CONFIG.minDuration);
  const [maxDuration, setMaxDuration] = useState(DEFAULT_GROUPING_CONFIG.maxDuration);

  // Estado para visualização completa
  const [showAllSubtitles, setShowAllSubtitles] = useState(false);
  const [showAllNarration, setShowAllNarration] = useState(false);
  
  // Guarda referência ao arquivo de áudio original para transcrição
  const [audioFile, setAudioFile] = useState<File | null>(null);

  // Recria audioFile a partir do audioUrl quando o componente carrega com áudio já existente
  // Isso é necessário porque o File não é serializado no localStorage
  useEffect(() => {
    const recreateAudioFile = async () => {
      if (audioUrl && !audioFile) {
        try {
          console.log('[ImportStep] Recriando audioFile a partir do audioUrl...');
          // Converte data URL para Blob e depois para File
          const response = await fetch(audioUrl);
          const blob = await response.blob();
          // Detecta o tipo do arquivo a partir do data URL ou usa mp3 como padrão
          const mimeType = audioUrl.match(/data:([^;]+);/)?.[1] || 'audio/mpeg';
          const extension = mimeType.split('/')[1] || 'mp3';
          const file = new File([blob], `audio-restored.${extension}`, { type: mimeType });
          setAudioFile(file);
          console.log('[ImportStep] audioFile recriado:', file.name, file.size, file.type);
        } catch (error) {
          console.error('[ImportStep] Erro ao recriar audioFile:', error);
        }
      }
    };
    recreateAudioFile();
  }, [audioUrl, audioFile]);

  // Função para verificar se transcrição está configurada (carrega fresh a cada chamada)
  const checkWhisperConfig = useCallback(() => {
    const config = loadApiConfig();
    const provider = (config.whisper?.provider || 'openai') as TranscriptionProvider;
    return {
      isConfigured: config.whisper?.enabled && config.whisper?.apiKey?.length > 0,
      provider,
      providerName: TRANSCRIPTION_PROVIDER_NAMES[provider] || 'OpenAI Whisper',
      config,
    };
  }, []);

  // Estado para forçar re-render quando configuração muda
  const [, forceUpdate] = useState(0);
  
  // Verifica configuração atual (para UI)
  const { isConfigured: isWhisperConfigured, provider: currentProvider, providerName: currentProviderName } = useMemo(() => checkWhisperConfig(), [checkWhisperConfig, forceUpdate]);

  // Recarrega configuração quando componente recebe foco (volta das configurações)
  useEffect(() => {
    const handleFocus = () => {
      forceUpdate(n => n + 1);
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Handler para arquivo SRT
  const handleSrtFile = useCallback(
    async (file: File) => {
      setSrtError(null);

      if (!file.name.toLowerCase().endsWith('.srt')) {
        setSrtError('Por favor, selecione um arquivo .srt');
        return;
      }

      try {
        const content = await file.text();
        const parsed = parseSRT(content, fps);

        if (parsed.length === 0) {
          setSrtError('O arquivo SRT está vazio ou em formato inválido');
          return;
        }

        onSubtitlesLoaded(parsed);
      } catch (error) {
        setSrtError('Erro ao processar arquivo SRT');
        console.error('SRT parse error:', error);
      }
    },
    [fps, onSubtitlesLoaded]
  );

  // Handler para arquivo de áudio
  const handleAudioFile = useCallback(
    async (file: File) => {
      setAudioError(null);
      setTranscriptionError(null);

      const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a'];
      const isValidType = validTypes.some(
        (type) => file.type === type || file.name.toLowerCase().match(/\.(mp3|wav|ogg|m4a)$/)
      );

      if (!isValidType) {
        setAudioError('Formato de áudio não suportado. Use MP3, WAV, OGG ou M4A.');
        return;
      }

      // Verifica tamanho do arquivo (limite depende do provedor)
      const { provider } = checkWhisperConfig();
      const maxSize = getMaxFileSize(provider);
      if (!isFileSizeValid(file, provider)) {
        setAudioError(`Arquivo muito grande (${formatFileSize(file.size)}). O limite é ${maxSize}MB.`);
        return;
      }

      // Guarda referência ao arquivo para transcrição
      setAudioFile(file);
      
      // Limpa transcrição anterior quando novo áudio é carregado
      setGeneratedSrtContent(null);
      setGeneratedSubtitles([]);

      try {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          if (result) {
            onAudioLoaded(result);
          }
        };
        reader.onerror = () => {
          setAudioError('Erro ao ler arquivo de áudio');
        };
        reader.readAsDataURL(file);
      } catch (error) {
        setAudioError('Erro ao processar arquivo de áudio');
        console.error('Audio load error:', error);
      }
    },
    [onAudioLoaded]
  );

  // Handler para arquivo de narração (texto do áudio)
  const handleNarrationFile = useCallback(
    async (file: File) => {
      setNarrationError(null);

      if (!file.name.toLowerCase().endsWith('.txt')) {
        setNarrationError('Por favor, selecione um arquivo .txt');
        return;
      }

      try {
        const content = await file.text();
        
        if (!content.trim()) {
          setNarrationError('O arquivo está vazio.');
          return;
        }

        setNarrationText(content.trim());
        console.log('Narração carregada:', content.substring(0, 100) + '...');
      } catch (error) {
        setNarrationError('Erro ao processar arquivo de narração');
        console.error('Narration parse error:', error);
      }
    },
    []
  );

  // Handler para limpar narração
  const handleClearNarration = useCallback(() => {
    setNarrationText('');
  }, []);

  // Handlers de drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleSrtDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingSrt(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleSrtFile(file);
      }
    },
    [handleSrtFile]
  );

  const handleAudioDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingAudio(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleAudioFile(file);
      }
    },
    [handleAudioFile]
  );

  const handleNarrationDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingNarration(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleNarrationFile(file);
      }
    },
    [handleNarrationFile]
  );

  // Input file handlers
  const handleSrtInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleSrtFile(file);
      }
    },
    [handleSrtFile]
  );

  const handleAudioInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleAudioFile(file);
      }
    },
    [handleAudioFile]
  );

  const handleNarrationInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleNarrationFile(file);
      }
    },
    [handleNarrationFile]
  );

  // Handler para transcrição com Whisper
  const handleTranscribe = useCallback(async () => {
    if (!audioFile) {
      setTranscriptionError('Nenhum arquivo de áudio carregado.');
      return;
    }

    // Carrega configuração fresh no momento da transcrição
    const { isConfigured, provider, providerName, config: apiConfig } = checkWhisperConfig();

    console.log('[Transcription] Verificando configuração:', {
      isConfigured,
      provider,
      providerName,
      hasApiKey: !!apiConfig.whisper?.apiKey,
      apiKeyLength: apiConfig.whisper?.apiKey?.length || 0,
      enabled: apiConfig.whisper?.enabled,
      language: apiConfig.whisper?.language,
      model: apiConfig.whisper?.model,
    });

    if (!isConfigured) {
      setTranscriptionError(`Configure a API de transcrição (${providerName}) nas Configurações antes de transcrever. Verifique se está habilitada e se a API Key foi preenchida.`);
      forceUpdate(n => n + 1); // Força re-render para atualizar UI
      return;
    }

    if (!apiConfig.whisper?.apiKey) {
      setTranscriptionError(`API Key não encontrada. Vá em Menu → Configurações e adicione sua API Key do ${providerName}.`);
      return;
    }

    // Valida intervalo de duração
    if (minDuration >= maxDuration) {
      setTranscriptionError('A duração mínima deve ser menor que a máxima.');
      return;
    }

    setIsTranscribing(true);
    setTranscriptionError(null);
    setTranscriptionProgress('Enviando áudio para transcrição...');

    try {
      const whisperConfig: WhisperConfig = {
        apiKey: apiConfig.whisper.apiKey,
        provider,
        model: apiConfig.whisper.model,
        language: apiConfig.whisper.language || 'pt',
        segmentGrouping: {
          minDuration,
          maxDuration,
          targetDuration: Math.round((minDuration + maxDuration) / 2),
        },
      };

      console.log('[Transcription] Iniciando transcrição com config:', {
        ...whisperConfig,
        apiKey: whisperConfig.apiKey ? `${whisperConfig.apiKey.substring(0, 10)}...` : 'VAZIA',
      });

      let result;

      if (narrationText) {
        // Se tem texto de narração, usa para alinhar com os timestamps
        setTranscriptionProgress(`Transcrevendo áudio via ${providerName} e alinhando com narração...`);
        result = await transcribeWithNarration(audioFile, narrationText, whisperConfig);
      } else {
        // Transcrição normal
        setTranscriptionProgress(`Transcrevendo áudio via ${providerName}...`);
        result = await transcribeAudio(audioFile, whisperConfig);
      }

      if (!result.success) {
        setTranscriptionError(result.error || 'Erro na transcrição');
        setIsTranscribing(false);
        return;
      }

      setTranscriptionProgress('Processando legendas...');

      if (result.srt) {
        // Parse do SRT gerado
        const parsed = parseSRT(result.srt, fps);
        
        setGeneratedSrtContent(result.srt);
        setGeneratedSubtitles(parsed);
        const mode = narrationText ? 'com texto da narração' : 'via transcrição';
        setTranscriptionProgress(`Concluído ${mode}! ${parsed.length} legendas geradas.`);
      } else {
        setTranscriptionError('A transcrição não retornou legendas.');
      }
    } catch (error) {
      setTranscriptionError(error instanceof Error ? error.message : 'Erro durante a transcrição.');
      console.error('Transcription error:', error);
    } finally {
      setIsTranscribing(false);
    }
  }, [audioFile, checkWhisperConfig, minDuration, maxDuration, fps, narrationText]);

  // Handler para usar legendas geradas no projeto
  const handleUseGeneratedSubtitles = useCallback(() => {
    if (generatedSubtitles.length > 0) {
      onSubtitlesLoaded(generatedSubtitles);
      // Limpa estado de transcrição após usar
      setGeneratedSrtContent(null);
      setGeneratedSubtitles([]);
      setTranscriptionProgress('');
    }
  }, [generatedSubtitles, onSubtitlesLoaded]);

  // Handler para download do SRT gerado
  const handleDownloadSrt = useCallback(() => {
    if (!generatedSrtContent) return;

    const blob = new Blob([generatedSrtContent], { type: 'text/srt' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `legendas-geradas-${Date.now()}.srt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [generatedSrtContent]);

  // Função auxiliar para formatar timestamp no formato SRT (00:00:00,000)
  const formatSrtTimestamp = useCallback((ms: number): string => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = ms % 1000;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
  }, []);

  // Handler para download das legendas carregadas no projeto
  const handleDownloadSubtitles = useCallback(() => {
    if (subtitles.length === 0) return;

    // Converte as legendas para formato SRT
    const srtContent = subtitles.map((sub) => {
      const startTime = formatSrtTimestamp(sub.startTime);
      const endTime = formatSrtTimestamp(sub.endTime);
      return `${sub.id}\n${startTime} --> ${endTime}\n${sub.text}\n`;
    }).join('\n');

    const blob = new Blob([srtContent], { type: 'text/srt' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `legendas-projeto-${Date.now()}.srt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [subtitles, formatSrtTimestamp]);

  const canProceed = subtitles.length > 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 32,
        padding: 32,
        maxWidth: 800,
        margin: '0 auto',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      <div>
        <h2 style={{ color: 'white', marginBottom: 8 }}>Passo 1: Importar Arquivos</h2>
        <p style={{ color: '#888', margin: 0 }}>
          Importe seu arquivo de legendas (.srt) e opcionalmente o áudio.
        </p>
        <p style={{ color: '#fbbf24', fontSize: 13, marginTop: 8 }}>
          Se não tiver um arquivo .srt, você pode carregar apenas o áudio e gerar as legendas automaticamente via OpenAI Whisper ou Groq.
        </p>
      </div>

      {/* Upload SRT */}
      <div>
        <h3 style={{ color: 'white', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          📝 Arquivo de Legendas (SRT)
          <span style={{ color: audioUrl && !subtitles.length ? '#fbbf24' : '#ef4444', fontSize: 12 }}>
            {audioUrl && !subtitles.length ? 'Ou gere via áudio abaixo' : '*Obrigatório'}
          </span>
        </h3>
        <div
          onDragOver={handleDragOver}
          onDragEnter={() => setIsDraggingSrt(true)}
          onDragLeave={() => setIsDraggingSrt(false)}
          onDrop={handleSrtDrop}
          style={{
            border: `2px dashed ${isDraggingSrt ? '#6366f1' : subtitles.length > 0 ? '#22c55e' : '#4a4a6e'}`,
            borderRadius: 12,
            padding: 32,
            textAlign: 'center',
            backgroundColor: isDraggingSrt ? 'rgba(99, 102, 241, 0.1)' : '#1a1a2e',
            transition: 'all 0.2s',
          }}
        >
          {subtitles.length > 0 ? (
            <div style={{ color: '#22c55e' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{subtitles.length} legendas carregadas</div>
              <div style={{ color: '#888', marginTop: 8 }}>
                Duração total: {Math.round(subtitles[subtitles.length - 1].endTime / 1000)} segundos
              </div>
            </div>
          ) : (
            <>
              <div style={{ color: '#888', marginBottom: 16 }}>
                Arraste e solte seu arquivo .srt aqui ou
              </div>
              <label
                style={{
                  display: 'inline-block',
                  padding: '12px 24px',
                  backgroundColor: '#6366f1',
                  color: 'white',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Selecionar Arquivo
                <input
                  type="file"
                  accept=".srt"
                  onChange={handleSrtInput}
                  style={{ display: 'none' }}
                />
              </label>
            </>
          )}
        </div>
        {srtError && (
          <div style={{ color: '#ef4444', marginTop: 8, fontSize: 14 }}>{srtError}</div>
        )}
      </div>

      {/* Upload Áudio */}
      <div>
        <h3 style={{ color: 'white', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          🎵 Arquivo de Áudio
          <span style={{ color: subtitles.length > 0 ? '#888' : '#fbbf24', fontSize: 12 }}>
            {subtitles.length > 0 ? 'Opcional' : 'Carregue para gerar legendas'}
          </span>
        </h3>
        <div
          onDragOver={handleDragOver}
          onDragEnter={() => setIsDraggingAudio(true)}
          onDragLeave={() => setIsDraggingAudio(false)}
          onDrop={handleAudioDrop}
          style={{
            border: `2px dashed ${isDraggingAudio ? '#6366f1' : audioUrl ? '#22c55e' : '#4a4a6e'}`,
            borderRadius: 12,
            padding: 32,
            textAlign: 'center',
            backgroundColor: isDraggingAudio ? 'rgba(99, 102, 241, 0.1)' : '#1a1a2e',
            transition: 'all 0.2s',
          }}
        >
          {audioUrl ? (
            <div style={{ color: '#22c55e' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>Áudio carregado</div>
              <audio
                controls
                src={audioUrl}
                style={{ marginTop: 16, width: '100%', maxWidth: 400 }}
              />
            </div>
          ) : (
            <>
              <div style={{ color: '#888', marginBottom: 16 }}>
                Arraste e solte seu arquivo de áudio ou
              </div>
              <label
                style={{
                  display: 'inline-block',
                  padding: '12px 24px',
                  backgroundColor: '#4a4a6e',
                  color: 'white',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Selecionar Áudio
                <input
                  type="file"
                  accept="audio/*,.mp3,.wav,.ogg,.m4a"
                  onChange={handleAudioInput}
                  style={{ display: 'none' }}
                />
              </label>
            </>
          )}
        </div>
        {audioError && (
          <div style={{ color: '#ef4444', marginTop: 8, fontSize: 14 }}>{audioError}</div>
        )}
      </div>

      {/* Bloco de Transcrição - aparece quando há áudio mas não há legendas */}
      {audioUrl && subtitles.length === 0 && (
        <div
          style={{
            backgroundColor: '#1a1a2e',
            borderRadius: 12,
            padding: 24,
            border: '2px solid #6366f1',
          }}
        >
          <h3 style={{ color: 'white', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            🎙️ Gerar Legendas a partir do Áudio
          </h3>

          {!isWhisperConfigured && (
            <div
              style={{
                backgroundColor: 'rgba(251, 191, 36, 0.1)',
                border: '1px solid #fbbf24',
                borderRadius: 8,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <p style={{ color: '#fbbf24', margin: 0, fontSize: 14 }}>
                ⚠️ A API de transcrição não está configurada. Vá em <strong>Menu → Configurações</strong> para selecionar um provedor (OpenAI Whisper ou Groq) e adicionar sua API Key.
              </p>
            </div>
          )}

          {/* Configuração de intervalo */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ color: '#ccc', fontSize: 14, marginBottom: 12 }}>
              Defina o intervalo de duração para cada legenda (em segundos):
            </div>
            <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ color: '#888', fontSize: 14 }}>Mínimo:</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={minDuration}
                  onChange={(e) => setMinDuration(Math.max(1, parseInt(e.target.value) || 5))}
                  disabled={isTranscribing}
                  style={{
                    width: 60,
                    padding: '8px 12px',
                    backgroundColor: '#2a2a4e',
                    border: '1px solid #4a4a6e',
                    borderRadius: 6,
                    color: 'white',
                    fontSize: 14,
                  }}
                />
                <span style={{ color: '#888', fontSize: 14 }}>s</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ color: '#888', fontSize: 14 }}>Máximo:</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={maxDuration}
                  onChange={(e) => setMaxDuration(Math.max(1, parseInt(e.target.value) || 10))}
                  disabled={isTranscribing}
                  style={{
                    width: 60,
                    padding: '8px 12px',
                    backgroundColor: '#2a2a4e',
                    border: '1px solid #4a4a6e',
                    borderRadius: 6,
                    color: 'white',
                    fontSize: 14,
                  }}
                />
                <span style={{ color: '#888', fontSize: 14 }}>s</span>
              </div>
            </div>
            <div style={{ color: '#666', fontSize: 12, marginTop: 8 }}>
              Exemplo: 5 a 10 segundos gera legendas entre esses intervalos de tempo.
            </div>
          </div>

          {/* Indicador de modo */}
          {narrationText && (
            <div
              style={{
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid #22c55e',
                borderRadius: 8,
                padding: 12,
                marginBottom: 16,
              }}
            >
              <p style={{ color: '#22c55e', margin: 0, fontSize: 14 }}>
                ✓ Texto de narração carregado. O SRT será gerado com o texto exato da narração.
              </p>
            </div>
          )}

          {/* Botão de transcrever */}
          <button
            onClick={handleTranscribe}
            disabled={!isWhisperConfigured || isTranscribing}
            style={{
              padding: '12px 24px',
              backgroundColor: isWhisperConfigured && !isTranscribing ? '#6366f1' : '#4a4a6e',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: isWhisperConfigured && !isTranscribing ? 'pointer' : 'not-allowed',
              opacity: isWhisperConfigured && !isTranscribing ? 1 : 0.6,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {isTranscribing ? (
              <>
                <span style={{ 
                  display: 'inline-block',
                  width: 16,
                  height: 16,
                  border: '2px solid white',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }} />
                {narrationText ? 'Processando...' : 'Transcrevendo...'}
              </>
            ) : (
              <>{narrationText ? '📝 Gerar SRT com Narração' : `🎙️ Transcrever com ${currentProviderName}`}</>
            )}
          </button>

          {/* CSS para animação de loading */}
          <style>{`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>

          {/* Progresso/Status */}
          {transcriptionProgress && !transcriptionError && (
            <div style={{ color: '#22c55e', marginTop: 12, fontSize: 14 }}>
              {transcriptionProgress}
            </div>
          )}

          {/* Erro de transcrição */}
          {transcriptionError && (
            <div style={{ color: '#ef4444', marginTop: 12, fontSize: 14 }}>
              {transcriptionError}
            </div>
          )}

          {/* Preview das legendas geradas */}
          {generatedSubtitles.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h4 style={{ color: 'white', marginBottom: 12 }}>
                Preview: {generatedSubtitles.length} legendas geradas
              </h4>
              <div
                style={{
                  maxHeight: 150,
                  overflowY: 'auto',
                  backgroundColor: '#0f0f1a',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 16,
                }}
              >
                {generatedSubtitles.slice(0, 5).map((sub, index) => (
                  <div
                    key={sub.id}
                    style={{
                      display: 'flex',
                      gap: 12,
                      padding: '6px 0',
                      borderBottom: index < 4 ? '1px solid #2a2a4e' : 'none',
                    }}
                  >
                    <span style={{ color: '#6366f1', fontWeight: 600, minWidth: 24 }}>
                      {sub.id}
                    </span>
                    <span style={{ color: '#888', fontFamily: 'monospace', fontSize: 11, minWidth: 50 }}>
                      {formatAudioDuration(sub.startTime / 1000)}
                    </span>
                    <span style={{ color: '#ccc', flex: 1, fontSize: 13 }}>{sub.text}</span>
                  </div>
                ))}
                {generatedSubtitles.length > 5 && (
                  <div style={{ color: '#666', textAlign: 'center', paddingTop: 8, fontSize: 12 }}>
                    ... e mais {generatedSubtitles.length - 5} legendas
                  </div>
                )}
              </div>

              {/* Botões de ação */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button
                  onClick={handleUseGeneratedSubtitles}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#22c55e',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  ✓ Usar no Projeto
                </button>
                <button
                  onClick={handleDownloadSrt}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#4a4a6e',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  ⬇️ Baixar .srt
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upload Arquivo de Narração - aparece quando há áudio */}
      {audioUrl && subtitles.length === 0 && (
        <div>
          <h3 style={{ color: 'white', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            📄 Arquivo de Narração (TXT)
            <span style={{ color: '#888', fontSize: 12 }}>Opcional - Melhora a precisão</span>
          </h3>
          <p style={{ color: '#888', fontSize: 13, marginBottom: 12, marginTop: 0 }}>
            Se você tem o texto exato do áudio, importe-o aqui. O SRT gerado usará esse texto com os tempos detectados pelo Whisper.
          </p>
          <div
            onDragOver={handleDragOver}
            onDragEnter={() => setIsDraggingNarration(true)}
            onDragLeave={() => setIsDraggingNarration(false)}
            onDrop={handleNarrationDrop}
            style={{
              border: `2px dashed ${isDraggingNarration ? '#6366f1' : narrationText ? '#22c55e' : '#4a4a6e'}`,
              borderRadius: 12,
              padding: 24,
              textAlign: 'center',
              backgroundColor: isDraggingNarration ? 'rgba(99, 102, 241, 0.1)' : '#1a1a2e',
              transition: 'all 0.2s',
            }}
          >
            {narrationText ? (
              <div style={{ color: '#22c55e', width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 24 }}>✓</span>
                    <span style={{ fontSize: 16, fontWeight: 600 }}>Narração carregada</span>
                    <span style={{ color: '#888', fontSize: 12 }}>({narrationText.length} caracteres)</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setShowAllNarration(!showAllNarration)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#4a4a6e',
                        border: 'none',
                        borderRadius: 6,
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: 12,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {showAllNarration ? '📖 Ocultar' : '📖 Ver Toda'}
                    </button>
                    <button
                      onClick={handleClearNarration}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#ef4444',
                        border: 'none',
                        borderRadius: 6,
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      ✕ Remover
                    </button>
                  </div>
                </div>
                <div style={{ color: '#ccc', textAlign: 'left' }}>
                  <div style={{
                    backgroundColor: '#0f0f1a',
                    padding: 12,
                    borderRadius: 8,
                    fontSize: 13,
                    maxHeight: showAllNarration ? 400 : 80,
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    transition: 'max-height 0.3s ease',
                  }}>
                    {showAllNarration ? narrationText : (
                      <>
                        {narrationText.substring(0, 200)}{narrationText.length > 200 ? '...' : ''}
                      </>
                    )}
                  </div>
                  {!showAllNarration && narrationText.length > 200 && (
                    <div
                      style={{
                        color: '#6366f1',
                        fontSize: 12,
                        marginTop: 8,
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                      onClick={() => setShowAllNarration(true)}
                    >
                      Clique para ver toda a narração
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div style={{ color: '#888', marginBottom: 12 }}>
                  Arraste e solte seu arquivo .txt com o texto da narração ou
                </div>
                <label
                  style={{
                    display: 'inline-block',
                    padding: '10px 20px',
                    backgroundColor: '#4a4a6e',
                    color: 'white',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Selecionar TXT
                  <input
                    type="file"
                    accept=".txt"
                    onChange={handleNarrationInput}
                    style={{ display: 'none' }}
                  />
                </label>
              </>
            )}
          </div>
          {narrationError && (
            <div style={{ color: '#ef4444', marginTop: 8, fontSize: 14 }}>{narrationError}</div>
          )}
        </div>
      )}

      {/* Preview das legendas */}
      {subtitles.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ color: 'white', margin: 0 }}>Legendas Carregadas ({subtitles.length})</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setShowAllSubtitles(!showAllSubtitles)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#4a4a6e',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {showAllSubtitles ? '📖 Ocultar Todas' : '📖 Ver Todas'}
              </button>
              <button
                onClick={handleDownloadSubtitles}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#22c55e',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                ⬇️ Baixar .srt
              </button>
            </div>
          </div>
          <div
            style={{
              maxHeight: showAllSubtitles ? 400 : 200,
              overflowY: 'auto',
              backgroundColor: '#1a1a2e',
              borderRadius: 8,
              padding: 16,
              transition: 'max-height 0.3s ease',
            }}
          >
            {(showAllSubtitles ? subtitles : subtitles.slice(0, 10)).map((sub, index) => (
              <div
                key={sub.id}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '8px 0',
                  borderBottom: index < (showAllSubtitles ? subtitles.length - 1 : 9) ? '1px solid #2a2a4e' : 'none',
                }}
              >
                <span style={{ color: '#6366f1', fontWeight: 600, minWidth: 30 }}>
                  {sub.id}
                </span>
                <span style={{ color: '#888', fontFamily: 'monospace', fontSize: 12, minWidth: 50 }}>
                  {Math.floor(sub.startTime / 1000)}s
                </span>
                <span style={{ color: '#ccc', flex: 1 }}>{sub.text}</span>
              </div>
            ))}
            {!showAllSubtitles && subtitles.length > 10 && (
              <div
                style={{
                  color: '#6366f1',
                  textAlign: 'center',
                  paddingTop: 12,
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
                onClick={() => setShowAllSubtitles(true)}
              >
                Clique para ver todas as {subtitles.length} legendas
              </div>
            )}
          </div>
        </div>
      )}

      {/* Botões de navegação */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {/* Botão Salvar */}
        {onSave && (
          <button
            onClick={onSave}
            style={{
              padding: '12px 24px',
              backgroundColor: '#22c55e',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>💾</span>
            <span>Salvar</span>
          </button>
        )}
        {!onSave && <div />}

        <button
          onClick={onNext}
          disabled={!canProceed}
          style={{
            padding: '14px 32px',
            backgroundColor: canProceed ? '#6366f1' : '#4a4a6e',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 600,
            cursor: canProceed ? 'pointer' : 'not-allowed',
            opacity: canProceed ? 1 : 0.5,
          }}
        >
          Próximo: Prompts →
        </button>
      </div>
    </div>
  );
};

export default ImportStep;
