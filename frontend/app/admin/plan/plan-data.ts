export type PlanPayment = { id: string; paymentReference: string; approvedAt: string; status: 'approved' };
export type MerchantPlan = {
  commerce: { id: string; name: string; slug: string; active: boolean };
  billingEnabled: boolean;
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
  if (!sub) return {
    label: 'Sin suscripción asociada', tone: 'neutral', daysLeft: null,
    message: 'Esta tienda no tiene un abono automático asociado. Consultanos para revisar su modalidad de acceso. Visitar esta sección no inicia ningún cobro.',
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
  if (sub.status === 'pending') return {
    label: 'Pago pendiente', tone: 'warning', daysLeft,
    message: 'La suscripción está pendiente de un pago acreditado. La autorización de Mercado Pago por sí sola no confirma el cobro.',
  };
  return { label: 'Estado por revisar', tone: 'neutral', daysLeft,
    message: 'No hay información suficiente para confirmar un período abonado vigente. Contactanos para revisar tu suscripción.' };
}
