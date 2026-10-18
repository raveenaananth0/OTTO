import styles from "./OttoLogo.module.css";
type Props={className?:string;compact?:boolean;inverse?:boolean;size?:number};
export function OttoLogo({className,compact=false,inverse=false,size=39}:Props){return <span className={[styles.logo,inverse?styles.inverse:"",className].filter(Boolean).join(" ")} aria-label="OTTO"><svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true"><circle cx="23" cy="28" r="16" stroke="currentColor" strokeWidth="4"/><circle cx="41" cy="28" r="16" stroke="currentColor" strokeWidth="4"/><path d="M7 51h50" stroke="#d03027" strokeWidth="3"/></svg>{!compact&&<strong>OTTO<span>YOUR MONEY. LOOKING AHEAD.</span></strong>}</span>;}

