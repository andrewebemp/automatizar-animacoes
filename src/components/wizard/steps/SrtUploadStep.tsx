import React, { useCallback, useRef, useEffect } from 'react';
import { parseSRT } from '../../../utils/srtParser';
import {
  subtitlesToSegments,
  groupSegmentsIntoImageBlocks,
} from '../../../utils/promptGenerator';
import type { ImageBlock } from '../../../types/ImageBlock';
import type { Subtitle } from '../../../types/Subtitle';

interface SrtUploadStepProps {
  srtContent?: string;
  fps: number;
  /** Subtitles já parseadas (para verificar se já processou) */
  subtitles?: Subtitle[];
  /** ImageBlocks já gerados (para verificar se já processou) */
  imageBlocks?: ImageBlock[];
  onSrtParsed: (
    content: string,
    subtitles: Subtitle[],
    imageBlocks: ImageBlock[]
  ) => void;
  /** Callback para continuar para próximo step */
  onContinue?: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    minHeight: '400px',
  },
  dropzone: {
    width: '100%',
    maxWidth: '500px',
    padding: '48px',
    border: '2px dashed rgba(124, 58, 237, 0.4)',
    borderRadius: '16px',
    background: 'rgba(124, 58, 237, 0.05)',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
  },
  dropzoneActive: {
    border: '2px dashed #7c3aed',
    background: 'rgba(124, 58, 237, 0.1)',
    transform: 'scale(1.02)',
  },
  icon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#fff',
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '14px',
    color: '#94a3b8',
    marginBottom: '24px',
  },
  button: {
    padding: '12px 24px',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(135deg, #7c3aed, #00d4ff)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  fileInfo: {
    marginTop: '24px',
    padding: '16px',
    background: 'rgba(34, 197, 94, 0.1)',
    borderRadius: '8px',
    border: '1px solid rgba(34, 197, 94, 0.3)',
  },
  fileInfoText: {
    color: '#22c55e',
    fontSize: '14px',
    fontWeight: 500,
  },
  hint: {
    marginTop: '16px',
    fontSize: '12px',
    color: '#64748b',
  },
  errorText: {
    marginTop: '16px',
    padding: '12px 16px',
    background: 'rgba(239, 68, 68, 0.1)',
    borderRadius: '8px',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#ef4444',
    fontSize: '14px',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    maxWidth: '500px',
    margin: '24px 0',
    color: '#64748b',
    fontSize: '14px',
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    background: 'rgba(100, 116, 139, 0.3)',
  },
  dividerText: {
    padding: '0 16px',
    color: '#64748b',
    fontSize: '14px',
    fontWeight: 500,
  },
  pasteSection: {
    width: '100%',
    maxWidth: '500px',
  },
  pasteTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#fff',
    marginBottom: '12px',
    textAlign: 'center' as const,
  },
  textarea: {
    width: '100%',
    minHeight: '200px',
    padding: '16px',
    borderRadius: '12px',
    border: '1px solid rgba(124, 58, 237, 0.3)',
    background: 'rgba(0, 0, 0, 0.3)',
    color: '#fff',
    fontSize: '13px',
    fontFamily: 'monospace',
    resize: 'vertical' as const,
    lineHeight: 1.5,
    outline: 'none',
  },
  processButton: {
    width: '100%',
    marginTop: '12px',
    padding: '14px 24px',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(135deg, #00d4ff, #7c3aed)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  existingDataBox: {
    width: '100%',
    maxWidth: '500px',
    padding: '24px',
    background: 'rgba(34, 197, 94, 0.1)',
    borderRadius: '16px',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    marginBottom: '24px',
  },
  existingDataTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#22c55e',
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  existingDataInfo: {
    fontSize: '14px',
    color: '#94a3b8',
    marginBottom: '16px',
    lineHeight: 1.6,
  },
  existingDataStats: {
    display: 'flex',
    gap: '16px',
    marginBottom: '20px',
  },
  statBox: {
    flex: 1,
    padding: '12px',
    background: 'rgba(0, 0, 0, 0.2)',
    borderRadius: '8px',
    textAlign: 'center' as const,
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#22c55e',
  },
  statLabel: {
    fontSize: '12px',
    color: '#64748b',
    marginTop: '4px',
  },
  continueButton: {
    width: '100%',
    padding: '14px 24px',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(135deg, #7c3aed, #00d4ff)',
    color: '#fff',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  reprocessButton: {
    width: '100%',
    marginTop: '12px',
    padding: '10px 20px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    background: 'transparent',
    color: '#94a3b8',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  downloadButton: {
    width: '100%',
    marginTop: '12px',
    padding: '10px 20px',
    borderRadius: '8px',
    border: '1px solid rgba(0, 212, 255, 0.3)',
    background: 'rgba(0, 212, 255, 0.1)',
    color: '#00d4ff',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
};

export const SrtUploadStep: React.FC<SrtUploadStepProps> = ({
  srtContent,
  fps,
  subtitles,
  imageBlocks,
  onSrtParsed,
  onContinue,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [pastedContent, setPastedContent] = React.useState('');
  const [showReprocess, setShowReprocess] = React.useState(false);

  // Verifica se já tem dados processados
  const hasExistingData = subtitles && subtitles.length > 0 && imageBlocks && imageBlocks.length > 0;

  // Função para baixar o SRT
  const handleDownloadSrt = useCallback(() => {
    if (!srtContent) return;

    const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `legendas_${new Date().toISOString().split('T')[0]}.srt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [srtContent]);

  // Pre-fill with converted SRT content from script step
  useEffect(() => {
    if (srtContent && !pastedContent) {
      setPastedContent(srtContent);
      setFileName('Convertido do roteiro');
    }
  }, [srtContent]);

  // Process SRT content (from file or pasted text)
  const processSrtContent = useCallback(
    (content: string, source: string) => {
      setError(null);
      try {
        const subtitles = parseSRT(content, fps);

        if (subtitles.length === 0) {
          setError('O conteúdo SRT está vazio ou em formato inválido');
          return;
        }

        const segments = subtitlesToSegments(subtitles);
        const imageBlocks = groupSegmentsIntoImageBlocks(segments, fps);

        setFileName(source);
        setPastedContent('');
        onSrtParsed(content, subtitles, imageBlocks);
      } catch (err) {
        setError('Erro ao processar o conteúdo SRT. Verifique o formato.');
        console.error(err);
      }
    },
    [fps, onSrtParsed]
  );

  const processFile = useCallback(
    (file: File) => {
      setError(null);

      if (!file.name.toLowerCase().endsWith('.srt')) {
        setError('Por favor, selecione um arquivo .srt válido');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        processSrtContent(content, file.name);
      };

      reader.onerror = () => {
        setError('Erro ao ler o arquivo');
      };

      reader.readAsText(file);
    },
    [processSrtContent]
  );

  const handlePastedContentProcess = useCallback(() => {
    if (!pastedContent.trim()) {
      setError('Cole o conteúdo do arquivo SRT antes de processar');
      return;
    }
    processSrtContent(pastedContent, 'Texto colado');
  }, [pastedContent, processSrtContent]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        processFile(file);
      }
    },
    [processFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // Se tem dados existentes e não está reprocessando, mostra resumo
  if (hasExistingData && !showReprocess) {
    return (
      <div style={styles.container}>
        <div style={styles.existingDataBox}>
          <div style={styles.existingDataTitle}>
            <span>✓</span> SRT já processado
          </div>
          <div style={styles.existingDataInfo}>
            Você já carregou e processou um arquivo SRT anteriormente.
            Pode continuar de onde parou ou reprocessar um novo arquivo.
          </div>
          <div style={styles.existingDataStats}>
            <div style={styles.statBox}>
              <div style={styles.statValue}>{subtitles?.length || 0}</div>
              <div style={styles.statLabel}>Legendas</div>
            </div>
            <div style={styles.statBox}>
              <div style={styles.statValue}>{imageBlocks?.length || 0}</div>
              <div style={styles.statLabel}>Blocos de Imagem</div>
            </div>
          </div>
          <button
            style={styles.continueButton}
            onClick={onContinue}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.02)';
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(124, 58, 237, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            Continuar para Prompts →
          </button>
          {/* Botão de download do SRT */}
          {srtContent && (
            <button
              style={styles.downloadButton}
              onClick={handleDownloadSrt}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.6)';
                e.currentTarget.style.background = 'rgba(0, 212, 255, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(0, 212, 255, 0.3)';
                e.currentTarget.style.background = 'rgba(0, 212, 255, 0.1)';
              }}
            >
              <span>📥</span>
              <span>Baixar arquivo SRT</span>
            </button>
          )}
          <button
            style={styles.reprocessButton}
            onClick={() => setShowReprocess(true)}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.color = '#94a3b8';
            }}
          >
            Carregar novo arquivo SRT
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Botão para voltar ao resumo se já tem dados */}
      {hasExistingData && showReprocess && (
        <button
          style={{
            ...styles.reprocessButton,
            marginBottom: '24px',
            maxWidth: '500px',
          }}
          onClick={() => setShowReprocess(false)}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)';
            e.currentTarget.style.color = '#fff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            e.currentTarget.style.color = '#94a3b8';
          }}
        >
          ← Voltar ao resumo
        </button>
      )}

      <div
        style={{
          ...styles.dropzone,
          ...(isDragging ? styles.dropzoneActive : {}),
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
      >
        <div style={styles.icon}>📄</div>
        <div style={styles.title}>Upload do arquivo SRT</div>
        <div style={styles.subtitle}>
          Arraste e solte seu arquivo de legendas aqui
        </div>
        <button
          style={styles.button}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(124, 58, 237, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          Selecionar Arquivo
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".srt"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>

      {error && <div style={styles.errorText}>{error}</div>}

      {fileName && !error && (
        <div style={styles.fileInfo}>
          <span style={styles.fileInfoText}>✓ {fileName} carregado com sucesso</span>
        </div>
      )}

      {/* Divider */}
      <div style={styles.divider}>
        <div style={styles.dividerLine} />
        <span style={styles.dividerText}>ou cole diretamente</span>
        <div style={styles.dividerLine} />
      </div>

      {/* Paste Section */}
      <div style={styles.pasteSection}>
        <textarea
          style={styles.textarea}
          placeholder="Cole o conteúdo do arquivo SRT aqui...

Exemplo:
1
00:00:00,000 --> 00:00:04,600
Primeira legenda aqui.

2
00:00:05,040 --> 00:00:09,215
Segunda legenda aqui."
          value={pastedContent}
          onChange={(e) => {
            setPastedContent(e.target.value);
            setError(null);
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#7c3aed';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(124, 58, 237, 0.3)';
          }}
        />
        <button
          style={{
            ...styles.processButton,
            opacity: pastedContent.trim() ? 1 : 0.5,
            cursor: pastedContent.trim() ? 'pointer' : 'not-allowed',
          }}
          onClick={handlePastedContentProcess}
          disabled={!pastedContent.trim()}
          onMouseEnter={(e) => {
            if (pastedContent.trim()) {
              e.currentTarget.style.transform = 'scale(1.02)';
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 212, 255, 0.4)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          Processar Texto
        </button>
      </div>

      <div style={styles.hint}>
        O conteúdo SRT será processado para gerar automaticamente os prompts e timeline
      </div>
    </div>
  );
};

export default SrtUploadStep;
