import React, { useRef, useState } from 'react';
import type { Scene } from '../../types';

interface SceneListProps {
  scenes: Scene[];
  selectedSceneId: string | null;
  onSelect: (sceneId: string) => void;
  onDelete: (sceneId: string) => void;
  onSetImage: (sceneId: string, url: string, width: number, height: number) => void;
  onClearImage: (sceneId: string) => void;
  onAddSceneWithImage: (url: string, width: number, height: number) => void;
  onReorderScenes: (sceneIds: string[]) => void;
}

const styles: Record<string, React.CSSProperties> = {
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  item: {
    padding: 12,
    borderRadius: 6,
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    transition: 'all 0.2s',
  },
  itemSelected: {
    backgroundColor: '#e94560',
    color: '#fff',
  },
  itemNormal: {
    backgroundColor: '#0f3460',
    color: '#ccc',
  },
  itemInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  itemLabel: {
    fontWeight: 500,
    fontSize: 14,
  },
  itemMeta: {
    fontSize: 11,
    opacity: 0.7,
  },
  deleteButton: {
    background: 'none',
    border: 'none',
    color: 'inherit',
    cursor: 'pointer',
    padding: 4,
    opacity: 0.6,
    transition: 'opacity 0.2s',
  },
  emptyState: {
    textAlign: 'center' as const,
    color: '#666',
    padding: 20,
    fontSize: 14,
  },
  actionButtons: {
    display: 'flex',
    gap: 4,
    alignItems: 'center',
  },
  iconButton: {
    background: 'none',
    border: 'none',
    color: 'inherit',
    cursor: 'pointer',
    padding: 4,
    opacity: 0.6,
    transition: 'opacity 0.2s',
    fontSize: 12,
  },
  hasImage: {
    color: '#4ecdc4',
    opacity: 1,
  },
  addButton: {
    width: '100%',
    padding: 12,
    backgroundColor: '#0f3460',
    border: '2px dashed #4ecdc4',
    borderRadius: 6,
    color: '#4ecdc4',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    transition: 'all 0.2s',
    marginBottom: 8,
  },
  dragHandle: {
    cursor: 'grab',
    padding: '4px 6px',
    opacity: 0.5,
    fontSize: 12,
    userSelect: 'none' as const,
  },
  dragging: {
    opacity: 0.5,
    transform: 'scale(1.02)',
  },
  dragOver: {
    borderTop: '2px solid #4ecdc4',
  },
};

export const SceneList: React.FC<SceneListProps> = ({
  scenes,
  selectedSceneId,
  onSelect,
  onDelete,
  onSetImage,
  onClearImage,
  onAddSceneWithImage,
  onReorderScenes,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newSceneInputRef = useRef<HTMLInputElement>(null);
  const activeSceneIdRef = useRef<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleImageSelect = (sceneId: string) => {
    activeSceneIdRef.current = sceneId;
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const sceneId = activeSceneIdRef.current;

    if (file && sceneId) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        const img = new Image();
        img.onload = () => {
          onSetImage(sceneId, url, img.width, img.height);
        };
        img.src = url;
      };
      reader.readAsDataURL(file);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    activeSceneIdRef.current = null;
  };

  const handleNewSceneFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        const img = new Image();
        img.onload = () => {
          onAddSceneWithImage(url, img.width, img.height);
        };
        img.src = url;
      };
      reader.readAsDataURL(file);
    }

    // Reset input
    if (newSceneInputRef.current) {
      newSceneInputRef.current.value = '';
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, sceneId: string) => {
    setDraggedId(sceneId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, sceneId: string) => {
    e.preventDefault();
    if (draggedId && draggedId !== sceneId) {
      setDragOverId(sceneId);
    }
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = (e: React.DragEvent, targetSceneId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetSceneId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    // Reordenar as cenas
    const currentOrder = scenes.map((s) => s.id);
    const draggedIndex = currentOrder.indexOf(draggedId);
    const targetIndex = currentOrder.indexOf(targetSceneId);

    // Remove o item arrastado e insere na nova posição
    const newOrder = [...currentOrder];
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedId);

    onReorderScenes(newOrder);
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  // Botão de adicionar nova cena (sempre visível)
  const AddSceneButton = () => (
    <>
      <input
        ref={newSceneInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleNewSceneFileChange}
      />
      <button
        style={styles.addButton}
        onClick={() => newSceneInputRef.current?.click()}
        onMouseOver={(e) => {
          e.currentTarget.style.backgroundColor = '#1a3a5c';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.backgroundColor = '#0f3460';
        }}
      >
        + Nova Cena com Imagem
      </button>
    </>
  );

  if (scenes.length === 0) {
    return (
      <div>
        <AddSceneButton />
        <div style={styles.emptyState}>
          Ou desenhe retângulos na imagem principal
        </div>
      </div>
    );
  }

  return (
    <div style={styles.list}>
      <AddSceneButton />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      {scenes.map((scene) => {
        const isSelected = scene.id === selectedSceneId;
        const elementCount = scene.elements.length;
        const hasOwnImage = !!scene.imageUrl;
        const isDragging = draggedId === scene.id;
        const isDragOver = dragOverId === scene.id;

        return (
          <div
            key={scene.id}
            draggable
            onDragStart={(e) => handleDragStart(e, scene.id)}
            onDragOver={(e) => handleDragOver(e, scene.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, scene.id)}
            onDragEnd={handleDragEnd}
            style={{
              ...styles.item,
              ...(isSelected ? styles.itemSelected : styles.itemNormal),
              ...(isDragging ? styles.dragging : {}),
              ...(isDragOver ? styles.dragOver : {}),
            }}
            onClick={() => onSelect(scene.id)}
          >
            <div style={styles.itemInfo}>
              <span style={styles.itemLabel}>
                {scene.label}
                {hasOwnImage && <span style={{ marginLeft: 4, fontSize: 10 }}>🖼</span>}
              </span>
              <span style={styles.itemMeta}>
                {elementCount} elemento{elementCount !== 1 ? 's' : ''}
              </span>
            </div>
            <div style={styles.actionButtons}>
              {/* Botão de imagem */}
              <button
                style={{
                  ...styles.iconButton,
                  ...(hasOwnImage ? styles.hasImage : {}),
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (hasOwnImage) {
                    if (confirm('Remover imagem própria desta cena?')) {
                      onClearImage(scene.id);
                    }
                  } else {
                    handleImageSelect(scene.id);
                  }
                }}
                onMouseOver={(e) => (e.currentTarget.style.opacity = '1')}
                onMouseOut={(e) => (e.currentTarget.style.opacity = hasOwnImage ? '1' : '0.6')}
                title={hasOwnImage ? 'Remover imagem' : 'Adicionar imagem'}
              >
                {hasOwnImage ? '🖼' : '📷'}
              </button>
              {/* Botão de excluir */}
              <button
                style={styles.iconButton}
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Excluir "${scene.label}"?`)) {
                    onDelete(scene.id);
                  }
                }}
                onMouseOver={(e) => (e.currentTarget.style.opacity = '1')}
                onMouseOut={(e) => (e.currentTarget.style.opacity = '0.6')}
                title="Excluir cena"
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
