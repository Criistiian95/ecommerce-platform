const {test,afterEach,mock}=require('node:test');
const assert=require('node:assert/strict');
const {Commerce}=require('../dist/database/models/commerce.model');
const {User}=require('../dist/database/models/user.model');
const {AdminCommerceSettingsService}=require('../dist/catalog/admin-commerce-settings.service');
const {AuthService}=require('../dist/auth/auth.service');
afterEach(()=>mock.restoreAll());
function commerce(){const row={id:'a',name:'Shop',slug:'a',logoData:Buffer.from('image'),logoMimeType:'image/png',pickupEnabled:true,shippingEnabled:false};return {...row,get:()=>({...row}),update:async data=>Object.assign(row,data)}}
test('design update only loads authenticated commerce and never exposes logo bytes',async()=>{
 const c=commerce();mock.method(Commerce,'findByPk',async id=>{assert.equal(id,'a');return c});const result=await new AdminCommerceSettingsService().updateSettings('a',{commerceId:'b',name:'New',primaryColor:'#abcdef'});assert.equal(result.name,'New');assert.equal(result.id,'a');assert.equal(result.logoData,undefined);
});
test('editing colors retains uploaded logo; URL replacement and clear remove it',async()=>{
 const c=commerce();mock.method(Commerce,'findByPk',async()=>c);const svc=new AdminCommerceSettingsService();assert.equal((await svc.updateSettings('a',{primaryColor:'#237059'})).hasUploadedLogo,true);assert.equal((await svc.updateSettings('a',{logoUrl:'https://example.com/logo.png'})).hasUploadedLogo,false);assert.equal((await svc.updateSettings('a',{logoUrl:null,clearUploadedLogo:true})).logoUrl,null);
});
test('design rejects missing tenant, unsafe URL and invalid colors',async()=>{
 mock.method(Commerce,'findByPk',async()=>commerce());const svc=new AdminCommerceSettingsService();await assert.rejects(()=>svc.updateSettings(null,{}));await assert.rejects(()=>svc.updateSettings('a',{logoUrl:'javascript:alert(1)'}));await assert.rejects(()=>svc.updateSettings('a',{primaryColor:'red'}));await assert.rejects(()=>svc.updateSettings('a',{fontFamily:'arbitrary-css'}));
});
const input={commerceName:'New shop',commerceSlug:'new-shop',adminName:'Owner',email:'OWNER@example.com',password:'a-long-password'};
test('merchant registration validates reserved slugs and credentials before database writes',async()=>{
 const svc=new AuthService({});for(const patch of [{commerceSlug:'admin'},{commerceSlug:'a.b'},{email:'bad'},{password:'short'},{commerceName:''}])await assert.rejects(()=>svc.registerCommerce({...input,...patch}));
});
test('registration creates owner and commerce in one transaction and ignores supplied role and tenant',async()=>{
 const transaction={test:true};mock.method(Commerce,'findOne',async()=>null);mock.method(Commerce,'create',async(data,options)=>{assert.equal(options.transaction,transaction);assert.equal(data.slug,'new-shop');return {id:'new-id',...data}});
 mock.method(User,'create',async(data,options)=>{assert.equal(options.transaction,transaction);assert.equal(data.commerceId,'new-id');assert.equal(data.role,'admin');assert.equal(data.email,'owner@example.com');assert.notEqual(data.passwordHash,input.password)});
 const svc=new AuthService({sequelize:{transaction:async cb=>cb(transaction)}});const result=await svc.registerCommerce({...input,role:'superadmin',commerceId:'other'});assert.equal(result.commerce.slug,'new-shop');assert.equal(result.token,undefined);
});
test('registration reports duplicate slug without attaching an owner to another commerce',async()=>{
 mock.method(Commerce,'findOne',async()=>({id:'existing'}));const svc=new AuthService({});await assert.rejects(()=>svc.registerCommerce(input),/ya está en uso/);
});

test('cover validation rejects unsafe types, invalid palettes, missing files and oversized images',async()=>{
 mock.method(Commerce,'findByPk',async()=>commerce());const svc=new AdminCommerceSettingsService();
 for(const input of [{backgroundColor:'red'},{coverPreset:'unknown'},{coverPreset:'custom'},{coverPreset:'custom',coverDataBase64:'PHN2Zz4=',coverMimeType:'image/svg+xml'},{coverPreset:'custom',coverDataBase64:'PHN2Zz4=',coverMimeType:'image/png'},{coverPreset:'custom',coverDataBase64:'A'.repeat(2800001),coverMimeType:'image/png'}]) await assert.rejects(()=>svc.updateSettings('a',input));
});
test('storefront text rejects overlong values, nontext values and unknown layouts',async()=>{
 mock.method(Commerce,'findByPk',async()=>commerce());const svc=new AdminCommerceSettingsService();
 for(const input of [{heroTitle:'a'.repeat(181)},{heroTitle:42},{heroButtonText:'a'.repeat(41)},{announcementText:'a'.repeat(161)},{heroLayout:'unsafe'}]) await assert.rejects(()=>svc.updateSettings('a',input));
});
