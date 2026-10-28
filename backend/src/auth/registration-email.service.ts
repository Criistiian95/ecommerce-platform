import { Injectable } from '@nestjs/common';
import { BILLING_MONTHLY_ARS } from '../billing/billing-rules';

export type RegistrationEmailPayload = {
  commerceName: string;
  slug: string;
  adminName: string;
  email: string;
  trialEndsAt: string;
};

export function registrationAlertAddress(value: string | undefined): string | null {
  const email = value?.trim().toLowerCase() ?? '';
  return email.length <= 190 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

@Injectable()
export class RegistrationEmailService {
  private escape(value: string) {
    return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }

  private origin() {
    const url = new URL(process.env.PLATFORM_PUBLIC_URL || 'https://disenolys.store');
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid platform URL');
    return url.origin;
  }

  buildWelcomeMessage(input: RegistrationEmailPayload, from: string) {
    const date = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'long', timeStyle: 'short' }).format(new Date(input.trialEndsAt));
    const price = '$' + BILLING_MONTHLY_ARS.toLocaleString('es-AR');
    const panel = `${this.origin()}/admin/personalizar`;
    const store = `${this.origin()}/tienda/${encodeURIComponent(input.slug)}`;
    const paragraphs = [
      `¡Hola, ${input.adminName}!`,
      `Tu tienda ${input.commerceName} ya está creada. Tenés 15 días gratis para darle tu identidad y probarla con tranquilidad. Tu prueba termina el ${date} (hora argentina).`,
      'Para empezar: elegí los colores y la portada, cargá tus primeros productos con sus fotos y precios, y compartí el enlace de tu tienda.',
      'Tener tu catálogo y tus pedidos en un mismo lugar te ayuda a mostrar tu negocio de forma más clara y a organizar las consultas de tus clientes.',
      `Después de la prueba, podés activar el plan de ${price} ARS por mes si decidís continuar. No se genera un cobro hasta que autorices la suscripción.`,
      'Gracias por elegir Diseños L&S. ¡Estamos para acompañarte en los primeros pasos!',
    ];
    const esc = (s: string) => this.escape(s);
    const html = `<div style="font-family:Arial,sans-serif;background:#f2f7f5;padding:28px 14px;color:#102438"><div style="max-width:600px;margin:auto;background:#fff;border-radius:18px;overflow:hidden"><div style="background:#061a2d;padding:26px 30px;color:#fff"><strong style="font-size:18px">DISEÑOS L&amp;S</strong><h1 style="font-size:27px;margin:18px 0 0">Tu tienda ya está lista</h1></div><div style="padding:28px 30px;line-height:1.55"><p>${esc(paragraphs[0])}</p><p>${esc(paragraphs[1])}</p><h2 style="font-size:18px;margin-top:24px">Tus primeros pasos</h2><p>${esc(paragraphs[2])}</p><p>${esc(paragraphs[3])}</p><p style="margin:28px 0"><a href="${esc(panel)}" style="display:inline-block;background:#00dfaa;color:#062139;font-weight:bold;padding:14px 22px;border-radius:9px;text-decoration:none">Personalizar mi tienda</a></p><p><a href="${esc(store)}">Ver mi tienda</a></p><p style="font-size:13px;color:#596b77">${esc(paragraphs[4])}</p><p>${esc(paragraphs[5])}</p></div></div></div>`;
    return { from, to: [input.email], subject: '¡Tu tienda está lista! Empezá tus 15 días gratis',
      text: [...paragraphs.slice(0, 4), `Personalizá tu tienda: ${panel}`, `Ver mi tienda: ${store}`, ...paragraphs.slice(4)].join('\n\n'),
      html, tags: [{ name: 'category', value: 'merchant_welcome' }] };
  }

  buildPlatformMessage(input: RegistrationEmailPayload, from: string, recipient: string) {
    const date = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'long', timeStyle: 'short' }).format(new Date(input.trialEndsAt));
    const lines = [
      'Se registró una nueva tienda en Diseños L&S.',
      `Tienda: ${input.commerceName}`,
      `Responsable: ${input.adminName}`,
      `Correo de contacto: ${input.email}`,
      `Identificador: ${input.slug}`,
      `Fin de la prueba: ${date} (hora argentina)`,
      `Tienda: ${this.origin()}/tienda/${encodeURIComponent(input.slug)}`,
    ];
    return { from, to: [recipient], subject: 'Nueva tienda registrada en Diseños L&S',
      text: lines.join('\n'), html: `<div style="font-family:Arial,sans-serif;color:#102438"><h1>Nueva tienda registrada</h1>${lines.map(line => `<p>${this.escape(line)}</p>`).join('')}</div>`,
      tags: [{ name: 'category', value: 'platform_registration' }] };
  }
}
