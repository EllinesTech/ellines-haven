import { useRef, useState } from 'react';
import { useEditMode } from '../context/EditModeContext';
import { ref as sRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

/**
 * EditableImage — admin can click to upload a new image when in edit mode.
 *
 * Props:
 *   field     — Firestore field key (e.g. "hero_poster")
 *   src       — current image URL (from page content)
 *   alt       — alt text
 *   className / style — passed through to the <img>
 *   storageFolder — Firebase Storage folder (default: "site-images")
 */
export default function EditableImage({
  field, src, alt = '', className, style, storageFolder = 'site-images', onUpload
}) {
  const ctx = useEditMode();
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);

  // Determine if edit is active — either via EditModeContext or via standalone onUpload prop
  const isEditActive = onUpload != null || (ctx?.editMode);

  // Current URL — prefer local preview, then edit context, then prop
  const currentSrc = preview
    || (ctx?.editMode && ctx?.pageData?.[field])
    || src;

  if (!isEditActive) {
    return <img src={currentSrc} alt={alt} className={className} style={style} />;
  }

  const handleClick = () => fileRef.current?.click();

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Show local preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setUploading(true);
    try {
      const path = `${storageFolder}/${field}_${Date.now()}_${file.name}`;
      const storageRef = sRef(storage, path);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      // Notify both: EditModeContext (for inline page editing) and direct onUpload (for Founder/About)
      if (onUpload) onUpload(url);
      else if (ctx) ctx.updateField(field, url);
      setPreview(url);
    } catch (err) {
      alert('Upload failed: ' + err.message);
      setPreview(null);
    }
    setUploading(false);
    e.target.value = '';
  };

  return (
    <span
      style={{ position: 'relative', display: 'inline-block', cursor: 'pointer' }}
      title={`Click to replace image (${field})`}
      onClick={handleClick}
    >
      <img
        src={currentSrc}
        alt={alt}
        className={className}
        style={{
          ...style,
          outline: '2px dashed rgba(201,168,76,0.6)',
          outlineOffset: 3,
          opacity: uploading ? 0.5 : 1,
          transition: 'opacity 0.2s',
        }}
      />
      {/* Overlay badge */}
      <span style={{
        position: 'absolute', top: 6, left: 6,
        background: uploading ? 'rgba(201,168,76,0.9)' : 'rgba(0,0,0,0.75)',
        color: uploading ? '#000' : 'var(--gold,#c9a84c)',
        fontSize: '0.62rem', fontWeight: 700,
        padding: '3px 8px', borderRadius: 4,
        pointerEvents: 'none', letterSpacing: 0.3,
        border: '1px solid rgba(201,168,76,0.4)',
        backdropFilter: 'blur(4px)',
      }}>
        {uploading ? '⏳ Uploading…' : '🖼 Click to change'}
      </span>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
    </span>
  );
}
