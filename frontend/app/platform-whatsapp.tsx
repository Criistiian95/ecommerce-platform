import styles from './platform-whatsapp.module.css';

const DEFAULT_MESSAGE = 'Hola, quiero información sobre Diseñolys para mi comercio.';

/** Platform contact only: never use this number as a merchant's store contact. */
export function platformWhatsAppUrl() {
  const raw = process.env.NEXT_PUBLIC_PLATFORM_WHATSAPP_NUMBER?.trim() ?? '';
  // Require an explicit international prefix. An incomplete local number stays hidden.
  if (!/^\+[1-9][\d\s()-]*$/.test(raw)) return null;
  const number = raw.replace(/\D/g, '');
  if (!/^[1-9]\d{7,14}$/.test(number)) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(DEFAULT_MESSAGE)}`;
}

export default function PlatformWhatsApp({ floating = false }: { floating?: boolean }) {
  const href = platformWhatsAppUrl();
  if (!href) return null;

  return (
    <a
      href={href}
      className={floating ? styles.whatsappFloat : styles.whatsappButton}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Consultar por WhatsApp a Diseñolys (abre otra pestaña)"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 11.5a9 9 0 0 1-13.4 7.9L3 21l1.6-4.6A9 9 0 1 1 21 11.5Z" />
        <path d="M8.5 7.5c-.6 0-1 .8-1 1.6 0 2.4 3.5 5.9 5.9 5.9.8 0 1.6-.4 1.6-1l-2-1.2-.8.8a7.5 7.5 0 0 1-2.8-2.8l.8-.8-1.2-2Z" />
      </svg>
      <span>{floating ? 'WhatsApp' : 'Hablemos por WhatsApp'}</span>
    </a>
  );
}
