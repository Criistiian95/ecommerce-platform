import {Module} from '@nestjs/common';
import {BillingService} from './billing.service';
import {BillingController} from './billing.controller';
import {BillingWorker} from './billing-worker.service';
@Module({controllers:[BillingController],providers:[BillingService,BillingWorker],exports:[BillingService]})
export class BillingModule {}
