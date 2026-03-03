import React, { useState, useEffect } from 'react';
import type { ProjectData } from '../../types';
import { downloadProject } from '../../utils/projectSerializer';

// Tipagem para a API do Electron
declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      platform: string;
      saveFileDialog: (options: {
        defaultPath?: string;
        filters?: { name: string; extensions: string[] }[];
      }) => Promise<{ canceled: boolean; filePath?: string }>;
      renderVideo: (
        projectData: ProjectData,
        outputPath: string
      ) => Promise<{ success: boolean; outputPath?: string; error?: string }>;
      onRenderProgress: (callback: (progress: { progress: number; status: string }) => void) => void;
      removeRenderProgressListener: () => void;
    };
  }
}

interface ExportPanelProps {
  projectData: ProjectData;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  button: {
    padding: '12px 16px',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButton: {
    backgroundColor: '#e94560',
    color: '#fff',
  },
  secondaryButton: {
    backgroundColor: '#0f3460',
    color: '#ccc',
  },
  disabledButton: {
    backgroundColor: '#333',
    color: '#666',
    cursor: 'not-allowed',
  },
  info: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center' as const,
    padding: 8,
    backgroundColor: '#0f3460',
    borderRadius: 4,
  },
  progressContainer: {
    marginTop: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#0f3460',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4ecdc4',
    transition: 'width 0.3s ease',
  },
  progressText: {
    fontSize: 11,
    color: '#888',
    textAlign: 'center' as const,
    marginTop: 4,
  },
};

export const ExportPanel: React.FC<ExportPanelProps> = ({ projectData }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState({ progress: 0, status: 'idle' });

  // Verifica se está rodando no Electron de múltiplas formas
  const hasElectronAPI = !!window.electronAPI?.isElectron;
  const hasElectronUserAgent = typeof navigator !== 'undefined' &&
    navigator.userAgent.toLowerCase().includes('electron');
  const isElectron = hasElectronAPI || hasElectronUserAgent;

  // Log para debug
  useEffect(() => {
    console.log('=== ExportPanel Debug ===');
    console.log('window.electronAPI:', window.electronAPI);
    console.log('hasElectronAPI:', hasElectronAPI);
    console.log('hasElectronUserAgent:', hasElectronUserAgent);
    console.log('isElectron:', isElectron);
    console.log('userAgent:', navigator.userAgent);
  }, [hasElectronAPI, hasElectronUserAgent, isElectron]);

  const canExport =
    projectData.imageUrl &&
    projectData.scenes.length > 0 &&
    projectData.subtitles.length > 0;

  // Registra listener de progresso
  useEffect(() => {
    if (isElectron && window.electronAPI) {
      window.electronAPI.onRenderProgress((prog) => {
        setProgress(prog);
      });

      return () => {
        window.electronAPI?.removeRenderProgressListener();
      };
    }
  }, [isElectron]);

  const handleSaveProject = () => {
    const filename = `projeto-${new Date().toISOString().slice(0, 10)}.json`;
    downloadProject(projectData, filename);
  };

  const getStatusText = (status: string): string => {
    switch (status) {
      case 'bundling':
        return 'Preparando arquivos...';
      case 'preparing':
        return 'Configurando renderização...';
      case 'rendering':
        return 'Renderizando vídeo...';
      case 'done':
        return 'Concluído!';
      case 'error':
        return 'Erro na renderização';
      default:
        return '';
    }
  };

  const handleExportVideo = async () => {
    if (!canExport) return;

    // Se não estiver no Electron ou a API não está disponível
    if (!window.electronAPI) {
      if (isElectron) {
        // Está no Electron mas API não carregou - problema com preload
        alert(
          'Erro: API do Electron não está disponível.\n\n' +
          'Isso pode indicar um problema com o preload script.\n' +
          'Tente reiniciar o aplicativo ou recompilar com:\n\n' +
          'npm run dist:win'
        );
      } else {
        // Não está no Electron
        alert(
          'Para exportar o vídeo, execute no terminal:\n\n' +
          'npm run build\n\n' +
          'O vídeo será salvo em out/video.mp4'
        );
      }
      return;
    }

    // Abre diálogo para escolher onde salvar
    const result = await window.electronAPI.saveFileDialog({
      defaultPath: `video-${new Date().toISOString().slice(0, 10)}.mp4`,
      filters: [{ name: 'Vídeo MP4', extensions: ['mp4'] }],
    });

    if (result.canceled || !result.filePath) {
      return;
    }

    setIsExporting(true);
    setProgress({ progress: 0, status: 'bundling' });

    try {
      const renderResult = await window.electronAPI.renderVideo(
        projectData,
        result.filePath
      );

      if (renderResult.success) {
        alert(`Vídeo exportado com sucesso!\n\nSalvo em: ${renderResult.outputPath}`);
      } else {
        alert(`Erro ao exportar vídeo:\n\n${renderResult.error}`);
      }
    } catch (error) {
      console.error('Erro na exportação:', error);
      alert(`Erro ao exportar vídeo:\n\n${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    } finally {
      setIsExporting(false);
      setProgress({ progress: 0, status: 'idle' });
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.info}>
        {projectData.scenes.length} cenas •{' '}
        {projectData.scenes.reduce((acc, s) => acc + s.elements.length, 0)}{' '}
        elementos • {projectData.subtitles.length} legendas
      </div>

      <button
        style={{
          ...styles.button,
          ...styles.secondaryButton,
        }}
        onClick={handleSaveProject}
      >
        💾 Salvar Projeto
      </button>

      <button
        style={{
          ...styles.button,
          ...(canExport && !isExporting ? styles.primaryButton : styles.disabledButton),
        }}
        onClick={handleExportVideo}
        disabled={!canExport || isExporting}
      >
        {isExporting ? '⏳ Exportando...' : '🎬 Exportar Vídeo'}
      </button>

      {/* Barra de progresso durante exportação */}
      {isExporting && (
        <div style={styles.progressContainer}>
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${progress.progress}%`,
              }}
            />
          </div>
          <div style={styles.progressText}>
            {getStatusText(progress.status)} ({Math.round(progress.progress)}%)
          </div>
        </div>
      )}

      {!canExport && (
        <div style={{ ...styles.info, color: '#ff6b6b' }}>
          Adicione imagem, cenas e legendas para exportar
        </div>
      )}

      {!window.electronAPI && canExport && (
        <div style={{ ...styles.info, color: '#ffa500' }}>
          {isElectron
            ? 'API do Electron não detectada - recompile o app'
            : 'Execute no app desktop para exportar diretamente'}
        </div>
      )}
    </div>
  );
};
