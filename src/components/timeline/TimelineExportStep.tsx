import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import type { TimelineProject } from '../../types/TimelineProject';
import type { DisplayMode, RevealDirection } from '../../types/VideoSegment';
import { getTimelineProjectDurationFrames } from '../../types/TimelineProject';
import { VideoCompositionTimeline } from '../video/VideoCompositionTimeline';
import { SUPPORTED_EDITORS, type EditorType, type MediaHandling } from '../../exporters';

interface TimelineExportStepProps {
  /** Projeto Timeline */
  project: TimelineProject;

  /** Callback para atualizar configuração de vídeo */
  onVideoConfigChange: (config: { width: number; height: number }) => void;

  /** Callback para toggle de legendas */
  onShowSubtitlesChange?: (show: boolean) => void;

  /** Callback para atualizar configurações globais de animação */
  onGlobalAnimationChange?: (settings: {
    displayMode: DisplayMode;
    revealDirection: RevealDirection;
    revealFraction: number;
  }) => void;

  /** Callback para voltar */
  onBack: () => void;

  /** Callback para exportar vídeo */
  onExport: () => void;

  /** Callback para exportar para editor de vídeo */
  onExportToEditor?: (editorId: EditorType, mediaHandling: MediaHandling) => void;

  /** Progresso da exportação (0-100) */
  exportProgress?: number;

  /** Status da exportação */
  exportStatus?: 'idle' | 'rendering' | 'done' | 'error';

  /** Status da exportação para editor */
  editorExportStatus?: 'idle' | 'exporting' | 'done' | 'error';

  /** Mensagem de resultado da exportação para editor */
  editorExportMessage?: string;

  /** Callback para salvar o projeto */
  onSave?: () => void;
}

type AspectRatio = '16:9' | '1:1' | '9:16';

// Resoluções para cada aspect ratio
const RESOLUTIONS_BY_ASPECT: Record<AspectRatio, Array<{ label: string; width: number; height: number }>> = {
  '16:9': [
    { label: '4K (3840x2160)', width: 3840, height: 2160 },
    { label: '1080p (1920x1080)', width: 1920, height: 1080 },
    { label: '720p (1280x720)', width: 1280, height: 720 },
    { label: '480p (854x480)', width: 854, height: 480 },
    { label: '360p (640x360)', width: 640, height: 360 },
    { label: '144p (256x144)', width: 256, height: 144 },
  ],
  '1:1': [
    { label: '4K (2160x2160)', width: 2160, height: 2160 },
    { label: '1080p (1080x1080)', width: 1080, height: 1080 },
    { label: '720p (720x720)', width: 720, height: 720 },
    { label: '480p (480x480)', width: 480, height: 480 },
    { label: '360p (360x360)', width: 360, height: 360 },
    { label: '144p (144x144)', width: 144, height: 144 },
  ],
  '9:16': [
    { label: '4K (2160x3840)', width: 2160, height: 3840 },
    { label: '1080p (1080x1920)', width: 1080, height: 1920 },
    { label: '720p (720x1280)', width: 720, height: 1280 },
    { label: '480p (480x854)', width: 480, height: 854 },
    { label: '360p (360x640)', width: 360, height: 640 },
    { label: '144p (144x256)', width: 144, height: 256 },
  ],
};

const PLAYBACK_SPEEDS = [1, 1.5, 2, 2.5, 3];

// Opções de Display Mode
const DISPLAY_MODE_OPTIONS: Array<{ value: DisplayMode; label: string; description: string }> = [
  { value: 'normal', label: 'Normal (revelar na imagem)', description: 'Revela o elemento na imagem original' },
  { value: 'zoom', label: 'Cena com zoom (tela cheia)', description: 'Recorta a região em 16:9 e exibe em tela cheia' },
];

// Opções de Reveal Direction
const REVEAL_DIRECTION_OPTIONS: Array<{ value: RevealDirection; label: string }> = [
  { value: 'auto', label: 'Automático (baseado na posição)' },
  { value: 'center', label: 'Do centro para fora' },
  { value: 'left', label: 'Da esquerda para direita' },
  { value: 'right', label: 'Da direita para esquerda' },
  { value: 'top', label: 'De cima para baixo' },
  { value: 'bottom', label: 'De baixo para cima' },
];

