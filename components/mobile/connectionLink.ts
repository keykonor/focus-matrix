export const cloudOrigin='https://focus-matrix-plans-17154.just-bard-2476.chatgpt.site';
const validToken=/^[a-f0-9]{64}$/;
export type ConnectionLink={kind:'pair';token:string}|{kind:'share';token:string}|{kind:'invalid';message:string};

// The bundled Android page can have a different location from its HTTPS base URL.
// Trust the configured service, rather than depending on WebView location.origin.
export function parseConnectionLink(value:string,currentOrigin=cloudOrigin):ConnectionLink{
 const text=value.trim();
 if(!text)return {kind:'invalid',message:'请粘贴电脑生成的完整配对链接或分享链接。'};
 if(validToken.test(text))return {kind:'pair',token:text};
 let hash:string;
 if(text.startsWith('#')||text.startsWith('pair=')||text.startsWith('share='))hash=text.replace(/^#/,'');
 else{
  let url:URL;try{url=new URL(text);}catch{return {kind:'invalid',message:'链接格式不完整，请在电脑里点击“复制配对链接”后重新粘贴。'};}
  const localPreview=/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(currentOrigin)&&url.origin===currentOrigin;
  if(url.origin!==cloudOrigin&&!localPreview)return {kind:'invalid',message:'这不是 Focus Matrix 的链接，请从电脑软件重新复制。'};
  if(url.pathname.startsWith('/downloads/'))return {kind:'invalid',message:'这是安装包下载地址。请在电脑“分享 → 连接安卓手机”中复制配对链接。'};
  hash=url.hash.slice(1);
  if(validToken.test(hash))return {kind:'share',token:hash};
 }
 const params=new URLSearchParams(hash),pair=params.get('pair'),share=params.get('share');
 if(pair&&validToken.test(pair)&&!share)return {kind:'pair',token:pair};
 if(share&&validToken.test(share)&&!pair)return {kind:'share',token:share};
 return {kind:'invalid',message:'链接缺少连接码。请复制完整链接，包括 # 后面的全部内容。'};
}
