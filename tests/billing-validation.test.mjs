import test from 'node:test';
import assert from 'node:assert/strict';
import { validDecimal, validateBillingLines, lineFromAuthorization } from '../lib/admin/billing-validation.mjs';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const source={id:id(1),category:'other',description:'Authorized charge',quantity:'2',unit_price:'100.25',supporting_reason:'Approved schedule reference',service_date:'2026-10-24'};
const line=()=>lineFromAuthorization(source,'draft-key','2026-10-24');
test('billing decimal validation rejects unsupported precision without rounding',()=>{
  for(const quantity of ['1','2','1.5','0.125'])assert.equal(validDecimal(quantity,3,true,'100000'),true);
  for(const quantity of ['0','-1','1.1234','NaN','Infinity','1e-3','', '1.0000'])assert.equal(validDecimal(quantity,3,true,'100000'),false);
  for(const price of ['0','100.25','12.5'])assert.equal(validDecimal(price,2),true);
  for(const price of ['-1','100.251','Infinity','0x10'])assert.equal(validDecimal(price,2),false);
});
test('billing validation points to the affected row and field',()=>{
  assert.deepEqual(validateBillingLines([line()],[],[source]),{});
  for(const [updates,field] of [[{description:''},'description'],[{quantity:'0'},'quantity'],[{quantity:'1.1234'},'quantity'],[{unitPrice:'100.251'},'unitPrice'],[{reason:''},'reason'],[{authorizationId:''},'authorizationId'],[{date:'2026-02-30'},'date']]){
    const errors=validateBillingLines([{...line(),...updates}],[],[source]);assert.ok(errors['draft-key'][field]);
  }
  const product={id:id(2),available:true,stock:10,price:25};
  const supply={key:'supply',category:'medical_supply',description:'Catalog supply',quantity:'2',unitPrice:'25',productId:product.id,date:'2026-10-24'};
  assert.deepEqual(validateBillingLines([supply],[product],[]),{});
  assert.match(validateBillingLines([{...supply,productId:undefined}],[product],[]).supply.productId,/select a valid product/);
  assert.ok(validateBillingLines([{...supply,quantity:'0.125'}],[product],[]).supply.quantity);
  assert.ok(validateBillingLines([{...supply,unitPrice:'24.99'}],[product],[]).supply.unitPrice);
});
test('authorization-derived room, service and professional rows retain stable identities and block duplicates',()=>{
  for(const category of ['hospital_service','consultation','room']){
    const approval={...source,category,service_id:category==='hospital_service'?id(3):null,consultation_record_id:category==='consultation'?id(4):null,doctor_id:category==='consultation'?id(5):null,period_start:category==='room'?'2026-10-23':null,period_end:category==='room'?'2026-10-24':null};
    const row=lineFromAuthorization(approval,'stable-row','2026-10-24');
    assert.equal(row.key,'stable-row');assert.deepEqual(validateBillingLines([row],[],[approval]),{});
    assert.ok(validateBillingLines([row,{...row,key:'second'}],[],[approval]).second.authorizationId);
    if(category==='room')assert.ok(validateBillingLines([{...row,periodEnd:'2026-10-25'}],[],[approval])['stable-row'].period);
  }
});
