import React, { useState, useEffect } from 'react';
import type { ApiConfig, VisionApiConfig, WhisperApiConfig, PromptGenApiConfig, ImageGenApiConfig, VisionProvider, PromptGenProvider, ImageGenProvider, TranscriptionProvider } from '../../types/ApiConfig';
import {
  VISION_MODELS,
  VISION_PROVIDER_NAMES,
  PROMPT_GEN_MODELS,
  PROMPT_GEN_PROVIDER_NAMES,
  IMAGE_GEN_MODELS,
  IMAGE_GEN_PROVIDER_NAMES,
  TRANSCRIPTION_MODELS,
  TRANSCRIPTION_PROVIDER_NAMES,
  DEFAULT_API_CONFIG,
  loadApiConfig,
  saveApiConfig,
  isVisionConfigValid,
  isPromptGenConfigValid,
  isImageGenConfigValid,
  syncProviderKeysFromConfig,
  PROVIDER_KEY_SOURCES,
} from '../../types/ApiConfig';

interface ApiSettingsProps {
  onSave?: (config: ApiConfig) => void;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '16px',
  },
  section: {
    marginBottom: '32px',
    paddingBottom: '24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },
  sectionLast: {
    marginBottom: '16px',
    paddingBottom: '0',
    borderBottom: 'none',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 600,
    marginBottom: '16px',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  sectionIcon: {
    fontSize: '18px',
  },
  formGroup: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    marginBottom: '6px',
    color: '#94a3b8',
    fontSize: '13px',
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(0, 0, 0, 0.3)',
    color: '#fff',
    fontSize: '14px',
    cursor: 'pointer',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(0, 0, 0, 0.3)',
    color: '#fff',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
  },
  checkbox: {
    marginRight: '8px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    color: '#94a3b8',
    fontSize: '14px',
    cursor: 'pointer',
  },
  statusBadge: {
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 500,
  },
  statusValid: {
    background: 'rgba(34, 197, 94, 0.2)',
    color: '#22c55e',
  },
  statusInvalid: {
    background: 'rgba(239, 68, 68, 0.2)',
    color: '#ef4444',
  },
  button: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(135deg, #7c3aed, #00d4ff)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '16px',
  },
  hint: {
    fontSize: '12px',
    color: '#64748b',
    marginTop: '4px',
  },
  divider: {
    height: '1px',
    background: 'rgba(255, 255, 255, 0.1)',
    margin: '24px 0',
  },
};

// Usa VISION_PROVIDER_NAMES e PROMPT_GEN_PROVIDER_NAMES do ApiConfig.ts

const LANGUAGE_OPTIONS = [
  { value: 'pt', label: 'Português' },
  { value: 'en', label: 'Inglês' },
  { value: 'es', label: 'Espanhol' },
  { value: 'fr', label: 'Francês' },
  { value: 'de', label: 'Alemão' },
  { value: 'it', label: 'Italiano' },
  { value: 'ja', label: 'Japonês' },
  { value: 'ko', label: 'Coreano' },
  { value: 'zh', label: 'Chinês' },
  { value: '', label: 'Detectar automaticamente' },
];

