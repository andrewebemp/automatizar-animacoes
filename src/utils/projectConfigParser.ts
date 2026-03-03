/**
 * Parser para arquivos de configuração de projeto (.txt)
 * Extrai informações sobre cenas e elementos de um arquivo formatado
 */

/**
 * Configuração de uma cena extraída do arquivo
 */
export interface SceneConfig {
  /** Número da cena (1, 2, 3...) */
  sceneNumber: number;
  /** Quantidade de elementos visuais na cena */
  elementsCount: number;
  /** Timestamp de início (se disponível) */
  startTime?: string;
  /** Timestamp de fim (se disponível) */
  endTime?: string;
}

/**
 * Configuração do projeto extraída do arquivo
 */
export interface ProjectConfig {
  /** Lista de configurações de cena */
  scenes: SceneConfig[];
  /** Duração total do projeto (se disponível) */
  totalDuration?: number;
  /** Número total de palavras (se disponível) */
  wordCount?: number;
}

/**
 * Parseia um arquivo de configuração de projeto e extrai informações de cenas
 *
 * Formato esperado:
 * - Cenas marcadas com "## CENA N | timestamp - timestamp"
 * - Elementos marcados com [1], [2], [3], etc. na seção VISUAL ELEMENTS
 *
 * @param content Conteúdo do arquivo TXT
 * @returns Configuração do projeto com cenas e elementos
 */
export function parseProjectConfig(content: string): ProjectConfig {
  const scenes: SceneConfig[] = [];

  // Divide o conteúdo por cenas usando o padrão "## CENA N"
  // Regex para encontrar headers de cena: "## CENA N | timestamp - timestamp"
  const sceneHeaderRegex = /##\s*CENA\s+(\d+)\s*\|\s*(\d{2}:\d{2}:\d{2},\d{3})\s*-\s*(\d{2}:\d{2}:\d{2},\d{3})/gi;

  // Encontra todas as cenas
  const sceneMatches = [...content.matchAll(sceneHeaderRegex)];

  for (let i = 0; i < sceneMatches.length; i++) {
    const match = sceneMatches[i];
    const sceneNumber = parseInt(match[1], 10);
    const startTime = match[2];
    const endTime = match[3];

    // Determina o início e fim do conteúdo desta cena
    const sceneStart = match.index! + match[0].length;
    const sceneEnd = i < sceneMatches.length - 1
      ? sceneMatches[i + 1].index!
      : content.length;

    const sceneContent = content.slice(sceneStart, sceneEnd);

    // Conta os elementos visuais [1], [2], [3], etc.
    // Procura na seção "VISUAL ELEMENTS" ou em qualquer lugar do bloco da cena
    const elementsCount = countVisualElements(sceneContent);

    scenes.push({
      sceneNumber,
      elementsCount,
      startTime,
      endTime,
    });
  }

  // Extrai metadados adicionais se disponíveis
  const durationMatch = content.match(/Duração total:\s*([\d.]+)\s*segundos/i);
  const wordCountMatch = content.match(/Palavras transcritas:\s*(\d+)/i);

  return {
    scenes,
    totalDuration: durationMatch ? parseFloat(durationMatch[1]) : undefined,
    wordCount: wordCountMatch ? parseInt(wordCountMatch[1], 10) : undefined,
  };
}

/**
 * Conta a quantidade de elementos visuais marcados com [N] em um bloco de texto
 *
 * @param content Conteúdo do bloco da cena
 * @returns Quantidade de elementos únicos encontrados
 */
function countVisualElements(content: string): number {
  // Procura especificamente na seção VISUAL ELEMENTS
  const visualElementsSection = extractVisualElementsSection(content);
  const textToSearch = visualElementsSection || content;

  // Regex para encontrar marcadores [1], [2], [3], etc.
  const elementRegex = /\[(\d+)\]/g;
  const matches = [...textToSearch.matchAll(elementRegex)];

  // Usa Set para contar elementos únicos (evita duplicatas)
  const uniqueElements = new Set<number>();
  for (const match of matches) {
    uniqueElements.add(parseInt(match[1], 10));
  }

  return uniqueElements.size;
}

/**
 * Extrai a seção "VISUAL ELEMENTS" de um bloco de cena
 */
function extractVisualElementsSection(content: string): string | null {
  // Procura pelo início da seção VISUAL ELEMENTS
  const startPattern = /VISUAL ELEMENTS[^\n]*\n/i;
  const startMatch = content.match(startPattern);

  if (!startMatch || startMatch.index === undefined) {
    return null;
  }

  const sectionStart = startMatch.index + startMatch[0].length;

  // Procura pelo fim da seção (próxima seção em maiúsculas ou fim do conteúdo)
  const remainingContent = content.slice(sectionStart);
  const endPattern = /\n[A-Z]{3,}[^\n]*:/;
  const endMatch = remainingContent.match(endPattern);

  if (endMatch && endMatch.index !== undefined) {
    return remainingContent.slice(0, endMatch.index);
  }

  return remainingContent;
}

/**
 * Valida se um arquivo é um arquivo de configuração de projeto válido
 *
 * @param content Conteúdo do arquivo
 * @returns true se contém pelo menos uma cena válida
 */
export function isValidProjectConfig(content: string): boolean {
  const config = parseProjectConfig(content);
  return config.scenes.length > 0 && config.scenes.every(s => s.elementsCount > 0);
}

/**
 * Formata a configuração do projeto para exibição
 */
export function formatProjectConfigSummary(config: ProjectConfig): string {
  const lines: string[] = [];

  lines.push(`📊 Configuração detectada:`);
  lines.push(`   Cenas: ${config.scenes.length}`);

  for (const scene of config.scenes) {
    lines.push(`   • Cena ${scene.sceneNumber}: ${scene.elementsCount} elemento${scene.elementsCount > 1 ? 's' : ''}`);
  }

  if (config.totalDuration) {
    lines.push(`   Duração: ${config.totalDuration}s`);
  }

  return lines.join('\n');
}
