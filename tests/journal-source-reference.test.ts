import {describe,it,expect} from "vitest";
import {examplePosition,exampleSale} from "../src/lib/preview-data";
import {calculateJournal,realizedForPosition} from "../src/lib/journal";
import {readJournalSource,sourceForPosition,sourceMargin,type JournalSourceReference,type JournalSourceValues} from "../src/lib/journal-source-reference";
const p=examplePosition({id:"p",ticker:"TEST",sold_quantity:10,status:"closed",entry_margin_base:null});
const sale=exampleSale("p",{fx_to_base:null});
const value:JournalSourceValues={version:1,capturedAt:"2026-10-28T12:00:00Z",documentId:null,sheet:"Source",row:6,ticker:"TEST",category:null,direction:"long",currency:"USD",units:10,entryPrice:100,entryDate:p.entry_date,marginRate:0.15,fxToBase:0.9,sale:{units:10,price:120,date:sale.sale_date},reportedPnlBase:180};
const reference=(v=value,positionId:string|null="p"):JournalSourceReference=>({id:"ref",user_id:p.user_id,portfolio_id:p.portfolio_id,position_id:positionId,source_key:"row:6",source_values:v,created_at:value.capturedAt});
describe("explicit captured journal references",()=>{
 it("fills the source result and margin while leaving historical broker fields unknown",()=>{
  const stats=calculateJournal([p],[sale],new Date("2026-10-28T13:00:00Z"),[reference()]);
  expect(stats.realized).toBe(180);expect(stats.marginReturn).toBeCloseTo(180/135);expect(stats.hitRate).toBe(1);expect(stats.referenceCount).toBe(1);
  expect(p.entry_margin_base).toBeNull();expect(sale.fx_to_base).toBeNull();
  const changed=calculateJournal([{...p,current_fx_to_base:0.4,margin_rate:0.8}],[sale],new Date("2026-10-29"),[reference()]);
  expect(changed.realized).toBe(stats.realized);expect(changed.marginReturn).toBe(stats.marginReturn);
 });
 it("uses verified execution FX and frozen entry margin before a sheet reference",()=>{
  const stats=calculateJournal([{...p,entry_margin_base:150}],[{...sale,fx_to_base:0.8}],new Date(),[reference()]);
  expect(stats.realized).toBe(160);expect(stats.marginReturn).toBeCloseTo(160/150);expect(stats.referenceCount).toBe(0);
 });
 it("stops using a source result after execution correction or entry identity change",()=>{
  expect(realizedForPosition(p,[{...sale,price:121}],value).base).toBeNull();
  expect(realizedForPosition(p,[{...sale,sale_date:"2026-10-15"}],value).base).toBeNull();
  expect(sourceForPosition({...p,instrument_currency:"CHF"},[reference()])).toBeNull();
  expect(sourceForPosition({...p,quantity:9},[reference()])).toBeNull();
 });
 it("keeps a known undated source closure out of temporal statistics",()=>{
  const stats=calculateJournal([],[],new Date("2026-10-28"),[reference({...value,sale:{...value.sale!,date:null}},null)]);
  expect(stats.realized).toBe(180);expect(stats.closedCount).toBe(1);expect(stats.trades[0].closeDate).toBeNull();
  expect(stats.averageDays).toBeNull();expect(stats.rollingComplete).toBe(false);expect(stats.undatedSalesCount).toBe(1);
 });
 it("uses the same covered trades in both sides of a partial margin aggregate",()=>{
  const other={...p,id:"other",ticker:"OTHER",entry_margin_base:100};
  const stats=calculateJournal([p,other],[sale,{...sale,id:"s2",position_id:"other",price:110,fx_to_base:1}],new Date(),[]);
  expect(stats.marginReturn).toBe(1);expect(stats.marginCoveredCount).toBe(1);expect(stats.closedCount).toBe(2);
 });
 it("rejects malformed numeric/date records and preserves zero-margin semantics",()=>{
  expect(readJournalSource({...value,fxToBase:"0.9"})).toBeNull();expect(readJournalSource({...value,fxToBase:0})).toBeNull();
  expect(readJournalSource({...value,entryDate:"2026-02-30"})).toBeNull();expect(readJournalSource({...value,units:NaN})).toBeNull();
  expect(sourceMargin({...value,marginRate:0})).toBeNull();
 });
});
