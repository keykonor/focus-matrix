import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Focus Matrix · 计划分享',description:'查看分享的四象限计划和每日备忘录',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>) {return <html lang="zh-CN"><body>{children}</body></html>;}
