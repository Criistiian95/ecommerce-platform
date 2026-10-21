import {DataTypes,Model,Sequelize} from 'sequelize';
export class BillingPayment extends Model {
 declare id:string; declare commerceId:string; declare mpPaymentId:string;
 declare mpInvoiceId:string; declare approvedAt:Date;
 static register(sequelize:Sequelize) {
  BillingPayment.init({
   id:{type:DataTypes.UUID,primaryKey:true,defaultValue:DataTypes.UUIDV4},
   commerceId:{type:DataTypes.UUID,allowNull:false,field:'commerce_id'},
   mpPaymentId:{type:DataTypes.STRING(100),allowNull:false,unique:true,field:'mp_payment_id'},
   mpInvoiceId:{type:DataTypes.STRING(100),allowNull:false,unique:true,field:'mp_invoice_id'},
   approvedAt:{type:DataTypes.DATE,allowNull:false,field:'approved_at'},
  },{sequelize,modelName:'BillingPayment',tableName:'billing_payments',underscored:true});
 }
}
