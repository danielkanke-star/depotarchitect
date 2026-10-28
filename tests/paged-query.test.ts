import { expect, it } from "vitest";
import { allRows } from "../src/lib/paged-query";
it("loads all 2001 rows in stable pages instead of silently showing only 1000",async()=>{
  const source=Array.from({length:2001},(_,i)=>i);
  const calls:number[]=[];
  const result=await allRows(async(from,to)=>{calls.push(from);return {data:source.slice(from,to+1),error:null};});
  expect(result.data).toEqual(source);expect(calls).toEqual([0,1000,2000]);
});