// Opções de Reveal Percentage
const REVEAL_PERCENTAGE_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: '0% (instantâneo)' },
  { value: 0.1, label: '10%' },
  { value: 0.2, label: '20%' },
  { value: 0.3, label: '30%' },
  { value: 0.4, label: '40%' },
  { value: 0.5, label: '50%' },
  { value: 0.6, label: '60% (padrão)' },
  { value: 0.7, label: '70%' },
  { value: 0.8, label: '80%' },
  { value: 0.9, label: '90%' },
  { value: 1.0, label: '100%' },
];

// Estilos para dropdown
const dropdownStyles = {
  container: {
    position: 'relative' as const,
  },
  select: {
    width: '100%',
    padding: '12px 16px',
    backgroundColor: '#2a2a4e',
    border: '2px solid #4a4a6e',
    borderRadius: 8,
    color: 'white',
    fontSize: 14,
    cursor: 'pointer',
    appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    paddingRight: 36,
  },
  label: {
    color: '#888',
    display: 'block',
    marginBottom: 8,
    fontSize: 14,
  },
  description: {
    color: '#666',
    fontSize: 12,
    marginTop: 6,
  },
};

/**
 * Verifica se o projeto Timeline está pronto para exportação.
 */
function isTimelineProjectReadyForExport(project: TimelineProject): { ready: boolean; issues: string[] } {
  const issues: string[] = [];

  if (!project.audioUrl) {
    issues.push('Áudio não carregado');
  }

  if (project.scenes.length === 0) {
    issues.push('Nenhuma cena adicionada');
  }

  const scenesWithoutElements = project.scenes.filter(s => s.elements.length === 0);
  if (scenesWithoutElements.length === project.scenes.length) {
    issues.push('Nenhum elemento desenhado nas cenas');
  }

  const scenesWithoutImages = project.scenes.filter(s => !s.imageUrl);
  if (scenesWithoutImages.length > 0) {
    issues.push(`${scenesWithoutImages.length} cena(s) sem imagem`);
  }

  return {
    ready: issues.length === 0,
    issues,
  };
}

/**
 * Passo de Exportação do modo Timeline.
 */
