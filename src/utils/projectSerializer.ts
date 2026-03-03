import type { ProjectData } from '../types';
import { createEmptyProject } from '../types/ProjectData';

/**
 * Serializa os dados do projeto para JSON.
 *
 * @param project - Dados do projeto
 * @returns String JSON
 */
export function serializeProject(project: ProjectData): string {
  return JSON.stringify(project, null, 2);
}

/**
 * Deserializa JSON para dados do projeto.
 *
 * @param json - String JSON
 * @returns Dados do projeto
 */
export function deserializeProject(json: string): ProjectData {
  try {
    const parsed = JSON.parse(json);

    // Valida estrutura básica
    if (!parsed.scenes || !Array.isArray(parsed.scenes)) {
      throw new Error('Estrutura de projeto inválida: scenes ausente ou inválido');
    }

    // Mescla com projeto vazio para garantir todas as propriedades
    const emptyProject = createEmptyProject();
    return {
      ...emptyProject,
      ...parsed,
      videoConfig: {
        ...emptyProject.videoConfig,
        ...parsed.videoConfig,
      },
      revealStyle: {
        ...emptyProject.revealStyle,
        ...parsed.revealStyle,
      },
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('JSON inválido');
    }
    throw error;
  }
}

/**
 * Salva o projeto em um arquivo.
 * Retorna o blob para download.
 *
 * @param project - Dados do projeto
 * @param filename - Nome do arquivo
 * @returns Blob do arquivo
 */
export function downloadProject(project: ProjectData, filename: string): void {
  const json = serializeProject(project);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.json') ? filename : `${filename}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Carrega uma imagem e retorna suas dimensões.
 *
 * @param file - Arquivo de imagem
 * @returns Promise com URL base64 e dimensões
 */
export async function loadImage(
  file: File
): Promise<{ url: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const url = e.target?.result as string;
      const img = new Image();

      img.onload = () => {
        resolve({
          url,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      };

      img.onerror = () => {
        reject(new Error('Falha ao carregar imagem'));
      };

      img.src = url;
    };

    reader.onerror = () => {
      reject(new Error('Falha ao ler arquivo'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Carrega um arquivo SRT e retorna seu conteúdo.
 *
 * @param file - Arquivo SRT
 * @returns Promise com conteúdo do arquivo
 */
export async function loadSRTFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      resolve(e.target?.result as string);
    };

    reader.onerror = () => {
      reject(new Error('Falha ao ler arquivo SRT'));
    };

    reader.readAsText(file);
  });
}
