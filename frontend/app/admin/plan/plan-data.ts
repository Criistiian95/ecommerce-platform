export type PlanPayment = { id: string; paymentReference: string; approvedAt: string; status: 'approved' };
export type MerchantPlan = {
  commerce: { id: string; name: string; slug: string; active: boolean };
  billingEnabled: boolean;
  trial?: null | { startedAt: string | null; endsAt: string; expired: boolean; daysLeft: number };
  paymentAction: { kind: 'start' | 'resume' | 'none'; amountArs: number };
  subscription: null | {
    status: string; amountArs: number; currency: string; interval: string;
    paidThrough: string | null; startedAt: string | null; checkoutUrl: string | null;
  };
  currentOffer: { amountArs: number; currency: string; interval: string };
  lastPayment: PlanPayment | null;
  payments: PlanPayment[];
  pagination: { page: number; pageSize: number; total: number; hasMore: boolean };
  checkedAt: string;
};

export function planDate(value: string | null, includeTime = false) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Sin fecha registrada';
  return new Date(value).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } as const : {}),
  });
}

export function planPresentation(data: MerchantPlan, now = Date.now()) {
  const sub = data.subscription;
  if (data.trial && !sub?.paidThrough) {
    const daysLeft = Math.max(0, Math.ceil((Date.parse(data.trial.endsAt) - now) / 86400000));
    return { label: daysLeft > 0 ? `Prueba gratis · ${daysLeft} día${daysLeft === 1 ? '' : 's'}` : 'Prueba finalizada',
      tone: daysLeft > 3 ? 'success' : 'warning', daysLeft,
      message: daysLeft > 0 ? 'Estás probando tu tienda sin tarjeta. Al terminar, elegí si querés activar el abono mensual. No se cobra automáticamente por iniciar la prueba.' : 'Terminó tu prueba. Tus datos se conservan y podés consultarlos. Activá el abono para volver a operar y recibir pedidos.' };
  }
  if (!sub) return {
    label: 'Sin suscripción asociada', tone: 'neutral', daysLeft: null,
    message: 'Podés iniciar tu abono desde la tarjeta Pagar cuota. El importe corresponde a la primera cuota; no se te agrega deuda por períodos anteriores.',
  };
  const paidUntil = sub.paidThrough ? Date.parse(sub.paidThrough) : NaN;
  const daysLeft = Number.isFinite(paidUntil) ? Math.max(0, Math.ceil((paidUntil - now) / 86400000)) : null;
  if (sub.status === 'cancelled' || sub.status === 'canceled') return {
    label: 'Suscripción cancelada', tone: 'warning', daysLeft,
    message: 'La suscripción figura cancelada. Consultanos para revisar la continuidad de tu tienda.',
  };
  if (sub.status === 'past_due' || (Number.isFinite(paidUntil) && paidUntil <= now)) return {
    label: 'Período vencido', tone: 'warning', daysLeft: 0,
    message: 'El período abonado terminó y todavía no hay una renovación acreditada en el sistema. Si ya pagaste, actualizá la información o contactanos.',
  };
  if (sub.status === 'active' && Number.isFinite(paidUntil)) return {
    label: daysLeft !== null && daysLeft <= 7 ? 'Próximo a vencer' : 'Al día',
    tone: daysLeft !== null && daysLeft <= 7 ? 'warning' : 'success', daysLeft,
    message: 'Tu período abonado está vigente. La renovación queda confirmada cuando se acredita el siguiente pago.',
  };
  if (sub.status === 'authorized') return {
    label: 'Esperando acreditación', tone: 'neutral', daysLeft,
    message: 'Mercado Pago ya recibió la autorización. Usá Verificar pago para consultar si se acreditó la cuota.',
  };
  if (sub.status === 'creating') return {
    label: 'Preparando pago', tone: 'neutral', daysLeft,
    message: 'Estamos confirmando el enlace de tu suscripción. Podés reintentar desde Pagar cuota sin generar otra suscripción.',
  };
  if (sub.status === 'pending' || sub.status === 'checkout_failed') return {
    label: 'Pago pendiente', tone: 'warning', daysLeft,
    message: 'La suscripción está pendiente de un pago acreditado. La autorización de Mercado Pago por sí sola no confirma el cobro.',
  };
  return { label: 'Estado por revisar', tone: 'neutral', daysLeft,
    message: 'No hay información suficiente para confirmar un período abonado vigente. Contactanos para revisar tu suscripción.' };
}

export function paymentOffer(data: MerchantPlan) {
  const action = data.paymentAction;
  if (!data.billingEnabled || !action || !['start', 'resume'].includes(action.kind) ||
      !Number.isSafeInteger(action.amountArs) || action.amountArs <= 0 || data.lastPayment || data.subscription?.paidThrough) return null;
  return { amountArs: action.amountArs, firstPayment: action.kind === 'start' };
}

export function validatedCheckoutUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password &&
        ['mercadopago.com.ar', 'www.mercadopago.com.ar'].includes(url.hostname) &&
        url.pathname === '/subscriptions/checkout') return url.toString();
  } catch { /* Do not navigate to an invalid response URL. */ }
  return null;
}
