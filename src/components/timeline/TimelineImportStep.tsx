import React, { useState, useCallback, useRef } from 'react';
import type { TimelineProject, TimelineScene } from '../../types/TimelineProject';
import { createTimelineScene, formatTimeMsShort } from '../../types/TimelineProject';
import { parseSRT } from '../../utils/srtParser';
import type { Subtitle } from '../../types/Subtitle';

interface TimelineImportStepProps {
  /** Projeto atual */
  project: TimelineProject;

  /** Callback quando o áudio é carregado */
  onAudioLoaded: (url: string, duration: number) => void;

  /** Callback para adicionar cena */
  onAddScene: (scene: TimelineScene) => void;

  /** Callback para adicionar múltiplas cenas com elementos do SRT */
  onAddScenesWithSRT?: (scenes: TimelineScene[]) => void;

  /** Callback para remover cena */
  onRemoveScene: (sceneId: string) => void;

  /** Callback para distribuir cenas igualmente */
  onDistributeEvenly: () => void;

  /** Callback para avançar */
  onNext: () => void;

  /** Callback para salvar o projeto */
  onSave?: () => void;
}

/**
 * Step de importação para o modo Timeline.
 * Permite carregar áudio e imagens.
 */
export const TimelineImportStep: React.FC<TimelineImportStepProps> = ({
  project,
  onAudioLoaded,
  onAddScene,
  onAddScenesWithSRT,
  onRemoveScene,
  onDistributeEvenly,
  onNext,
  onSave,
}) => {
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [isLoadingSRT, setIsLoadingSRT] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const imagesInputRef = useRef<HTMLInputElement>(null);
  const srtInputRef = useRef<HTMLInputElement>(null);

  // Estado do SRT opcional
  const [srtSubtitles, setSrtSubtitles] = useState<Subtitle[]>([]);
  const [srtFileName, setSrtFileName] = useState<string>('');
  const [scenesPerImage, setScenesPerImage] = useState<number>(1);

  // Carrega áudio
  const handleAudioChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoadingAudio(true);

    try {
      // Converte para data URL
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;

        // Obtém duração do áudio
        const audio = new Audio(dataUrl);
        await new Promise<void>((resolve) => {
          audio.onloadedmetadata = () => {
            const durationMs = Math.round(audio.duration * 1000);
            onAudioLoaded(dataUrl, durationMs);
            resolve();
          };
          audio.onerror = () => {
            alert('Erro ao carregar áudio');
            resolve();
          };
        });

        setIsLoadingAudio(false);
      };

      reader.onerror = () => {
        alert('Erro ao ler arquivo de áudio');
        setIsLoadingAudio(false);
      };

      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Erro ao carregar áudio:', error);
      setIsLoadingAudio(false);
    }
  }, [onAudioLoaded]);

  // Carrega SRT (opcional)
  const handleSRTChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoadingSRT(true);

    try {
      const content = await file.text();
      const fps = project.videoConfig.fps || 30;
      const subtitles = parseSRT(content, fps);

      setSrtSubtitles(subtitles);
      setSrtFileName(file.name);

      console.log(`[TimelineImportStep] SRT carregado: ${subtitles.length} legendas`);
    } catch (error) {
      console.error('Erro ao carregar SRT:', error);
      alert('Erro ao carregar arquivo SRT. Verifique o formato.');
    } finally {
      setIsLoadingSRT(false);
    }
  }, [project.videoConfig.fps]);

  // Remove SRT carregado
  const handleRemoveSRT = useCallback(() => {
    setSrtSubtitles([]);
    setSrtFileName('');
    if (srtInputRef.current) {
      srtInputRef.current.value = '';
    }
  }, []);

  // Carrega imagens
  const handleImagesChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsLoadingImages(true);

    try {
      // Ordena arquivos por nome
      const sortedFiles = Array.from(files).sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true })
      );

      // Se tem SRT carregado e callback disponível, usa distribuição com SRT
      if (srtSubtitles.length > 0 && onAddScenesWithSRT) {
        const scenes: TimelineScene[] = [];
        const totalImages = sortedFiles.length;
        const totalSubtitles = srtSubtitles.length;

        // Calcula quantas legendas por imagem baseado em scenesPerImage
        // scenesPerImage indica quantas "cenas de legendas" cada imagem deve ter
        const subtitlesPerImage = Math.ceil(totalSubtitles / totalImages);
        const actualScenesPerImage = Math.min(scenesPerImage, subtitlesPerImage);

        console.log(`[TimelineImportStep] Distribuindo ${totalSubtitles} legendas em ${totalImages} imagens (${actualScenesPerImage} cenas por imagem)`);

        // Processa cada arquivo
        for (let i = 0; i < sortedFiles.length; i++) {
          const file = sortedFiles[i];

          // Lê a imagem
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          // Obtém dimensões da imagem
          const { width, height } = await new Promise<{ width: number; height: number }>((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
            img.onerror = () => resolve({ width: 1920, height: 1080 }); // Fallback
            img.src = dataUrl;
          });

          // Calcula quais legendas pertencem a esta imagem
          const startSubIndex = i * subtitlesPerImage;
          const endSubIndex = Math.min(startSubIndex + subtitlesPerImage, totalSubtitles);
          const imageSubtitles = srtSubtitles.slice(startSubIndex, endSubIndex);

          if (imageSubtitles.length === 0) {
            // Se não há mais legendas, cria cena vazia no final
            const lastSubtitle = srtSubtitles[srtSubtitles.length - 1];
            const audioDuration = project.audioDuration || (lastSubtitle?.endTime || 60000);
            const remainingTime = audioDuration - (lastSubtitle?.endTime || 0);
            const startTime = lastSubtitle?.endTime || 0;
            const endTime = startTime + remainingTime / (totalImages - i);

            const scene = createTimelineScene(dataUrl, width, height, Math.round(startTime), Math.round(endTime));
            scenes.push(scene);
          } else {
            // Cria cena com elementos das legendas
            const firstSub = imageSubtitles[0];
            const lastSub = imageSubtitles[imageSubtitles.length - 1];

            const scene = createTimelineScene(
              dataUrl,
              width,
              height,
              firstSub.startTime,
              lastSub.endTime
            );

            // Armazenamos as legendas do SRT na cena para referência
            // O editor vai usar esses tempos para criar elementos quando o usuário desenhar
            scene.subtitles = imageSubtitles;
            console.log(`[TimelineImportStep] Cena com ${imageSubtitles.length} legendas SRT (${formatTimeMsShort(firstSub.startTime)} - ${formatTimeMsShort(lastSub.endTime)})`);

            // Cena começa vazia - elementos serão criados pelo usuário no editor
            // Os tempos dos elementos serão baseados nas legendas armazenadas
            scene.elements = [];
            scenes.push(scene);
          }
        }

        // Adiciona todas as cenas de uma vez
        onAddScenesWithSRT(scenes);
        console.log(`[TimelineImportStep] ${scenes.length} cenas criadas com elementos do SRT`);
      } else {
        // Comportamento padrão: sem SRT
        for (let i = 0; i < sortedFiles.length; i++) {
          const file = sortedFiles[i];

          // Lê a imagem
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          // Obtém dimensões da imagem
          const { width, height } = await new Promise<{ width: number; height: number }>((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
            img.onerror = () => resolve({ width: 1920, height: 1080 }); // Fallback
            img.src = dataUrl;
          });

          // Calcula tempos iniciais (distribuição igual)
          const audioDuration = project.audioDuration || 60000; // 1 minuto padrão
          const totalScenes = project.scenes.length + sortedFiles.length;
          const sceneDuration = audioDuration / totalScenes;
          const startTime = (project.scenes.length + i) * sceneDuration;
          const endTime = startTime + sceneDuration;

          // Cria a cena
          const scene = createTimelineScene(dataUrl, width, height, Math.round(startTime), Math.round(endTime));
          onAddScene(scene);
        }

        // Redistribui os tempos igualmente
        setTimeout(() => {
          onDistributeEvenly();
        }, 100);
      }

      setIsLoadingImages(false);
    } catch (error) {
      console.error('Erro ao carregar imagens:', error);
      setIsLoadingImages(false);
    }
  }, [project.audioDuration, project.scenes.length, onAddScene, onAddScenesWithSRT, onDistributeEvenly, srtSubtitles, scenesPerImage]);

  // Pode avançar?
  const canProceed = project.audioUrl !== '' && project.scenes.length > 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: 32,
        overflow: 'auto',
      }}
    >
      {/* Título */}
      <h2 style={{ color: 'white', marginBottom: 8 }}>Importar Arquivos</h2>
      <p style={{ color: '#a0a0b0', marginBottom: 32 }}>
        Carregue o áudio e as imagens para criar seu projeto.
      </p>

      <div style={{ display: 'flex', gap: 32, flex: 1 }}>
        {/* Coluna esquerda - Upload */}
        <div style={{ flex: 1, maxWidth: 400 }}>
          {/* Upload de Áudio */}
          <div
            style={{
              padding: 24,
              backgroundColor: '#2a2a3e',
              borderRadius: 12,
              marginBottom: 24,
            }}
          >
            <h3 style={{ color: 'white', marginBottom: 16 }}>1. Áudio</h3>

            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*"
              onChange={handleAudioChange}
              style={{ display: 'none' }}
            />

            {project.audioUrl ? (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: 16,
                    backgroundColor: '#22c55e20',
                    borderRadius: 8,
                    marginBottom: 16,
                  }}
                >
                  <span style={{ fontSize: 24 }}>*</span>
                  <div>
                    <div style={{ color: '#22c55e', fontWeight: 600 }}>Áudio carregado</div>
                    <div style={{ color: '#a0a0b0', fontSize: 14 }}>
                      Duração: {formatTimeMsShort(project.audioDuration)}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => audioInputRef.current?.click()}
                  disabled={isLoadingAudio}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#4a4a6e',
                    border: 'none',
                    borderRadius: 8,
                    color: 'white',
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  Trocar Áudio
                </button>
              </div>
            ) : (
              <button
                onClick={() => audioInputRef.current?.click()}
                disabled={isLoadingAudio}
                style={{
                  padding: 24,
                  backgroundColor: '#1a1a2e',
                  border: '2px dashed #4a4a6e',
                  borderRadius: 8,
                  color: 'white',
                  cursor: 'pointer',
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 32 }}>{isLoadingAudio ? '...' : '+'}</span>
                <span>{isLoadingAudio ? 'Carregando...' : 'Selecionar Áudio'}</span>
                <span style={{ fontSize: 12, color: '#a0a0b0' }}>MP3, WAV, OGG...</span>
              </button>
            )}
          </div>

          {/* Upload de SRT (Opcional) */}
          <div
            style={{
              padding: 24,
              backgroundColor: '#2a2a3e',
              borderRadius: 12,
              marginBottom: 24,
            }}
          >
            <h3 style={{ color: 'white', marginBottom: 8 }}>2. SRT (Opcional)</h3>
            <p style={{ color: '#a0a0b0', fontSize: 12, marginBottom: 16 }}>
              Carregue um arquivo SRT para distribuir elementos automaticamente nas cenas.
            </p>

            <input
              ref={srtInputRef}
              type="file"
              accept=".srt"
              onChange={handleSRTChange}
              style={{ display: 'none' }}
            />

            {srtSubtitles.length > 0 ? (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: 16,
                    backgroundColor: '#6366f120',
                    borderRadius: 8,
                    marginBottom: 16,
                  }}
                >
                  <span style={{ fontSize: 24 }}>*</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#6366f1', fontWeight: 600 }}>SRT carregado</div>
                    <div style={{ color: '#a0a0b0', fontSize: 14 }}>
                      {srtFileName} - {srtSubtitles.length} legendas
                    </div>
                  </div>
                  <button
                    onClick={handleRemoveSRT}
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
                    Remover
                  </button>
                </div>

                {/* Input para cenas por imagem */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ color: '#a0a0b0', fontSize: 12, display: 'block', marginBottom: 8 }}>
                    Legendas por imagem (distribuição):
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={srtSubtitles.length}
                    value={scenesPerImage}
                    onChange={(e) => setScenesPerImage(Math.max(1, parseInt(e.target.value) || 1))}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: '#1a1a2e',
                      border: '1px solid #4a4a6e',
                      borderRadius: 8,
                      color: 'white',
                      fontSize: 14,
                    }}
                  />
                  <p style={{ color: '#a0a0b0', fontSize: 11, marginTop: 6 }}>
                    As {srtSubtitles.length} legendas serão divididas pelas imagens carregadas.
                  </p>
                </div>

                <button
                  onClick={() => srtInputRef.current?.click()}
                  disabled={isLoadingSRT}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#4a4a6e',
                    border: 'none',
                    borderRadius: 8,
                    color: 'white',
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  Trocar SRT
                </button>
              </div>
            ) : (
              <button
                onClick={() => srtInputRef.current?.click()}
                disabled={isLoadingSRT}
                style={{
                  padding: 20,
                  backgroundColor: '#1a1a2e',
                  border: '2px dashed #4a4a6e',
                  borderRadius: 8,
                  color: 'white',
                  cursor: 'pointer',
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 24 }}>{isLoadingSRT ? '...' : '+'}</span>
                <span style={{ fontSize: 14 }}>{isLoadingSRT ? 'Carregando...' : 'Selecionar SRT'}</span>
                <span style={{ fontSize: 11, color: '#a0a0b0' }}>Arquivo de legendas .srt</span>
              </button>
            )}
          </div>

          {/* Upload de Imagens */}
          <div
            style={{
              padding: 24,
              backgroundColor: '#2a2a3e',
              borderRadius: 12,
            }}
          >
            <h3 style={{ color: 'white', marginBottom: 16 }}>3. Imagens (Cenas)</h3>

            <input
              ref={imagesInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImagesChange}
              style={{ display: 'none' }}
            />

            <button
              onClick={() => imagesInputRef.current?.click()}
              disabled={isLoadingImages}
              style={{
                padding: 24,
                backgroundColor: '#1a1a2e',
                border: '2px dashed #4a4a6e',
                borderRadius: 8,
                color: 'white',
                cursor: 'pointer',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 32 }}>{isLoadingImages ? '...' : '+'}</span>
              <span>{isLoadingImages ? 'Carregando...' : 'Adicionar Imagens'}</span>
              <span style={{ fontSize: 12, color: '#a0a0b0' }}>
                Selecione múltiplas imagens (ordenadas por nome)
              </span>
            </button>

            {srtSubtitles.length > 0 && (
              <div style={{ marginTop: 12, padding: 12, backgroundColor: '#6366f110', borderRadius: 8 }}>
                <span style={{ color: '#6366f1', fontSize: 12 }}>
                  Com SRT: cada imagem receberá elementos com tempos das legendas
                </span>
              </div>
            )}

            {project.scenes.length > 0 && (
              <div style={{ marginTop: 16, color: '#22c55e' }}>
                {project.scenes.length} cena(s) carregada(s)
                {project.scenes.reduce((acc, scene) => acc + scene.elements.length, 0) > 0 && (
                  <span style={{ color: '#6366f1', marginLeft: 8 }}>
                    ({project.scenes.reduce((acc, scene) => acc + scene.elements.length, 0)} elementos do SRT)
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Coluna direita - Preview das cenas */}
        <div style={{ flex: 2 }}>
          <h3 style={{ color: 'white', marginBottom: 16 }}>Cenas ({project.scenes.length})</h3>

          {project.scenes.length === 0 ? (
            <div
              style={{
                padding: 40,
                backgroundColor: '#2a2a3e',
                borderRadius: 12,
                textAlign: 'center',
                color: '#a0a0b0',
              }}
            >
              Nenhuma cena adicionada ainda.
              <br />
              Adicione imagens para criar cenas.
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: 16,
                maxHeight: 'calc(100vh - 300px)',
                overflow: 'auto',
                padding: 4,
              }}
            >
              {project.scenes.map((scene, index) => (
                <div
                  key={scene.id}
                  style={{
                    backgroundColor: '#2a2a3e',
                    borderRadius: 8,
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  {/* Thumbnail */}
                  <div
                    style={{
                      aspectRatio: '16/9',
                      backgroundColor: '#1a1a2e',
                      overflow: 'hidden',
                    }}
                  >
                    <img
                      src={scene.imageUrl}
                      alt={`Cena ${index + 1}`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  </div>

                  {/* Info */}
                  <div style={{ padding: 12 }}>
                    <div style={{ color: 'white', fontWeight: 600, marginBottom: 4 }}>
                      Cena {index + 1}
                    </div>
                    <div style={{ color: '#a0a0b0', fontSize: 12 }}>
                      {formatTimeMsShort(scene.startTime)} - {formatTimeMsShort(scene.endTime)}
                    </div>
                  </div>

                  {/* Botão remover */}
                  <button
                    onClick={() => onRemoveScene(scene.id)}
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      backgroundColor: '#ef4444',
                      border: 'none',
                      color: 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 16,
                    }}
                    title="Remover cena"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Botão redistribuir - apenas quando não tem elementos do SRT */}
          {project.scenes.length > 1 && (
            (() => {
              const hasElementsFromSRT = project.scenes.some(scene => scene.elements.length > 0);
              if (hasElementsFromSRT) {
                return (
                  <div
                    style={{
                      marginTop: 16,
                      padding: 12,
                      backgroundColor: '#6366f120',
                      borderRadius: 8,
                      color: '#a0a0b0',
                      fontSize: 12,
                    }}
                  >
                    Os tempos das cenas estão baseados nas legendas do SRT importado.
                  </div>
                );
              }
              return (
                <button
                  onClick={onDistributeEvenly}
                  style={{
                    marginTop: 16,
                    padding: '10px 20px',
                    backgroundColor: '#4a4a6e',
                    border: 'none',
                    borderRadius: 8,
                    color: 'white',
                    cursor: 'pointer',
                  }}
                >
                  Redistribuir Tempos Igualmente
                </button>
              );
            })()
          )}
        </div>
      </div>

      {/* Botões de navegação */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 32,
          paddingTop: 24,
          borderTop: '1px solid #2a2a4e',
        }}
      >
        {/* Botão Salvar */}
        {onSave && (
          <button
            onClick={onSave}
            style={{
              padding: '12px 24px',
              backgroundColor: '#22c55e',
              border: 'none',
              borderRadius: 8,
              color: 'white',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
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
            padding: '12px 32px',
            backgroundColor: canProceed ? '#6366f1' : '#4a4a6e',
            border: 'none',
            borderRadius: 8,
            color: 'white',
            cursor: canProceed ? 'pointer' : 'not-allowed',
            fontSize: 16,
            fontWeight: 600,
          }}
        >
          Continuar para Editor
        </button>
      </div>
    </div>
  );
};

export default TimelineImportStep;
