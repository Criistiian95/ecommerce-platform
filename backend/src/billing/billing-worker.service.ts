import {Injectable,OnModuleDestroy,OnModuleInit} from '@nestjs/common';
import {BillingService} from './billing.service';
@Injectable()
export class BillingWorker implements OnModuleInit,OnModuleDestroy {
 private handle:ReturnType<typeof setInterval>|null=null;
 constructor(private readonly billing:BillingService){}
 onModuleInit() {
  // Reconciliation runs on all instances but row locking and unique payment IDs ensure idempotency.
  if(process.env.BILLING_RECONCILIATION_ENABLED!=='true') return;
  this.handle=setInterval(()=>{void this.billing.reconcileOverdue().catch(e=>console.error('Billing reconciliation',e));},6*60*60*1000);
  this.handle.unref();
 }
 onModuleDestroy(){if(this.handle) clearInterval(this.handle);}
}
