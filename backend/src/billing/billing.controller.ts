import {Controller,Headers,HttpCode,HttpException,Post,Query,Req} from '@nestjs/common';
import type {Request} from 'express';
import {BillingService} from './billing.service';
import {verifyMpWebhook} from './billing-rules';

/** MP notifications are hints only. All payment facts are fetched from MP. */
@Controller('billing')
export class BillingController {
 constructor(private readonly billing:BillingService){}
 @Post('webhook')
 @HttpCode(200)
 async webhook(
  @Req() req:Request,
  @Headers('x-signature') signature:string,
  @Headers('x-request-id') requestId:string,
  @Query('data.id') queryId:string,
  @Query('type') type:string
 ) {
  const id=String(queryId || (req.query as any)?.['data.id'] || (req.body as any)?.data?.id || '');
  const secret=process.env.MP_SUBSCRIPTIONS_WEBHOOK_SECRET||'';
  if(!verifyMpWebhook(secret,signature,requestId,id)) throw new HttpException('Firma de webhook inválida',401);
  // No changes if the event is not a real subscription invoice.
  const eventType=type || String((req.body as any)?.type || (req.body as any)?.topic || '');
  if(eventType==='subscription_preapproval' || eventType==='subscription_preapproval_plan') return {ok:true,ignored:true};
  if(eventType!=='subscription_authorized_payment') return {ok:true,ignored:true};
  try {return {ok:true,...await this.billing.settleAuthorizedPayment(id)};}
  catch {throw new HttpException('Reintentar notificación',503);}
 }
}
