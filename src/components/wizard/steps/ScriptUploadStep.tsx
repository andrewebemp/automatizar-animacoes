import React, { useCallback, useRef, useState } from 'react';
import {
  convertScriptToSrt,
  scriptToSubtitles,
  estimateTotalDuration,
  formatDuration,
  type SrtGenerationConfig,
} from '../../../utils/scriptToSrt';
import {
  transcribeAudio,
  isAudioFile,
  isFileSizeValid,
  formatFileSize,
  type WhisperConfig,
} from '../../../utils/whisperApi';
import { loadApiConfig } from '../../../types/ApiConfig';

interface ScriptUploadStepProps {
  onScriptConverted: (srtContent: string, audioUrl?: string) => void;
  onSkipToSrt: () => void;
}

type FileType = 'mp3' | 'txt' | 'srt';

interface UploadedFile {
  type: FileType;
  name: string;
  content?: string;
  file?: File;
}

const styles: Record<string, React.CSSProperties> = {
  scrollContainer: {
    height: '100%',
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: '32px 24px 48px',
    minHeight: 'min-content',
  },
  title: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#fff',
    marginBottom: '8px',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: '14px',
    color: '#94a3b8',
    marginBottom: '24px',
    textAlign: 'center',
    maxWidth: '600px',
  },
  mainContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    width: '100%',
    maxWidth: '800px',
  },
  uploadGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '16px',
  },
  uploadCard: {
    padding: '24px 16px',
    border: '2px dashed rgba(255, 255, 255, 0.2)',
    borderRadius: '16px',
    background: 'rgba(0, 0, 0, 0.2)',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  uploadCardActive: {
    borderColor: '#00d4ff',
    background: 'rgba(0, 212, 255, 0.1)',
    transform: 'scale(1.02)',
  },
  uploadCardSuccess: {
    borderColor: '#22c55e',
    borderStyle: 'solid',
    background: 'rgba(34, 197, 94, 0.1)',
  },
  uploadCardMp3: {
    borderColor: 'rgba(236, 72, 153, 0.4)',
    background: 'rgba(236, 72, 153, 0.05)',
  },
  uploadCardTxt: {
    borderColor: 'rgba(0, 212, 255, 0.4)',
    background: 'rgba(0, 212, 255, 0.05)',
  },
  uploadCardSrt: {
    borderColor: 'rgba(124, 58, 237, 0.4)',
    background: 'rgba(124, 58, 237, 0.05)',
  },
  cardIcon: {
    fontSize: '36px',
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#fff',
  },
  cardSubtitle: {
    fontSize: '12px',
    color: '#64748b',
  },
  cardFileName: {
    fontSize: '12px',
    color: '#22c55e',
    fontWeight: 500,
    wordBreak: 'break-all',
  },
  cardRemoveButton: {
    fontSize: '11px',
    color: '#ef4444',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '4px',
    transition: 'background 0.2s',
  },
  // Botão de continuar destacado
  continueSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '20px',
    background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(0, 212, 255, 0.1))',
    borderRadius: '16px',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    marginTop: '8px',
  },
  continueTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#22c55e',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  continueButton: {
    padding: '16px 48px',
    borderRadius: '12px',
    border: 'none',
    background: 'linear-gradient(135deg, #22c55e, #00d4ff)',
    color: '#fff',
    fontSize: '16px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  continueFlow: {
    fontSize: '12px',
    color: '#94a3b8',
  },
  orDivider: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    margin: '8px 0',
    color: '#64748b',
    fontSize: '14px',
  },
  orDividerLine: {
    flex: 1,
    height: '1px',
    background: 'rgba(100, 116, 139, 0.3)',
  },
  orDividerText: {
    padding: '0 16px',
    color: '#64748b',
    fontSize: '14px',
    fontWeight: 500,
  },
  optionalSection: {
    width: '100%',
    background: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '12px',
    padding: '16px',
  },
  optionalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
    cursor: 'pointer',
  },
  optionalTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#94a3b8',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  optionalToggle: {
    fontSize: '12px',
    color: '#64748b',
    padding: '4px 8px',
    borderRadius: '4px',
    background: 'rgba(255, 255, 255, 0.05)',
  },
  textarea: {
    width: '100%',
    minHeight: '120px',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid rgba(0, 212, 255, 0.3)',
    background: 'rgba(0, 0, 0, 0.3)',
    color: '#fff',
    fontSize: '13px',
    fontFamily: 'inherit',
    resize: 'vertical',
    lineHeight: 1.6,
    outline: 'none',
  },
  configRow: {
    display: 'flex',
    gap: '16px',
    marginTop: '12px',
    flexWrap: 'wrap',
  },
  configItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: '140px',
  },
  configLabel: {
    fontSize: '12px',
    color: '#94a3b8',
    fontWeight: 500,
  },
  configSelect: {
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(0, 212, 255, 0.3)',
    background: 'rgba(0, 0, 0, 0.3)',
    color: '#fff',
    fontSize: '13px',
    cursor: 'pointer',
    outline: 'none',
  },
  previewSection: {
    marginTop: '12px',
    padding: '12px',
    background: 'rgba(0, 212, 255, 0.1)',
    borderRadius: '8px',
    border: '1px solid rgba(0, 212, 255, 0.2)',
  },
  previewTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#00d4ff',
    marginBottom: '8px',
  },
  previewStats: {
    display: 'flex',
    gap: '20px',
    flexWrap: 'wrap',
  },
  previewStat: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  previewStatLabel: {
    fontSize: '10px',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  previewStatValue: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#fff',
  },
  errorText: {
    padding: '12px 16px',
    background: 'rgba(239, 68, 68, 0.1)',
    borderRadius: '8px',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#ef4444',
    fontSize: '14px',
  },
  warningText: {
    padding: '12px 16px',
    background: 'rgba(234, 179, 8, 0.1)',
    borderRadius: '8px',
    border: '1px solid rgba(234, 179, 8, 0.3)',
    color: '#eab308',
    fontSize: '13px',
  },
  loadingOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  loadingText: {
    color: '#fff',
    fontSize: '18px',
    fontWeight: 600,
    marginTop: '16px',
  },
  loadingSubtext: {
    color: '#94a3b8',
    fontSize: '14px',
    marginTop: '8px',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid rgba(0, 212, 255, 0.3)',
    borderTop: '4px solid #00d4ff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
};

