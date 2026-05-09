'use client';

import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { Download } from 'lucide-react';
import { useState } from 'react';

export function InstallButton() {
  const { canInstall, isInstalled, handleInstall } = useInstallPrompt();
  const [showToast, setShowToast] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  const handleClick = async () => {
    if (canInstall) {
      await handleInstall();
      if (isInstalled) {
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
      }
    } else {
      // fallback: show quick instructions to install manually
      setShowInstructions(prev => !prev);
    }
  };

  if (isInstalled) {
    return (
      <div className="text-xs text-green-400 flex items-center gap-1">
        ✓ App instalado
      </div>
    );
  }

  return (
    <>
      <button
        onClick={handleClick}
        className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
        title="Instalar TLMoto Management como app"
      >
        <Download size={18} />
        <span className="hidden sm:inline">Instalar App</span>
      </button>

      {showInstructions && (
        <div className="absolute right-4 top-14 w-64 bg-white text-black p-3 rounded-lg shadow-lg z-50">
          <div className="text-sm font-semibold mb-2">Como instalar</div>
          <ul className="text-xs list-disc ml-4 space-y-1">
            <li>
              Chrome/Edge (Desktop/Android): Abra o menu (⋮) → <b>Instalar app</b>
            </li>
            <li>
              Safari (iOS): Partilhar → <b>Adicionar à Dock</b>
            </li>
          </ul>
          <div className="mt-3 text-right">
            <button onClick={() => setShowInstructions(false)} className="text-sm text-blue-600">Fechar</button>
          </div>
        </div>
      )}

      {showToast && (
        <div className="fixed bottom-4 right-4 bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg animate-pulse">
          ✓ App instalado com sucesso!
        </div>
      )}
    </>
  );
}
