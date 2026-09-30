import type {MetadataRoute} from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {id:'/',name:'HoraCerta',short_name:'HoraCerta',start_url:'/?view=register',scope:'/',display:'standalone',background_color:'#f4f6fa',theme_color:'#142c40',icons:[{src:'/icon',sizes:'192x192',type:'image/png',purpose:'any'}]};
}