export const ApiSettings: React.FC<ApiSettingsProps> = ({ onSave }) => {
  const [config, setConfig] = useState<ApiConfig>(DEFAULT_API_CONFIG);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const loaded = loadApiConfig();
    // Sincroniza chaves existentes das seções para o mapa centralizado
    const synced = syncProviderKeysFromConfig(loaded);
    setConfig(synced);
  }, []);

  // Helper: ao mudar apiKey em qualquer seção, sincroniza para providerKeys
  const syncKeyToProvider = (prev: ApiConfig, provider: string, apiKey: string): ApiConfig => {
    if (!apiKey) return prev;
    return {
      ...prev,
      providerKeys: {
        ...prev.providerKeys,
        [provider]: apiKey,
      },
    };
  };

  const handleVisionChange = (updates: Partial<VisionApiConfig>) => {
    setConfig((prev) => {
      // Se está mudando de provedor, preenche apiKey do mapa centralizado
      if (updates.provider && updates.provider !== prev.vision.provider) {
        const savedKey = prev.providerKeys?.[updates.provider] || '';
        updates.apiKey = savedKey;
      }
      let next = {
        ...prev,
        vision: { ...prev.vision, ...updates },
      };
      // Se está mudando apiKey, sincroniza para providerKeys
      if (updates.apiKey !== undefined) {
        next = syncKeyToProvider(next, next.vision.provider, updates.apiKey);
      }
      return next;
    });
    setSaved(false);
  };

  const handleWhisperChange = (updates: Partial<WhisperApiConfig>) => {
    setConfig((prev) => {
      const currentProvider = prev.whisper?.provider || 'openai';
      // Se está mudando de provedor, preenche apiKey do mapa centralizado e seleciona modelo padrão
      if (updates.provider && updates.provider !== currentProvider) {
        const savedKey = prev.providerKeys?.[updates.provider] || '';
        updates.apiKey = savedKey;
        updates.model = TRANSCRIPTION_MODELS[updates.provider]?.[0]?.id || '';
      }
      let next = {
        ...prev,
        whisper: { ...prev.whisper, ...updates },
      };
      // Sincroniza chave para o provedor correto
      if (updates.apiKey !== undefined) {
        const provider = updates.provider || next.whisper.provider || 'openai';
        next = syncKeyToProvider(next, provider, updates.apiKey);
      }
      return next;
    });
    setSaved(false);
  };

  const handlePromptGenChange = (updates: Partial<PromptGenApiConfig>) => {
    setConfig((prev) => {
      const currentPromptGen = prev.promptGen || DEFAULT_API_CONFIG.promptGen!;
      // Se está mudando de provedor, preenche apiKey do mapa centralizado
      if (updates.provider && updates.provider !== currentPromptGen.provider) {
        const savedKey = prev.providerKeys?.[updates.provider] || '';
        updates.apiKey = savedKey;
      }
      const updatedPromptGen = { ...currentPromptGen, ...updates };
      let next: ApiConfig = {
        ...prev,
        promptGen: updatedPromptGen,
      };
      // Se está mudando apiKey, sincroniza para providerKeys
      if (updates.apiKey !== undefined) {
        next = syncKeyToProvider(next, updatedPromptGen.provider, updates.apiKey);
      }
      return next;
    });
    setSaved(false);
  };

  const handleImageGenChange = (updates: Partial<ImageGenApiConfig>) => {
    setConfig((prev) => {
      const currentImageGen = {
        provider: prev.imageGeneration?.provider || 'openai' as ImageGenProvider,
        apiKey: prev.imageGeneration?.apiKey || '',
        model: prev.imageGeneration?.model || '',
        enabled: prev.imageGeneration?.enabled || false,
        ...prev.imageGeneration,
      };
      // Se está mudando de provedor, preenche apiKey do mapa centralizado
      if (updates.provider && updates.provider !== currentImageGen.provider) {
        const savedKey = prev.providerKeys?.[updates.provider] || '';
        updates.apiKey = savedKey;
      }
      const updatedImageGen = { ...currentImageGen, ...updates };
      let next: ApiConfig = {
        ...prev,
        imageGeneration: updatedImageGen,
      };
      // Se está mudando apiKey, sincroniza para providerKeys
      if (updates.apiKey !== undefined) {
        next = syncKeyToProvider(next, updatedImageGen.provider, updates.apiKey);
      }
      return next;
    });
    setSaved(false);
  };

  // Handler para chaves centralizadas
  const handleProviderKeyChange = (provider: string, apiKey: string) => {
    setConfig((prev) => {
      let next = {
        ...prev,
        providerKeys: { ...prev.providerKeys, [provider]: apiKey },
      };
      // Propaga para seções que usam este provedor
      if (next.vision.provider === provider) {
        next = { ...next, vision: { ...next.vision, apiKey } };
      }
      const whisperProvider = next.whisper?.provider || 'openai';
      if (next.whisper && provider === whisperProvider) {
        next = { ...next, whisper: { ...next.whisper, apiKey } };
      }
      if (next.promptGen?.provider === provider) {
        next = { ...next, promptGen: { ...next.promptGen, apiKey } };
      }
      if (next.imageGeneration?.provider === provider) {
        next = { ...next, imageGeneration: { ...next.imageGeneration, apiKey } };
      }
      return next;
    });
    setSaved(false);
  };

  const handleSave = () => {
    saveApiConfig(config);
    setSaved(true);
    onSave?.(config);
    // Dispara evento para notificar outros componentes que as configurações mudaram
    window.dispatchEvent(new CustomEvent('api-settings-updated', { detail: config }));
    setTimeout(() => setSaved(false), 2000);
  };

  const isVisionValid = isVisionConfigValid(config.vision);
  const isWhisperValid = config.whisper?.enabled && config.whisper?.apiKey?.length > 0;
  const isPromptGenValid = isPromptGenConfigValid(config.promptGen);
  const isImageGenValid = isImageGenConfigValid(config.imageGeneration);
  const selectedModels = VISION_MODELS[config.vision.provider] || [];
  const selectedPromptGenModels = PROMPT_GEN_MODELS[config.promptGen?.provider || 'openrouter'] || [];
  const selectedImageGenModels = IMAGE_GEN_MODELS[config.imageGeneration?.provider || 'openai'] || [];
  const selectedTranscriptionModels = TRANSCRIPTION_MODELS[config.whisper?.provider || 'openai'] || [];

  // Provedores que têm chave salva ou estão em uso
  const activeProviders = new Set<string>();
  // Adiciona provedores atualmente selecionados
  activeProviders.add(config.vision.provider);
  activeProviders.add(config.whisper?.provider || 'openai'); // Provedor de transcrição
  if (config.promptGen?.provider) activeProviders.add(config.promptGen.provider);
  if (config.imageGeneration?.provider) activeProviders.add(config.imageGeneration.provider);
  // Adiciona provedores que já têm chave salva
  if (config.providerKeys) {
    for (const [provider, key] of Object.entries(config.providerKeys)) {
      if (key) activeProviders.add(provider);
    }
  }
  // Ordena e filtra apenas os que existem em PROVIDER_KEY_SOURCES
  const providerKeysToShow = Array.from(activeProviders)
    .filter(p => PROVIDER_KEY_SOURCES[p])
    .sort((a, b) => (PROVIDER_KEY_SOURCES[a]?.name || a).localeCompare(PROVIDER_KEY_SOURCES[b]?.name || b));

  return (
    <div style={styles.container}>
      {/* Chaves de API Centralizadas */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>
          <span style={styles.sectionIcon}>🔑</span>
          <span>Chaves de API</span>
        </div>
        <div style={styles.hint as any}>
          Configure suas chaves aqui. Ao selecionar um provedor em qualquer seção abaixo, a chave será preenchida automaticamente.
        </div>
        <div style={{ marginTop: 12 }}>
          {providerKeysToShow.map((provider) => {
            const info = PROVIDER_KEY_SOURCES[provider];
            const key = config.providerKeys?.[provider] || '';
            return (
              <div key={provider} style={{ marginBottom: 12 }}>
                <label style={styles.label}>{info.name}</label>
                <input
                  type="password"
                  value={key}
                  onChange={(e) => handleProviderKeyChange(provider, e.target.value)}
                  placeholder={`Chave de ${info.name}...`}
                  style={styles.input}
                />
                <div style={styles.hint}>
                  Obtenha em {info.hint}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Transcription API Section (Whisper / Groq) */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>
          <span style={styles.sectionIcon}>🎤</span>
          <span>Transcrição de Áudio (Speech-to-Text)</span>
          <span
            style={{
              ...styles.statusBadge,
              ...(isWhisperValid ? styles.statusValid : styles.statusInvalid),
            }}
          >
            {isWhisperValid ? 'Configurada' : 'Não configurada'}
          </span>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={config.whisper?.enabled || false}
              onChange={(e) => handleWhisperChange({ enabled: e.target.checked })}
              style={styles.checkbox}
            />
            Habilitar transcrição automática de áudio
          </label>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Provedor</label>
          <select
            value={config.whisper?.provider || 'openai'}
            onChange={(e) =>
              handleWhisperChange({
                provider: e.target.value as TranscriptionProvider,
              })
            }
            style={styles.select}
          >
            {Object.entries(TRANSCRIPTION_PROVIDER_NAMES).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
          <div style={styles.hint}>
            {config.whisper?.provider === 'groq'
              ? 'Groq oferece transcrição ultra rápida (216x tempo real) com modelos Whisper otimizados'
              : 'OpenAI Whisper - modelo original de transcrição'}
          </div>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>
            API Key ({config.whisper?.provider === 'groq' ? 'Groq' : 'OpenAI'})
          </label>
          <input
            type="password"
            value={config.whisper?.apiKey || ''}
            onChange={(e) => handleWhisperChange({ apiKey: e.target.value })}
            placeholder={config.whisper?.provider === 'groq' ? 'gsk_...' : 'sk-...'}
            style={styles.input}
          />
          <div style={styles.hint}>
            {config.whisper?.provider === 'groq'
              ? 'Obtenha em console.groq.com/keys'
              : 'Obtenha em platform.openai.com'}
          </div>
        </div>

        {selectedTranscriptionModels.length > 1 && (
          <div style={styles.formGroup}>
            <label style={styles.label}>Modelo</label>
            <select
              value={config.whisper?.model || selectedTranscriptionModels[0]?.id || ''}
              onChange={(e) => handleWhisperChange({ model: e.target.value })}
              style={styles.select}
            >
              {selectedTranscriptionModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
            {config.whisper?.provider === 'groq' && (
              <div style={styles.hint}>
                Turbo: mais rápido ($0.04/h) | V3: mais preciso ($0.111/h)
              </div>
            )}
          </div>
        )}

        <div style={styles.formGroup}>
          <label style={styles.label}>Idioma do Áudio</label>
          <select
            value={config.whisper?.language || 'pt'}
            onChange={(e) => handleWhisperChange({ language: e.target.value })}
            style={styles.select}
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div style={styles.hint}>
            Especificar o idioma melhora a precisão da transcrição
          </div>
        </div>
      </div>

      {/* Prompt Generation API Section */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>
          <span style={styles.sectionIcon}>🎨</span>
          <span>Prompt Gen API (Geração de Prompts)</span>
          <span
            style={{
              ...styles.statusBadge,
              ...(isPromptGenValid ? styles.statusValid : styles.statusInvalid),
            }}
          >
            {isPromptGenValid ? 'Configurada' : 'Não configurada'}
          </span>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={config.promptGen?.enabled || false}
              onChange={(e) => handlePromptGenChange({ enabled: e.target.checked })}
              style={styles.checkbox}
            />
            Habilitar geração de prompts via IA
          </label>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Provedor</label>
          <select
            value={config.promptGen?.provider || 'openrouter'}
            onChange={(e) =>
              handlePromptGenChange({
                provider: e.target.value as PromptGenProvider,
                model: PROMPT_GEN_MODELS[e.target.value as PromptGenProvider]?.[0]?.id || '',
              })
            }
            style={styles.select}
          >
            {Object.entries(PROMPT_GEN_PROVIDER_NAMES).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>API Key</label>
          <input
            type="password"
            value={config.promptGen?.apiKey || ''}
            onChange={(e) => handlePromptGenChange({ apiKey: e.target.value })}
            placeholder="Insira sua API key..."
            style={styles.input}
          />
          <div style={styles.hint}>
            {config.promptGen?.provider === 'openai' && 'Obtenha em platform.openai.com'}
            {config.promptGen?.provider === 'anthropic' && 'Obtenha em console.anthropic.com'}
            {config.promptGen?.provider === 'google' && 'Obtenha em aistudio.google.com'}
            {config.promptGen?.provider === 'openrouter' && 'Obtenha em openrouter.ai/keys'}
          </div>
        </div>

        {selectedPromptGenModels.length > 0 && (
          <div style={styles.formGroup}>
            <label style={styles.label}>Modelo</label>
            <select
              value={config.promptGen?.model || ''}
              onChange={(e) => handlePromptGenChange({ model: e.target.value })}
              style={styles.select}
            >
              {selectedPromptGenModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Image Generation API Section */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>
          <span style={styles.sectionIcon}>🖼️</span>
          <span>Image Gen API (Geração de Imagens)</span>
          <span
            style={{
              ...styles.statusBadge,
              ...(isImageGenValid ? styles.statusValid : styles.statusInvalid),
            }}
          >
            {isImageGenValid ? 'Configurada' : 'Não configurada'}
          </span>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={config.imageGeneration?.enabled || false}
              onChange={(e) => handleImageGenChange({ enabled: e.target.checked })}
              style={styles.checkbox}
            />
            Habilitar geração de imagens via API
          </label>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Provedor</label>
          <select
            value={config.imageGeneration?.provider || 'openai'}
            onChange={(e) =>
              handleImageGenChange({
                provider: e.target.value as ImageGenProvider,
                model: IMAGE_GEN_MODELS[e.target.value as ImageGenProvider]?.[0]?.id || '',
              })
            }
            style={styles.select}
          >
            {Object.entries(IMAGE_GEN_PROVIDER_NAMES).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>API Key</label>
          <input
            type="password"
            value={config.imageGeneration?.apiKey || ''}
            onChange={(e) => handleImageGenChange({ apiKey: e.target.value })}
            placeholder="Insira sua API key..."
            style={styles.input}
          />
          <div style={styles.hint}>
            {config.imageGeneration?.provider === 'openai' && 'Obtenha em platform.openai.com'}
            {config.imageGeneration?.provider === 'google' && 'Obtenha em aistudio.google.com'}
            {config.imageGeneration?.provider === 'flux-bfl' && 'Obtenha em bfl.ai (API oficial FLUX)'}
            {config.imageGeneration?.provider === 'flux-replicate' && 'Obtenha em replicate.com'}
            {config.imageGeneration?.provider === 'flux-fal' && 'Obtenha em fal.ai (30-50% mais barato)'}
            {config.imageGeneration?.provider === 'recraft' && 'Obtenha em recraft.ai (#1 HuggingFace)'}
            {config.imageGeneration?.provider === 'ideogram' && 'Obtenha em ideogram.ai'}
            {config.imageGeneration?.provider === 'stability' && 'Obtenha em platform.stability.ai'}
            {config.imageGeneration?.provider === 'leonardo' && 'Obtenha em leonardo.ai'}
            {config.imageGeneration?.provider === 'midjourney' && 'Requer API terceiros (midapi.ai, useapi.net)'}
            {config.imageGeneration?.provider === 'fal' && 'Obtenha em fal.ai (agregador)'}
            {config.imageGeneration?.provider === 'replicate' && 'Obtenha em replicate.com (agregador)'}
            {config.imageGeneration?.provider === 'custom' && 'Use a API key do seu endpoint'}
          </div>
        </div>

        {selectedImageGenModels.length > 0 && (
          <div style={styles.formGroup}>
            <label style={styles.label}>Modelo</label>
            <select
              value={config.imageGeneration?.model || ''}
              onChange={(e) => handleImageGenChange({ model: e.target.value })}
              style={styles.select}
            >
              {selectedImageGenModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {config.imageGeneration?.provider === 'custom' && (
          <div style={styles.formGroup}>
            <label style={styles.label}>Endpoint</label>
            <input
              type="text"
              value={config.imageGeneration?.endpoint || ''}
              onChange={(e) => handleImageGenChange({ endpoint: e.target.value })}
              placeholder="https://api.example.com/v1/images/generations"
              style={styles.input}
            />
            <div style={styles.hint}>
              Endpoint compatível com formato OpenAI Images API
            </div>
          </div>
        )}
      </div>

      {/* Vision API Section */}
      <div style={{ ...styles.section, ...styles.sectionLast }}>
        <div style={styles.sectionTitle}>
          <span style={styles.sectionIcon}>👁️</span>
          <span>Vision API (Detecção de Elementos)</span>
          <span
            style={{
              ...styles.statusBadge,
              ...(isVisionValid ? styles.statusValid : styles.statusInvalid),
            }}
          >
            {isVisionValid ? 'Configurada' : 'Não configurada'}
          </span>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={config.vision.enabled}
              onChange={(e) => handleVisionChange({ enabled: e.target.checked })}
              style={styles.checkbox}
            />
            Habilitar detecção automática de elementos
          </label>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Provedor</label>
          <select
            value={config.vision.provider}
            onChange={(e) =>
              handleVisionChange({
                provider: e.target.value as VisionProvider,
                model: VISION_MODELS[e.target.value as VisionProvider]?.[0]?.id || '',
              })
            }
            style={styles.select}
          >
            {Object.entries(VISION_PROVIDER_NAMES).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>API Key</label>
          <input
            type="password"
            value={config.vision.apiKey}
            onChange={(e) => handleVisionChange({ apiKey: e.target.value })}
            placeholder={['omniparser', 'sam'].includes(config.vision.provider) ? 'Opcional para uso local...' : 'Insira sua API key...'}
            style={styles.input}
          />
          <div style={styles.hint}>
            {config.vision.provider === 'openai' && 'Obtenha em platform.openai.com'}
            {config.vision.provider === 'anthropic' && 'Obtenha em console.anthropic.com'}
            {config.vision.provider === 'google' && 'Obtenha em aistudio.google.com'}
            {config.vision.provider === 'google-cloud-vision' && 'Obtenha em console.cloud.google.com'}
            {config.vision.provider === 'openrouter' && 'Obtenha em openrouter.ai/keys'}
            {config.vision.provider === 'zhipu' && 'Obtenha em open.bigmodel.cn'}
            {config.vision.provider === 'groq' && 'Obtenha em console.groq.com'}
            {config.vision.provider === 'together' && 'Obtenha em api.together.xyz'}
            {config.vision.provider === 'fireworks' && 'Obtenha em fireworks.ai'}
            {config.vision.provider === 'omniparser' && 'Opcional - rode localmente ou use API'}
            {config.vision.provider === 'sam' && 'Opcional - rode localmente ou use API'}
            {config.vision.provider === 'replicate' && 'Obtenha em replicate.com'}
            {config.vision.provider === 'custom' && 'Use a API key do seu endpoint'}
          </div>
        </div>

        {selectedModels.length > 0 && (
          <div style={styles.formGroup}>
            <label style={styles.label}>Modelo</label>
            <select
              value={config.vision.model || ''}
              onChange={(e) => handleVisionChange({ model: e.target.value })}
              style={styles.select}
            >
              {selectedModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {['custom', 'omniparser', 'sam'].includes(config.vision.provider) && (
          <div style={styles.formGroup}>
            <label style={styles.label}>Endpoint</label>
            <input
              type="text"
              value={config.vision.endpoint || ''}
              onChange={(e) => handleVisionChange({ endpoint: e.target.value })}
              placeholder={
                config.vision.provider === 'omniparser'
                  ? 'http://localhost:8000/parse'
                  : config.vision.provider === 'sam'
                  ? 'http://localhost:8001/segment'
                  : 'https://api.example.com/v1/chat/completions'
              }
              style={styles.input}
            />
            <div style={styles.hint}>
              {config.vision.provider === 'custom' && 'Endpoint compatível com formato OpenAI'}
              {config.vision.provider === 'omniparser' && 'Endpoint local do OmniParser V2 ou API remota'}
              {config.vision.provider === 'sam' && 'Endpoint local do SAM ou API remota'}
            </div>
          </div>
        )}
      </div>

      <button onClick={handleSave} style={styles.button}>
        {saved ? '✓ Salvo!' : 'Salvar Configurações'}
      </button>
    </div>
  );
};

export default ApiSettings;
