"use client";

import { Info, MoreHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Portaled so table scrolling never clips help or row actions. */
export function InfoTip({ label, children, menu = false }: { label: string; children: ReactNode; menu?: boolean }) {
  const id=useId(), button=useRef<HTMLButtonElement>(null), panel=useRef<HTMLDivElement>(null);
  const [position,setPosition]=useState<{top:number;left:number}|null>(null);
  const closeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const pinned=useRef(false);
  const close=()=>{pinned.current=false;if(closeTimer.current)clearTimeout(closeTimer.current);setPosition(null);};
  const show=()=>{
    if(closeTimer.current)clearTimeout(closeTimer.current);
    const r=button.current?.getBoundingClientRect();if(!r)return;
    const width=Math.min(menu?208:300,window.innerWidth-32);
    setPosition({left:Math.max(16,Math.min(r.right-width,window.innerWidth-width-16)),top:Math.max(16,Math.min(r.bottom+8,window.innerHeight-200))});
  };
  useEffect(()=>{
    if(!position)return;
    const outside=(e:PointerEvent)=>{if(!button.current?.contains(e.target as Node)&&!panel.current?.contains(e.target as Node)){pinned.current=false;setPosition(null);}};
    const escape=(e:KeyboardEvent)=>{if(e.key==="Escape"){pinned.current=false;setPosition(null);button.current?.focus();}};
    const dismiss=()=>{pinned.current=false;setPosition(null);};
    document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);
    window.addEventListener("resize",dismiss);window.addEventListener("scroll",dismiss,true);
    return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);window.removeEventListener("resize",dismiss);window.removeEventListener("scroll",dismiss,true);};
  },[position]);
  useEffect(()=>()=>{if(closeTimer.current)clearTimeout(closeTimer.current);},[]);
  useEffect(()=>{if(menu&&position)panel.current?.querySelector<HTMLElement>("a,button")?.focus();},[menu,position]);
  return <><button ref={button} type="button" className={menu?"row-menu-trigger":"info-trigger"} aria-label={menu?label:`Information: ${label}`}
    aria-expanded={!!position} aria-haspopup={menu?"dialog":undefined} aria-controls={position?id:undefined} aria-describedby={!menu&&position?id:undefined}
    onClick={()=>{if(menu){if(position)close();else show();}else if(pinned.current){close();}else{pinned.current=true;show();}}} onMouseEnter={()=>!menu&&show()} onMouseLeave={()=>{if(!menu&&!pinned.current)closeTimer.current=setTimeout(close,160);}}
    onFocus={()=>!menu&&show()} onBlur={e=>{if(!menu&&!panel.current?.contains(e.relatedTarget))close();}}>
    {menu?<MoreHorizontal size={18}/>:<Info size={14}/>}</button>
    {position&&createPortal(<div ref={panel} id={id} role={menu?"dialog":"tooltip"} aria-label={menu?label:undefined}
      className={menu?"app-popover action-popover":"app-popover info-popover"} style={{left:position.left,top:position.top,maxHeight:`calc(100dvh - ${position.top+16}px)`}}
      onMouseEnter={()=>{if(closeTimer.current)clearTimeout(closeTimer.current);}} onMouseLeave={()=>!menu&&!pinned.current&&close()} onBlur={e=>{if(menu&&!panel.current?.contains(e.relatedTarget)&&!button.current?.contains(e.relatedTarget))close();}} onClick={e=>{if(menu&&(e.target as HTMLElement).closest("a,button"))setTimeout(close,0);}}>{children}</div>,document.body)}
  </>;
}
