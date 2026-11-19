/** Télécharge un texte en fichier CSV, sans appel réseau. */
export function downloadText(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Le téléchargement démarre après le clic : l'URL est révoquée une fois la main rendue au navigateur.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
