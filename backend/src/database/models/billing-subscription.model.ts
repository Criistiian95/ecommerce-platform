import {DataTypes,Model,Sequelize} from 'sequelize';
export class BillingSubscription extends Model {
 declare commerceId:string; declare mpSubscriptionId:string|null; declare status:string;
 declare payerEmail:string; declare checkoutUrl:string|null; declare paidThrough:Date|null;
 declare amountArs:number; declare startedAt:Date|null;
 static register(sequelize:Sequelize) {
  BillingSubscription.init({
   commerceId:{type:DataTypes.UUID,primaryKey:true,field:'commerce_id'},
   mpSubscriptionId:{type:DataTypes.STRING(100),allowNull:true,unique:true,field:'mp_subscription_id'},
   status:{type:DataTypes.STRING(30),allowNull:false,defaultValue:'pending'},
   payerEmail:{type:DataTypes.STRING(190),allowNull:false,field:'payer_email'},
   checkoutUrl:{type:DataTypes.STRING(1200),allowNull:true,field:'checkout_url'},
   amountArs:{type:DataTypes.INTEGER,allowNull:false,field:'amount_ars'},
   paidThrough:{type:DataTypes.DATE,allowNull:true,field:'paid_through'},
   startedAt:{type:DataTypes.DATE,allowNull:true,field:'started_at'},
  },{sequelize,modelName:'BillingSubscription',tableName:'billing_subscriptions',underscored:true});
 }
}
