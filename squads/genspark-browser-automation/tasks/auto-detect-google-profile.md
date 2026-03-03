---
task: Auto-Detect Google Chrome Profile
responsavel: "@ux-integrator"
responsavel_type: Agent
atomic_layer: Task
elicit: false

Entrada:
  - campo: target_email
    tipo: string
    origem: Config (andrewebemp@gmail.com)
    obrigatorio: true
    validacao: "Email valido da conta Google"

Saida:
  - campo: profile_index
    tipo: number
    destino: UI pre-selection
    persistido: false
  - campo: profile_path
    tipo: string
    destino: Browser launch
    persistido: false
  - campo: profile_dir
    tipo: string
    destino: Browser launch
    persistido: false

Checklist:
  - "[ ] Listar perfis Chrome do usuario"
  - "[ ] Ler Local State para obter emails"
  - "[ ] Encontrar perfil com email alvo"
  - "[ ] Pre-selecionar no dropdown do GensparkStep"
  - "[ ] Mostrar indicador visual de perfil auto-detectado"
---

# Auto-Detect Google Chrome Profile

## Purpose

Automaticamente detectar e pre-selecionar o perfil Chrome que contem a conta Google (andrewebemp@gmail.com) no componente GensparkStep.tsx, eliminando a necessidade do usuario selecionar manualmente.

## Execution Steps

### Step 1: Enhance Profile Detection

```typescript
// In GensparkStep.tsx PlaywrightPanel
useEffect(() => {
  const loadAndAutoSelect = async () => {
    if (!electronAPI?.getChromeProfiles) return;

    const result = await electronAPI.getChromeProfiles();
    if (!result.profiles) return;

    setProfiles(result.profiles);

    // Auto-detect: find profile with target email
    const TARGET_EMAIL = 'andrewebemp@gmail.com';
    const googleIndex = result.profiles.findIndex(
      (p: ChromeProfile) => p.email === TARGET_EMAIL
    );

    if (googleIndex >= 0) {
      setSelectedProfileIndex(googleIndex);
      setAutoDetected(true);
      console.log(`[GensparkStep] Auto-detected Google profile: ${result.profiles[googleIndex].name}`);
    }
  };

  loadAndAutoSelect();
}, []);
```

### Step 2: Visual Indicator

```typescript
// Show auto-detection badge next to profile selector
{autoDetected && (
  <span style={{
    backgroundColor: '#22c55e',
    color: 'white',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    marginLeft: 8
  }}>
    Auto-detectado
  </span>
)}
```

## Metadata

```yaml
version: 1.0.0
created: 2026-02-16
author: squad-creator
tags:
  - genspark-browser-automation
  - profile-detection
  - ux
```

---

*Task definition created by squad-creator*
