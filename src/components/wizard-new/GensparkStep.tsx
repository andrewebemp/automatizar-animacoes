import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { GeneratedScenePrompt } from '../../utils/aiPromptGenerator';
import { generateImages, imageUrlToBase64, type ImageGenProgress } from '../../utils/imageGenApi';
import { loadApiConfig, isImageGenConfigValid, IMAGE_GEN_PROVIDER_NAMES, IMAGE_GEN_MODELS, type ImageGenApiConfig } from '../../types/ApiConfig';

interface GensparkStepProps {
  /** Prompts gerados no passo anterior */
  prompts: GeneratedScenePrompt[];
  /** Callback quando imagens são importadas */
  onImagesGenerated: (images: GeneratedImage[]) => void;
  /** Callback para pular este passo */
  onSkip: () => void;
  /** Callback para voltar */
  onBack: () => void;
  /** Callback para salvar o projeto */
  onSave?: () => void;
  /** Callback quando prompts são importados via upload */
  onPromptsUploaded?: (prompts: GeneratedScenePrompt[]) => void;
}

export interface GeneratedImage {
  index: number;
  filePath: string;
  dataUrl: string;
  prompt?: string;
}

type TabType = 'prompts' | 'playwright' | 'extension' | 'api';
type AspectRatio = '16:9' | '1:1' | '9:16';

interface PlaywrightProgress {
  status: 'idle' | 'launching' | 'navigating' | 'login_required' | 'configuring' | 'generating' | 'generating_batch' | 'rate_limited' | 'retrying' | 'resuming' | 'completed' | 'error';
  current?: number;
  total?: number;
  message?: string;
  waitTime?: number;
  retryDelay?: number;
}

interface ChromeProfile {
  name: string;
  path: string;
  profileDir: string | null; // Nome da pasta do perfil (Default, Profile 1, etc)
  isAppProfile: boolean;
  exists: boolean;
  email: string | null;
  gaiaName?: string | null;
  warning?: string;
}

interface DetectedImage {
  filePath: string;
  fileName: string;
  dataUrl: string;
  timestamp: number;
}

interface EditablePrompt {
  id: number;
  text: string;
  originalText: string;
  isEditing: boolean;
  isSelected: boolean;
}

/**
 * Passo: Geração de Imagens
 * Oferece quatro opções:
 * 1. Preview/Edição de Prompts - Visualiza e edita prompts antes de gerar
 * 2. Via Extensão - Exporta prompts, monitora pasta, importa imagens (Genspark)
 * 3. Automação via Playwright - Controla o navegador automaticamente (Genspark)
 * 4. Via API - Usa APIs de geração de imagem (OpenAI, Stability, FLUX, etc.)
 */
