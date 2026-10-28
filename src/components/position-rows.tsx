"use client";
import { ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";

export function PositionRows({id,ticker,identity,cells,details,colSpan}:{id:string;ticker:string;identity:ReactNode;cells:ReactNode;details:ReactNode;colSpan:number}) {
  const [open,setOpen]=useState(false);
  const panel=`position-details-${id}`;
  return <><tr className="data-row"><td className="identity-cell"><div className="flex items-start gap-2"><button type="button" className="row-expander" aria-label={`${ticker}: Details und Verkaufsjournal`} aria-expanded={open} aria-controls={panel} onClick={()=>setOpen(v=>!v)}><ChevronRight size={15} className={open?"rotate-90":""}/></button><div className="min-w-0">{identity}</div></div></td>{cells}</tr>
    {open&&<tr className="detail-row"><td colSpan={colSpan}><div id={panel}>{details}</div></td></tr>}</>;
}
