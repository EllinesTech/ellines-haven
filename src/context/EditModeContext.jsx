import { createContext, useContext, useState, useCallback } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

const Ctx = createContext(null);

export function EditModeProvider({ children }) {
  const [editMode,  setEditMode]  = useState(false);
  const [pageKey,   setPageKey]   = useState(null); // e.g. 'home_content'
  const [pageData,  setPageData]  = useState({});   // field key → value
  const [dirty,     setDirty]     = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [toast,     setToast]     = useState('');

  const showToast = useCallback((msg, ms = 2500) => {
    setToast(msg);
    setTimeout(() => setToast(''), ms);
  }, []);

  const enterEdit = useCallback((key, data) => {
    setPageKey(key);
    setPageData(data || {});
    setDirty(false);
    setEditMode(true);
  }, []);

  const exitEdit = useCallback(() => {
    setEditMode(false);
    setPageKey(null);
    setPageData({});
    setDirty(false);
  }, []);

  const updateField = useCallback((field, value) => {
    setPageData(prev => ({ ...prev, [field]: value }));
    setDirty(true);
  }, []);

  const saveAll = useCallback(async () => {
    if (!pageKey) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'site_data', pageKey), { ...pageData, updatedAt: serverTimestamp() }, { merge: true });
      setDirty(false);
      showToast('✅ Saved — live instantly!');
    } catch (e) {
      showToast('❌ Save failed: ' + e.message);
    }
    setSaving(false);
  }, [pageKey, pageData, showToast]);

  return (
    <Ctx.Provider value={{ editMode, pageKey, pageData, dirty, saving, toast, enterEdit, exitEdit, updateField, saveAll }}>
      {children}
    </Ctx.Provider>
  );
}

export const useEditMode = () => useContext(Ctx);
