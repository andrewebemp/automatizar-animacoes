import React, { useRef } from 'react';

interface FileUploaderProps {
  label: string;
  accept: string;
  onUpload: (file: File) => void;
  hasFile: boolean;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  button: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    transition: 'all 0.2s',
  },
  buttonNormal: {
    backgroundColor: '#0f3460',
    color: '#ccc',
  },
  buttonLoaded: {
    backgroundColor: '#4ecdc4',
    color: '#1a1a2e',
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: '50%',
  },
  indicatorLoaded: {
    backgroundColor: '#4ecdc4',
  },
  indicatorEmpty: {
    backgroundColor: '#666',
  },
};

export const FileUploader: React.FC<FileUploaderProps> = ({
  label,
  accept,
  onUpload,
  hasFile,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
    }
    // Reset input para permitir reupload do mesmo arquivo
    e.target.value = '';
  };

  return (
    <div style={styles.container}>
      <div
        style={{
          ...styles.indicator,
          ...(hasFile ? styles.indicatorLoaded : styles.indicatorEmpty),
        }}
      />
      <button
        style={{
          ...styles.button,
          ...(hasFile ? styles.buttonLoaded : styles.buttonNormal),
        }}
        onClick={handleClick}
      >
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        style={{ display: 'none' }}
      />
    </div>
  );
};
