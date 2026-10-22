import {ImageResponse} from 'next/og';
export const size={width:192,height:192};
export const contentType='image/png';
export default function Icon(){return new ImageResponse(<div style={{display:'flex',alignItems:'center',justifyContent:'center',width:'100%',height:'100%',background:'#142c40',color:'white',fontSize:60,fontWeight:700,letterSpacing:-2}}>API</div>,size);}