const SPEECH_SPEED_OPTIONS = [
  { value: 12, label: 'Lento (12 char/s)' },
  { value: 15, label: 'Normal (15 char/s)' },
  { value: 18, label: 'Rápido (18 char/s)' },
];

export const ScriptUploadStep: React.FC<ScriptUploadStepProps> = ({
  onScriptConverted,
}) => {
  const mp3InputRef = useRef<HTMLInputElement>(null);
  const txtInputRef = useRef<HTMLInputElement>(null);
  const srtInputRef = useRef<HTMLInputElement>(null);

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [pastedContent, setPastedContent] = useState('');
  const [speechSpeed, setSpeechSpeed] = useState(15);
  const [error, setError] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionProgress, setTranscriptionProgress] = useState('');
  const [draggingType, setDraggingType] = useState<FileType | null>(null);
  const [showOptionalSection, setShowOptionalSection] = useState(false);

  // Check if Whisper API is configured
  const apiConfig = loadApiConfig();
  const isWhisperConfigured = apiConfig.whisper?.apiKey && apiConfig.whisper?.enabled;

  // Get uploaded file by type
  const getFile = (type: FileType) => uploadedFiles.find((f) => f.type === type);

  // Preview stats for text content
  const getPreviewStats = useCallback(() => {
    const txtFile = getFile('txt');
    const content = txtFile?.content || pastedContent;

    if (!content?.trim()) return null;

    const config: Partial<SrtGenerationConfig> = {
      charsPerSecond: speechSpeed,
    };

    const subtitles = scriptToSubtitles(content, config);
    const totalDuration = estimateTotalDuration(content, config);

    return {
      subtitleCount: subtitles.length,
      duration: formatDuration(totalDuration),
      charCount: content.length,
      wordCount: content.split(/\s+/).filter((w) => w.length > 0).length,
    };
  }, [uploadedFiles, pastedContent, speechSpeed]);

  const previewStats = getPreviewStats();

  // Handle file upload
  const handleFileUpload = useCallback(
    async (file: File, type: FileType) => {
      setError(null);

      if (type === 'mp3') {
        if (!isAudioFile(file)) {
          setError('Por favor, selecione um arquivo de áudio válido (MP3, WAV, M4A, etc.)');
          return;
        }
        if (!isFileSizeValid(file)) {
          setError(`Arquivo muito grande. Tamanho máximo: 25MB. Seu arquivo: ${formatFileSize(file.size)}`);
          return;
        }
        if (!isWhisperConfigured) {
          setError('Configure a API Whisper nas Configurações para transcrever áudios.');
          return;
        }

        setUploadedFiles((prev) => [
          ...prev.filter((f) => f.type !== 'mp3'),
          { type: 'mp3', name: file.name, file },
        ]);
      } else if (type === 'txt') {
        if (!file.name.toLowerCase().endsWith('.txt')) {
          setError('Por favor, selecione um arquivo .txt válido');
          return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          setUploadedFiles((prev) => [
            ...prev.filter((f) => f.type !== 'txt'),
            { type: 'txt', name: file.name, content },
          ]);
        };
        reader.onerror = () => setError('Erro ao ler o arquivo TXT');
        reader.readAsText(file);
      } else if (type === 'srt') {
        if (!file.name.toLowerCase().endsWith('.srt')) {
          setError('Por favor, selecione um arquivo .srt válido');
          return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          setUploadedFiles((prev) => [
            ...prev.filter((f) => f.type !== 'srt'),
            { type: 'srt', name: file.name, content },
          ]);
        };
        reader.onerror = () => setError('Erro ao ler o arquivo SRT');
        reader.readAsText(file);
      }
    },
    [isWhisperConfigured]
  );

  // Remove uploaded file
  const removeFile = (type: FileType) => {
    setUploadedFiles((prev) => prev.filter((f) => f.type !== type));
    setError(null);
  };

  // Helper to convert File to base64 data URL
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Process all uploads and generate SRT
  const processAndContinue = useCallback(async () => {
    setError(null);

    const mp3File = getFile('mp3');
    const txtFile = getFile('txt');
    const srtFile = getFile('srt');
    const textContent = txtFile?.content || pastedContent;

    // Helper to get audio URL if mp3 is uploaded
    const getAudioUrl = async (): Promise<string | undefined> => {
      if (mp3File?.file) {
        try {
          return await fileToBase64(mp3File.file);
        } catch (err) {
          console.error('Erro ao converter áudio para base64:', err);
        }
      }
      return undefined;
    };

    // Priority: SRT > TXT > MP3
    // If SRT is uploaded, use it directly
    if (srtFile?.content) {
      const audioUrl = await getAudioUrl();
      onScriptConverted(srtFile.content, audioUrl);
      return;
    }

    // If TXT is available (uploaded or pasted), convert to SRT
    if (textContent?.trim()) {
      if (textContent.trim().length < 20) {
        setError('O roteiro é muito curto. Adicione mais conteúdo.');
        return;
      }

      try {
        const config: Partial<SrtGenerationConfig> = {
          charsPerSecond: speechSpeed,
        };
        const srtContent = convertScriptToSrt(textContent, config);
        const audioUrl = await getAudioUrl();
        onScriptConverted(srtContent, audioUrl);
        return;
      } catch (err) {
        setError('Erro ao converter roteiro para SRT.');
        console.error(err);
        return;
      }
    }

    // If only MP3, transcribe first
    if (mp3File?.file) {
      if (!isWhisperConfigured) {
        setError('Configure a API Whisper nas Configurações para transcrever áudios.');
        return;
      }

      setIsTranscribing(true);
      setTranscriptionProgress('Enviando áudio para transcrição...');

      try {
        const whisperConfig: WhisperConfig = {
          apiKey: apiConfig.whisper.apiKey,
          language: apiConfig.whisper.language || 'pt',
        };

        setTranscriptionProgress('Transcrevendo áudio via Whisper API...');
        const result = await transcribeAudio(mp3File.file, whisperConfig);

        if (!result.success) {
          setError(result.error || 'Erro na transcrição');
          setIsTranscribing(false);
          return;
        }

        setTranscriptionProgress('Transcrição concluída!');

        // Convert audio to base64 for use in video
        const audioUrl = await getAudioUrl();

        // Whisper returns SRT directly
        if (result.srt) {
          setTimeout(() => {
            setIsTranscribing(false);
            onScriptConverted(result.srt!, audioUrl);
          }, 500);
        } else if (result.text) {
          // Fallback: convert text to SRT
          const config: Partial<SrtGenerationConfig> = {
            charsPerSecond: speechSpeed,
          };
          const srtContent = convertScriptToSrt(result.text, config);
          setTimeout(() => {
            setIsTranscribing(false);
            onScriptConverted(srtContent, audioUrl);
          }, 500);
        }
      } catch (err) {
        setError('Erro durante a transcrição do áudio.');
        console.error(err);
        setIsTranscribing(false);
      }
      return;
    }

    setError('Faça upload de pelo menos um arquivo (MP3, TXT ou SRT) ou cole o roteiro.');
  }, [
    uploadedFiles,
    pastedContent,
    speechSpeed,
    isWhisperConfigured,
    apiConfig,
    onScriptConverted,
  ]);

  // Drag and drop handlers
  const handleDrop = (e: React.DragEvent, type: FileType) => {
    e.preventDefault();
    setDraggingType(null);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file, type);
    }
  };

  const handleDragOver = (e: React.DragEvent, type: FileType) => {
    e.preventDefault();
    setDraggingType(type);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggingType(null);
  };

  // Determine what will be processed
  const getProcessingFlow = () => {
    const mp3 = getFile('mp3');
    const txt = getFile('txt');
    const srt = getFile('srt');
    const hasText = txt?.content || pastedContent?.trim();

    if (srt) return 'SRT → Continuar';
    if (hasText) return 'TXT → SRT → Continuar';
    if (mp3) return 'MP3 → Transcrição → SRT → Continuar';
    return '';
  };

  const processingFlow = getProcessingFlow();
  const canProcess = uploadedFiles.length > 0 || pastedContent?.trim();
  const uploadCount = uploadedFiles.length;

  return (
    <div style={styles.scrollContainer}>
      {/* Loading Overlay */}
      {isTranscribing && (
        <div style={styles.loadingOverlay}>
          <div style={styles.spinner} />
          <div style={styles.loadingText}>Transcrevendo Áudio</div>
          <div style={styles.loadingSubtext}>{transcriptionProgress}</div>
        </div>
      )}

      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>

      <div style={styles.container}>
        <div style={styles.title}>Upload de Arquivos</div>
        <div style={styles.subtitle}>
          Faça upload do áudio (MP3), roteiro (TXT) e/ou legendas (SRT). Se apenas o MP3 for
          fornecido, usaremos a Whisper API para transcrever automaticamente.
        </div>

        <div style={styles.mainContent}>
          {/* Upload Cards Grid */}
          <div style={styles.uploadGrid}>
            {/* MP3 Card */}
            <div
              style={{
                ...styles.uploadCard,
                ...styles.uploadCardMp3,
                ...(draggingType === 'mp3' ? styles.uploadCardActive : {}),
                ...(getFile('mp3') ? styles.uploadCardSuccess : {}),
              }}
              onClick={() => mp3InputRef.current?.click()}
              onDrop={(e) => handleDrop(e, 'mp3')}
              onDragOver={(e) => handleDragOver(e, 'mp3')}
              onDragLeave={handleDragLeave}
            >
              <div style={styles.cardIcon}>🎵</div>
              <div style={styles.cardTitle}>Áudio (MP3)</div>
              <div style={styles.cardSubtitle}>
                {isWhisperConfigured ? 'Transcrição automática' : '⚠️ Configure Whisper API'}
              </div>
              {getFile('mp3') ? (
                <>
                  <div style={styles.cardFileName}>✓ {getFile('mp3')?.name}</div>
                  <button
                    style={styles.cardRemoveButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile('mp3');
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    Remover
                  </button>
                </>
              ) : (
                <div style={{ fontSize: '12px', color: '#64748b' }}>Arraste ou clique</div>
              )}
              <input
                ref={mp3InputRef}
                type="file"
                accept=".mp3,.wav,.m4a,.webm,.ogg,.flac,audio/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file, 'mp3');
                }}
                style={{ display: 'none' }}
              />
            </div>

            {/* TXT Card */}
            <div
              style={{
                ...styles.uploadCard,
                ...styles.uploadCardTxt,
                ...(draggingType === 'txt' ? styles.uploadCardActive : {}),
                ...(getFile('txt') ? styles.uploadCardSuccess : {}),
              }}
              onClick={() => txtInputRef.current?.click()}
              onDrop={(e) => handleDrop(e, 'txt')}
              onDragOver={(e) => handleDragOver(e, 'txt')}
              onDragLeave={handleDragLeave}
            >
              <div style={styles.cardIcon}>📝</div>
              <div style={styles.cardTitle}>Roteiro (TXT)</div>
              <div style={styles.cardSubtitle}>Converte para SRT</div>
              {getFile('txt') ? (
                <>
                  <div style={styles.cardFileName}>✓ {getFile('txt')?.name}</div>
                  <button
                    style={styles.cardRemoveButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile('txt');
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    Remover
                  </button>
                </>
              ) : (
                <div style={{ fontSize: '12px', color: '#64748b' }}>Arraste ou clique</div>
              )}
              <input
                ref={txtInputRef}
                type="file"
                accept=".txt"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file, 'txt');
                }}
                style={{ display: 'none' }}
              />
            </div>

            {/* SRT Card */}
            <div
              style={{
                ...styles.uploadCard,
                ...styles.uploadCardSrt,
                ...(draggingType === 'srt' ? styles.uploadCardActive : {}),
                ...(getFile('srt') ? styles.uploadCardSuccess : {}),
              }}
              onClick={() => srtInputRef.current?.click()}
              onDrop={(e) => handleDrop(e, 'srt')}
              onDragOver={(e) => handleDragOver(e, 'srt')}
              onDragLeave={handleDragLeave}
            >
              <div style={styles.cardIcon}>📄</div>
              <div style={styles.cardTitle}>Legendas (SRT)</div>
              <div style={styles.cardSubtitle}>Usa diretamente</div>
              {getFile('srt') ? (
                <>
                  <div style={styles.cardFileName}>✓ {getFile('srt')?.name}</div>
                  <button
                    style={styles.cardRemoveButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile('srt');
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    Remover
                  </button>
                </>
              ) : (
                <div style={{ fontSize: '12px', color: '#64748b' }}>Arraste ou clique</div>
              )}
              <input
                ref={srtInputRef}
                type="file"
                accept=".srt"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file, 'srt');
                }}
                style={{ display: 'none' }}
              />
            </div>
          </div>

          {/* Whisper API Warning */}
          {!isWhisperConfigured && (
            <div style={styles.warningText}>
              ⚠️ A API Whisper não está configurada. Para transcrever áudios automaticamente,
              configure sua API key nas Configurações.
            </div>
          )}

          {/* Error */}
          {error && <div style={styles.errorText}>{error}</div>}

          {/* Continue Section - Aparece quando há arquivos */}
          {canProcess && (
            <div style={styles.continueSection}>
              <div style={styles.continueTitle}>
                <span>✓</span>
                <span>{uploadCount} arquivo{uploadCount !== 1 ? 's' : ''} carregado{uploadCount !== 1 ? 's' : ''}</span>
              </div>
              <button
                style={styles.continueButton}
                onClick={processAndContinue}
                disabled={isTranscribing}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 8px 30px rgba(34, 197, 94, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {isTranscribing ? 'Processando...' : 'Processar e Continuar'}
                <span style={{ fontSize: '20px' }}>→</span>
              </button>
              <div style={styles.continueFlow}>
                Fluxo: {processingFlow}
              </div>
            </div>
          )}

          {/* Divider */}
          <div style={styles.orDivider}>
            <div style={styles.orDividerLine} />
            <span style={styles.orDividerText}>opções adicionais</span>
            <div style={styles.orDividerLine} />
          </div>

          {/* Optional Section - Collapsible */}
          <div style={styles.optionalSection}>
            <div
              style={styles.optionalHeader}
              onClick={() => setShowOptionalSection(!showOptionalSection)}
            >
              <div style={styles.optionalTitle}>
                <span>📝</span>
                <span>Colar Roteiro Manualmente</span>
              </div>
              <div style={styles.optionalToggle}>
                {showOptionalSection ? '▲ Ocultar' : '▼ Expandir'}
              </div>
            </div>

            {showOptionalSection && (
              <>
                <textarea
                  style={styles.textarea}
                  placeholder="Cole ou digite seu roteiro aqui...

Exemplo:
Nessa aula, trataremos da segunda etapa do processo. Você verá como melhorar a execução dos blocos para ter mais foco."
                  value={pastedContent}
                  onChange={(e) => {
                    setPastedContent(e.target.value);
                    setError(null);
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#00d4ff';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.3)';
                  }}
                />

                {/* Config Row */}
                <div style={styles.configRow}>
                  <div style={styles.configItem}>
                    <span style={styles.configLabel}>Velocidade da Fala (para TXT)</span>
                    <select
                      style={styles.configSelect}
                      value={speechSpeed}
                      onChange={(e) => setSpeechSpeed(Number(e.target.value))}
                    >
                      {SPEECH_SPEED_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Preview Stats */}
                {previewStats && (
                  <div style={styles.previewSection}>
                    <div style={styles.previewTitle}>Preview da Conversão (TXT → SRT)</div>
                    <div style={styles.previewStats}>
                      <div style={styles.previewStat}>
                        <span style={styles.previewStatLabel}>Legendas</span>
                        <span style={styles.previewStatValue}>{previewStats.subtitleCount}</span>
                      </div>
                      <div style={styles.previewStat}>
                        <span style={styles.previewStatLabel}>Duração Est.</span>
                        <span style={styles.previewStatValue}>{previewStats.duration}</span>
                      </div>
                      <div style={styles.previewStat}>
                        <span style={styles.previewStatLabel}>Palavras</span>
                        <span style={styles.previewStatValue}>{previewStats.wordCount}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Process button for pasted content */}
                {pastedContent?.trim() && !canProcess && (
                  <button
                    style={{
                      ...styles.continueButton,
                      width: '100%',
                      marginTop: '16px',
                      justifyContent: 'center',
                    }}
                    onClick={processAndContinue}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.02)';
                      e.currentTarget.style.boxShadow = '0 4px 20px rgba(34, 197, 94, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    Processar Texto e Continuar →
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScriptUploadStep;
