export const aboutContent = {
  eyebrow: 'Über RiffRechnung',
  title: 'Über mich',
  intro:
    'Hallo! Ich studiere Lehramt für Physik und Informatik und gebe nebenbei Privatunterricht. RiffRechnung ist aus meinem eigenen Wunsch entstanden, Rechnungen für Eltern unkompliziert, übersichtlich und lokal im Browser zu verwalten.',
  sectionsLabel: 'Hintergrund & Philosophie',
  sections: [
    {
      title: 'Aus der Praxis für die Praxis',
      body: 'Als ich mit dem Privatunterricht startete, fehlte mir eine optimale Lösung für die Abrechnung. Word und Excel waren mir zu umständlich, und bei LaTeX war die reine Berechnung und Verwaltung schlicht zu mühsam. Kurzerhand habe ich meine eigenen Ideen gesammelt und RiffRechnung – unter Einbindung moderner LLMs – entwickelt, um mir und anderen eine maßgeschneiderte Software zu bieten.',
    },
    {
      title: 'Modernes Design mit Material 3 Expressive',
      body: 'Gute Software muss nicht nur funktionieren, sondern auch visuell überzeugen. Als großer Fan der Expressive-Designsprache von Material 3 habe ich besonderen Wert auf ein modernes, ansprechendes und übersichtliches Interface gelegt, das im Alltag Freude macht.',
    },
    {
      title: 'Lokale Datenhaltung mit klaren Grenzen',
      body: 'Rechnungen und Einstellungen liegen im jeweiligen Browserprofil; die App selbst überträgt sie nicht an einen Server. Schütze deshalb Gerät und Browserprofil. JSON-Backups sind normale Klartextdateien und enthalten auch Notizen, Belegversionen und Historie. Ein ausgewählter synchronisierter Ordner kann sie über dessen Desktop-Synchronisation weitergeben.',
    },
  ],
  closing: {
    title: 'Einfach. Sicher. Modern.',
    body: 'Ich hoffe, dass RiffRechnung auch dir den Unterrichtsalltag erleichtert und dir eine perfekte Übersicht über deine Finanzen und Rechnungen verschafft.',
  },
} as const
