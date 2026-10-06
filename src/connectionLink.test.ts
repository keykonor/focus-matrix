import {describe,it,expect} from 'vitest';
import {cloudOrigin,parseConnectionLink} from '../cloud-site/components/mobile/connectionLink';
const token='a'.repeat(64);
describe('mobile connection links',()=>{
 it('accepts desktop pairing URLs even when WebView reports a null origin',()=>{
  expect(parseConnectionLink(` ${cloudOrigin}/mobile/index.html#pair=${token} `,'null')).toEqual({kind:'pair',token});
  for(const input of [token,`#pair=${token}`,`pair=${token}`])expect(parseConnectionLink(input)).toEqual({kind:'pair',token});
 });
 it('keeps share links separate from device pairing',()=>{
  for(const input of [`${cloudOrigin}/#${token}`,`${cloudOrigin}/mobile/index.html#share=${token}`,`#share=${token}`])expect(parseConnectionLink(input)).toEqual({kind:'share',token});
 });
 it('explains downloaded, incomplete, malformed and untrusted links',()=>{
  expect(parseConnectionLink(`${cloudOrigin}/downloads/FocusMatrix-Android.apk`)).toMatchObject({kind:'invalid',message:expect.stringContaining('安装包')});
  expect(parseConnectionLink(`${cloudOrigin}/mobile/index.html`)).toMatchObject({kind:'invalid',message:expect.stringContaining('#')});
  for(const input of [`https://untrusted.example/#pair=${token}`,`${cloudOrigin}/#pair=short`,`${cloudOrigin}/#pair=${token}&share=${token}`])expect(parseConnectionLink(input).kind).toBe('invalid');
 });
});
