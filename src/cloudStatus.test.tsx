import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {CloudShareModal} from './components/CloudShareModal';
import type {CloudStatus} from './hooks/useCloudSharing';

const base:CloudStatus={configured:false,enabled:false,editingEnabled:true,shareUrl:null,lastSyncedAt:null,error:null};
const noop=async()=>{};
const render=(status:Partial<CloudStatus>)=>renderToStaticMarkup(<CloudShareModal initialSection="phone" status={{...base,...status}} busy={false} onClose={()=>{}} onSync={noop} onToggle={noop} onEditing={noop} onRotate={noop}/>);
describe('cloud configuration messages',()=>{
 it('shows loading until the saved configuration has been read',()=>{
  expect(render({configurationState:'loading'})).toContain('正在读取已保存的云端配置');
 });
 it('shows the read error and a retry action rather than claiming missing credentials',()=>{
  const html=render({configurationState:'error',error:'Windows 无法读取或加密分享凭据'});
  expect(html).toContain('Windows 无法读取或加密分享凭据');expect(html).toContain('重试读取配置');expect(html).not.toContain('本机尚未保存');
 });
 it('distinguishes missing credentials from a browser preview',()=>{
  expect(render({configurationState:'ready'})).toContain('本机尚未保存云端写入凭据');
  expect(render({configurationState:'preview'})).toContain('当前为浏览器预览');
 });
 it('keeps cached devices visible when the cloud is unavailable',()=>{
  const html=render({configured:true,configurationState:'ready',connectionState:'error',error:'连接云端超时',phoneConnection:{pairing:{pairingUrl:'https://example.invalid/#pair=expired',expiresAt:1},devices:[{id:'phone',label:'原手机',revoked:0}],checkedAt:123}});
  expect(html).toContain('原手机');expect(html).toContain('连接云端超时');expect(html).toContain('已绑定手机不受影响');
 });
 it('does not claim a connection just because local credentials were loaded',()=>{
  expect(render({configured:true,connectionState:'checking',lastSyncedAt:123})).toContain('配置已加载，等待连接云端');
  expect(render({configured:true,connectionState:'connected',lastSyncedAt:123})).toContain('云端连接正常');
 });
});