export const TimelineExportStep: React.FC<TimelineExportStepProps> = ({
  project,
  onVideoConfigChange,
  onShowSubtitlesChange,
  onGlobalAnimationChange,
  onBack,
  onExport,
  onExportToEditor,
  exportProgress = 0,
  exportStatus = 'idle',
  editorExportStatus = 'idle',
  editorExportMessage = '',
  onSave,
}) => {
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [selectedResolution, setSelectedResolution] = useState(1); // Default 1080p
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('normal');
  const [mediaHandling, setMediaHandling] = useState<MediaHandling>('copy');
  const [revealDirection, setRevealDirection] = useState<RevealDirection>('auto');
  const [revealFraction, setRevealFraction] = useState(0.6);
  const [hasAppliedInitialSettings, setHasAppliedInitialSettings] = useState(false);
  const playerRef = useRef<PlayerRef>(null);

  // Aplica as configurações globais ao montar o componente
  useEffect(() => {
    if (!hasAppliedInitialSettings && onGlobalAnimationChange) {
      onGlobalAnimationChange({
        displayMode,
        revealDirection,
        revealFraction,
      });
      setHasAppliedInitialSettings(true);
    }
  }, [hasAppliedInitialSettings, onGlobalAnimationChange, displayMode, revealDirection, revealFraction]);

  const durationInFrames = getTimelineProjectDurationFrames(project);
  const { ready, issues } = isTimelineProjectReadyForExport(project);
  const resolutions = RESOLUTIONS_BY_ASPECT[aspectRatio];

  // Atualiza aspect ratio
  const handleAspectRatioChange = useCallback(
    (newAspect: AspectRatio) => {
      setAspectRatio(newAspect);
      setSelectedResolution(1); // Reset para 1080p equivalente
      const res = RESOLUTIONS_BY_ASPECT[newAspect][1]; // 1080p
      onVideoConfigChange({ width: res.width, height: res.height });
    },
    [onVideoConfigChange]
  );

  // Atualiza resolução quando muda
  const handleResolutionChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const index = parseInt(e.target.value, 10);
      setSelectedResolution(index);
      const res = resolutions[index];
      onVideoConfigChange({ width: res.width, height: res.height });
    },
    [onVideoConfigChange, resolutions]
  );

  // Atualiza velocidade de reprodução
  const handleSpeedChange = useCallback((speed: number) => {
    setPlaybackSpeed(speed);
  }, []);

  // Atualiza display mode
  const handleDisplayModeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value as DisplayMode;
      setDisplayMode(value);
      onGlobalAnimationChange?.({
        displayMode: value,
        revealDirection,
        revealFraction,
      });
    },
    [onGlobalAnimationChange, revealDirection, revealFraction]
  );

  // Atualiza reveal direction
  const handleRevealDirectionChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value as RevealDirection;
      setRevealDirection(value);
      onGlobalAnimationChange?.({
        displayMode,
        revealDirection: value,
        revealFraction,
      });
    },
    [onGlobalAnimationChange, displayMode, revealFraction]
  );

  // Atualiza reveal fraction
  const handleRevealFractionChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = parseFloat(e.target.value);
      setRevealFraction(value);
      onGlobalAnimationChange?.({
        displayMode,
        revealDirection,
        revealFraction: value,
      });
    },
    [onGlobalAnimationChange, displayMode, revealDirection]
  );

  // Formata duração
  const formatDuration = (frames: number, fps: number): string => {
    const totalSeconds = frames / fps;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Status da exportação
  const getExportStatusText = () => {
    switch (exportStatus) {
      case 'rendering':
        return `Renderizando... ${Math.round(exportProgress)}%`;
      case 'done':
        return 'Exportação concluída!';
      case 'error':
        return 'Erro na exportação';
      default:
        return 'Pronto para exportar';
    }
  };

  // Conta total de elementos
  const totalElements = project.scenes.reduce((sum, scene) => sum + scene.elements.length, 0);

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Área do player */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 24 }}>
        <h2 style={{ color: 'white', marginBottom: 16 }}>Preview do Vídeo</h2>

        {/* Player */}
        <div
          style={{
            flex: 1,
            backgroundColor: '#000',
            borderRadius: 12,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Player
            ref={playerRef}
            component={VideoCompositionTimeline}
            inputProps={{ project }}
            durationInFrames={durationInFrames}
            fps={project.videoConfig.fps}
            compositionWidth={project.videoConfig.width}
            compositionHeight={project.videoConfig.height}
            style={{
              width: '100%',
              maxHeight: '100%',
            }}
            controls
            playbackRate={playbackSpeed}
          />
        </div>

        {/* Controles de velocidade */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginTop: 16,
            padding: '12px 16px',
            backgroundColor: '#1a1a2e',
            borderRadius: 8,
          }}
        >
          <span style={{ color: '#888', fontSize: 14 }}>Velocidade:</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {PLAYBACK_SPEEDS.map((speed) => (
              <button
                key={speed}
                onClick={() => handleSpeedChange(speed)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: playbackSpeed === speed ? '#6366f1' : '#2a2a4e',
                  border: 'none',
                  borderRadius: 6,
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: playbackSpeed === speed ? 600 : 400,
                }}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>

        {/* Informações */}
        <div
          style={{
            display: 'flex',
            gap: 24,
            marginTop: 12,
            color: '#888',
            fontSize: 14,
          }}
        >
          <div>
            Duração: <span style={{ color: 'white' }}>{formatDuration(durationInFrames, project.videoConfig.fps)}</span>
          </div>
          <div>
            Frames: <span style={{ color: 'white' }}>{durationInFrames}</span>
          </div>
          <div>
            FPS: <span style={{ color: 'white' }}>{project.videoConfig.fps}</span>
          </div>
          <div>
            Cenas: <span style={{ color: 'white' }}>{project.scenes.length}</span>
          </div>
          <div>
            Elementos: <span style={{ color: 'white' }}>{totalElements}</span>
          </div>
        </div>
      </div>

      {/* Painel de configurações */}
      <div
        style={{
          width: 400,
          backgroundColor: '#1a1a2e',
          borderLeft: '1px solid #2a2a4e',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        <h3 style={{ color: 'white', marginBottom: 24 }}>Configurações de Exportação</h3>

        {/* Aspect Ratio */}
        <div style={{ marginBottom: 20 }}>
          <label style={dropdownStyles.label}>Aspect Ratio</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['16:9', '1:1', '9:16'] as AspectRatio[]).map((ratio) => (
              <button
                key={ratio}
                onClick={() => handleAspectRatioChange(ratio)}
                style={{
                  flex: 1,
                  padding: '10px 8px',
                  backgroundColor: aspectRatio === ratio ? '#2a2a4e' : 'transparent',
                  border: aspectRatio === ratio ? '2px solid #6366f1' : '2px solid #4a4a6e',
                  borderRadius: 8,
                  color: aspectRatio === ratio ? 'white' : '#888',
                  cursor: 'pointer',
                  fontWeight: aspectRatio === ratio ? 600 : 400,
                  fontSize: 14,
                }}
              >
                {ratio}
              </button>
            ))}
          </div>
          <div style={dropdownStyles.description}>
            {aspectRatio === '16:9' && 'YouTube/TV (Padrão)'}
            {aspectRatio === '1:1' && 'Instagram/Feed'}
            {aspectRatio === '9:16' && 'Reels/Stories/TikTok'}
          </div>
        </div>

        {/* Resolução */}
        <div style={{ marginBottom: 20 }}>
          <label style={dropdownStyles.label}>Resolução</label>
          <select
            value={selectedResolution}
            onChange={handleResolutionChange}
            style={dropdownStyles.select}
          >
            {resolutions.map((res, index) => (
              <option key={res.label} value={index}>
                {res.label}
              </option>
            ))}
          </select>
        </div>

        {/* Separador */}
        <div style={{ height: 1, backgroundColor: '#4a4a6e', margin: '12px 0 20px' }} />

        <h4 style={{ color: 'white', marginBottom: 16, fontSize: 14 }}>Configurações de Animação</h4>

        {/* Display Mode */}
        <div style={{ marginBottom: 20 }}>
          <label style={dropdownStyles.label}>Exibição (Display Mode)</label>
          <select
            value={displayMode}
            onChange={handleDisplayModeChange}
            style={dropdownStyles.select}
          >
            {DISPLAY_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div style={dropdownStyles.description}>
            {DISPLAY_MODE_OPTIONS.find((o) => o.value === displayMode)?.description}
          </div>
        </div>

        {/* Reveal Direction */}
        <div style={{ marginBottom: 20 }}>
          <label style={dropdownStyles.label}>Animação (Reveal Direction)</label>
          <select
            value={revealDirection}
            onChange={handleRevealDirectionChange}
            style={dropdownStyles.select}
          >
            {REVEAL_DIRECTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div style={dropdownStyles.description}>
            {revealDirection === 'auto' && 'Detecta a direção pela posição do elemento na imagem'}
          </div>
        </div>

        {/* Reveal Percentage */}
        <div style={{ marginBottom: 20 }}>
          <label style={dropdownStyles.label}>Reveal % (Porcentagem de Revelação)</label>
          <select
            value={revealFraction}
            onChange={handleRevealFractionChange}
            style={dropdownStyles.select}
          >
            {REVEAL_PERCENTAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div style={dropdownStyles.description}>
            Define em que porcentagem do tempo a animação completa
          </div>
        </div>

        {/* Separador */}
        <div style={{ height: 1, backgroundColor: '#4a4a6e', margin: '12px 0 20px' }} />

        {/* Mostrar legendas */}
        <div style={{ marginBottom: 20 }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              color: 'white',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={project.showSubtitles}
              onChange={(e) => onShowSubtitlesChange?.(e.target.checked)}
              style={{ width: 20, height: 20 }}
            />
            Mostrar legendas no vídeo
          </label>
        </div>

        {/* Problemas */}
        {!ready && (
          <div
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid #ef4444',
              borderRadius: 8,
              padding: 16,
              marginBottom: 20,
            }}
          >
            <div style={{ color: '#ef4444', fontWeight: 600, marginBottom: 8 }}>
              Pendências:
            </div>
            <ul style={{ color: '#f87171', margin: 0, paddingLeft: 20 }}>
              {issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Barra de progresso */}
        {exportStatus === 'rendering' && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ color: '#888', marginBottom: 8 }}>{getExportStatusText()}</div>
            <div
              style={{
                height: 12,
                backgroundColor: '#2a2a4e',
                borderRadius: 6,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${exportProgress}%`,
                  height: '100%',
                  backgroundColor: '#6366f1',
                  transition: 'width 0.3s',
                }}
              />
            </div>
          </div>
        )}

        {/* Status de sucesso */}
        {exportStatus === 'done' && (
          <div
            style={{
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid #22c55e',
              borderRadius: 8,
              padding: 16,
              marginBottom: 20,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 8 }}>✓</div>
            <div style={{ color: '#22c55e', fontWeight: 600 }}>
              Vídeo exportado com sucesso!
            </div>
          </div>
        )}

        {/* Separador */}
        <div style={{ height: 1, backgroundColor: '#4a4a6e', margin: '12px 0 20px' }} />

        {/* Exportar para Editor de Vídeo */}
        <div style={{ marginBottom: 20 }}>
          <h4 style={{ color: 'white', marginBottom: 12, fontSize: 14 }}>
            Exportar para Editor de Vídeo
          </h4>

          {/* Opção de tratamento de mídia */}
          <div style={{ marginBottom: 16 }}>
            <label style={dropdownStyles.label}>Tratamento de Imagens</label>
            <select
              value={mediaHandling}
              onChange={(e) => setMediaHandling(e.target.value as MediaHandling)}
              style={dropdownStyles.select}
            >
              <option value="copy">Copiar para pasta do projeto (Recomendado)</option>
              <option value="reference">Manter caminhos originais</option>
            </select>
            <div style={dropdownStyles.description}>
              {mediaHandling === 'copy'
                ? 'Copia as imagens para uma pasta junto ao projeto'
                : 'Mantém referências aos arquivos originais'}
            </div>
          </div>

          {/* Botões de editores */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SUPPORTED_EDITORS.map((editor) => (
              <button
                key={editor.id}
                onClick={() => onExportToEditor?.(editor.id, mediaHandling)}
                disabled={!ready || editorExportStatus === 'exporting'}
                style={{
                  padding: '10px 16px',
                  backgroundColor: ready && editorExportStatus !== 'exporting' ? '#3b82f6' : '#4a4a6e',
                  border: 'none',
                  borderRadius: 6,
                  color: 'white',
                  cursor: ready && editorExportStatus !== 'exporting' ? 'pointer' : 'not-allowed',
                  opacity: ready && editorExportStatus !== 'exporting' ? 1 : 0.5,
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>
                  {editor.name} ({editor.extension})
                </span>
                <span style={{ fontSize: 12, color: '#93c5fd' }}>
                  {editor.format}
                </span>
              </button>
            ))}
          </div>

          {/* Status da exportação para editor */}
          {editorExportStatus === 'exporting' && (
            <div style={{ marginTop: 12, color: '#93c5fd', fontSize: 13 }}>
              Exportando projeto...
            </div>
          )}

          {editorExportStatus === 'done' && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid #22c55e',
                borderRadius: 6,
                color: '#22c55e',
                fontSize: 13,
              }}
            >
              {editorExportMessage || 'Projeto exportado com sucesso!'}
            </div>
          )}

          {editorExportStatus === 'error' && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid #ef4444',
                borderRadius: 6,
                color: '#ef4444',
                fontSize: 13,
              }}
            >
              {editorExportMessage || 'Erro ao exportar projeto'}
            </div>
          )}

          <p style={{ fontSize: 12, color: '#888', marginTop: 12, lineHeight: 1.5 }}>
            Exporta o projeto para continuar editando no software selecionado.
            <br />
            Nota: Animações de reveal serão convertidas para crops estáticos.
          </p>
        </div>

        {/* Espaçador */}
        <div style={{ flex: 1 }} />

        {/* Botões */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            onClick={onExport}
            disabled={!ready || exportStatus === 'rendering'}
            style={{
              padding: '14px 24px',
              backgroundColor: ready && exportStatus !== 'rendering' ? '#22c55e' : '#4a4a6e',
              border: 'none',
              borderRadius: 8,
              color: 'white',
              fontSize: 16,
              fontWeight: 600,
              cursor: ready && exportStatus !== 'rendering' ? 'pointer' : 'not-allowed',
              opacity: ready && exportStatus !== 'rendering' ? 1 : 0.5,
            }}
          >
            {exportStatus === 'rendering' ? 'Exportando...' : '🎬 Exportar Vídeo'}
          </button>

          {/* Botão Salvar */}
          {onSave && (
            <button
              onClick={onSave}
              disabled={exportStatus === 'rendering'}
              style={{
                padding: '12px 24px',
                backgroundColor: exportStatus === 'rendering' ? '#4a4a6e' : '#3b82f6',
                border: 'none',
                borderRadius: 8,
                color: 'white',
                cursor: exportStatus === 'rendering' ? 'not-allowed' : 'pointer',
                opacity: exportStatus === 'rendering' ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <span>💾</span>
              <span>Salvar Projeto</span>
            </button>
          )}

          <button
            onClick={onBack}
            disabled={exportStatus === 'rendering'}
            style={{
              padding: '12px 24px',
              backgroundColor: 'transparent',
              border: '2px solid #4a4a6e',
              borderRadius: 8,
              color: 'white',
              cursor: exportStatus === 'rendering' ? 'not-allowed' : 'pointer',
              opacity: exportStatus === 'rendering' ? 0.5 : 1,
            }}
          >
            ← Voltar para Editor
          </button>
        </div>
      </div>
    </div>
  );
};

export default TimelineExportStep;