export const GensparkStep: React.FC<GensparkStepProps> = ({
  prompts,
  onImagesGenerated,
  onSkip,
  onBack,
  onSave,
  onPromptsUploaded,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('prompts');

  // Estado compartilhado
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);

  // Estado dos prompts editáveis
  const [editablePrompts, setEditablePrompts] = useState<EditablePrompt[]>(() =>
    prompts.map((p, i) => ({
      id: i,
      text: p.imagePrompt || '',
      originalText: p.imagePrompt || '',
      isEditing: false,
      isSelected: true,
    }))
  );

  // Referência para o input de arquivo
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handler para upload de prompts via arquivo
  const handleUploadPrompts = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) return;

      // Parse do arquivo de prompts
      // Suporta múltiplos formatos:
      // 1. Um prompt por linha
      // 2. Prompts separados por "---" ou "==="
      // 3. Formato "=== IMAGEM X ===" do sistema
      const lines = content.split('\n');
      const parsedPrompts: string[] = [];
      let currentPrompt = '';
      let inPromptBlock = false;

      for (const line of lines) {
        const trimmedLine = line.trim();

        // Detecta separadores
        if (trimmedLine.match(/^={3,}/) || trimmedLine.match(/^-{3,}/)) {
          if (currentPrompt.trim()) {
            parsedPrompts.push(currentPrompt.trim());
            currentPrompt = '';
          }
          inPromptBlock = false;
          continue;
        }

        // Ignora linhas de header como "=== IMAGEM 1 ===" ou "Texto fonte:"
        if (trimmedLine.match(/^(IMAGEM|Texto fonte|Elementos visuais|Prompt completo)/i)) {
          continue;
        }

        // Detecta início de bloco de código
        if (trimmedLine === '```') {
          inPromptBlock = !inPromptBlock;
          continue;
        }

        // Adiciona linha ao prompt atual
        if (trimmedLine) {
          currentPrompt += (currentPrompt ? '\n' : '') + trimmedLine;
        }
      }

      // Adiciona último prompt se existir
      if (currentPrompt.trim()) {
        parsedPrompts.push(currentPrompt.trim());
      }

      if (parsedPrompts.length === 0) {
        alert('Nenhum prompt encontrado no arquivo. Verifique o formato.');
        return;
      }

      // Converte para o formato esperado
      const newPrompts: GeneratedScenePrompt[] = parsedPrompts.map((text, i) => ({
        sceneNumber: i + 1,
        startTime: 0,
        endTime: 0,
        narrationText: '',
        visualElements: [],
        imagePrompt: text,
      }));

      // Atualiza estado local
      setEditablePrompts(
        newPrompts.map((p, i) => ({
          id: i,
          text: p.imagePrompt || '',
          originalText: p.imagePrompt || '',
          isEditing: false,
          isSelected: true,
        }))
      );

      // Notifica o parent se o callback existir
      onPromptsUploaded?.(newPrompts);

      alert(`${parsedPrompts.length} prompts importados com sucesso!`);
    };

    reader.onerror = () => {
      alert('Erro ao ler o arquivo.');
    };

    reader.readAsText(file);

    // Limpa o input para permitir selecionar o mesmo arquivo novamente
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onPromptsUploaded]);

  // Cleanup listeners ao desmontar
  useEffect(() => {
    return () => {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.removeGensparkListeners) {
        electronAPI.removeGensparkListeners();
      }
    };
  }, []);

  // Atualiza editablePrompts quando prompts mudam
  useEffect(() => {
    setEditablePrompts(
      prompts.map((p, i) => ({
        id: i,
        text: p.imagePrompt || '',
        originalText: p.imagePrompt || '',
        isEditing: false,
        isSelected: true,
      }))
    );
  }, [prompts]);

  // Extrai apenas os prompts selecionados
  const selectedPrompts = editablePrompts.filter(p => p.isSelected).map(p => p.text);

  return (
    <div style={{ padding: 32, height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Input de arquivo oculto para upload de prompts */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md"
          onChange={handleUploadPrompts}
          style={{ display: 'none' }}
        />

        {/* Cabeçalho */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ color: 'white', marginBottom: 8 }}>Geração de Imagens</h2>
          <p style={{ color: '#888', margin: 0 }}>
            {selectedPrompts.length} de {editablePrompts.length} prompts selecionados. Revise, edite e escolha o método de geração.
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveTab('prompts')}
            style={{
              padding: '12px 24px',
              backgroundColor: activeTab === 'prompts' ? '#8b5cf6' : '#2a2a4e',
              border: 'none',
              borderRadius: 8,
              color: 'white',
              cursor: 'pointer',
              fontWeight: activeTab === 'prompts' ? 600 : 400,
            }}
          >
            📝 Revisar Prompts ({selectedPrompts.length})
          </button>
          <button
            onClick={() => setActiveTab('extension')}
            style={{
              padding: '12px 24px',
              backgroundColor: activeTab === 'extension' ? '#6366f1' : '#2a2a4e',
              border: 'none',
              borderRadius: 8,
              color: 'white',
              cursor: 'pointer',
              fontWeight: activeTab === 'extension' ? 600 : 400,
            }}
          >
            📁 Via Extensão (Recomendado)
          </button>
          <button
            onClick={() => setActiveTab('playwright')}
            style={{
              padding: '12px 24px',
              backgroundColor: activeTab === 'playwright' ? '#6366f1' : '#2a2a4e',
              border: 'none',
              borderRadius: 8,
              color: 'white',
              cursor: 'pointer',
              fontWeight: activeTab === 'playwright' ? 600 : 400,
            }}
          >
            🤖 Automático (Playwright)
          </button>
          <button
            onClick={() => setActiveTab('api')}
            style={{
              padding: '12px 24px',
              backgroundColor: activeTab === 'api' ? '#22c55e' : '#2a2a4e',
              border: 'none',
              borderRadius: 8,
              color: 'white',
              cursor: 'pointer',
              fontWeight: activeTab === 'api' ? 600 : 400,
            }}
          >
            🌐 Via API
          </button>

          {/* Separador visual */}
          <div style={{ width: 1, backgroundColor: '#4a4a6e', margin: '0 8px' }} />

          {/* Botão de Upload de Prompts */}
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: '12px 24px',
              backgroundColor: '#f59e0b',
              border: 'none',
              borderRadius: 8,
              color: 'white',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            📤 Upload Prompts
          </button>
        </div>

        {/* Configuração de Aspect Ratio compartilhada */}
        <div
          style={{
            backgroundColor: '#1a1a2e',
            borderRadius: 12,
            padding: 20,
            marginBottom: 24,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ color: '#888' }}>Proporção da imagem:</span>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
              style={{
                padding: '8px 16px',
                backgroundColor: '#0f0f1a',
                border: '1px solid #4a4a6e',
                borderRadius: 6,
                color: 'white',
                cursor: 'pointer',
              }}
            >
              <option value="16:9">16:9 (Horizontal)</option>
              <option value="1:1">1:1 (Quadrado)</option>
              <option value="9:16">9:16 (Vertical)</option>
            </select>
          </div>
        </div>

        {/* Conteúdo da Tab */}
        {activeTab === 'prompts' ? (
          <PromptsPreviewPanel
            editablePrompts={editablePrompts}
            setEditablePrompts={setEditablePrompts}
            onContinue={() => setActiveTab('extension')}
          />
        ) : activeTab === 'playwright' ? (
          <PlaywrightPanel
            prompts={selectedPrompts}
            aspectRatio={aspectRatio}
            generatedImages={generatedImages}
            setGeneratedImages={setGeneratedImages}
            onImagesGenerated={onImagesGenerated}
          />
        ) : activeTab === 'api' ? (
          <ApiPanel
            prompts={selectedPrompts}
            aspectRatio={aspectRatio}
            generatedImages={generatedImages}
            setGeneratedImages={setGeneratedImages}
            onImagesGenerated={onImagesGenerated}
          />
        ) : (
          <ExtensionPanel
            prompts={selectedPrompts}
            aspectRatio={aspectRatio}
            generatedImages={generatedImages}
            setGeneratedImages={setGeneratedImages}
            onImagesGenerated={onImagesGenerated}
          />
        )}

        {/* Botões de navegação */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 24,
            borderTop: '1px solid #2a2a4e',
            marginTop: 24,
          }}
        >
          <button
            onClick={onBack}
            style={{
              padding: '12px 24px',
              backgroundColor: 'transparent',
              border: '2px solid #4a4a6e',
              color: 'white',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            ← Voltar
          </button>

          <div style={{ display: 'flex', gap: 12 }}>
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

            <button
              onClick={onSkip}
              style={{
                padding: '12px 24px',
                backgroundColor: '#4a4a6e',
                border: 'none',
                color: 'white',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Pular (Upload Manual) →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// PAINEL DE PREVIEW/EDIÇÃO DE PROMPTS
// ============================================

interface PromptsPreviewPanelProps {
  editablePrompts: EditablePrompt[];
  setEditablePrompts: React.Dispatch<React.SetStateAction<EditablePrompt[]>>;
  onContinue: () => void;
}

const PromptsPreviewPanel: React.FC<PromptsPreviewPanelProps> = ({
  editablePrompts,
  setEditablePrompts,
  onContinue,
}) => {
  const [expandedPrompt, setExpandedPrompt] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Filtra prompts pela busca
  const filteredPrompts = editablePrompts.filter(p =>
    p.text.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Selecionar/desselecionar todos
  const handleSelectAll = () => {
    const allSelected = editablePrompts.every(p => p.isSelected);
    setEditablePrompts(prev =>
      prev.map(p => ({ ...p, isSelected: !allSelected }))
    );
  };

  // Toggle seleção individual
  const handleToggleSelect = (id: number) => {
    setEditablePrompts(prev =>
      prev.map(p => p.id === id ? { ...p, isSelected: !p.isSelected } : p)
    );
  };

  // Iniciar edição
  const handleStartEdit = (id: number) => {
    setEditablePrompts(prev =>
      prev.map(p => p.id === id ? { ...p, isEditing: true } : p)
    );
    setExpandedPrompt(id);
  };

  // Salvar edição
  const handleSaveEdit = (id: number, newText: string) => {
    setEditablePrompts(prev =>
      prev.map(p => p.id === id ? { ...p, text: newText, isEditing: false } : p)
    );
  };

  // Cancelar edição
  const handleCancelEdit = (id: number) => {
    setEditablePrompts(prev =>
      prev.map(p => p.id === id ? { ...p, text: p.originalText, isEditing: false } : p)
    );
  };

  // Restaurar original
  const handleRestore = (id: number) => {
    setEditablePrompts(prev =>
      prev.map(p => p.id === id ? { ...p, text: p.originalText } : p)
    );
  };

  // Drag and drop para reordenar
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newPrompts = [...editablePrompts];
    const draggedItem = newPrompts[draggedIndex];
    newPrompts.splice(draggedIndex, 1);
    newPrompts.splice(index, 0, draggedItem);

    // Atualiza IDs para manter ordem
    const updatedPrompts = newPrompts.map((p, i) => ({ ...p, id: i }));
    setEditablePrompts(updatedPrompts);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const selectedCount = editablePrompts.filter(p => p.isSelected).length;
  const modifiedCount = editablePrompts.filter(p => p.text !== p.originalText).length;

  return (
    <div>
      {/* Barra de ferramentas */}
      <div
        style={{
          backgroundColor: '#1a1a2e',
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        {/* Busca */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar nos prompts..."
            style={{
              width: '100%',
              padding: '10px 16px',
              backgroundColor: '#0f0f1a',
              border: '1px solid #4a4a6e',
              borderRadius: 6,
              color: 'white',
            }}
          />
        </div>

        {/* Botões de ação */}
        <button
          onClick={handleSelectAll}
          style={{
            padding: '10px 16px',
            backgroundColor: '#4a4a6e',
            border: 'none',
            borderRadius: 6,
            color: 'white',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          {editablePrompts.every(p => p.isSelected) ? '☐ Desmarcar Todos' : '☑ Selecionar Todos'}
        </button>

        {/* Status */}
        <div style={{ color: '#888', fontSize: 13 }}>
          <span style={{ color: '#22c55e' }}>{selectedCount}</span> selecionados
          {modifiedCount > 0 && (
            <span style={{ marginLeft: 12 }}>
              <span style={{ color: '#f59e0b' }}>{modifiedCount}</span> modificados
            </span>
          )}
        </div>
      </div>

      {/* Lista de prompts */}
      <div
        style={{
          backgroundColor: '#1a1a2e',
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
          maxHeight: 500,
          overflowY: 'auto',
        }}
      >
        <h3 style={{ color: '#8b5cf6', margin: '0 0 16px' }}>
          Prompts ({filteredPrompts.length})
        </h3>

        {filteredPrompts.length === 0 ? (
          <p style={{ color: '#888', textAlign: 'center', padding: 40 }}>
            {searchTerm ? 'Nenhum prompt encontrado' : 'Nenhum prompt disponível'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredPrompts.map((prompt, index) => (
              <PromptCard
                key={prompt.id}
                prompt={prompt}
                index={index}
                isExpanded={expandedPrompt === prompt.id}
                onToggleExpand={() => setExpandedPrompt(expandedPrompt === prompt.id ? null : prompt.id)}
                onToggleSelect={() => handleToggleSelect(prompt.id)}
                onStartEdit={() => handleStartEdit(prompt.id)}
                onSaveEdit={(text) => handleSaveEdit(prompt.id, text)}
                onCancelEdit={() => handleCancelEdit(prompt.id)}
                onRestore={() => handleRestore(prompt.id)}
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                isDragging={draggedIndex === index}
              />
            ))}
          </div>
        )}
      </div>

      {/* Botão para continuar */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <button
          onClick={onContinue}
          disabled={selectedCount === 0}
          style={{
            padding: '14px 32px',
            backgroundColor: selectedCount > 0 ? '#6366f1' : '#4a4a6e',
            border: 'none',
            borderRadius: 8,
            color: 'white',
            cursor: selectedCount > 0 ? 'pointer' : 'not-allowed',
            fontWeight: 600,
            fontSize: 15,
          }}
        >
          Continuar com {selectedCount} Prompts →
        </button>
      </div>
    </div>
  );
};

// Componente de card individual de prompt
interface PromptCardProps {
  prompt: EditablePrompt;
  index: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onStartEdit: () => void;
  onSaveEdit: (text: string) => void;
  onCancelEdit: () => void;
  onRestore: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}

const PromptCard: React.FC<PromptCardProps> = ({
  prompt,
  index,
  isExpanded,
  onToggleExpand,
  onToggleSelect,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onRestore,
  onDragStart,
  onDragOver,
  onDragEnd,
  isDragging,
}) => {
  const [editText, setEditText] = useState(prompt.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isModified = prompt.text !== prompt.originalText;

  useEffect(() => {
    setEditText(prompt.text);
  }, [prompt.text]);

  useEffect(() => {
    if (prompt.isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(editText.length, editText.length);
    }
  }, [prompt.isEditing]);

  const truncatedText = prompt.text.length > 150
    ? prompt.text.substring(0, 150) + '...'
    : prompt.text;

  return (
    <div
      draggable={!prompt.isEditing}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      style={{
        backgroundColor: '#0f0f1a',
        borderRadius: 8,
        border: `2px solid ${prompt.isSelected ? '#6366f1' : isModified ? '#f59e0b' : '#2a2a4e'}`,
        opacity: isDragging ? 0.5 : prompt.isSelected ? 1 : 0.6,
        transition: 'all 0.2s',
      }}
    >
      {/* Header do card */}
      <div
        style={{
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderBottom: isExpanded || prompt.isEditing ? '1px solid #2a2a4e' : 'none',
          cursor: 'grab',
        }}
      >
        {/* Handle de drag */}
        <span style={{ color: '#4a4a6e', cursor: 'grab' }}>⋮⋮</span>

        {/* Checkbox */}
        <input
          type="checkbox"
          checked={prompt.isSelected}
          onChange={onToggleSelect}
          style={{ width: 18, height: 18, cursor: 'pointer' }}
        />

        {/* Número */}
        <span
          style={{
            backgroundColor: '#2a2a4e',
            padding: '4px 10px',
            borderRadius: 4,
            color: '#888',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          #{index + 1}
        </span>

        {/* Preview do texto */}
        <div
          style={{
            flex: 1,
            color: 'white',
            fontSize: 13,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            cursor: 'pointer',
          }}
          onClick={onToggleExpand}
        >
          {truncatedText}
        </div>

        {/* Indicadores */}
        {isModified && (
          <span
            style={{
              backgroundColor: '#f59e0b',
              color: 'black',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            Editado
          </span>
        )}

        {/* Botões */}
        <button
          onClick={onToggleExpand}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            padding: 4,
          }}
        >
          {isExpanded ? '▲' : '▼'}
        </button>

        <button
          onClick={onStartEdit}
          style={{
            backgroundColor: '#4a4a6e',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            padding: '6px 12px',
            borderRadius: 4,
            fontSize: 12,
          }}
        >
          ✏️ Editar
        </button>
      </div>

      {/* Conteúdo expandido */}
      {(isExpanded || prompt.isEditing) && (
        <div style={{ padding: 16 }}>
          {prompt.isEditing ? (
            <>
              <textarea
                ref={textareaRef}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: 150,
                  padding: 12,
                  backgroundColor: '#1a1a2e',
                  border: '1px solid #4a4a6e',
                  borderRadius: 6,
                  color: 'white',
                  fontSize: 13,
                  lineHeight: 1.6,
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  onClick={() => onSaveEdit(editText)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#22c55e',
                    border: 'none',
                    borderRadius: 6,
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  ✓ Salvar
                </button>
                <button
                  onClick={onCancelEdit}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#ef4444',
                    border: 'none',
                    borderRadius: 6,
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  ✕ Cancelar
                </button>
                {isModified && (
                  <button
                    onClick={onRestore}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#4a4a6e',
                      border: 'none',
                      borderRadius: 6,
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    ↩ Restaurar Original
                  </button>
                )}
              </div>
            </>
          ) : (
            <div
              style={{
                color: '#ccc',
                fontSize: 13,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
              }}
            >
              {prompt.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================
// PAINEL PLAYWRIGHT
// ============================================

interface PlaywrightPanelProps {
  prompts: string[];
  aspectRatio: AspectRatio;
  generatedImages: GeneratedImage[];
  setGeneratedImages: React.Dispatch<React.SetStateAction<GeneratedImage[]>>;
  onImagesGenerated: (images: GeneratedImage[]) => void;
}

const PlaywrightPanel: React.FC<PlaywrightPanelProps> = ({
  prompts,
  aspectRatio,
  generatedImages,
  setGeneratedImages,
  onImagesGenerated,
}) => {
  const [status, setStatus] = useState<PlaywrightProgress['status']>('idle');
  const [progress, setProgress] = useState<PlaywrightProgress>({ status: 'idle' });
  const [profiles, setProfiles] = useState<ChromeProfile[]>([]);
  const [selectedProfileIndex, setSelectedProfileIndex] = useState<number>(0); // Índice do perfil selecionado
  const [outputFolder, setOutputFolder] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [parallelCount, setParallelCount] = useState<number>(1);

  const electronAPI = (window as any).electronAPI;

  // Perfil selecionado atual
  const selectedProfile = profiles[selectedProfileIndex] || null;

  // Carrega perfis do Chrome ao montar
  useEffect(() => {
    const loadProfiles = async () => {
      if (electronAPI?.getChromeProfiles) {
        try {
          const result = await electronAPI.getChromeProfiles();
          if (result.profiles) {
            setProfiles(result.profiles);
          }
        } catch (err) {
          console.error('[GensparkStep] Erro ao carregar perfis:', err);
        }
      }
    };
    loadProfiles();
  }, []);

  // Configura listeners de progresso
  useEffect(() => {
    if (!electronAPI) return;

    electronAPI.onGensparkProgress?.((data: PlaywrightProgress) => {
      setProgress(data);
      setStatus(data.status);
    });

    electronAPI.onGensparkImageGenerated?.((data: GeneratedImage) => {
      setGeneratedImages(prev => [...prev, data]);
    });

    electronAPI.onGensparkError?.((data: { message: string }) => {
      setError(data.message);
    });

    return () => {
      electronAPI.removeGensparkListeners?.();
    };
  }, []);

  const handleSelectFolder = async () => {
    if (!electronAPI?.gensparkSelectFolder) return;

    const result = await electronAPI.gensparkSelectFolder();
    if (result.folderPath) {
      setOutputFolder(result.folderPath);
    }
  };

  const handleStart = async () => {
    if (!electronAPI?.gensparkPlaywrightStart) {
      setError('API do Electron não disponível');
      return;
    }

    if (!outputFolder) {
      setError('Selecione uma pasta de saída');
      return;
    }

    if (prompts.length === 0) {
      setError('Nenhum prompt selecionado');
      return;
    }

    setError(null);
    setStatus('launching');
    setGeneratedImages([]);

    // Determina profilePath e profileDir baseado na seleção
    const profilePath = selectedProfile?.isAppProfile ? 'auto' : selectedProfile?.path || 'auto';
    const profileDir = selectedProfile?.profileDir || null;

    console.log('[GensparkStep] Iniciando com perfil:', {
      profilePath,
      profileDir,
      email: selectedProfile?.email
    });

    try {
      const result = await electronAPI.gensparkPlaywrightStart({
        prompts,
        aspectRatio,
        profilePath,
        profileDir, // Passa o nome da pasta do perfil (Default, Profile 1, etc)
        outputFolder,
        delayBetweenPrompts: 5000,
        parallelCount,
        resumeFromState: true,
      });

      if (result.success && result.images) {
        setStatus('completed');
      } else if (result.error) {
        setError(result.error);
        setStatus('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      setStatus('error');
    }
  };

  const handleCancel = async () => {
    if (electronAPI?.gensparkPlaywrightCancel) {
      await electronAPI.gensparkPlaywrightCancel();
      setStatus('idle');
    }
  };

  const handleImport = () => {
    if (generatedImages.length > 0) {
      onImagesGenerated(generatedImages);
    }
  };

  const isRunning = ['launching', 'navigating', 'login_required', 'configuring', 'generating', 'generating_batch', 'rate_limited', 'retrying', 'resuming'].includes(status);

  return (
    <div>
      {/* Aviso */}
      <div
        style={{
          backgroundColor: '#332700',
          border: '1px solid #665200',
          borderRadius: 8,
          padding: 16,
          marginBottom: 24,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
        }}
      >
        <span style={{ fontSize: 20 }}>⚠</span>
        <div style={{ color: '#ffd000', fontSize: 14 }}>
          <strong>Atenção:</strong> O Playwright abrirá uma janela do Chrome e controlará automaticamente.
          Não mexa na janela do navegador durante a geração.
          Certifique-se de estar logado no Genspark com sua conta Google.
        </div>
      </div>

      {/* Configurações */}
      <div
        style={{
          backgroundColor: '#1a1a2e',
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <h3 style={{ color: '#6366f1', margin: '0 0 16px' }}>Configurações</h3>

        {/* Perfil do Chrome */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ color: '#888', fontSize: 14, display: 'block', marginBottom: 8 }}>
            Perfil do Chrome:
          </label>
          <select
            value={selectedProfileIndex}
            onChange={(e) => setSelectedProfileIndex(Number(e.target.value))}
            disabled={isRunning}
            style={{
              width: '100%',
              padding: '10px 16px',
              backgroundColor: '#0f0f1a',
              border: '1px solid #4a4a6e',
              borderRadius: 6,
              color: 'white',
              cursor: isRunning ? 'not-allowed' : 'pointer',
            }}
          >
            {profiles.map((profile, index) => (
              <option key={index} value={index}>
                {profile.name} {profile.warning && !profile.isAppProfile ? '⚠' : ''}
              </option>
            ))}
          </select>
          {selectedProfile && !selectedProfile.isAppProfile && selectedProfile.warning && (
            <p style={{ color: '#f59e0b', fontSize: 12, margin: '8px 0 0' }}>
              ⚠ {selectedProfile.warning}
            </p>
          )}
        </div>

        {/* Pasta de saída */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ color: '#888', fontSize: 14, display: 'block', marginBottom: 8 }}>
            Pasta de saída:
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={outputFolder}
              onChange={(e) => setOutputFolder(e.target.value)}
              placeholder="Selecione ou digite o caminho..."
              disabled={isRunning}
              style={{
                flex: 1,
                padding: '10px 16px',
                backgroundColor: '#0f0f1a',
                border: '1px solid #4a4a6e',
                borderRadius: 6,
                color: 'white',
              }}
            />
            <button
              onClick={handleSelectFolder}
              disabled={isRunning}
              style={{
                padding: '10px 16px',
                backgroundColor: '#4a4a6e',
                border: 'none',
                borderRadius: 6,
                color: 'white',
                cursor: isRunning ? 'not-allowed' : 'pointer',
              }}
            >
              📁 Selecionar
            </button>
          </div>
        </div>

        {/* Paralelização */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ color: '#888', fontSize: 14, display: 'block', marginBottom: 8 }}>
            Modo de geração:
          </label>
          <select
            value={parallelCount}
            onChange={(e) => setParallelCount(Number(e.target.value))}
            disabled={isRunning}
            style={{
              width: '100%',
              padding: '10px 16px',
              backgroundColor: '#0f0f1a',
              border: '1px solid #4a4a6e',
              borderRadius: 6,
              color: 'white',
              cursor: isRunning ? 'not-allowed' : 'pointer',
            }}
          >
            <option value={1}>Sequencial (1 por vez) - Mais seguro</option>
            <option value={2}>Paralelo (2 por vez) - Mais rápido</option>
            <option value={3}>Paralelo (3 por vez) - Máximo</option>
          </select>
          <p style={{ color: '#666', fontSize: 12, margin: '8px 0 0' }}>
            Modo paralelo é mais rápido mas pode acionar rate limiting do Genspark.
          </p>
        </div>
      </div>

      {/* Status e Progresso */}
      {status !== 'idle' && (
        <div
          style={{
            backgroundColor: '#1a1a2e',
            borderRadius: 12,
            padding: 20,
            marginBottom: 24,
          }}
        >
          <h3 style={{ color: '#6366f1', margin: '0 0 16px' }}>Status</h3>

          <div style={{ marginBottom: 16 }}>
            <p style={{ color: 'white', margin: '0 0 8px' }}>
              {progress.message || getStatusMessage(status)}
            </p>

            {/* Indicador de rate limit */}
            {status === 'rate_limited' && progress.waitTime && (
              <div
                style={{
                  backgroundColor: '#332700',
                  border: '1px solid #f59e0b',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <p style={{ color: '#f59e0b', margin: 0 }}>
                  ⏳ Rate limit detectado. Aguardando {Math.ceil((progress.waitTime || 0) / 1000)}s...
                </p>
              </div>
            )}

            {/* Indicador de retry */}
            {status === 'retrying' && (
              <div
                style={{
                  backgroundColor: '#1a2733',
                  border: '1px solid #3b82f6',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <p style={{ color: '#3b82f6', margin: 0 }}>
                  🔄 Tentando novamente...
                </p>
              </div>
            )}

            {progress.total && progress.total > 0 && (
              <>
                <div
                  style={{
                    width: '100%',
                    height: 8,
                    backgroundColor: '#0f0f1a',
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${((progress.current || 0) / progress.total) * 100}%`,
                      height: '100%',
                      backgroundColor: status === 'rate_limited' ? '#f59e0b' : '#6366f1',
                      transition: 'width 0.3s',
                    }}
                  />
                </div>
                <p style={{ color: '#888', margin: '8px 0 0', fontSize: 13 }}>
                  {progress.current || 0} / {progress.total} imagens
                </p>
              </>
            )}
          </div>

          {status === 'login_required' && (
            <div
              style={{
                backgroundColor: '#1a3320',
                border: '1px solid #22c55e',
                borderRadius: 8,
                padding: 16,
              }}
            >
              <p style={{ color: '#22c55e', margin: 0 }}>
                👉 Faça login no Genspark na janela do navegador e aguarde...
              </p>
            </div>
          )}
        </div>
      )}

      {/* Erro */}
      {error && (
        <div
          style={{
            backgroundColor: '#331a1a',
            border: '1px solid #ef4444',
            borderRadius: 8,
            padding: 16,
            marginBottom: 24,
          }}
        >
          <p style={{ color: '#ef4444', margin: 0 }}>
            ❌ {error}
          </p>
        </div>
      )}

      {/* Preview de imagens geradas */}
      {generatedImages.length > 0 && (
        <div
          style={{
            backgroundColor: '#1a1a2e',
            borderRadius: 12,
            padding: 20,
            marginBottom: 24,
          }}
        >
          <h3 style={{ color: '#6366f1', margin: '0 0 16px' }}>
            Imagens Geradas ({generatedImages.length}/{prompts.length})
          </h3>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: 12,
            }}
          >
            {generatedImages.map((img, i) => (
              <div
                key={i}
                style={{
                  aspectRatio: '16/9',
                  borderRadius: 8,
                  overflow: 'hidden',
                  border: '2px solid #22c55e',
                }}
              >
                <img
                  src={img.dataUrl}
                  alt={`Imagem ${img.index}`}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Botões de ação */}
      <div style={{ display: 'flex', gap: 12 }}>
        {!isRunning ? (
          <button
            onClick={handleStart}
            disabled={!outputFolder || prompts.length === 0}
            style={{
              padding: '12px 24px',
              backgroundColor: outputFolder && prompts.length > 0 ? '#6366f1' : '#4a4a6e',
              border: 'none',
              borderRadius: 8,
              color: 'white',
              cursor: outputFolder && prompts.length > 0 ? 'pointer' : 'not-allowed',
              fontWeight: 600,
            }}
          >
            🚀 Iniciar Geração ({prompts.length} prompts)
          </button>
        ) : (
          <button
            onClick={handleCancel}
            style={{
              padding: '12px 24px',
              backgroundColor: '#ef4444',
              border: 'none',
              borderRadius: 8,
              color: 'white',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            ⏹ Cancelar
          </button>
        )}

        {generatedImages.length > 0 && status === 'completed' && (
          <button
            onClick={handleImport}
            style={{
              padding: '12px 24px',
              backgroundColor: '#22c55e',
              border: 'none',
              borderRadius: 8,
              color: 'white',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            ✓ Importar {generatedImages.length} Imagens
          </button>
        )}
      </div>
    </div>
  );
};

function getStatusMessage(status: PlaywrightProgress['status']): string {
  switch (status) {
    case 'launching': return 'Abrindo navegador...';
    case 'navigating': return 'Navegando para Genspark...';
    case 'login_required': return 'Aguardando login...';
    case 'configuring': return 'Configurando...';
    case 'generating': return 'Gerando imagens...';
    case 'generating_batch': return 'Gerando lote de imagens...';
    case 'rate_limited': return 'Aguardando cooldown de rate limit...';
    case 'retrying': return 'Tentando novamente...';
    case 'resuming': return 'Continuando geração anterior...';
    case 'completed': return 'Concluído!';
    case 'error': return 'Erro na geração';
    default: return '';
  }
}

// ============================================
// PAINEL EXTENSÃO
// ============================================

interface ExtensionPanelProps {
  prompts: string[];
  aspectRatio: AspectRatio;
  generatedImages: GeneratedImage[];
  setGeneratedImages: React.Dispatch<React.SetStateAction<GeneratedImage[]>>;
  onImagesGenerated: (images: GeneratedImage[]) => void;
}

const ExtensionPanel: React.FC<ExtensionPanelProps> = ({
  prompts,
  aspectRatio,
  generatedImages,
  setGeneratedImages,
  onImagesGenerated,
}) => {
  const [exported, setExported] = useState(false);
  const [watchFolder, setWatchFolder] = useState('');
  const [isWatching, setIsWatching] = useState(false);
  const [detectedImages, setDetectedImages] = useState<DetectedImage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const electronAPI = (window as any).electronAPI;

  // Configura listener de imagens detectadas
  useEffect(() => {
    if (!electronAPI) return;

    electronAPI.onGensparkImageDetected?.((data: DetectedImage) => {
      setDetectedImages(prev => {
        // Evita duplicatas
        if (prev.some(img => img.filePath === data.filePath)) {
          return prev;
        }
        return [...prev, data];
      });
    });

    electronAPI.onGensparkWatchError?.((data: { message: string }) => {
      setError(data.message);
    });

    return () => {
      // Para o watcher ao desmontar
      electronAPI.gensparkStopWatch?.();
      electronAPI.removeGensparkListeners?.();
    };
  }, []);

  // Exportar prompts para arquivo .txt
  const handleExport = async () => {
    if (!electronAPI?.gensparkExportPrompts) {
      setError('API do Electron não disponível');
      return;
    }

    if (prompts.length === 0) {
      setError('Nenhum prompt selecionado');
      return;
    }

    try {
      // Abre diálogo para salvar
      const saveResult = await electronAPI.saveFileDialog({
        title: 'Salvar Prompts para Genspark',
        defaultPath: 'prompts-genspark.txt',
        filters: [{ name: 'Text Files', extensions: ['txt'] }],
      });

      if (saveResult.canceled || !saveResult.filePath) {
        return;
      }

      // Salva o arquivo via IPC
      const result = await electronAPI.gensparkExportPrompts({
        prompts,
        filePath: saveResult.filePath,
      });

      if (result.success) {
        setExported(true);

        // Sugere pasta de monitoramento baseada no local do arquivo
        const folderPath = saveResult.filePath.replace(/[/\\][^/\\]+$/, '') + '/genspark-images';
        setWatchFolder(folderPath);

        setError(null);
      } else {
        setError(result.error || 'Erro ao exportar');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao exportar');
    }
  };

  // Selecionar pasta de monitoramento
  const handleSelectFolder = async () => {
    if (!electronAPI?.gensparkSelectFolder) return;

    const result = await electronAPI.gensparkSelectFolder();
    if (result.folderPath) {
      setWatchFolder(result.folderPath);
    }
  };

  // Iniciar monitoramento
  const handleStartWatch = async () => {
    if (!electronAPI?.gensparkWatchFolder || !watchFolder) return;

    try {
      // Garante que a pasta existe
      await electronAPI.gensparkEnsureFolder(watchFolder);

      // Carrega imagens existentes
      const existingResult = await electronAPI.gensparkGetFolderImages(watchFolder);
      if (existingResult.images) {
        setDetectedImages(existingResult.images);
      }

      // Inicia monitoramento
      const result = await electronAPI.gensparkWatchFolder(watchFolder);
      if (result.success) {
        setIsWatching(true);
        setError(null);
      } else {
        setError(result.error || 'Erro ao iniciar monitoramento');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao monitorar pasta');
    }
  };

  // Parar monitoramento
  const handleStopWatch = async () => {
    if (electronAPI?.gensparkStopWatch) {
      await electronAPI.gensparkStopWatch();
      setIsWatching(false);
    }
  };

  // Importar imagens detectadas
  const handleImport = () => {
    const images: GeneratedImage[] = detectedImages
      .sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true }))
      .map((img, i) => ({
        index: i + 1,
        filePath: img.filePath,
        dataUrl: img.dataUrl,
      }));

    onImagesGenerated(images);
  };

  return (
    <div>
      {/* Instruções */}
      <div
        style={{
          backgroundColor: '#1a1a2e',
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <h3 style={{ color: '#6366f1', margin: '0 0 16px' }}>Como usar</h3>
        <ol style={{ color: '#888', margin: 0, paddingLeft: 20, lineHeight: 2 }}>
          <li style={{ color: exported ? '#22c55e' : '#888' }}>
            Exporte os prompts para um arquivo .txt ({prompts.length} prompts)
          </li>
          <li>Abra o Chrome e vá para o Genspark (genspark.ai)</li>
          <li>Use a extensão Nanobanana para carregar os prompts</li>
          <li>Configure a pasta de download na extensão</li>
          <li>Inicie a geração na extensão</li>
          <li>Este app detectará as imagens automaticamente</li>
        </ol>
      </div>

      {/* Passo 1: Exportar */}
      <div
        style={{
          backgroundColor: '#1a1a2e',
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
          border: exported ? '2px solid #22c55e' : '2px solid transparent',
        }}
      >
        <h3 style={{ color: '#6366f1', margin: '0 0 16px' }}>
          1. Exportar Prompts {exported && <span style={{ color: '#22c55e' }}>✓</span>}
        </h3>

        <p style={{ color: '#888', margin: '0 0 16px', fontSize: 14 }}>
          Exporta {prompts.length} prompts no formato compatível com a extensão Nanobanana.
        </p>

        <button
          onClick={handleExport}
          disabled={prompts.length === 0}
          style={{
            padding: '12px 24px',
            backgroundColor: exported ? '#22c55e' : prompts.length > 0 ? '#6366f1' : '#4a4a6e',
            border: 'none',
            borderRadius: 8,
            color: 'white',
            cursor: prompts.length > 0 ? 'pointer' : 'not-allowed',
            fontWeight: 600,
          }}
        >
          {exported ? '✓ Exportado!' : `📥 Exportar ${prompts.length} Prompts`}
        </button>
      </div>

      {/* Passo 2: Monitorar */}
      <div
        style={{
          backgroundColor: '#1a1a2e',
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
          border: isWatching ? '2px solid #6366f1' : '2px solid transparent',
        }}
      >
        <h3 style={{ color: '#6366f1', margin: '0 0 16px' }}>
          2. Monitorar Pasta {isWatching && <span style={{ color: '#22c55e' }}>👁</span>}
        </h3>

        <p style={{ color: '#888', margin: '0 0 16px', fontSize: 14 }}>
          Configure a mesma pasta de download usada na extensão Nanobanana.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            type="text"
            value={watchFolder}
            onChange={(e) => setWatchFolder(e.target.value)}
            placeholder="Pasta de download das imagens..."
            disabled={isWatching}
            style={{
              flex: 1,
              padding: '10px 16px',
              backgroundColor: '#0f0f1a',
              border: '1px solid #4a4a6e',
              borderRadius: 6,
              color: 'white',
            }}
          />
          <button
            onClick={handleSelectFolder}
            disabled={isWatching}
            style={{
              padding: '10px 16px',
              backgroundColor: '#4a4a6e',
              border: 'none',
              borderRadius: 6,
              color: 'white',
              cursor: isWatching ? 'not-allowed' : 'pointer',
            }}
          >
            📁 Selecionar
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {!isWatching ? (
            <button
              onClick={handleStartWatch}
              disabled={!watchFolder}
              style={{
                padding: '12px 24px',
                backgroundColor: watchFolder ? '#6366f1' : '#4a4a6e',
                border: 'none',
                borderRadius: 8,
                color: 'white',
                cursor: watchFolder ? 'pointer' : 'not-allowed',
                fontWeight: 600,
              }}
            >
              👁 Iniciar Monitoramento
            </button>
          ) : (
            <button
              onClick={handleStopWatch}
              style={{
                padding: '12px 24px',
                backgroundColor: '#ef4444',
                border: 'none',
                borderRadius: 8,
                color: 'white',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              ⏹ Parar Monitoramento
            </button>
          )}
        </div>
      </div>

      {/* Erro */}
      {error && (
        <div
          style={{
            backgroundColor: '#331a1a',
            border: '1px solid #ef4444',
            borderRadius: 8,
            padding: 16,
            marginBottom: 24,
          }}
        >
          <p style={{ color: '#ef4444', margin: 0 }}>
            ❌ {error}
          </p>
        </div>
      )}

      {/* Passo 3: Imagens Detectadas */}
      <div
        style={{
          backgroundColor: '#1a1a2e',
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
          border: detectedImages.length > 0 ? '2px solid #22c55e' : '2px solid transparent',
        }}
      >
        <h3 style={{ color: '#6366f1', margin: '0 0 16px' }}>
          3. Imagens Detectadas ({detectedImages.length}/{prompts.length})
        </h3>

        {detectedImages.length === 0 ? (
          <p style={{ color: '#888', margin: 0, fontSize: 14 }}>
            {isWatching
              ? 'Aguardando imagens na pasta... Gere as imagens usando a extensão Nanobanana.'
              : 'Inicie o monitoramento e gere as imagens com a extensão.'}
          </p>
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                gap: 12,
                marginBottom: 16,
              }}
            >
              {detectedImages
                .sort((a, b) => a.fileName.localeCompare(b.fileName, undefined, { numeric: true }))
                .map((img, i) => (
                  <div
                    key={img.filePath}
                    style={{
                      position: 'relative',
                      aspectRatio: '16/9',
                      borderRadius: 8,
                      overflow: 'hidden',
                      border: '2px solid #22c55e',
                    }}
                  >
                    <img
                      src={img.dataUrl}
                      alt={img.fileName}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        padding: '4px 8px',
                        backgroundColor: 'rgba(0,0,0,0.7)',
                        color: 'white',
                        fontSize: 10,
                        textAlign: 'center',
                      }}
                    >
                      {img.fileName}
                    </div>
                  </div>
                ))}
            </div>

            <button
              onClick={handleImport}
              style={{
                padding: '12px 24px',
                backgroundColor: '#22c55e',
                border: 'none',
                borderRadius: 8,
                color: 'white',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              ✓ Importar {detectedImages.length} Imagens
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// ============================================
// PAINEL API
// ============================================

interface ApiPanelProps {
  prompts: string[];
  aspectRatio: AspectRatio;
  generatedImages: GeneratedImage[];
  setGeneratedImages: React.Dispatch<React.SetStateAction<GeneratedImage[]>>;
  onImagesGenerated: (images: GeneratedImage[]) => void;
}

const ApiPanel: React.FC<ApiPanelProps> = ({
  prompts,
  aspectRatio,
  generatedImages,
  setGeneratedImages,
  onImagesGenerated,
}) => {
  const [apiConfig, setApiConfig] = useState<ImageGenApiConfig | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<ImageGenProgress>({ current: 0, total: 0, status: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<{ index: number; error: string }[]>([]);
  const [localGeneratedImages, setLocalGeneratedImages] = useState<GeneratedImage[]>([]);

  // Carrega configuração ao montar e quando atualizada
  useEffect(() => {
    const loadConfig = () => {
      const config = loadApiConfig();
      if (config.imageGeneration) {
        setApiConfig(config.imageGeneration);
        setIsConfigured(isImageGenConfigValid(config.imageGeneration));
      }
    };

    // Carrega inicialmente
    loadConfig();

    // Listener para quando as configurações são atualizadas
    const handleSettingsUpdate = () => {
      loadConfig();
    };

    window.addEventListener('api-settings-updated', handleSettingsUpdate);

    return () => {
      window.removeEventListener('api-settings-updated', handleSettingsUpdate);
    };
  }, []);

  // Abre as configurações (via modal ou página)
  const handleOpenSettings = () => {
    // Dispara evento customizado para abrir settings
    window.dispatchEvent(new CustomEvent('open-settings', { detail: { tab: 'api' } }));
  };

  // Gerar imagens via API
  const handleGenerate = async () => {
    if (!apiConfig || !isConfigured) {
      setError('Configure a API de geração de imagens primeiro');
      return;
    }

    if (prompts.length === 0) {
      setError('Nenhum prompt selecionado');
      return;
    }

    // Validações adicionais com mensagens claras
    if (!apiConfig.apiKey) {
      setError(`API Key não configurada para ${apiConfig.provider}. Vá em Configurações > APIs.`);
      return;
    }

    if (!apiConfig.model) {
      setError(`Modelo não selecionado para ${apiConfig.provider}. Vá em Configurações > APIs.`);
      return;
    }

    setError(null);
    setImageErrors([]);
    setIsGenerating(true);
    setLocalGeneratedImages([]);
    setProgress({ current: 0, total: prompts.length, status: 'generating' });

    console.log('[ApiPanel] Iniciando geração de imagens');
    console.log('[ApiPanel] Config:', {
      provider: apiConfig.provider,
      model: apiConfig.model,
      apiKeyLength: apiConfig.apiKey?.length || 0,
      endpoint: apiConfig.endpoint || 'padrão',
    });
    console.log('[ApiPanel] Total de prompts:', prompts.length);

    try {
      const results = await generateImages(
        prompts,
        apiConfig,
        (prog) => setProgress(prog),
        { aspectRatio }
      );

      // Converte resultados para GeneratedImage e rastreia erros
      const images: GeneratedImage[] = [];
      const errors: { index: number; error: string }[] = [];

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.success) {
          let dataUrl = '';

          if (result.imageBase64) {
            dataUrl = `data:image/png;base64,${result.imageBase64}`;
          } else if (result.imageUrl) {
            // Converte URL para base64
            try {
              const base64 = await imageUrlToBase64(result.imageUrl);
              dataUrl = `data:image/png;base64,${base64}`;
            } catch (convErr) {
              console.warn(`[ApiPanel] Falha ao converter URL para base64, usando URL direta:`, convErr);
              dataUrl = result.imageUrl; // Usa URL diretamente se conversão falhar
            }
          }

          if (dataUrl) {
            images.push({
              index: i + 1,
              filePath: `api-generated-${i + 1}.png`,
              dataUrl,
              prompt: prompts[i],
            });
          }
        } else {
          // Rastreia erro desta imagem específica
          errors.push({
            index: i + 1,
            error: result.error || 'Erro desconhecido',
          });
          console.error(`[ApiPanel] Erro na imagem ${i + 1}:`, result.error);
        }
      }

      setLocalGeneratedImages(images);
      setGeneratedImages(images);
      setImageErrors(errors);

      const successCount = results.filter(r => r.success).length;
      console.log(`[ApiPanel] Geração concluída: ${successCount}/${prompts.length} sucesso`);

      if (successCount === 0) {
        // Todas falharam - mostra o primeiro erro como principal
        const firstError = errors[0]?.error || 'Todas as imagens falharam na geração';
        setError(firstError);
      } else if (successCount < prompts.length) {
        setError(`${errors.length} de ${prompts.length} imagens falharam na geração. Veja detalhes abaixo.`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Erro desconhecido';
      console.error('[ApiPanel] Erro fatal:', errorMsg);
      setError(errorMsg);
    } finally {
      setIsGenerating(false);
    }
  };

  // Importar imagens geradas
  const handleImport = () => {
    if (localGeneratedImages.length > 0) {
      onImagesGenerated(localGeneratedImages);
    }
  };

  const providerName = apiConfig?.provider
    ? IMAGE_GEN_PROVIDER_NAMES[apiConfig.provider] || apiConfig.provider
    : 'Não configurado';

  const modelName = apiConfig?.provider && apiConfig?.model
    ? IMAGE_GEN_MODELS[apiConfig.provider]?.find(m => m.id === apiConfig.model)?.name || apiConfig.model
    : '';

  return (
    <div>
      {/* Status da configuração */}
      <div
        style={{
          backgroundColor: '#1a1a2e',
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
          border: isConfigured ? '2px solid #22c55e' : '2px solid #f59e0b',
        }}
      >
        <h3 style={{ color: isConfigured ? '#22c55e' : '#f59e0b', margin: '0 0 16px' }}>
          {isConfigured ? '✓ API Configurada' : '⚠ API Não Configurada'}
        </h3>

        {isConfigured ? (
          <div style={{ color: '#888', fontSize: 14 }}>
            <p style={{ margin: '0 0 8px' }}>
              <strong>Provider:</strong> {providerName}
            </p>
            <p style={{ margin: '0 0 16px' }}>
              <strong>Modelo:</strong> {modelName}
            </p>
            <button
              onClick={handleOpenSettings}
              style={{
                padding: '8px 16px',
                backgroundColor: '#4a4a6e',
                border: 'none',
                borderRadius: 6,
                color: 'white',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              ⚙ Alterar Configuração
            </button>
          </div>
        ) : (
          <div>
            <p style={{ color: '#888', margin: '0 0 16px', fontSize: 14 }}>
              Configure uma API de geração de imagens para usar este método.
              Suportamos OpenAI, Google (Nano Banana), FLUX 2, Recraft V3, Ideogram 3, Stability AI, Leonardo.ai, Midjourney, FAL.AI e Replicate.
            </p>
            <button
              onClick={handleOpenSettings}
              style={{
                padding: '12px 24px',
                backgroundColor: '#6366f1',
                border: 'none',
                borderRadius: 8,
                color: 'white',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              ⚙ Configurar API
            </button>
          </div>
        )}
      </div>

      {/* Aviso sobre custos */}
      {isConfigured && (
        <div
          style={{
            backgroundColor: '#332700',
            border: '1px solid #665200',
            borderRadius: 8,
            padding: 16,
            marginBottom: 24,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 20 }}>💰</span>
          <div style={{ color: '#ffd000', fontSize: 14 }}>
            <strong>Atenção:</strong> A geração via API pode ter custos.
            Serão geradas {prompts.length} imagens usando {providerName}.
            Verifique os preços do seu provedor antes de continuar.
          </div>
        </div>
      )}

      {/* Progresso */}
      {isGenerating && (
        <div
          style={{
            backgroundColor: '#1a1a2e',
            borderRadius: 12,
            padding: 20,
            marginBottom: 24,
          }}
        >
          <h3 style={{ color: '#6366f1', margin: '0 0 16px' }}>Gerando Imagens...</h3>

          <p style={{ color: 'white', margin: '0 0 12px' }}>
            {progress.message || `Gerando imagem ${progress.current} de ${progress.total}...`}
          </p>

          <div
            style={{
              width: '100%',
              height: 8,
              backgroundColor: '#0f0f1a',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
                height: '100%',
                backgroundColor: progress.status === 'error' ? '#ef4444' : '#22c55e',
                transition: 'width 0.3s',
              }}
            />
          </div>

          <p style={{ color: '#888', margin: '12px 0 0', fontSize: 13 }}>
            {progress.current} / {progress.total} imagens
          </p>
        </div>
      )}

      {/* Erro principal */}
      {error && (
        <div
          style={{
            backgroundColor: '#331a1a',
            border: '1px solid #ef4444',
            borderRadius: 8,
            padding: 16,
            marginBottom: imageErrors.length > 0 ? 12 : 24,
          }}
        >
          <p style={{ color: '#ef4444', margin: 0, fontWeight: 600 }}>
            ❌ {error}
          </p>
          <p style={{ color: '#888', margin: '8px 0 0', fontSize: 12 }}>
            Abra o Console do navegador (F12 → Console) para ver logs detalhados.
          </p>
        </div>
      )}

      {/* Erros detalhados por imagem */}
      {imageErrors.length > 0 && (
        <div
          style={{
            backgroundColor: '#1a1a1a',
            border: '1px solid #444',
            borderRadius: 8,
            padding: 16,
            marginBottom: 24,
            maxHeight: 200,
            overflowY: 'auto',
          }}
        >
          <p style={{ color: '#888', margin: '0 0 12px', fontSize: 13, fontWeight: 600 }}>
            Detalhes dos erros:
          </p>
          {imageErrors.map(({ index, error: imgError }) => (
            <div
              key={index}
              style={{
                display: 'flex',
                gap: 8,
                padding: '6px 0',
                borderBottom: '1px solid #333',
                fontSize: 12,
              }}
            >
              <span style={{ color: '#ef4444', minWidth: 80 }}>Imagem {index}:</span>
              <span style={{ color: '#aaa', wordBreak: 'break-word' }}>{imgError}</span>
            </div>
          ))}
        </div>
      )}

      {/* Preview de imagens geradas */}
      {localGeneratedImages.length > 0 && (
        <div
          style={{
            backgroundColor: '#1a1a2e',
            borderRadius: 12,
            padding: 20,
            marginBottom: 24,
            border: '2px solid #22c55e',
          }}
        >
          <h3 style={{ color: '#22c55e', margin: '0 0 16px' }}>
            ✓ Imagens Geradas ({localGeneratedImages.length}/{prompts.length})
          </h3>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: 12,
              marginBottom: 16,
            }}
          >
            {localGeneratedImages.map((img, i) => (
              <div
                key={i}
                style={{
                  position: 'relative',
                  aspectRatio: aspectRatio === '16:9' ? '16/9' : aspectRatio === '9:16' ? '9/16' : '1/1',
                  borderRadius: 8,
                  overflow: 'hidden',
                  border: '2px solid #22c55e',
                }}
              >
                <img
                  src={img.dataUrl}
                  alt={`Imagem ${img.index}`}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: '4px 8px',
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    color: 'white',
                    fontSize: 11,
                    textAlign: 'center',
                  }}
                >
                  #{img.index}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleImport}
            style={{
              padding: '12px 24px',
              backgroundColor: '#22c55e',
              border: 'none',
              borderRadius: 8,
              color: 'white',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            ✓ Importar {localGeneratedImages.length} Imagens
          </button>
        </div>
      )}

      {/* Botão de geração */}
      {isConfigured && !isGenerating && localGeneratedImages.length === 0 && (
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={handleGenerate}
            disabled={prompts.length === 0}
            style={{
              padding: '14px 28px',
              backgroundColor: prompts.length > 0 ? '#22c55e' : '#4a4a6e',
              border: 'none',
              borderRadius: 8,
              color: 'white',
              cursor: prompts.length > 0 ? 'pointer' : 'not-allowed',
              fontWeight: 600,
              fontSize: 15,
            }}
          >
            🚀 Gerar {prompts.length} Imagens via API
          </button>
        </div>
      )}

      {/* Informações sobre providers */}
      <div
        style={{
          backgroundColor: '#1a1a2e',
          borderRadius: 12,
          padding: 20,
          marginTop: 24,
        }}
      >
        <h3 style={{ color: '#6366f1', margin: '0 0 16px' }}>Providers Suportados</h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 12,
          }}
        >
          {[
            { name: 'OpenAI', desc: 'GPT Image 1 / DALL-E 3', color: '#10a37f' },
            { name: 'Google', desc: 'Nano Banana / Imagen 3', color: '#ea4335' },
            { name: 'FLUX 2 (BFL)', desc: 'API oficial - Mais potente', color: '#f59e0b' },
            { name: 'FLUX (FAL.AI)', desc: '30-50% mais barato', color: '#3b82f6' },
            { name: 'Recraft V3', desc: '#1 HuggingFace benchmark', color: '#7c3aed' },
            { name: 'Ideogram 3.0', desc: 'Melhor para texto', color: '#6366f1' },
            { name: 'Stability AI', desc: 'SD 3.5 Large/Turbo', color: '#8b5cf6' },
            { name: 'Leonardo.ai', desc: 'Phoenix / Kino XL', color: '#ec4899' },
            { name: 'Midjourney v7', desc: 'Via APIs terceiros', color: '#22c55e' },
            { name: 'FAL.AI', desc: 'Agregador 600+ modelos', color: '#f97316' },
            { name: 'Replicate', desc: 'Agregador 200+ modelos', color: '#06b6d4' },
          ].map((provider) => (
            <div
              key={provider.name}
              style={{
                padding: '12px 16px',
                backgroundColor: '#0f0f1a',
                borderRadius: 8,
                borderLeft: `4px solid ${provider.color}`,
              }}
            >
              <div style={{ color: 'white', fontWeight: 600, fontSize: 14 }}>
                {provider.name}
              </div>
              <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
                {provider.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default GensparkStep;
