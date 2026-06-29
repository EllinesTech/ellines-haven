import { createContext, useContext, useState, useEffect } from 'react';

// Supported languages with native names
export const LANGUAGES = [
  { code: 'en', name: 'English',    native: 'English'    },
  { code: 'sw', name: 'Swahili',    native: 'Kiswahili'  },
  { code: 'fr', name: 'French',     native: 'Français'   },
  { code: 'es', name: 'Spanish',    native: 'Español'    },
  { code: 'de', name: 'German',     native: 'Deutsch'    },
  { code: 'ar', name: 'Arabic',     native: 'العربية'    },
  { code: 'zh', name: 'Chinese',    native: '中文'        },
  { code: 'hi', name: 'Hindi',      native: 'हिन्दी'     },
  { code: 'pt', name: 'Portuguese', native: 'Português'  },
  { code: 'yo', name: 'Yoruba',     native: 'Yorùbá'     },
  { code: 'ig', name: 'Igbo',       native: 'Igbo'       },
  { code: 'ha', name: 'Hausa',      native: 'Hausa'      },
];

const LangCtx = createContext(null);

// Loads Google Translate widget once
function loadGoogleTranslate(langCode) {
  // Remove any existing translate element
  const existingScript = document.getElementById('gt-script');
  if (existingScript) existingScript.remove();
  const existingInit  = document.getElementById('gt-init');
  if (existingInit)  existingInit.remove();

  // Set cookie Google Translate reads
  if (langCode !== 'en') {
    document.cookie = `googtrans=/en/${langCode}; path=/; domain=${window.location.hostname}`;
    document.cookie = `googtrans=/en/${langCode}; path=/`;
  } else {
    // Clear translate cookies to revert to English
    document.cookie = 'googtrans=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = `googtrans=; path=/; domain=${window.location.hostname}; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }

  // Create hidden element Google Translate needs
  if (!document.getElementById('google_translate_element')) {
    const el = document.createElement('div');
    el.id = 'google_translate_element';
    el.style.display = 'none';
    document.body.appendChild(el);
  }

  // Init function
  window.googleTranslateElementInit = function() {
    new window.google.translate.TranslateElement(
      { pageLanguage: 'en', includedLanguages: LANGUAGES.map(l => l.code).join(','), autoDisplay: false },
      'google_translate_element'
    );
  };

  // Load script
  const script = document.createElement('script');
  script.id  = 'gt-script';
  script.src = '//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
  script.async = true;
  document.head.appendChild(script);

  // After script loads, trigger the language
  if (langCode !== 'en') {
    script.onload = () => {
      setTimeout(() => {
        const sel = document.querySelector('.goog-te-combo');
        if (sel) { sel.value = langCode; sel.dispatchEvent(new Event('change')); }
      }, 800);
    };
  }
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => localStorage.getItem('eh_lang') || 'en');

  const setLang = (code) => {
    setLangState(code);
    localStorage.setItem('eh_lang', code);
    loadGoogleTranslate(code);
  };

  // Apply saved language on mount
  useEffect(() => {
    if (lang !== 'en') loadGoogleTranslate(lang);
  }, []); // eslint-disable-line

  const currentLang = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];

  return (
    <LangCtx.Provider value={{ lang, setLang, currentLang, languages: LANGUAGES }}>
      {children}
      {/* Hidden Google Translate anchor */}
      <div id="google_translate_element" style={{ display: 'none' }} />
      {/* Hide the Google Translate toolbar banner */}
      <style>{`
        .goog-te-banner-frame, .skiptranslate { display: none !important; }
        body { top: 0 !important; }
        .goog-te-gadget { display: none !important; }
      `}</style>
    </LangCtx.Provider>
  );
}

export const useLang = () => useContext(LangCtx);
